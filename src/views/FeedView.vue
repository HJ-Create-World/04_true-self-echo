<script setup lang="ts">
/**
 * 投料页 —— Phase 2 的主入口。
 *
 * 流程：素材 → 来源标注 → 层级清洗 → 提取 → 存下来去开聊。
 * 「提取 → 开聊」这一段已打通，但现在是一键黑盒；
 * 逐字段手动微调（`SPEC.md` §六 的第二种模式）是下一个切片。
 */
import { computed, onMounted } from 'vue'

import CleanPanel from '@/components/feed/CleanPanel.vue'
import ExtractPanel from '@/components/feed/ExtractPanel.vue'
import MaterialInput from '@/components/feed/MaterialInput.vue'
import RealGatePanel from '@/components/feed/RealGatePanel.vue'
import SourcePicker from '@/components/feed/SourcePicker.vue'
import { useFeedStore } from '@/feed/store'
import { useChatStore } from '@/stores/chat'

const feed = useFeedStore()
const chat = useChatStore()

// 提取要选后端，得先拿到 provider 清单
onMounted(() => {
  if (chat.providers.length === 0) chat.init()
})

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
        <!-- 真人素材的同意关卡（R5）：没过这关，提取按钮是死的 -->
        <RealGatePanel v-if="feed.kind === 'real'" />
        <SourcePicker />
        <CleanPanel />
        <ExtractPanel />
      </template>
    </main>
  </div>
</template>
