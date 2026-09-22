<script setup lang="ts">
/**
 * 记忆面板 + 演化时间线（P3-3 的 UI，从 PersonaView 拆出来）
 *
 * 拆出来是因为 PersonaView 还要放两张图和内心独白 ——
 * 不拆的话它必然破 200 行。
 *
 * 触发词编辑（2026-09-22 补，D004 缓解措施）：抽取器给的触发词是猜测，
 * 用户最清楚「我以后会怎么说这件事」—— 卡片内容不改（那是模型记的事实），
 * 检索参数（触发词）归用户管。校验与抽取侧同规则：0–4 个、每个 2–6 字。
 */
import { computed, ref } from 'vue'

import { MEMORY_KIND_LABEL, type MemoryKind } from '@/persona/evolving'
import { useEvolutionStore } from '@/stores/evolution'

const emit = defineEmits<{ rollback: [snapshotId: number] }>()

const evo = useEvolutionStore()

/* ---------- 触发词编辑状态 ---------- */
const editingId = ref<string | null>(null)
const draft = ref<string[]>([])
const draftInput = ref('')
const editError = ref<string | null>(null)

function startEdit(id: string, triggers: string[]) {
  editingId.value = id
  draft.value = [...triggers]
  draftInput.value = ''
  editError.value = null
}

function cancelEdit() {
  editingId.value = null
  draft.value = []
  editError.value = null
}

function addDraft() {
  const t = draftInput.value.trim()
  if (!t) return
  if (draft.value.includes(t)) {
    editError.value = '这个词已经在了'
    return
  }
  if (t.length < 2 || t.length > 6) {
    editError.value = '触发词要 2–6 个字（和你平时会说的话一样长）'
    return
  }
  if (draft.value.length >= 4) {
    editError.value = '最多 4 个 —— 太多会让这条记忆每轮都被注入'
    return
  }
  draft.value.push(t)
  draftInput.value = ''
  editError.value = null
}

async function saveEdit(id: string) {
  if (draftInput.value.trim()) addDraft()
  if (editError.value) return
  await evo.updateTriggers(id, [...draft.value])
  cancelEdit()
}

async function removeCard(id: string, content: string) {
  if (confirm(`删掉这条记忆？\n「${content.slice(0, 40)}…」\n删掉后她就不记得这件事了（当前快照仍留档）。`)) {
    await evo.deleteMemory(id)
  }
}

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

function onRollback(id: number) {
  if (confirm('回滚到这个时间点？当前的记忆状态会被覆盖（会留一条回滚记录）。')) {
    emit('rollback', id)
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 空状态 -->
    <div
      v-if="(evo.persona?.evolving.memories.length ?? 0) === 0"
      class="rounded-2xl bg-white/55 p-8 text-center"
    >
      <p class="m-0 text-sm tracking-wide text-[#3a3a3a]/55">还没有记住任何东西。</p>
      <p class="mb-0 mt-2 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
        回到「对话」里聊几句，说过的事情会自动沉淀成记忆卡片。<br />
        冻结层（她是什么样的人）在投料时就定了，
        <span class="text-[#d4a373]">不会因为聊天而改变</span>。
      </p>
    </div>

    <!-- 记忆面板 -->
    <section v-for="g in groups" :key="g.kind" class="rounded-2xl bg-white/60 p-5">
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

          <!-- 展示态：触发词 chips + 编辑/删除 -->
          <template v-if="editingId !== m.id">
            <p class="mb-0 mt-1 text-xs tracking-wide text-[#3a3a3a]/40">
              {{ fmt(m.createdAt) }} · 重要度 {{ m.importance }} ·
              被用上 {{ m.hitCount }} 次 ·
              <span v-if="m.triggers.length">触发词 {{ m.triggers.join(' / ') }}</span>
              <span v-else class="text-[#d4a373]">没有触发词（只能走常驻区）</span>
            </p>
            <div class="mt-1.5 flex gap-2">
              <button
                type="button"
                class="rounded-full bg-white/60 px-3 py-0.5 text-xs tracking-wide text-[#3a3a3a]/55 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/12 hover:text-[#3a3a3a] active:scale-[0.98]"
                @click="startEdit(m.id, m.triggers)"
              >
                编辑触发词
              </button>
              <button
                type="button"
                class="rounded-full bg-white/60 px-3 py-0.5 text-xs tracking-wide text-[#3a3a3a]/45 transition-all duration-500 ease-in-out hover:bg-[#c38d94]/12 hover:text-[#c38d94] active:scale-[0.98]"
                @click="removeCard(m.id, m.content)"
              >
                删除这条记忆
              </button>
            </div>
          </template>

          <!-- 编辑态：chips 增删 + 保存/取消 -->
          <template v-else>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                v-for="t in draft"
                :key="t"
                class="inline-flex items-center gap-1 rounded-full bg-[#e8a87c]/14 px-2.5 py-0.5 text-xs tracking-wide text-[#3a3a3a]"
              >
                {{ t }}
                <button type="button" class="text-[#3a3a3a]/40 hover:text-[#c38d94]" @click="draft = draft.filter((x) => x !== t)">×</button>
              </span>
              <input
                v-model="draftInput"
                placeholder="加一个触发词，回车确认"
                class="w-44 rounded-full bg-white/70 px-3 py-1 text-xs tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
                @keydown.enter.prevent="addDraft"
              />
            </div>
            <p v-if="editError" class="mb-0 mt-1.5 text-xs tracking-wide text-[#c38d94]">{{ editError }}</p>
            <div class="mt-2 flex items-center gap-2">
              <button
                type="button"
                class="rounded-full bg-[#4a6fa5] px-4 py-1 text-xs tracking-wide text-white hover:opacity-90 active:scale-[0.98]"
                @click="saveEdit(m.id)"
              >
                保存
              </button>
              <button
                type="button"
                class="rounded-full bg-white/60 px-4 py-1 text-xs tracking-wide text-[#3a3a3a]/55 hover:bg-white/80"
                @click="cancelEdit"
              >
                取消
              </button>
              <span class="text-xs tracking-wide text-[#3a3a3a]/40">
                触发词是「我以后会怎么说这件事」—— 命中才会被她想起来
              </span>
            </div>
          </template>
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

      <p
        v-if="evo.frozenDrifted"
        class="mb-3 mt-0 rounded-xl bg-[#c38d94]/12 px-4 py-2 text-xs leading-relaxed tracking-wide text-[#c38d94]"
      >
        ⚠️ 冻结层在历史里出现过
        {{ evo.frozenFingerprints.length }} 个不同状态 ——
        那是有人在编辑器里改了档案（AI 不会改它）。
        回滚只还原<span class="text-[#3a3a3a]">记忆</span>，不会还原你的人设修改。
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
  </div>
</template>
