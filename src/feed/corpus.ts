/**
 * JSONL 对话语料 → 投料素材（2026-09-22 立项，HJ 的崩坏3语料库真实需求）
 *
 * ## 为什么需要这一层
 *
 * 结构化语料（每句带角色标签）投进系统前需要预处理：选目标角色、剔噪声、
 * 控字数。没有这层，92k 句 19MB 的 JSONL 要么塞不进上下文，要么提取出
 * 「缝合怪」人格。全部是**纯规则处理**，零 LLM 调用 —— 每一步可单元测试。
 *
 * ## 语料的真实形态（决策依据）
 *
 * - role 字段有 1,411 种变体（OCR 流水线噪声）：`布洛妮娅·扎伊切克` /
 *   `布洛妮娅姐姐` / `'布洛妮娅'` / `?布洛妮娅?` —— 匹配必须做**子串归并**，
 *   精确等于会漏掉几十句。
 * - 多人合并台词（`布洛妮娅&琪亚娜`）归属不明 → 丢弃（个位数，不值得处理）。
 * - `<unknown>` 是游戏系统提示（18k+ 句）、`narration` 是旁白 —— 默认都剔除。
 *
 * ## 字数上限（与 Phase 0 结论对齐）
 *
 * 素材质量的边际收益在第 3 分处归零 —— 全量 92k 句塞给提取器只会稀释质量
 * + 烧 token。默认按章节顺序累加到 2 万字为止，在**章节边界**停（保上下文完整）。
 */

export interface CorpusUtter {
  chapter: string
  chapterId: number
  type: string
  role: string
  content: string
}

export interface CorpusChapter {
  id: number
  name: string
  /** 该章总行数（对白 + 旁白） */
  count: number
}

export interface CorpusRole {
  /** 规范化后的角色名 */
  name: string
  /** 该角色（含变体归并）的台词句数 */
  count: number
}

export interface CorpusStats {
  totalLines: number
  /** 解析失败的行（JSON 坏 / 字段缺失） */
  badLines: number
  dialogues: number
  narrations: number
  /** 多人合并 / 空内容等被丢弃的行 */
  droppedLines: number
  chapters: CorpusChapter[]
  /** 按句数降序，已剔除非角色噪声；给下拉用（配合 Top-N + 搜索） */
  roles: CorpusRole[]
}

export interface AssembleOptions {
  protagonist: string
  /** 不传 = 全部章节 */
  chapterIds?: number[]
  includeNarration?: boolean
  includeUnknown?: boolean
  maxChars?: number
}

export interface AssembleResult {
  text: string
  chars: number
  utterances: number
  usedChapterIds: number[]
  /** true = 撞到字数上限，后面章节被丢 */
  truncated: boolean
}

/** 每章主角句数 —— 章节选择列表靠它帮用户判断「哪章戏份多」 */
export function countByChapter(utts: CorpusUtter[], protagonist: string): Map<number, number> {
  const map = new Map<number, number>()
  for (const u of utts) {
    if (matchesProtagonist(u.role, protagonist)) {
      map.set(u.chapterId, (map.get(u.chapterId) ?? 0) + 1)
    }
  }
  return map
}

/**
 * role 变体归并：目标名是否命中这个 role。
 * 子串双向任一命中即可 —— 「布洛妮娅」命中「布洛妮娅·扎伊切克」（全名）；
 * 反向防 role 是更长的修饰形式。
 */
export function matchesProtagonist(role: string, protagonist: string): boolean {
  const r = normalizeRole(role)
  const p = protagonist.trim()
  if (!r || !p) return false
  return r.includes(p) || p.includes(r)
}

/**
 * 规范化 role：去包裹符号与空白；多人合并 / 无效 → 空串（调用方丢弃）。
 * 不做全名→简称截断（`布洛妮娅·扎伊切克` 保留原样，匹配靠子串）。
 *
 * ⚠️ 两处顺序敏感：`<unknown>` 必须在剥包裹符**之前**特判
 * （否则 `<>` 被当包裹符剥掉，未知行会溜进对白统计 —— 第一版就犯过）。
 * 「与」「和」用普通字符匹配 —— `\b` 对中文无效（中文不在 \w 里，\b 永不成立）。
 */
