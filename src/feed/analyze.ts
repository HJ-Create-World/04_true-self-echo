/**
 * 投料素材分析：层级清洗 + 层级检测
 *
 * 依据：docs/01_product/SPEC.md §六（层级清洗 P1 / 层级检测 P2）
 *
 * ⚠️ **这是启发式，不是 AI 判断，而且它只负责「标出」不负责「删」。**
 * 两类错误代价极不对称（SPEC §六）：
 *   - 漏标：用户自己会看出来，后果是提取器抄了答案 → 分数虚高
 *   - 误删：把真素材删掉了，用户**看不出来** → 提取质量悄悄下降
 * 所以策略是「宁可多标 + 一律让用户勾选」，阈值刻意压低。
 *
 * 判据全部落在**形态**上（表格 / 列举 / 分析性词汇 / 短引号密度），
 * 不看语义 —— 语义判断交给用户，代码只负责把可疑的东西摆到台面上。
 */

/** 连续非空行构成的块；块之间的空行只是分隔 */
export interface Block {
  /** 1-based 起始行 */
  start: number
  /** 1-based 结束行 */
  end: number
  lines: string[]
}

/** 一个被标出的候选段落 */
export interface CleanHit {
  start: number
  end: number
  /** 给人看的一行摘要（标题或首行截断） */
  label: string
  score: number
  /** 为什么标它 —— UI 必须展示，否则用户无法判断该不该勾 */
  reasons: string[]
}

/** 分析性词汇：出现在标题或正文里，说明这段可能已经是「结论」而非原始素材 */
const META_WORDS = [
  '骨架', '温度谱', '语气谱', '映射表', '映射', '禁忌', '规则', '规律',
  '框架', '模型', '清单', '要点', '总结', '结论', '特征', '分析',
  '配方', '参数', '档位', '优先级', '维度', '指标', '标准', '原则',
  '方法论', '高频词', '常用词', '分类', '结构说明',
]

/** 判定阈值。压低是刻意的 —— 漏标比误删代价小得多，见文件头注释。 */
const HIT_THRESHOLD = 4

const HEADING = /^#{1,6}\s/

/** 兜底：没有任何标题时，按「连续非空行」分块 */
function splitByBlank(lines: string[]): Block[] {
  const out: Block[] = []
  let cur: number[] = []
  const flush = () => {
    if (!cur.length) return
    out.push({
      start: cur[0] + 1,
      end: cur[cur.length - 1] + 1,
      lines: cur.map((i) => lines[i]),
    })
    cur = []
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') flush()
    else cur.push(i)
  }
  flush()
  return out
}

/**
 * 切分段落。**以标题为界**，而不是以空行为界。
 *
 * ⚠️ 2026-09-20 实测教训：一开始按空行切，结果
 * 「`## 八、句子骨架`」与它下面的列举项被拆成两块 ——
 * 标题块只有 1 个分析性词汇（分数不够）、列举块没有标题（分数也不够），
 * **两块都躲过了阈值**，而它们合起来正是最该被标出来的那种段落。
 * 以标题为界天然把「结论 + 它的论证」圈在一起。
 *
 * 没有标题时才退回按空行切（纯台词素材常常就是一大段无结构文本）。
 */
export function splitSections(text: string): Block[] {
  const lines = text.split('\n')
  const heads: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (HEADING.test(lines[i])) heads.push(i)
  }
  if (heads.length === 0) return splitByBlank(lines)

  const out: Block[] = []
  const push = (from: number, to: number) => {
    let a = from
    let b = to
    while (a <= b && lines[a].trim() === '') a++
    while (b >= a && lines[b].trim() === '') b--
    if (a > b) return
    out.push({ start: a + 1, end: b + 1, lines: lines.slice(a, b + 1) })
  }

  if (heads[0] > 0) push(0, heads[0] - 1)
  for (let i = 0; i < heads.length; i++) {
    push(heads[i], i + 1 < heads.length ? heads[i + 1] - 1 : lines.length - 1)
  }
  return out
}

