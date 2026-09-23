/**
 * 真我回响 · 薄后端
 *
 * D003 硬约束：单文件、≤200 行、**不引 Express/Koa 全家桶**、不连数据库、不做鉴权。
 * 只做三件事：代理 LLM 请求 / 读文件 / 写文件。
 * 删掉它应当能降级为纯前端（方案 A）——所以任何「只有后端能做」的逻辑都不许进来。
 *
 * 之所以需要它：API Key 只能活在 Node 进程里，绝不能打包进浏览器。
 */

import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readFileSync } from 'node:fs'
import { join, extname } from 'node:path'

import { listProviders, resolveDefaultProvider, getProvider } from '../src/api/provider.ts'
import { SAMPLING, THINKING_OFF } from '../src/api/chat.ts'
import { isDegenerate, truncateAtLastSentence } from '../src/core/degeneration.ts'
import { loadEnv } from './env.mjs'

const PORT = Number(process.env.PORT || 8787)
const UPSTREAM_TIMEOUT_MS = 300_000

/** 退化重试策略（execution-control.md §4.2）：降 temperature 再试 */
const RETRY_TEMPERATURES = [SAMPLING.temperature, SAMPLING.temperature, 0.6]

// 优先级：真实环境变量 > .env 文件 > .env.example（占位值，仅用于开发期报错提示）
const ENV = loadEnv()

/* ---------- HTTP 小工具 ---------- */
function sendJSON(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

/* ---------- 上游调用 ---------- */
async function callUpstream(cfg, messages, temperature, maxTokens, jsonMode) {
  const headers = { 'Content-Type': 'application/json' }
  // Ollama 本地服务不需要 Authorization
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      signal: ac.signal,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature,
        top_p: SAMPLING.top_p,
        frequency_penalty: SAMPLING.frequency_penalty,
        // 提取流程要传大值（产出完整 JSON），对话用默认 2048
        max_tokens: maxTokens ?? SAMPLING.max_tokens,
        // 提取流程要求严格 JSON。不加的话模型会在长输出里漏转义，整份 JSON 报废。
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        thinking: THINKING_OFF,
      }),
    })

    const text = await r.text()
    if (!r.ok) throw new Error(`上游 ${cfg.name} 返回 ${r.status}：${text.slice(0, 400)}`)
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

/** 从上游响应里抽出我们关心的字段 */
function normalize(data) {
  const u = data.usage ?? {}
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    finishReason: data.choices?.[0]?.finish_reason ?? 'unknown',
    usage: {
      prompt: u.prompt_tokens ?? 0,
      completion: u.completion_tokens ?? 0,
      cacheHit: u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0,
      // 必须为 0；非 0 说明思维链没关掉（enable_thinking:false 会静默失效）
      reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0,
    },
  }
}

/* ---------- 路由：POST /api/chat ---------- */
async function handleChat(req, res) {
  const body = await readBody(req)
  const { provider, system, history = [], userInput, temperature, maxTokens, responseFormat } = body

  if (!userInput || typeof userInput !== 'string') {
    return sendJSON(res, 400, { error: 'userInput 不能为空' })
  }

  // 前端配置的覆盖项（路线二 · 2026-09-22）：请求携带 > .env，字段级合成。
  // 🔴 密钥只在本机内存转发、用完即弃 —— 不写日志、不落盘、不回显。
  //    设置页存在浏览器 localStorage，数据主权在用户自己设备上。
  //
  // 自定义连接：override.baseUrl 存在 → **完全以请求为准**（.env 里可以没有
  // 这个 provider，provider 名仅作标签与统计）—— 用户可以接阿里云 / OpenAI
  // / 任何 OpenAI 兼容服务。⚠️ baseUrl 由本机用户自己填，SSRF 风险自担（单机应用）。
  const o = body.override ?? {}
  const customBase =
    typeof o.baseUrl === 'string' && o.baseUrl.trim()
      ? {
          baseURL: o.baseUrl.trim().replace(/\/+$/, ''),
          apiKey: typeof o.apiKey === 'string' ? o.apiKey.trim() : '',
          model: typeof o.model === 'string' && o.model.trim() ? o.model.trim() : '',
          name: provider || 'custom',
        }
      : null
  if (customBase && !customBase.model) {
    return sendJSON(res, 400, { error: '自定义连接缺少模型名（model）' })
  }

  let base
  if (customBase) {
    base = customBase
  } else {
    try {
      base = provider ? getProvider(provider, ENV) : resolveDefaultProvider(ENV)
    } catch (e) {
      return sendJSON(res, 400, { error: String(e?.message ?? e) })
    }
  }

  // 字段级覆盖仍允许（比如只换 .env 服务的 key / 模型名）
  const cfg = {
    ...base,
    apiKey: typeof o.apiKey === 'string' && o.apiKey.trim() ? o.apiKey.trim() : base.apiKey,
    model: typeof o.model === 'string' && o.model.trim() ? o.model.trim() : base.model,
    baseURL:
      typeof o.baseUrl === 'string' && o.baseUrl.trim()
        ? o.baseUrl.trim().replace(/\/+$/, '')
        : base.baseURL,
  }
  const messages = [{ role: 'system', content: system ?? '' }, ...history, {
    role: 'user',
    content: userInput,
  }]

  const started = Date.now()
  let lastText = ''
  let lastMeta = null

  /**
   * 本机用量聚合（Q2 最小版 · 2026-09-22）。
   * 纯本地路线没有「用户」，这里是**整机**的消耗账本：
   * 每次上游调用成功就累加，GET /api/usage 读走。
   * ⚠️ 存内存 —— 重启归零。本地单机场景可接受（要持久化再上 SQLite）。
   */
  function recordUsage(u) {
    const slot = (USAGE.byProvider[cfg.name] ??= { requests: 0, prompt: 0, completion: 0 })
    USAGE.total.requests += 1
    USAGE.total.prompt += u.prompt ?? 0
    USAGE.total.completion += u.completion ?? 0
    slot.requests += 1
    slot.prompt += u.prompt ?? 0
    slot.completion += u.completion ?? 0
  }

  for (let attempt = 0; attempt < RETRY_TEMPERATURES.length; attempt++) {
    const temp = temperature ?? RETRY_TEMPERATURES[attempt]
    const data = await callUpstream(cfg, messages, temp, maxTokens, responseFormat === 'json')
    const { content, finishReason, usage } = normalize(data)
    recordUsage(usage)

    const [degen, repLen, repCount] = isDegenerate(content)
    console.log(
      `[chat] provider=${cfg.name} model=${cfg.model} chars=${content.length} ` +
        `rep_len=${repLen} rep_count=${repCount} degraded=${degen} ` +
        `temp=${temp} finish=${finishReason} reasoning=${usage.reasoning} ` +
        `cache_hit=${usage.cacheHit}`,
    )

    lastText = content
    lastMeta = { finishReason, usage, repLen, attempt }

    if (!degen) {
      return sendJSON(res, 200, {
        content,
        usage,
        finishReason,
        elapsedMs: Date.now() - started,
        retries: attempt,
        degraded: false,
        provider: cfg.name,
        model: cfg.model,
      })
    }
  }

  // 三次都退化：返回最后一个完整句子，并明确标注
  sendJSON(res, 200, {
    content: truncateAtLastSentence(lastText),
    usage: lastMeta.usage,
    finishReason: lastMeta.finishReason,
    elapsedMs: Date.now() - started,
    retries: RETRY_TEMPERATURES.length - 1,
    degraded: true,
    provider: cfg.name,
    model: cfg.model,
  })
}

