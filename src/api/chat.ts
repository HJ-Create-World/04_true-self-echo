/**
 * 采样参数（execution-control.md §2.3）—— 全部冻结，改一个数都要有实验依据
 */
export const SAMPLING = {
  temperature: 0.8,
  top_p: 0.95,
  frequency_penalty: 0,
  max_tokens: 2048,
} as const

/**
 * 思维链关闭写法（execution-control.md §2.3 / D011 §决策五）
 *
 * 必须是这个对象形态。三个坑：
 *   thinking: false                  → 400 直接报错
 *   enable_thinking: false           → 200 但**静默失效**，reasoning_tokens 仍 >0
 *   thinking: { type: 'disabled' }   → ✅ 正确写法
 *
 * 验收铁律：查 usage.completion_tokens_details.reasoning_tokens === 0，
 * 不能只看 HTTP 状态码。
 */
export const THINKING_OFF = { type: 'disabled' } as const

import { Capacitor } from '@capacitor/core'
import { overrideFor } from './apiConfig.ts'

/** APK/桌面原生环境判定 —— 直连模式只在 Capacitor 原生壳里启用 */
function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/** 退化重试的温度阶梯（与薄后端 server/index.mjs 保持同一顺序） */
const RETRY_TEMPERATURES = [0.8, 0.6, 0.4]

export interface ChatRequest {
  provider: string
  system: string
  /** 不含 system 的历史轮次，顺序即时间顺序 */
  history: { role: 'user' | 'assistant'; content: string }[]
  userInput: string
  /** 覆盖采样参数（退化重试时降 temperature 用） */
  temperature?: number
  /**
   * 覆盖 max_tokens。对话用默认 2048；
   * **提取流程要传大值**（要产出完整 JSON，见 `feed/extract.ts`）。
   */
  maxTokens?: number
  /**
   * 要求上游返回严格 JSON（OpenAI 兼容的 `response_format`）。
   *
   * ⚠️ 这不是「锦上添花」—— 实测过：不加这个参数时 deepseek-flash 会在
   * 5222 字的输出里漏一个转义，整个 JSON 直接解析失败（2026-09-20）。
   * 提取流程**必须**传 `'json'`。
   */
  responseFormat?: 'json'
}
export interface ChatUsage {
  prompt: number
  completion: number
  /** 缓存命中的 prompt tokens（DeepSeek 自动前缀缓存） */
  cacheHit: number
  /** 必须为 0；非 0 说明思维链没关掉 */
  reasoning: number
}

export interface ChatResponse {
  content: string
  usage: ChatUsage
  finishReason: string
  /** 服务端实测耗时（毫秒） */
  elapsedMs: number
  /** 退化重试留下的痕迹，正常一次过时为 0 */
  retries: number
  /** 全部重试后仍退化 → true，前端需要标注 */
  degraded: boolean
  /** 本次实际使用的后端与模型（便于对比不同模型的效果） */
  provider: string
  model: string
}

/** 前端侧的错误对象：HTTP 失败的响应体是 { error: string } */
export class ChatError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ChatError'
    this.status = status
  }
}

export async function sendChat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  // 前端配置的覆盖项（若该 provider 有配置）随请求带给本机后端 ——
  // 后端内存转发、不落盘；不配置时字段缺省，行为与 .env 模式完全一致
  const override = overrideFor(req.provider)

  // 🔴 APK 直连模式（2026-09-23）：Capacitor 原生环境里没有 Node 后端，
  // fetch 已被 CapacitorHttp patch 到原生层（无 CORS）—— 直接调模型 API
  if (isNative()) {
    if (!override?.baseUrl || !override.model) {
      throw new ChatError('请先到「设置」添加模型连接（接口地址 + 模型名 + API Key）', 400)
    }
    return directChat(req, override, signal)
  }

  const payload = override ? { ...req, override } : req

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ChatError(`后端返回了非 JSON 内容：${text.slice(0, 200)}`, res.status)
  }

  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `请求失败（HTTP ${res.status}）`
    throw new ChatError(msg, res.status)
  }

  return data as ChatResponse
}

