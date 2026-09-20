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
import { renderMemoryBlock } from '@/memory/inject'
import { extractMemories, mergeExtracted, shouldExtract } from '@/memory/extract'
import { selectMemories } from '@/persona/evolving'
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
import { latestPersona, saveEvolving, seedIfEmpty } from '@/storage/personaRepo'
import { appendSnapshot } from '@/storage/snapshotRepo'
import { frozenHash } from '@/persona/evolving'

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

  /** 记忆相关状态（Phase 3）：本轮注入了几条 / 抽到了几条 */
  const memoryMeta = ref('')

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

    // 用最近更新过的那份档案 —— Phase 2 约定「刚投料出来的人格就是当前的」
    // （人格列表与切换是 Phase 4）。空库时把人内置人格写进去兜底。
    persona.value = (await latestPersona()) ?? (await seedIfEmpty(ELYSIA_PROFILE))
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
    // 记下这一轮**开始前**的演化层 —— 用于判断「这轮有没有真的改变什么」
    const evolvingBefore = JSON.stringify(persona.value.evolving)

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
      // 人格正文用缓存好的 parts；**记忆区是每轮现算的** ——
      // 它依赖本轮输入（关键词触发），所以不能进缓存。
      const sel = selectMemories(persona.value.evolving.memories, input)
      const withMemory: SystemPromptParts = { ...parts.value, memoryBlock: renderMemoryBlock(sel) }
      memoryMeta.value = sel.pinned.length + sel.triggered.length
        ? `记忆 ${sel.pinned.length}+${sel.triggered.length} 条`
        : ''

      const wire = buildMessages(withMemory, history, input)

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

      // 记忆抽取（Phase 3）。放最后：抽取失败**不能**影响这轮对话已经成功的事实。
      const added = await extractAndStore(input, res.content)

      // ⭐ 快照：只在演化层**真的变了**时才记。
      //    没变化的一轮是重复点，画在曲线上是噪声；而且「回滚到它」没有意义
      //    （回滚回去和现在一模一样）。只有真实变化才值得留一帧。
      const evolvingAfter = JSON.stringify(persona.value.evolving)
      if (evolvingAfter !== evolvingBefore) {
        try {
          await appendSnapshot({
            personaId: persona.value.id,
            at: new Date().toISOString(),
            frozenHash: frozenHash(JSON.stringify(persona.value.frozen)),
            evolving: persona.value.evolving,
            triggerSummary: added > 0 ? `新增 ${added} 条记忆` : '演化层更新',
            messageId: botId,
          })
        } catch (e) {
          // 快照失败同样只进状态栏 —— 它不该抹掉一轮成功的对话
          memoryMeta.value =
            (memoryMeta.value ? memoryMeta.value + ' · ' : '') +
            `⚠️ 快照失败：${e instanceof Error ? e.message : String(e)}`.slice(0, 100)
        }
      }
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

  /**
   * 抽取这一轮的记忆并落库。
   *
   * ⚠️ **失败要吞掉，但不能静默**：
   * 记忆是「锦上添花」，它挂了不该让用户看到一条报错打断聊天；
   * 但也不能什么都不做 —— 否则抽取功能坏了没人知道（Phase 2 的 DataCloneError
   * 就是被静默吞掉藏了两轮的）。
   * 所以：错误记到 `memoryMeta`（状态栏），不进 `error`（那是聊天错误的位）。
   */
  async function extractAndStore(userInput: string, assistantReply: string): Promise<number> {
    if (!shouldExtract(userInput)) {
      memoryMeta.value = '（本条太短，未抽取记忆）'
      return 0
    }
    try {
      const res = await extractMemories(currentProvider.value, userInput, assistantReply)
      if (res.parseError) {
        memoryMeta.value = `⚠️ 记忆抽取失败：${res.parseError.slice(0, 60)}`
        return 0
      }
      if (res.cards.length === 0) {
        memoryMeta.value = `记忆 +0（没有值得记的）`
        return 0
      }

      const now = new Date().toISOString()
      const before = persona.value.evolving.memories.length
      const next = mergeExtracted(persona.value.evolving.memories, res.cards, now, () =>
        `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      )
      persona.value.evolving = { ...persona.value.evolving, memories: next }
      await saveEvolving(persona.value.id, persona.value.evolving)

      // 抽到的条数可能多于净增数 —— 重复的会被去重合并掉
      memoryMeta.value = `记忆 +${next.length - before}（抽到 ${res.cards.length}，共 ${next.length}）`
      return next.length - before
    } catch (e) {
      memoryMeta.value = `⚠️ 记忆抽取失败：${e instanceof Error ? e.message : String(e)}`.slice(0, 80)
      return 0
    }
  }

  return {
    conversationId,
    messages,
    streaming,
    error,
    providers,
    currentProvider,
    persona,
    memoryMeta,
    isEmpty,
    statusLine,
    init,
    send,
    reset,
    usePersona,
  }
})
