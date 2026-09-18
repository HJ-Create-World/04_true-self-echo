<script setup lang="ts">
/**
 * 情绪胶囊组 —— 切换柔光色域（data-theme）。
 *
 * ⚠️ 主题状态必须与 DOM 单一信息源绑定（2026-09-18 修）：
 * 之前用组件内局部 ref，只在点击时更新 → 外部改 data-theme 时 UI 不同步、
 * 刷新后选中项丢失。现在改为「DOM 的 data-theme 是唯一真相」，
 * 用 MutationObserver 同步，并持久化到 localStorage。
 *
 * 无障碍：radiogroup + 方向键切换，键盘可达。
 */
import { onMounted, onUnmounted, ref } from 'vue'

interface Mood {
  key: string
  label: string
}

const MOODS: Mood[] = [
  { key: 'dawn', label: '破晓' },
  { key: 'tide', label: '潮汐' },
  { key: 'dusk', label: '黄昏' },
  { key: 'garden', label: '庭院' },
]

const VALID = new Set(MOODS.map((m) => m.key))
const STORAGE_KEY = 'tse.theme'
const DEFAULT_THEME = 'garden'

/** 读初始主题：localStorage 优先，其次 DOM 上已有的值 */
function readInitial(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && VALID.has(saved)) return saved
  } catch {
    /* 隐私模式下 localStorage 可能抛错，忽略 */
  }
  const fromDom = document.body.dataset.theme
  return fromDom && VALID.has(fromDom) ? fromDom : DEFAULT_THEME
}

const current = ref(readInitial())

/** 应用主题：同时写 DOM 与 localStorage，两者始终一致 */
function apply(key: string) {
  if (!VALID.has(key)) return
  current.value = key
  document.body.dataset.theme = key
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* 存不了就算了，不影响切换 */
  }
}

// 外部（脚本、其他组件）改 data-theme 时同步 UI
let observer: MutationObserver | null = null

onMounted(() => {
  apply(current.value)
  observer = new MutationObserver(() => {
    const t = document.body.dataset.theme
    if (t && t !== current.value && VALID.has(t)) current.value = t
  })
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })
})

onUnmounted(() => observer?.disconnect())

function onKeydown(e: KeyboardEvent, index: number) {
  const dirs: Record<string, number> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  }
  const step = dirs[e.key]
  if (step === undefined) return
  e.preventDefault()
  const next = (index + step + MOODS.length) % MOODS.length
  apply(MOODS[next].key)
  document.getElementById(`mood-${MOODS[next].key}`)?.focus()
}

const SELECTED = ['bg-[#4a6fa5]', 'text-white', 'shadow-[0_4px_20px_rgba(74,111,165,0.28)]']
const UNSELECTED = ['bg-white/60', 'text-[#3a3a3a]/70', 'hover:bg-[#e8a87c]/10']

function classes(key: string) {
  return (current.value === key ? SELECTED : UNSELECTED).join(' ')
}
</script>

<template>
  <div class="flex items-center gap-2" role="radiogroup" aria-labelledby="mood-label">
    <span id="mood-label" class="sr-only">选择情绪色域</span>
    <button
      v-for="(m, i) in MOODS"
      :id="`mood-${m.key}`"
      :key="m.key"
      type="button"
      role="radio"
      :aria-checked="current === m.key"
      :tabindex="current === m.key ? 0 : -1"
      :class="[
        'rounded-full px-4 py-1.5 text-sm tracking-wide',
        'transition-all duration-500 ease-in-out',
        'focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30',
        'active:scale-[0.98]',
        classes(m.key),
      ]"
      @click="apply(m.key)"
      @keydown="onKeydown($event, i)"
    >
      {{ m.label }}
    </button>
  </div>
</template>
