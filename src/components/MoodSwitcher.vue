<script setup lang="ts">
/**
 * 情绪胶囊组 —— 切换柔光色域（data-theme）。
 * 无障碍：radiogroup + 方向键切换，键盘可达。
 */
import { ref } from 'vue'

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

const current = ref(document.body.dataset.theme || 'garden')

const SELECTED = [
  'bg-[#4a6fa5]',
  'text-white',
  'shadow-[0_4px_20px_rgba(74,111,165,0.28)]',
]
const UNSELECTED = [
  'bg-white/60',
  'text-[#3a3a3a]/70',
  'hover:bg-[#e8a87c]/10',
]

function apply(key: string) {
  current.value = key
  document.body.dataset.theme = key
}

function onKeydown(e: KeyboardEvent, index: number) {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return
  e.preventDefault()
  const next = (index + step + MOODS.length) % MOODS.length
  apply(MOODS[next].key)
  document.getElementById(`mood-${MOODS[next].key}`)?.focus()
}

function classes(key: string) {
  return (current.value === key ? SELECTED : UNSELECTED).join(' ')
}
</script>

<template>
  <div
    class="flex items-center gap-2"
    role="radiogroup"
    aria-labelledby="mood-label"
  >
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
