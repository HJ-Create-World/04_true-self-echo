<script setup lang="ts">
/**
 * 通用「对象列表」编辑器。
 *
 * 手动微调里 coreTraits / expressionDNA / socialBehavior / tensions / constraints
 * 五种结构**形状完全一样**（一组带字段的条目），只是字段不同 ——
 * 所以只写一个组件，由 `FieldSpec[]` 驱动。
 *
 * ⚠️ 刻意**不在这里做字段级语义校验**：
 * 微调的意义就是让用户改到满意，编辑器不该拦他。
 * 语义检查交给 `checkCompleteness` / `checkSoftWarnings`，做提示不做阻断。
 */
import type { FieldSpec } from '@/feed/editFields'

const props = defineProps<{
  title: string
  hint?: string
  /** 条目数组。用 `Record<string, unknown>` 是因为五种结构的字段名不同 */
  items: Record<string, unknown>[]
  fields: FieldSpec[]
  /** 新建条目用的空模板 */
  blank: Record<string, unknown>
  addLabel: string
}>()

const emit = defineEmits<{ 'update:items': [Record<string, unknown>[]] }>()

/** 一律不可变更新 —— 直接改 props 里的对象会让 Vue 的 diff 失灵 */
function update(index: number, key: string, value: unknown) {
  emit(
    'update:items',
    props.items.map((it, i) => (i === index ? { ...it, [key]: value } : it)),
  )
}

function add() {
  emit('update:items', [...props.items, structuredClone(props.blank)])
}

function remove(index: number) {
  const next = props.items.slice()
  next.splice(index, 1)
  emit('update:items', next)
}

function asText(item: Record<string, unknown>, key: string): string {
  const v = item[key]
  return typeof v === 'string' ? v : ''
}

/** lines 类型在 UI 上是多行文本，存回来时拆成数组 */
function asLines(item: Record<string, unknown>, key: string): string {
  const v = item[key]
  return Array.isArray(v) ? v.join('\n') : ''
}

function onInput(index: number, f: FieldSpec, e: Event) {
  const raw = (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
  if (f.type === 'lines') {
    update(
      index,
      f.key,
      raw.split('\n').map((s) => s.trimEnd()).filter((s) => s.trim() !== ''),
    )
    return
  }
  update(index, f.key, raw)
}

const INPUT_CLASS =
  'w-full rounded-xl bg-white/60 px-3 py-2 font-serif text-xs leading-relaxed tracking-wide text-[#3a3a3a] transition-all duration-500 ease-in-out focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30'
</script>

<template>
  <section class="rounded-2xl bg-white/50 p-4">
    <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 class="m-0 text-sm tracking-wide">
        {{ title }}
        <span class="text-xs text-[#3a3a3a]/45">（{{ items.length }} 条）</span>
      </h3>
      <button
        type="button"
        class="rounded-full bg-white/60 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#85cdca]/14 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
        @click="add"
      >
        + {{ addLabel }}
      </button>
    </header>

    <p v-if="hint" class="mb-3 mt-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
      {{ hint }}
    </p>

    <p v-if="items.length === 0" class="m-0 text-xs tracking-wide text-[#d4a373]">
      这一节是空的 —— 扮演时会缺一块依据。
    </p>

    <ul class="m-0 list-none space-y-3 p-0">
      <li
        v-for="(item, i) in items"
        :key="i"
        class="rounded-xl border border-[#4a6fa5]/15 bg-white/40 p-3"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="text-xs tracking-wide text-[#3a3a3a]/40">#{{ i + 1 }}</span>
          <button
            type="button"
            class="rounded-full px-2 py-0.5 text-xs tracking-wide text-[#c38d94]/70 transition-all duration-500 ease-in-out hover:bg-[#c38d94]/12 hover:text-[#c38d94] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
            @click="remove(i)"
          >
            删除
          </button>
        </div>

        <div class="space-y-2">
          <label v-for="f in fields" :key="f.key" class="block">
            <span class="mb-1 block text-xs tracking-wide text-[#3a3a3a]/55">
              {{ f.label }}
              <span v-if="f.hint" class="text-[#d4a373]">· {{ f.hint }}</span>
            </span>

            <select
              v-if="f.type === 'select'"
              :value="asText(item, f.key)"
              :class="INPUT_CLASS"
              @change="onInput(i, f, $event)"
            >
              <option v-for="o in f.options" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>

            <textarea
              v-else-if="f.type === 'textarea' || f.type === 'lines'"
              :value="f.type === 'lines' ? asLines(item, f.key) : asText(item, f.key)"
              :rows="f.type === 'lines' ? 4 : 2"
              :class="INPUT_CLASS"
              class="resize-y"
              @input="onInput(i, f, $event)"
            />

            <input
              v-else
              type="text"
              :value="asText(item, f.key)"
              :class="INPUT_CLASS"
              @input="onInput(i, f, $event)"
            />
          </label>
        </div>
      </li>
    </ul>
  </section>
</template>
