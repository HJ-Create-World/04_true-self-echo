/**
 * 前端 API 配置（2026-09-22，路线二的核心能力）
 *
 * ## 之前的问题
 *
 * 换模型/换 key 要打开 `.env` 文件改环境变量 —— 对「纯本地 + 自配」的路线来说，
 * 配置入口应该在产品里，不该在文件系统里。
 *
 * ## 设计
 *
 * - 配置存在**浏览器 localStorage**（`tse.apiConfig`）—— 数据主权归用户，
 *   与人格/对话同级。纯本地应用无第三方脚本，密钥放 localStorage 的 XSS 风险可接受
 *   （不放的话只能放 .env，等于回到原点）
 * - 请求时把覆盖项随 `/api/chat` 带给**本机薄后端**，后端**内存转发、不落盘**：
 *   浏览器不直连模型 API（DeepSeek/GLM 不带 CORS 头，直连会被拦），
 *   key 也不进后端进程的任何持久层
 * - 优先级：请求携带 > `.env`；不配置 = 行为与之前完全一致
 *
 * ⚠️ 密钥回显：设置页**不回显**已存的 key（placeholder 提示「已配置」即可），
 * 避免旁人瞄一眼屏幕就拿到密钥。
 */

export interface ApiOverride {
  apiKey?: string
  model?: string
  baseUrl?: string
  /**
   * 纯前端定义的连接（2026-09-22）：.env 里**没有**这个 provider，
   * baseUrl + model 必填（apiKey 可空 = 本地服务）。后端见到
   * override.baseUrl 就完全以请求为准，provider 名仅作标签与统计。
   * 无此标志 = 给 .env 里已有的 provider 做字段级覆盖（两者可并存）。
   */
  custom?: boolean
  /**
   * 「获取模型」拉到的模型列表缓存（2026-09-23）—— 一个连接下的所有模型
   * 都会平铺到对话页下拉里直接切换，不用为每个模型建一条连接。
   */
  models?: string[]
}

/** provider 名 → 覆盖项。只存有内容的字段 */
export type ApiConfigMap = Record<string, ApiOverride>

const KEY = 'tse.apiConfig'
/** 用户在对话页选中的模型（provider 名 → 模型名），跨重启保持 */
const SELECTED_KEY = 'tse.selectedModel'

export function loadApiConfig(): ApiConfigMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw) as ApiConfigMap
    return typeof obj === 'object' && obj !== null ? obj : {}
  } catch {
    return {}
  }
}

export function saveApiConfig(map: ApiConfigMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* 存不了就算了 —— 下次重启要重填，但不阻塞使用 */
  }
}

/** 取某个 provider 的覆盖项（空字段视为未配置）。
 *  🔴 若用户在对话页选过模型（selectedModel），model 以它为准 —— 这样
 *  send / extract / monologue 全部自动跟随用户的选择，零签名改动 */
export function overrideFor(provider: string): ApiOverride | undefined {
  const map = loadApiConfig()
  const o = map[provider]
  if (!o) return undefined
  const clean: ApiOverride = {}
  const picked = getSelectedModel(provider)
  if (o.apiKey?.trim()) clean.apiKey = o.apiKey.trim()
  if (o.baseUrl?.trim()) clean.baseUrl = o.baseUrl.trim()
  clean.model = picked ?? o.model?.trim() ?? ''
  if (!clean.model) delete clean.model
  if (o.custom) clean.custom = true
  if (o.models?.length) clean.models = o.models
  return Object.keys(clean).length ? clean : undefined
}

/** 判断某个 provider 是否有前端配置（设置页展示「已配置」用） */
export function hasOverride(provider: string): boolean {
  return overrideFor(provider) !== undefined
}

/* ---------- 自定义连接（增删改 · 2026-09-22） ---------- */

export interface CustomConnection {
  name: string
  baseUrl: string
  model: string
  apiKey?: string
}

/** 用户自己加的连接清单（不含 .env 覆盖项） */
export function listCustomConnections(): CustomConnection[] {
  const map = loadApiConfig()
  return Object.entries(map)
    .filter(([, o]) => o.custom && o.baseUrl?.trim() && o.model?.trim())
    .map(([name, o]) => ({
      name,
      baseUrl: o.baseUrl!.trim(),
      model: o.model!.trim(),
      apiKey: o.apiKey?.trim() || undefined,
    }))
}

/** 新增 / 更新一个自定义连接。写完调用方应广播 material-changed 同款事件 */
export function saveCustomConnection(c: CustomConnection): void {
  const map = loadApiConfig()
  map[c.name] = { custom: true, baseUrl: c.baseUrl, model: c.model, ...(c.apiKey ? { apiKey: c.apiKey } : {}) }
  saveApiConfig(map)
}

export function deleteConnection(name: string): void {
  const map = loadApiConfig()
  delete map[name]
  saveApiConfig(map)
}

/* ---------- 选中模型（对话页下拉的持久化选择） ---------- */

export function getSelectedModel(provider: string): string | undefined {
  try {
    const obj = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? '{}') as Record<string, string>
    return obj[provider] || undefined
  } catch {
    return undefined
  }
}

export function saveSelectedModel(provider: string, model: string): void {
  try {
    const obj = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? '{}') as Record<string, string>
    obj[provider] = model
    localStorage.setItem(SELECTED_KEY, JSON.stringify(obj))
  } catch {
    /* 存不了就算了 */
  }
}

/** 把「获取模型」的列表缓存进指定条目（.env 覆盖条目或自定义连接通用） */
export function saveModelsToListing(provider: string, models: string[]): void {
  const map = loadApiConfig()
  const o = map[provider] ?? {}
  o.models = models
  map[provider] = o
  saveApiConfig(map)
}
