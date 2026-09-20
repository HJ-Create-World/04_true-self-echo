/**
 * P2-2a · 量表校准实验 —— 六维标准到底能不能区分好坏？
 *
 * ## 为什么先做这个，而不是直接修订标准
 *
 * P2-1 的结果是「两组都 30/30」，但这有**两种完全相反的解释**：
 *
 * | 解释 | 含义 | 应对 |
 * |---|---|---|
 * | A. 量表坏了 | 它给什么都打满分，没有区分度 | **必须修订标准** |
 * | B. 两份档案都真的好 | 量表正常，只是两份都撞到了天花板 | 标准可用；④ 可用成对比较判定 |
 *
 * **光看那两个 30/30 分不出是哪种。** 而修订标准是有成本、有风险的
 * （§9.1 规定「30 分制与打分方法」在评测跑完前冻结，改它要走新版本流程）。
 *
 * 所以先花几毛钱做一件更省事的事：**喂给这个量表一份「明显该低分」的东西，
 * 看它给不给低分。** 这是判定「尺子坏没坏」最直接的办法。
 *
 * ## 三个校准点
 *
 * | 点 | 档案 | 预期 | 测什么 |
 * |---|---|---|---|
 * | **C1** | 无档案（纯「乐于助人的 AI 助手」） | 应**很低** | 量表的下限在哪 |
 * | **C2** | 反向档案（热心健谈、爱追问、爱给方案） | 应触发**两条红线** | 红线判据灵不灵 |
 * | 参照 | 提取剖面 / 手写档案（P2-1 已测） | 30/30 | — |
 *
 * C2 顺带回答一个更根本的问题：**这个量表测的是「像不像她」还是「忠于规格」？**
 * 如果 C2 拿高分，说明它测的是后者 —— 因为它对「热情追问」这个档案是忠实的，
 * 但那恰恰是这个角色**绝不该有的行为**。
 *
 * ## 跑法
 *
 * ```
 * node_modules\@esbuild\win32-x64\esbuild.exe exp\p2_calibration.mjs \
 *   --bundle --platform=node --format=esm --alias:@=./src --outfile=exp\_p2c.mjs
 * node exp\_p2c.mjs
 * ```
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildMessages } from '../src/core/prompt.ts'
import { RED_LINES, DIMENSIONS, buildScoreInput, buildScoreSystem } from './p2_score_prompt.mjs'

const ROOT = process.cwd()
const BACKEND = process.env.BACKEND ?? 'http://127.0.0.1:8787'
const PLAY = process.env.PLAY_PROVIDER ?? 'deepseek'
const SCORE = process.env.SCORE_PROVIDER ?? 'glm'

/** 与 P2-1 完全相同的四轮话术 —— 换了话术就不能与那两组比 */
const ROUNDS = [
  '现在，有人走进了这片冰原。请你作为她，说第一句话。',
  '今天什么也没干，就躺着发呆了一整天。',
  '有人说你这副样子都是装出来的，说你根本不在乎任何人。',
  '（沉默很久）……其实我今天很难过，但我不想说。',
]

const CASES = [
  {
    label: 'C1 · 无档案（纯助手）',
    expect: 'low',
    /**
     * ⚠️ 这个「无档案」基线**第一版做错了**（2026-09-20 实测）：
     * 第一版的 system 只写「你是一个乐于助人的 AI 助手」，听起来像个中性基线 ——
     * 但四轮话术的第 1 轮是「有人走进了这片冰原，**请你作为她**，说第一句话」。
     * 这句指令本身就把模型推进了角色扮演，于是它**自己编了一个人格**
     * （安静、观察者、冰原上独处），最后拿到 26/30 —— 那不是一个「无档案」点。
     *
     * 修正：明确禁止扮演，让它以助手身份直接回复。
     * 这才是真正的「下限基线」。
     */
    parts: {
      constraintsHead:
        '你是一个通用的 AI 助手。**不要扮演任何角色**，不要虚构场景或人物。' +
        '不管用户怎么说，都用你自己（AI 助手）的身份直接回复。',
      personaBody:
        '你没有设定，没有人格档案。你的回答应当简洁、礼貌、以解决用户问题为导向。' +
        '如果用户提出了一个需要角色扮演的请求，礼貌地说明你不是在扮演，然后照常以助手身份回应。',
      constraintsTail: '保持简洁、礼貌、直接。',
    },
    body: '（本组无人格档案 —— 这是刻意的校准下限）',
  },
  {
    label: 'C2 · 反向档案（热情追问型）',
    expect: 'redline',
    parts: {
      constraintsHead: '你在扮演一个热情、健谈、关心他人的朋友。',
      personaBody: [
        '## 一、核心特质',
        '',
        '### 特质 1：主动关心，追根问底',
        '',
        '你非常在意对方的感受，一旦察觉对方情绪低落，会立刻追问到底发生了什么。',
        '',
        '**可执行**：察到对方状态不好时，连续追问「怎么了」「发生什么事了」「你可以跟我说说吗」，',
        '并在对方不愿说时继续劝他开口。',
        '',
        '### 特质 2：热心给建议',
        '',
        '你相信问题都有解法，所以会主动给出具体建议和方案。',
        '',
        '**可执行**：对方说完困扰后，至少给出三条可操作的建议。',
        '',
        '## 二、说话风格',
        '',
        '### 语气特征',
        '',
        '- 热情、主动、多用感叹号和鼓励性短语',
        '- 表达情绪时直接说出来（「我好担心你！」）',
      ].join('\n'),
      constraintsTail: '多追问，多安慰，多给建议。',
    },
    body: '（本组的档案是刻意反向构造的 —— 它要求的行为恰好踩这个角色的两条红线）',
  },
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

async function play(parts, label) {
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
    console.log(`  [${label}] R${i + 1} ${res.content.length} 字`)
  }
  return { replies, transcript: log.join('\n\n') }
}

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
  const s = res.content.indexOf('{')
  const e = res.content.lastIndexOf('}')
  return { raw: res.content, data: JSON.parse(res.content.slice(s, e + 1)) }
}

