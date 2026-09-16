# persona-forge · 人格工坊

> 一个既好用、又能让你看见它内心在发生什么的 AI 伙伴。

记录亲近的人、还原二次元角色、捏一个专属的虚拟伙伴 —— 投料素材，得到一个会成长的人格，
并且你能看见它「变了什么」，也能把它退回去。

---

## 当前状态

| 阶段 | 状态 |
|---|---|
| 需求定义 | ✅ 完成 |
| 技术选型 | ✅ 完成 |
| 交付计划 | ✅ 完成 |
| 开发规范 | ✅ 完成 |
| **Phase 0 人格提取验证** | 📋 **待执行（下一步）** |
| 代码脚手架 | ⬜ 未开始 |
| GitHub 仓库 | ⬜ 未开始 |

**这个项目目前还没有一行代码。** 下一步是跑 Phase 0 验证。

---

## 从哪开始读

| 你是 | 先读 |
|---|---|
| **第一次接触这个项目** | [`docs/PROJECT.md`](docs/PROJECT.md) ← **唯一入口，先读这个** |
| 想知道要做什么、不做什么 | [`docs/SPEC.md`](docs/SPEC.md) |
| 想知道什么时候做什么 | [`docs/PLAN.md`](docs/PLAN.md) |
| 想知道为什么这么定 | [`docs/decisions/`](docs/decisions/) |
| 要动手写代码了 | [`docs/DEVELOPMENT_STANDARD.md`](docs/DEVELOPMENT_STANDARD.md) |
| 想知道要装什么工具 | [`docs/TOOLING.md`](docs/TOOLING.md) |

---

## 技术栈

Vue 3 · TypeScript · Vite · Pinia · IndexedDB · Node.js（薄后端）

不接后端服务、不引 ML 框架、不做模型微调。

---

## 一句话原则

> 所有规矩服务于同一件事：**提升审查能力，而不是提升生成速度。**

AI 写得比你看得快，项目就会崩。详见 [开发规范](docs/DEVELOPMENT_STANDARD.md)。
