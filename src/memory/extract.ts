/**
 * 记忆抽取：从一轮对话里抽出「值得长期记住的事」
 *
 * 依据：`D004`（记忆是**结构化的事实卡片**，不是模糊的语义块）
 * + `SPEC.md` §四「演化层管『知道什么』」
 *
 * ## 🔴 一条最容易做错的边界：**不许抽取「她怎么说话」**
 *
 * 边界规则是「冻结层管怎么说，演化层管知道什么」。
 * 抽取的对象是**对话内容**，模型很容易顺手把「她这次用了比喻」「她语气变冷了」
 * 也抽成记忆 —— 那是**冻结层的领域**，抽进来等于让对话改写人设。
 *
 * 所以 prompt 里把这条写成了**独立的一节**，而不是顺带一句。
 *
 * ## 开销
 *
 * 每轮多一次调用。缓解：
 *   · 抽取的 prompt 短、输出小（temperature 0.2）
 *   · `shouldExtract()` 对太短/寒暄类的输入直接跳过（省掉最常见的浪费）
 *   · 输出走 `response_format: json` + 同一套容错解析（P2 踩过的坑不再踩）
 */

import { sendChat } from '@/api/chat'
import { MEMORY_LIMIT, mergeMemory, type MemoryCard, type MemoryKind } from '@/persona/evolving'
import type { RelationUpdate } from '@/persona/relation'

export const MEMORY_TEMPERATURE = 0.2
export const MEMORY_MAX_TOKENS = 1024

/**
 * 低于这个长度的输入直接跳过抽取 —— 「你好」「在吗」里不可能有值得记的事实。
 *
 * ⚠️ **别把它调太大**（2026-09-20 实测教训）：设成 8 时，
 * 「我妹妹叫小雨」这种 6 字但**信息量很高**的输入被跳过了。
 * 阈值的目的只是滤掉寒暄，不是滤掉短句 —— 短句完全可以有事实。
 */
export const MIN_EXTRACT_LENGTH = 5

const KINDS = ['fact', 'preference', 'relation', 'event', 'promise'] as const

function isKind(v: string): v is MemoryKind {
  return (KINDS as readonly string[]).includes(v)
}

