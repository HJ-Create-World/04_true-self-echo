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

export const MEMORY_EXTRACT_SYSTEM = `你的任务：从这一轮对话里，找出**值得长期记住的、关于对方的新信息**。

你要为一个「记住用户」的功能供料。抽出来的每一条，将来会被做成卡片，
在以后的对话里注入给另一个模型。

## 抽什么（只抽这五类，都是**关于对方或两人关系**的）

- fact 事实：身份、职业、家人、住的地方、在忙什么（「用户是程序员」）
- preference 偏好：喜欢什么、讨厌什么、希望怎么被对待（「用户希望回答简短」）
- relation 关系：两人之间确认过的事（「用户说过我们是朋友」）
- event 事件：发生过的具体事（「用户的猫上周生病了」）
- promise 约定：说好要做的事（「用户答应周末试试我给的建议」）

## 🔴 三条硬规则

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

## 输出格式

**只输出 JSON**，不要开场白、不要围栏：

{ "memories": [ { "kind": "fact", "content": "…", "triggers": ["…"], "importance": 3 } ] }

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
  signal?: AbortSignal,
): Promise<MemoryExtractResult> {
  const res = await sendChat(
    {
      provider,
      system: MEMORY_EXTRACT_SYSTEM,
      history: [],
      userInput: `【用户说的】\n${userMessage}\n\n【角色的回应】\n${assistantReply}\n\n从这一轮里抽出值得长期记住的、关于对方的信息。只输出 JSON。`,
      temperature: MEMORY_TEMPERATURE,
      maxTokens: MEMORY_MAX_TOKENS,
      responseFormat: 'json',
    },
    signal,
  )

  let obj: unknown
  try {
    const cleaned = res.content
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    obj = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned)
  } catch (e) {
    return {
      cards: [],
      raw: res.content,
      model: res.model,
      elapsedMs: res.elapsedMs,
      parseError: `记忆抽取输出解析失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const list = (obj as { memories?: unknown })?.memories
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

  return { cards, raw: res.content, model: res.model, elapsedMs: res.elapsedMs }
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
