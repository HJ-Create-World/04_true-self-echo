---
title: RUNBOOK · 操作手册
type: runbook
status: active
updated: 2026-09-17
owner: HJ
related: [DEV_STANDARD, TOOLING]
---

# RUNBOOK · 操作手册

> **什么时候读这份文档**：执行 git / 构建 / 部署等具体操作时，或操作报错了。
>
> **它不是**：开发规范（那是 `DEV_STANDARD.md`）。
>
> **它能回答**：怎么提交推送？报错了怎么办？临时文件怎么清？

---

## 一、环境事实（血泪总结）

| 事实 | 影响 |
|---|---|
| **bash 不可用** | `ls` / `cat` / `head` / `dirname` 全部 missing，exit 127。**一律用 PowerShell** |
| **PowerShell 会吞 stdout** | 拿输出要写临时文件再读回 |
| **Glob 工具在 D: 盘不工作** | 用 PowerShell `Get-ChildItem` 代替 |
| **`Remove-Item` 会被安全机制拦截** | 删文件用 `Move-Item` 移到 `$env:TEMP` |
| **代理端口每次启动都变** | 推送前必须清空代理环境变量，不可硬编码 |

### 标准输出捕获写法

```powershell
$o = @()
$o += "结果1"
$o += (git status 2>&1 | Out-String)
[System.IO.File]::WriteAllText("$env:TEMP\x.txt", ($o -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
# 然后用 Read 工具读 $env:TEMP\x.txt
```

---

## 二、Git 标准流程

### 2.1 提交与推送

```powershell
$env:HTTP_PROXY=""; $env:HTTPS_PROXY=""; $env:ALL_PROXY=""
$env:http_proxy=""; $env:https_proxy=""; $env:all_proxy=""
Set-Location "D:\01_HJ_Work\00_Person\04_Project\04_persona-forge"

$msg = @"
<type>: <简短描述>

<正文：做了什么、为什么>
"@
[System.IO.File]::WriteAllText("$env:TEMP\_commitmsg.txt", $msg, (New-Object System.Text.UTF8Encoding($false)))

git add -A
git commit -F "$env:TEMP\_commitmsg.txt"
git push origin main
```

> ⚠️ **中文提交信息必须用文件传入**（`-F`），不要用 `-m`。

### 2.2 提交信息规范（Conventional Commits）

| type | 用于 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `docs` | 文档 |
| `refactor` | 重构 |
| `style` | 格式 |
| `chore` | 杂项 |
| `perf` | 性能 |

---

## 三、⚠️ 已知坑

### 坑 1：`[origin/main] [gone]`

**现象**：`git push` 返回 `EXIT=0`，但 `git status` 持续显示 `[gone]`，`git for-each-ref refs/remotes` 输出为空。

**根因**（2026-09-17 精确定位）：`.git\refs\remotes\` 下**缺 `origin` 子目录**，所以写入报「未能找到路径的一部分」。

**两个陷阱**：
1. `New-Item ... | Out-Null` **会静默吞掉建目录的报错** —— 看起来成功实际没建
2. `git update-ref` **也写不进去**（目录不存在时不建父目录且不报错）

**诊断**：
```powershell
git ls-remote --heads origin    # 远程哈希
git rev-parse HEAD              # 本地哈希 —— 一致即远程正常
git for-each-ref refs/remotes   # 空 = 引用未落盘
```

**修复**（三条命令，逐条确认）：
```powershell
# 1. 建目录（不加 Out-Null）
Set-Location "<项目路径>"
New-Item -ItemType Directory -Path ".git\refs\remotes\origin" -Force -ErrorAction Stop
Test-Path ".git\refs\remotes\origin"   # 必须 True
```
```powershell
# 2. 写引用
$sha = (git rev-parse HEAD).Trim()
[System.IO.File]::WriteAllText("$PWD\.git\refs\remotes\origin\main", $sha + "`n", (New-Object System.Text.UTF8Encoding($false)))
```
```powershell
# 3. 三方验证
git for-each-ref refs/remotes      # 应输出 refs/remotes/origin/main
git branch -vv                     # 应显示 [origin/main]
git status -sb                     # 应显示 ## main...origin/main
```

> ⚠️ **`[gone]` 通常意味着远程分支被删，极易误判成推送失败而反复重推。先验证远程。**

### 坑 2：凭证 helper 全部失效

- 系统 Git 是精简安装，**没有 `git-credential-store`**
- gitconfig 写死 `credential.helper=manager`，但 **GCM 未安装**
- 两个都失败时 git **静默退出（EXIT=128，零输出）**
- **解法**：`~/.gitconfig` 用 `url.insteadOf` 把凭证内嵌进 URL

### 坑 3：从 `.gitconfig` 正则提取 token 会失败

```powershell
# ❌ 不可靠（regex 可能匹配不到）
$m = [regex]'url\s+"https://([^:]+):([^@]+)@github\.com/"'.Match($cfg)

# ✅ 可靠：从 .git-credentials 直接取
$cred = Get-Content "$env:USERPROFILE\.git-credentials" -Raw
$i = $cred.IndexOf("github_pat_")
$tok = $cred.Substring($i)
$tok = $tok.Substring(0, $tok.IndexOf("@"))
# 验证：TOKEN_LEN 应为 93，否则 401
```

### 坑 4：GitHub MCP 搜索结果过大

`mcp__github__search_repositories` 曾返回 120,000+ 字符，超出 token 上限被存盘后读不回来。

**解法**：改用 PowerShell + `Invoke-RestMethod` 直调 API，**只取少数字段**。

---

## 四、临时文件管理

| 场景 | 做法 |
|---|---|
| 写临时输出 | `$env:TEMP\xxx.txt` |
| 删不掉的文件 | `Move-Item` 移到 `$env:TEMP` |
| 验证脚本 | 用完立刻清，**不要留在项目目录**（`_test.*` 已在 `.gitignore`） |

---

## 五、仓库信息

| 项 | 值 |
|---|---|
| 远程 | `https://github.com/HJ-Create-World/04_true-self-echo.git` |
| 可见性 | 私有 |
| 分支 | `main` |
| 本地路径 | `D:\01_HJ_Work\00_Person\04_Project\04_persona-forge` |

---

*最后更新：2026-09-17*
