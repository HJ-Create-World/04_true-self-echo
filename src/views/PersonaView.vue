<script setup lang="ts">
/**
 * 档案页 —— Phase 3 的「演化面板」（P3-3 时间线 + P3-4 两张图 + 内心独白）
 *
 * ## ⭐ 画像画什么（HJ 已确认：画两张图）
 *
 * SPEC §九 说「人格画像：性格特质雷达图」，但**冻结层不可修改** ——
 * 一张不随时间变的图讲不了「演化」。HJ 拍板：**不变的和变化的分两张图**。
 *   · 不变的：人设结构（冻结层各部分有多少条依据）→ `StructureChart`
 *   · 变化的：记忆条数 / 亲密度随快照的走势 → `EvolutionCurve`
 */
import { computed, onMounted, ref } from 'vue'

import EvolutionCurve from '@/components/persona/EvolutionCurve.vue'
import DataRightsPanel from '@/components/persona/DataRightsPanel.vue'
import MemoryTimeline from '@/components/persona/MemoryTimeline.vue'
import PersonaManager from '@/components/persona/PersonaManager.vue'
import StructureChart from '@/components/persona/StructureChart.vue'
import type { CurvePoint } from '@/components/persona/EvolutionCurve.vue'
import { generateMonologue } from '@/persona/monologue'
import { useChatStore } from '@/stores/chat'
import { useEvolutionStore } from '@/stores/evolution'

const chat = useChatStore()
const evo = useEvolutionStore()

onMounted(async () => {
  if (!chat.persona.id) await chat.init()
  await evo.load(chat.persona.id)
})

const curvePoints = computed<CurvePoint[]>(() =>
  evo.series.map((s) => ({
    at: s.at,
    label: s.summary,
    memoryCount: s.metrics.memoryCount,
    userFactCount: s.metrics.userFactCount,
    intimacy: s.metrics.intimacy,
  })),
)

/* ---------------- 内心独白 ---------------- */

const monologue = ref('')
const monoLoading = ref(false)
const monoError = ref<string | null>(null)
const monoMeta = ref('')

/**
 * 独白要用**与对话一致的上下文**生成 —— 否则面板上的她与对话里的她
 * 是两个人。所以取最近几轮真实对话当 history。
 */
async function onMonologue() {
  monoError.value = null
  monoLoading.value = true
  monologue.value = ''
  try {
    const history = chat.messages.slice(-4).map((m) => ({ role: m.role, content: m.content }))
    const res = await generateMonologue(chat.parts, history, chat.currentProvider)
    monologue.value = res.text
    monoMeta.value = `${res.model} · ${(res.elapsedMs / 1000).toFixed(1)}s`
  } catch (e) {
    monoError.value = e instanceof Error ? e.message : String(e)
  } finally {
    monoLoading.value = false
  }
}

async function onRollback(id: number) {
  if (!confirm('回滚到这个时间点？当前的记忆状态会被覆盖（会留一条回滚记录）。')) return
  await evo.rollback(id)
  // 让对话 store 的内存副本同步，否则下一轮还会用回滚前的记忆
  if (evo.persona) chat.persona = { ...chat.persona, evolving: evo.persona.evolving }
}

/** 切换人格：对话 store 换档案并换会话，本页的图与面板跟着刷新 */
async function onSwitch(personaId: string) {
  await chat.switchTo(personaId)
  await evo.load(personaId)
}

/** 导入完成后切到新人格，并让对话页的切换器也刷新 */
async function onImported(personaId: string) {
  await onSwitch(personaId)
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
      <!-- 人格管理（Phase 4）：切换 / 新建 / 导入 / 导出 / 删除 -->
      <PersonaManager
        @switch="onSwitch"
        @imported="onImported"
      />

      <!-- 数据与权利（R8）：撤回同意 / 删除全部数据 -->
      <DataRightsPanel />

      <!-- 两张图：不变的 + 变化的 -->
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-2xl bg-white/60 p-5">
          <h2 class="m-0 mb-1 text-base tracking-wide">她的样子</h2>
          <p class="m-0 mb-3 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
            不变的部分 —— 投料时定下的结构
          </p>
          <StructureChart v-if="evo.persona" :frozen="evo.persona.frozen" />
        </section>

        <section class="rounded-2xl bg-white/60 p-5">
          <h2 class="m-0 mb-1 text-base tracking-wide">她的变化</h2>
          <p class="m-0 mb-3 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
            随着聊天，她记住的越来越多
          </p>
          <EvolutionCurve :points="curvePoints" />
        </section>
      </div>

      <!-- 内心独白 -->
      <section class="rounded-2xl bg-white/60 p-5">
        <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 class="m-0 text-base tracking-wide">内心独白</h2>
          <span v-if="monoMeta" class="text-xs tracking-wide text-[#3a3a3a]/45">{{ monoMeta }}</span>
        </header>

        <div v-if="monoLoading" class="text-sm tracking-wide text-[#3a3a3a]/55">
          她正在想……
        </div>

        <blockquote
          v-else-if="monologue"
          class="m-0 rounded-2xl bg-white/50 px-5 py-4 font-serif text-sm leading-relaxed tracking-wide text-[#3a3a3a]/85"
        >
          {{ monologue }}
        </blockquote>

        <p v-else class="m-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/50">
          她此刻在想什么、但没说出口的话。
          <span class="text-[#d4a373]">按需生成</span>，不会写进对话历史，
          也不会被她记住 —— 那是她自己的心事。
        </p>

        <p
          v-if="monoError"
          class="mb-0 mt-3 rounded-xl bg-[#c38d94]/12 px-4 py-2 text-xs tracking-wide text-[#c38d94]"
        >
          {{ monoError }}
        </p>

        <div class="mt-4">
          <button
            type="button"
            :disabled="monoLoading"
            class="rounded-2xl bg-white/60 px-6 py-2.5 text-sm tracking-wide text-[#3a3a3a]/70 shadow-[0_4px_20px_rgba(74,111,165,0.12)] transition-all duration-500 ease-in-out hover:bg-white/80 hover:shadow-[0_10px_40px_rgba(74,111,165,0.35)] hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            @click="onMonologue"
          >
            {{ monologue ? '再想一次' : '她在想什么' }}
          </button>
        </div>
      </section>

      <!-- 记忆面板 + 时间线 -->
      <MemoryTimeline @rollback="onRollback" />
    </main>
  </div>
</template>
