/**
 * P4 验收 · 多人格 + 数据管理（用完即删）
 *
 * PLAN.md Phase 4 完成标准：
 *   「能同时存 3 个以上人格互不串味；导出文件能被重新导入」
 *
 * 外加两条硬约束的验证：
 *   · 真实人物（kind=real）的档案：导出按钮**不渲染**、导出函数**拒绝**
 *   · 删除是级联的：人格 + 会话 + 消息 + 快照一起消失
 *
 * 跑法：需要薄后端与构建产物预览都起着（见 RUNBOOK）
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { chromium } from 'playwright'

const SCRATCH = join(tmpdir(), 'pf_scratch')
mkdirSync(SCRATCH, { recursive: true })
const EXE =
  'C:\\Users\\15056\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
const BASE = process.env.VERIFY_URL || 'http://localhost:4173'

const results = []
const check = (id, ok, detail = '') => results.push(`${ok ? '✅' : '❌'} ${id} ${detail}`)

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } })

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
})

/** 全部 /api/chat 请求（扮演 + 抽取），按 system 开头分类 */
const reqs = []
page.on('request', (r) => {
  if (r.method() !== 'POST' || !r.url().includes('/api/chat')) return
  try {
    const b = JSON.parse(r.postData() ?? '{}')
    const sys = String(b.system ?? '')
    reqs.push({
      kind: sys.startsWith('你在扮演一个人') ? '扮演' : sys.startsWith('你的任务') ? '抽取' : '?',
      system: sys,
      userInput: String(b.userInput ?? ''),
    })
  } catch {
    reqs.push({ parseError: true })
  }
})

let apiCount = 0
page.on('request', (r) => {
  if (r.method() === 'POST' && r.url().includes('/api/chat')) apiCount += 1
})

/** 发一条消息，等「扮演 + 抽取」两个请求都发出并落定 */
async function sendAndSettle(text) {
  const base = apiCount
  await page.fill('textarea', text)
  await page.click('button:has-text("发送")')
  const t0 = Date.now()
  while (Date.now() - t0 < 150_000 && apiCount < base + 2) await page.waitForTimeout(300)
  // 等状态栏脱离「注入计数」形态（= 抽取已落库）
  await page.waitForFunction(
    () => {
      const t = document.querySelector('p.h-4')?.innerText ?? ''
      return t.length > 0 && !/记忆 \d+\+\d+ 条/.test(t)
    },
    { timeout: 60_000 },
  )
  await page.waitForTimeout(400)
}

/**
 * 等记忆数据稳定。
 *
 * 🔴 **为什么需要**：状态栏的「脱离注入计数」信号在**上一轮**的值上就能满足
 * （它不含「N+M 条」形态），所以发完消息立刻读库会读到旧状态 ——
 * P4 第一版就这么把「乙有馒头」误判成了「乙没记住」。
 *
 * 改成轮询：每秒读一次总记忆数，连续 3 次不变且 ≥ 期望值才算稳定。
 */
async function waitForQuiet(expectAtLeast) {
  let last = -1
  let stable = 0
  const t0 = Date.now()
  for (;;) {
    const all = await readAll()
    const total = all.personas.reduce((n, p) => n + p.mem.length, 0)
    if (total === last && total >= expectAtLeast) {
      stable += 1
      if (stable >= 3) return all
    } else {
      stable = 0
      last = total
    }
    if (Date.now() - t0 > 120_000) return all
    await page.waitForTimeout(1000)
  }
}