function countMetaWords(text: string): number {
  return META_WORDS.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0)
}

/** 表格行：以 | 开头且至少两个 | */
function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && (t.match(/\|/g)?.length ?? 0) >= 2
}

/** 列举行：- / * / 1. / 1、 */
function isBullet(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.、)])\s+/.test(line)
}

/**
 * 「短引号」：引号内是词而不是完整句子 —— 蒸馏结论的典型形态
 * （如「8 大句子骨架」那节会写 `"啊"、"嘛"、"对吧"` 这类语气词清单）。
 *
 * 直线引号也收，但门槛更高（见调用处）—— 真实台词里偶尔会用引号强调，
 * 单看一两处不能作数。
 */
function shortQuoteCount(text: string): number {
  const corners = text.match(/[「『][^」』]{1,8}[」』]/g)?.length ?? 0
  const straight = text.match(/[""][^""]{1,6}[""]|"[^"]{1,6}"/g)?.length ?? 0
  return corners + straight
}

/**
 * 给一个段落打分。返回 [分数, 原因列表]。
 *
 * 权重设计：形态证据（表格 / 列举 / 短引号）比词汇证据更硬 ——
 * 原始台词里不会出现表格，但可能出现「规则」这种词。
 */
function scoreBlock(lines: string[]): [number, string[]] {
  const text = lines.join('\n')
  const reasons: string[] = []
  let score = 0

  const tableRows = lines.filter(isTableRow).length
  if (tableRows >= 2) {
    score += 3
    reasons.push(`含 ${tableRows} 行表格`)
  }

  const bulletRows = lines.filter(isBullet).length
  if (bulletRows >= 2 && bulletRows / lines.length >= 0.5) {
    score += 2
    reasons.push(`${bulletRows} 行是列举条目`)
  }

  const quotes = shortQuoteCount(text)
  if (quotes >= 6) {
    score += 2
    reasons.push(`引号内是短词而非整句（${quotes} 处）`)
  } else if (quotes >= 3) {
    score += 1
    reasons.push(`引号内是短词（${quotes} 处）`)
  }

  const meta = countMetaWords(text)
  if (meta >= 2) {
    score += 2
    reasons.push(`含 ${meta} 个分析性词汇`)
  } else if (meta === 1) {
    score += 1
    reasons.push('含 1 个分析性词汇')
  }

  // 标题行命中分析性词汇，是「这一整节都是结论」的强信号
  const head = lines[0] ?? ''
  if (HEADING.test(head) && countMetaWords(head) > 0) {
    score += 2
    reasons.push('小节标题本身是分析性表述')
  }

  return [score, reasons]
}

/**
 * 标出疑似「他人已蒸馏好的分析结论」的段落。
 *
 * 段落即勾选粒度 —— 不再合并相邻段：让用户能逐段接受/拒绝，
 * 比替他合并成一大块更符合「标出而不是删」的定位。
 */
