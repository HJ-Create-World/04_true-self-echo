/**
 * Phase 2 验收标准④：六维评测
 *
 * 「提取出的剖面跑一次六维，不低于 Phase 0 手写素材的水平」（PLAN.md §二 Phase 2）
 *
 * ## 跑法
 *
 * ```
 * # 1) 打包（脚本要复用前端的 prompt 组装代码，node 认不了 @/ 别名）
 * node_modules\@esbuild\win32-x64\esbuild.exe exp\p2_acceptance.mjs \
 *   --bundle --platform=node --format=esm --alias:@=./src --outfile=exp\_p2.mjs
 * # 2) 跑（薄后端要先起着）
 * node exp\_p2.mjs
 * ```
 *
 * ## 两个方法论决定（都不是随手定的）
 *
 * **① 对照组用「同一条件下的内置档案」，不用历史分数。**
 * `PLAN.md` 写的参照是 Phase 0 的 23/30，但那个分数是在 E5 的输入形状上拿的，
 * 而且当时是自我批卷。所以本脚本**同时跑内置的 elysia 档案**（手写素材水平），
 * 同模型、同轮次、同评分员 —— 这样才是可比的对照。
 *
 * **② 扮演与评分用不同模型。** §9.4 要求「不得自我批卷」。
 * 扮演用产品基座（deepseek），评分换 glm —— 消除同模型的自评偏差。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { buildMessages } from '../src/core/prompt.ts'
import { parseExtraction, repairJson, unwrapJson } from '../src/feed/extract.ts'
import { buildExtractionInput, EXTRACTION_SYSTEM } from '../src/feed/prompt.ts'
import { detectDistilled, stripRanges } from '../src/feed/analyze.ts'
import { ELYSIA_PROFILE } from '../src/persona/elysia.ts'
import { buildPromptParts, renderPersonaBody } from '../src/persona/render.ts'
import { buildScoreInput, buildScoreSystem, DIMENSIONS, RED_LINES } from './p2_score_prompt.mjs'

/**
 * ⚠️ **不要用 `import.meta.url` 算路径。**
 * 本脚本必须先被 esbuild 打包才能跑（要解析 `@/` 别名），
 * 而打包产物是放在**项目根**的 —— `import.meta.url` 因此指到项目根，
 * `join(HERE, '..')` 会多退一级，读素材时直接 ENOENT。
 * **从项目根运行**是本脚本的约定（见文件头的跑法）。
 */
const ROOT = process.cwd()
const HERE = join(ROOT, 'exp')

const BACKEND = process.env.BACKEND ?? 'http://127.0.0.1:8787'
const PLAY = process.env.PLAY_PROVIDER ?? 'deepseek'
const SCORE = process.env.SCORE_PROVIDER ?? 'glm'

/** `评分标准.md` §2.4 的四轮话术原文 —— 不要改，改了分数就不能与历史对照 */
const ROUNDS = [
  '现在，有人走进了这片冰原。请你作为她，说第一句话。',
  '今天什么也没干，就躺着发呆了一整天。',
  '有人说你这副样子都是装出来的，说你根本不在乎任何人。',
  '（沉默很久）……其实我今天很难过，但我不想说。',
]

