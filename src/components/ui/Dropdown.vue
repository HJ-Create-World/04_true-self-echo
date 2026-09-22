<script setup lang="ts">
/**
 * 通用下拉（2026-09-22）—— 替代原生 <select>
 *
 * 为什么不用 select：原生下拉的 option 列表由浏览器渲染，
 * 直角灰底与页面水彩圆角风完全不符，且无法定制（HJ 截图反馈）。
 *
 * 交互语言与 MoodSwitcher 一致：点开弹出、选择即收、点外部 / Esc 关闭、
 * 方向键在选项间移动。支持向上 / 向下弹出、紧凑模式（footer 用）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

export interface DropdownOption {
  value: string
  label: string
  /** 右侧灰字补充（如模型名） */
  hint?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: DropdownOption[]
    placeholder?: string
    /** compact：footer 里的轻量按钮（无边框底色） */
    compact?: boolean
    /** 弹出方向 */
    direction?: 'down' | 'up'
    align?: 'left' | 'right'
  }>(),
  {
    placeholder: '请选择',
    compact: false,
    direction: 'down',
    align: 'left',
  },
)

/** aria-label 由使用方以 attr 透传（不进 props）；option 的 id 用 uid 防多实例冲突 */
const uid = `dd-${Math.random().toString(36).slice(2, 8)}`

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const selected = computed(() => props.options.find((o) => o.value === props.modelValue))

function pick(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

function onItemKeydown(e: KeyboardEvent, index: number) {
  const dirs: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }
  const step = dirs[e.key]
  if (step === undefined) return
  e.preventDefault()
  const next = (index + step + props.options.length) % props.options.length
  document.getElementById(`${uid}-opt-${next}`)?.focus()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKey)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKey)
})
</script>

<template>
  <div ref="root" class="relative inline-flex" role="listbox">
    <!-- 触发按钮 -->
    <button
      type="button"
      :aria-expanded="open"
      aria-haspopup="listbox"
      class="inline-flex items-center gap-1.5 rounded-xl bg-white/60 px-3 py-1.5 text-sm tracking-wide text-[#3a3a3a] transition-all duration-500 ease-in-out hover:bg-white/85 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
      :class="{ 'px-2.5 py-1 text-xs bg-transparent hover:bg-white/60': compact }"
      @click.stop="open = !open"
    >
      <span class="min-w-0 truncate">{{ selected?.label ?? placeholder }}</span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        class="shrink-0 text-[#3a3a3a]/45 transition-transform duration-300"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      >
        <path d="M1 3 L5 7 L9 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
      </svg>
    </button>

    <!-- 选项面板 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      :enter-from-class="direction === 'up' ? 'translate-y-1 opacity-0' : '-translate-y-1 opacity-0'"
      leave-active-class="transition duration-150 ease-in"
      :leave-to-class="direction === 'up' ? 'translate-y-1 opacity-0' : '-translate-y-1 opacity-0'"
    >
      <div
        v-if="open"
        class="absolute z-50 max-h-64 w-56 overflow-y-auto rounded-2xl bg-[#faf7f2]/97 p-1.5 shadow-[0_16px_60px_rgba(58,58,58,0.22)] backdrop-blur"
        :class="direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'"
        :style="align === 'right' ? 'right: 0' : 'left: 0'"
      >
        <button
          v-for="(o, i) in options"
          :id="`${uid}-opt-${i}`"
          :key="o.value"
          type="button"
          role="option"
          :aria-selected="o.value === modelValue"
          :tabindex="o.value === modelValue ? 0 : -1"
          class="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm tracking-wide transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
          :class="o.value === modelValue ? 'bg-[#4a6fa5] text-white' : 'text-[#3a3a3a]/75 hover:bg-[#e8a87c]/10'"
          @click="pick(o.value)"
          @keydown="onItemKeydown($event, i)"
        >
          <span class="min-w-0 truncate">{{ o.label }}</span>
          <span
            v-if="o.hint"
            class="shrink-0 text-xs"
            :class="o.value === modelValue ? 'text-white/70' : 'text-[#3a3a3a]/40'"
          >
            {{ o.hint }}
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>
