/**
 * 提取流程：素材 → 人格档案
 *
 * 走的是**已有的** `/api/chat`，不新开后端接口 —— 提取本质就是一次
 * 「受约束的补全」，没有第三件事要做。这样 D003 的「单文件 ≤200 行、
 * 删掉后端应能降级为纯前端」两条约束都不用动。
 *
 * ⚠️ 与对话的区别只在三个参数：system 换成提取 Prompt、temperature 调低、
 * max_tokens 调高。**不加执行侧干预**（红线是给扮演用的，提取时不是角色）。
 */

import { sendChat, ChatError } from '@/api/chat'
import { emptyFrozen, type FrozenLayer } from '@/persona/schema'

import { buildExtractionInput, EXTRACTION_SYSTEM } from './prompt'

/** 提取要产出完整 JSON，远大于一次对话回复 */
export const EXTRACT_MAX_TOKENS = 4096

/**
 * 提取用的 temperature。比对话的 0.8 低得多 ——
 * 这一步要的是**忠实抄录素材**，不是创作。温度高会明显增加编造。
 */
export const EXTRACT_TEMPERATURE = 0.3

/** 覆盖度自检（Prompt 修正 1f）—— 不进档案，只在 UI 上展示 */
export interface Coverage {
  covered: string[]
  missing: string[]
}

export interface ExtractionDraft {
  name: string
  tagline: string
  frozen: FrozenLayer
  coverage: Coverage
  /** 模型原始输出，解析失败时给用户看 */
  raw: string
}

/* ------------------------------------------------------------------ */
/* 解析（防御式：模型不一定听话）                                       */
/* ------------------------------------------------------------------ */

/** 去掉 markdown 代码块围栏，再取最外层的 { ... } */
export function unwrapJson(text: string): string {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return t
}

/**
 * 把「本该闭合、却漏掉或写错」的引号修回来。
 *
 * 逐字符扫描，维护「当前是否在字符串内」的状态：
 *
 * | 情形 | 处理 |
 * |---|---|
 * | 不在串内遇到 `"` | 进入串 |
 * | 在串内遇到 `"`，后面第一个非空白是 `,` `:` `}` `]` | 正常闭合 |
 * | 在串内遇到 `"`，后面是别的东西 | 内容里漏转义的引号 → 补 `\` |
 * | 在串内遇到 `,`，且后面形如 `"键":` | **前面漏了闭合引号** → 就在逗号前补上 |
 * | 在串内遇到 `}` / `]`，且**此后只剩收尾括号** | 同上，就在它前面补上 |
 * | 扫完仍在串内 | 末尾漏了闭合引号 → 补一个 |
 *
 * 后两条是关键：2026-09-20 实测里模型丢的引号，后面紧跟的正是 `, "下一个键":`
 * 或者 `] }`。只看引号本身是修不回来的 —— 必须从**后面的结构**倒推前面的边界。
 */
function balanceQuotes(text: string): string {
  const tailIsClosers = (from: number) => /^[\s}\],]*$/.test(text.slice(from))

  let out = ''
  let inStr = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (c === '\\') {
      out += c + (text[i + 1] ?? '')
      i++
      continue
    }

    if (c === '"') {
      if (!inStr) {
        inStr = true
        out += c
        continue
      }
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      const next = text[j]
      if (next === undefined || ',:}]'.includes(next)) {
        inStr = false
        out += c
      } else {
        out += '\\"'
      }
      continue
    }

    // 在串内撞上结构符 —— 说明前面的闭合引号丢了
    if (inStr && (c === ',' || c === '}' || c === ']')) {
      const afterComma = /^\s*"[^"\\]*"\s*:/.test(text.slice(i + 1))
      if ((c === ',' && afterComma) || (c !== ',' && tailIsClosers(i))) {
        inStr = false
        out += `"${c}`
        continue
      }
    }

    out += c
  }

  return inStr ? `${out}"` : out
}

/**
 * 容错修复 —— `response_format: json_object` 之外再兜一层。
 *
 * ⚠️ **实测记录（2026-09-20）**：即使传了 `response_format: {type:'json_object'}`，
 * deepseek-flash 仍会产出非法 JSON，具体形态是
 * **用全角引号 `”` 当字符串的闭合符**（而不是 ASCII `"`）：
 *
 *     "forbidden": "直接说「我在威胁你」,     ← 末尾的 ” 被写成了全角
 *
 * 这是 CJK 内容下的典型失效。加了本函数后能兜住：
 *   ① 全角引号出现在**分隔符位置** → 换成 ASCII（只在分隔符位置换，
 *      避免误伤正文里正当使用的引号）
 *   ② 字符串内漏转义的引号 / 末尾丢掉的闭合引号 → 交给 `balanceQuotes`
 *   ③ 尾随逗号
 *   ④ 字符串内的裸换行
 *
 * 只做**字符级**修复，不做字段级猜测 —— 改不了的宁可报错让用户看原始输出，
 * 也不要猜出一个看起来对、实际是编的档案。
 */
