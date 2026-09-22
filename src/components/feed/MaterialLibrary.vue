<script setup lang="ts">
/**
 * 素材库面板（A3）—— 预处理产物的存 / 删 / 导出 / 载入 / 导入。
 *
 * 放投料页 MaterialInput 之下，有记录才显示。
 * 「载入」= 直接把素材正文写进主流程（含目标角色），用户从标注/清洗继续走。
 */
import { onMounted, ref } from 'vue'

import {
  deleteMaterial,
  downloadMaterial,
  importMaterial,
  listMaterials,
  type MaterialRow,
} from '@/storage/materialRepo'
import { useFeedStore } from '@/feed/store'

const feed = useFeedStore()
const items = ref<MaterialRow[]>([])
const notice = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function refresh() {
  items.value = await listMaterials()
}
onMounted(refresh)

function fmt(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 载入进主流程（含目标角色），滚到顶部让用户看到素材就位 */
function load(m: MaterialRow) {
  feed.raw = m.content
  feed.protagonist = m.protagonist
  feed.corpusMode = false
  notice.value = `已载入「${m.name}」`
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function remove(m: MaterialRow) {
  if (!confirm(`删除素材记录「${m.name}」？\n（只是删记录，不影响已投料的人格）`)) return
  await deleteMaterial(m.id as number)
  await refresh()
}

function exportOne(m: MaterialRow) {
  const name = downloadMaterial(m)
  notice.value = `已导出 ${name}`
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const row = await importMaterial(await file.text())
    notice.value = `已导入「${row.name}」`
    await refresh()
  } catch (err) {
    notice.value = `导入失败 —— ${err instanceof Error ? err.message : String(err)}`
  }
  input.value = ''
}
</script>

<template>
  <section v-if="items.length || notice" class="rounded-2xl bg-white/45 p-5">
    <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="m-0 text-sm tracking-wide text-[#3a3a3a]/75">素材库</h2>
      <button
        type="button"
        class="rounded-full bg-white/60 px-3 py-0.5 text-xs tracking-wide text-[#3a3a3a]/55 hover:bg-white/85"
        @click="fileInput?.click()"
      >
        导入素材文件
      </button>
      <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onImport" />
    </header>

    <ul class="m-0 list-none space-y-1.5 p-0">
      <li
        v-for="m in items"
        :key="m.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#4a6fa5]/12 bg-white/45 px-4 py-2"
      >
        <div class="min-w-0 flex-1">
          <p class="m-0 truncate text-xs tracking-wide text-[#3a3a3a]">
            {{ m.name }}
            <span v-if="m.protagonist" class="text-[#4a6fa5]">· {{ m.protagonist }}</span>
          </p>
          <p class="mb-0 mt-0.5 text-xs tracking-wide text-[#3a3a3a]/40">
            {{ m.chars }} 字 · {{ m.source }} · {{ fmt(m.createdAt) }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-full bg-[#4a6fa5]/10 px-3 py-1 text-xs tracking-wide text-[#4a6fa5] transition-all duration-500 ease-in-out hover:bg-[#4a6fa5]/20 active:scale-[0.98]"
          @click="load(m)"
        >
          用作素材
        </button>
        <button
          type="button"
          class="rounded-full bg-white/60 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/50 hover:bg-white/85"
          @click="exportOne(m)"
        >
          导出
        </button>
        <button
          type="button"
          class="rounded-full bg-white/60 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/45 transition-all duration-500 ease-in-out hover:bg-[#c38d94]/12 hover:text-[#c38d94] active:scale-[0.98]"
          @click="remove(m)"
        >
          删除
        </button>
      </li>
    </ul>

    <p
      v-if="notice"
      class="mb-0 mt-3 rounded-xl bg-[#85cdca]/12 px-4 py-2 text-xs tracking-wide text-[#85cdca]"
    >
      {{ notice }}
    </p>
  </section>
</template>
