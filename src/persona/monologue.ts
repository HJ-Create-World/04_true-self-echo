/**
 * 内心独白 —— SPEC §九 的第四个面板
 *
 * 「它此刻的情绪 / 想法」
 *
 * ## 三个设计决定
 *
 * **1. 按需生成，不随轮次自动跑。**
 * 每轮都多调一次 LLM 是纯浪费 —— 用户不一定每次都想看。
 * 做成按钮触发，成本只在用户真想看时发生。
 *
 * **2. 不落库、不进对话历史。**
 * 独白是**她没说出口的话**，写进对话记录等于角色「说」了出来 ——
 * 那既破坏人设（她的约束是深的信息走意象通道，不直陈），
 * 也会污染上下文（下一轮模型会以为自己说过这些）。
 * 所以它是**即抛即用的展示品**，刷新即消失。
 *
 * **3. 用**扮演用的同一个档案与三明治结构**，只换最后一句指令。**
 * 这样独白的语气与对话里的她一致 —— 否则面板上会出现
 * 「一个会写散文的陌生人」。
 */

import { sendChat } from '@/api/chat'
import { buildMessages } from '@/core/prompt'
import type { SystemPromptParts } from '@/core/prompt'

export const MONOLOGUE_TEMPERATURE = 0.9
export const MONOLOGUE_MAX_TOKENS = 512

/**
 * 独白指令。
 *
 * ⚠️ 追加在用户消息位，**不是**改写 system —— 这样三明治结构与
 * 执行侧干预的重注入机制都原样保留，独白时的她与对话时的她是同一个。
 */
export function buildMonologueInput(): string {
  return [
    '（现在不要回复我。）',
    '',
    '请以她的身份，写一段**此刻的内心独白** —— 她心里在想、但不会说出口的话。',
    '',
    '要求：',
    '- 第一人称，就是她本人',
    '- 60 字以内',
    '- 保持她说话的质感（语气词、意象、节奏都照旧）',
    '- **这是她没说出口的部分**：可以更直接一点，但仍不许直接陈述设定里的禁项',
    '- 不要解释自己在做什么，也不要总结',
  ].join('\n')
}

export interface MonologueResult {
  text: string
  model: string
  elapsedMs: number
}

export async function generateMonologue(
  parts: SystemPromptParts,
  history: readonly { role: 'user' | 'assistant'; content: string }[],
  provider: string,
  signal?: AbortSignal,
): Promise<MonologueResult> {
  const wire = buildMessages(parts, history.slice(-4), buildMonologueInput())

  const res = await sendChat(
    {
      provider,
      system: wire[0].content,
      history: wire.slice(1, -1) as { role: 'user' | 'assistant'; content: string }[],
      userInput: wire[wire.length - 1].content,
      temperature: MONOLOGUE_TEMPERATURE,
      maxTokens: MONOLOGUE_MAX_TOKENS,
    },
    signal,
  )

  return {
    text: res.content.trim(),
    model: res.model,
    elapsedMs: res.elapsedMs,
  }
}
