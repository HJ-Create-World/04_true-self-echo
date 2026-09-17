---
title: persona-forge · 人格工坊
type: product
status: active
updated: 2026-09-17
owner: HJ
related: [docs/01_product/PRODUCT, docs/00_meta/STATUS]
---

# persona-forge · 人格工坊

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

## 一句话原则

> 所有规矩服务于同一件事：**提升审查能力，而不是提升生成速度。**

AI 写得比你看得快，项目就会崩。详见 [开发规范](docs/06_ops/DEV_STANDARD.md)。