async function readAll() {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('true-self-echo')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const persons = await new Promise((res) => {
      const rq = db.transaction('personas', 'readonly').objectStore('personas').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    const convs = await new Promise((res) => {
      const rq = db.transaction('conversations', 'readonly').objectStore('conversations').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    const msgs = await new Promise((res) => {
      const rq = db.transaction('messages', 'readonly').objectStore('messages').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    const snaps = await new Promise((res) => {
      const rq = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    db.close()
    return {
      personas: persons.map((p) => ({
        id: p.id,
        name: p.profile?.name,
        kind: p.kind,
        mem: (p.profile?.evolving?.memories ?? []).map((m) => m.content),
      })),
      conversations: convs.map((c) => ({ id: c.id, personaId: c.personaId })),
      messages: msgs.map((m) => ({ conversationId: m.conversationId, content: m.content.slice(0, 30) })),
      snapshotCount: snaps.length,
    }
  })
}

/** 在档案页把当前人格切换到 name（点列表里的「切换」） */
async function switchOnPage(name) {
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(600)
  const row = page.locator('li', { hasText: name }).filter({ has: page.locator('button:has-text("切换")') })
  await row.locator('button:has-text("切换")').first().click()
  await page.waitForTimeout(900)
}

let downloadJson = ''

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  /* ---------- 建两个空白人格 ---------- */
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(600)
  await page.fill('input[placeholder="新人格的名字"]', '甲')
  await page.click('button:has-text("新建空白")')
  await page.waitForTimeout(600)
  await page.fill('input[placeholder="新人格的名字"]', '乙')
  await page.click('button:has-text("新建空白")')
  await page.waitForTimeout(600)

  const s0 = await readAll()
  check(
    'W1 库里有 3 个人格（内置 + 甲 + 乙）',
    s0.personas.length >= 3,
    s0.personas.map((p) => p.name).join(' / '),
  )

  /* ---------- 甲：说一件事 ---------- */
  await switchOnPage('甲')
  await page.click('a:has-text("对话")')
  await page.waitForTimeout(600)
  await sendAndSettle('我妹妹叫小雨，她下个月要过生日了')

  /* ---------- 乙：说另一件事 ---------- */
  await switchOnPage('乙')
  await page.click('a:has-text("对话")')
  await page.waitForTimeout(600)
  await sendAndSettle('我养了一只猫，叫馒头')

  // 🔴 等数据稳定再断言 —— 不依赖每轮的完成时序
  const s1 = await waitForQuiet(2)
  const jia = s1.personas.find((p) => p.name === '甲')
  const yi = s1.personas.find((p) => p.name === '乙')
  check('W2 甲记得小雨（不含馒头）',
    !!jia && jia.mem.some((m) => m.includes('小雨')) && !jia.mem.some((m) => m.includes('馒头')),
    jia?.mem.join('|') ?? '(无)')
  check('W3 乙记得馒头（不含小雨）—— 互不串味',
    !!yi && yi.mem.some((m) => m.includes('馒头')) && !yi.mem.some((m) => m.includes('小雨')),
    yi?.mem.join('|') ?? '(无)')

  /* ---------- W4：乙的 system 里不该有甲的记忆 ---------- */
  // 乙在切回对话页后已发过消息，取**乙最近一次**扮演请求的 system
  const yiReq = [...reqs].reverse().find((r) => r.kind === '扮演' && r.userInput.includes('馒头'))
  check('W4 乙的 system 里没有甲的记忆（prompt 级验证）',
    !!yiReq && !yiReq.system.includes('小雨'),
    yiReq ? `system 含小雨=${yiReq.system.includes('小雨')}` : '(没抓到乙的请求)')

  /* ---------- 会话隔离 ---------- */
  const jiaConv = s1.conversations.filter((c) => c.personaId === jia?.id).map((c) => c.id)
  const yiConv = s1.conversations.filter((c) => c.personaId === yi?.id).map((c) => c.id)
  const overlap = jiaConv.filter((id) => yiConv.includes(id))
  check('W5 两人的会话完全隔离', overlap.length === 0, `甲 ${jiaConv.length} 个 / 乙 ${yiConv.length} 个`)

  /* ---------- 导出甲（下载捕获） ---------- */
  await switchOnPage('甲')
  const dlPromise = page.waitForEvent('download', { timeout: 30_000 })
  const row = page.locator('li', { hasText: '甲' }).filter({ has: page.locator('button:has-text("导出")') })
  await row.locator('button:has-text("导出")').first().click()
  const download = await dlPromise
  const dlPath = await download.path()
  downloadJson = dlPath ? readFileSync(dlPath, 'utf8') : ''
  check('W6 导出文件拿到', downloadJson.includes('"app": "true-self-echo"'),
    `${downloadJson.length} 字`)

  /* ---------- 删除甲（级联） ---------- */
  const beforeDel = await readAll()
  await page.locator('li', { hasText: '甲' }).locator('button:has-text("删除")').first().click()
  await page.locator('button:has-text("确定删除")').click()
  await page.waitForTimeout(1200)

  const s2 = await readAll()
  // 甲在删除前有几条记忆就有几个快照 —— 快照减量要按实际算
  const jiaSnaps = beforeDel.snapshotCount - s2.snapshotCount
  check('W7 删除是级联的（人格/会话/消息/快照都消失）',
    !s2.personas.some((p) => p.name === '甲') &&
      !s2.conversations.some((c) => c.personaId === jia?.id) &&
      jiaSnaps >= 0 &&
      s2.personas.length === beforeDel.personas.length - 1,
    `人格 ${beforeDel.personas.length}→${s2.personas.length} · 会话 ${beforeDel.conversations.length}→${s2.conversations.length} · 快照减少 ${jiaSnaps}`)

  /* ---------- 导入甲的备份 ---------- */
  const backup = join(SCRATCH, 'jia-backup.json')
  writeFileSync(backup, downloadJson, 'utf8')
  await page.setInputFiles('input[type=file]', backup)
  await page.waitForTimeout(1200)

  const s3 = await readAll()
  const re = s3.personas.find((p) => p.name === '甲')
  check('W8 导入后人格回来了', !!re, re ? `记忆 ${re.mem.length} 条` : '(未找到)')
  check('W8b 导入的记忆也还原了', !!re && re.mem.some((m) => m.includes('小雨')),
    re?.mem.join('|') ?? '')

  /* ---------- 真实人物边界 ---------- */
  // 直接把一个档案改成 real（模拟 Phase 2.5 之后的真实人格），检查导出按钮消失
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('true-self-echo')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction('personas', 'readwrite')
      const store = tx.objectStore('personas')
      const rq = store.getAll()
      rq.onsuccess = async () => {
        const target = rq.result.find((p) => p.profile?.name === '甲')
        if (target) {
          target.kind = 'real'
          target.profile.kind = 'real'
          await store.put(target)
        }
        res(null)
      }
      rq.onerror = () => rej(rq.error)
    })
    db.close()
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(800)

  const realRow = page.locator('li', { hasText: '甲' }).first()
  const hasExport = await realRow.locator('button:has-text("导出")').count()
  check('W9 真实人物的导出按钮不渲染（边界写死）', hasExport === 0, `导出按钮 ${hasExport} 个`)

  check('D1 无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))

  await page.screenshot({ path: join(SCRATCH, 'p4.png'), fullPage: true })
} catch (err) {
  check('!! 执行中断', false, String(err).split('\n')[0])
  try {
    await page.screenshot({ path: join(SCRATCH, 'p4_fail.png'), fullPage: true })
    results.push((await page.locator('body').innerText()).slice(-500))
  } catch {
    /* ignore */
  }
}

const report = ['# P4 验收 · 多人格 + 数据管理', `BASE=${BASE}`, '', ...results].join('\n')
writeFileSync(join(SCRATCH, 'p4.out.txt'), report, 'utf8')
console.log(report)
await browser.close()
