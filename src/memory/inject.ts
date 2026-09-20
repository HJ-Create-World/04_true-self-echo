/**
 * 把选出的记忆卡片渲染成 System Prompt 里的记忆区。
 *
 * ⚠️ 语气是给**角色**看的（「对方」「你在过往对话中记住的」），
 * 不是给用户看的 —— 这段文本会进 System Prompt。
 *
 * ⚠️ **空的时候必须返回空字符串**：`buildSystemPrompt` 会滤掉空段，
 * 所以没有记忆时区块完全不存在。绝不能返回一个带标题的空区块 ——
 * 那会诱导模型对着「什么都没有的记忆」编内容。
 */

import { MEMORY_KIND_LABEL, type MemoryCard, type MemorySelection } from '@/persona/evolving'

/** 单条卡片的行格式：`- 类型：内容` */
function renderCard(m: MemoryCard): string {
  const kind = MEMORY_KIND_LABEL[m.kind] ?? m.kind
  return `- ${kind}：${m.content}`
}

/**
 * 渲染记忆区。
 *
 * 去重是必须的：常驻区与触发区**可能选中同一张卡片**
 * （一张重要度高的卡片既进常驻又命中关键词），重复注入只会浪费上下文、
 * 还会让模型以为这事特别重要。
 */
export function renderMemoryBlock(sel: MemorySelection): string {
  const merged: MemoryCard[] = []
  const seen = new Set<string>()
  for (const m of [...sel.pinned, ...sel.triggered]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    merged.push(m)
  }

  if (merged.length === 0) return ''

  return [
    '## 关于对方的事（来自过往对话）',
    '',
    '以下是你在之前的对话中记住的。可以在相关的时候自然提起，',
    '但**不要为了显示自己记得而硬塞**，也不要一次全部罗列出来。',
    '',
    ...merged.map(renderCard),
  ].join('\n')
}
