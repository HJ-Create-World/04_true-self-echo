<script setup lang="ts">
/**
 * 档案页 —— Phase 3 的「演化面板」入口（P3-3）
 *
 * 本切片交付：**记忆面板**（它现在记得我什么）+ **演化时间线**（快照 + 回滚）。
 * 变化曲线 / 人格画像 / 内心独白是 P3-4，会加在这一页里。
 *
 * ## ⭐ 画像画什么（HJ 已确认：画两张图）
 *
 * SPEC §九 说「人格画像：性格特质雷达图」，但**冻结层不可修改** ——
 * 一张不随时间变的图讲不了「演化」。HJ 拍板：**不变的和变化的分两张图**。
 *   · 不变的：冻结层指纹（她是谁，静态）
 *   · 变化的：从实际对话统计出的表达指标（句长 / 语气词密度…，随时间动）
 * 落地在 P3-4。
 */
import { computed, onMounted } from 'vue'

import { MEMORY_KIND_LABEL, type MemoryKind } from '@/persona/evolving'
import { useChatStore } from '@/stores/chat'
import { useEvolutionStore } from '@/stores/evolution'

const chat = useChatStore()
const evo = useEvolutionStore()

onMounted(async () => {
  // 确保对话 store 已初始化（persona 可能还没从库里读出来）
  if (!chat.persona.id) await chat.init()
  await evo.load(chat.persona.id)
})

const groups = computed(() => {
  const mem = evo.persona?.evolving.memories ?? []
  const byKind = new Map<MemoryKind, typeof mem>()
  for (const m of mem) {
    const list = byKind.get(m.kind) ?? []
    list.push(m)
    byKind.set(m.kind, list)
  }
  // 事件与约定排最前 —— 面板上最该先看到的
  const order: MemoryKind[] = ['promise', 'event', 'fact', 'preference', 'relation']
  return order.filter((k) => byKind.has(k)).map((k) => ({ kind: k, items: byKind.get(k)! }))
})

const fmt = (iso: string) => iso.slice(5, 16).replace('T', ' ')

async function onRollback(id: number) {
  if (!confirm('回滚到这个时间点？当前的记忆状态会被覆盖（会留一条回滚记录）。')) return
  await evo.rollback(id)
  // 让对话 store 的内存副本同步，否则下一轮还会用回滚前的记忆
  if (evo.persona) {
    chat.persona = { ...chat.persona, evolving: evo.persona.evolving }
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-baseline justify-between gap-4 pb-4">
      <p class="m-0 text-sm tracking-wide text-[#3a3a3a]/55">
        档案 · 「{{ chat.persona.name }}」记得什么、变过什么
      </p>
      <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">
        {{ evo.persona?.evolving.memories.length ?? 0 }} 条记忆 ·
        {{ evo.snapshots.length }} 个快照
      </p>
    </div>

    <main class="flex-1 space-y-4 overflow-y-auto pb-4">
      <!-- 空状态 -->
      <div
        v-if="!evo.loading && (evo.persona?.evolving.memories.length ?? 0) === 0"
        class="rounded-2xl bg-white/55 p-8 text-center"
      >
        <p class="m-0 text-sm tracking-wide text-[#3a3a3a]/55">
          还没有记住任何东西。
        </p>
        <p class="mb-0 mt-2 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
          回到「对话」里聊几句，说过的事情会自动沉淀成记忆卡片。<br />
          冻结层（她是什么样的人）在投料时就定了，
          <span class="text-[#d4a373]">不会因为聊天而改变</span>。
        </p>
      </div>

      <!-- 记忆面板 -->
      <section
        v-for="g in groups"
        :key="g.kind"
        class="rounded-2xl bg-white/60 p-5"
      >
        <h2 class="m-0 mb-3 text-base tracking-wide">
          {{ MEMORY_KIND_LABEL[g.kind] }}
          <span class="text-xs text-[#3a3a3a]/45">（{{ g.items.length }} 条）</span>
        </h2>
        <ul class="m-0 list-none space-y-2 p-0">
          <li
            v-for="m in g.items"
            :key="m.id"
            class="rounded-xl border border-[#4a6fa5]/15 bg-white/40 px-4 py-2.5"
          >
            <p class="m-0 text-sm leading-relaxed tracking-wide text-[#3a3a3a]">{{ m.content }}</p>
            <p class="mb-0 mt-1 text-xs tracking-wide text-[#3a3a3a]/40">
              {{ fmt(m.createdAt) }} · 重要度 {{ m.importance }} ·
              被用上 {{ m.hitCount }} 次 ·
              <span v-if="m.triggers.length">触发词 {{ m.triggers.join(' / ') }}</span>
              <span v-else class="text-[#d4a373]">没有触发词（只能走常驻区）</span>
            </p>
          </li>
        </ul>
      </section>

      <!-- 演化时间线 -->
      <section class="rounded-2xl bg-white/60 p-5">
        <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 class="m-0 text-base tracking-wide">演化时间线</h2>
          <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">
            每个点都是一次「她知道了更多」；可以退回任意一点
          </p>
        </header>

        <!-- 冻结层漂移警示：正常应为单一指纹 -->
        <p
          v-if="evo.frozenDrifted"
          class="mb-3 mt-0 rounded-xl bg-[#c38d94]/12 px-4 py-2 text-xs leading-relaxed tracking-wide text-[#c38d94]"
        >
          ⚠️ 冻结层在历史里出现过
          {{ evo.frozenFingerprints.length }} 个不同状态 ——
          那是有人在编辑器里改了档案（AI 不会改它）。
          回滚只还原**记忆**，不会还原你的人设修改。
        </p>

        <p v-if="evo.snapshots.length === 0" class="m-0 text-xs tracking-wide text-[#d4a373]">
          还没有快照 —— 聊出第一条新记忆后，这里会出现第一个点。
        </p>

        <ul class="m-0 list-none space-y-2 p-0">
          <li
            v-for="(s, i) in evo.snapshots"
            :key="s.id"
            class="flex items-center justify-between gap-3 rounded-xl border border-[#4a6fa5]/15 bg-white/40 px-4 py-2.5"
          >
            <div class="min-w-0">
              <p class="m-0 text-sm tracking-wide text-[#3a3a3a]">
                {{ s.triggerSummary }}
                <span class="text-xs text-[#3a3a3a]/40">
                  · {{ s.evolving.memories.length }} 条记忆
                </span>
              </p>
              <p class="mb-0 mt-0.5 text-xs tracking-wide text-[#3a3a3a]/40">
                {{ fmt(s.at) }}
                <span v-if="i === evo.snapshots.length - 1" class="text-[#85cdca]">· 当前</span>
              </p>
            </div>
            <button
              type="button"
              :disabled="i === evo.snapshots.length - 1"
              class="shrink-0 rounded-full bg-white/60 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#c38d94]/12 hover:text-[#c38d94] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
              @click="onRollback(s.id as number)"
            >
              回滚到这
            </button>
          </li>
        </ul>

        <p
          v-if="evo.notice"
          class="mb-0 mt-3 rounded-xl bg-[#85cdca]/12 px-4 py-2 text-xs tracking-wide text-[#85cdca]"
        >
          {{ evo.notice }}
        </p>
      </section>
    </main>
  </div>
</template>
