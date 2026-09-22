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
}

/** provider 名 → 覆盖项。只存有内容的字段 */
export type ApiConfigMap = Record<string, ApiOverride>

const KEY = 'tse.apiConfig'

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

/** 取某个 provider 的覆盖项（空字段视为未配置） */
export function overrideFor(provider: string): ApiOverride | undefined {
  const map = loadApiConfig()
  const o = map[provider]
  if (!o) return undefined
  const clean: ApiOverride = {}
  if (o.apiKey?.trim()) clean.apiKey = o.apiKey.trim()
  if (o.model?.trim()) clean.model = o.model.trim()
  if (o.baseUrl?.trim()) clean.baseUrl = o.baseUrl.trim()
  if (o.custom) clean.custom = true
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
