/**
 * 陪伴感切片 1/2 冒烟：记忆抽取的新产物（mood / openLoops / closedLoopIds）
 *
 * 场景 A：用户提到「下周有个面试，不知道行不行」→ 期望 openLoops 里有 followup、
 *         mood 可能有心事类情绪
 * 场景 B：用户正面回应「面试过了！」→ 把 A 的 loop 喂回去 → 期望 closedLoopIds 命中
 * 场景 C：闲聊「哈哈好玩」→ 期望 mood null 或平淡、loops 空（不硬造）
 *
 * 跑法：先 `npm run server`，再
 *   npx esbuild exp/companion_smoke.mjs --bundle --platform=node --format=esm --alias:@=./src --outfile=%TEMP%/companion_smoke.mjs && node %TEMP%/companion_smoke.mjs
 */

import { extractMemories } from '@/memory/extract'

// sendChat 用相对路径 /api/chat（浏览器语义）—— node 里补一个 origin
// ⚠️ 本文件是 .mjs（纯 JS），patch 里不能出现 TS 语法（as/satisfying），否则 esbuild 解析直接失败
const BASE = 'http://127.0.0.1:8787'
const origFetch = globalThis.fetch
globalThis.fetch = (input, init) =>
  typeof input === 'string' && input.startsWith('/') ? origFetch(BASE + input, init) : origFetch(input, init)

const { providers } = await (await fetch(`${BASE}/api/providers`)).json()
const def = providers.find((p) => p.isDefault) ?? providers[0]
console.log(`provider: ${def.name} / ${def.model}\n`)

console.log('── 场景 A：面试（应产出 followup loop + 可能的情绪）──')
const a = await extractMemories(
  def.name,
  '我下周有个面试，也不知道行不行的，好紧张',
  '紧张很正常呀，说明你在乎。是什么样的面试呀？',
)
console.log(`mood: ${JSON.stringify(a.mood)}`)
console.log(`openLoops: ${JSON.stringify(a.openLoops)}`)
console.log(`memories: ${a.cards.map((c) => c.content).join(' / ') || '（无）'}\n`)

const fakeLoop = { id: 'lp_test1', content: '用户下周有个面试' }
console.log('── 场景 B：面试过了（喂入现有 loop，期望闭环）──')
const b = await extractMemories(
  def.name,
  '跟你说！上次说的那个面试，我过了！！',
  '真的吗！！太好了吧，我就知道你可以的！',
  [fakeLoop],
)
console.log(`closedLoopIds: ${JSON.stringify(b.closedLoopIds)}`)
console.log(`mood: ${JSON.stringify(b.mood)}`)

console.log('\n── 场景 C：闲聊（期望不硬造）──')
const c = await extractMemories(def.name, '哈哈好玩', '对吧对吧，我也觉得♪')
console.log(`mood: ${JSON.stringify(c.mood)}`)
console.log(`openLoops: ${JSON.stringify(c.openLoops)} / closed: ${JSON.stringify(c.closedLoopIds)}`)
