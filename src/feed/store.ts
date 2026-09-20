/**
 * 投料流程状态（Pinia）
 *
 * 职责边界：只管「素材 → 清洗后的素材 + 来源标注」这一段。
 * 提取（调 LLM）与落库不在这里 —— 那是 Phase 2 的下一个切片。
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { emptySource, type PersonaProfile, type SourceNote } from '@/persona/schema'
import { putPersona } from '@/storage/personaRepo'
import { analyzeLayer, countChars, detectDistilled, stripRanges } from './analyze'
import { runExtraction, type ExtractionDraft } from './extract'

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

/** 生成画像 id —— 投料产物不需要自增，用时间 + 随机后缀即可稳定且不撞 */
function newId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 两种操作模式（`SPEC.md` §六）。
 *
 * `manual` 是默认值，不是随便定的：提取是「一次不可靠的猜测」，
 * 让用户先看见并校正一遍，比直接落库再等他自己发现不对要诚实得多。
 * 而且这一步本身就是核心体验（观察 AI 提取了什么 + 学人格怎么建模）。
 */
export type FeedMode = 'manual' | 'blackbox'

export const MODES: { key: FeedMode; label: string; hint: string }[] = [
  {
    key: 'manual',
    label: '手动微调',
    hint: '提取完先让你逐字段过一遍，改完再存',
  },
  {
    key: 'blackbox',
    label: '一键黑盒',
    hint: '提取完直接存下、直接开聊，不看中间过程',
  },
]

export const useFeedStore = defineStore('feed', () => {
  const raw = ref('')
  const tier = ref<SourceTier>('verbatim')
  const mode = ref<FeedMode>('manual')
  /** 勾选「要剔除」的段落下标。默认全选 —— 被标出来的基本都是该剔的 */
  const marked = ref<Set<number>>(new Set())
  const fileError = ref<string | null>(null)

  /** 提取阶段的状态 */
  const draft = ref<ExtractionDraft | null>(null)
  const extracting = ref(false)
  const extractMeta = ref('')
  const extractError = ref<string | null>(null)
  /**
   * 模型原始输出。**解析失败时也要留着** ——
   * 那是用户唯一能自查/反馈的东西（2026-09-20 实测教训）。
   */
  const extractRaw = ref('')
  /** 保存后得到的档案，用于「去和它聊」 */
  const saved = ref<PersonaProfile | null>(null)

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
    draft.value = null
    extractError.value = null
    extractMeta.value = ''
    extractRaw.value = ''
    saved.value = null
  }

  /** 提取：调 LLM，产出草稿。**不落库** —— 落库要用户确认过（见 save） */
  async function extract(provider: string) {
    if (!canProceed.value || extracting.value) return
    extracting.value = true
    extractError.value = null
    draft.value = null
    extractRaw.value = ''
    saved.value = null
    const started = Date.now()
    try {
      const res = await runExtraction(cleaned.value, provider)
      extractRaw.value = res.raw
      extractMeta.value = `${res.model} · ${((Date.now() - started) / 1000).toFixed(1)}s`
      if (res.parseError) {
        extractError.value = res.parseError
      } else {
        draft.value = res.draft ?? null
      }
    } catch (e) {
      extractError.value = e instanceof Error ? e.message : String(e)
    } finally {
      extracting.value = false
    }
  }

  /** 落库。返回存下来的档案，供调用方跳去开聊 */
  async function save(): Promise<PersonaProfile | null> {
    if (!draft.value) return null
    const now = new Date().toISOString()
    const profile: PersonaProfile = {
      id: newId(),
      name: draft.value.name.trim() || '未命名',
      tagline: draft.value.tagline.trim(),
      // Phase 2 只投虚拟角色（PLAN.md §二 Phase 2 的确认结论）
      kind: 'virtual',
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      source: toSourceNote(),
      frozen: draft.value.frozen,
      correctionLog: [],
    }
    await putPersona(profile)
    saved.value = profile
    return profile
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

  /**
   * 一键黑盒：提取 + 落库一步到位。
   * 与手动微调的区别**只在于有没有给用户看/改的机会** ——
   * 底层都是同一次提取、同一份 `save()`。
   */
  async function extractAndSave(provider: string): Promise<PersonaProfile | null> {
    await extract(provider)
    if (!draft.value) return null
    return save()
  }

  return {
    raw,
    tier,
    mode,
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
    draft,
    extracting,
    extractMeta,
    extractError,
    extractRaw,
    saved,
    toggleMark,
    markAll,
    markNone,
    loadFile,
    reset,
    extract,
    extractAndSave,
    save,
    toSourceNote,
  }
})
