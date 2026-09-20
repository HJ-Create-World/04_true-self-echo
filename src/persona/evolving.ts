/**
 * 演化层 · 对用户的认知 / 关系状态 / 记忆卡片
 *
 * 依据：
 *   · `docs/01_product/SPEC.md` §四「演化层包含什么」+ §四「边界划分」
 *   · `docs/02_decisions/D004-记忆方案.md`（结构化卡片 + 关键词触发，不用向量）
 *   · `docs/03_specs/persona-schema.md` §2.2（冻结/演化二分）
 *
 * ## 🔴 一条硬约束：演化层**不能改写冻结层**
 *
 * SPEC §四 的表里写着冻结层「AI 不可修改」。所以「人格演化」这件事
 * **只能发生在演化层** —— 冻结层存的是「她是谁」，一个靠聊天就漂移的人格
 * 不是「演化」，是「人设崩塌」。
 *
 * 落实方式：
 *   1. 本文件里的任何函数都不接收、也不返回 `FrozenLayer`
 *   2. 快照里存 `frozenHash` —— 它本该恒定不变，一旦变了说明有人改了档案
 *      （那是用户在编辑器里改的，不是 AI 改的），曲线会把它标出来
 *
 * ## 边界规则（SPEC §四）
 *
 *   冻结层管「**怎么说**」（风格、价值观、基调）
 *   演化层管「**知道什么**」（事实、关系、偏好）
 *
 * 推论：一段对话里能进演化层的东西，必须是**关于对方或关系的新信息**；
 * 任何关于「她怎么说话」的改变都该被拒绝。
 */

/** 记忆类型 —— 分类型是为了让「记忆面板」能分组显示，也为了注入时取舍 */
export type MemoryKind = 'fact' | 'preference' | 'relation' | 'event' | 'promise'

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  fact: '事实',
  preference: '偏好',
  relation: '关系',
  event: '事件',
  promise: '约定',
}

/**
 * 记忆卡片。字段照 D004 定的五要素：**类型 / 内容 / 触发词 / 时间 / 重要度**。
 */
export interface MemoryCard {
  id: string
  kind: MemoryKind
  /** 一句话内容，用第三人称陈述（便于注入时拼进「你知道的事」区块） */
  content: string
  /** 触发词 —— 命中才注入（D004 的关键词触发） */
  triggers: string[]
  /** 1–5。注入时排序、超限时淘汰，都看它 */
  importance: number
  createdAt: string
  /** 最近一次被注入的时间 —— 淘汰用「重要度 + 最近使用」双因子（D004） */
  lastUsedAt: string
  /** 命中过几次，用来观察「这条记忆到底有没有用」 */
  hitCount: number
}

/** 对用户的认知。用 key-value 而不是自由文本：好 diff、好去重、好画面板 */
export interface UserFact {
  key: string
  value: string
  updatedAt: string
}

/** 关系状态 */
export interface RelationState {
  /** 关系阶段（人话，如「初识」「常聊」） */
  stage: string
  /** 0–100。由对话累积推进，用于曲线 */
  intimacy: number
  /** 共同经历（简短条目，不进 prompt 的可以只作展示） */
  sharedEvents: string[]
}

export interface EvolvingLayer {
  userModel: UserFact[]
  relation: RelationState
  memories: MemoryCard[]
}

/* ------------------------------------------------------------------ */
/* 工厂与容量控制                                                      */
/* ------------------------------------------------------------------ */

export function emptyEvolving(): EvolvingLayer {
  return {
    userModel: [],
    relation: { stage: '初识', intimacy: 0, sharedEvents: [] },
    memories: [],
  }
}

/**
 * 记忆容量上限。
 *
 * ⚠️ 为什么必须有上限（D004「容量控制」）：每轮都可能新增卡片，
 * 没有上限的话，聊一百轮之后注入区会被噪声塞满，而且成本线性上涨。
 */
export const MEMORY_LIMIT = 120

/** 常驻注入条数（见 `selectMemories` 的两级注入说明） */
export const PINNED_COUNT = 5

/** 触发注入条数上限 —— 避免一次命中几十条挤占上下文 */
export const TRIGGERED_COUNT = 8

/** 规范化后的内容，用于去重 */
function norm(text: string): string {
  return text.replace(/[\s，。、,.!！？?「」【】]/g, '').toLowerCase()
}

/**
 * 合并一条新记忆。
 *
 * ⚠️ **去重不能省**：抽取是每轮跑一次的，同一件事会被反复抽出来
 * （「用户是程序员」这种稳定事实尤其明显）。不去重的话，
 * 十轮之后同一句话会有十张卡，注入区全被它占满。
 *
 * 去重键用**规范化后的内容**，不用触发词 —— 触发词是辅助字段，可能变。
 * 命中已有卡片时：提升重要度、补触发词、刷新时间。
 */
