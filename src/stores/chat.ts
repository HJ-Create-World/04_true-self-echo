/**
 * 对话状态（Pinia）
 *
 * 职责边界：只做「状态 + 编排」。消息怎么组装在 core/prompt.ts，
 * 怎么发请求在 api/chat.ts，存哪儿在 storage/db.ts。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { sendChat, fetchProviders, ChatError } from '@/api/chat'
import type { TurnMessage } from '@/core/prompt'
import { buildMessages, trimHistory } from '@/core/prompt'
import { ELYSIA_PARTS, ELYSIA_META } from '@/persona/elysia'
import {
  appendMessage,
  clearConversation,
  ensureConversation,
  loadMessages,
  retitleFromFirst,
  type MessageRow,
} from '@/storage/db'

/** 历史窗口：保留最近多少轮（§4.3 只截最旧的，永不截 system） */
const KEEP_ROUNDS = 20

export const useChatStore = defineStore('chat', () => {
  const conversationId = ref<number | null>(null)
  const messages = ref<MessageRow[]>([])
  const streaming = ref(false)
  const error = ref<string | null>(null)
  const providers = ref<{ name: string; model: string; isDefault: boolean }[]>([])
  const currentProvider = ref<string>('')
  const lastMeta = ref<string>('')

  const isEmpty = computed(() => messages.value.length === 0)

  /** 供 UI 显示「上一轮用了什么模型、多快」 */
  const statusLine = computed(() => lastMeta.value)

  async function init() {
    try {
      providers.value = await fetchProviders()
      const def = providers.value.find((p) => p.isDefault) ?? providers.value[0]
      currentProvider.value = def?.name ?? ''
    } catch {
      providers.value = []
      error.value = '连不上薄后端，请先运行 npm run server'
    }

    const conv = await ensureConversation(ELYSIA_META.id)
    conversationId.value = conv.id as number
    messages.value = await loadMessages(conversationId.value)
  }

  /** 把已落库的消息转成发给模型的历史（不含本轮输入） */
  function toHistory(): TurnMessage[] {
    const all: TurnMessage[] = messages.value.map((m) => ({
      role: m.role,
      content: m.content,
    }))
    return trimHistory(all, KEEP_ROUNDS)
  }

  async function send(text: string) {
    const input = text.trim()
    if (!input || streaming.value || conversationId.value === null) return

    error.value = null
    streaming.value = true

    const isFirst = messages.value.length === 0
    const history = toHistory()
    const now = Date.now()

    const userRow: MessageRow = {
      conversationId: conversationId.value,
      role: 'user',
      content: input,
      createdAt: now,
    }
    const userId = await appendMessage(userRow)
    messages.value.push({ ...userRow, id: userId })
    if (isFirst) await retitleFromFirst(conversationId.value, input)

    try {
      // ⚠️ 顺序约束③④由 buildMessages 统一保证，这里不要再手工拼 reminder
      const wire = buildMessages(ELYSIA_PARTS, history, input)

      const res = await sendChat({
        provider: currentProvider.value,
        system: wire[0].content,
        history: wire.slice(1, -1) as TurnMessage[],
        userInput: wire[wire.length - 1].content,
      })

      const botRow: MessageRow = {
        conversationId: conversationId.value,
        role: 'assistant',
        content: res.content,
        createdAt: Date.now(),
        degraded: res.degraded,
        provider: res.provider,
        model: res.model,
        elapsedMs: res.elapsedMs,
        finishReason: res.finishReason,
      }
      const botId = await appendMessage(botRow)
      messages.value.push({ ...botRow, id: botId })

      const warn = res.degraded ? ' · ⚠️ 输出退化' : ''
      lastMeta.value = `${res.model} · ${(res.elapsedMs / 1000).toFixed(1)}s · ${res.content.length} 字${warn}`
    } catch (e) {
      error.value = e instanceof ChatError ? e.message : String(e)
    } finally {
      streaming.value = false
    }
  }

  async function reset() {
    if (conversationId.value === null) return
    await clearConversation(conversationId.value)
    messages.value = []
    lastMeta.value = ''
  }

  return {
    conversationId,
    messages,
    streaming,
    error,
    providers,
    currentProvider,
    isEmpty,
    statusLine,
    init,
    send,
    reset,
  }
})
