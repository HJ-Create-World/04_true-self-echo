---
title: Phase 0 人格提取验证（已废弃）
type: index
status: archived
updated: 2026-09-17
owner: HJ
superseded_by: [../04_lab/README.md, ../00_meta/STATUS.md]
---

# ⚠️ 本文档已废弃

**废弃时间**：2026-09-17
**取代者**：`docs/04_lab/README.md`（实验索引）+ `docs/00_meta/STATUS.md`（进度）

## 为什么废弃

这份文档同时承担了**三种互相冲突的职责**，导致内容自相矛盾：

| 职责 | 内容 | 冲突 |
|---|---|---|
| 执行记录 | 已完成的测试结果 | 顶部写"已执行完成" |
| 执行脚本 | 待执行的步骤 | 底部写"状态：待执行" |
| 操作说明 | "现在就开始"的引导 | 引导人去执行一个**已经跑完**的任务 |

同一份文档里 `status` 有两种说法，另外还夹着一版已被取代的 v1 Prompt 草案（正式版在 `phase0/Prompt-提取.md`）。

## 改了什么（要不要去看新的）

| 内容 | 现在在哪 |
|---|---|
| Phase 0 执行结果与结论 | `docs/_archive/phase0/Phase0结论报告.md`（**历史数据**；当前口径见 `docs/04_lab/phase0/三方对照结论.md`） |
| 实验总览与后续计划 | `docs/04_lab/README.md` |
| 项目当前进度 | `docs/00_meta/STATUS.md` |
| 执行用的 Prompt（正式版） | `docs/_archive/phase0/Prompt-提取.md`（**归档资产，可引用**） |
| 测试素材 | `docs/_archive/phase0/A-角色台词.md` 等（**归档资产，可引用**） |
| 操作步骤卡片 | `docs/_archive/phase0/执行卡片.md`（**归档资产，可引用**） |

> ⚠️ **上表路径已于 2026-09-17 修正。** 原表指向 `docs/04_lab/phase0/`，
> 但该批文件已移至 `docs/_archive/phase0/`，原路径全部失效。
> 引用规则见 `docs/00_meta/DOC_STANDARD.md` §7.5（归档资产 vs 过程记录）。

> **结论本身没有过时** —— 第一轮的「材料层级理论」和「情绪类型覆盖率」两条发现仍然有效，
> 只是被拆到了正确的位置。且第二轮三方对照对其中的一个推论做了修正
> （"投料质量决定一切" → "收益在第 3 分处归零"），详见 `04_lab/phase0/三方对照结论.md`。

<!-- 正文已删除，避免被误引用 -->
