/**
 * 投料流程状态（Pinia）
 *
 * 职责边界：只管「素材 → 清洗后的素材 + 来源标注」这一段。
 * 提取（调 LLM）与落库不在这里 —— 那是 Phase 2 的下一个切片。
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { emptySource, type SourceNote } from '@/persona/schema'
import { analyzeLayer, countChars, detectDistilled, stripRanges } from './analyze'

/**
 * 素材可信度三档（`SPEC.md` §六「素材来源标注」）。
 * 与 `persona-schema` 的 `evidenceLevel` 同义，只是换成人话。
 */
export type SourceTier = 'verbatim' | 'artifact' | 'impression'

export const TIERS: {
  key: SourceTier
  label: string
  hint: string
  /** 该档是否可以继续（false = 需要用户明确确认风险） */
  risky: boolean
}[] = [
  {
    key: 'verbatim',
    label: '原文逐字',
    hint: '官方台词、聊天记录原句 —— 有出处、能核对',
    risky: false,
  },
  {
    key: 'artifact',
    label: '二手整理',
    hint: '别人转述 / 考据推断 —— 「她应该会…」这类。这是编造的主要入口',
    risky: true,
  },
  {
    key: 'impression',
    label: '主观印象',
    hint: '「我觉得她是个温柔的人」—— 提取出来的东西基本等于你在写人设，不是在做提取',
    risky: true,
  },
]

/** 投料量档位。实测：400 字≈4.5/10、900 字≈5.5/10、1800 字≈8/10（SPEC §六） */
export function weightTier(chars: number): { label: string; tone: 'bad' | 'ok' | 'good' } {
  if (chars < 400) return { label: '偏少，最多提取到语言风格', tone: 'bad' }
  if (chars < 1200) return { label: '够用，但容易只读到表层', tone: 'ok' }
  return { label: '充足', tone: 'good' }
}

/** 支持的文件类型 —— PDF/Word 需要额外解析库，Phase 2 暂缓 */
export const TEXT_EXT = ['.txt', '.md', '.markdown', '.text']

export const useFeedStore = defineStore('feed', () => {
  const raw = ref('')
  const tier = ref<SourceTier>('verbatim')
  /** 勾选「要剔除」的段落下标。默认全选 —— 被标出来的基本都是该剔的 */
  const marked = ref<Set<number>>(new Set())
  const fileError = ref<string | null>(null)

  const hits = computed(() => detectDistilled(raw.value))
  const layer = computed(() => analyzeLayer(raw.value))

  /** 真正会被剔除的段落 */
  const dropped = computed(() => hits.value.filter((_, i) => marked.value.has(i)))
  const cleaned = computed(() => stripRanges(raw.value, dropped.value))

  const rawChars = computed(() => countChars(raw.value))
  const cleanChars = computed(() => countChars(cleaned.value))
  const tierInfo = computed(() => weightTier(cleanChars.value))
  const currentTier = computed(() => TIERS.find((t) => t.key === tier.value) ?? TIERS[0])

  const canProceed = computed(() => cleanChars.value > 0)

  // 素材一换，勾选就重置为「全部剔除」——不要沿用上一份素材的选择
  watch(raw, () => {
    marked.value = new Set(hits.value.map((_, i) => i))
  })

  function toggleMark(index: number) {
    const next = new Set(marked.value)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    marked.value = next
  }

  function markAll() {
    marked.value = new Set(hits.value.map((_, i) => i))
  }

  function markNone() {
    marked.value = new Set()
  }

  function reset() {
    raw.value = ''
    marked.value = new Set()
    fileError.value = null
  }

  /** 读一个本地文本文件。只用 FileReader，不碰后端（数据不出本机） */
  async function loadFile(file: File) {
    fileError.value = null
    const lower = file.name.toLowerCase()
    if (!TEXT_EXT.some((e) => lower.endsWith(e))) {
      fileError.value = `只认纯文本：${TEXT_EXT.join(' / ')}。PDF / Word 需要额外解析库，Phase 2 暂缓——先自己复制粘贴过来。`
      return
    }
    try {
      raw.value = await file.text()
    } catch (e) {
      fileError.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
    }
  }

  /** 转成存档用的来源标注。单档次 → 比例是 1/0/0 或 0/1/0 或 0/0/1 */
  function toSourceNote(): SourceNote {
    const note = emptySource()
    note[tier.value] = 1
    note.level = layer.value.hasSecondLayer ? '双层（含语言之外的描写）' : '单层（只有台词）'
    return note
  }

  return {
    raw,
    tier,
    marked,
    hits,
    layer,
    dropped,
    cleaned,
    rawChars,
    cleanChars,
    tierInfo,
    currentTier,
    canProceed,
    fileError,
    toggleMark,
    markAll,
    markNone,
    loadFile,
    reset,
    toSourceNote,
  }
})
