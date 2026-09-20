<script setup lang="ts">
/**
 * 层级清洗面板 —— 把「疑似他人已蒸馏好的分析结论」摆到台面上，
 * 由用户勾选要不要剔。
 *
 * ⚠️ 只标不删是刻意的（`SPEC.md` §六）：误删真素材用户看不出来，
 * 漏标用户自己能判断。所以每一条都必须展示**判断依据** ——
 * 否则用户没有信息做决定，这个面板就退化成了瞎点。
 */
import { useFeedStore } from '@/feed/store'

const feed = useFeedStore()

/** 取命中区间的原文预览 */
function preview(start: number, end: number): string {
  return feed.raw.split('\n').slice(start - 1, end).join('\n').slice(0, 420)
}
</script>

<template>
  <section class="rounded-2xl bg-white/60 p-6">
    <header class="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="m-0 text-base tracking-wide">层级清洗</h2>
      <p class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">
        剔除「别人已经总结好的结论」——留着会让提取器抄答案
      </p>
    </header>

    <p
      v-if="feed.hits.length === 0"
      class="m-0 rounded-xl bg-[#85cdca]/10 px-4 py-3 text-sm tracking-wide text-[#3a3a3a]/65"
    >
      没发现疑似蒸馏段落 —— 这份素材看起来是原始的。
    </p>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs tracking-wide text-[#3a3a3a]/55">
        <span>标出 {{ feed.hits.length }} 段 · 将剔除 {{ feed.dropped.length }} 段</span>
        <button
          type="button"
          class="rounded-full bg-white/60 px-3 py-1 text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
          @click="feed.markAll()"
        >
          全选
        </button>
        <button
          type="button"
          class="rounded-full bg-white/60 px-3 py-1 text-[#3a3a3a]/65 transition-all duration-500 ease-in-out hover:bg-[#e8a87c]/10 hover:text-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 active:scale-[0.98]"
          @click="feed.markNone()"
        >
          全不选
        </button>
      </div>

      <ul class="m-0 list-none space-y-3 p-0">
        <li
          v-for="(hit, i) in feed.hits"
          :key="hit.start"
          class="rounded-2xl border border-[#d4a373]/30 bg-[#d4a373]/6 px-4 py-3"
        >
          <label class="flex cursor-pointer items-start gap-3 transition-all duration-500 ease-in-out active:scale-[0.99]">
            <input
              type="checkbox"
              class="mt-1 shrink-0 accent-[#c38d94]"
              :checked="feed.marked.has(i)"
              @change="feed.toggleMark(i)"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-sm tracking-wide text-[#3a3a3a]">{{ hit.label }}</span>
              <span class="mt-0.5 block text-xs tracking-wide text-[#3a3a3a]/45">
                L{{ hit.start }}–{{ hit.end }} · 可疑度 {{ hit.score }}
              </span>
              <span class="mt-1 block text-xs leading-relaxed tracking-wide text-[#c38d94]">
                {{ hit.reasons.join(' · ') }}
              </span>
            </span>
          </label>

          <pre
            class="mt-3 mb-0 max-h-28 overflow-auto rounded-xl bg-white/60 px-3 py-2 text-xs leading-relaxed tracking-wide whitespace-pre-wrap text-[#3a3a3a]/60"
          >{{ preview(hit.start, hit.end) }}</pre>
        </li>
      </ul>
    </template>
  </section>
</template>
