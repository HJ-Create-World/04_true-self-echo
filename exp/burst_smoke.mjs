/**
 * 连发消息冒烟 —— 真实调一次模型，验证 DIALOGUE_STYLE 约束是否生效
 *
 * 跑法：先 `npm run server`（8787），再
 *   node --experimental-strip-types exp/burst_smoke.mjs
 *
 * 检查点：输出是否按空行拆出多条短消息（A1 的核心假设）。
 * 模型行为有随机性（temperature 0.8），连跑 3 轮看形态分布。
 */

import { buildMessages } from '../src/core/prompt.ts'
import { DIALOGUE_STYLE, RED_LINES_HEAD, RED_LINE_TAIL_BODY } from '../src/core/constraints.ts'
import { splitBurst } from '../src/core/burst.ts'
import { ELYSIA_PROFILE } from '../src/persona/elysia.ts'
import { renderPersonaBody } from '../src/persona/render.ts'

const BASE = 'http://127.0.0.1:8787'

const providersRes = await fetch(`${BASE}/api/providers`)
if (!providersRes.ok) {
  console.error('❌ 拉不到 /api/providers —— server 没起？')
  process.exit(1)
}
const { providers } = await providersRes.json()
const def = providers.find((p) => p.isDefault) ?? providers[0]
if (!def) {
  console.error('❌ 没有任何可用 provider —— 检查 .env')
  process.exit(1)
}
console.log(`provider: ${def.name} / ${def.model}\n`)

const parts = {
  constraintsHead: RED_LINES_HEAD,
  personaBody: renderPersonaBody(ELYSIA_PROFILE.frozen),
  styleBlock: DIALOGUE_STYLE,
  constraintsTail: `${ELYSIA_PROFILE.tagline}。${RED_LINE_TAIL_BODY}`,
}

const prompts = [
  '在吗，今天上班好累',
  '哈哈确实',
  '周末你一般干嘛呀',
]

let multiCount = 0
for (const user of prompts) {
  const wire = buildMessages(parts, [], user)
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: def.name,
      system: wire[0].content,
      history: [],
      userInput: wire[wire.length - 1].content,
    }),
  })
  if (!res.ok) {
    console.error(`❌ 上游 ${res.status}: ${(await res.text()).slice(0, 200)}`)
    process.exit(1)
  }
  const data = await res.json()
  const burst = splitBurst(data.content)
  const isMulti = burst.length > 1
  if (isMulti) multiCount += 1
  console.log(`【用户】${user}`)
  console.log(`【她 · ${burst.length} 条】`)
  for (const b of burst) console.log(`  ─ ${b.replaceAll('\n', ' ⏎ ')}`)
  console.log()
}

console.log(multiCount > 0
  ? `✅ 3 轮里 ${multiCount} 轮出现连发形态 —— 约束生效`
  : '⚠️ 3 轮都是单条 —— 连发是「兴头上才连发」，单轮不连发不一定是问题；建议换 prompt 再看。多轮都是单条才需要加强约束。')
