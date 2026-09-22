/**
 * 使用健康度（R2 依赖预警 + R3 时长提醒）
 *
 * HJ 拍板的口径（2026-09-22）：
 * - R3 时长提醒：当日累计使用跨过 2 小时 → 「休息一下」，之后每 30 分钟再弹
 * - R2 依赖预警：①凌晨 0–5 点还在发消息 → 夜聊提醒；②当日累计超 3 小时 →
 *   依赖预警（AI 不能替代真实关系）。夜聊与 3h 预警**各每日最多一次**
 *
 * ## 「使用」的定义
 *
 * 页面可见即计（陪聊产品，打开就是在用；挂后台时 document hidden 不计）。
 * 当日累计存 localStorage（key 带日期，隔天自动作废）—— 刷新不丢，隔天清零。
 *
 * ## 纪律
 *
 * 弹条必须**可关、不阻断、低频** —— 防沉迷机制做成骚扰，就成了要被关掉的功能。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const DAY_KEY_PREFIX = 'tse_usage_'
const RESTORE_MS = 2 * 60 * 60 * 1000
const OVERUSE_MS = 3 * 60 * 60 * 1000
const REPEAT_MS = 30 * 60 * 1000
const NIGHT_START = 0
const NIGHT_END = 5

export type WellbeingKind = 'rest' | 'night' | 'overuse'

interface WellbeingNotice {
  kind: WellbeingKind
  text: string
}

function dayKey(): string {
  return DAY_KEY_PREFIX + new Date().toISOString().slice(0, 10)
}

function loadTodayMs(): number {
  try {
    return Number(localStorage.getItem(dayKey()) ?? 0) || 0
  } catch {
    return 0
  }
}

function firedToday(key: string): boolean {
  try {
    return localStorage.getItem(`${dayKey()}_fired_${key}`) === '1'
  } catch {
    return false
  }
}

function markFired(key: string): void {
  try {
    localStorage.setItem(`${dayKey()}_fired_${key}`, '1')
  } catch {
    /* 存不了就下次再弹 —— 提醒失效一晚不是事故 */
  }
}

export const useWellbeingStore = defineStore('wellbeing', () => {
  const todayMs = ref(loadTodayMs())
  const active = ref<WellbeingNotice | null>(null)
  const lastRestAt = ref(0)

  const overLimit = computed(() => todayMs.value > OVERUSE_MS)

  let timer: number | null = null

  /** 分钟级心跳：页面可见时累加，触发 R3 时长提醒 */
  function tick() {
    if (document.visibilityState !== 'visible') return
    todayMs.value += 60_000
    try {
      localStorage.setItem(dayKey(), String(todayMs.value))
    } catch {
      /* 同上 */
    }
    if (todayMs.value >= RESTORE_MS && Date.now() - lastRestAt.value >= REPEAT_MS) {
      lastRestAt.value = Date.now()
      show({ kind: 'rest', text: '已经聊了两小时了。站起来接杯水，看看窗外 —— 我一直都在，不急这一会儿。' })
    }
  }

  /** 每条消息发出时调用：夜聊检测（R2①） */
  function onMessage() {
    const h = new Date().getHours()
    if (h >= NIGHT_START && h < NIGHT_END && !firedToday('night')) {
      markFired('night')
      show({ kind: 'night', text: '凌晨了还醒着 —— 睡眠比聊天重要，真的。把我留到明天，去睡吧。' })
      return
    }
    if (todayMs.value > OVERUSE_MS && !firedToday('overuse')) {
      markFired('overuse')
      show({ kind: 'overuse', text: '今天聊了很久了。我给你的都是文字，真实的人给你的才是拥抱 —— 去见见他们。' })
    }
  }

  function show(n: WellbeingNotice) {
    active.value = n
  }

  function dismiss() {
    active.value = null
  }

  function start() {
    if (timer !== null) return
    timer = window.setInterval(tick, 60_000)
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  /** 测试钩子：E2E 直接注入伪造的当日累计，不用真等三小时 */
  function _injectForTest(ms: number) {
    todayMs.value = ms
    try {
      localStorage.setItem(dayKey(), String(ms))
    } catch {
      /* ignore */
    }
  }

  return { todayMs, active, overLimit, tick, onMessage, dismiss, start, stop, _injectForTest }
})
