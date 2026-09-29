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
  /** L2 检查周期（内部实现，不开放） */
  CHECK_INTERVAL_MS: 30 * 1000,
} as const

/** L2 静音时段：[23:00, 8:00) 不触发 —— 合规红线（对齐 R2），不开放配置 */
export const QUIET_HOURS = { START: 23, END: 8 } as const

/** 是否处于夜间静音时段 */
export function isQuietHour(now = new Date()): boolean {
  const h = now.getHours()
  return h >= QUIET_HOURS.START || h < QUIET_HOURS.END
}

/* ------------------------------------------------------------------ */
/* 用户可调参数（HJ 2026-09-29 拍板：触发时间与频率开放自定义）           */
/* ------------------------------------------------------------------ */

export interface ProactiveConfig {
  /** L2：用户沉默多少分钟后主动说一句（默认 10） */
  silenceMinutes: number
  /** L2：连续几次无回应后停止（默认 2） */
  maxUnanswered: number
  /** L1：距上次对话多少小时后进页开场（默认 6） */
  greetingGapHours: number
  /** 主动消息是否带内心独白前缀（默认关 —— 用户要开启时再开启） */
  monologuePrefix: boolean
}

export const DEFAULT_PROACTIVE: ProactiveConfig = {
  silenceMinutes: 10,
  maxUnanswered: 2,
  greetingGapHours: 6,
  monologuePrefix: false,
}

/** 参数边界：防手滑填出 0 分钟刷屏或 999 小时永不触发 */
const LIMITS = {
  silenceMinutes: { min: 2, max: 120 },
  maxUnanswered: { min: 1, max: 10 },
  greetingGapHours: { min: 1, max: 168 },
} as const

function clamp(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function sanitizeProactiveConfig(v: Partial<ProactiveConfig> | null): ProactiveConfig {
  const d = DEFAULT_PROACTIVE
  if (!v || typeof v !== 'object') return { ...d }
  return {
    silenceMinutes: clamp(v.silenceMinutes, d.silenceMinutes, LIMITS.silenceMinutes.min, LIMITS.silenceMinutes.max),
    maxUnanswered: clamp(v.maxUnanswered, d.maxUnanswered, LIMITS.maxUnanswered.min, LIMITS.maxUnanswered.max),
    greetingGapHours: clamp(v.greetingGapHours, d.greetingGapHours, LIMITS.greetingGapHours.min, LIMITS.greetingGapHours.max),
    monologuePrefix: v.monologuePrefix === true,
  }
}

const ENABLED_KEY = 'tse_proactive_enabled'
const CONFIG_KEY = 'tse_proactive_config'

/** 主动对话总开关（L1+L2 共用），默认开 —— HJ 拍板的保守默认 */
export function loadProactiveEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveProactiveEnabled(v: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, v ? '1' : '0')
  } catch {
    /* 存不了就保持内存态，下次进来回到默认 */
  }
}

export function loadProactiveConfig(): ProactiveConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return sanitizeProactiveConfig(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_PROACTIVE }
  }
}

export function saveProactiveConfig(cfg: ProactiveConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(sanitizeProactiveConfig(cfg)))
  } catch {
    /* 同上 */
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
