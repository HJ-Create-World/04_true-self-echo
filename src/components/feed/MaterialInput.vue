<script setup lang="ts">
/**
 * 素材输入 —— 粘贴 / 读本地文本文件 / JSONL 语料文件 + 投料量档位。
 *
 * ⚠️ 文件用 FileReader 在**浏览器里**读，不经过薄后端、不上传。
 * 投料素材可能含他人隐私，这一步的网络请求数必须是 0。
 *
 * 2026-09-22 扩展：
 * - JSONL 语料入口（.jsonl/.json）→ 走 CorpusPanel 预处理工作台
 * - 素材自检清单：字数档 + 情绪极端段 + 第二层 + 多角色提示
 *   （Phase 0/2 的实测结论驱动 —— 没有极端段的素材只能提到表层风格）
 */
import { computed, ref } from 'vue'

import { detectEmotionalPeaks, detectMultiSpeaker } from '@/feed/analyze'
import { CORPUS_EXT, TEXT_EXT, useFeedStore } from '@/feed/store'

const feed = useFeedStore()
const fileInput = ref<HTMLInputElement | null>(null)

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    const lower = file.name.toLowerCase()
    if (CORPUS_EXT.some((e) => lower.endsWith(e))) {
      feed.loadCorpusFile(await file.text())
    } else {
      await feed.loadFile(file)
    }
  }
  // 清空 input，否则同一个文件选第二次不触发 change
  input.value = ''
}

const TONE_CLASS: Record<'bad' | 'ok' | 'good', string> = {
  bad: 'text-[#c38d94]',
  ok: 'text-[#d4a373]',
  good: 'text-[#85cdca]',
}

/**
 * 素材类型。real 一旦确认且素材非空就不能切回 virtual ——
 * 防止真人素材被存成可导出的 virtual 档案（SPEC §十 第 12 条的绕行路径）。
 * 想反悔：点「清空」重来。
 */
const KINDS = [
  { key: 'virtual', label: '虚拟角色', hint: '动漫 / 游戏 / 小说 / 原创' },
  { key: 'real', label: '真人素材', hint: '朋友 / 亲人 —— 需走同意流程' },
] as const

