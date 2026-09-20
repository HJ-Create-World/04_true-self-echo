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
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
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
  const res = await fetch('/api/providers')
  if (!res.ok) throw new ChatError(`无法获取后端清单（HTTP ${res.status}）`, res.status)
  const data = (await res.json()) as { providers: import('./provider').ProviderInfo[] }
  return data.providers ?? []
}
