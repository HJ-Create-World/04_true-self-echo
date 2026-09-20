/**
 * 人格档案数据结构（Phase 2 的 0 号任务）
 *
 * 依据：docs/03_specs/persona-schema.md §四。**只实现 frozen 层**，
 * evolving 层归 Phase 3（记忆与演化）——不要提前拉进来。
 *
 * ⚠️ 本文件是**类型的唯一出处**。渲染成 prompt 在 render.ts，
 * 存到哪在 storage/db.ts。这里只有形状，没有行为。
 *
 * 与 persona-schema.md §四 的实现口径差异（已在文档 §四之二 记录）：
 *   1. Trait / Tension 多一个 `title` —— 实测提取输出是「标题 + 内容」两段式，
 *      草案里只有内容容器，放不下标题。缺了标题，渲染回 markdown 时会丢层级
 *   2. Trait 多一个 `detail` —— 原文是「标题 + 说明 + 可执行」三段，
 *      草案只有 text/executable 两个容器
 *   3. FrozenLayer 多一个 `mechanism` —— 收束全篇的「核心机制」一句话，
 *      原文以结尾引用块的形式出现，不属于任何现有字段
 *   4. expressionDNA 用 `Block[]`（小标题 + 若干行）而非固定字段 ——
 *      说话风格天然是松散的，强行结构化只会逼模型注水（诊断文档 §四 1b）
 *   5. `decisionRules` 本期未实现 —— 实测素材里它稳定地与
 *      socialBehavior 重合，先不引入，避免两个容器抢同一份内容
 */

import type { EvolvingLayer } from './evolving'

/** 证据等级，三档必填（persona-schema §四 字段约束） */
export type EvidenceLevel = 'explicit' | 'implied' | 'extrapolated'

/**
 * 人格类型 —— 决定能否分享/导出（SPEC §十 第 12 条）。
 * Phase 2 只投虚拟角色，但字段现在就留，免得 Phase 2.5 改数据模型。
 */
export type PersonaKind = 'virtual' | 'self' | 'real'

export interface Trait {
  /** 特质的一句话命名 */
  title: string
  /** 展开说明：这个特质长什么样 */
  detail: string
  /** ⭐ 必须是「可被第三人照着执行的动作描述」，禁止「有韵律感」这类形容词 */
  executable: string
  evidenceLevel: EvidenceLevel
  /** 原文证据；证据不足时留空，**不编造** */
  evidence: string
}

export interface Tension {
  /** 矛盾的一句话命名，形如「理想主义 vs 现实认知」 */
  title: string
  /** 表面表现 */
  surface: string
  /** 内里实情 */
  inner: string
  /** ⭐ 统一点 —— 必须有，否则矛盾会变成随机行为抖动 */
  unifier: string
  evidenceLevel: EvidenceLevel
}

/** 一个带小标题的松散文本块：小标题 + 若干行 */
export interface Block {
  title: string
  lines: string[]
}

export interface Identity {
  /** 她如何称呼自己 */
  selfCall: string
  /** 她怎么称呼对方 */
  callUser: string
  /** 她如何定义自己与对方的关系 */
  relation: string
}

/** 情境 → 反应（SPEC §六「情境映射表」） */
export interface Rule {
  scene: string
  reaction: string
}

/** 约束型特征：不能说什么 + 只能走哪条通道说 */
export interface Constraint {
  forbidden: string
  alternative: string
}

export interface FrozenLayer {
  /** ⭐ 收束全篇的一句话：这个人的核心运作机制是什么 */
  mechanism: string
  coreTraits: Trait[]
  identity: Identity
  expressionDNA: Block[]
  socialBehavior: Rule[]
  /** 边界雷区 = 「她绝不会说什么」负面清单（诊断文档修正第 3 条） */
  boundaries: string[]
  tensions: Tension[]
  constraints: Constraint[]
}

/** 素材来源可信度（SPEC §六「素材来源标注」），比例之和应为 1 */
export interface SourceNote {
  verbatim: number
  artifact: number
  impression: number
  /** 素材的层级描述，如「双层：小说原文」 */
  level: string
}

/** Correction Log —— 只增不删（persona-schema §四 字段约束） */
export interface CorrectionEntry {
  at: string
  field: string
  from: string
  to: string
}

export interface PersonaProfile {
  id: string
  name: string
  /** 一句话气质，用于顶栏副标题，也用于拼 constraintsTail */
  tagline: string
  kind: PersonaKind
  version: string
  createdAt: string
  updatedAt: string
  source: SourceNote
  frozen: FrozenLayer
  /**
   * 演化层 —— 对用户的认知 / 关系状态 / 记忆卡片（Phase 3）。
   *
   * ⚠️ **它和 frozen 是两种东西，不要混**：
   * `frozen` 是「她是谁」（AI 不可修改），`evolving` 是「她知道什么」（累积、可回滚）。
   * 边界规则见 `SPEC.md` §四。
   */
  evolving: EvolvingLayer
  correctionLog: CorrectionEntry[]
}

/* ------------------------------------------------------------------ */
/* 工厂与校验                                                          */
/* ------------------------------------------------------------------ */

export function emptyIdentity(): Identity {
  return { selfCall: '', callUser: '', relation: '' }
}

export function emptyFrozen(): FrozenLayer {
  return {
    mechanism: '',
    coreTraits: [],
    identity: emptyIdentity(),
    expressionDNA: [],
    socialBehavior: [],
    boundaries: [],
    tensions: [],
    constraints: [],
  }
}

export function emptySource(): SourceNote {
  return { verbatim: 0, artifact: 0, impression: 0, level: '' }
}

/**
 * 结构完整性检查 —— `PLAN.md` Phase 2 验收标准②「四段结构完整」的判据。
 *
 * 「四段」= 核心特质 / 说话风格 / 内在矛盾 / 情境反应模式。
 * 返回缺了哪几段，空数组表示通过。
 */
export function checkCompleteness(frozen: FrozenLayer): string[] {
  const missing: string[] = []
  if (frozen.coreTraits.length === 0) missing.push('核心特质')
  if (frozen.expressionDNA.length === 0) missing.push('说话风格')
  if (frozen.tensions.length === 0) missing.push('内在矛盾')
  if (frozen.socialBehavior.length === 0) missing.push('情境反应模式')
  return missing
}

/** 三条软提示 —— 不阻断，但值得在 UI 上提醒（缺了会明显影响扮演质量） */
export function checkSoftWarnings(frozen: FrozenLayer): string[] {
  const warns: string[] = []
  if (frozen.boundaries.length === 0) warns.push('缺「她绝不会说什么」负面清单')
  if (frozen.constraints.length === 0) warns.push('缺「禁止直接说出」的约束条件')
  if (frozen.tensions.some((t) => !t.unifier.trim())) warns.push('有矛盾缺「统一点」')
  if (frozen.coreTraits.some((t) => !t.executable.trim())) warns.push('有特质缺「可执行」描述')
  return warns
}
