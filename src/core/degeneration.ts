/**
 * 输出退化检测（execution-control.md §4.2）
 * 直接从 exp/e5_degen.py 移植，参数与判据保持一致，不要各自调参。
 *
 * 背景：小模型偶尔陷入「同一句话无限重复」的死循环（解码退化）。
 * frequency_penalty 已定版不动（改它会伤风格），因此只能靠**检测 + 重试**兜底。
 */

/** 滑窗宽度（字） */
export const DEGEN_WINDOW = 60
/** 判为退化的最长重复片段阈值（字） */
export const DEGEN_THRESHOLD = 200
/** 同一片段出现多少次才算「重复」 */
export const DEGEN_MIN_COUNT = 3

/**
 * 找出最长重复片段。
 * @returns [最长重复片段长度, 该片段出现次数]
 *
 * step 抽稀（win/3）是用来把 O(n²) 压到可接受范围的关键，别删。
 */
export function findLongestRepeat(
  text: string,
  win: number = DEGEN_WINDOW,
): [number, number] {
  if (text.length < win * 3) return [0, 0]

  const counts = new Map<string, number[]>()
  const step = Math.max(Math.floor(win / 3), 1)

  for (let i = 0; i + win <= text.length; i += step) {
    const sub = text.slice(i, i + win)
    const pos = counts.get(sub)
    if (pos) pos.push(i)
    else counts.set(sub, [i])
  }

  let bestLen = 0
  let bestCount = 0

  for (const [, pos] of counts) {
    if (pos.length < DEGEN_MIN_COUNT) continue

    // 从首个出现位置开始，按 win 为步长向后扩展，看能连续重复多长
    let len = win
    const start = pos[0]
    for (;;) {
      const next = text.slice(start + len, start + len + win)
      if (next.length === win && next === text.slice(start, start + win)) len += win
      else break
    }

    if (len > bestLen) {
      bestLen = len
      bestCount = pos.length
    }
  }

  return [bestLen, bestCount]
}

/**
 * 判据：最长重复片段 >= 200 字。
 * @returns [是否退化, 最长片段长度, 出现次数]
 */
export function isDegenerate(
  text: string,
  win: number = DEGEN_WINDOW,
): [boolean, number, number] {
  const [len, count] = findLongestRepeat(text, win)
  return [len >= DEGEN_THRESHOLD, len, count]
}

/**
 * 退化时的兜底截断：保留最后一个完整句子。
 * 用于「重试两次仍退化」的最终降级——宁可短，不要循环。
 */
export function truncateAtLastSentence(text: string): string {
  const last = Math.max(
    text.lastIndexOf('。'),
    text.lastIndexOf('！'),
    text.lastIndexOf('？'),
    text.lastIndexOf('…'),
    text.lastIndexOf('~'),
    text.lastIndexOf('～'),
  )
  if (last >= 0) return text.slice(0, last + 1)
  // 一个句末标点都没有：硬截一半，至少不要整篇复读
  return text.slice(0, Math.max(Math.floor(text.length / 2), 1))
}
