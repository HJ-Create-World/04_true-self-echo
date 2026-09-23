/**
 * 模型接入层 —— 三后端配置驱动（D011 §决策二）
 *
 * 核心约定：glm / deepseek / ollama 共用同一套调用代码（OpenAI 兼容协议），
 * 换模型只改 .env 三行，零代码改动。
 *
 * 配置来源是**后端进程的环境变量**（不是前端），密钥永远不进浏览器。
 * 前端只能问后端「现在有哪些 provider 可选」，不能问「key 是多少」。
 */

export type ProviderName = string

export interface ProviderConfig {
  /** 去掉尾部斜杠的 baseURL，调用方拼 `${baseURL}/chat/completions` */
  baseURL: string
  /** OLLAMA 为空字符串（本地服务无需鉴权） */
  apiKey: string
  model: string
  name: string
}

/** 后端 /api/providers 返回的单个条目：不含任何密钥 */
export interface ProviderInfo {
  name: string
  model: string
  isDefault: boolean
}

/** 环境变量前缀：`{NAME}_BASE_URL` / `{NAME}_MODEL` / `{NAME}_API_KEY` */
export function providerPrefix(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

/** 本地部署的 provider 不需要 API Key。 */
export function isLocalProvider(name: string): boolean {
  return providerPrefix(name) === 'OLLAMA'
}

/**
 * 从一份「类似 env 的字典」里读出某个 provider 的配置。
 * 后端用 process.env 调它；单元测试可以传普通对象。
 */
export function getProvider(
  name: string,
  env: Record<string, string | undefined>,
): ProviderConfig {
  const key = providerPrefix(name)
  const baseURL = (env[`${key}_BASE_URL`] ?? '').trim()
  const model = (env[`${key}_MODEL`] ?? '').trim()
  const apiKey = (env[`${key}_API_KEY`] ?? '').trim()

  if (!baseURL) throw new Error(`.env 里没有 ${key}_BASE_URL，无法接入「${name}」`)
  if (!model) throw new Error(`.env 里没有 ${key}_MODEL，无法接入「${name}」`)
  if (!isLocalProvider(name) && !apiKey) {
    throw new Error(`.env 里没有 ${key}_API_KEY，「${name}」需要密钥`)
  }

  return { baseURL: baseURL.replace(/\/+$/, ''), apiKey, model, name }
}

/** 该项目当前支持的后端清单（与 .env.example 一一对应） */
export const KNOWN_PROVIDERS: readonly string[] = ['glm', 'deepseek', 'ollama']

/** 列出所有「配置完整、可直接使用」的后端，并按 DEFAULT_PROVIDER 标记默认项。 */
export function listProviders(
  env: Record<string, string | undefined>,
): ProviderInfo[] {
  const fallback = (env.DEFAULT_PROVIDER ?? 'deepseek').trim().toLowerCase()
  const out: ProviderInfo[] = []

  for (const name of KNOWN_PROVIDERS) {
    let cfg: ProviderConfig
    try {
      cfg = getProvider(name, env)
    } catch {
      continue // 缺配置的后端直接跳过，不阻断其它后端
    }
    out.push({ name: cfg.name, model: cfg.model, isDefault: cfg.name === fallback })
  }

  if (out.length > 0 && !out.some((p) => p.isDefault)) out[0].isDefault = true
  return out
}

/** 取默认后端；全部不可用时抛错，由调用方转成 4xx 返回。 */
export function resolveDefaultProvider(
  env: Record<string, string | undefined>,
): ProviderConfig {
  const list = listProviders(env)
  if (list.length === 0) {
    throw new Error('还没有可用的模型服务 —— 请到「设置」页添加你的模型连接（接口地址 + 模型名 + API Key）')
  }
  const target = list.find((p) => p.isDefault) ?? list[0]
  return getProvider(target.name, env)
}