export function mergeMemory(
  list: MemoryCard[],
  incoming: Omit<MemoryCard, 'id' | 'createdAt' | 'lastUsedAt' | 'hitCount'>,
  now: string,
  idFactory: () => string,
): MemoryCard[] {
  const key = norm(incoming.content)
  const existing = list.find((m) => norm(m.content) === key)
  if (existing) {
    return list.map((m) =>
      m === existing
        ? {
            ...m,
            importance: Math.max(m.importance, incoming.importance),
            triggers: Array.from(new Set([...m.triggers, ...incoming.triggers])).slice(0, 12),
            lastUsedAt: now,
          }
        : m,
    )
  }

  const card: MemoryCard = {
    ...incoming,
    id: idFactory(),
    createdAt: now,
    lastUsedAt: now,
    hitCount: 0,
  }
  return pruneMemories([...list, card])
}

/**
 * 超限淘汰：**重要度优先，同重要度看最近使用**（D004）。
 *
 * 平手时用 `lastUsedAt` 而不是 `createdAt` —— 一条三个月前建立、
 * 但昨天还被用上的记忆，比一条上周建立、从没被用上的更有价值。
 */
export function pruneMemories(list: MemoryCard[]): MemoryCard[] {
  if (list.length <= MEMORY_LIMIT) return list
  return [...list]
    .sort((a, b) => b.importance - a.importance || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, MEMORY_LIMIT)
}

/* ------------------------------------------------------------------ */
/* 检索与注入                                                          */
/* ------------------------------------------------------------------ */

export interface MemorySelection {
  /** 常驻：高重要度 + 最近新增，**无条件注入** */
  pinned: MemoryCard[]
  /** 触发：关键词命中本轮输入 */
  triggered: MemoryCard[]
}

/**
 * ⭐ 两级注入 —— 这是对 D004「纯关键词触发」的一处**必要补强**。
 *
 * 纯关键词触发有个会直接让功能不成立的漏洞：
 *   第 1 轮用户说「我妹妹叫小雨」→ 生成卡片，触发词 `["妹妹","小雨"]`
 *   第 2 轮用户说「她最近怎么样」→ **一个触发词都没命中** → 记忆没被注入
 *   → 而 Phase 3 完成标准①恰恰是「对话里说的信息**下一轮**被用上」
 *
 * 也就是说：**纯触发式注入在「刚说完的下一轮」最容易失败**，
 * 而那正是最该记住的时候。
 *
 * 所以改成两级：
 *   · **常驻区**：重要度最高的 + 最近新增的若干条，永远注入。保证「刚说的」在。
 *   · **触发区**：关键词命中的，补上「很久以前说过、现在又被提到」的情况。
 *
 * 代价是常驻区占了固定的一点上下文 —— 5 条卡片约 100 字，可以忽略。
 */
export function selectMemories(memories: MemoryCard[], userInput: string): MemorySelection {
  const pinned = [...memories]
    .sort((a, b) => b.importance - a.importance || b.createdAt.localeCompare(a.createdAt))
    .slice(0, PINNED_COUNT)

  const pinnedIds = new Set(pinned.map((m) => m.id))
  const text = userInput.toLowerCase()

  const triggered = memories
    .filter((m) => !pinnedIds.has(m.id))
    .map((m) => {
      // 命中数用于排序：命中越多说明触发词写得越准
      const hits = m.triggers.filter((t) => t && text.includes(t.toLowerCase())).length
      return { card: m, hits }
    })
    .filter((x) => x.hits > 0)
    .sort(
      (a, b) =>
        b.hits - a.hits ||
        b.card.importance - a.card.importance ||
        b.card.lastUsedAt.localeCompare(a.card.lastUsedAt),
    )
    .slice(0, TRIGGERED_COUNT)
    .map((x) => x.card)

  return { pinned, triggered }
}

/* ------------------------------------------------------------------ */
/* 曲线指标（供「变化曲线」面板用）                                     */
/* ------------------------------------------------------------------ */

export interface EvolutionMetrics {
  memoryCount: number
  userFactCount: number
  intimacy: number
  /** 按类型拆分的记忆条数 —— 曲线可以分线画 */
  byKind: Record<MemoryKind, number>
}

/**
 * 从演化层算出可画曲线的标量。
 *
 * ⚠️ **不把这些指标存进快照** —— 快照存完整演化层，指标现算。
 * 存两份数据就有不一致的可能，而且改口径时要迁移历史数据。
 */
export function metricsOf(ev: EvolvingLayer): EvolutionMetrics {
  const byKind = { fact: 0, preference: 0, relation: 0, event: 0, promise: 0 } as Record<
    MemoryKind,
    number
  >
  for (const m of ev.memories) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1
  return {
    memoryCount: ev.memories.length,
    userFactCount: ev.userModel.length,
    intimacy: ev.relation.intimacy,
    byKind,
  }
}

/**
 * 冻结层的指纹 —— 用于检测「人设是否被改动过」。
 *
 * 它本该**恒定不变**（冻结层 AI 不可修改）。一旦曲线上的点变了，
 * 说明是人在编辑器里改了档案 —— 这是合法操作，但需要被标出来，
 * 否则「人格漂移」和「我改了人设」会被混为一谈。
 *
 * 用简单的字符串哈希：这里只需要「变了没有」，不需要抗碰撞。
 */
export function frozenHash(frozenJson: string): string {
  let h = 5381
  for (let i = 0; i < frozenJson.length; i++) {
    h = ((h << 5) + h + frozenJson.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}
