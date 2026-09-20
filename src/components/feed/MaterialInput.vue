<script setup lang="ts">
/**
 * 素材输入 —— 粘贴 / 读本地文本文件 + 投料量档位。
 *
 * ⚠️ 文件用 FileReader 在**浏览器里**读，不经过薄后端、不上传。
 * 投料素材可能含他人隐私，这一步的网络请求数必须是 0。
 */
import { ref } from 'vue'

import { TEXT_EXT, useFeedStore } from '@/feed/store'

const feed = useFeedStore()
const fileInput = ref<HTMLInputElement | null>(null)

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await feed.loadFile(file)
  // 清空 input，否则同一个文件选第二次不触发 change
  input.value = ''
}

const TONE_CLASS: Record<'bad' | 'ok' | 'good', string> = {
  bad: 'text-[#c38d94]',
  ok: 'text-[#d4a373]',
  good: 'text-[#85cdca]',
}
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-6">
    <header class="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="m-0 text-base tracking-wide">素材</h2>
      <div class="flex items-center gap-3 text-xs tracking-wide">
        <span :class="TONE_CLASS[feed.tierInfo.tone]">
          {{ feed.cleanChars }} 字 · {{ feed.tierInfo.label }}
        </span>
        <button
          type="button"
          class="rounded-full bg-white/60 px-3 py-1 text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
          @click="fileInput?.click()"
        >
          读取文件
        </button>
        <button
          v-if="feed.rawChars > 0"
          type="button"
          class="rounded-full bg-white/60 px-3 py-1 text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
          @click="feed.reset()"
        >
          清空
        </button>
      </div>
    </header>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="TEXT_EXT.join(',')"
      @change="onPick"
    />

    <textarea
      :value="feed.raw"
      rows="12"
      placeholder="把素材粘贴到这里 —— 整段复制，不用整理。&#10;（也可以点右上「读取文件」，支持 .txt / .md）"
      class="w-full resize-y rounded-2xl bg-white/60 px-5 py-4 font-serif text-sm leading-relaxed tracking-wide text-[#3a3a3a] placeholder:text-[#3a3a3a]/35 transition-all duration-500 ease-in-out focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
      @input="feed.raw = ($event.target as HTMLTextAreaElement).value"
    />

    <p
      v-if="feed.fileError"
      class="mt-3 mb-0 rounded-xl bg-[#c38d94]/12 px-4 py-2 text-xs leading-relaxed tracking-wide text-[#c38d94]"
    >
      {{ feed.fileError }}
    </p>

    <details class="mt-4 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/55">
      <summary class="cursor-pointer transition-all duration-500 ease-in-out hover:text-[#3a3a3a]">
        什么样的素材能提取出好东西？
      </summary>
      <ul class="mt-2 mb-0 list-none space-y-1 p-0">
        <li>· 不少于 3 段这个人说的话，其中<span class="text-[#e8a87c]">至少 1 段是情绪极端时</span>（生气 / 难过 / 告别 / 拒绝）</li>
        <li>· 实测：400 字只能拿到语言风格；1800 字（含冲突 + 离别）才能提取到内在矛盾</li>
        <li>· 小说原文、剧本 &gt; 纯台词 —— 因为「她嘴上说 X，但身体做了 Y」才是深层人格的关键</li>
        <li>· 不要投别人已经写好的「角色分析」—— 提取器会直接抄那份分析的结论</li>
      </ul>
    </details>
  </section>
</template>
