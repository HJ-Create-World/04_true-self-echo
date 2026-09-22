/**
 * 合规防御机制 + 触发词编辑验收（E2E）
 *
 * 覆盖：
 *   R1  首访 AI 告知遮罩 + 对话页常驻徽章
 *   R9  危机提示条（输入侧命中即出现，不等回复）
 *   R8  撤回同意（consents 表 revokedAt 落库 + UI 状态）+ 删除全部数据（清库 + 重播种）
 *   R2  当日超时依赖预警（localStorage 注入伪造累计 —— 夜聊通道依赖真实时钟，留人工验收）
 *   D004 触发词编辑 + 卡片删除（编辑持久化 + chat store 副本同步）
 *
 * 跑法：薄后端（8787）+ preview（4173）起着。
 */

import { chromium } from 'playwright'

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

/** confirm 弹窗全部接受（删除/撤回确认链） */
page.on('dialog', (d) => d.accept())

/** 直接操纵 IndexedDB 的 consents 表（预置 / 读取） */
async function consentRows() {
  return page.evaluate(async () => {
    const open = () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('true-self-echo')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const db = await open()
    const rows = await new Promise((res) => {
      const rq = db.transaction('consents', 'readonly').objectStore('consents').getAll()
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => res([])
    })
    db.close()
    return rows.map((r) => ({ scope: r.scope, revokedAt: r.revokedAt }))
  })
}

async function personaRows() {
  return page.evaluate(async () => {
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
    return rows.map((p) => ({ id: p.id, name: p.profile?.name }))
  })
}

