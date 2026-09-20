/**
 * 手动微调的字段规格
 *
 * 把「哪一段有哪些字段」从组件里抽出来，因为有三方要共用同一份定义：
 *   ① 编辑器 UI（渲染输入框）
 *   ② 新建空条目（`blank` 的键必须与 fields 对齐，否则新加的条目缺字段）
 *   ③ 完整性校验（`persona/schema.ts` 的 checkCompleteness）
 *
 * ⚠️ 与 `persona/schema.ts` 的字段名**必须一致**。改一边就要改另一边 ——
 * TS 会在 `DraftEditor` 的赋值处报错，不要用 `as` 绕过。
 */

export type FieldType = 'text' | 'textarea' | 'lines' | 'select'

export interface FieldSpec {
  key: string
  label: string
  type: FieldType
  hint?: string
  /** 仅 type === 'select' 时使用 */
  options?: { value: string; label: string }[]
}

/** 证据等级三档 —— 与 `persona/schema.ts` 的 EvidenceLevel 对应 */
export const LEVEL_OPTIONS = [
  { value: 'explicit', label: '素材明示' },
  { value: 'implied', label: '素材暗示' },
  { value: 'extrapolated', label: '我的外推' },
]

export const TRAIT_FIELDS: FieldSpec[] = [
  { key: 'title', label: '命名', type: 'text' },
  { key: 'detail', label: '说明', type: 'textarea' },
  {
    key: 'executable',
    label: '可执行',
    type: 'textarea',
    hint: '必须是「可被第三人照着执行的动作描述」。形容词不算',
  },
  { key: 'evidenceLevel', label: '证据等级', type: 'select', options: LEVEL_OPTIONS },
  {
    key: 'evidence',
    label: '原文证据',
    type: 'textarea',
    hint: '素材里的逐字原文。没有把握就留空 —— 不要编',
  },
]

export const TENSION_FIELDS: FieldSpec[] = [
  { key: 'title', label: '命名', type: 'text', hint: '形如「理想主义 vs 现实认知」' },
  { key: 'surface', label: '表层', type: 'textarea' },
  { key: 'inner', label: '里层', type: 'textarea' },
  {
    key: 'unifier',
    label: '统一点',
    type: 'textarea',
    hint: '必须有。填不出来说明这条不是稳定特征，应该删掉整组',
  },
  { key: 'evidenceLevel', label: '证据等级', type: 'select', options: LEVEL_OPTIONS },
]

export const SOCIAL_FIELDS: FieldSpec[] = [
  { key: 'scene', label: '情境', type: 'text' },
  { key: 'reaction', label: '反应', type: 'textarea', hint: '要具体到可执行' },
]

export const BLOCK_FIELDS: FieldSpec[] = [
  { key: 'title', label: '小标题', type: 'text' },
  { key: 'lines', label: '内容行', type: 'lines', hint: '一行一条。表格与代码块也可以直接照写' },
]

export const CONSTRAINT_FIELDS: FieldSpec[] = [
  { key: 'forbidden', label: '禁止直接说出', type: 'textarea' },
  { key: 'alternative', label: '只允许的表达通道', type: 'textarea' },
]

/** 新建条目用的空模板 —— 键必须与对应 fields 一一对齐 */
export const BLANKS = {
  trait: {
    title: '',
    detail: '',
    executable: '',
    evidenceLevel: 'extrapolated',
    evidence: '',
  },
  tension: {
    title: '',
    surface: '',
    inner: '',
    unifier: '',
    evidenceLevel: 'extrapolated',
  },
  social: { scene: '', reaction: '' },
  block: { title: '', lines: [] },
  constraint: { forbidden: '', alternative: '' },
} as const
