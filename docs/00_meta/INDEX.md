---
title: INDEX · 文档登记表
type: index
status: active
updated: 2026-09-17
owner: HJ
---

# INDEX · 文档登记表

> **找不到某份信息时，先查这里。不要靠猜文件名。**
>
> 新增文档必须在此登记，否则视为不存在。删除/归档文档必须在 `status` 列标注。

---

## 一、按目录浏览

### 📁 `00_meta/` — 元信息
| 文件 | status | 用途（什么时候读） |
|---|---|---|
| `AGENTS.md` | active | **AI 入口**。任何 AI 接手时第一个读 |
| `INDEX.md` | active | 本文档。找东西 |
| `STATUS.md` | active | **项目进度唯一信息源**。想知道"到哪一步了"读它 |
| `GLOSSARY.md` | active | 术语表。看到不认识的项目黑话读它 |
| `DOC_STANDARD.md` | active | 文档编写规范。**要写新文档时必读** |

### 📁 `01_product/` — 产品定义（回答"做什么"）
| 文件 | status | 用途 |
|---|---|---|
| `PRODUCT.md` | active | 产品全貌速览（原 PROJECT.md）。**接手项目先读它** |
| `SPEC.md` | active | **需求唯一信息源**。产品定位、范围、功能清单 |
| `PLAN.md` | active | 交付计划与里程碑、防烂尾检查点 |

### 📁 `02_decisions/` — 决策记录（回答"为什么这么做"）
| 文件 | status | 决策 |
|---|---|---|
| `D001-产品定位.md` | active | 定位为「透明的陪伴者」 |
| `D002-核心抽象-人格档案.md` | active | 三场景统一为唯一抽象「人格档案」 |
| `D003-架构选型.md` | active | 前端 + 本地薄后端（方案 B） |
| `D004-记忆方案.md` | active | 结构化记忆 + 关键词触发，不用向量 |
| `D005-不做模型微调.md` | active | 彻底不做 LoRA / 训练 |
| `D006-文档管理体系.md` | active | 分层目录 + 单一信息源 + 状态机 |
| `D007-Phase1转向执行侧.md` | active | 从"加码素材"转向"干预生成" |

### 📁 `03_specs/` — 技术规范（回答"怎么做"）
| 文件 | status | 用途 |
|---|---|---|
| `persona-schema.md` | draft | 人格档案数据结构定义 |
| `评分标准.md` | draft | **三套实验评分标准的唯一定义处**。看历史分数前必读（§四属事后重构，待 HJ 复核） |

> 规划中（尚未创建，不要引用）：`memory-schema.md`（记忆卡片结构）、`prompt-assembly.md`（System Prompt 拼装规则）。

### 📁 `04_lab/` — 实验与实测
| 文件 | status | 用途 |
|---|---|---|
| `README.md` | active | **实验索引**。看进行过哪些验证 |
| `phase0/三方对照结论.md` | active | ⭐ **第二轮总纲**（elysia 素材三方对照）—— 当前有效结论看这份 |
| `phase0/Phase0结论报告.md` | superseded | 第一轮结论（**核心发现已被第二轮修正**，见文件头横幅） |
| `phase0/E1-纯台词提取.md` | active | 原始数据：纯台词组 14/30 |
| `phase0/E2-双层素材提取.md` | active | 原始数据：双层素材组 22/30 |
| `phase0/E3-分析层对照.md` | active | 原始数据：分析层组 23/30 |
| `phase0/A-角色台词.md` | active | **素材原文**（爱莉希雅 4 场景）。⚠️ 末尾含考点答案表，评测前须剔除 |
| `phase0/A2-纯台词版.md` | active | **素材原文**（A 版的无括号动作对照组） |
| `phase0/Prompt-提取.md` | active | **提取 Prompt v1/v2 原文**（产品原型） |
| `phase0/B-闭环验证.md` | active | **扮演闭环测试流程 + 第一套六维标准 + 四轮测试话术** |
| `phase0/测试结果-扮演.md` | active | 第一轮扮演原始数据（含自建 System Prompt 全文） |
| `phase0/测试结果-诊断.md` | active | **Prompt 缺陷诊断与七条修正**（Phase 1 Prompt 设计输入） |
| `phase0/测试结果-投料量对照.md` | active | **投料量实验**（L1/L2/L3 三档）—— 唯一覆盖此议题 |
| `phase0/测试结果-纯台词对照.md` | active | 第一轮纯台词对照原始数据（材料层级理论第一手证据） |
| `phase0/测试结果-v1.md` | active | 第一轮原始数据（v1 总结式输出） |
| `phase0/测试结果-v2.md` | active | 第一轮原始数据（v2 考证式输出） |
| `phase0/执行卡片.md` | archived | 操作手册（已执行完毕，保留作 E4/E5/E6 流程模板） |