export function repairJson(text: string): string {
  let t = text
  // ① 全角引号当分隔符：`值”` 后面紧跟 , } ] → 该 ” 是闭合符
  t = t.replace(/[”“](\s*[,}\]])/g, '"$1')
  //    `:  “值` 或 `,  “值` → 该 “ 是起始符
  t = t.replace(/([:,[{]\s*)[”“]/g, '$1"')
  // ② 引号配对
  t = balanceQuotes(t)
  // ③ 尾随逗号
  t = t.replace(/,(\s*[}\]])/g, '$1')
  // ④ 字符串内的裸换行
  t = t.replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/\n/g, '\\n').replace(/\r/g, ''))
  return t
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => asString(x)).filter(Boolean)
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
}

const LEVELS = new Set(['explicit', 'implied', 'extrapolated'])

function asLevel(v: unknown): FrozenLayer['coreTraits'][number]['evidenceLevel'] {
  const s = asString(v)
  return LEVELS.has(s) ? (s as FrozenLayer['coreTraits'][number]['evidenceLevel']) : 'extrapolated'
}

/**
 * 把模型输出规整成 FrozenLayer。
 *
 * 原则：**结构缺失就留空，不猜、不补默认文案**。宁可让用户看到「这节没提取到」
 * 也不要用一句编的话把它填满 —— 这正是 Phase 0 诊断文档点名的失效模式。
 */
export function normalizeFrozen(obj: Record<string, unknown>): FrozenLayer {
  const f = emptyFrozen()

  f.mechanism = asString(obj.mechanism)

  f.coreTraits = asArray(obj.coreTraits).map((t) => ({
    title: asString(t.title),
    detail: asString(t.detail),
    executable: asString(t.executable),
    evidenceLevel: asLevel(t.evidenceLevel),
    evidence: asString(t.evidence),
  }))

  const id = (obj.identity ?? {}) as Record<string, unknown>
  f.identity = {
    selfCall: asString(id.selfCall),
    callUser: asString(id.callUser),
    relation: asString(id.relation),
  }

  f.expressionDNA = asArray(obj.expressionDNA).map((b) => ({
    title: asString(b.title),
    lines: asStringArray(b.lines),
  }))

  f.socialBehavior = asArray(obj.socialBehavior).map((r) => ({
    scene: asString(r.scene),
    reaction: asString(r.reaction),
  }))

  f.boundaries = asStringArray(obj.boundaries)

  f.tensions = asArray(obj.tensions).map((t) => ({
    title: asString(t.title),
    surface: asString(t.surface),
    inner: asString(t.inner),
    unifier: asString(t.unifier),
    evidenceLevel: asLevel(t.evidenceLevel),
  }))

  f.constraints = asArray(obj.constraints).map((c) => ({
    forbidden: asString(c.forbidden),
    alternative: asString(c.alternative),
  }))

  return f
}

export function parseExtraction(text: string): { draft: ExtractionDraft } | { error: string } {
  const cleaned = unwrapJson(text)
  let obj: unknown
  try {
    obj = JSON.parse(cleaned)
  } catch {
    // 先修一次再放弃
    try {
      obj = JSON.parse(repairJson(cleaned))
    } catch (e) {
      return { error: `模型输出不是合法 JSON：${e instanceof Error ? e.message : String(e)}` }
    }
  }
  if (typeof obj !== 'object' || obj === null) return { error: '模型输出的 JSON 不是一个对象' }

  const rec = obj as Record<string, unknown>
  const cov = (rec.coverage ?? {}) as Record<string, unknown>

  return {
    draft: {
      name: asString(rec.name),
      tagline: asString(rec.tagline),
      frozen: normalizeFrozen(rec),
      coverage: { covered: asStringArray(cov.covered), missing: asStringArray(cov.missing) },
      raw: text,
    },
  }
}

/* ------------------------------------------------------------------ */
/* 调用                                                                */
/* ------------------------------------------------------------------ */

export interface ExtractionRun {
  /** 解析成功时才有；失败时是 undefined，而 `raw` 一定保留 */
  draft?: ExtractionDraft
  /** 模型原始输出 —— 解析失败时是唯一的排障入口，**不要丢** */
  raw: string
  model: string
  elapsedMs: number
  /** 解析失败的原因；成功时为 undefined */
  parseError?: string
}

/**
 * 跑一次提取。
 *
 * ⚠️ **解析失败不抛异常**，而是把 `raw` + `parseError` 一起返回 ——
 * 2026-09-20 实测踩过：一开始直接 throw，结果原始输出被丢掉，
 * 用户只看到一句「不是合法 JSON」，既没法自查也没法反馈。
 */
export async function runExtraction(
  material: string,
  provider: string,
  signal?: AbortSignal,
): Promise<ExtractionRun> {
  const res = await sendChat(
    {
      provider,
      system: EXTRACTION_SYSTEM,
      history: [],
      userInput: buildExtractionInput(material),
      temperature: EXTRACT_TEMPERATURE,
      maxTokens: EXTRACT_MAX_TOKENS,
      responseFormat: 'json',
    },
    signal,
  )

  const parsed = parseExtraction(res.content)
  if ('error' in parsed) {
    return { raw: res.content, model: res.model, elapsedMs: res.elapsedMs, parseError: parsed.error }
  }
  return { draft: parsed.draft, raw: res.content, model: res.model, elapsedMs: res.elapsedMs }
}

/** 供 UI 判断：上游是不是明确拒绝了 json 模式（有些 Ollama 模型不支持） */
export function isJsonModeUnsupported(e: unknown): boolean {
  return e instanceof ChatError && /response_format|json_object|400/i.test(e.message)
}
