/**
 * 现实感知 —— 她知道「现在」是什么时候（2026-10-08）
 *
 * 用户反馈：问星期和天气都说不明白，分享日常她接不住 ——
 * 根因是模型对「现在」一无所知（LLM 没有时钟，训练截止后的世界它都看不见）。
 *
 * ## 两层
 *
 * 1. **时间感知（必做，零成本）**：日期 / 星期 / 时段 / 季节 —— 每轮现算，
 *    几十 token。这是「今天周五了好开心」能被接住的前提。
 * 2. **天气（可选）**：open-meteo —— 唯一选它的理由是**免 API key**，
 *    不破坏「空配置分发」原则（用户填个城市名就行，不填就没有）。
 *    30 分钟缓存 + 3s 超时 + 失败静默：天气是氛围点缀，绝不能拖慢对话。
 *
 * ## 评估结论（不做通用联网搜索）
 *
 * 通用搜索 = 把「陪伴者」变成「助手」，且引入延迟/成本/内容审核三重复杂度。
 * 陪伴场景需要的是**时间感**和**一点点现实空气**，不是知识检索。
 * 用户分享的日常她接不住的部分，靠记忆系统 + 对话能力（D013 §七）解决，
 * 不靠联网。
 */

export const WEATHER_CITY_KEY = 'tse_weather_city'

export function loadWeatherCity(): string {
  try {
    return localStorage.getItem(WEATHER_CITY_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveWeatherCity(city: string): void {
  try {
    localStorage.setItem(WEATHER_CITY_KEY, city.trim())
  } catch {
    /* 忽略 */
  }
}

/* ------------------------------------------------------------------ */
/* 世界动态（共享语境 · 手动层）                                        */
/* ------------------------------------------------------------------ */

export const WORLD_NOTES_KEY = 'tse_world_notes'

/**
 * 「最近的世界」—— 用户手动维护的几条动态（热点 / 新品 / 身边的事）。
 *
 * 为什么先做手动层（HJ 2026-10-08 重新评估）：她听不懂「最近的新闻」的根因
 * 不是缺搜索，是**没有共同语境**。用户本来就在刷手机，顺手贴几条的成本
 * 远低于配一个搜索 API 的 key；内容完全可控（无审核风险）；零依赖。
 * 自动层（RSS）与搜索层（可选 key）留作后续升级，见 D015。
 */
export function loadWorldNotes(): string {
  try {
    return localStorage.getItem(WORLD_NOTES_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveWorldNotes(text: string): void {
  try {
    localStorage.setItem(WORLD_NOTES_KEY, text.trim().slice(0, 2000))
  } catch {
    /* 忽略 */
  }
}

/** 把用户贴的动态渲染成「她的信息状态」—— 真人式：看过、听说过，不一定细看 */
function renderWorldLine(): string {
  const raw = loadWorldNotes()
  if (!raw.trim()) return ''
  const items = raw
    .split('\n')
    .map((s) => s.trim().replace(/^[-•\d.、\s]+/, ''))
    .filter(Boolean)
    .slice(0, 10)
  if (items.length === 0) return ''
  return [
    '最近你刷到过、听说过这些（都是大概印象，没细看的话就照实说没细看）：',
    ...items.map((s) => `- ${s}`),
    '聊到这些话题时可以自然接话，像朋友间闲聊热点那样；不确定细节就承认不确定。',
    '',
  ].join('\n')
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function periodOf(h: number): string {
  if (h < 6) return '深夜'
  if (h < 9) return '清晨'
  if (h < 12) return '上午'
  if (h < 14) return '中午'
  if (h < 18) return '下午'
  if (h < 23) return '晚上'
  return '深夜'
}

function seasonOf(month1based: number): string {
  // 气象季节（3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬），中国纬度够用
  if (month1based >= 3 && month1based <= 5) return '春'
  if (month1based >= 6 && month1based <= 8) return '夏'
  if (month1based >= 9 && month1based <= 11) return '秋'
  return '冬'
}

/** 日期/星期/时段/季节 —— 恒定可生成，无任何外部依赖 */
export function renderTimeLine(now = new Date()): string {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const wd = WEEKDAYS[now.getDay()]
  return `今天是 ${y} 年 ${m} 月 ${d} 日，星期${wd}，${seasonOf(m)}季，现在是${periodOf(now.getHours())}。`
}

/* ---------- 天气（open-meteo，免 key） ---------- */

const CACHE_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 3000

let weatherCache: { at: number; city: string; text: string } | null = null

/** WMO weather code → 中文短句（只挑常见码，其余给「天气多变」） */
function wmoText(code: number): string {
  if (code === 0) return '晴'
  if (code === 1 || code === 2) return '多云'
  if (code === 3) return '阴'
  if (code === 45 || code === 48) return '有雾'
  if (code >= 51 && code <= 57) return '有毛毛雨'
  if (code >= 61 && code <= 65) return '在下雨'
  if (code === 66 || code === 67) return '冻雨'
  if (code >= 71 && code <= 77) return '在下雪'
  if (code >= 80 && code <= 82) return '有阵雨'
  if (code === 85 || code === 86) return '有阵雪'
  if (code === 95) return '有雷雨'
  return '天气多变'
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 拿当前天气的一句话描述；任何一步失败都返回 ''（区块里就没有天气，不报错）。
 * 缓存 30 分钟 —— 天气不需要新鲜到分钟级，但要省请求。
 */
export async function fetchWeatherLine(city: string): Promise<string> {
  const c = city.trim()
  if (!c) return ''
  if (weatherCache && weatherCache.city === c && Date.now() - weatherCache.at < CACHE_MS) {
    return weatherCache.text
  }

  // 城市 → 坐标（open-meteo geocoding，同样免 key）
  const geo = (await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c)}&count=1&language=zh&format=json`,
  )) as { results?: { latitude: number; longitude: number }[] } | null
  const loc = geo?.results?.[0]
  if (!loc) return ''

  const wx = (await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code&timezone=auto`,
  )) as { current?: { temperature_2m?: number; weather_code?: number } } | null
  const cur = wx?.current
  if (cur?.temperature_2m === undefined) return ''

  const text = `${c}现在${wmoText(cur.weather_code ?? -1)}，${Math.round(cur.temperature_2m)}°C。`
  weatherCache = { at: Date.now(), city: c, text }
  return text
}

/**
 * 组装现实区（每轮现算，时间恒有，天气与世界动态尽力）。
 * 时间是「她的世界现在几点」的底线 —— 没有它，星期/日期类对话必然露馅。
 */
export async function renderRealityBlock(now = new Date()): Promise<string> {
  const time = renderTimeLine(now)
  const weather = await fetchWeatherLine(loadWeatherCity())
  const world = renderWorldLine()
  return [
    '## 现在的世界',
    '',
    time,
    ...(weather ? [weather, '聊到天气、出门、穿搭这类话题时，以这里的实际情况为准。'] : []),
    ...(world ? ['', world] : []),
  ].join('\n')
}
