<script setup lang="ts">
/**
 * 人格管理区 —— Phase 4（P4-1 / P4-2）
 *
 * 放在档案页顶部（HJ 确认的方案）：切换 / 新建空白 / 导入 / 导出 / 删除。
 *
 * 🔴 **导出按钮的边界**（SPEC §十 第 12 条）：真实人物（kind === 'real'）的档案
 * **不渲染**导出按钮 —— 不是灰色禁用，是根本不存在。数据模型里有 kind 字段，
 * Phase 2.5 一来真人档案就会是这个类型，这条边界现在就要写死。
 */
import { onMounted, ref } from 'vue'

import { useRosterStore } from '@/stores/roster'

const emit = defineEmits<{ switch: [personaId: string]; imported: [personaId: string] }>()

const roster = useRosterStore()
const newName = ref('')
const showConfirm = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => roster.refresh())

function switchTo(id: string) {
  if (roster.busy) return
  emit('switch', id)
}

async function onCreate() {
  const name = newName.value.trim()
  if (!name) return
  const id = await roster.createBlank(name)
  newName.value = ''
  emit('switch', id)
}

function onExport(id: string) {
  roster.exportById(id).catch((e) => {
    roster.error = e instanceof Error ? e.message : String(e)
  })
}

function askRemove(id: string, name: string) {
  // 级联删除的确认在父组件/这里做一次就够
  showConfirm.value = id
  void name
}

async function confirmRemove() {
  const id = showConfirm.value
  showConfirm.value = null
  if (!id) return
  await roster.remove(id)
}

function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  file.text().then((text) => roster.importFromText(text)).then((res) => {
    emit('imported', res.personaId)
  }).catch((e) => {
    roster.error = e instanceof Error ? e.message : String(e)
  })
}

const fmt = (n: number) => new Date(n).toISOString().slice(5, 10)
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-5">
    <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="m-0 text-base tracking-wide">人格列表</h2>
      <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">
        每个人格的记忆、对话、快照完全独立
      </p>
    </header>

    <ul class="m-0 list-none space-y-2 p-0">
      <li
        v-for="p in roster.items"
        :key="p.id"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#4a6fa5]/15 bg-white/40 px-4 py-2.5"
      >
        <div class="min-w-0 flex-1">
          <p class="m-0 text-sm tracking-wide text-[#3a3a3a]">
            {{ p.name }}
            <span
              v-if="p.kind === 'real'"
              class="ml-1 rounded-full bg-[#c38d94]/15 px-2 py-0.5 text-xs text-[#c38d94]"
            >
              真实人物 · 不可导出
            </span>
          </p>
          <p class="mb-0 mt-0.5 text-xs tracking-wide text-[#3a3a3a]/40">
            {{ p.memoryCount }} 条记忆 · {{ p.conversationCount }} 个对话 · {{ fmt(p.updatedAt) }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="rounded-full bg-white/60 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#4a6fa5]/12 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
            @click="switchTo(p.id)"
          >
            切换
          </button>

          <!-- 🔴 导出边界：真实人物档案不渲染导出按钮（不是禁用，是不存在） -->
          <button
            v-if="p.kind !== 'real'"
            type="button"
            class="rounded-full bg-white/60 px-3 py-1 text-xs tracking-wide text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/12 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
            @click="onExport(p.id)"
          >
            导出
          </button>

          <button
            type="button"
            class="rounded-full bg-white/60 px-3 py-1 text-xs tracking-wide text-[#c38d94]/70 transition-all duration-500 ease-in-out hover:bg-[#c38d94]/12 hover:text-[#c38d94] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
            @click="askRemove(p.id, p.name)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>

    <!-- 级联删除确认 -->
    <div
      v-if="showConfirm"
      class="mt-3 rounded-xl bg-[#c38d94]/12 px-4 py-3 text-xs leading-relaxed tracking-wide text-[#c38d94]"
    >
      删除这个人格会连它的对话、消息、快照一起删掉，无法恢复。确定？
      <span class="mt-2 block">
        <button
          type="button"
          class="rounded-full bg-[#c38d94] px-3 py-1 text-xs text-white transition-all duration-500 ease-in-out hover:opacity-90 active:scale-[0.98]"
          @click="confirmRemove"
        >
          确定删除
        </button>
        <button
          type="button"
          class="ml-2 rounded-full bg-white/70 px-3 py-1 text-xs text-[#3a3a3a]/70 transition-all duration-500 ease-in-out hover:bg-white active:scale-[0.98]"
          @click="showConfirm = null"
        >
          取消
        </button>
      </span>
    </div>

    <!-- 新建 / 导入 -->
    <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-[#4a6fa5]/15 pt-4">
      <input
        v-model="newName"
        type="text"
        placeholder="新人格的名字"
        class="w-44 rounded-xl bg-white/60 px-3 py-1.5 font-serif text-xs tracking-wide text-[#3a3a3a] transition-all duration-500 ease-in-out placeholder:text-[#3a3a3a]/35 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
        @keydown.enter="onCreate"
      />
      <button
        type="button"
        :disabled="!newName.trim()"
        class="rounded-full bg-white/60 px-3 py-1.5 text-xs tracking-wide text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#85cdca]/14 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        @click="onCreate"
      >
        新建空白
      </button>

      <button
        type="button"
        class="rounded-full bg-white/60 px-3 py-1.5 text-xs tracking-wide text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/12 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
        @click="fileInput?.click()"
      >
        导入文件
      </button>
      <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onPickFile" />
    </div>

    <p
      v-if="roster.error"
      class="mb-0 mt-3 rounded-xl bg-[#c38d94]/12 px-4 py-2 text-xs tracking-wide text-[#c38d94]"
    >
      {{ roster.error }}
    </p>
    <p v-else-if="roster.notice" class="mb-0 mt-3 text-xs tracking-wide text-[#85cdca]">
      {{ roster.notice }}
    </p>
  </section>
</template>