export function detectDistilled(text: string): CleanHit[] {
  const out: CleanHit[] = []
  for (const b of splitSections(text)) {
    const [score, reasons] = scoreBlock(b.lines)
    if (score < HIT_THRESHOLD) continue
    out.push({
      start: b.start,
      end: b.end,
      label: (b.lines[0] ?? '').replace(/^#{1,6}\s*/, '').slice(0, 40) || '（无标题段落）',
      score,
      reasons,
    })
  }
  return out
}

/** 按给定的行区间剔除段落，返回清洗后的文本 */
export function stripRanges(text: string, hits: CleanHit[]): string {
  if (hits.length === 0) return text
  const lines = text.split('\n')
  const drop = new Set<number>()
  for (const h of hits) {
    for (let i = h.start; i <= h.end; i++) drop.add(i)
  }
  const kept = lines.filter((_, idx) => !drop.has(idx + 1))
  // 连续空行压成一个，免得删完留下一大片空白
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/* ------------------------------------------------------------------ */
/* 层级检测（P2，下限兜底）                                             */
/* ------------------------------------------------------------------ */

export interface LayerReport {
  /** 是否检测到「语言之外的第二层」（引号外的叙述 / 动作 / 场景） */
  hasSecondLayer: boolean
  /** 引号内文字占全文的比例 */
  quotedRatio: number
  /** 引号外的叙述样本，给用户看「第二层长什么样」 */
  samples: string[]
  advice: string
}

/**
 * 叙述（= 语言之外的第二层）的两个判据。
 *
 * ⚠️ **不要把单个动词当判据**（2026-09-20 实测修正 #1）。
 * 最初写成 `她|他|笑|站|走|...` 的字符可选集合，结果台词里的
 * 「你**走**得太小心了」「别再往前**走**了」全部命中 ——
 * 纯台词素材被判成双层，功能直接废掉。
 *
 * ⚠️ **括号里必须有动作动词**（2026-09-20 实测修正 #2）。
 * 只判断「有没有括号」是不够的：`（爱莉希雅）`、`（从容 / 试探）`
 * 这种**标注**也是括号，会把文档的元信息当成动作描写 ——
 * 实测时最先命中的三条样本全是 frontmatter 和导语，真正的场景描写反而没进榜。
 *
 * 所以判据是两种**有施动者的描写**：
 *   ① 括号 + 动作动词：`（她伸出手，又收回）`
 *   ② 第三人称 + 动作：`她笑了，但笑意没有到达眼睛`
 *
 * 📌 **已知取舍**：像 `（语气很轻，但没有任何温度）` 这种纯状态描写会被漏掉。
 * 这是故意的 —— 层级检测是 P2 降级功能，只作下限兜底，
 * 漏判的代价（少给一句引导话术）远小于错判的代价（让用户以为能提取深层特征）。
 */
const ACTION_VERB =
  '站|走|笑|看|望|转|低|抬|伸|收|停|顿|沉默|开口|说|点|摇|掠|吹|亮|响|变|凝|降|淌|散|落|叹|抿|皱|垂|靠|退|侧|俯|仰|握|拉|推|抱|拍|摸|碰|移|蹲|起|坐|躺|醒|睁|闭|抖|颤|拂|漫|涌|滋|蹲'

const PAREN_ACTION = new RegExp(`[（(][^）)]*(?:${ACTION_VERB})[^）)]*[）)]`)
const THIRD_PERSON = new RegExp(
  `(?:她|他|它)[^，。！？；]{0,6}(?:${ACTION_VERB})`,
)

const NARRATION = new RegExp(`${PAREN_ACTION.source}|${THIRD_PERSON.source}`)

/**
 * 文档「附属装置」—— 不是素材本身。
 *
 * 层级检测要判断的是**素材体**有没有第二层，而不是这份文档写得好不好。
 * 实测教训：不排除的话，YAML frontmatter 与导语 blockquote 会抢走全部样本位。
 */
function isApparatus(line: string): boolean {
  return (
    HEADING.test(line) ||
    line.startsWith('>') ||
    /^[a-zA-Z_][\w-]*:\s/.test(line) // YAML frontmatter 的 key: value
  )
}

/**
 * 检测素材有没有第二层。
 *
 * 判据（SPEC §六「材料层级」）：**除了「她说了什么」，还有没有
 * 「她说话时的动作 / 表情 / 环境 / 他人视角」**。
 * 实现见上方 `NARRATION` 的注释 —— 关键是要**有施动者**，
 * 光出现动词不算（台词里也是动词）。
 *
 * ⚠️ **标题行不算叙述**（2026-09-20 实测修正）：
 * 形如 `## 场景三 · 面对敌人（冷冽 / 警告）` 的标题带着括号注解，
 * 会被误判成动作描写。但标题是**文档结构**，不是场景内的描写 ——
 * 我们要找的是「她嘴上说 X，身体做了 Y」，标题给不了这个信息。
 *
 * 📌 **这是 P2 降级功能，只作下限兜底**（`SPEC.md` §六）。
 * 判据刻意偏保守：宁可选「单层 + 给引导话术」，
 * 也不要错报「双层 + 可以提取深层特征」—— 后者会让用户带着错误预期去投料。
 */
export function analyzeLayer(text: string): LayerReport {
  const quotedLen = (text.match(/[「『][^」』]*[」』]/g) ?? []).join('').length
  const total = text.replace(/\s/g, '').length || 1
  const quotedRatio = quotedLen / total

  const samples: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || isApparatus(line)) continue
    // 去掉引号内的内容，剩下的就是「叙述」
    const outside = line.replace(/[「『][^」』]*[」』]/g, '').trim()
    if (outside.length >= 4 && NARRATION.test(outside)) samples.push(line.slice(0, 60))
    if (samples.length >= 3) break
  }

  const hasSecondLayer = samples.length > 0
  return {
    hasSecondLayer,
    quotedRatio,
    samples,
    advice: hasSecondLayer
      ? '检测到语言之外的第二层，可以提取深层人格特征（内在矛盾、情绪切换规律）。'
      : '当前材料只读到「她说了什么」——能提取语言风格和表达习惯，但拿不到内在反差。' +
        '越接近小说或剧本的文本越好，因为「她嘴上说 X，但身体做了 Y」这类信息才是深层人格的关键。',
  }
}

