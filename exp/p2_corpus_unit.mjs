/**
 * corpus.ts 单元验收 —— 用真实语料的代表性切片（含 OCR 噪声变体）
 *
 * 跑法：node --experimental-strip-types exp/p2_corpus_unit.mjs
 */

import {
  assembleMaterial,
  countByChapter,
  matchesProtagonist,
  normalizeRole,
  parseCorpus,
} from '../src/feed/corpus.ts'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

/* ---------- normalizeRole：OCR 噪声变体 ---------- */
check('N1 干净名不动', normalizeRole('布洛妮娅') === '布洛妮娅')
check('N2 全名保留（匹配靠子串）', normalizeRole('布洛妮娅·扎伊切克') === '布洛妮娅·扎伊切克')
check('N3 引号包裹剥掉', normalizeRole("'布洛妮娅'") === '布洛妮娅')
check('N4 问号包裹剥掉', normalizeRole('?布洛妮娅?') === '布洛妮娅')
check('N5 多人合并 → 丢弃', normalizeRole('布洛妮娅&希儿&莉莉娅') === '')
check('N6 「与」合并 → 丢弃', normalizeRole('琪亚娜与布洛妮娅') === '')
check('N7 整句误当角色名 → 丢弃', normalizeRole('琪亚娜与布洛妮娅对望一眼。') === '')
check('N8 未知标记保留（由上层按 type 处理）', normalizeRole('<unknown>') === '<unknown>')

/* ---------- matchesProtagonist：子串双向 ---------- */
check('M1 精确命中', matchesProtagonist('布洛妮娅', '布洛妮娅'))
check('M2 全名变体命中', matchesProtagonist('布洛妮娅·扎伊切克', '布洛妮娅'))
check('M3 称谓变体命中', matchesProtagonist('布洛妮娅姐姐', '布洛妮娅'))
check('M4 噪声包裹命中', matchesProtagonist("'布洛妮娅'", '布洛妮娅'))
check('M5 他人不命中', !matchesProtagonist('琪亚娜', '布洛妮娅'))
check('M6 多人合并不命中', !matchesProtagonist('布洛妮娅&琪亚娜', '布洛妮娅'))

/* ---------- parseCorpus：真实切片 ---------- */
const RAW = [
  '{"chapter": "主线1", "chapter_id": 1, "utter_id": "1-0", "type": "dialogue", "role": "<unknown>", "content": "踩到发光处跳跃"}',
  '{"chapter": "主线1", "chapter_id": 1, "utter_id": "1-1", "type": "dialogue", "role": "琪亚娜", "content": "姬子……飞机坏了……"}',
  '{"chapter": "主线1", "chapter_id": 1, "utter_id": "1-2", "type": "dialogue", "role": "布洛妮娅·扎伊切克", "content": "库库库，架构很稳定。"}',
  '{"chapter": "主线1", "chapter_id": 1, "utter_id": "1-3", "type": "narration", "role": "narration", "content": "沧海市东南34公里上空"}',
  '{"chapter": "主线1", "chapter_id": 1, "utter_id": "1-4", "type": "dialogue", "role": "布洛妮娅姐姐", "content": "这事就交给布洛妮娅吧。"}',
  '这不是JSON',
  '{"chapter": "", "chapter_id": 2, "type": "dialogue", "role": "琪亚娜", "content": "缺字段"}',
  '{"chapter": "主线2", "chapter_id": 2, "utter_id": "2-0", "type": "dialogue", "role": "布洛妮娅&琪亚娜", "content": "一起上！"}',
  '{"chapter": "主线2", "chapter_id": 2, "utter_id": "2-1", "type": "dialogue", "role": "布洛妮娅", "content": "重装小兔，展开。"}',
].join('\n')

const parsed = parseCorpus(RAW)
check('P1 台词计数（主角变体归并 2 句）', parsed.dialogues === 4 && parsed.narrations === 1, `dialogues=${parsed.dialogues}`)
check('P2 坏行计数 2（非JSON + 缺字段）', parsed.badLines === 2)
check('P3 未知 + 多人合并都进 dropped', parsed.droppedLines === 2)
check('P4 章节两章，各自行数', parsed.chapters.length === 2 && parsed.chapters[0].count === 5 && parsed.chapters[1].count === 2)
const bronya = parsed.roles.find((r) => r.name === '布洛妮娅')
check('P5 变体聚合到短名键（布洛妮娅 2 句）', bronya?.count === 2, JSON.stringify(parsed.roles.slice(0, 3)))
check('P6 未知行 type=unknown（不进角色统计）', !parsed.roles.some((r) => r.name === '<unknown>'))

