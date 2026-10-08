<script setup lang="ts">
/**
 * 「变化的」那张图：演化曲线 —— HJ 拍板的**两张图之二**
 *
 * 数据来自快照（每个点 = 一次「她知道了更多」），
 * 指标由 `metricsOf()` 从快照里的演化层现算。
 *
 * ## 两条线、两套刻度
 *
 * 记忆条数（个位数）和亲密度（0–100）量纲完全不同，
 * 同一个 Y 轴会让其中一条变成直线。所以**各自按自己的最大值归一化**，
 * 数值直接标在点旁边 —— 趋势看线，具体值看标注。
 *
 * ## 悬停（2026-10-08 修复）
 *
 * ⚠️ 不要用 SVG `<title>`：原生 tooltip 延迟近一秒、部分环境不显示，
 * HJ 实测「悬停没反应」。改 mouseenter + HTML 浮层，圆点同步放大。
 *
 * ## 关系阶段变化（2026-10-08 新增）
 *
 * 相邻快照的阶段（由 intimacy 推导）发生变化时，画一条分隔竖线 + 阶段名 ——
 * 「不同档的变化在哪看」就是看这个。阶段定义见 persona/relation.ts 的 STAGES。
 */
import { computed, ref } from 'vue'

import { stageOf } from '@/persona/relation'

export interface CurvePoint {
  at: string
  label: string
  memoryCount: number
  userFactCount: number
  intimacy: number
}

const props = defineProps<{ points: CurvePoint[] }>()

const W = 420
const H = 190
const PAD_L = 34
const PAD_R = 16
const PAD_T = 18
const PAD_B = 34

const innerW = W - PAD_L - PAD_R
const innerH = H - PAD_T - PAD_B

const maxMem = computed(() => Math.max(1, ...props.points.map((p) => p.memoryCount)))
const maxInt = computed(() => Math.max(1, ...props.points.map((p) => p.intimacy)))

const x = (i: number) =>
  props.points.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (props.points.length - 1)) * innerW

/** 每条线各自归一化 */
const yMem = (v: number) => PAD_T + innerH - (v / maxMem.value) * innerH
const yInt = (v: number) => PAD_T + innerH - (v / maxInt.value) * innerH

const memPath = computed(() =>
  props.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yMem(p.memoryCount)}`).join(' '),
)
const intPath = computed(() =>
  props.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yInt(p.intimacy)}`).join(' '),
)

const fmtDay = (iso: string) => iso.slice(5, 10).replace('T', ' ')

/* ---------- 悬停（自定义 tooltip，替代原生 <title>） ---------- */
const hover = ref<{ i: number; series: 'mem' | 'int' } | null>(null)

const hoverText = computed(() => {
  if (!hover.value) return ''
  const p = props.points[hover.value.i]
  if (!p) return ''
  const value =
    hover.value.series === 'mem' ? `记忆 ${p.memoryCount} 条` : `亲密度 ${p.intimacy}（${stageOf(p.intimacy)}）`
  return `${value} · ${p.label}`
})

/* ---------- 阶段变化分隔线 ---------- */
const stageChanges = computed(() => {
  const out: { i: number; x: number; from: string; to: string }[] = []
  for (let i = 1; i < props.points.length; i++) {
    const from = stageOf(props.points[i - 1].intimacy)
    const to = stageOf(props.points[i].intimacy)
    if (from !== to) out.push({ i, x: x(i), from, to })
  }
  return out
})
</script>

<template>
  <figure class="relative m-0">
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="演化曲线">
      <!-- 底轴 -->
      <line
        :x1="PAD_L"
        :y1="H - PAD_B"
        :x2="W - PAD_R"
        :y2="H - PAD_B"
        stroke="#4a6fa5"
        stroke-opacity="0.25"
      />

      <!-- 关系阶段变化分隔线 + 阶段名 -->
      <g v-for="sc in stageChanges" :key="`stage-${sc.i}`">
        <line
          :x1="sc.x"
          :y1="PAD_T"
          :x2="sc.x"
          :y2="H - PAD_B"
          stroke="#c38d94"
          stroke-opacity="0.35"
          stroke-dasharray="3 4"
        />
        <text
          :x="sc.x"
          :y="PAD_T - 5"
          text-anchor="middle"
          class="fill-[#c38d94]"
          style="font-size: 10px"
        >
          {{ sc.to }}
        </text>
      </g>

      <!-- 记忆条数 -->
      <!-- ⚠️ 用 <path d> 而不是 <polyline points>：points 的语法是 "x,y x,y"，
           而 polyline 里塞 "M… L…" 会报 Expected number（2026-09-20 实测）。
           两种元素都能画折线，但格式不通用。 -->
      <path
        v-if="points.length > 1"
        :d="memPath"
        fill="none"
        stroke="#4a6fa5"
        stroke-width="2"
        stroke-opacity="0.8"
        stroke-linejoin="round"
      />
      <!-- 亲密度 -->
      <path
        v-if="points.length > 1"
        :d="intPath"
        fill="none"
        stroke="#c38d94"
        stroke-width="2"
        stroke-opacity="0.7"
        stroke-dasharray="5 4"
        stroke-linejoin="round"
      />

      <g v-for="(p, i) in points" :key="p.at">
        <circle
          :cx="x(i)"
          :cy="yMem(p.memoryCount)"
          :r="hover && hover.i === i && hover.series === 'mem' ? 6 : 4"
          fill="#4a6fa5"
          style="cursor: pointer; transition: r 0.15s"
          @mouseenter="hover = { i, series: 'mem' }"
          @mouseleave="hover = null"
        />
        <circle
          :cx="x(i)"
          :cy="yInt(p.intimacy)"
          :r="hover && hover.i === i && hover.series === 'int' ? 6 : 4"
          fill="#c38d94"
          style="cursor: pointer; transition: r 0.15s"
          @mouseenter="hover = { i, series: 'int' }"
          @mouseleave="hover = null"
        />
        <text
          :x="x(i)"
          :y="yMem(p.memoryCount) - 9"
          text-anchor="middle"
          class="fill-[#4a6fa5]"
          style="font-size: 10px"
        >
          {{ p.memoryCount }}
        </text>
        <text
          :x="x(i)"
          :y="H - PAD_B + 14"
          text-anchor="middle"
          class="fill-[#3a3a3a]"
          fill-opacity="0.45"
          style="font-size: 10px"
        >
          {{ fmtDay(p.at) }}
        </text>
      </g>
    </svg>

    <!-- 自定义 tooltip：跟着被悬停的点走 -->
    <div
      v-if="hover"
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-[#3a3a3a]/90 px-3 py-1.5 text-xs tracking-wide text-white shadow-lg"
      :style="{ left: `${(x(hover.i) / W) * 100}%`, top: `${((hover.series === 'mem' ? yMem(points[hover.i].memoryCount) : yInt(points[hover.i].intimacy)) / H) * 100}%`, marginTop: '-8px' }"
    >
      {{ hoverText }}
    </div>

    <figcaption class="mt-2 mb-0 flex flex-wrap gap-x-4 gap-y-1 text-xs tracking-wide text-[#3a3a3a]/45">
      <span><span class="inline-block h-2 w-2 rounded-full" style="background:#4a6fa5"></span> 记忆条数</span>
      <span><span class="inline-block h-2 w-2 rounded-full" style="background:#c38d94"></span> 关系亲密度</span>
      <span>粉色虚线 = 进入新关系阶段</span>
      <span>悬停圆点看数值与当时的说明</span>
    </figcaption>
  </figure>
</template>
