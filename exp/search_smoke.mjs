/**
 * 现实话题搜索端到端冒烟（真实 Tavily 调用）
 *
 * 用法（key 可选，不设 key 只验证「无 key 静默降级」）：
 *   set TAVILY_KEY=tvly-xxxx
 *   npx esbuild exp/search_smoke.mjs --bundle --platform=node --format=esm --alias:@=./src --outfile=%TEMP%/search_smoke.mjs && node %TEMP%/search_smoke.mjs
 *
 * 验证：真实搜索能拿回结果、注入块措辞正确、无 key 时静默返回空。
 */

import { searchReality, renderSearchBlock, shouldSearch } from '@/core/search'

const key = process.env.TAVILY_KEY ?? ''
const query = '最近有什么值得关注的科技新闻'

console.log(`key: ${key ? `已提供（${key.slice(0, 8)}…）` : '未提供 —— 只验证静默降级'}\n`)

console.log(`shouldSearch("${query}") → ${shouldSearch(query)}\n`)

const t0 = Date.now()
const hits = await searchReality(query, key)
console.log(`搜索耗时 ${Date.now() - t0}ms，拿到 ${hits.length} 条`)
for (const h of hits) console.log(`  - ${h.title}\n    ${h.snippet.slice(0, 80)}`)

if (key && hits.length === 0) {
  console.log('\n❌ 有 key 但 0 条结果 —— 检查 key 或网络')
  process.exit(1)
}
if (!key && hits.length === 0) {
  console.log('\n✅ 无 key 静默返回空（功能不存在，不报错）—— 符合设计')
}

if (hits.length) {
  console.log(`\n── 注入块预览 ──\n${renderSearchBlock(query, hits)}`)
}
