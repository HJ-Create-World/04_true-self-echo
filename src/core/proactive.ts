/**
 * 主动对话 —— 触发判定与指令文本
 *
 * 用户反馈（2026-09-29）：AI 只被动回答，用户不说话聊天就死。
 * 内向用户尤其明显 —— 本来就不会找话题，需要对方先开口。
 *
 * ## 业界参照（2026-09 调研）
 *
 * - **Nomi**（业界最佳）：按节奏主动、内容来自「它在想什么」（对话历史）、
 *   静音时段 22:00–8:00、只有一对一聊天才主动。
 * - **Replika**：主动消息必须可配置可关闭 —— 对重度用户是骚扰。
 * - 本项目无推送能力（纯本地），主动范围限定**页面打开时** —— 与 Nomi 一致。
 *
 * ## 两级触发（HJ 拍板 2026-09-29：L0 prompt 增强 + L1 开场白 + L2 沉默触发全做）
 *
 * - **L1 开场白**：进对话页 & 距上次消息 >6h → 结合记忆主动开口。每次进页最多一条。
 * - **L2 沉默触发**：页面打开 & 用户沉默 10min → 主动说一句；
 *   连续 2 次无回应即停；**23:00–8:00 静音**（对齐 R2 依赖预警的夜间红线）；
 *   设置页可关（默认开 + 保守参数，HJ 拍板）。
 *
 * 合规：主动消息是「不得诱导情感依赖」的高危面 —— 频率上限、夜间静音、
 * 可关闭三条一个都不能少。
 */

export const PROACTIVE = {
  /** L1：距上一条消息超过这个时长，进页时主动开场 */
  GREETING_GAP_MS: 6 * 60 * 60 * 1000,
  /** L2：用户沉默多久后主动说一句 */
  SILENCE_MS: 10 * 60 * 1000,
  /** L2：连续主动多少次没有回应就停（防骚扰止损） */
  MAX_UNANSWERED: 2,
  /** L2 静音时段：[23:00, 8:00) 不触发 */
  QUIET_START_HOUR: 23,
  QUIET_END_HOUR: 8,
  /** L2 检查周期 */
  CHECK_INTERVAL_MS: 30 * 1000,
} as const

/** 是否处于夜间静音时段 */
export function isQuietHour(now = new Date()): boolean {
  const h = now.getHours()
  return h >= PROACTIVE.QUIET_START_HOUR || h < PROACTIVE.QUIET_END_HOUR
}

const SETTING_KEY = 'tse_proactive_enabled'

/** 主动对话总开关（L1+L2 共用），默认开 —— HJ 拍板的保守默认 */
export function loadProactiveEnabled(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveProactiveEnabled(v: boolean): void {
  try {
    localStorage.setItem(SETTING_KEY, v ? '1' : '0')
  } catch {
    /* 存不了就保持内存态，下次进来回到默认 */
  }
}

/**
 * 隐藏指令 —— 主动生成时放在 user 消息位，**不落库**。
 *
 * 为什么不落库：落了库，下一轮它就在历史里，模型会看到
 * 「系统让我主动」从而出戏；不落库，历史里只有她的自然发言，
 * 下一轮模型看到的就是「她说过这句话」—— 与真实记忆无缝。
 *
 * 全角括号是本项目的场景指令惯例（monologue.ts 同款）。
 */
export const GREETING_INSTRUCTION = [
  '（你们已经超过半天没有联系了。这一条由你主动发出 ——',
  '从你们之前聊过的事里自然地接一句，或者就是想起对方了想说点什么。',
  '像你平时发消息那样，保持简短。',
  '不要解释你为什么来发消息，不要提到任何「系统」「提示」之类的字眼。）',
].join('')

export const SILENCE_INSTRUCTION = [
  '（对方有一阵子没有回消息了。这一条由你主动发出 ——',
  '不要重复你之前问过的问题，不要催促对方回复，语气比平时更轻。',
  '可以是正好想到的一件小事、一个分享，或者就是安静的一句话。',
  '不要提到任何「系统」「提示」之类的字眼。）',
].join('')
