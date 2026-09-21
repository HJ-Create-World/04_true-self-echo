<script setup lang="ts">
/**
 * R6 · 云端传输关卡（Phase 2.5）
 *
 * 真人素材的默认处理路径是**本机**（本地 provider，如 ollama）。
 * 只有当用户主动选了云端 API 时，才出现这一条：单独说明 + 勾选确认，
 * 勾选即落库（scope = cloudTransfer）—— 下次同一版本不再重复问。
 *
 * 虚拟角色素材完全不渲染本组件（云端传输对虚拟素材无此要求）。
 */
import { computed, onMounted, watch } from 'vue'

import { isLocalProvider } from '@/api/provider'
import { useRealGate } from '@/feed/realGate'

const props = defineProps<{
  /** 真人素材流程是否启用（kind === 'real'） */
  active: boolean
  /** 当前选中的 provider 名（ExtractPanel 的选择结果） */
  providerName: string
  /** providers 是否已加载（加载中不渲染，避免误判） */
  ready: boolean
}>()

const gate = useRealGate()

onMounted(() => void gate.refresh())

/** 当前 provider 是否云端 —— 本地（ollama）不需要这道关 */
const isCloud = computed(() => props.ready && props.providerName !== '' && !isLocalProvider(props.providerName))

const show = computed(() => props.active && isCloud.value)

const needConsent = computed(() => show.value && !gate.cloudTransferConsented.value)

watch(show, (v) => {
  if (v) void gate.refresh()
})
</script>

<template>
  <div v-if="show" class="rounded-2xl p-4" :class="needConsent ? 'bg-[#d4a373]/12' : 'bg-[#85cdca]/10'">
    <p class="m-0 text-sm leading-relaxed tracking-wide" :class="needConsent ? 'text-[#3a3a3a]/80' : 'text-[#3a3a3a]/65'">
      <template v-if="needConsent">
        ⚠️ 真人素材默认建议走本机模型。当前选择的
        <span class="text-[#3a3a3a]">{{ providerName }}</span> 是云端服务 ——
        清洗后的素材文本将被发送到该服务商的服务器处理。
      </template>
      <template v-else-if="isCloud">
        ✅ 已确认云端传输（素材将发送至 {{ providerName }}）。
      </template>
      <template v-else>
        ✅ 将使用本机模型（{{ providerName }}），素材不离开这台设备。
      </template>
    </p>

    <label
      v-if="needConsent"
      class="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/75"
    >
      <input
        type="checkbox"
        class="mt-0.5 accent-[#4a6fa5]"
        :checked="gate.cloudTransferConsented.value"
        @change="gate.grantCloudTransfer()"
      />
      <span>
        我知晓并同意：本次提取会把清洗后的素材文本发送至
        {{ providerName }}（云端 API）处理，处理受该服务商条款约束。
      </span>
    </label>
  </div>
</template>