/** 去掉所有空白后的字数 —— 投料量判据用这个，不用 text.length */
export function countChars(text: string): number {
  return text.replace(/\s/g, '').length
}

/**
 * 多说话人粗检（2026-09-22，多角色投料需求的配套信号）。
 *
 * 启发式：对白常见「名字：台词」格式，收集行首 1–8 字 + 冒号的前缀，
 * 出现 ≥3 个不同前缀且总命中 ≥3 行 → 判为多角色。
 * **提示性质，不是判定** —— 误报无害（用户看一眼素材就知道要不要填主角名），
 * 漏报也无害（主角名本来就可以不填）。
 */
export function detectMultiSpeaker(text: string): { multi: boolean; speakers: string[] } {
  const counter = new Map<string, number>()
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^([^\s：:]{1,8})[：:]/)
    if (!m) continue
    const name = m[1]
    // 排除明显的非人名前缀（旁白/场景标记/序号）
    if (/^(旁白|系统|场景|舞台|第.+[章幕回]|[（(【\d])/i.test(name)) continue
    counter.set(name, (counter.get(name) ?? 0) + 1)
  }
  const speakers = Array.from(counter.entries())
    .filter(([, n]) => n >= 1)
    .map(([name]) => name)
  return { multi: speakers.length >= 3, speakers: speakers.slice(0, 8) }
}

/**
 * 情绪极端段粗检（自检清单用）。
 *
 * Phase 0/2 的实测结论：没有情绪极端时刻（冲突/告别/拒绝）的素材只能提取到
 * 表层语言风格 —— 这个信号帮用户在投料前意识到素材天花板。
 * 同样是提示性质：关键词命中数只是「大概有」，不承诺「提得出来」。
 */
const EMOTIONAL_CUES = [
  '滚',
  '闭嘴',
  '别走',
  '不要走',
  '对不起',
  '抱歉',
  '再见',
  '讨厌',
  '恨',
  '救',
  '求你',
  '哭',
  '死',
  '痛',
  '骗',
  '背叛',
  '放过',
]

export function detectEmotionalPeaks(text: string): { hits: number; samples: string[] } {
  const samples: string[] = []
  let hits = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t && EMOTIONAL_CUES.some((c) => t.includes(c))) {
      hits += 1
      if (samples.length < 3) samples.push(t.slice(0, 40))
    }
  }
  return { hits, samples }
}
