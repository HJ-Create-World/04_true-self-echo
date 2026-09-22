/**
 * 关系推进（Phase 3 遗留 · 2026-09-21 HJ 拍板方案）
 *
 * ## 机制：LLM 顺带评估，不加请求
 *
 * 每轮的记忆抽取调用（`@/memory/extract.ts`）本来就要跑一次 LLM，
 * 亲密度推进**搭这趟车**：抽取 prompt 顺带输出 `intimacyDelta` 与 `sharedEvent`。
 * 不发新请求、不加成本。
 *
 * ## 两条拍板的决定
 *
 * - **不衰减**（HJ 2026-09-21）：亲密度只反映「聊过的深度」的累积，
 *   没有「几天不聊就掉分」的定时逻辑；回滚机制已有，够兜底。
 * - **stage 是派生值**（代码推导，LLM 只给 delta）：
 *   让 LLM 自由填阶段名会得到「莫逆之交」「灵魂伴侣」这种不可 diff 的噪声，
 *   阶梯由 intimacy 区间映射，曲线与面板才有稳定的语义。
 *
 * ## 防灌水
 *
 * 限幅 ±2/轮 + prompt 明示「大多数轮应该是 0」。没有限幅的话，
 * 一个过于热情的模型能在 50 轮内把亲密度推满 —— 指标失效。
 */

import type { EvolvingLayer } from './evolving'

/** 关系阶段阶梯 —— floor 是进入该阶段的最低亲密度 */
export const STAGES: { name: string; floor: number }[] = [
  { name: '初识', floor: 0 },
  { name: '熟络', floor: 20 },
  { name: '常聊', floor: 40 },
  { name: '亲近', floor: 65 },
  { name: '知己', floor: 90 },
]

/** 由亲密度推导阶段。阶梯有序，从高往低找第一个够格的 floor */
export function stageOf(intimacy: number): string {
  let name = STAGES[0].name
  for (const s of STAGES) if (intimacy >= s.floor) name = s.name
  return name
}

/** 单轮变化限幅 —— LLM 给出离谱值也只影响这么多 */
export const INTIMACY_DELTA_LIMIT = 2

/** 共同经历容量 —— 与记忆卡片同理，无限增长会变噪声 */
export const SHARED_EVENTS_LIMIT = 20

/** 抽取侧给出的关系更新（LLM 输出经解析后的原始形态） */
export interface RelationUpdate {
  intimacyDelta: number
  /** 本轮值得两人都记住的具体事件；空 = 没有 */
  sharedEvent?: string
}

/**
 * 把一轮的关系更新应用进演化层，返回**新的**演化层。
 *
 * - delta 先取整再限幅（±2），intimacy 夹在 0–100
 * - stage 由 intimacy 重新推导（不信任外部输入的阶段名）
 * - sharedEvent：非空、去重、截断 60 字、总量限 20 条
 * - **什么都没变时返回原引用** —— 调用方靠引用相等跳过落库/快照
 */
export function applyRelationUpdate(ev: EvolvingLayer, u: RelationUpdate): EvolvingLayer {
  const d = Math.max(
    -INTIMACY_DELTA_LIMIT,
    Math.min(INTIMACY_DELTA_LIMIT, Math.round(u.intimacyDelta) || 0),
  )
  const intimacy = Math.max(0, Math.min(100, ev.relation.intimacy + d))
  const stage = stageOf(intimacy)

  const text = (u.sharedEvent ?? '').trim().slice(0, 60)
  const sharedEvents =
    text && !ev.relation.sharedEvents.includes(text)
      ? [...ev.relation.sharedEvents, text].slice(-SHARED_EVENTS_LIMIT)
      : ev.relation.sharedEvents

  if (intimacy === ev.relation.intimacy && sharedEvents === ev.relation.sharedEvents) return ev
  return { ...ev, relation: { stage, intimacy, sharedEvents } }
}
