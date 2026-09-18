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
async function callUpstream(cfg, messages, temperature) {
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
        max_tokens: SAMPLING.max_tokens,
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
  const { provider, system, history = [], userInput, temperature } = body

  if (!userInput || typeof userInput !== 'string') {
    return sendJSON(res, 400, { error: 'userInput 不能为空' })
  }

  const cfg = provider ? getProvider(provider, ENV) : resolveDefaultProvider(ENV)
  const messages = [{ role: 'system', content: system ?? '' }, ...history, {
    role: 'user',
    content: userInput,
  }]

  const started = Date.now()
  let lastText = ''
  let lastMeta = null

  for (let attempt = 0; attempt < RETRY_TEMPERATURES.length; attempt++) {
    const temp = temperature ?? RETRY_TEMPERATURES[attempt]
    const data = await callUpstream(cfg, messages, temp)
    const { content, finishReason, usage } = normalize(data)

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
const ROUTES = {
  'GET /api/health': (_req, res) => sendJSON(res, 200, { ok: true, uptime: process.uptime() }),
  'GET /api/providers': (_req, res) => sendJSON(res, 200, { providers: listProviders(ENV) }),
  'POST /api/chat': handleChat,
}

const server = createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0]
  const handler = ROUTES[`${req.method} ${path}`]

  if (!handler) return sendJSON(res, 404, { error: `没有这个接口：${req.method} ${path}` })

  try {
    await handler(req, res)
  } catch (err) {
    console.error('[chat] 失败：', err)
    if (!res.headersSent) sendJSON(res, 502, { error: String(err?.message ?? err) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const list = listProviders(ENV)
  console.log(`真我回响 · 薄后端已就绪 http://127.0.0.1:${PORT}`)
  console.log(
    list.length
      ? `可用后端：${list.map((p) => `${p.name}(${p.model})${p.isDefault ? '*' : ''}`).join('  ')}`
      : '⚠️ 没有可用后端，请检查 .env',
  )
})
