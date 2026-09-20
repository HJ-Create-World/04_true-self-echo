<script setup lang="ts">
/**
 * 「不变的」那张图：人设结构 —— HJ 拍板的**两张图之一**
 *
 * 它画的是**冻结层各部分有多少条依据**。
 *
 * ⚠️ 为什么要画这个（不是画「性格强度」）：
 * 冻结层不可修改，所以它的内容是静态的 —— 画「性格强度」就得编一个
 * 没有依据的数值。而「各部分有多少条」是**真实可数的**，且能一眼看出
 * **档案哪里薄**（比如「约束条件」只有 1 条 = 出戏风险高）。
 *
 * 配色规则：≥4 条蓝灰（够厚），2–3 条沙色（偏薄），0–1 条玫瑰（薄弱）。
 * 阈值是拍的，但「薄 → 该去补素材」这个结论是可执行的。
 */
import { computed } from 'vue'

import type { FrozenLayer } from '@/persona/schema'

const props = defineProps<{ frozen: FrozenLayer }>()

const BARS = computed(() => {
  const f = props.frozen
  return [
    { label: '核心特质', count: f.coreTraits.length, note: '表现型 + 可执行' },
    { label: '说话风格', count: f.expressionDNA.length, note: '语气词 / 替换表 / 节奏' },
    { label: '内在矛盾', count: f.tensions.length, note: '每组必须有统一点' },
    { label: '情境反应', count: f.socialBehavior.length, note: '情境 → 行为' },
    { label: '负面清单', count: f.boundaries.length, note: '她绝不会说什么' },
    { label: '约束条件', count: f.constraints.length, note: '禁止直陈 + 通道' },
  ]
})

const MAX = computed(() => Math.max(4, ...BARS.value.map((b) => b.count)))

/** 0–1 归一化后的条长 */
function width(count: number): number {
  return Math.round((count / MAX.value) * 100)
}

function tone(count: number): string {
  if (count >= 4) return '#4a6fa5'
  if (count >= 2) return '#d4a373'
  return '#c38d94'
}

const W = 420
const BAR_H = 26
const GAP = 10
const LABEL_W = 76
const H = BARS.value.length * (BAR_H + GAP) + 8
</script>

<template>
  <figure class="m-0">
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="人设结构图">
      <g
        v-for="(b, i) in BARS"
        :key="b.label"
        :transform="`translate(0, ${i * (BAR_H + GAP)})`"
      >
        <text
          :x="LABEL_W - 6"
          :y="BAR_H / 2 + 4"
          text-anchor="end"
          class="fill-[#3a3a3a]"
          style="font-size: 12px; letter-spacing: 0.05em"
        >
          {{ b.label }}
        </text>
        <!-- 底轨 -->
        <rect
          :x="LABEL_W"
          :y="4"
          :width="W - LABEL_W - 34"
          :height="BAR_H - 8"
          rx="9"
          fill="#ffffff"
          fill-opacity="0.5"
        />
        <!-- 实际条 -->
        <rect
          :x="LABEL_W"
          :y="4"
          :width="Math.max(6, ((W - LABEL_W - 34) * width(b.count)) / 100)"
          :height="BAR_H - 8"
          rx="9"
          :fill="tone(b.count)"
          fill-opacity="0.72"
        />
        <text
          :x="W - 28"
          :y="BAR_H / 2 + 4"
          class="fill-[#3a3a3a]"
          fill-opacity="0.7"
          style="font-size: 12px"
        >
          {{ b.count }}
        </text>
      </g>
    </svg>
    <figcaption class="mt-2 mb-0 text-xs leading-relaxed tracking-wide text-[#3a3a3a]/45">
      各部分有多少条依据 —— 玫瑰色的是薄弱处，该去补素材或手动补写。
      这张图是**静态的**：冻结层不会因为聊天而改变。
    </figcaption>
  </figure>
</template>
