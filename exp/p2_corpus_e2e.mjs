/**
 * 语料通道端到端验收（A1+A2+B+A3 全链路）
 *
 * 前置：从真实崩坏3语料抽取爱莉希雅戏份最重的章节，生成小 JSONL fixture。
 * 流程：上传 JSONL → 选角色 → 章节勾选 → 拼装预览 → 保存素材库 →
 *       用作素材 → 提取（验证主角约束真的进了 prompt）→ 落库开聊。
 *
 * 跑法：薄后端（8787）+ preview（4173）起着。
 */

import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

import { chromium } from 'playwright'

const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'
const CORPUS =
  'D:/01_HJ_Work/00_Person/03_Github/08_persona-corpus/01_honkai3-dialogue-corpus/corpus.jsonl'
const PROTAGONIST = '爱莉希雅'

/* ---------- 生成 fixture：主角戏份最重的 3 章，全量行（含他人台词/旁白/未知） ---------- */
const perChapterRole = new Map()
const chapterName = new Map()
for (const line of readFileSync(CORPUS, 'utf-8').split('\n')) {
  if (!line.trim()) continue
  let o
  try {
    o = JSON.parse(line)
  } catch {
    continue
  }
  if (o.role === PROTAGONIST) {
    perChapterRole.set(o.chapter_id, (perChapterRole.get(o.chapter_id) ?? 0) + 1)
    chapterName.set(o.chapter_id, o.chapter)
  }
}
const top3 = Array.from(perChapterRole.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([id]) => id)
const top3Set = new Set(top3)
const lines = readFileSync(CORPUS, 'utf-8')
  .split('\n')
  .filter((l) => {
    if (!l.trim()) return false
    try {
      return top3Set.has(JSON.parse(l).chapter_id)
    } catch {
      return false
    }
  })
const FIXTURE = join(mkdtempSync(join(tmpdir(), 'pf_corpus_')), 'fixture.jsonl')
writeFileSync(FIXTURE, lines.join('\n'))
console.log(
  `fixture: ${lines.length} 行 / 章节 ${top3.map((id) => `${chapterName.get(id)}(${perChapterRole.get(id)}句)`).join('、')}`,
)

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
})

/** 抓提取请求 —— 验证主角约束真的进了 userInput */
let extractReq = ''
page.on('request', (r) => {
  if (r.method() !== 'POST' || !r.url().includes('/api/chat')) return
  try {
    const b = JSON.parse(r.postData() ?? '{}')
    const sys = String(b.system ?? '')
    if (sys.startsWith('你的任务')) extractReq = String(b.userInput ?? '')
  } catch {
    /* ignore */
  }
})

try {
  await page.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.deleteDatabase('true-self-echo')
        r.onsuccess = r.onerror = r.onblocked = () => res(null)
      }),
  )
  await page.goto(`${BASE}/feed`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  /* ---------- C1 上传 JSONL → 工作台出现 ---------- */
  await page.setInputFiles('input[type="file"]', FIXTURE)
  await page.waitForTimeout(1200)
  const panelVisible = await page.locator('text=语料预处理').isVisible()
  const statsText = await page.locator('text=已聚合').innerText().catch(() => '')
  check('C1 JSONL 上传 → 工作台出现（含统计）', panelVisible && statsText.includes('章'), statsText)

  /* ---------- C2 选角色（搜索 + 点选） ---------- */
  await page.fill('input[placeholder*="搜索角色名"]', PROTAGONIST)
  await page.waitForTimeout(300)
  await page.locator('button', { hasText: PROTAGONIST }).first().click()
  await page.waitForTimeout(500)
  const chapterList = await page.locator('text=她的句数').count()
  check('C2 选定主角 → 章节列表显示她的句数', chapterList >= 1, `${chapterList} 个章节有戏份`)

  /* ---------- C3 拼装预览 ---------- */
  const previewText = await page.locator('text=拼装结果').innerText().catch(() => '')
  check('C3 拼装预览出字数/句数', /拼装结果\s*[\d,]+ 字/.test(previewText.replace(/,/g, '')), previewText)

  /* ---------- C4 保存到素材库 ---------- */
  await page.click('button:has-text("保存为素材")')
  await page.waitForTimeout(600)
  const savedNotice = await page.locator('text=已保存').isVisible()
  check('C4 保存素材库成功提示', savedNotice)

  /* ---------- C5 用作素材 → 主流程接管 ---------- */
  await page.click('button:has-text("用作素材，继续投料")')
  await page.waitForTimeout(600)
  const sourcePicker = await page.locator('text=来源标注').isVisible()
  const protoBadge = await page
    .locator(`text=当前素材来自语料拼装 · 目标角色 ${PROTAGONIST}`)
    .isVisible()
  check('C5 用作素材 → 来源标注等主流程出现 + 目标角色状态条', sourcePicker && protoBadge)

  /* ---------- C6 素材库记录在列 ---------- */
  const libRow = await page.locator('li', { hasText: 'JSONL 语料' }).count()
  check('C6 素材库出现已保存记录', libRow >= 1)

  /* ---------- C7 提取：主角约束进 prompt ---------- */
  await page.click('button:has-text("开始提取")')
  await page.locator('button:has-text("存下来，去和它聊")').waitFor({ timeout: 240_000 })
  check(
    'C7 提取请求带目标角色约束（userInput 含「目标角色：爱莉希雅」+「绝不从他们的言行」）',
    extractReq.includes(`目标角色：${PROTAGONIST}`) && extractReq.includes('绝不从他们的言行中提取'),
    `userInput 长度=${extractReq.length}`,
  )

  /* ---------- C8 保存开聊 ---------- */
  await page.click('button:has-text("存下来，去和它聊")')
  await page.waitForURL(`${BASE}/`, { timeout: 30_000 })
  await page.waitForTimeout(1200)
  const persona = await page.evaluate(async () => {
    const open = () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('true-self-echo')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const db = await open()
    const rows = await new Promise((res) => {
      const rq = db.transaction('personas', 'readonly').objectStore('personas').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    db.close()
    return rows.map((p) => ({ name: p.profile?.name, kind: p.kind }))
  })
  const okPersona = persona.some((p) => p.kind === 'virtual')
  check('C8 语料提取的人格落库可开聊', okPersona, persona.map((p) => `${p.name}(${p.kind})`).join('/'))

  /* ---------- C9 导出/导入素材库往返 ---------- */
  await page.click('a:has-text("投料")')
  await page.waitForTimeout(800)
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.locator('button:has-text("导出")').first().click(),
  ])
  check('C9 素材可导出', dl !== null, dl ? dl.suggestedFilename() : '（无下载事件）')
} catch (e) {
  check('FATAL', false, e instanceof Error ? `${e.name}: ${e.message}` : String(e))
} finally {
  console.log('\n===== 语料通道 · E2E 验收 =====')
  for (const r of results) console.log(r)
  if (errors.length) {
    console.log('\n===== 页面错误 =====')
    for (const e of errors) console.log(' -', e)
  }
  const failed = results.filter((r) => r.startsWith('❌')).length
  console.log(`\n${failed === 0 && errors.length === 0 ? '🎉 全部通过' : `💥 ${failed} 项失败 / ${errors.length} 页面错误`}`)
  await browser.close()
  process.exit(failed === 0 && errors.length === 0 ? 0 : 1)
}