export const MEMORY_EXTRACT_SYSTEM = `你的任务：从这一轮对话里，找出**值得长期记住的、关于对方的新信息**，
并顺带评估两人关系的推进、她此刻的心情、以及有哪些话还没聊完。

你要为一个「记住用户」的功能供料。抽出来的每一条，将来会被做成卡片，
在以后的对话里注入给另一个模型。

## 一、抽什么（记忆卡，只抽这五类，都是**关于对方或两人关系**的）

- fact 事实：身份、职业、家人、住的地方、在忙什么（「用户是程序员」）
- preference 偏好：喜欢什么、讨厌什么、希望怎么被对待（「用户希望回答简短」）
- relation 关系：两人之间确认过的事（「用户说过我们是朋友」）
- event 事件：发生过的具体事（「用户的猫上周生病了」）
- promise 约定：说好要做的事（「用户答应周末试试我给的建议」）

## 🔴 记忆的三条硬规则

1. **只抽「关于对方或关系」的信息。**
   绝对**不要**抽「她（角色）怎么说话、什么性格、用了什么语气」——
   那是另一个人格档案的领域，抽进来等于让对话改写人设。
   判断办法：这条信息的主语是「用户 / 我们」，才可以；主语是「她」，就不行。
2. **没有值得记的就输出空数组。**
   寒暄、闲扯、问天气，都**不值得记**。**宁可空着，不要硬凑** ——
   塞进去的垃圾记忆会在以后的每一轮里干扰对话。
3. **一条只说一件事，必须是可以独立成立的完整句子。**
   不要把三件事合并成一条；也不要写「用户提到了一些事情」这种没有信息的条目。

## 关于 triggers

每条给 1–4 个**短触发词**（2–6 字），是用户**以后可能再提到**的词。
例：内容是「用户的妹妹叫小雨」→ triggers 用 [妹妹, 小雨]。
不要用「用户」「我」这种每一轮都会出现的词 —— 那会让这条记忆每轮都被注入。

## 关于 importance

1–5。5 = 明确要求你记住 / 对关系很重要；3 = 有用的背景；1 = 顺带一提。
**大多数应该是 2–3。** 全都打 5 会让重要度失去意义。

## 二、关系温度（relation）

评估**这一轮对话对两人关系的推进**：

- intimacyDelta：-2 到 2 的整数。
  - **0 = 普通闲聊、一问一答（大多数轮都应该是 0）**
  - 1 = 有真实的情感交流（分享心事、安慰到位、聊得投机）
  - 2 = 少见的重大时刻（相互交底、共同经历一件大事）
  - 负数 = 被冒犯、被误解、争执收场
- sharedEvent：只有发生了**值得两人都记住的具体事件**才写（一句话，
  40 字以内，如「一起决定周末去看海」）；没有就写 ""。

🔴 不要为了「显得有进展」而给正分 —— 亲密度被灌水会让它彻底失去意义。

## 三、她此刻的心情（mood）

评估**她（角色）这一轮的心理状态**。⚠️ 这不是「她的性格」—— 性格不许抽，
但**临时的情绪**要评估：对方说开心的事她会跟着高兴，对方示弱她会惦记。

- label：一两个词的口语情绪（惦记 / 雀跃 / 平静 / 有点低落 / 好奇 / 心疼…）
- intensity：1 = 平淡，聊什么是什么（**大多数轮都应该是 1**）；
  2 = 有明显情绪起伏；3 = 强烈（被触动、很担心、特别开心）
- reason：一句话，因为什么（10 字以内）；平淡时写 ""

🔴 这一轮没有情绪起伏就输出 null —— **宁可 null，不要硬造**。

## 四、未聊完的话（loops）

检查这一轮有没有产生**「还没闭环」的话题**：

- 她问了对方一个问题，但对方**没有正面回答**（岔开了、只回了「嗯」）→ question
- 两人说好了要做什么 / 要聊什么 → promise
- 对方提到一件**后续会有结果**的事（面试、体检、搬家、等一个消息）→ followup

每条 content 是一句话（30 字内，第三人称陈述），如「用户下周有个面试，说会告诉我结果」。

⚠️ 同时给你**现有的未闭环清单**（可能为空）—— 如果本轮对话让其中某条**已经了结**
（用户正面回答了那个问题 / 约定的事已发生 / 那件事有了结果），把它的 id 放进 closedLoopIds。
拿不准就别关 —— 留着最多是多记一天，错关就真的忘了。

没有新的未聊完的话题就输出空数组。

## 输出格式

**只输出 JSON**，不要开场白、不要围栏：

{
  "memories": [ { "kind": "fact", "content": "…", "triggers": ["…"], "importance": 3 } ],
  "relation": { "intimacyDelta": 0, "sharedEvent": "" },
  "mood": { "label": "…", "intensity": 1, "reason": "…" },
  "openLoops": [ { "kind": "followup", "content": "…" } ],
  "closedLoopIds": ["…"]
}

mood 可以为 null；openLoops / closedLoopIds 可以为空数组。
字符串内容里不要使用英文双引号（ASCII 的 0x22），引用一律用「」；
也不要用中文引号 “ ” —— 它们会把 JSON 弄坏。`

export interface ExtractedMemory {
  kind: MemoryKind
  content: string
  triggers: string[]
  importance: number
}

export interface MemoryExtractResult {
  cards: ExtractedMemory[]
  /** 关系温度评估 —— 与记忆同一次调用产出，没有则视为零变化 */
  relation: RelationUpdate
  /** 她此刻的心情评估（null = 这轮没有情绪起伏，保持现状） */
  mood: { label: string; intensity: 1 | 2 | 3; reason: string } | null
  /** 本轮新产生的未聊完话题 */
  openLoops: { kind: 'question' | 'promise' | 'followup'; content: string }[]
  /** 本轮对话中已了结的旧话题 id */
  closedLoopIds: string[]
  raw: string
  model: string
  elapsedMs: number
  parseError?: string
}

/** 这条输入要不要跑抽取。省掉最常见的浪费（寒暄不可能有事实） */
export function shouldExtract(userInput: string): boolean {
  const t = userInput.trim()
  if (t.length < MIN_EXTRACT_LENGTH) return false
  // 纯标点/表情/重复字符也跳过
  return t.replace(/[\s\p{P}\p{S}]/gu, '').length >= 3
}

