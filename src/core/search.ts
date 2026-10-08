/**
 * 现实话题搜索 —— 让她真的知道用户在聊什么（2026-10-08 · D016）
 *
 * ## 为什么需要（HJ 的反驳，成立）
 *
 * 「哦我刷到了那个，没细看」是敷衍 —— 真人朋友聊热点是有实质内容的
 * （细节、看法、延展）。共享语境的关键不是「知道有这么个事」，
 * 是「知道这件事的实质」。模型训练截止后的世界它一无所知，
 * 手动贴一行标题也不够聊 —— 需要真的把内容给它。
 *
 * ## 机制：关键词预筛 + 触发式搜索（无判断调用）
 *
 * 用户消息命中现实话题词 → 直接搜（Tavily，query = 用户消息）→
 * top 3 结果的标题+摘要注入现实区 → 生成。
 *
 * - **不命中 = 零延迟**（大多数轮走这条路）
 * - 命中但其实不需要搜 = 白白慢 2-3s，但答案可能更有料（无害）
 * - 漏掉 = 她靠模型自身知识 / 世界动态兜底（现状）
 * - 串行延迟只发生在命中轮 —— 用户聊热点时多等两秒是合理期待
 *
 * ## 边界
 *
 * 这是**接住话题**，不是执行指令 —— 用户说「帮我查航班」她不查。
 * 词表因此偏「分享/讨论」语境，不放指令式动词。
 *
 * ## key
 *
 * Tavily（免费层 1000 次/月，个人使用绰绰有余）。key **可选** ——
 * 不填则整个功能不存在，不破坏「空配置分发」。国内直连 api.tavily.com 可达。
 */

export const SEARCH_KEY_STORE = 'tse_search_key'
export const SEARCH_ON_STORE = 'tse_search_on'

export function loadSearchKey(): string {
  try {
    return localStorage.getItem(SEARCH_KEY_STORE) ?? ''
  } catch {
    return ''
  }
}

export function saveSearchKey(key: string): void {
  try {
    localStorage.setItem(SEARCH_KEY_STORE, key.trim())
  } catch {
    /* 忽略 */
  }
}

export function loadSearchEnabled(): boolean {
  try {
    return localStorage.getItem(SEARCH_ON_STORE) === '1'
  } catch {
    return false
  }
}

export function saveSearchEnabled(v: boolean): void {
  try {
    localStorage.setItem(SEARCH_ON_STORE, v ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

/**
 * 现实话题预筛 —— 命中才发起搜索。
 *
 * 设计原则：**宁可漏、不可滥**。漏掉的话题有世界动态和模型知识兜底；
 * 滥触发会让每轮都慢 3 秒（比答不上更伤体验）。
 * 词表覆盖「分享 / 求证 / 好奇」三类，避开纯指令（帮我查 / 翻译）。
 */
const REALITY_HINTS = [
  // 分享见闻
  '你看', '你刷', '你听说了', '你知道吗', '你有没有看', '有没有听说', '你看过',
  '听说', '看到新闻', '上热搜', '热搜', '上新闻', '爆了', '刷屏', '出圈',
  // 时事指向
  '最近的新闻', '最近发生', '最近出了', '今天的大事', '最近有什么',
  '最新消息', '什么情况', '怎么样了', '后来呢', '进展',
  // 新品 / 发布 / 行业
  '发布会', '新品', '发布了', '上线了', '开售', '首销', '官宣', '定档', '开播',
  // 游戏 / 二元次圈常见话题（本产品主场景）
  '新角色', '新版本', '新活动', '卡池', '复刻', 'pv',
]

/** 消息里出现明显的「追问她不知道的现实信息」形态（她接不住的信号） */
const IGNORE_HINTS = ['帮我查', '帮我搜', '帮我翻译', '帮我写', '帮我算', '是什么意思', '怎么翻译']

export function shouldSearch(userInput: string): boolean {
  const t = userInput.trim()
  if (t.length < 6) return false
  if (IGNORE_HINTS.some((k) => t.includes(k))) return false
  return REALITY_HINTS.some((k) => t.toLowerCase().includes(k))
}

/* ------------------------------------------------------------------ */
/* Tavily 调用                                                          */
/* ------------------------------------------------------------------ */

export interface SearchHit {
  title: string
  snippet: string
}

const SEARCH_TIMEOUT_MS = 6000
const MAX_HITS = 3

/** 调 Tavily 拿 top 3 结果；任何失败返回空数组（静默降级，不报错打断聊天） */
export async function searchReality(query: string, apiKey: string): Promise<SearchHit[]> {
  const key = apiKey.trim()
  if (!key) return []
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: query.slice(0, 200),
        max_results: MAX_HITS,
        search_depth: 'basic',
        include_answer: false,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: { title?: string; content?: string }[] }
    return (data.results ?? [])
      .slice(0, MAX_HITS)
      .map((r) => ({
        title: String(r.title ?? '').trim().slice(0, 80),
        snippet: String(r.content ?? '').trim().slice(0, 240),
      }))
      .filter((r) => r.snippet)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 搜索结果 → 现实区注入文本。
 * 措辞是「你了解到的」—— 她自然地聊，不交代信息来源（AI 披露由 R1 常驻徽章承担）。
 * 没结果返回 ''（区块无痕）。
 */
export function renderSearchBlock(query: string, hits: SearchHit[]): string {
  if (hits.length === 0) return ''
  return [
    `关于「${query.slice(0, 40)}」，你了解到这些（都是真的，可以大方聊细节和看法）：`,
    '',
    ...hits.map((h) => `- ${h.title}：${h.snippet}`),
    '',
  ].join('\n')
}