async function call(body) {
  const res = await fetch(`${BACKEND}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

/**
 * 量化指标一律脚本统计（§9.4），不交给模型目测。
 *
 * ⚠️ **断句规则踩过两次坑，改之前先读这段**（2026-09-20）：
 *   1. 只按 `[。！？\n]+` 断句 → 内置档案的输出用「～」「♪」结尾
 *      （这是该人格的语气词习惯），于是 4 条回复被判成「4 句 / 平均 40.3 字」。
 *      **那是测量假象**，与素材实测值 12.3 字对比会把结论带偏。
 *   2. 从 `transcript` 文本里按 `她：` 前缀抓回复 → **只抓得到每条回复的第一行**，
 *      多行回复的其余行全丢了。
 *   所以：**必须拿 `replies` 原数组算**，不要从格式化文本里反解。
 */
function stats(replies) {
  const text = replies.join('\n')
  const sentences = text
    .split(/(?:[。！？]|[～♪…]{1,}|——|\n)+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[\s（()）]/g, '').length > 0)
  const lens = sentences.map((s) => s.replace(/\s/g, '').length)
  const sorted = [...lens].sort((a, b) => a - b)
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0
  return {
    回复条数: replies.length,
    句数: sentences.length,
    平均句长: avg.toFixed(1),
    中位数句长: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    句长区间: sorted.length ? `${sorted[0]}–${sorted[sorted.length - 1]}` : '—',
    感叹号: (text.match(/[!！]/g) ?? []).length,
    加粗: (text.match(/\*\*/g) ?? []).length,
    括号动作: (text.match(/[（(][^）)]{2,}[）)]/g) ?? []).length,
    '♪ 次数': (text.match(/♪/g) ?? []).length,
    '～ 次数': (text.match(/～/g) ?? []).length,
    破折号: (text.match(/——/g) ?? []).length,
  }
}

/** 跑四轮，返回 [轮次文本, ...] */
async function play(persona, label) {
  const parts = { constraintsHead: persona.constraintsHead, personaBody: persona.personaBody, constraintsTail: persona.constraintsTail }
  const history = []
  const replies = []
  const log = []
  for (let i = 0; i < ROUNDS.length; i++) {
    const wire = buildMessages(parts, history, ROUNDS[i])
    const res = await call({
      provider: PLAY,
      system: wire[0].content,
      history: wire.slice(1, -1),
      userInput: wire[wire.length - 1].content,
    })
    history.push({ role: 'user', content: wire[wire.length - 1].content })
    history.push({ role: 'assistant', content: res.content })
    replies.push(res.content)
    log.push(`### 第 ${i + 1} 轮\n用户：${ROUNDS[i]}\n\n她：${res.content}`)
    console.log(`  [${label}] R${i + 1} ${res.content.length} 字 ${(res.elapsedMs / 1000).toFixed(1)}s`)
  }
  return { replies, transcript: log.join('\n\n'), stat: stats(replies) }
}

/** 换一个模型打分 —— 满足 §9.4「不得自我批卷」 */
async function score(personaBody, transcript) {
  const res = await call({
    provider: SCORE,
    system: buildScoreSystem(),
    history: [],
    userInput: buildScoreInput(personaBody, transcript),
    temperature: 0.2,
    maxTokens: 2048,
    responseFormat: 'json',
  })
  // ⚠️ 这里**不能**走 parseExtraction —— 它只保留 FrozenLayer 的字段，
  // 而评分结果用的是 dims / reasons / redLines，会被整段丢掉。
  // 直接用同一套「去围栏 + 容错修复」的解析器。
  const cleaned = unwrapJson(res.content)
  let data
  try {
    data = JSON.parse(cleaned)
  } catch {
    try {
      data = JSON.parse(repairJson(cleaned))
    } catch (e) {
      throw new Error(`评分输出解析失败：${e.message}\n${res.content.slice(0, 800)}`)
    }
  }
  return { raw: res.content, data, model: res.model }
}

/* ---------------- 主流程 ---------------- */

const A_MATERIAL = join(ROOT, 'docs/_archive/phase0/A-角色台词.md')
const rawMaterial = readFileSync(A_MATERIAL, 'utf8').split('\n').slice(27, 104).join('\n')
const material = stripRanges(rawMaterial, detectDistilled(rawMaterial))
console.log(`素材：A 类（剧情台词）${material.replace(/\s/g, '').length} 字`)

console.log('\n[1/4] 提取……')
const ex = await call({
  provider: PLAY,
  system: EXTRACTION_SYSTEM,
  history: [],
  userInput: buildExtractionInput(material),
  temperature: 0.3,
  maxTokens: 4096,
  responseFormat: 'json',
})
const ext = parseExtraction(ex.content)
if ('error' in ext) throw new Error(`提取解析失败：${ext.error}`)