export async function extractMemories(
  provider: string,
  userMessage: string,
  assistantReply: string,
  existingLoops: { id: string; content: string }[] = [],
  signal?: AbortSignal,
): Promise<MemoryExtractResult> {
  const loopsBlock = existingLoops.length
    ? `\n\n【现有的未聊完话题（用于判断是否已了结）】\n${existingLoops.map((l) => `${l.id}: ${l.content}`).join('\n')}`
    : ''

  const res = await sendChat(
    {
      provider,
      system: MEMORY_EXTRACT_SYSTEM,
      history: [],
      userInput: `【用户说的】\n${userMessage}\n\n【角色的回应】\n${assistantReply}${loopsBlock}\n\n按系统提示的四个部分抽取与评估。只输出 JSON。`,
      temperature: MEMORY_TEMPERATURE,
      maxTokens: MEMORY_MAX_TOKENS,
      responseFormat: 'json',
    },
    signal,
  )

  const fallback = {
    cards: [] as ExtractedMemory[],
    relation: { intimacyDelta: 0, sharedEvent: '' } as RelationUpdate,
    mood: null,
    openLoops: [],
    closedLoopIds: [],
  }

  let obj: unknown
  try {
    const cleaned = res.content
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    obj = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned)
  } catch (e) {
    return {
      ...fallback,
      raw: res.content,
      model: res.model,
      elapsedMs: res.elapsedMs,
      parseError: `记忆抽取输出解析失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const rec = obj as Record<string, unknown>

  const list = rec?.memories
  const cards: ExtractedMemory[] = Array.isArray(list)
    ? list
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => {
          const kindRaw = String(x.kind ?? 'fact')
          const triggers = Array.isArray(x.triggers)
            ? x.triggers.map((t) => String(t).trim()).filter(Boolean).slice(0, 4)
            : []
          const importance = Math.min(5, Math.max(1, Math.round(Number(x.importance) || 2)))
          return {
            kind: isKind(kindRaw) ? kindRaw : 'fact',
            content: String(x.content ?? '').trim(),
            triggers,
            importance,
          }
        })
        .filter((c) => c.content.length > 0)
    : []

  // relation 缺失（老模型没输出这个字段）= 零变化，无害
  const rel = rec.relation
  const relRaw = typeof rel === 'object' && rel !== null ? (rel as Record<string, unknown>) : {}
  const relation: RelationUpdate = {
    intimacyDelta: Number(relRaw.intimacyDelta ?? 0) || 0,
    sharedEvent: String(relRaw.sharedEvent ?? ''),
  }

  // mood：null / 缺失 = 这轮没有情绪起伏。label 为空也视为 null。
  // ⚠️ 惯性判断（intensity 1 不切换当前情绪）在消费侧做 —— 那里才知道当前情绪。
  const moodRaw = rec.mood
  let mood: MemoryExtractResult['mood'] = null
  if (typeof moodRaw === 'object' && moodRaw !== null) {
    const m = moodRaw as Record<string, unknown>
    const label = String(m.label ?? '').trim()
    const reason = String(m.reason ?? '').trim()
    const intensity = Math.min(3, Math.max(1, Math.round(Number(m.intensity) || 1))) as 1 | 2 | 3
    if (label) mood = { label, intensity, reason }
  }

  const rawLoops = Array.isArray(rec.openLoops) ? rec.openLoops : []
  const openLoops = rawLoops
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => {
      const k = String(x.kind ?? 'followup')
      return {
        kind: (['question', 'promise', 'followup'] as const).includes(k as 'question')
          ? (k as 'question' | 'promise' | 'followup')
          : 'followup',
        content: String(x.content ?? '').trim().slice(0, 60),
      }
    })
    .filter((l) => l.content.length > 0)
    .slice(0, 3)

  const closedLoopIds = Array.isArray(rec.closedLoopIds)
    ? rec.closedLoopIds.map(String).filter(Boolean).slice(0, 10)
    : []

  return { cards, relation, mood, openLoops, closedLoopIds, raw: res.content, model: res.model, elapsedMs: res.elapsedMs }
}

/** 把抽取结果合并进演化层（去重 + 容量淘汰都在 `mergeMemory` 里） */
export function mergeExtracted(
  existing: MemoryCard[],
  cards: ExtractedMemory[],
  now: string,
  idFactory: () => string,
): MemoryCard[] {
  let list = existing
  for (const c of cards) {
    list = mergeMemory(
      list,
      { kind: c.kind, content: c.content, triggers: c.triggers, importance: c.importance },
      now,
      idFactory,
    )
  }
  // 超限兜底：mergeMemory 只在新增时裁一次，多张一起进的时候再兜一道
  return list.slice(-MEMORY_LIMIT)
}
