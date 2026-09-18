<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

import MessageBubble from '@/components/MessageBubble.vue'
import MoodSwitcher from '@/components/MoodSwitcher.vue'
import { ELYSIA_META } from '@/persona/elysia'
import { useChatStore } from '@/stores/chat'

const chat = useChatStore()
const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

onMounted(async () => {
  await chat.init()
  await scrollToEnd()
})

watch(
  () => chat.messages.length,
  () => scrollToEnd(),
)

async function scrollToEnd() {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

async function submit() {
  const text = draft.value
  if (!text.trim() || chat.streaming) return
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
  await chat.reset()
}
</script>

<template>
  <div class="mx-auto flex h-screen w-full max-w-4xl flex-col px-6">
    <!-- 顶栏 -->
    <header class="flex items-center justify-between py-6">
      <div>
        <h1 class="m-0 text-3xl tracking-wide md:text-4xl">真我回响</h1>
        <p class="mt-1 mb-0 text-sm tracking-wide text-[#3a3a3a]/55">
          与「{{ ELYSIA_META.name }}」对话 · {{ ELYSIA_META.tagline }}
        </p>
      </div>

      <div class="flex items-center gap-4">
        <MoodSwitcher />
        <button
          type="button"
          class="rounded-full bg-white/60 px-4 py-1.5 text-sm tracking-wide text-[#3a3a3a]/70 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
          @click="reset"
        >
          重新开始
        </button>
      </div>
    </header>

    <!-- 消息区 -->
    <main
      ref="scroller"
      class="flex-1 space-y-6 overflow-y-auto pb-4"
      aria-live="polite"
    >
      <p
        v-if="chat.isEmpty"
        class="mt-24 text-center text-base tracking-wide text-[#3a3a3a]/45"
      >
        说点什么吧，她一直在～
      </p>

      <MessageBubble
        v-for="m in chat.messages"
        :key="m.id"
        :role="m.role"
        :content="m.content"
        :degraded="m.degraded"
      />

      <p
        v-if="chat.streaming"
        class="pl-6 text-sm tracking-wide text-[#3a3a3a]/45"
      >
        正在回响……
      </p>
    </main>

    <!-- 错误条 -->
    <p
      v-if="chat.error"
      class="mb-3 rounded-2xl bg-[#c38d94]/12 px-5 py-3 text-sm tracking-wide text-[#c38d94]"
    >
      {{ chat.error }}
    </p>

    <!-- 输入区 -->
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
        {{ chat.statusLine }}
      </p>
    </footer>
  </div>
</template>
