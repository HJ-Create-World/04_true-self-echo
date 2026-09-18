---
title: 真我回响 · true-self-echo
type: product
status: active
updated: 2026-09-18
owner: HJ
related: [docs/01_product/PRODUCT, docs/00_meta/STATUS]
---

# 真我回响

`true-self-echo` ｜ 曾用名 `persona-forge`（人格工坊）· 2026-09-18 更名

> 一个既好用、又能让你看见它内心在发生什么的 AI 伙伴。

记录亲近的人、还原二次元角色、捏一个专属的虚拟伙伴 —— 投料素材，得到一个会成长的人格，
并且你能看见它「变了什么」，也能把它退回去。

---

## 当前状态

**一句话**：需求与文档体系已定稿，Phase 0 人格提取验证已跑完两轮，
**下一步是搭脚手架进入 Phase 1（执行侧干预）**。

> ⚠️ **进度不要写在这里。唯一信息源是 [`docs/00_meta/STATUS.md`](docs/00_meta/STATUS.md)。**

---

## 从哪开始读

| 你是               | 先读                                                                         |
| ---------------- | -------------------------------------------------------------------------- |
| **AI / 第一次接手项目** | [`docs/00_meta/AGENTS.md`](docs/00_meta/AGENTS.md) ← **AI 入口**             |
| **第一次接触这个项目**    | [`docs/01_product/PRODUCT.md`](docs/01_product/PRODUCT.md) ← **产品全貌，先读这个** |
| 想知道现在到哪一步了       | [`docs/00_meta/STATUS.md`](docs/00_meta/STATUS.md)                         |
| 想知道要做什么、不做什么     | [`docs/01_product/SPEC.md`](docs/01_product/SPEC.md)                       |
| 想知道什么时候做什么       | [`docs/01_product/PLAN.md`](docs/01_product/PLAN.md)                       |
| 想知道为什么这么定        | [`docs/02_decisions/`](docs/02_decisions/)                                 |
| 要动手写代码了          | [`docs/06_ops/DEV_STANDARD.md`](docs/06_ops/DEV_STANDARD.md)               |
| 想知道要装什么工具        | [`docs/06_ops/TOOLING.md`](docs/06_ops/TOOLING.md)                         |
| 找不到某份文档          | [`docs/00_meta/INDEX.md`](docs/00_meta/INDEX.md) ← **文档登记表**               |

---

## 技术栈

Vue 3 · TypeScript · Vite · Pinia · IndexedDB · Node.js（薄后端）

不接后端服务、不引 ML 框架、不做模型微调。

---

## 怎么跑起来

```bash
npm install

# 终端 1：薄后端（持有 API Key，对外只有 3 个接口）
npm run server          # → http://127.0.0.1:8787

# 终端 2：前端（/api/* 自动代理到后端）
npm run dev             # → http://localhost:5173

npm run build           # vue-tsc -b && vite build
```

首次运行前把 `.env.example` 复制成 `.env` 并填好密钥。**换模型只改 `.env` 三行，零代码改动**：

```ini
DEFAULT_PROVIDER=deepseek          # 切默认后端
DEEPSEEK_MODEL=deepseek-flash      # 改模型
```

| 后端 | 用途 | 是否需要 Key |
|---|---|---|
| `glm` | 调 prompt 阶段的免费验证层 | 需要 |
| `deepseek` | 主基座 | 需要 |
| `ollama` | 隐私兜底层（本地跑） | **不需要** |

---

## 目录结构

```
src/
  api/         模型接入层（三后端配置驱动）· 密钥不在这里，在后端
  core/        执行侧干预：消息组装器 + 退化检测
  persona/     人格档案（Phase 1 硬编码）
  storage/     IndexedDB 持久化
  stores/      Pinia 对话状态
  components/  水彩风 UI
server/        薄后端（单文件 ≤200 行，只有三个接口）
docs/          文档体系（唯一信息源）
exp/           Phase 0 实验脚本（e5_*）
prototype/     v0.2 视觉基线原型
```

---

## 一句话原则

> 所有规矩服务于同一件事：**提升审查能力，而不是提升生成速度。**

AI 写得比你看得快，项目就会崩。详见 [开发规范](docs/06_ops/DEV_STANDARD.md)。