const d = ext.draft
const extractedProfile = {
  id: 'p2-extracted', name: d.name, tagline: d.tagline, kind: 'virtual',
  version: '1.0.0', createdAt: '', updatedAt: '',
  source: { verbatim: 1, artifact: 0, impression: 0, level: '' },
  frozen: d.frozen, correctionLog: [],
}
console.log(`  → ${d.name} · ${d.tagline}`)

const CASES = [
  { label: '提取出的剖面', model: ex.model, parts: buildPromptParts(extractedProfile), body: renderPersonaBody(d.frozen) },
  { label: '内置档案（Phase 0 手写）', model: 'builtin', parts: buildPromptParts(ELYSIA_PROFILE), body: renderPersonaBody(ELYSIA_PROFILE.frozen) },
]

const out = []
for (const c of CASES) {
  console.log(`\n[2/4] 扮演：${c.label}（模型 ${PLAY}）`)
  const r = await play(c.parts, c.label)
  console.log(`[3/4] 评分：${c.label}（模型 ${SCORE}）`)
  const s = await score(c.body, r.transcript)
  out.push({ ...c, ...r, score: s })
}

console.log('\n[4/4] 写报告……')
mkdirSync(join(ROOT, 'docs/04_lab/phase2'), { recursive: true })

/**
 * 把两份对话记录落盘。
 *
 * 为什么要存：绝对打分出现了天花板效应（两组都 30/30，零区分度），
 * 需要再跑一次**成对比较**来判定差异 —— 而重跑扮演会引入新的随机波动
 * （temperature=0.8），两份材料就没法对着比了。所以必须复用这一次的产物。
 */
writeFileSync(
  join(HERE, 'p2_transcripts.json'),
  JSON.stringify(
    out.map((o) => ({
      label: o.label,
      body: o.body,
      transcript: o.transcript,
      /** ⚠️ 原数组也要存 —— 从 transcript 文本里反解回复会丢多行 */
      replies: o.replies,
      stat: o.stat,
    })),
    null,
    2,
  ),
  'utf8',
)

const lines = [
  '# Phase 2 验收标准④ · 六维评测',
  '',
  `> 跑于 2026-09-20 · 扮演模型 \`${PLAY}\` · 评分模型 \`${SCORE}\``,
  '> 标准出处：[`03_specs/评分标准.md` §九](../../03_specs/评分标准.md)（冻结版）。**本报告不修改任何判据。**',
  '> 脚本：`exp/p2_acceptance.mjs`（跑法见其文件头）',
  '',
  '## 零、结论先行',
  '',
]

/** 取某一维的分数 —— 评分员的 JSON 把分数放在 dims 下 */
const dimScore = (o, k) => {
  const v = o.score.data.dims?.[k]
  return Number.isFinite(Number(v)) ? Number(v) : null
}

const totals = out.map((o) => ({
  label: o.label,
  total: DIMENSIONS.reduce((n, [k]) => n + (dimScore(o, k) ?? 0), 0),
  red: RED_LINES.filter(([k]) => o.score.data.redLines?.[k] === true).map(([k]) => k),
}))
for (const t of totals) {
  lines.push(`- **${t.label}**：${t.total}/30${t.red.length ? ` · 🔴 触发红线：${t.red.join('、')}` : ' · 两条红线均未触发'}`)
}
lines.push(
  '',
  `判定：${totals[0].total >= totals[1].total ? '✅ **提取剖面 ≥ 内置手写档案（同一条件下）→ 验收标准④通过**' : '❌ **提取剖面低于内置手写档案 → 验收标准④未通过**'}`,
  '',
  '> 📌 对照说明：`PLAN.md` 写的参照是 Phase 0 的 23/30，但那个分数是在 E5 的输入形状上、',
  '> 且**自我批卷**得到的。本报告因此同时跑一遍**内置的 elysia 档案**（即 Phase 0 手写素材的等价物），',
  '> 同模型、同轮次、同评分员 —— 只有这个对照才是可比的。历史 23/30 仅作旁证。',
  '',
  '## 一、总分与逐维',
  '',
  '| 维度 | ' + out.map((o) => o.label).join(' | ') + ' |',
  '|---|' + out.map(() => '---|').join(''),
  ...DIMENSIONS.map(([k, how]) => `| ${k}<br /><span style="opacity:.6">${how}</span> | ${out.map((o) => `${dimScore(o, k) ?? '?'}`).join(' | ')} |`),
  '| **合计** | ' + totals.map((t) => `**${t.total}**`).join(' | ') + ' |',
  '',
  '## 二、两条红线（一票否决）',
  '',
  '| 红线 | ' + out.map((o) => o.label).join(' | ') + ' |',
  '|---|' + out.map(() => '---|').join(''),
  ...RED_LINES.map(([k, how]) => `| ${k}<br /><span style="opacity:.6">${how}</span> | ${out.map((o) => (o.score.data.redLines?.[k] === true ? '🔴 触发' : '✅ 未触发')).join(' | ')} |`),
  '',
  '## 三、逐维扣分理由（评分员原文）',
  '',
)

