/**
 * 连发消息（消息爆发）—— 单次生成 → 多条 IM 消息
 *
 * 用户反馈（2026-09-29）：一人一句太机械，真人聊天是连发几条短消息
 * （「hi~」「你今天过的好吗」「有没有什么有意思的事情」）。
 *
 * ## 方案（业界验证过的唯一合理路径）
 *
 * **单次调用 + 空行分隔 + 前端拆条**（SillyTavern MessageQueue 同思路，
 * 分隔符选空行而不是 `|||` —— 空行本来就是 IM 的分段习惯，模型遵循度更高）。
 * 多次调用成本 ×N，JSON 结构化输出解析更脆，都不如它。
 *
 * ## 两条铁律
 *
 * 1. **内容永不丢**：拆条数超上限时，多余的合并回最后一条，绝不截断。
 * 2. **无空行 = 单条**：模型没按约定输出时自然退化为现状，一个字都不变。
 */

/** 单次生成最多拆成几条 —— 真人也很少连发超过这个数（防爆输出兜底） */
export const MAX_BURST = 6

/**
 * 按空行拆成多条消息。
 *
 * - 全文无空行 → 返回 [全文]，调用方行为与拆分前完全一致（天然容错）
 * - 空段（只有空白的行）被丢弃 —— 模型有时会在结尾多敲一个空行
 * - 超过 MAX_BURST 时，多余部分用空行重新拼回最后一条（内容不丢）
 */
export function splitBurst(text: string): string[] {
  const parts = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length <= 1) return parts

  if (parts.length <= MAX_BURST) return parts

  const head = parts.slice(0, MAX_BURST - 1)
  const rest = parts.slice(MAX_BURST - 1).join('\n\n')
  return [...head, rest]
}

/** 逐条显示延迟的形态参数（真人打字节奏的近似） */
const DELAY_BASE_MS = 600
const DELAY_PER_CHAR_MS = 40
const DELAY_MAX_MS = 3200

/**
 * 一条消息「打出来」需要的时间。
 * 基础 0.6s + 每字 40ms，封顶 3.2s —— 短消息轻快、长段落明显变慢，
 * 和真人打字的感觉一致。第一条不延迟（生成等待本身已经够久了）。
 */
export function burstDelay(content: string): number {
  return Math.min(DELAY_BASE_MS + content.length * DELAY_PER_CHAR_MS, DELAY_MAX_MS)
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    }, { once: true })
  })
}

/* ------------------------------------------------------------------ */
/* 内心独白（〔心想〕行）—— 主调用内联输出，零额外成本                    */
/* ------------------------------------------------------------------ */

/** 独白行的前缀标记 —— 与 DIALOGUE_STYLE 第六条约定保持一致 */
const MONOLOGUE_RE = /(?:^|\n)\s*〔心想〕\s*([^\n]+)\n?/

/**
 * 从生成内容里剥出独白行。
 *
 * 🔴 **无论显示开关开不开都必须剥**：独白是「说出口之前的心声」，
 * 留在 content 里会落库、会进下一轮历史 —— 模型会看到自己上轮的
 * 「对方看不见的内心话」，出戏还费 token。
 *
 * 无独白时返回原内容（零损耗路径）。
 */
export function extractMonologue(content: string): { monologue: string; rest: string } {
  const m = content.match(MONOLOGUE_RE)
  if (!m) return { monologue: '', rest: content }
  return { monologue: m[1].trim(), rest: content.replace(MONOLOGUE_RE, '\n').trim() }
}
