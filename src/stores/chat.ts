/**
 * 对话状态（Pinia）
 *
 * 职责边界：只做「状态 + 编排」。消息怎么组装在 core/prompt.ts，
 * 怎么发请求在 api/chat.ts，存哪儿在 storage/db.ts。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { sendChat, fetchProviders, ChatError, type ChatResponse } from '@/api/chat'
/**
 * APK/桌面原生环境判定（直连模式开关）——
 * 🔴 不 import @capacitor/core（保持与后端共享的 api/chat.ts 同款零依赖探测）
 */
function isNative(): boolean {
  return typeof window !== 'undefined' && 'Capacitor' in window && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
}

import { getSelectedModel, listCustomConnections, loadApiConfig } from '@/api/apiConfig'
import { burstDelay, sleep, splitBurst } from '@/core/burst'
import {
  GREETING_INSTRUCTION,
  PROACTIVE,
  SILENCE_INSTRUCTION,
  isQuietHour,
  loadProactiveEnabled,
} from '@/core/proactive'
import type { SystemPromptParts, TurnMessage } from '@/core/prompt'
import { buildMessages, trimHistory } from '@/core/prompt'
import { renderMemoryBlock } from '@/memory/inject'
import { extractMemories, mergeExtracted, shouldExtract } from '@/memory/extract'
import { selectMemories } from '@/persona/evolving'
import { applyRelationUpdate } from '@/persona/relation'
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
import {
  getPersona,
  latestPersona,
  listPersonaSummaries,
  saveEvolving,
  seedIfEmpty,
  type PersonaSummary,
} from '@/storage/personaRepo'
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
  /** 当前选中的模型（多模型平铺后与连接解耦；发请求时叠加进 override.model） */
  const currentModel = ref<string>('')
  const lastMeta = ref<string>('')

  /* ---------- 连发与主动对话（2026-09-29 体验迭代） ---------- */

  /** 用户在 AI 生成期间连发的输入 —— turn 结束后作为下一轮消费（A2） */
  const pendingInputs = ref<string[]>([])

  /** 主动消息连续几次没有得到回应（L2 止损计数，用户发言即归零） */
  const unansweredProactive = ref(0)

  /** 最后一次「用户活动」（发言 / 上次主动消息）的时间 —— 静默计时的起点 */
  const lastActivityAt = ref(Date.now())

  /** L2 定时器句柄（ChatView 生命周期内有效，离开对话页即停） */
  let proactiveTimer: number | null = null

  function markUserActivity(): void {
    lastActivityAt.value = Date.now()
    unansweredProactive.value = 0
  }

  /** 当前正在对话的人格。Phase 1 是内置的，Phase 2 起可从投料结果切换。 */
  const persona = ref<PersonaProfile>(ELYSIA_PROFILE)
  /**
   * system prompt 三段。⚠️ 按 §3.1 **缓存，不要每轮重算** ——
   * 完整档案每次重渲染既费 CPU，也会让「同一个人格只有一份 reminder」这条失去保障。
   */
  const parts = ref<SystemPromptParts>(buildPromptParts(ELYSIA_PROFILE))

  /** 记忆相关状态（Phase 3）：本轮注入了几条 / 抽到了几条 */
  const memoryMeta = ref('')

  /** 全部人格的摘要 —— 对话页顶栏的快速切换器用（Phase 4） */
  const personaList = ref<PersonaSummary[]>([])

  async function refreshPersonaList(): Promise<void> {
    personaList.value = await listPersonaSummaries()
  }

  /**
   * 是否已经完成过「选定当前人格」。
   *
   * 🔴 **这个标记是多人格的关键**（2026-09-20 P4 验收实测）：
   * 之前 `init()` 每次被调用都会重新选「最近更新的人格」——
   * 单人格时无害，多人格时就成了 bug：
   * 「在档案页切到甲 → 点对话 → init 又跳回最近更新的乙」，
   * 之后说的每句话都写进乙，甲永远学不到东西。
   *
   * 所以：**首次 init 选人，之后的 init 只负责打开当前人格的会话**。
   * 人格的显式切换只能走 `switchTo()`。
   */
  const initialized = ref(false)

  const isEmpty = computed(() => messages.value.length === 0)

  /** 供 UI 显示「上一轮用了什么模型、多快」 */
  const statusLine = computed(() => lastMeta.value)

  /**
   * 重建模型下拉（2026-09-23 · 多模型平铺）。
   *
   * 选项粒度 = **连接 × 模型**：一个连接拉到 N 个模型就展开成 N 个选项
   * （用户配一个 API 地址，该地址下所有模型都能在对话页直接切换，
   * 不用为每个模型建一条连接）。选项 value 是复合键 `${连接}::${模型}`；
   * 请求的 model 由 overrideFor 读 selectedModel（持久化，跨重启保持）。
   *
   * 🔴 必须**重建**而不是在旧列表上叠加 —— 否则删除连接/模型后旧选项残留
   * （custom_provider_e2e C4 抓的）。当前选中项失效时自动回退到默认。
   */
  async function reloadProviders() {
    try {
      providers.value = await fetchProviders()
    } catch {
      /* 拉不到 .env 清单就保留现状，至少自定义连接还在 */
    }

    const flat: { name: string; model: string; isDefault: boolean }[] = []
    const seenConn = new Set<string>()
    for (const p of providers.value) {
      if (seenConn.has(p.name)) continue
      seenConn.add(p.name)
      const models = loadApiConfig()[p.name]?.models?.filter(Boolean) ?? []
      if (models.length) {
        for (const m of models) {
          flat.push({ name: p.name, model: m, isDefault: p.isDefault && m === models[0] })
        }
      } else {
        flat.push({ name: p.name, model: p.model, isDefault: p.isDefault })
      }
    }
    for (const c of listCustomConnections()) {
      if (seenConn.has(c.name)) continue
      const models = loadApiConfig()[c.name]?.models?.filter(Boolean) ?? [c.model]
      for (const m of models) flat.push({ name: c.name, model: m, isDefault: false })
    }
    providers.value = flat

    // 用户选中的「连接::模型」不在列表里（连接被删/模型下架）→ 回退到默认
    const stillThere = flat.some(
      (f) => f.name === currentProvider.value && f.model === currentModel.value,
    )
    if (!stillThere) {
      const def = flat.find((f) => f.isDefault) ?? flat[0]
      currentProvider.value = def?.name ?? ''
      // 默认连接恢复用户上次选中的模型（per-provider 记忆，跨重启保持）
      const remembered = (def && getSelectedModel(def.name)) || def?.model || ''
      currentModel.value = remembered
    }
  }

  async function init() {
    if (!initialized.value) {
      if (!isNative()) {        try {
          providers.value = await fetchProviders()
        } catch {
          providers.value = []
          error.value = '连不上薄后端，请先运行 npm run server'
        }
      }
      // APK 直连模式：没有本机后端，providers 完全来自自定义连接（reloadProviders 处理）
      await reloadProviders()

      // 首次进应用：用最近更新过的那份档案兜底；空库时写入内置人格。
      // 之后的显式切换只能走 switchTo() —— 这是 Phase 4 定下的规则。
      persona.value = (await latestPersona()) ?? (await seedIfEmpty(ELYSIA_PROFILE))
      parts.value = buildPromptParts(persona.value)
      await refreshPersonaList()
      initialized.value = true
    }

    // 每次进对话页都要按「当前人格」打开会话 —— 即使 persona 没变，
    // 消息也可能在别的页面（导入/回滚）被动过。
    await openConversation()
  }

  async function openConversation() {
    const conv = await ensureConversation(persona.value.id)
    conversationId.value = conv.id as number
    messages.value = await loadMessages(conversationId.value)
  }

  /** 切换到另一个人格（投料完成 / 手动切换都会走这里） */
  async function usePersona(next: PersonaProfile) {
    persona.value = next
    parts.value = buildPromptParts(next)
    // 显式选定过人格之后，后续的 init 不许再自动改选（见 initialized 的注释）
    initialized.value = true
    lastMeta.value = ''
    // 换人重新计时 —— 静默触发与止损计数都是「会话内」状态，不跨人格
    pendingInputs.value = []
    markUserActivity()
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

  /**
   * 发送入口（A2 用户连发）。
   *
   * AI 生成期间用户再发消息**不再丢弃**，进队列；
   * 当前 turn 结束后队列整体作为下一轮消费
   * （用户连发三条 → 一条不落全被看到，合并成一次生成一起回），
   * 循环直到队列清空。
   */
  async function send(text: string) {
    const input = text.trim()
    if (!input || conversationId.value === null) return
    if (streaming.value) {
      pendingInputs.value.push(input)
      return
    }

    await runTurn([input])
    while (pendingInputs.value.length && !error.value) {
      await runTurn(pendingInputs.value.splice(0))
    }
  }

  /** 执行一轮对话：inputs 是这一轮要处理的用户消息（用户连发时多条） */
  async function runTurn(inputs: string[]) {
    if (conversationId.value === null || inputs.length === 0) return

    error.value = null
    streaming.value = true
    markUserActivity()

    const isFirst = messages.value.length === 0
    const history = toHistory()
    // 记下这一轮**开始前**的演化层 —— 用于判断「这轮有没有真的改变什么」
    const evolvingBefore = JSON.stringify(persona.value.evolving)

    // 连发的每条独立落库 —— 保留真人消息形态，回放历史时也是多条。
    // createdAt 依次 +1ms：sortBy 对同值不保证顺序，连发会乱序。
    const now = Date.now()
    const userIds: number[] = []
    for (let i = 0; i < inputs.length; i++) {
      const userRow: MessageRow = {
        conversationId: conversationId.value,
        role: 'user',
        content: inputs[i],
        createdAt: now + i,
      }
      const uid = await appendMessage(userRow)
      messages.value.push({ ...userRow, id: uid })
      userIds.push(uid)
    }
    if (isFirst) await retitleFromFirst(conversationId.value, inputs[0])

    // 连发合并成一段喂给模型 —— 部分上游不收连续多条 user，合并最稳
    const merged = inputs.join('\n')

    try {
      // ⚠️ 顺序约束③④由 buildMessages 统一保证，这里不要再手工拼 reminder
      // 人格正文用缓存好的 parts；**记忆区是每轮现算的** ——
      // 它依赖本轮输入（关键词触发），所以不能进缓存。
      const sel = selectMemories(persona.value.evolving.memories, merged)
      const withMemory: SystemPromptParts = { ...parts.value, memoryBlock: renderMemoryBlock(sel) }
      memoryMeta.value = sel.pinned.length + sel.triggered.length
        ? `记忆 ${sel.pinned.length}+${sel.triggered.length} 条`
        : ''

      const wire = buildMessages(withMemory, history, merged)

      const res = await sendChat({
        provider: currentProvider.value,
        system: wire[0].content,
        history: wire.slice(1, -1) as TurnMessage[],
        userInput: wire[wire.length - 1].content,
      })

      const botId = await deliverBurst(res)

      // 记忆抽取 + 关系温度（Phase 3）。放最后：抽取失败**不能**影响这轮对话已经成功的事实。
      const ext = await extractAndStore(merged, res.content)

      // ⭐ 快照：只在演化层**真的变了**时才记。
      //    没变化的一轮是重复点，画在曲线上是噪声；而且「回滚到它」没有意义
      //    （回滚回去和现在一模一样）。只有真实变化才值得留一帧。
      await maybeSnapshot(evolvingBefore, ext, botId)
    } catch (e) {
      error.value = e instanceof ChatError ? e.message : String(e)
    } finally {
      streaming.value = false
    }
  }

  /**
   * 一次生成 → 拆条 → 逐条延迟落库显示（A1 AI 连发）。
   *
   * 第一条立即出现（用户已经等了整个生成时长），后续每条按前一条的
   * 「打字时长」延迟 —— 像对方在一条接一条地发，而不是倒出一段作文。
   * degraded 标注只挂第一条：它描述的是整次生成，不用每条都吓人。
   *
   * 返回最后一条消息的 id（快照的 messageId 用）。
   */
  async function deliverBurst(res: ChatResponse): Promise<number> {
    const burst = splitBurst(res.content)
    let lastId = 0
    for (let i = 0; i < burst.length; i++) {
      if (i > 0) await sleep(burstDelay(burst[i - 1]))
      const row: MessageRow = {
        conversationId: conversationId.value!,
        role: 'assistant',
        content: burst[i],
        createdAt: Date.now(),
        degraded: i === 0 ? res.degraded : undefined,
        provider: res.provider,
        model: res.model,
        elapsedMs: res.elapsedMs,
        finishReason: res.finishReason,
      }
      const id = await appendMessage(row)
      messages.value.push({ ...row, id })
      lastId = id
    }

    const warn = res.degraded ? ' · ⚠️ 输出退化' : ''
    // Q2 用量透明化：每轮消耗直接可见（缓存命中单列 —— 它是省钱的关键指标）
    const u = res.usage
    const usageStr = u
      ? ` · ↧${fmtTokens(u.prompt)} ↥${fmtTokens(u.completion)}${u.cacheHit ? `（缓存 ${fmtTokens(u.cacheHit)}）` : ''}`
      : ''
    const burstStr = burst.length > 1 ? ` · 连发 ${burst.length} 条` : ''
    lastMeta.value = `${res.model} · ${(res.elapsedMs / 1000).toFixed(1)}s · ${res.content.length} 字${burstStr}${usageStr}${warn}`
    return lastId
  }

  /** 快照：只在演化层真的变了时记（原 send 内联逻辑，抽出来复用） */
  async function maybeSnapshot(
    evolvingBefore: string,
    ext: { added: number; relChanged: boolean },
    messageId: number,
  ): Promise<void> {
    const evolvingAfter = JSON.stringify(persona.value.evolving)
    if (evolvingAfter === evolvingBefore) return
    try {
      await appendSnapshot({
        personaId: persona.value.id,
        at: new Date().toISOString(),
        frozenHash: frozenHash(JSON.stringify(persona.value.frozen)),
        evolving: persona.value.evolving,
        triggerSummary: [
          ext.added > 0 ? `新增 ${ext.added} 条记忆` : '',
          ext.relChanged
            ? `亲密度 ${persona.value.evolving.relation.intimacy}（${persona.value.evolving.relation.stage}）`
            : '',
        ]
          .filter(Boolean)
          .join(' · ') || '演化层更新',
        messageId,
      })
    } catch (e) {
      // 快照失败同样只进状态栏 —— 它不该抹掉一轮成功的对话
      memoryMeta.value =
        (memoryMeta.value ? memoryMeta.value + ' · ' : '') +
        `⚠️ 快照失败：${e instanceof Error ? e.message : String(e)}`.slice(0, 100)
    }
  }

  /* ---------- 主动对话（L1 开场白 / L2 沉默触发） ---------- */

  /**
   * 主动发一条消息。
   *
   * 指令放在 user 消息位但**不落库** —— 落了库，下一轮它就在历史里，
   * 模型会看到「系统让我主动」从而出戏；不落库，历史里只有她的自然发言，
   * 下一轮模型看到的就是「她自己说过这句话」—— 与真实记忆无缝。
   *
   * 失败完全静默：用户没有请求这次生成，弹错误反而是打扰；
   * console.warn 留排障线索。
   */
  async function proactiveReply(kind: 'greet' | 'silence'): Promise<void> {
    if (streaming.value || conversationId.value === null) return
    error.value = null
    streaming.value = true
    try {
      const history = toHistory()
      // 记忆照常注入 —— 主动开口也该记得对方的事（触发词用最近一条用户消息）
      const recentUser =
        [...messages.value].reverse().find((m) => m.role === 'user')?.content ?? ''
      const sel = selectMemories(persona.value.evolving.memories, recentUser)
      const withMemory: SystemPromptParts = { ...parts.value, memoryBlock: renderMemoryBlock(sel) }
      const wire = buildMessages(
        withMemory,
        history,
        kind === 'greet' ? GREETING_INSTRUCTION : SILENCE_INSTRUCTION,
      )

      const res = await sendChat({
        provider: currentProvider.value,
        system: wire[0].content,
        history: wire.slice(1, -1) as TurnMessage[],
        userInput: wire[wire.length - 1].content,
      })
      await deliverBurst(res)
      memoryMeta.value = kind === 'greet' ? '主动开场' : '主动找你'
      // 主动发言也是一次「活动」—— 下一次沉默触发从这条算起
      lastActivityAt.value = Date.now()
    } catch (e) {
      console.warn('[proactive] 主动消息生成失败', e)
    } finally {
      streaming.value = false
    }
  }

  /** L1：进对话页时判断要不要主动开场（每次进页最多一条） */
  async function maybeGreet(): Promise<void> {
    if (!loadProactiveEnabled() || isQuietHour() || streaming.value) return
    const last = messages.value[messages.value.length - 1]
    // 空会话也开场（冷启动破冰）；有过对话则要求距上一条超过阈值
    if (last && Date.now() - last.createdAt < PROACTIVE.GREETING_GAP_MS) return
    await proactiveReply('greet')
  }

  /** L2 检查（定时器驱动）：沉默够久、没到止损上限 → 主动说一句 */
  async function checkSilence(): Promise<void> {
    if (!loadProactiveEnabled() || isQuietHour()) return
    if (streaming.value || pendingInputs.value.length) return
    if (unansweredProactive.value >= PROACTIVE.MAX_UNANSWERED) return
    if (Date.now() - lastActivityAt.value < PROACTIVE.SILENCE_MS) return
    await proactiveReply('silence')
    unansweredProactive.value += 1
  }

  /** 挂载 L2 定时器（ChatView 进入时调用，离开即停 —— 只在「在场」时主动） */
  function startProactive(): void {
    if (proactiveTimer !== null) return
    proactiveTimer = window.setInterval(() => void checkSilence(), PROACTIVE.CHECK_INTERVAL_MS)
  }

  function stopProactive(): void {
    if (proactiveTimer !== null) {
      clearInterval(proactiveTimer)
      proactiveTimer = null
    }
  }

  async function reset() {
    if (conversationId.value === null) return
    await clearConversation(conversationId.value)
    messages.value = []
    lastMeta.value = ''
    pendingInputs.value = []
    markUserActivity()
  }

/** token 数缩写：1234 → 1.2k，避免状态栏被长数字撑爆 */
function fmtTokens(n: number): string {
  if (!n) return '0'
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n >= 1000 ? `${(n / 1000).toFixed(2)}k` : String(n)
}

/**
 * 抽取这一轮的记忆 + 关系温度，并落库。
   *
   * ⚠️ **失败要吞掉，但不能静默**：
   * 记忆是「锦上添花」，它挂了不该让用户看到一条报错打断聊天；
   * 但也不能什么都不做 —— 否则抽取功能坏了没人知道（Phase 2 的 DataCloneError
   * 就是被静默吞掉藏了两轮的）。
   * 所以：错误记到 `memoryMeta`（状态栏），不进 `error`（那是聊天错误的位）。
   *
   * 返回 { added, relChanged }：send() 用它拼快照的 triggerSummary。
   */
  async function extractAndStore(
    userInput: string,
    assistantReply: string,
  ): Promise<{ added: number; relChanged: boolean }> {
    if (!shouldExtract(userInput)) {
      memoryMeta.value = '（本条太短，未抽取记忆）'
      return { added: 0, relChanged: false }
    }
    try {
      const res = await extractMemories(currentProvider.value, userInput, assistantReply)
      if (res.parseError) {
        memoryMeta.value = `⚠️ 记忆抽取失败：${res.parseError.slice(0, 60)}`
        return { added: 0, relChanged: false }
      }

      // 关系推进与记忆共用同一份演化层。
      // 🔴 cards 为 0 也**不能提前返回** —— 聊了心事但「没有可记事实」的一轮，
      //    关系照样该推进；提前返回会让亲密度在整段走心对话里纹丝不动。
      const withRelation = applyRelationUpdate(persona.value.evolving, res.relation)
      const relChanged = withRelation !== persona.value.evolving
      const before = withRelation.memories.length
      const next = mergeExtracted(withRelation.memories, res.cards, new Date().toISOString(), () =>
        `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      )
      const gained = next.length - before

      if (gained === 0 && !relChanged) {
        memoryMeta.value = `记忆 +0（没有值得记的）`
        return { added: 0, relChanged: false }
      }

      persona.value.evolving = { ...withRelation, memories: next }
      await saveEvolving(persona.value.id, persona.value.evolving)

      // 抽到的条数可能多于净增数 —— 重复的会被去重合并掉
      const parts = [`记忆 +${gained}（抽到 ${res.cards.length}，共 ${next.length}）`]
      if (relChanged) {
        const rel = persona.value.evolving.relation
        parts.push(`亲密度 ${rel.intimacy} · ${rel.stage}`)
      }
      memoryMeta.value = parts.join(' · ')
      return { added: gained, relChanged }
    } catch (e) {
      memoryMeta.value = `⚠️ 记忆抽取失败：${e instanceof Error ? e.message : String(e)}`.slice(0, 80)
      return { added: 0, relChanged: false }
    }
  }

  /** 切换人格：读档案 → usePersona（会话跟着 personaId 走）→ 刷新切换器 */
  async function switchTo(id: string): Promise<void> {
    const p = await getPersona(id)
    if (!p) return
    await usePersona(p)
    await refreshPersonaList()
  }

  return {
    conversationId,
    messages,
    streaming,
    error,
    providers,
    currentProvider,
    persona,
    /** system 三段（含可选记忆区）—— 内心独白等衍生内容要复用同一份 */
    parts,
    /** 全部人格摘要 —— 顶栏切换器用（Phase 4） */
    personaList,
    memoryMeta,
    isEmpty,
    statusLine,
    init,
    send,
    reset,
    reloadProviders,
    currentModel,
    usePersona,
    switchTo,
    refreshPersonaList,
    /** 主动对话（L1/L2）：ChatView 生命周期内挂载与驱动 */
    maybeGreet,
    startProactive,
    stopProactive,
  }
})