/** 拉取可用后端清单（不含密钥），用于界面上的模型切换 */
export async function fetchProviders(): Promise<import('./provider').ProviderInfo[]> {
  // APK 直连模式：没有本机后端，清单完全来自自定义连接（chat store 已 merge）
  if (isNative()) return []
  const res = await fetch('/api/providers')
  if (!res.ok) throw new ChatError(`无法获取后端清单（HTTP ${res.status}）`, res.status)
  const data = (await res.json()) as { providers: import('./provider').ProviderInfo[] }
  return data.providers ?? []
}

/**
 * APK 直连：浏览器内直接调用模型 API（协议与薄后端的 callUpstream 一致）。
 * 退化检测 + 三温度重试与桌面/网页版同规格；无缓存命中概念（各家不同，缺省 0）。
 */
async function directChat(
  req: ChatRequest,
  override: import('./apiConfig').ApiOverride,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const { isDegenerate, truncateAtLastSentence } = await import('@/core/degeneration')
  const base = override.baseUrl!.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (override.apiKey) headers.Authorization = `Bearer ${override.apiKey}`
  const messages = [
    { role: 'system', content: req.system ?? '' },
    ...req.history,
    { role: 'user', content: req.userInput },
  ]
  const body = (temperature: number) =>
    JSON.stringify({
      model: override.model,
      messages,
      temperature,
      top_p: SAMPLING.top_p,
      frequency_penalty: SAMPLING.frequency_penalty,
      max_tokens: req.maxTokens ?? SAMPLING.max_tokens,
      ...(req.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      thinking: THINKING_OFF,
    })

  const started = Date.now()
  let lastText = ''
  let lastFinish = 'unknown'
  let lastUsage: ChatUsage = { prompt: 0, completion: 0, cacheHit: 0, reasoning: 0 }

  for (let attempt = 0; attempt < RETRY_TEMPERATURES.length; attempt++) {
    const temp = req.temperature ?? RETRY_TEMPERATURES[attempt]
    // 🔴 /v1 兜底：官方地址常不带 /v1，404 时补一次（与薄后端同策略）
    let url = `${base}/chat/completions`
    let res = await fetch(url, { method: 'POST', headers, body: body(temp), signal })
    if (res.status === 404 && !/\/v1(\/|$)/.test(base)) {
      url = `${base}/v1/chat/completions`
      res = await fetch(url, { method: 'POST', headers, body: body(temp), signal })
    }

    const text = await res.text()
    if (!res.ok) throw new ChatError(`上游 ${req.provider} 返回 ${res.status}：${text.slice(0, 300)}`, res.status)

    let data: {
      choices?: { message?: { content?: string }; finish_reason?: string }[]
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        prompt_cache_hit_tokens?: number
        prompt_tokens_details?: { cached_tokens?: number }
        completion_tokens_details?: { reasoning_tokens?: number }
      }
    }
    try {
      data = JSON.parse(text)
    } catch {
      throw new ChatError(`上游返回了非 JSON 内容：${text.slice(0, 200)}`, res.status)
    }

    lastText = data.choices?.[0]?.message?.content ?? ''
    lastFinish = data.choices?.[0]?.finish_reason ?? 'unknown'
    const u = data.usage ?? {}
    lastUsage = {
      prompt: u.prompt_tokens ?? 0,
      completion: u.completion_tokens ?? 0,
      cacheHit: u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0,
      reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0,
    }

    const [degen] = isDegenerate(lastText)
    if (!degen) {
      return {
        content: lastText,
        usage: lastUsage,
        finishReason: lastFinish,
        elapsedMs: Date.now() - started,
        retries: attempt,
        degraded: false,
        provider: req.provider,
        model: override.model!,
      }
    }
  }

  return {
    content: truncateAtLastSentence(lastText),
    usage: lastUsage,
    finishReason: lastFinish,
    elapsedMs: Date.now() - started,
    retries: RETRY_TEMPERATURES.length - 1,
    degraded: true,
    provider: req.provider,
    model: override.model!,
  }
}