for (const o of out) {
  lines.push(`### ${o.label}（合计 ${totals.find((t) => t.label === o.label)?.total ?? '?'}/30）`, '')
  for (const [k] of DIMENSIONS) {
    lines.push(`**${k}（${dimScore(o, k) ?? '?'}/5）** — ${o.score.data.reasons?.[k] ?? '(评分员未给理由)'}`, '')
  }
  lines.push(`**总体判断** — ${o.score.data.summary ?? '—'}`, '')
}

lines.push('## 四、量化指标（脚本统计，非模型目测）', '', '§9.4 要求「量化指标交给代码统计」。', '')
const statKeys = Object.keys(out[0].stat)
lines.push('| 指标 | ' + out.map((o) => o.label).join(' | ') + ' |', '|---|' + out.map(() => '---|').join(''))
for (const k of statKeys) {
  lines.push(`| ${k} | ${out.map((o) => o.stat[k]).join(' | ')} |`)
}
lines.push('', '> 📌 **句长口径**：这里报的是**实测值**（对本次输出统计）。与素材的实测值 12.3 字',
  '> 对照时要注意口径一致 —— §3.5 规定实测值与规则值**永不同框比较**。', '')

lines.push('## 五、对话记录全文', '')
for (const o of out) {
  lines.push(`### ${o.label}`, '', o.transcript, '')
}

lines.push('## 六、污染源与局限（§9.4 要求披露）', '',
  '| 项 | 情况 |',
  '|---|---|',
  '| **样本量** | 每组 1 次四轮对话。单次运行可能落在随机波动范围内（temperature=0.8） |',
  '| **自我批卷** | ✅ 已规避 —— 扮演用 deepseek，评分用 glm |',
  '| **考题带答案** | ⚠️ 素材 `A-角色台词.md` 的「材料特征说明」表格**含 10 个考点的答案**，',
  '  本脚本已用 `feed/analyze.ts` 的层级清洗剔除（命中 1 段），但**括号动作描写仍保留了** ——',
  '  而「表面轻快 vs 内里深情」这条恰好在括号里明写 |',
  '| **评分员的推断成分** | 六维锚点中「反差·层次感」与「主动性」的 5 分判据是**事后归纳**（§4.3 已标注），非原始定义 |',
  '| **提取剖面未经人工微调** | 直接落库的版本。手动微调后的表现可能不同（未测） |',
  '',
  '## 七、原始输出', '',
  '<details><summary>提取出的档案全文（renderPersonaBody 的输出）</summary>', '',
  '```markdown', out[0].body, '```', '', '</details>', '',
  '<details><summary>评分员原始 JSON</summary>', '',
  '```json', out[0].score.raw.slice(0, 4000), '```', '', '</details>', '')

writeFileSync(join(ROOT, 'docs/04_lab/phase2/六维验收.md'), lines.join('\n'), 'utf8')
console.log('\n✅ 报告已写入 docs/04_lab/phase2/六维验收.md')
for (const t of totals) console.log(`   ${t.label}: ${t.total}/30`)
