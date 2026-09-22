<script setup lang="ts">
/**
 * JSONL 语料预处理工作台（A2 · 2026-09-22）
 *
 * 流程：选角色（搜索 + 句数排序）→ 勾章节（每章显示主角句数）→
 * 实时预览拼装结果 → 「用作素材」写进主流程。
 * 预处理全部是本地纯规则（corpus.ts），零 LLM 调用。
 *
 * 🔴 主角句数为 0 的章节不显示 —— 上下文窗口只围绕主角句展开，
 * 没有她戏份的章节拼出来是空的。
 */
import { computed, ref } from 'vue'

import { countByChapter } from '@/feed/corpus'
import { useFeedStore } from '@/feed/store'
import { saveMaterial } from '@/storage/materialRepo'

const feed = useFeedStore()
const roleQuery = ref('')
const ROLE_PAGE = 50

/* ---------- 保存到素材库（A3） ---------- */
const saveName = ref('')
const savedNotice = ref<string | null>(null)
async function saveToLibrary() {
  const a = feed.corpusAssembled
  if (!a?.text) return
  const name =
    saveName.value.trim() || `${feed.corpusRole} · ${a.usedChapterIds.length} 章`
  await saveMaterial({
    name,
    protagonist: feed.corpusRole.trim(),
    source: `JSONL 语料 · ${a.usedChapterIds.length} 章 · ${a.utterances} 句`,
    content: a.text,
  })
  savedNotice.value = `已保存「${name}」到素材库（投料页下方可复用）`
  saveName.value = ''
  // 🔴 通知 MaterialLibrary 刷新 —— 两个组件互不持有引用，
  // 第一版漏了这步，保存后列表不出现（E2E C6 抓的）
  window.dispatchEvent(new CustomEvent('material-changed'))
}

const stats = computed(() => feed.corpusStats)

/** Top-N + 搜索：1,411 种 OCR 变体聚合后的长尾不塞下拉 */
const roleOptions = computed(() => {
  if (!stats.value) return []
  const q = roleQuery.value.trim()
  const list = q ? stats.value.roles.filter((r) => r.name.includes(q)) : stats.value.roles
  return list.slice(0, ROLE_PAGE)
})

/** 每章主角句数 —— 0 句的章节隐藏（拼不出任何东西） */
const chapterRows = computed(() => {
  if (!stats.value || !feed.corpusRole.trim()) return []
  const per = countByChapter(stats.value.utterances, feed.corpusRole)
  return stats.value.chapters
    .map((c) => ({ ...c, protagonistCount: per.get(c.id) ?? 0 }))
    .filter((c) => c.protagonistCount > 0)
})

/** 不勾任何章节 = 全部；勾选后按所选 */
function toggleChapter(id: number) {
  const cur = feed.corpusChapterIds
  const all = !cur.length
  if (all) {
    // 从「全部」进入勾选模式：先全选再反选这一章
    feed.corpusChapterIds = stats.value!.chapters.filter((c) => c.id !== id).map((c) => c.id)
  } else if (cur.includes(id)) {
    feed.corpusChapterIds = cur.filter((x) => x !== id)
  } else {
    feed.corpusChapterIds = [...cur, id]
  }
}

function pickRole(name: string) {
  feed.corpusRole = name
  feed.corpusChapterIds = [] // 换角色后章节句数全变，勾选作废
}

const assembled = computed(() => feed.corpusAssembled)