try {
  /* ---------- R1：首访遮罩 ---------- */
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const gateVisible = await page.locator('text=这里的一切由 AI 生成').isVisible()
  check('R1a 首访遮罩出现（全屏，不藏在协议里）', gateVisible)
  await page.click('button:has-text("我知道这是 AI")')
  await page.waitForTimeout(300)
  const gateGone = !(await page.locator('text=这里的一切由 AI 生成').isVisible())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const gateStays = !(await page.locator('text=这里的一切由 AI 生成').isVisible())
  check('R1b 确认后消失且刷新不再出现', gateGone && gateStays)

  /* ---------- R1：常驻徽章 ---------- */
  const badge = await page.locator('text=AI 生成 · 非真人').isVisible()
  check('R1c 对话页常驻徽章可见', badge)

  /* ---------- R9：危机提示（输入侧命中即出现） ---------- */
  await page.fill('textarea', '说真的，最近太累了，有时候真的不想活了。')
  await page.click('button:has-text("发送")')
  await page.waitForTimeout(1200)
  const crisisVisible = await page.locator('text=全国心理援助热线 12356').isVisible()
  check('R9a 输入命中危机词 → 提示条立即出现', crisisVisible)
  // 等扮演 + 抽取落定，避免影响后续断言
  await page.waitForTimeout(30_000)

  /* ---------- D004：触发词编辑 ---------- */
  // 前置：先让一条记忆存在（上一轮抽取应已产出；等库里有记忆）
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(1000)
  let editBtn = page.locator('button:has-text("编辑触发词")').first()
  for (let i = 0; i < 20 && !(await editBtn.count()); i++) {
    await page.waitForTimeout(2000)
  }
  if (await editBtn.count()) {
    await editBtn.click()
    await page.fill('input[placeholder="加一个触发词，回车确认"]', '加班')
    await page.keyboard.press('Enter')
    await page.click('button:has-text("保存")')
    await page.waitForTimeout(800)
    const persisted = await page.evaluate(async () => {
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
      return rows.some((p) => (p.profile?.evolving?.memories ?? []).some((m) => (m.triggers ?? []).includes('加班')))
    })
    check('D1 触发词编辑落库（triggers 含新词）', persisted)

    // 卡片删除（confirm 自动接受）
    const before = await page.evaluate(async () => {
      const open = () =>
        new Promise((res) => {
          const r = indexedDB.open('true-self-echo')
          r.onsuccess = () => res(r.result)
        })
      const db = await open()
      const rows = await new Promise((res) => {
        const rq = db.transaction('personas', 'readonly').objectStore('personas').getAll()
        rq.onsuccess = () => res(rq.result)
      })
      db.close()
      return rows.reduce((n, p) => n + (p.profile?.evolving?.memories?.length ?? 0), 0)
    })
    await page.locator('button:has-text("删除这条记忆")').first().click()
    await page.waitForTimeout(800)
    const after = await page.evaluate(async () => {
      const open = () =>
        new Promise((res) => {
          const r = indexedDB.open('true-self-echo')
          r.onsuccess = () => res(r.result)
        })
      const db = await open()
      const rows = await new Promise((res) => {
        const rq = db.transaction('personas', 'readonly').objectStore('personas').getAll()
        rq.onsuccess = () => res(rq.result)
      })
      db.close()
      return rows.reduce((n, p) => n + (p.profile?.evolving?.memories?.length ?? 0), 0)
    })
    check('D2 记忆卡片删除（总数减一）', after === before - 1, `${before} → ${after}`)
  } else {
    check('D1 触发词编辑落库', false, '（没有记忆卡可编辑 —— 上一轮抽取未产出）')
    check('D2 记忆卡片删除', false, '（同上）')
  }

  /* ---------- R2：当日超时预警（localStorage 注入） ---------- */
  await page.click('a:has-text("对话")')
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(`tse_usage_${today}`, String(3.2 * 60 * 60 * 1000))
  })
  // 🔴 store 在页面加载时就把当日累计读进了内存 —— 注入后必须刷新才生效
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.fill('textarea', '天气不错，今天有什么安排？')
  await page.click('button:has-text("发送")')
  await page.waitForTimeout(1500)
  const overuse = await page.locator('text=真实的人给你的才是拥抱').isVisible()
  check('R2 当日超 3h → 依赖预警横幅出现', overuse)
  await page.click('button:has-text("知道了")').catch(() => {})
  await page.waitForTimeout(60_000) // 等这轮扮演+抽取结束，避免影响后续

  /* ---------- R8a：撤回同意 ---------- */
  // 预置一条有效同意（真实路径见 P2.5 验收；这里直接落库，聚焦「撤回」动作本身）
  await page.evaluate(async () => {
    const open = () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('true-self-echo')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    const db = await open()
    await new Promise((res, rej) => {
      const tx = db.transaction('consents', 'readwrite')
      tx.objectStore('consents').add({
        scope: 'realMaterial',
        version: '1',
        grantedAt: new Date().toISOString(),
        revokedAt: null,
      })
      tx.oncomplete = () => res(null)
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  })
  await page.click('a:has-text("档案")')
  await page.waitForTimeout(1000)
  const beforeRevoke = (await consentRows()).filter((c) => c.scope === 'realMaterial' && !c.revokedAt).length
  await page.click('button:has-text("撤回真人素材同意")')
  await page.waitForTimeout(800)
  const rowsAfter = await consentRows()
  const afterRevoke = rowsAfter.filter((c) => c.scope === 'realMaterial' && !c.revokedAt).length
  const uiRevoked = await page.locator('text=当前：无有效同意').isVisible()
  check('R8a 撤回同意：revokedAt 落库 + UI 变灰', beforeRevoke === 1 && afterRevoke === 0 && uiRevoked)

  /* ---------- R8b：删除全部数据 ---------- */
  await page.click('button:has-text("删除我的全部数据")')
  // 两层 confirm 已被全局 dialog handler 自动接受
  await page.waitForTimeout(2000)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const seeded = await personaRows()
  const emptyOk = seeded.length === 1 && seeded[0].name === '爱莉希雅'
  check('R8b 全部删除 → 重播种内置人格（唯一复活者）', emptyOk, seeded.map((p) => p.name).join('/'))
} catch (e) {
  check('FATAL', false, e instanceof Error ? `${e.name}: ${e.message}` : String(e))
} finally {
  console.log('\n===== 合规防御机制 · E2E 验收 =====')
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