/* ---------- 路由表 ---------- */
/** 本机用量账本（内存态，重启归零 —— 本地单机场景可接受） */
const USAGE = { since: null, total: { requests: 0, prompt: 0, completion: 0 }, byProvider: {} }
USAGE.since = new Date().toISOString()

const ROUTES = {
  'GET /api/health': (_req, res) => sendJSON(res, 200, { ok: true, uptime: process.uptime() }),
  'GET /api/providers': (_req, res) => sendJSON(res, 200, { providers: listProviders(ENV) }),
  'GET /api/usage': (_req, res) => sendJSON(res, 200, USAGE),
  'POST /api/chat': handleChat,
}

const server = createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0]
  const handler = ROUTES[`${req.method} ${path}`]

  if (handler) {
    try {
      await handler(req, res)
    } catch (err) {
      console.error('[chat] 失败：', err)
      if (!res.headersSent) sendJSON(res, 502, { error: String(err?.message ?? err) })
    }
    return
  }

  // 静态托管 dist（2026-09-23，桌面端 Electron 的前置）：单进程 = API + 网页，
  // 手机/局域网访问也只需要 8787 一个端口。SPA history 路由 fallback 到 index.html。
  serveStatic(req, res, path)
})

/** dist 静态托管 —— 目录遍历防护：resolve 后必须在 dist 根内。
 *  🔴 dist 根不要用 import.meta.url 推导：esbuild CJS bundle 里它是 undefined；
 *  由调用方（Electron 主进程）传 DIST_ROOT，命令行模式回落 cwd/dist */
function serveStatic(req, res, path) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJSON(res, 404, { error: `没有这个接口：${req.method} ${path}` })
  }
  const root = process.env.DIST_ROOT || join(process.cwd(), 'dist')
  const rel = path === '/' ? '/index.html' : path
  const file = join(root, rel)
  if (!file.startsWith(root)) return sendJSON(res, 403, { error: 'forbidden' })
  try {
    const data = readFileSync(file)
    const ext = extname(file).toLowerCase()
    const mime = MIME[ext] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' })
    res.end(data)
  } catch {
    // SPA fallback：非资源路径回 index.html（history 路由刷新不 404）
    try {
      const index = readFileSync(join(root, 'index.html'))
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' })
      res.end(index)
    } catch {
      sendJSON(res, 404, { error: `文件不存在：${path}（先 npm run build）` })
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

// 🔴 2026-09-22：127.0.0.1 → 0.0.0.0 —— 手机/平板要在局域网里访问本机服务。
// ⚠️ 仅限可信内网（家庭/办公室）：局域网内任何人都能用这个后端转发请求；
//    不要把端口暴露到公网。HTTP 明文 —— 前端配置的 key 在内网传输同理。
server.listen(PORT, '0.0.0.0', () => {
  const list = listProviders(ENV)
  console.log(`真我回响 · 薄后端已就绪 http://127.0.0.1:${PORT}`)
  const nets = networkInterfaces()
  for (const [name, addrs] of Object.entries(nets)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  局域网访问：http://${a.address}:${PORT}（网卡 ${name}）—— 手机同 WiFi 可用`)
      }
    }
  }
  console.log(
    list.length
      ? `可用后端：${list.map((p) => `${p.name}(${p.model})${p.isDefault ? '*' : ''}`).join('  ')}`
      : '⚠️ 没有可用后端，请检查 .env',
  )
})