function apply() {
  if (!feed.applyCorpusToFeed()) return
}
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-6">
    <header class="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="m-0 text-base tracking-wide">语料预处理</h2>
      <p v-if="stats" class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">
        共 {{ stats.totalLines }} 句 · {{ stats.chapters.length }} 章 · 坏行
        {{ stats.badLines }} · 已聚合 {{ stats.roles.length }} 个角色
      </p>
    </header>

    <!-- 角色选择 -->
    <div class="mb-4">
      <p class="m-0 mb-2 text-sm tracking-wide text-[#3a3a3a]/70">第一步 · 要提取谁？</p>
      <input
        v-model="roleQuery"
        placeholder="搜索角色名（语料里 OCR 变体会自动归并）"
        class="mb-2 w-full rounded-xl bg-white/70 px-4 py-2 text-sm tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
      />
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="r in roleOptions"
          :key="r.name"
          type="button"
          class="rounded-full px-3 py-1 text-xs tracking-wide transition-all duration-500 ease-in-out active:scale-[0.98]"
          :class="feed.corpusRole === r.name ? 'bg-[#e8a87c]/16 text-[#3a3a3a]' : 'bg-white/55 text-[#3a3a3a]/60 hover:bg-white/85'"
          @click="pickRole(r.name)"
        >
          {{ r.name }}
          <span class="text-[#3a3a3a]/35">{{ r.count }}</span>
        </button>
      </div>
    </div>

    <!-- 章节选择 -->
    <div v-if="feed.corpusRole" class="mb-4">
      <p class="m-0 mb-2 text-sm tracking-wide text-[#3a3a3a]/70">
        第二步 · 用哪些章节？
        <span class="text-xs text-[#3a3a3a]/40">（不勾 = 全部章节，超 2 万字会按章节边界截断）</span>
      </p>
      <div class="max-h-44 space-y-1 overflow-y-auto rounded-xl bg-white/40 p-2">
        <label
          v-for="c in chapterRows"
          :key="c.id"
          class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs tracking-wide text-[#3a3a3a]/70 hover:bg-white/70"
        >
          <input
            type="checkbox"
            class="accent-[#4a6fa5]"
            :checked="!feed.corpusChapterIds.length || feed.corpusChapterIds.includes(c.id)"
            @change="toggleChapter(c.id)"
          />
          <span class="min-w-0 flex-1 truncate">{{ c.name }}</span>
          <span class="shrink-0 text-[#3a3a3a]/40">她的句数 {{ c.protagonistCount }} / {{ c.count }}</span>
        </label>
      </div>
    </div>

    <!-- 开关 + 预览 -->
    <div v-if="feed.corpusRole">
      <p class="m-0 mb-2 text-sm tracking-wide text-[#3a3a3a]/70">第三步 · 预览</p>
      <div class="mb-2 flex flex-wrap gap-4 text-xs tracking-wide text-[#3a3a3a]/60">
        <label class="flex cursor-pointer items-center gap-1.5">
          <input v-model="feed.corpusIncludeNarration" type="checkbox" class="accent-[#4a6fa5]" />
          包含旁白
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input v-model="feed.corpusIncludeUnknown" type="checkbox" class="accent-[#4a6fa5]" />
          包含未标注发言
        </label>
      </div>

      <p v-if="assembled" class="m-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/60">
        拼装结果
        <span class="text-[#3a3a3a]">{{ assembled.chars }}</span> 字 ·
        {{ assembled.utterances }} 句 ·
        {{ assembled.usedChapterIds.length }} 章
        <span v-if="assembled.truncated" class="text-[#d4a373]">
          · 已按章节边界截断（再选少几章可以精确控制）
        </span>
      </p>
      <p v-else class="m-0 text-xs tracking-wide text-[#d4a373]">
        选了章节但拼不出内容 —— 检查这些章节里她有没有台词。
      </p>

      <div class="mt-3 flex flex-wrap items-center justify-end gap-2">
        <input
          v-model="saveName"
          placeholder="素材名称（留空自动生成）"
          class="w-52 rounded-xl bg-white/70 px-3 py-2 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
        />
        <button
          type="button"
          :disabled="!assembled?.text"
          class="rounded-2xl bg-white/70 px-4 py-2.5 text-xs tracking-wide text-[#3a3a3a]/70 transition-all duration-500 ease-in-out hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          @click="saveToLibrary"
        >
          保存为素材
        </button>
        <button
          type="button"
          :disabled="!assembled?.text"
          class="rounded-2xl bg-[#4a6fa5] px-6 py-2.5 text-sm text-white transition-all duration-500 ease-in-out hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          @click="apply"
        >
          用作素材，继续投料
        </button>
      </div>
      <p
        v-if="savedNotice"
        class="mb-0 mt-2 text-right text-xs tracking-wide text-[#85cdca]"
      >
        {{ savedNotice }}
      </p>
    </div>
  </section>
</template>
