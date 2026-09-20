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
 * ⚠️ 只有一个点时画不出「线」，会退化为单个点 + 标注（这是正常状态，
 * 不是 bug —— 刚聊完第一轮的面板就是这样）。
 */
import { computed } from 'vue'

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
</script>

<template>
  <figure class="m-0">
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
          r="4"
          fill="#4a6fa5"
        >
          <title>记忆 {{ p.memoryCount }} 条 · {{ p.label }}</title>
        </circle>
        <circle :cx="x(i)" :cy="yInt(p.intimacy)" r="4" fill="#c38d94">
          <title>亲密度 {{ p.intimacy }} · {{ p.label }}</title>
        </circle>
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

    <figcaption class="mt-2 mb-0 flex flex-wrap gap-x-4 gap-y-1 text-xs tracking-wide text-[#3a3a3a]/45">
      <span><span class="inline-block h-2 w-2 rounded-full" style="background:#4a6fa5"></span> 记忆条数</span>
      <span><span class="inline-block h-2 w-2 rounded-full" style="background:#c38d94"></span> 关系亲密度</span>
      <span>悬停圆点看数值与当时的说明</span>
    </figcaption>
  </figure>
</template>