### 📁 `05_research/` — 外部调研
| 文件 | status | 用途 |
|---|---|---|
| `竞品-Distilly.md` | active | 24804★ 高星蒸馏项目分析 |
| `竞品-elysia.skill.md` | active | 43★ 角色扮演项目实测 |
| `AI陪伴市场调研.md` | active | 市场产品、付费、合规 |
| `开源生态盘点.md` | active | 5 类开源项目横向对比 |

### 📁 `06_ops/` — 操作手册
| 文件 | status | 用途 |
|---|---|---|
| `DEV_STANDARD.md` | active | 开发规范（含防烂尾约束） |
| `RUNBOOK.md` | active | 常见操作：git、构建、部署 |
| `TOOLING.md` | active | Skill / MCP 清单 |

### 📁 `_archive/` — 已废弃
| 文件 | status | 废弃原因 | 取代者 |
|---|---|---|---|
| `PHASE0_人格提取验证.md` | archived | 内容已拆分到 `04_lab/` + `STATUS.md` | `04_lab/README.md` |
| `模型实测说明.md` | archived | Phase 0 执行前计划书，测试已跑完 | `03_specs/评分标准.md` §三 |

> ⚠️ **`_archive/` 下的内容一律不可作为依据。**

---

## 二、按问题检索（用途视角）

| 我想知道… | 去读 |
|---|---|
| 这个项目是干什么的 | `01_product/PRODUCT.md` |
| 现在做到哪一步了 | `00_meta/STATUS.md` |
| 为什么不用向量库 | `02_decisions/D004-记忆方案.md` |
| 为什么不做微调 | `02_decisions/D005-不做模型微调.md` |
| 人格档案有哪些字段 | `03_specs/persona-schema.md` |
| 历史分数（14/30 等）是怎么评的 | `03_specs/评分标准.md` |
| 投料要多少字、什么场景 | `04_lab/phase0/测试结果-投料量对照.md` |
| 提取 Prompt 该怎么写 | `04_lab/phase0/测试结果-诊断.md`（七条修正） |
| 扮演要跑哪几轮、怎么打分 | `04_lab/phase0/B-闭环验证.md` |
| 验证过什么、结论是什么 | `04_lab/README.md` |
| GitHub 上有什么同类项目 | `05_research/开源生态盘点.md` |
| 怎么提交代码 | `06_ops/DEV_STANDARD.md` |
| git 推送报错了 | `06_ops/RUNBOOK.md` |
| 某个黑话是什么意思 | `00_meta/GLOSSARY.md` |
| 写新文档要怎么起头 | `00_meta/DOC_STANDARD.md` |

---

## 三、信息归属速查（防重复）

**每个事实只有一个家。要写这些信息时，去改对应文件，不要在别处复制。**

| 事实 | 唯一归属 |
|---|---|
| 产品定位、功能范围 | `01_product/SPEC.md` |
| 项目进度、里程碑状态 | `00_meta/STATUS.md` |
| 决策结论与理由 | `02_decisions/Dxxx-*.md` |
| 数据结构与字段 | `03_specs/*.md` |
| **实验评分标准（三套）** | `03_specs/评分标准.md` |
| 实验数据与结论 | `04_lab/` 对应文件 |
| 外部项目信息 | `05_research/` |
| 开发流程与规范 | `06_ops/DEV_STANDARD.md` |
| 术语定义 | `00_meta/GLOSSARY.md` |

---

*新增/归档文档时请同步更新本表。最后更新：2026-09-17*