/* ---------- 素材自检清单（提示性质，逐项来自实测结论） ---------- */
const peaks = computed(() => detectEmotionalPeaks(feed.raw))
const multiSpeaker = computed(() => (feed.rawChars > 0 ? detectMultiSpeaker(feed.raw) : null))
const checklist = computed(() => [
  {
    ok: feed.cleanChars >= 400,
    text: `素材量 ${feed.cleanChars} 字 —— ${feed.tierInfo.label}`,
  },
  {
    ok: peaks.value.hits >= 2,
    text:
      peaks.value.hits >= 2
        ? `检测到 ${peaks.value.hits} 行情绪极端信号 —— 能提取到内在反差`
        : '没检测到情绪极端段（冲突 / 告别 / 拒绝）—— 只能提到表层语言风格',
  },
  {
    ok: feed.layer.hasSecondLayer,
    text: feed.layer.hasSecondLayer
      ? '检测到第二层（语言之外的描写）'
      : '只有对白 —— 「嘴上说 X 身体做 Y」的信息拿不到',
  },
])
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-6">
    <header class="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="m-0 text-base tracking-wide">素材</h2>
      <div class="flex items-center gap-3 text-xs tracking-wide">
        <span :class="TONE_CLASS[feed.tierInfo.tone]">
          {{ feed.cleanChars }} 字 · {{ feed.tierInfo.label }}
        </span>
        <button
          type="button"
          class="rounded-full bg-white/60 px-3 py-1 text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
          @click="fileInput?.click()"
        >
          读取文件
        </button>
        <button
          v-if="feed.rawChars > 0 || feed.corpusMode"
          type="button"
          class="rounded-full bg-white/60 px-3 py-1 text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
          @click="feed.reset()"
        >
          清空
        </button>
      </div>
    </header>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="[...TEXT_EXT, ...CORPUS_EXT].join(',')"
      @change="onPick"
    />

    <!-- 语料模式状态条 -->
    <div
      v-if="feed.corpusMode"
      class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#4a6fa5]/8 px-4 py-2.5"
    >
      <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/65">
        📦 已载入 JSONL 语料（{{ feed.corpusText.split('\n').filter((l) => l.trim()).length }} 行）——
        在下方工作台选角色、拼素材
      </p>
      <button
        type="button"
        class="rounded-full bg-white/70 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/60 hover:bg-white"
        @click="feed.resetCorpus()"
      >
        放弃语料
      </button>
    </div>

    <!-- 来自语料的素材状态条 -->
    <div
      v-if="!feed.corpusMode && feed.protagonist && feed.rawChars > 0"
      class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#85cdca]/10 px-4 py-2.5"
    >
      <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/65">
        🎯 当前素材来自语料拼装 · 目标角色
        <span class="text-[#3a3a3a]">{{ feed.protagonist }}</span> —— 提取时将只提取 TA 的人格
      </p>
      <button
        type="button"
        class="rounded-full bg-white/70 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/60 hover:bg-white"
        @click="feed.corpusMode = true"
      >
        重新调整
      </button>
    </div>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button
        v-for="k in KINDS"
        :key="k.key"
        type="button"
        class="rounded-full px-4 py-1.5 text-xs tracking-wide transition-all duration-500 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
        :class="
          feed.kind === k.key
            ? 'bg-[#e8a87c]/16 text-[#3a3a3a]'
            : 'bg-white/50 text-[#3a3a3a]/55 hover:bg-white/80'
        "
        :disabled="feed.kind === 'real' && k.key === 'virtual' && feed.raw.trim().length > 0"
        :title="feed.kind === 'real' && k.key === 'virtual' ? '真人素材已锁定 —— 清空素材后可重新选择类型' : ''"
        @click="feed.kind = k.key"
      >
        {{ k.label }}
        <span class="ml-1 text-[#3a3a3a]/40">{{ k.hint }}</span>
      </button>
    </div>

    <textarea
      v-if="!feed.corpusMode"
      :value="feed.raw"
      rows="12"
      placeholder="把素材粘贴到这里 —— 整段复制，不用整理。&#10;（也可以点右上「读取文件」，支持 .txt / .md / .jsonl 语料）"
      class="w-full resize-y rounded-2xl bg-white/60 px-5 py-4 font-serif text-sm leading-relaxed tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 transition-all duration-500 ease-in-out focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
      @input="feed.raw = ($event.target as HTMLTextAreaElement).value"
    />

    <p
      v-if="feed.fileError"
      class="mt-3 mb-0 rounded-xl bg-[#c38d94]/12 px-4 py-2 text-xs leading-relaxed tracking-wide text-[#c38d94]"
    >
      {{ feed.fileError }}
    </p>

    <!-- 素材自检清单（有素材时显示） -->
    <details v-if="feed.rawChars > 0" class="mt-4" open>
      <summary class="cursor-pointer text-xs tracking-wide text-[#3a3a3a]/55 transition-all duration-500 ease-in-out hover:text-[#3a3a3a]">
        素材自检（{{ checklist.filter((c) => c.ok).length }}/{{ checklist.length }} 项达标）
      </summary>
      <ul class="mt-2 mb-0 list-none space-y-1 p-0">
        <li
          v-for="c in checklist"
          :key="c.text"
          class="rounded-xl bg-white/50 px-3 py-1.5 text-xs leading-relaxed tracking-wide"
          :class="c.ok ? 'text-[#3a3a3a]/65' : 'text-[#d4a373]'"
        >
          {{ c.ok ? '✅' : '⚠️' }} {{ c.text }}
        </li>
        <li
          v-if="multiSpeaker?.multi && !feed.protagonist"
          class="rounded-xl bg-[#d4a373]/12 px-3 py-1.5 text-xs leading-relaxed tracking-wide text-[#d4a373]"
        >
          ⚠️ 检测到多个说话人（{{ multiSpeaker.speakers.join(' / ') }}……）——
          在下方「提取」面板填<b>主角名</b>，否则可能提取出缝合人格
        </li>
        <li
          v-else-if="feed.protagonist"
          class="rounded-xl bg-white/50 px-3 py-1.5 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/65"
        >
          ✅ 目标角色：{{ feed.protagonist }} —— 其他角色台词只作上下文
        </li>
      </ul>
    </details>
  </section>
</template>
