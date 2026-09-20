/**
 * 对话状态（Pinia）
 *
 * 职责边界：只做「状态 + 编排」。消息怎么组装在 core/prompt.ts，
 * 怎么发请求在 api/chat.ts，存哪儿在 storage/db.ts。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { sendChat, fetchProviders, ChatError } from '@/api/chat'
import type { SystemPromptParts, TurnMessage } from '@/core/prompt'
import { buildMessages, trimHistory } from '@/core/prompt'
import { ELYSIA_PROFILE } from '@/persona/elysia'
import { buildPromptParts } from '@/persona/render'
import type { PersonaProfile } from '@/persona/schema'
import {
  appendMessage,
  clearConversation,
  ensureConversation,
  loadMessages,
  retitleFromFirst,
  type MessageRow,
} from '@/storage/db'
import { seedIfEmpty } from '@/storage/personaRepo'

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

  /** 当前正在对话的人格。Phase 1 是内置的，Phase 2 起可从投料结果切换。 */
  const persona = ref<PersonaProfile>(ELYSIA_PROFILE)
  /**
   * system prompt 三段。⚠️ 按 §3.1 **缓存，不要每轮重算** ——
   * 完整档案每次重渲染既费 CPU，也会让「同一个人格只有一份 reminder」这条失去保障。
   */
  const parts = ref<SystemPromptParts>(buildPromptParts(ELYSIA_PROFILE))

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

    // 冷启动把人内置人格写进库（空库才播种），之后一律以库里的为准
    persona.value = await seedIfEmpty(ELYSIA_PROFILE)
    parts.value = buildPromptParts(persona.value)

    await openConversation()
  }

  async function openConversation() {
    const conv = await ensureConversation(persona.value.id)
    conversationId.value = conv.id as number
    messages.value = await loadMessages(conversationId.value)
  }

  /** 切换到另一个人格（Phase 2 投料完成后调用） */
  async function usePersona(next: PersonaProfile) {
    persona.value = next
    parts.value = buildPromptParts(next)
    lastMeta.value = ''
    await openConversation()
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
      // 用缓存好的 parts，不要每轮 buildPromptParts（§3.1）
      const wire = buildMessages(parts.value, history, input)

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
    persona,
    isEmpty,
    statusLine,
    init,
    send,
    reset,
    usePersona,
  }
})
