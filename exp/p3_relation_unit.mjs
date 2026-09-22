/**
 * 关系推进单元断言（node --experimental-strip-types 直跑，不需要浏览器）
 *
 * 覆盖：stage 阶梯推导、delta 限幅、intimacy 边界、sharedEvent 去重/截断/容量、
 * 零变化返回原引用（这是快照「只在真实变化时生成」的前提）。
 */

import { emptyEvolving } from '../src/persona/evolving.ts'
import { applyRelationUpdate, INTIMACY_DELTA_LIMIT, SHARED_EVENTS_LIMIT, stageOf, STAGES } from '../src/persona/relation.ts'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

/* ---------- stage 阶梯 ---------- */
const stageCases = [
  [0, '初识'], [19, '初识'], [20, '熟络'], [39, '熟络'], [40, '常聊'],
  [64, '常聊'], [65, '亲近'], [89, '亲近'], [90, '知己'], [100, '知己'],
]
for (const [v, want] of stageCases) {
  check(`stageOf(${v}) → ${want}`, stageOf(v) === want)
}
check('阶梯单调递增', STAGES.every((s, i) => i === 0 || s.floor > STAGES[i - 1].floor))

/* ---------- delta 限幅（从 intimacy=5 起步，看夹取后的落点） ---------- */
const base = emptyEvolving()
const at5 = { ...base, relation: { stage: '初识', intimacy: 5, sharedEvents: [] } }
const clampFrom5 = (d) => applyRelationUpdate(at5, { intimacyDelta: d }).relation.intimacy
check('+5 → 5+2=7（上限生效）', clampFrom5(5) === 5 + INTIMACY_DELTA_LIMIT)
check('-9 → 5-2=3（下限生效）', clampFrom5(-9) === 5 - INTIMACY_DELTA_LIMIT)
check('+1 → 6（正常值不动）', clampFrom5(1) === 6)
check('NaN → 5（按 0 处理，不崩）', clampFrom5(Number('abc')) === 5)
check('0.7 → 6（先取整再夹）', clampFrom5(0.7) === 6)

/* ---------- intimacy 边界 ---------- */
const atZero = { ...base, relation: { stage: '初识', intimacy: 0, sharedEvents: [] } }
check('0 - 2 → 0（不穿底）', applyRelationUpdate(atZero, { intimacyDelta: -2 }).relation.intimacy === 0)
const atTop = { ...base, relation: { stage: '知己', intimacy: 100, sharedEvents: [] } }
check('100 + 2 → 100（不封顶穿出）', applyRelationUpdate(atTop, { intimacyDelta: 2 }).relation.intimacy === 100)

/* ---------- stage 随 intimacy 重推导（不信任外部阶段名） ---------- */
const stepped = applyRelationUpdate(base, { intimacyDelta: 2 })
check('单轮 +2 仍是初识(2)', stepped.relation.stage === '初识' && stepped.relation.intimacy === 2)
let grown = emptyEvolving()
for (let i = 0; i < 13; i++) grown = applyRelationUpdate(grown, { intimacyDelta: 2 })
check('连乘 13 轮 ×2 = 26 → 熟络', grown.relation.intimacy === 26 && grown.relation.stage === '熟络', `got ${grown.relation.intimacy}/${grown.relation.stage}`)

/* ---------- sharedEvent ---------- */
const ev1 = emptyEvolving()
const withEvent = applyRelationUpdate(ev1, { intimacyDelta: 1, sharedEvent: ' 一起决定周末去看海 ' })
check('事件入库且已去空白', withEvent.relation.sharedEvents.length === 1 && withEvent.relation.sharedEvents[0] === '一起决定周末去看海')
const dup = applyRelationUpdate(withEvent, { intimacyDelta: 0, sharedEvent: '一起决定周末去看海' })
check('重复事件不再入', dup.relation.sharedEvents.length === 1 && dup.relation.intimacy === withEvent.relation.intimacy)
const long = applyRelationUpdate(withEvent, { intimacyDelta: 0, sharedEvent: '很'.repeat(100) })
check('超长事件截断到 60 字', long.relation.sharedEvents[1]?.length === 60)
let acc = withEvent
for (let i = 0; i < 25; i++) acc = applyRelationUpdate(acc, { intimacyDelta: 0, sharedEvent: `事件${i}` })
check(`容量封顶 ${SHARED_EVENTS_LIMIT} 条（丢最旧）`, acc.relation.sharedEvents.length === SHARED_EVENTS_LIMIT && acc.relation.sharedEvents[0] === '事件5')

/* ---------- 零变化返回原引用 ---------- */
const untouched = emptyEvolving()
check('delta 0 + 无事件 → 原引用（快照跳过的前提）', applyRelationUpdate(untouched, { intimacyDelta: 0, sharedEvent: '' }) === untouched)

const failed = results.filter((r) => r.startsWith('❌')).length
console.log(results.join('\n'))
console.log(failed === 0 ? '\n🎉 单元断言全部通过' : `\n💥 ${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
