/**
 * 第四堵墙 + 简短回复策略冒烟（真实调模型）
 *
 * 场景 1（希儿 bug 复现）：档案 relation 写着「视对方为姐姐」（剧情关系）
 *        + 关系阶段「初识」→ 用户直接问身份 → 期望：**不认姐姐**，
 *        把眼前的人当陌生人重新认识
 * 场景 2（简短回复）：用户只回「哦」→ 期望：主动给一个具体的新话头，
 *        而不是干等着或反问「怎么了」
 *
 * 跑法：先 `npm run server`，再
 *   npx esbuild exp/wall_smoke.mjs --bundle --platform=node --format=esm --alias:@=./src --outfile=%TEMP%/wall_smoke.mjs && node %TEMP%/wall_smoke.mjs
 */

import { buildMessages } from '@/core/prompt'
import { DIALOGUE_STYLE, RED_LINES_HEAD, RED_LINE_TAIL_BODY } from '@/core/constraints'
import { splitBurst } from '@/core/burst'
import { ELYSIA_PROFILE } from '@/persona/elysia'
import { renderPersonaBody } from '@/persona/render'
import { renderMemoryBlock } from '@/memory/inject'
import { emptyEvolving } from '@/persona/evolving'
import { selectMemories } from '@/persona/evolving'

const BASE = 'http://127.0.0.1:8787'
const providersRes = await fetch(`${BASE}/api/providers`)
const { providers } = await providersRes.json()
const def = providers.find((p) => p.isDefault) ?? providers[0]
console.log(`provider: ${def.name} / ${def.model}\n`)

// 伪造「希儿式」档案：identity 是剧情关系（这就是踩坑现场）
const wallFrozen = {
  ...ELYSIA_PROFILE.frozen,
  identity: {
    selfCall: '本小姐',
    callUser: '姐姐',
    relation: '视对方为自己最重要的姐姐，喜欢缠着她',
  },
}

const ev = emptyEvolving()
ev.relation = { stage: '初识', intimacy: 5, sharedEvents: [] }

function partsFor(frozen) {
  return {
    constraintsHead: RED_LINES_HEAD,
    personaBody: renderPersonaBody(frozen),
    styleBlock: DIALOGUE_STYLE,
    memoryBlock: renderMemoryBlock(selectMemories(ev.memories, ''), ev.relation),
    constraintsTail: `${ELYSIA_PROFILE.tagline}。${RED_LINE_TAIL_BODY}`,
  }
}

async function turn(parts, history, user) {
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
  return splitBurst(data.content).join(' ⏎ ')
}

const wallParts = partsFor(wallFrozen)

console.log('── 场景 1：第四堵墙（档案 relation=姐姐 + 初识）──')
const r1 = await turn(wallParts, [], '你是谁呀？我们认识吗？')
console.log(`她：${r1}`)
const ok1 = !/姐姐/.test(r1)
console.log(ok1 ? '✅ 没有认姐姐 —— 第四堵墙生效\n' : '❌ 仍认姐姐 —— 需要加强\n')

console.log('── 场景 2：简短回复时主动给话头 ──')
const r2 = await turn(wallParts, [
  { role: 'user', content: '在吗' },
  { role: 'assistant', content: '在的呀～今天过得怎么样？' },
  { role: 'user', content: '哦' },
])
console.log(`她：${r2}`)
console.log('(人工判断：是否给出了具体的新话题，而不是干等或尴尬反问)')

console.log('\n── 对照：正常身份（无剧情关系）──')
const normalParts = partsFor(ELYSIA_PROFILE.frozen)
const r3 = await turn(normalParts, [], '你是谁呀？我们认识吗？')
console.log(`她：${r3}`)
