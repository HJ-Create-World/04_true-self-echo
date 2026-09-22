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
import { nextTick, onMounted, ref, watch } from 'vue'

import MessageBubble from '@/components/MessageBubble.vue'
import { CRISIS_NOTICE, detectCrisis } from '@/core/crisis'
import { useChatStore } from '@/stores/chat'
import { useRosterStore } from '@/stores/roster'
import { useWellbeingStore } from '@/stores/wellbeing'

const chat = useChatStore()
const roster = useRosterStore()
const wellbeing = useWellbeingStore()
const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

/** 本轮输入或最新回复命中危机信号（切人格/清空后自然消失） */
const crisisShown = ref(false)

onMounted(async () => {
  await chat.init()
  await roster.refresh()
  await scrollToEnd()
})

async function onSwitchPersona(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  if (id && id !== chat.persona.id) await chat.switchTo(id)
}


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
    <div class="flex items-center justify-between gap-4 pb-4">
      <div class="flex min-w-0 items-center gap-2">
        <p class="m-0 shrink-0 text-sm tracking-wide text-[#3a3a3a]/55">与</p>
        <select
          :value="chat.persona.id"
          class="max-w-[10rem] truncate rounded-xl bg-white/60 px-2 py-1 font-serif text-sm tracking-wide text-[#3a3a3a] transition-all duration-500 ease-in-out focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
          aria-label="切换人格"
          @change="onSwitchPersona"
        >
          <option v-for="p in chat.personaList" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
          <!-- 列表还没拉到时至少显示当前 -->
          <option v-if="chat.personaList.length === 0" :value="chat.persona.id">
            {{ chat.persona.name }}
          </option>
        </select>
        <p class="m-0 truncate text-sm tracking-wide text-[#3a3a3a]/55">
          对话<template v-if="chat.persona.tagline"> · {{ chat.persona.tagline }}</template>
        </p>
        <!-- R1 常驻标识：法规要求对话页可见的 AI 身份标识，不得藏在协议里 -->
        <span
          class="shrink-0 rounded-full bg-[#4a6fa5]/10 px-2.5 py-0.5 text-xs tracking-wide text-[#4a6fa5]"
        >
          AI 生成 · 非真人
        </span>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full bg-white/60 px-4 py-1.5 text-sm tracking-wide text-[#3a3a3a]/70 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
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

    <footer class="pb-8 pt-2">
      <div class="flex items-end gap-3">
        <textarea
          v-model="draft"
          rows="1"
          placeholder="说点什么……（Enter 发送，Shift+Enter 换行）"
          class="max-h-40 min-h-[3.25rem] flex-1 resize-none rounded-2xl bg-white/60 px-5 py-3 font-serif text-[15px] leading-relaxed tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 transition-all duration-500 ease-in-out focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
          @keydown="onKeydown"
        />
        <button
          type="button"
          :disabled="chat.streaming || !draft.trim()"
          class="rounded-2xl bg-[#4a6fa5] px-8 py-3 text-base text-white shadow-[0_4px_20px_rgba(74,111,165,0.12)] transition-all duration-500 ease-in-out hover:bg-[#4a6fa5]/90 hover:shadow-[0_10px_40px_rgba(74,111,165,0.35)] hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          @click="submit"
        >
          发送
        </button>
      </div>

      <p class="mt-3 mb-0 h-4 text-xs tracking-wide text-[#3a3a3a]/40">
        {{ chat.memoryMeta ? chat.memoryMeta + ' · ' : '' }}{{ chat.statusLine }}
      </p>
    </footer>
  </div>
</template>
