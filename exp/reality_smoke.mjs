/**
 * 现实感知 + 内联独白综合冒烟（真实模型）
 *
 * 场景 A：问「今天星期几」—— 修复前她必然含糊（模型没有时钟），
 *         修复后 realityBlock 里有日期星期，应能答对
 * 场景 B：分享日常（「今天好冷啊」）—— 有天气/季节感知时应能接住
 * 场景 C：跑 3 轮观察〔心想〕是否偶尔出现（概率行为，不强求）
 *
 * 跑法：先 `npm run server`，再
 *   npx esbuild exp/reality_smoke.mjs --bundle --platform=node --format=esm --alias:@=./src --outfile=%TEMP%/reality_smoke.mjs && node %TEMP%/reality_smoke.mjs
 */

import { buildMessages } from '@/core/prompt'
import { DIALOGUE_STYLE, RED_LINES_HEAD, RED_LINE_TAIL_BODY } from '@/core/constraints'
import { renderRealityBlock } from '@/core/reality'
import { extractMonologue, splitBurst } from '@/core/burst'
import { ELYSIA_PROFILE } from '@/persona/elysia'
import { renderPersonaBody } from '@/persona/render'

const BASE = 'http://127.0.0.1:8787'
const { providers } = await (await fetch(`${BASE}/api/providers`)).json()
const def = providers.find((p) => p.isDefault) ?? providers[0]
console.log(`provider: ${def.name} / ${def.model}\n`)

console.log('── 现实区文本预览 ──')
console.log(await renderRealityBlock())
console.log('')

const parts = {
  constraintsHead: RED_LINES_HEAD,
  personaBody: renderPersonaBody(ELYSIA_PROFILE.frozen),
  styleBlock: DIALOGUE_STYLE,
  realityBlock: await renderRealityBlock(),
  constraintsTail: `${ELYSIA_PROFILE.tagline}。${RED_LINE_TAIL_BODY}`,
}

async function turn(history, user) {
  const wire = buildMessages(parts, history, user)
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: def.name,
      system: wire[0].content,
      history: wire.slice(1, -1),
      userInput: wire[wire.length - 1].content,
    }),
  })
  const data = await res.json()
  const { monologue, rest } = extractMonologue(data.content)
  return { burst: splitBurst(rest), monologue }
}

const hist = []
let monoCount = 0
const prompts = ['今天星期几来着？', '今天好冷啊，不想出门', '哈哈我也是']
for (const p of prompts) {
  const { burst, monologue } = await turn(hist, p)
  if (monologue) monoCount += 1
  console.log(`【用户】${p}`)
  if (monologue) console.log(`  〔心想〕${monologue}`)
  for (const b of burst) console.log(`  ─ ${b.replaceAll('\n', ' ⏎ ')}`)
  console.log()
  hist.push({ role: 'user', content: p })
  hist.push({ role: 'assistant', content: burst.join('\n\n') })
}

console.log(`3 轮中出现 ${monoCount} 次心想（概率行为，多数时候不写是正常的）`)
