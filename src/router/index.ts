/**
 * 路由 —— Phase 2 起两个页面（PLAN.md §二 Phase 2「交付形态」）
 *
 * ⚠️ 为什么分成两个页面而不是单页扩展：
 * 「投料」与「聊天」是两种完全不同的心态 —— 前者是打磨，后者是沉浸。
 * 叠在一页里，投料流程（上传 → 清洗 → 提取 → 微调）会把对话页拖成
 * 一个状态机。`App.vue` 在 Phase 1 就已经 115 行，再塞进去必然破 200 行红线。
 *
 * 用懒加载（动态 import）：投料页只在真正进入时才下载，
 * 对话页的首屏体积不受影响。
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'chat',
    component: () => import('@/views/ChatView.vue'),
    meta: { title: '对话' },
  },
  {
    path: '/feed',
    name: 'feed',
    component: () => import('@/views/FeedView.vue'),
    meta: { title: '投料' },
  },
  {
    path: '/persona',
    name: 'persona',
    component: () => import('@/views/PersonaView.vue'),
    meta: { title: '档案' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
    meta: { title: '关于' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置' },
  },
  // 兜底：不写 404 页面，直接回对话页（v1 没有需要保留的旧链接）
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