/* ---------- countByChapter ---------- */
const perCh = countByChapter(parsed.utterances, '布洛妮娅')
check('C1 主角每章句数（ch1=2 变体句, ch2=1）', perCh.get(1) === 2 && perCh.get(2) === 1)

/* ---------- assembleMaterial：邻接窗口 ---------- */
// ch1 全选：主角句 1-2 和 1-4；1-2 邻接 1-1（琪亚娜，上下文）+1-3（旁白默认关→丢弃）
// 1-4 邻接 1-3（旁白，关）—— 1-4 是最后一句无后邻
const names = new Map([
  [1, '主线1黄昏'],
  [2, '主线2'],
])
const asm = assembleMaterial(parsed.utterances, {
  protagonist: '布洛妮娅',
  chapterIds: [1, 2],
  includeNarration: false,
  includeUnknown: false,
})
check(
  'A1 主角句全留',
  asm.text.includes('库库库') && asm.text.includes('交给布洛妮娅吧') && asm.text.includes('重装小兔'),
)
check('A2 前邻他人台词保留（上下文）', asm.text.includes('姬子……飞机坏了'))
check('A3 后邻旁白默认不进', !asm.text.includes('沧海市'))
check('A4 未知默认不进', !asm.text.includes('踩到发光处'))
check('A5 多人合并行不进', !asm.text.includes('一起上'))
check('A6 章节头在场', asm.text.includes('【主线1】') && asm.text.includes('【主线2】'))
check('A7 used 章节记录', asm.usedChapterIds.join(',') === '1,2')

/* ---------- assembleMaterial：字数上限在章节边界停 ---------- */
const tiny = assembleMaterial(parsed.utterances, {
  protagonist: '布洛妮娅',
  chapterIds: [1, 2],
  maxChars: 60, // 只装得下第一章
})
check(
  'L1 超 上限在章节边界截断',
  tiny.usedChapterIds.length === 1 && tiny.usedChapterIds[0] === 1 && tiny.truncated,
  `used=${tiny.usedChapterIds} chars=${tiny.chars}`,
)
const zeroGuard = assembleMaterial(parsed.utterances, {
  protagonist: '不存在的角色',
  includeUnknown: false,
})
check('L2 无主角句 → 空文本不崩', zeroGuard.chars === 0 && !zeroGuard.truncated)

/* ---------- 全量真实语料冒烟（文件在外部目录，存在才跑） ---------- */
try {
  const { readFileSync } = await import('node:fs')
  const FULL = 'D:/01_HJ_Work/00_Person/03_Github/08_persona-corpus/01_honkai3-dialogue-corpus/corpus.jsonl'
  const full = parseCorpus(readFileSync(FULL, 'utf-8'))
  check('F1 全量 92k 句解析无崩溃', full.totalLines > 90_000, `lines=${full.totalLines}`)
  const elysiaCount = full.roles.find((r) => r.name === '爱莉希雅')?.count ?? -1
  check('F2 爱莉希雅 ≈ 1669 句（归并容差 ±5%）', elysiaCount >= 1580 && elysiaCount <= 1760, `count=${elysiaCount}`)
  check(
    'F3 Top 角色表可用（前 20 覆盖主要角色；长尾 589 个靠搜索，不塞下拉）',
    full.roles.slice(0, 20).some((r) => r.name === '爱莉希雅') &&
      full.roles.slice(0, 20).some((r) => r.name === '芽衣') &&
      full.roles[0].count > 4000,
    `top1=${full.roles[0].name}:${full.roles[0].count}`,
  )
  const asm2 = assembleMaterial(full.utterances, {
    protagonist: '爱莉希雅',
    chapterIds: full.chapters.map((c) => c.id),
    maxChars: 20_000,
  })
  check(
    'F4 全量拼装 ≤ 2 万字 + 章节截断生效',
    asm2.chars <= 20_000 && asm2.utterances > 100 && asm2.usedChapterIds.length < full.chapters.length,
    `chars=${asm2.chars} utts=${asm2.utterances} chapters=${asm2.usedChapterIds.length}/${full.chapters.length}`,
  )
} catch (e) {
  results.push(`⏭️ F1-F4 跳过（真实语料不可达：${e instanceof Error ? e.message : String(e)}）`)
}

const failed = results.filter((r) => r.startsWith('❌')).length
console.log(results.join('\n'))
console.log(failed === 0 ? '\n🎉 单元断言全部通过' : `\n💥 ${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
