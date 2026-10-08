/**
 * 现实话题搜索单元断言（纯函数部分）
 *
 * 覆盖 shouldSearch（预筛宁可漏不可滥）与 renderSearchBlock（注入措辞）。
 * searchReality 是网络调用，走 exp/search_smoke.mjs（可选真实 key）。
 */

import { renderSearchBlock, shouldSearch } from '../src/core/search.ts'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

/* ---------- shouldSearch：命中（分享/求证/好奇） ---------- */
const hits = [
  '你看昨天那个发布会了吗',
  '最近有什么大新闻吗',
  '听说那个游戏出新角色了',
  'XX上热搜了你知道吧',
  '那个新番开播了，怎么样了',
]
for (const t of hits) check(`命中「${t}」`, shouldSearch(t))

/* ---------- shouldSearch：不命中（指令/太短/日常） ---------- */
const misses = [
  '帮我查一下天气',        // 指令式 —— 那是助手功能
  '帮我翻译这句',          // 同上
  '在吗',                  // 太短
  '今天好累啊',            // 纯情绪分享，无需现实信息
  '晚安',                  // 寒暄
]
for (const t of misses) check(`不命中「${t}」`, !shouldSearch(t))

/* ---------- renderSearchBlock：注入措辞 ---------- */
const block = renderSearchBlock('某发布会', [
  { title: '某品牌发布新品', snippet: '搭载新芯片，起售价 4999 元' },
])
check('注入块含查询主题', block.includes('某发布会'))
check('措辞是「你了解到」（大方聊）', block.includes('你了解到') && block.includes('大方聊'))
check('结果带标题与摘要', block.includes('某品牌发布新品') && block.includes('4999'))

check('空结果 → 空串（区块无痕）', renderSearchBlock('x', []) === '')

const failed = results.filter((r) => r.startsWith('❌'))
console.log(results.join('\n'))
console.log(`\n${failed.length === 0 ? '✅ 全部通过' : `❌ ${failed.length} 项失败`}（共 ${results.length} 项）`)
process.exit(failed.length === 0 ? 0 : 1)
