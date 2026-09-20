<script setup lang="ts">
/**
 * 投料页 —— Phase 2 的主入口。
 *
 * 流程：素材 → 来源标注 → 层级清洗 → （下一步）提取。
 * **本切片做到「清洗完、可提交提取」，提取本身是下一个切片。**
 *
 * ⚠️ 不把提取直接塞进来：投料是「人打磨素材」的阶段，
 * 提取是「模型干活」的阶段，中间隔着一个「你看一眼确认」的停顿 ——
 * 这个停顿本身就是产品价值（`SPEC.md` §六 手动微调模式）。
 */
import { computed } from 'vue'

import CleanPanel from '@/components/feed/CleanPanel.vue'
import MaterialInput from '@/components/feed/MaterialInput.vue'
import SourcePicker from '@/components/feed/SourcePicker.vue'
import { useFeedStore } from '@/feed/store'

const feed = useFeedStore()

/** 清洗前后的字数对比 —— 让用户看见「剔掉了多少」 */
const removedChars = computed(() => feed.rawChars - feed.cleanChars)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-baseline justify-between gap-4 pb-4">
      <p class="m-0 text-sm tracking-wide text-[#3a3a3a]/55">
        投料 · 从素材里提取人格档案
      </p>
      <p v-if="feed.hits.length" class="m-0 text-xs tracking-wide text-[#3a3a3a]/45">
        清洗剔掉 {{ removedChars }} 字
      </p>
    </div>

    <main class="flex-1 space-y-4 overflow-y-auto pb-4">
      <MaterialInput />

      <template v-if="feed.rawChars > 0">
        <SourcePicker />
        <CleanPanel />
      </template>
    </main>

    <footer class="pb-8 pt-2">
      <div class="flex items-center gap-4">
        <button
          type="button"
          disabled
          class="rounded-2xl bg-[#4a6fa5] px-8 py-3 text-base text-white shadow-[0_4px_20px_rgba(74,111,165,0.12)] transition-all duration-500 ease-in-out disabled:cursor-not-allowed disabled:opacity-40"
        >
          开始提取
        </button>
        <p class="m-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
          提取流程是 Phase 2 的下一个切片，尚未接上。<br />
          当前这一步已完成：素材输入 · 来源标注 · 层级清洗 · 层级检测。
        </p>
      </div>
    </footer>
  </div>
</template>
