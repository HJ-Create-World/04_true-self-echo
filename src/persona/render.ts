/**
 * 人格档案 → System Prompt 正文
 *
 * ⚠️ **本文件的输出形状是有实验依据的，不要随手改格式。**
 * E5 的 23/30 是在「五节结构 + 表格 + 可执行 + 约束条件」这个形状上拿到的
 * （`04_lab/phase1/E5-执行侧干预.md` §5.5）。改结构 = 换了一个未被验证的输入，
 * 分数不再可比。
 *
 * 依赖方向：本文件只读 schema.ts，不反向依赖。prompt.ts 拿到的是
 * 已经渲染好的纯文本（SystemPromptParts）。
 */

import { RED_LINES_HEAD, RED_LINE_TAIL_BODY } from '@/core/constraints'
import type { SystemPromptParts } from '@/core/prompt'
import type { Block, FrozenLayer, PersonaProfile } from './schema'

/** 小标题 + 若干行 —— 说话风格的通用块 */
function renderBlock(b: Block): string {
  if (b.lines.length === 0) return `### ${b.title}`
  return [`### ${b.title}`, '', ...b.lines].join('\n')
}

function renderCoreTraits(frozen: FrozenLayer): string {
  if (frozen.coreTraits.length === 0) return ''
  const parts = frozen.coreTraits.map((t, i) => {
    const head = `### 特质 ${i + 1}：${t.title}`
    const rows = [head, '', t.detail]
    if (t.executable) rows.push('', `**可执行**：${t.executable}`)
    return rows.join('\n')
  })
  return ['## 一、核心特质', '', parts.join('\n\n')].join('\n')
}

function renderIdentity(frozen: FrozenLayer): string {
  const { selfCall, callUser, relation } = frozen.identity
  if (!selfCall && !callUser && !relation) return ''
  return [
    '### 称呼与关系',
    '',
    `- 她如何称呼自己：${selfCall}`,
    `- 她怎么称呼对方：${callUser}`,
    `- 她如何定义自己与对方的关系：${relation}`,
  ].join('\n')
}

function renderStyle(frozen: FrozenLayer): string {
  const chunks = [
    renderIdentity(frozen),
    ...frozen.expressionDNA.map(renderBlock),
  ].filter(Boolean)

  if (frozen.boundaries.length > 0) {
    const list = frozen.boundaries.map((s, i) => `${i + 1}. ${s}`).join('\n')
    chunks.push(['### 她绝不会说什么', '', list].join('\n'))
  }

  if (chunks.length === 0) return ''
  return ['## 二、说话风格', '', chunks.join('\n\n')].join('\n')
}

function renderTensions(frozen: FrozenLayer): string {
  if (frozen.tensions.length === 0) return ''
  const parts = frozen.tensions.map((t, i) =>
    [
      `### 矛盾 ${i + 1}：${t.title}`,
      `- **表层**：${t.surface}`,
      `- **里层**：${t.inner}`,
      `- **统一点**：${t.unifier}`,
    ].join('\n'),
  )
  return ['## 三、内在矛盾', '', parts.join('\n\n')].join('\n')
}

function renderSocial(frozen: FrozenLayer): string {
  if (frozen.socialBehavior.length === 0) return ''
  const rows = frozen.socialBehavior.map((r) => `| ${r.scene} | ${r.reaction} |`)
  return [
    '## 四、情境反应模式',
    '',
    '| 情境 | 反应 |',
    '|---|---|',
    ...rows,
  ].join('\n')
}

function renderConstraints(frozen: FrozenLayer): string {
  if (frozen.constraints.length === 0) return ''
  const rows = frozen.constraints.map(
    (c, i) => `| ${i + 1} | ${c.forbidden} | ${c.alternative} |`,
  )
  const head = [
    '## 五、约束条件（禁止说出来）',
    '',
    '| # | 禁止直接说出 | 只允许的表达通道 |',
    '|---|---|---|',
    ...rows,
  ]
  if (frozen.mechanism) {
    // 逐行加 '>' —— mechanism 可能是一句，也可能是一句 + 一行强调
    const quoted = frozen.mechanism
      .split('\n')
      .map((line, i) => `> ${i === 0 ? '**核心机制**：' : ''}${line}`)
    head.push('', ...quoted)
  }
  return head.join('\n')
}

/**
 * 把 frozen 层渲染成 personaBody（System Prompt 的段 B）。
 *
 * ⚠️ `---` 分隔符不是装饰：E3 原文每一节之间都有，E5 的输入里也有。
 * 去掉它虽然不影响语义，但会改变输入形状 —— 而我们要的是「与 Phase 0
 * 手写素材可比」，所以形状逐字对齐，不做优化。
 * 只在**两侧都有内容**时插分隔符，避免空节留下孤立的 `---`。
 */
export function renderPersonaBody(frozen: FrozenLayer): string {
  return [
    renderCoreTraits(frozen),
    renderStyle(frozen),
    renderTensions(frozen),
    renderSocial(frozen),
    renderConstraints(frozen),
  ]
    .filter(Boolean)
    .join('\n\n---\n\n')
}

/**
 * 人格档案 → System Prompt 三段。
 *
 * 段 A / 段 D 是**产品级红线**（core/constraints.ts），与人格无关；
 * 段 D 前面拼上该人格的 tagline —— 这样重注入每轮都带着她的气质，
 * 同时保持 E5 验证过的「越重越轻。不追问，不长篇安慰。」这个形状。
 */
export function buildPromptParts(profile: PersonaProfile): SystemPromptParts {
  const tagline = profile.tagline.trim()
  return {
    constraintsHead: RED_LINES_HEAD,
    personaBody: renderPersonaBody(profile.frozen),
    constraintsTail: tagline ? `${tagline}。${RED_LINE_TAIL_BODY}` : RED_LINE_TAIL_BODY,
  }
}
