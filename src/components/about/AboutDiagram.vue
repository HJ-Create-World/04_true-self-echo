<script setup lang="ts">
/**
 * 介绍页的系统功能图（Q3 · 2026-09-22）
 *
 * 一张图讲清三件事：
 * 1. 主流程：素材 → 人格档案 → 对话 → 记忆演化
 * 2. 双层架构：冻结层（她是谁，AI 不可改）vs 演化层（她知道什么，随对话生长）
 * 3. 数据边界：人格与记忆只在本机；发给外部的只有你选定的模型服务商那一段对话
 *
 * 手绘 SVG 而非图片：跟随主题色、无额外资源、分辨率无关。
 */
</script>

<template>
  <figure class="m-0">
    <svg viewBox="0 0 680 470" class="w-full" role="img" aria-label="系统功能流程图">
      <!-- ============ 主流程三节点 ============ -->
      <!-- 节点 1 · 投料 -->
      <g>
        <rect x="24" y="36" width="180" height="108" rx="14" fill="#4a6fa5" fill-opacity="0.1" stroke="#4a6fa5" stroke-opacity="0.45" />
        <text x="114" y="66" text-anchor="middle" font-size="15" fill="#3a3a3a">① 投料</text>
        <text x="114" y="90" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">粘贴 / 文件 / JSONL 语料</text>
        <text x="114" y="108" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">提取人格档案</text>
        <text x="114" y="126" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">多角色可指定目标角色</text>
      </g>

      <path d="M204 90 L246 90" stroke="#4a6fa5" stroke-opacity="0.5" stroke-width="2" />
      <path d="M242 85 L250 90 L242 95 Z" fill="#4a6fa5" fill-opacity="0.6" />

      <!-- 节点 2 · 人格档案（冻结层） -->
      <g>
        <rect x="252" y="36" width="180" height="108" rx="14" fill="#e8a87c" fill-opacity="0.14" stroke="#e8a87c" stroke-opacity="0.6" />
        <text x="342" y="62" text-anchor="middle" font-size="15" fill="#3a3a3a">② 人格档案</text>
        <text x="342" y="84" text-anchor="middle" font-size="11" font-weight="bold" fill="#c38d94">冻结层 · 她是谁</text>
        <text x="342" y="102" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">特质 / 语言习惯 / 边界 / 矛盾</text>
        <text x="342" y="120" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">AI 不可修改，可手动微调</text>
      </g>

      <path d="M432 90 L474 90" stroke="#4a6fa5" stroke-opacity="0.5" stroke-width="2" />
      <path d="M470 85 L478 90 L470 95 Z" fill="#4a6fa5" fill-opacity="0.6" />

      <!-- 节点 3 · 对话 -->
      <g>
        <rect x="480" y="36" width="176" height="108" rx="14" fill="#4a6fa5" fill-opacity="0.1" stroke="#4a6fa5" stroke-opacity="0.45" />
        <text x="568" y="66" text-anchor="middle" font-size="15" fill="#3a3a3a">③ 对话</text>
        <text x="568" y="90" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">人格正文 + 记忆注入</text>
        <text x="568" y="108" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">执行侧干预：不迎合 · 不追问</text>
        <text x="568" y="126" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">AI 标识 · 危机提示常驻</text>
      </g>

      <!-- ============ 演化层（对话之下，双向箭头） ============ -->
      <path d="M568 144 L568 178" stroke="#85cdca" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="5 4" />
      <path d="M563 174 L568 182 L573 174 Z" fill="#85cdca" fill-opacity="0.8" />
      <path d="M573 148 L568 140 L563 148 Z" fill="#85cdca" fill-opacity="0.8" />

      <g>
        <rect x="252" y="186" width="404" height="96" rx="14" fill="#85cdca" fill-opacity="0.12" stroke="#85cdca" stroke-opacity="0.55" />
        <text x="454" y="212" text-anchor="middle" font-size="15" fill="#3a3a3a">演化层 · 她知道什么（随对话生长）</text>
        <text x="454" y="236" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">
          记忆卡片（触发词可编辑） · 对用户的认知 · 亲密度与关系阶段
        </text>
        <text x="454" y="254" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">
          每次真实变化自动留快照 —— 演化曲线可见，任意时点可回滚
        </text>
        <text x="454" y="272" text-anchor="middle" font-size="11" fill="#3a3a3a" fill-opacity="0.7">
          多人格互相隔离，导出 / 导入 / 级联删除
        </text>
      </g>

      <!-- ============ 底部泳道：数据边界 ============ -->
      <g>
        <rect x="24" y="316" width="632" height="128" rx="14" fill="#d4a373" fill-opacity="0.08" stroke="#d4a373" stroke-opacity="0.4" />
        <text x="40" y="342" font-size="13" font-weight="bold" fill="#3a3a3a">数据边界（纯本地路线）</text>

        <rect x="40" y="356" width="290" height="72" rx="10" fill="#ffffff" fill-opacity="0.6" stroke="#4a6fa5" stroke-opacity="0.25" />
        <text x="56" y="378" font-size="12" fill="#3a3a3a">🗄️ 本机浏览器数据库</text>
        <text x="56" y="396" font-size="11" fill="#3a3a3a" fill-opacity="0.65">人格 · 对话 · 记忆 · 快照 · 素材 · 同意记录</text>
        <text x="56" y="414" font-size="11" fill="#3a3a3a" fill-opacity="0.65">没有服务器，不收集、不上传、不备份</text>

        <path d="M330 392 L372 392" stroke="#c38d94" stroke-opacity="0.6" stroke-width="2" stroke-dasharray="4 4" />
        <text x="351" y="384" text-anchor="middle" font-size="10" fill="#c38d94">仅对话文本</text>

        <rect x="374" y="356" width="266" height="72" rx="10" fill="#ffffff" fill-opacity="0.6" stroke="#c38d94" stroke-opacity="0.3" />
        <text x="390" y="378" font-size="12" fill="#3a3a3a">☁️ 你选定的模型服务商</text>
        <text x="390" y="396" font-size="11" fill="#3a3a3a" fill-opacity="0.65">只有清洗后的素材 / 对话文本会发送</text>
        <text x="390" y="414" font-size="11" fill="#3a3a3a" fill-opacity="0.65">真人素材默认建议本机模型，云端需单独同意</text>
      </g>
    </svg>
    <figcaption class="mt-2 text-xs tracking-wide text-[#3a3a3a]/45">
      冻结层管「她是谁」，演化层管「她知道什么」—— 两者永不混淆；
      数据只存在你的设备里。
    </figcaption>
  </figure>
</template>
