/**
 * 连发消息单元断言（node --experimental-strip-types 直跑，不需要浏览器）
 *
 * 覆盖 splitBurst / burstDelay（2026-09-29 体验迭代 · A1 AI 连发）：
 * - 空行拆条、空白段丢弃、无空行退化为单条（内容零变化的兜底）
 * - 超上限合并回最后一条（铁律：内容永不丢）
 * - 延迟曲线：基础值、随字数递增、封顶
 */

import { MAX_BURST, burstDelay, extractMonologue, splitBurst } from '../src/core/burst.ts'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

/* ---------- splitBurst：基本拆条 ---------- */
const three = splitBurst('hi~\n\n你今天过的好吗\n\n有没有什么有意思的事情')
check(
  '三条连发拆成 3 条',
  three.length === 3 && three[0] === 'hi~' && three[1] === '你今天过的好吗' && three[2] === '有没有什么有意思的事情',
  JSON.stringify(three),
)

/* ---------- 无空行 = 单条（模型没按约定输出时的天然退化） ---------- */
check('无空行原文返回', JSON.stringify(splitBurst('一段完整的回复，中间有逗号，还有句号。')) === JSON.stringify(['一段完整的回复，中间有逗号，还有句号。']))
check('无空行时内容逐字不变', splitBurst('abc\ndef')[0] === 'abc\ndef')

/* ---------- 空白段丢弃（结尾多敲的空行、纯空白的行） ---------- */
const trailing = splitBurst('第一条\n\n第二条\n\n\n\n  \n')
check('尾部空白段被丢弃', trailing.length === 2 && trailing[1] === '第二条', JSON.stringify(trailing))

/* ---------- 超上限：多余的合并回最后一条（内容永不丢） ---------- */
const nine = Array.from({ length: 9 }, (_, i) => `第${i + 1}条`)
const burst9 = splitBurst(nine.join('\n\n'))
const rejoined = burst9[MAX_BURST - 1].split('\n\n')
check(`9 条超限 → 拆成 ${MAX_BURST} 条`, burst9.length === MAX_BURST, `实际 ${burst9.length}`)
check('前 5 条完整保留', burst9.slice(0, MAX_BURST - 1).every((s, i) => s === nine[i]))
check('剩余 4 条按空行合并进最后一条', rejoined.length === 4 && rejoined[0] === nine[5] && rejoined[3] === nine[8], JSON.stringify(rejoined))

/* ---------- 内容守恒：拆条前后总文本一致（拼接等价） ---------- */
const long = Array.from({ length: 12 }, (_, i) => `msg${i}`).join('\n\n')
check(
  '12 条超限内容守恒',
  splitBurst(long).join('\n\n') === long,
)

/* ---------- 空输入 ---------- */
check('空串 → 空数组', splitBurst('').length === 0)
check('纯空白 → 空数组', splitBurst('  \n\n \n').length === 0)

/* ---------- burstDelay：节奏曲线 ---------- */
check('短消息 ≈ 基础延迟', burstDelay('hi') === 600 + 2 * 40, `${burstDelay('hi')}ms`)
check('随字数递增', burstDelay('一二三四五六七八九十') > burstDelay('一二三'))
check('封顶 3200ms', burstDelay('x'.repeat(500)) === 3200, `${burstDelay('x'.repeat(500))}ms`)

/* ---------- extractMonologue：内联独白（2026-10-08） ---------- */
const withMono = extractMonologue('〔心想〕他今天好像有点累\n\n在的呀～\n\n怎么啦')
check('剥出独白', withMono.monologue === '他今天好像有点累', JSON.stringify(withMono.monologue))
check('剩余内容不含独白行', !withMono.rest.includes('〔心想〕') && withMono.rest.includes('在的呀～'))
const noMono = extractMonologue('普通的回复，没有独白')
check('无独白时原样返回', noMono.monologue === '' && noMono.rest === '普通的回复，没有独白')
const monoMid = extractMonologue('第一句\n〔心想〕忽然想起昨天的事\n第二句')
check('独白夹在中间也能剥出', monoMid.monologue === '忽然想起昨天的事' && monoMid.rest === '第一句\n第二句', JSON.stringify(monoMid))

/* ---------- 汇总 ---------- */
const failed = results.filter((r) => r.startsWith('❌'))
console.log(results.join('\n'))
console.log(`\n${failed.length === 0 ? '✅ 全部通过' : `❌ ${failed.length} 项失败`}（共 ${results.length} 项）`)
process.exit(failed.length === 0 ? 0 : 1)