export function normalizeRole(role: string): string {
  let r = role.trim()
  if (r === '<unknown>') return r
  // 去掉 OCR 混进来的包裹符号（引号/问号/括号，反复剥直到稳定）
  for (;;) {
    const next = r.replace(/^[('"“‘？?（(<【\[\s]+|[)'"”’？?）>)】\]\s]+$/g, '')
    if (next === r) break
    r = next
  }
  if (!r) return ''
  // 多人合并（& / 与 / 和 / 顿号逗号分隔）→ 归属不明，丢弃
  if (/[&＋+]|与|和|、|，|,/.test(r)) return ''
  // 过长基本是整句被误当角色名（OCR 噪声）
  if (r.length > 12) return ''
  return r
}

/**
 * 解析 JSONL 语料。坏行跳过并计数（AI pipeline 产物必有噪声，不能一坏全崩）。
 */
export function parseCorpus(raw: string): CorpusStats & { utterances: CorpusUtter[] } {
  const utterances: CorpusUtter[] = []
  let badLines = 0
  let narrations = 0
  let droppedLines = 0

  const chapterMap = new Map<number, CorpusChapter>()
  const roleCount = new Map<string, number>()

  /**
   * 变体聚合：与已有键互为子串 → 归并到**更短**的名字。
   * 「布洛妮娅姐姐」+「布洛妮娅」→「布洛妮娅」—— 短名几乎总是规范名，
   * 不归并的话 1411 种 OCR 变体会把下拉列表炸成碎片。
   */
  function mergeRole(norm: string) {
    for (const [k, v] of roleCount) {
      if (k.includes(norm) || norm.includes(k)) {
        roleCount.delete(k)
        roleCount.set(k.length <= norm.length ? k : norm, v + 1)
        return
      }
    }
    roleCount.set(norm, 1)
  }

  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(t) as Record<string, unknown>
    } catch {
      badLines += 1
      continue
    }
    const chapter = String(obj.chapter ?? '')
    const chapterId = Number(obj.chapter_id ?? -1)
    const type = String(obj.type ?? '')
    const role = String(obj.role ?? '')
    const content = String(obj.content ?? '').trim()
    if (!chapter || chapterId < 0 || !content) {
      badLines += 1
      continue
    }

    const ch =
      chapterMap.get(chapterId) ??
      ({ id: chapterId, name: chapter, count: 0 } as CorpusChapter)
    ch.count += 1
    chapterMap.set(chapterId, ch)

    if (type === 'narration' || role === 'narration') {
      narrations += 1
      utterances.push({ chapter, chapterId, type: 'narration', role: '', content })
      continue
    }

    const norm = normalizeRole(role)
    if (!norm || norm === '<unknown>') {
      droppedLines += 1
      utterances.push({ chapter, chapterId, type: 'unknown', role: norm, content })
      continue
    }
    mergeRole(norm)
    utterances.push({ chapter, chapterId, type: 'dialogue', role: norm, content })
  }

  const dialogues = utterances.length - narrations - droppedLines
  const roles = Array.from(roleCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalLines: utterances.length + badLines,
    badLines,
    dialogues,
    narrations,
    droppedLines,
    chapters: Array.from(chapterMap.values()).sort((a, b) => a.id - b.id),
    roles,
    utterances,
  }
}

/**
 * 拼装提取素材。
 *
 * ## 取舍：邻接窗口，不是「只留主角」也不是「全量照搬」
 *
 * - 只留主角台词 → 丢掉「她如何回应谁」，identity.callUser / relation 就没了依据
 * - 全量照搬章节 → 2 万字被他人台词占满，提取被稀释
 * - **取中间**：主角台词全留，其紧邻的前 / 后各一句也留（作上下文），其余丢弃。
 *   上下文密度天然可控（≤ 2×主角句数），且保留完整的「刺激 → 回应 → 影响」片段
 *
 * 按章节组织输出，撞字数上限在**章节边界**停（保上下文完整）。
 */
export function assembleMaterial(utts: CorpusUtter[], opt: AssembleOptions): AssembleResult {
  const maxChars = opt.maxChars ?? 20_000
  const wanted = opt.chapterIds ? new Set(opt.chapterIds) : null

  const byChapter = new Map<number, CorpusUtter[]>()
  for (const u of utts) {
    if (wanted && !wanted.has(u.chapterId)) continue
    byChapter.set(u.chapterId, [...(byChapter.get(u.chapterId) ?? []), u])
  }

  let text = ''
  let utterances = 0
  const usedChapterIds: number[] = []
  let truncated = false

  const usable = (u: CorpusUtter) =>
    (u.type === 'narration' && opt.includeNarration) ||
    (u.type === 'unknown' && opt.includeUnknown) ||
    u.type === 'dialogue'

  for (const [chapterId, list] of byChapter) {
    // 主角句下标 → 扩邻接窗口 → 原顺序输出
    const keep = new Set<number>()
    list.forEach((u, i) => {
      if (u.type !== 'dialogue' || !matchesProtagonist(u.role, opt.protagonist)) return
      keep.add(i)
      if (i > 0 && usable(list[i - 1])) keep.add(i - 1)
      if (i < list.length - 1 && usable(list[i + 1])) keep.add(i + 1)
    })

    const body = list
      .filter((_, i) => keep.has(i))
      .map((u) => {
        if (u.type === 'narration') return `（旁白：${u.content}）`
        if (u.type === 'unknown') return `（系统：${u.content}）`
        return `${u.role}：${u.content}`
      })
      .join('\n')

    if (!body) continue
    const block = `【${list[0].chapter}】\n${body}\n\n`
    if (text.length + block.length > maxChars && text.length > 0) {
      truncated = true
      break
    }
    text += block
    utterances += keep.size
    usedChapterIds.push(chapterId)
  }

  return { text: text.trim(), chars: text.trim().length, utterances, usedChapterIds, truncated }
}