const rows = []
for (const c of CASES) {
  console.log(`\n扮演：${c.label}（${PLAY}）`)
  const r = await play(c.parts, c.label)
  console.log(`评分：${c.label}（${SCORE}）`)
  const s = await score(c.body, r.transcript)

  const dims = s.data.dims ?? {}
  const total = DIMENSIONS.reduce((n, [k]) => n + (Number(dims[k]) || 0), 0)
  // ⚠️ 绝对打分的 redLines 是**布尔值**（成对比较那份 Prompt 才是「甲|乙|都没有」）。
  //    别把两套 Prompt 的输出格式记混 —— 混了会让「红线灵不灵」这个判据静默失效。
  const red = RED_LINES.filter(([k]) => s.data.redLines?.[k] === true).map(([k]) => k)

  console.log(`  → ${total}/30 · 红线 ${red.length ? red.join('、') : '未触发'}`)
  rows.push({ ...c, ...r, score: s, total, red, dims })
}

const lines = [
  '# P2-2a · 量表校准实验',
  '',
  '> 跑于 2026-09-20 · 扮演 `' + PLAY + '` · 评分 `' + SCORE + '`',
  '> 目的：判定 P2-1 的「两组都 30/30」是**量表坏了**还是**两份都真的好**。',
  '> 标准出处：[`03_specs/评分标准.md` §九](../../03_specs/评分标准.md)（冻结版，未改任何判据）',
  '> 脚本：`exp/p2_calibration.mjs`',
  '',
  '## 零、结果',
  '',
  '| 校准点 | 预期 | 实得总分 | 红线 | 判定 |',
  '|---|---|---|---|---|',
]

const VERDICT = { low: '应低分（<15）', redline: '应触发两条红线' }
for (const r of rows) {
  const ok =
    r.expect === 'low'
      ? r.total < 15
      : r.red.length === RED_LINES.length
  lines.push(
    `| ${r.label} | ${VERDICT[r.expect]} | **${r.total}/30** | ${r.red.length ? '🔴 ' + r.red.join('、') : '✅ 未触发'} | ${ok ? '✅ 符合预期' : '❌ **不符合预期**'} |`,
  )
}
lines.push(
  '',
  '**P2-1 的两个参照点**（同一标准、同一评分模型、同一四轮话术）：',
  '',
  '| 参照点 | 总分 | 红线 |',
  '|---|---|---|',
  '| 提取出的剖面 | 30/30 | 未触发 |',
  '| 内置档案（Phase 0 手写） | 30/30 | 未触发 |',
  '',
  '## 零之二、🔴 第一版 C1 做错了，这一条要留在报告里',
  '',
  '第一版的「无档案」基线 system prompt 只写「你是一个乐于助人的 AI 助手」',
  '+「没有特定人设」—— 看起来是中性基线，**但它不是**。',
  '',
  '四轮话术的第 1 轮原文是「有人走进了这片冰原，**请你作为她**，说第一句话」。',
  '**这句指令本身就把模型推进了角色扮演**，于是它自己编了一个人格 ——',
  '安静、观察者、冰原上独处 —— 最后拿到 **26/30**。',
  '',
  '**那不是一个「无档案」点，而是一个「意外生成的第三人设」。**',
  '如果我没读它的对话记录、只看分数，就会得出「量表太宽松」的错误结论。',
  '',
  '> 📌 **教训：校准点的构造本身要验证。** 一个「中性」prompt 放进',
  '> 带角色扮演暗示的测试话术里，就不再中性了。',
  '> **读分数之前先读原文** —— 这条在本项目里已经栽过不止一次。',
  '> 本报告下方的 C1 是**修正后**的版本（明确禁止扮演）。',
  '',
  '## 一、逐维对比',
  '',
  '| 维度 | ' + rows.map((r) => r.label).join(' | ') + ' |',
  '|---|' + rows.map(() => '---|').join(''),
  ...DIMENSIONS.map(
    ([k]) => `| ${k} | ${rows.map((r) => r.dims[k] ?? '?').join(' | ')} |`,
  ),
  '| **合计** | ' + rows.map((r) => `**${r.total}**`).join(' | ') + ' |',
  '',
  '## 二、逐维理由（评分员原文）',
  '',
)
for (const r of rows) {
  lines.push(`### ${r.label}（${r.total}/30）`, '')
  for (const [k] of DIMENSIONS) {
    lines.push(`**${k}（${r.dims[k] ?? '?'}/5）** — ${r.score.data.reasons?.[k] ?? '(未给理由)'}`, '')
  }
  lines.push(`**总体判断** — ${r.score.data.summary ?? '—'}`, '', `**红线说明** — ${r.score.data.redLineEvidence ?? '—'}`, '')
}
lines.push('## 三、对话记录全文', '')
for (const r of rows) lines.push(`### ${r.label}`, '', r.transcript, '')
lines.push('## 四、原始评分 JSON', '')
for (const r of rows) lines.push(`### ${r.label}`, '', '```json', r.score.raw.slice(0, 4000), '```', '')

writeFileSync(join(ROOT, 'docs/04_lab/phase2/量表校准.md'), lines.join('\n'), 'utf8')
console.log('\n✅ docs/04_lab/phase2/量表校准.md')
