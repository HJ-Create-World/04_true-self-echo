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

import {
  MEMORY_KIND_LABEL,
  type LoopItem,
  type MemoryCard,
  type MemorySelection,
  type Mood,
  type RelationState,
} from '@/persona/evolving'
import { RELATION_STAGE_NOTE } from '@/core/constraints'

/** 单条卡片的行格式：`- 类型：内容` */
function renderCard(m: MemoryCard): string {
  const kind = MEMORY_KIND_LABEL[m.kind] ?? m.kind
  return `- ${kind}：${m.content}`
}

/**
 * 关系状态行 —— 有内容时恒定出现在记忆区头部。
 *
 * 🔴 这是「从陌生到熟悉」驱动行为的关键（2026-09-29 修复）：
 * 亲密度一直在算，但从不进 prompt，模型对「我们才刚认识」毫无感知。
 * 空记忆时区块只有这一行 —— 它是真实内容，不违反「空区块不出现」的约定。
 */
function renderRelationLine(rel: RelationState): string {
  const note = RELATION_STAGE_NOTE[rel.stage]
  if (!note) return ''
  return [`**你们目前的关系**：${rel.stage}（亲密度 ${rel.intimacy}/100）`, '', note, ''].join('\n')
}

/**
 * 心情行 —— 情绪要「自然融进语气」而不是被宣布。
 * 惯性判断在消费侧（chat store），这里只负责渲染当前状态。
 */
function renderMoodLine(mood: Mood | undefined): string {
  if (!mood?.label) return ''
  return [
    `**你现在的心情**：${mood.label}（因为${mood.reason || '说不上来的什么'}）。`,
    '让这个心情自然地融进接下来要说的话里 —— 不用宣布它，也别假装没有。',
    '',
  ].join('\n')
}

/**
 * 未聊完的话题 —— 只注入 open 且没被主动提过的前 3 条。
 * closed 的不注入；已在主动消息里提过的（raisedCount ≥ 1）不再进常规注入
 * （防止她反复念叨同一件事 —— 翻旧账是人机感的重灾区）。
 */
function renderLoopsBlock(loops: LoopItem[] | undefined): string {
  const open = (loops ?? []).filter((l) => !l.closed && l.raisedCount === 0).slice(0, 3)
  if (open.length === 0) return ''
  const lines = open.map((l) => {
    const kindLabel =
      l.kind === 'question'
        ? '你问过、TA 还没正面回答'
        : l.kind === 'promise'
          ? '你们说好的'
          : 'TA 提过、会有后续的'
    return `- ${kindLabel}：${l.content}`
  })
  return [
    '**还没聊完的话**（合适的时候自然提起，别一次全倒出来）：',
    '',
    ...lines,
    '',
  ].join('\n')
}

/**
 * 渲染记忆区。
 *
 * 去重是必须的：常驻区与触发区**可能选中同一张卡片**
 * （一张重要度高的卡片既进常驻又命中关键词），重复注入只会浪费上下文、
 * 还会让模型以为这事特别重要。
 */
export function renderMemoryBlock(
  sel: MemorySelection,
  relation?: RelationState,
  extra?: { mood?: Mood; loops?: LoopItem[] },
): string {
  const merged: MemoryCard[] = []
  const seen = new Set<string>()
  for (const m of [...sel.pinned, ...sel.triggered]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    merged.push(m)
  }

  const relationPart = relation ? renderRelationLine(relation) : ''
  const moodPart = extra ? renderMoodLine(extra.mood) : ''
  const loopsPart = extra ? renderLoopsBlock(extra.loops) : ''
  if (merged.length === 0 && !relationPart && !moodPart && !loopsPart) return ''

  const cardPart =
    merged.length > 0
      ? [
          '',
          '以下是你在之前的对话中记住的。可以在相关的时候自然提起，',
          '但**不要为了显示自己记得而硬塞**，也不要一次全部罗列出来。',
          '',
          ...merged.map(renderCard),
        ]
      : []

  return [
    '## 关于对方与你们的关系',
    '',
    relationPart,
    moodPart,
    loopsPart,
    ...cardPart,
  ]
    .filter(Boolean)
    .join('\n')
}
