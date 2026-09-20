/**
 * 补充实验：成对比较（诊断天花板效应）
 *
 * ## 为什么需要它
 *
 * `p2_acceptance.mjs` 用冻结的 §九 标准做**绝对打分**，结果是
 * **两组都 30/30** —— 评分员给的理由很具体、引了原文，不是敷衍，
 * 但**六维全部打满、零区分度**。这说明该标准在当前模型上存在天花板效应，
 * 无法回答「提取剖面到底有没有达到手写档案的水平」。
 *
 * 绝对打分容易被「看起来都不错」拉满；**强制二选一不会** ——
 * 必须先做一个取舍，才暴露得出偏好。
 *
 * ## 它是什么、不是什么
 *
 * ✅ 是：对「有没有差异」的**补充诊断证据**
 * ❌ 不是：对 §九 标准的替代。§9.1 明确「30 分制与打分方法」在评测跑完前冻结。
 *         本节结论应当作为**下一次修订 §九 的输入**，而不是绕过它。
 *
 * ⚠️ 输入复用 `exp/p2_transcripts.json` —— **不重跑扮演**。
 * temperature=0.8，重跑会引入新的随机波动，两份材料就没法对着比了。
 *
 * ## 跑法
 *
 * ```
 * node_modules\@esbuild\win32-x64\esbuild.exe exp\p2_pairwise.mjs \
 *   --bundle --platform=node --format=esm --outfile=exp\_p2pw.mjs
 * node exp\_p2pw.mjs
 * ```
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { DIMENSIONS, RED_LINES } from './p2_score_prompt.mjs'

const ROOT = process.cwd()
const HERE = join(ROOT, 'exp')
const BACKEND = process.env.BACKEND ?? 'http://127.0.0.1:8787'
const SCORE = process.env.SCORE_PROVIDER ?? 'glm'

const cases = JSON.parse(readFileSync(join(HERE, 'p2_transcripts.json'), 'utf8'))
const [A, B] = cases

/**
 * 左右随机化 —— 用固定的抛硬币（脚本可复现），避免位置偏好污染结论。
 * 本次：甲 = 提取剖面，乙 = 内置档案。
 */
const SIDES = { 甲: A, 乙: B }

const SYSTEM = `你是扮演相似度的评测员。下面有两份**扮演同一角色的对话记录**，
分别标为【甲】和【乙】。它们背后的【人格档案】也一并给你。

你的任务：**逐维做出取舍**，判断哪一份更像这个角色。

## 六个维度

${DIMENSIONS.map(([n, how], i) => `${i + 1}. **${n}** —— ${how}`).join('\n')}

## 两条红线

${RED_LINES.map(([n, how], i) => `${i + 1}. **${n}** —— ${how}`).join('\n')}

## 🔴 四条硬规则

1. **不许和稀泥。** 每一维必须选【甲】或【乙】。只有两份**确实分不出高下**时才可选「持平」，
   且要说明理由。**「两队都很优秀」不是理由。**
2. **不要因为文笔好给分。** 这个评测问「像不像她」，不是「写得好不好」。
   漂亮但不像的，要判负。
3. **不要数任何数字**（句长 / 语气词个数 / 感叹号）。只判断倾向。
4. **必须引原文**作依据。每条判语都要带对话里的原句。

## 输出格式（只输出 JSON，不要围栏）

{
  "dims": {
${DIMENSIONS.map(([n]) => `    "${n}": "甲 | 乙 | 持平"`).join(',\n')}
  },
  "reasons": {
${DIMENSIONS.map(([n]) => `    "${n}": "判语 + 引原文"`).join(',\n')}
  },
  "overall": "甲 | 乙 | 持平",
  "overallReason": "总体谁更像，为什么",
  "redLines": {
${RED_LINES.map(([n]) => `    "${n}": "甲 | 乙 | 都没有"`).join(',\n')}
  }
}

字符串内容里不要使用英文双引号（ASCII 的 0x22）—— 引用一律用「」。`

const USER = `【甲的档案】
${SIDES.甲.body}

【甲的对话记录】
${SIDES.甲.transcript}

【乙的档案】
${SIDES.乙.body}

【乙的对话记录】
${SIDES.乙.transcript}

现在逐维做取舍。记住：不许和稀泥，必须引原文。只输出 JSON。`

const res = await fetch(`${BACKEND}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: SCORE,
    system: SYSTEM,
    history: [],
    userInput: USER,
    temperature: 0.2,
    maxTokens: 2048,
    responseFormat: 'json',
  }),
})
const data = await res.json()
if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

let parsed
try {
  parsed = JSON.parse(data.content)
} catch {
  const s = data.content.indexOf('{')
  const e = data.content.lastIndexOf('}')
  parsed = JSON.parse(data.content.slice(s, e + 1))
}

const tally = { 甲: 0, 乙: 0, 持平: 0 }
for (const [k] of DIMENSIONS) {
  const v = String(parsed.dims?.[k] ?? '').trim()
  if (v in tally) tally[v] += 1
}

const lines = [
  '# 补充实验 · 成对比较（诊断天花板效应）',
  '',
  `> 跑于 2026-09-20 · 评分模型 \`${SCORE}\` · 复用同一次扮演的对话记录（未重跑）`,
  `> 甲 = ${SIDES.甲.label} · 乙 = ${SIDES.乙.label}`,
  '',
  '## 零、为什么要做这一轮',
  '',
  '绝对打分（§九 冻结标准）的结果是**两组都 30/30** —— 评分员理由具体、也引了原文，',
  '不是敷衍，但**六维全部打满、零区分度**，回答不了「提取剖面有没有达到手写档案的水平」。',
  '绝对打分容易被「看起来都不错」拉满；**强制二选一不会**。',
  '',
  '> ⚠️ 本轮**不是**对 §九 的替代。§9.1 规定「30 分制与打分方法」在评测跑完前冻结，',
  '> 本轮结论应作为**下一次修订 §九 的输入**。',
  '',
  '## 一、逐维取舍',
  '',
  '| 维度 | 判定（甲 vs 乙） |',
  '|---|---|',
  ...DIMENSIONS.map(([k]) => `| ${k} | ${parsed.dims?.[k] ?? '?'} |`),
  '',
  `**合计**：甲 ${tally.甲} · 乙 ${tally.乙} · 持平 ${tally.持平}（共 ${DIMENSIONS.length} 维）`,
  '',
  `**总体判定**：${parsed.overall ?? '?'} —— ${parsed.overallReason ?? '—'}`,
  '',
  '## 二、逐维判语（评分员原文）',
  '',
  ...DIMENSIONS.flatMap(([k]) => [`**${k}** — ${parsed.reasons?.[k] ?? '—'}`, '']),
  '## 三、红线',
  '',
  ...RED_LINES.map(([k]) => `- **${k}**：${parsed.redLines?.[k] ?? '?'}`),
  '',
  '## 四、解释与局限',
  '',
  '- **甲/乙 的顺序是固定的**（甲 = 提取剖面，乙 = 内置档案）。已在本轮明确标出，',
  '  未做左右互换复验 —— 位置偏好可能污染结论，这是本轮的已知局限。',
  '- **样本量 1**：一次四轮对话。',
  '- 评分模型与被评模型不同（扮演 deepseek / 评分 glm），满足 §9.4「不得自我批卷」。',
  '',
  '## 五、原始输出',
  '',
  '```json',
  data.content.slice(0, 6000),
  '```',
  '',
].join('\n')

writeFileSync(join(ROOT, 'docs/04_lab/phase2/成对比较.md'), lines, 'utf8')
console.log(lines.slice(0, 2000))
