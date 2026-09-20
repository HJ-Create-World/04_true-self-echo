/**
 * 执行侧干预：消息组装器
 * 依据：docs/03_specs/execution-control.md §2、§3
 *
 * ⚠️ 四条顺序约束（不可违反）
 *   ① constraintsHead 必须在 system **最开头**
 *   ② constraintsTail 必须在 system **最末尾**
 *   ③ reminder 必须在**最后一条 user 消息的前缀**（不是额外插一条消息）
 *   ④ reminder 与 constraintsTail **共用同一份文本**（单一信息源）
 *
 * 配置 B 已由 E5 实验定版（23/30，闭环线 24）。成对示例(fewshot)实测 −6 分，不上。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 非 system 的消息：发给上游 history 时用这个类型，避免把 system 混进去 */
export interface TurnMessage {
  role: 'user' | 'assistant'
  content: string
}

/** system 的三段结构（§2.1）。Phase 3 起多一个可选的**记忆区** */
export interface SystemPromptParts {
  /** 硬约束，≤120 字，放最顶 */
  constraintsHead: string
  /** 人格档案正文 */
  personaBody: string
  /**
   * 记忆区（可选，Phase 3）—— 关于对方的事，来自过往对话。
   *
   * ⚠️ **位置是被刻意选定的，不要挪**：
   * 拼接顺序是 [头, 人格正文, **记忆区**, 尾]。
   * E5 验证过的是「约束头在最顶 / 约束尾在最末」这两条不变量，
   * 记忆区塞在人格正文**里面**（作为它的一部分）可以同时保住这两条；
   * 如果单独成段插在头和尾之间，虽然形式上也满足，但会让「三明治」
   * 变成「四明治」，属于换了一个未被验证的输入形状。
   *
   * 另外它是 `可选` 的：没有记忆（新人格 / 空演化层）时必须完全不出现，
   * 连标题都不能有 —— 否则模型会对着一个空区块编内容。
   */
  memoryBlock?: string
  /** 收束约束，≤40 字，放最末；与 reminder 同源 */
  constraintsTail: string
}

/** 重注入载荷（§2.2） */
export interface ReinjectionPayload {
  /** ≤40 字，与 constraintsTail 共用同一份文本 */
  reminder: string
  /** ⚠️ 用户输入**不得改写**，原样传下去 */
  userInput: string
}

/**
 * 组装 system。
 * 拼接顺序是唯一真理来源，不要在任何地方另拼一份。
 *
 * 记忆区（可选）**算作人格正文的一部分**：它插在正文之后、约束尾之前，
 * 从而保住「头在最顶 / 尾在最末」这两条 E5 验证过的不变量。
 * 空字符串会被滤掉，所以没有记忆时区块完全不存在。
 */
export function buildSystemPrompt(parts: SystemPromptParts): string {
  return [parts.constraintsHead, parts.personaBody, parts.memoryBlock, parts.constraintsTail]
    .map((s) => s?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
}

/**
 * 组装 reminder —— 与 constraintsTail 同源。
 * §3.1：**缓存它，不要每轮重算**（同一个人格在整个会话里只有一份 reminder）。
 */
export function buildReminder(persona: Pick<SystemPromptParts, 'constraintsTail'>): string {
  return persona.constraintsTail.trim()
}

/**
 * 组装完整消息数组（§3.2）。
 *
 * 顺序：system → history → 带 reminder 前缀的 user
 * 注意约束③：reminder 是**前缀**，不是新增消息；约束④：内容与 tail 完全一致。
 *
 * 返回类型是元组：[system, ...history, user]，让调用方能直接按位置取。
 */
export type WireMessages = [ChatMessage, ...ChatMessage[], ChatMessage]

export function buildMessages(
  persona: SystemPromptParts,
  history: readonly ChatMessage[],
  userInput: string,
): WireMessages {
  const payload = buildReinjection(persona, userInput)
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(persona) },
  ]
  for (const m of history) {
    if (m.role !== 'system') messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: `${payload.reminder}\n\n${payload.userInput}` })
  return messages as WireMessages
}

/** 生成重注入载荷：只加前缀，不改用户一个字。 */
export function buildReinjection(
  persona: Pick<SystemPromptParts, 'constraintsTail'>,
  userInput: string,
): ReinjectionPayload {
  return { reminder: buildReminder(persona), userInput }
}

/**
 * 历史超窗口截断（§4.3）。
 * 规则：只截**最旧**的轮次，**永不截断 system**。
 * 这里按「轮」截（一问一答为一轮），保留最近的 keepRounds 轮。
 */
export function trimHistory(
  history: readonly ChatMessage[],
  keepRounds: number,
): TurnMessage[] {
  const usable: TurnMessage[] = history
    .filter((m): m is TurnMessage => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  if (keepRounds <= 0) return []

  // 从尾部倒着数 keepRounds 个 user，其位置即为截断点
  let seen = 0
  for (let i = usable.length - 1; i >= 0; i--) {
    if (usable[i].role === 'user') {
      seen += 1
      if (seen > keepRounds) return usable.slice(i + 1)
    }
  }
  return usable
}

/** 阶段 B：跨轮态的内部状态（phase-2 引入，这里先留出形状） */
export interface RuntimeState {
  /** 当前情绪主题，影响 UI 柔光色域 */
  mood?: string
  /** 本轮生成是否退化（已重试仍退化则保留标注） */
  degraded?: boolean
}
