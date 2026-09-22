<script setup lang="ts">
/**
 * 情绪胶囊 —— 切换柔光色域（data-theme）。
 *
 * ## 2026-09-22 改版（HJ 反馈）：四个胶囊收进一个按钮
 *
 * 顶栏空间在小屏上太挤（截图：四胶囊把标题压成竖排）。现在顶栏只显示
 * 「当前主题」一个按钮，点开弹出面板选择。原 four-capsule 的逻辑全部保留：
 * radiogroup + 方向键切换、MutationObserver 同步（DOM 是唯一真相）、
 * localStorage 持久化 —— 改的只是呈现层。
 *
 * 关闭方式：选择后 / 点面板外 / Esc。
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
const open = ref(false)
const root = ref<HTMLElement | null>(null)

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

function pick(key: string) {
  apply(key)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
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
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  observer?.disconnect()
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
})

function onPanelKeydown(e: KeyboardEvent, index: number) {
  const dirs: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
  const step = dirs[e.key]
  if (step === undefined) return
  e.preventDefault()
  const next = (index + step + MOODS.length) % MOODS.length
  apply(MOODS[next].key)
  document.getElementById(`mood-${MOODS[next].key}`)?.focus()
}

const label = () => MOODS.find((m) => m.key === current.value)?.label ?? '庭院'
</script>

<template>
  <div ref="root" class="relative flex items-center" role="radiogroup" aria-labelledby="mood-label">
    <span id="mood-label" class="sr-only">选择情绪色域</span>

    <!-- 顶栏唯一入口：当前主题名。图标 = 四色圆点（对应四个主题的象征色），不用 emoji -->
    <button
      type="button"
      class="flex items-center gap-2 rounded-full bg-white/60 px-4 py-1.5 text-sm tracking-wide text-[#3a3a3a]/75 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
      :aria-expanded="open"
      aria-haspopup="true"
      @click.stop="open = !open"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="4.5" cy="4.5" r="3" fill="#e8a87c" fill-opacity="0.85" />
        <circle cx="9.5" cy="4.5" r="3" fill="#85cdca" fill-opacity="0.85" />
        <circle cx="4.5" cy="9.5" r="3" fill="#d4a373" fill-opacity="0.85" />
        <circle cx="9.5" cy="9.5" r="3" fill="#c38d94" fill-opacity="0.85" />
      </svg>
      {{ label() }}
    </button>

    <!-- 弹出面板：四个主题 -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-200 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="open"
        class="absolute right-0 top-full z-50 mt-2 w-44 rounded-2xl bg-[#faf7f2]/95 p-2 shadow-[0_16px_60px_rgba(58,58,58,0.22)] backdrop-blur"
        role="listbox"
        aria-label="主题列表"
      >
        <button
          v-for="(m, i) in MOODS"
          :id="`mood-${m.key}`"
          :key="m.key"
          type="button"
          role="radio"
          :aria-checked="current === m.key"
          :tabindex="current === m.key ? 0 : -1"
          class="flex w-full items-center justify-between rounded-xl px-4 py-2 text-sm tracking-wide transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
          :class="current === m.key ? 'bg-[#4a6fa5] text-white' : 'text-[#3a3a3a]/70 hover:bg-[#e8a87c]/10'"
          @click="pick(m.key)"
          @keydown="onPanelKeydown($event, i)"
        >
          {{ m.label }}
          <span v-if="current === m.key" class="text-xs">✓</span>
        </button>
      </div>
    </Transition>
  </div>
</template>
