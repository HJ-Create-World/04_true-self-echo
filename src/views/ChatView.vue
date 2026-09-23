<script setup lang="ts">
/**
 * 对话页 —— 内容基本是 Phase 1 的 App.vue 原样搬过来，
 * 只多了顶部一行「当前人格」与「重新开始」的位置（原来在外壳的 header 里）。
 * Phase 4 加了顶栏的人格快速切换器。
 *
 * 合规设施（2026-09-22）：
 * - R1 常驻徽章「AI 生成 · 非真人」（与首访遮罩配套，法规要求常驻可见）
 * - R9 危机提示条：输入 + 回复两侧关键词命中时叠加求助信息。
 *   检测放在组件层（纯 UI 安全提示），不污染 chat store。
 *   🔴 每次命中都显示 —— 安全提示**不做去重**，去重等于漏报。
 */
import { nextTick, computed, onMounted, ref, watch } from 'vue'

import MessageBubble from '@/components/MessageBubble.vue'
import Dropdown, { type DropdownOption } from '@/components/ui/Dropdown.vue'
import { saveSelectedModel } from '@/api/apiConfig'
import { CRISIS_NOTICE, detectCrisis } from '@/core/crisis'
import { useChatStore } from '@/stores/chat'
import { useRosterStore } from '@/stores/roster'
import { useWellbeingStore } from '@/stores/wellbeing'

const chat = useChatStore()
const roster = useRosterStore()
const wellbeing = useWellbeingStore()
const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

/** 人格下拉（v-model 中转：选中新 id 时才真正切换，避免打开面板就触发） */
const personaId = computed({
  get: () => chat.persona.id,
  set: (id: string) => {
    if (id && id !== chat.persona.id) void chat.switchTo(id)
  },
})

const personaOptions = computed<DropdownOption[]>(() => {
  const list = chat.personaList.length
    ? chat.personaList.map((p) => ({ value: p.id, label: p.name }))
    : [{ value: chat.persona.id, label: chat.persona.name }]
  return list
})

/** 本轮输入或最新回复命中危机信号（切人格/清空后自然消失） */
const crisisShown = ref(false)

onMounted(async () => {
  await chat.init()
  await roster.refresh()
  await scrollToEnd()
})

/** 模型下拉选项（多模型平铺：一个连接拉到 N 个模型 → N 个选项，value 是复合键） */
const providerOptions = computed<DropdownOption[]>(() =>
  chat.providers.map((p) => ({ value: `${p.name}::${p.model}`, label: p.model, hint: p.name })),
)

/** 复合键 ⇄ (连接, 模型) 双写；选中模型持久化 —— extract/monologue 经 overrideFor 自动跟随 */
const selectedModelKey = computed({
  get: () => `${chat.currentProvider}::${chat.currentModel}`,
  set: (key: string) => {
    const [name, model] = key.split('::')
    if (!name || !model) return
    chat.currentProvider = name
    chat.currentModel = model
    saveSelectedModel(name, model)
  },
})


watch(
  () => chat.messages.length,
  () => {
    const last = chat.messages[chat.messages.length - 1]
    if (last?.role === 'assistant' && detectCrisis(last.content)) crisisShown.value = true
    void scrollToEnd()
  },
)

async function scrollToEnd() {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

async function submit() {
  const text = draft.value
  if (!text.trim() || chat.streaming) return
  if (detectCrisis(text)) crisisShown.value = true
  wellbeing.onMessage()
  draft.value = ''
  await chat.send(text)
}

function onKeydown(e: KeyboardEvent) {
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

async function reset() {
  if (!confirm('清空当前对话？此操作不可撤销。')) return
  crisisShown.value = false
  await chat.reset()
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-4">
      <div class="flex min-w-0 flex-wrap items-center gap-2.5">
        <span class="shrink-0 text-sm tracking-wide text-[#3a3a3a]/55">与</span>
        <Dropdown
          v-model="personaId"
          :options="personaOptions"
          aria-label="切换人格"
          class="shrink-0"
        />
        <span class="shrink-0 text-sm tracking-wide text-[#3a3a3a]/55">对话</span>
        <!-- R1 常驻标识：法规要求对话页可见的 AI 身份标识，不得藏在协议里 -->
        <span
          class="shrink-0 rounded-full bg-[#4a6fa5]/10 px-2.5 py-0.5 text-xs tracking-wide text-[#4a6fa5]"
        >
          AI 生成 · 非真人
        </span>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-xl bg-white/60 px-3 py-1.5 text-sm tracking-wide text-[#3a3a3a]/70 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
        @click="reset"
      >
        重新开始
      </button>
    </div>

    <main ref="scroller" class="flex-1 space-y-6 overflow-y-auto pb-4" aria-live="polite">
      <!-- R9 危机提示条：置顶常驻直至离开本会话 —— 安全提示不随消息滚走 -->
      <div
        v-if="crisisShown"
        class="rounded-2xl border border-[#c38d94]/30 bg-[#c38d94]/10 px-5 py-3"
        role="alert"
      >
        <p class="m-0 text-sm leading-relaxed tracking-wide text-[#c38d94]">
          {{ CRISIS_NOTICE }}
        </p>
      </div>

      <p v-if="chat.isEmpty" class="mt-24 text-center text-base tracking-wide text-[#3a3a3a]/45">
        说点什么吧，她一直在～
      </p>

      <MessageBubble
        v-for="m in chat.messages"
        :key="m.id"
        :role="m.role"
        :content="m.content"
        :degraded="m.degraded"
      />

      <p v-if="chat.streaming" class="pl-6 text-sm tracking-wide text-[#3a3a3a]/45">
        正在回响……
      </p>
    </main>

    <p
      v-if="chat.error"
      class="mb-3 rounded-2xl bg-[#c38d94]/12 px-5 py-3 text-sm tracking-wide text-[#c38d94]"
    >
      {{ chat.error }}
    </p>

    <!-- 输入容器：textarea + 底栏（模型/状态/发送）在同一个圆角框内（传统 AI 对话布局） -->
    <footer class="pb-8 pt-2">
      <div
        class="rounded-3xl bg-white/65 px-4 pt-3 pb-2.5 shadow-[0_4px_24px_rgba(74,111,165,0.08)] transition-all duration-500 ease-in-out focus-within:bg-white/85 focus-within:shadow-[0_10px_40px_rgba(74,111,165,0.18)]"
      >
        <textarea
          v-model="draft"
          rows="1"
          placeholder="说点什么……（Enter 发送）"
          class="max-h-40 min-h-[2.5rem] w-full resize-none bg-transparent px-2 pb-1 font-serif text-[15px] leading-relaxed tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 focus:outline-none"
          @keydown="onKeydown"
        />
        <div class="flex items-center gap-3">
          <p class="mb-0 h-4 min-w-0 flex-1 truncate text-xs tracking-wide text-[#3a3a3a]/40">
            {{ chat.memoryMeta ? chat.memoryMeta + ' · ' : '' }}{{ chat.statusLine }}
          </p>
        <Dropdown
          v-model="selectedModelKey"
          :options="providerOptions"
          aria-label="切换模型服务"
          direction="up"
          compact
          align="right"
        />
          <button
            type="button"
            :disabled="chat.streaming || !draft.trim()"
            class="shrink-0 rounded-full bg-[#4a6fa5] px-5 py-1.5 text-sm text-white shadow-[0_4px_20px_rgba(74,111,165,0.12)] transition-all duration-500 ease-in-out hover:bg-[#4a6fa5]/90 hover:shadow-[0_10px_40px_rgba(74,111,165,0.35)] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            @click="submit"
          >
            发送
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>
