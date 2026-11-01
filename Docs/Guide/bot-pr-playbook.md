# 依赖机器人 PR 操作手册（gh CLI 速查）

> **定位**：`Docs/Force_command.md` §12 的操作层补充。规范只规定「能做什么、不能做什么」，本文件给出「具体敲哪条命令、报错怎么读」。
> **权威边界**：权限、准入条件、授权流程以 [`Force_command.md` §12](../Force_command.md) 为准；本文与之冲突时以规范为准。
> **适用**：Dependabot（`author.login = app/dependabot`）。人类 PR 不适用。

---

## 前置检查

```bash
gh --version          # 需 ≥ 2.95
gh auth status        # 需已登录且含 repo scope
```

若报 `HTTP 401/403`：提示用户自行执行 `gh auth login`，**Agent 不代登录**（交互式命令，且涉及凭据）。

---

## 五步只读核查

顺序固定，禁止跳步。每一步都是只读，**无需授权**。

### 1. 列清单

```bash
gh pr list --author "app/dependabot" --state open --limit 20 \
  --json number,title,headRefName,createdAt,isDraft
```

`--author "app/dependabot"` 是机器人的正确写法（`dependabot` 不加前缀会返回空）。限定作者可避免与人类 PR 混淆——人类 PR 不在 §12 授权范围内。

### 2. 判定可合并性

```bash
gh pr view <n> --json number,title,mergeable,mergeStateStatus,changedFiles,additions,deletions
```

读 `mergeable` 与 `mergeStateStatus` 两个字段：

| 取值 | 含义 | 可否继续 |
|---|---|:---:|
| `MERGEABLE` + `CLEAN` | 无冲突、无缺失要求 | ✅ |
| `MERGEABLE` + `BEHIND` | 落后 base 分支 | ❌ 让用户在网页点 Update branch |
| `MERGEABLE` + `BLOCKED` | 分支保护未满足 | ❌ 列出缺失项 |
| `CONFLICTING` | 有冲突 | ❌ 转人工 |

### 3. 看检查

```bash
gh pr checks <n> --required          # 只看必需项
gh pr checks <n> --watch --fail-fast # 需等待时，首个失败即退出
```

`--required` 过滤掉非必需的第三方检查（如 Vercel 预览评论）。若返回 `no checks reported`，说明 workflow 未对该 PR 触发——**不得视为通过**，须报告用户。

### 4. 看变更范围

```bash
gh pr diff <n> --name-only
```

**这是最关键的一步。** 判定标准：输出是否只含锁文件 / 依赖清单（`package-lock.json`、`uv.lock`、`package.json`、`pyproject.toml`、`requirements*.txt`）。出现任何业务代码即转人工。

### 5. 看具体差异

```bash
gh pr diff <n> --patch | head -80
```

锁文件 diff 可能上千行，先看头部统计再决定是否全读。重点看两处：

- `uv.lock` 的 `revision = N` 是否变动（见下节）
- `package-lock.json` 的 `lockfileVersion` 是否变动

---

## 锁文件专用判读

### `uv.lock` 的 `revision` 漂移

`revision = 3` → `revision = 5` 这类变动**不是单纯的版本号替换**，而是生成它的 uv 版本不同导致的整份重解析：marker 条件会被重写（例如 `click-plugins` 的 `click` 依赖 marker 被删除）、依赖树可能微调。表现为 diff 远超版本号本身。

**处置**：
- **禁止**在本地跑 `uv lock` 重生成（会用你的 uv 版本再改一次，制造二次冲突）
- 直接接受机器人产物，或整体暂缓
- 长期方案：固定团队 uv 版本，避免反复漂移

### 只改锁文件、未改清单文件

说明是**传递依赖**升级，运行时行为变化面小。但仍须 `--required` 检查全绿兜底。

---

## 授权与合并

授权形式：用户在当前会话说出「合并 #45」类指令。**含糊表述（「把 PR 处理一下」）不构成授权**，须回问具体编号。

执行前复述一句：「即将 squash 合并 #<n>（<依赖> <旧版本> → <新版本>），并删除远端分支」。

```bash
gh pr merge <n> --squash --delete-branch
```

**`--delete-branch` 不可省略**：本仓库 `deleteBranchOnMerge=false`（实测），不带该旗标会残留 `dependabot/*` 远端分支。

执行后回报三件事：合并 commit SHA、远端分支是否已删除、**提示用户本地 `main` 已落后需自行 `git pull`**（Agent 不得代拉）。

失败即停：非零退出时原样转述错误，**不重试、不改用 `--admin`、不换合并方式绕过**。

---

## 常见故障对照

| 现象 | 成因 | 处置 |
|---|---|---|
| `no checks reported` | workflow 未对该 PR 触发（如 paths 过滤） | 报告用户，**不得视为通过** |
| `mergeStateStatus=BLOCKED` | 分支保护要求审查或必需检查未过 | 暂缓，列出缺失项 |
| `mergeStateStatus=BEHIND` | 落后 base 分支 | 提示用户在网页点「Update branch」，Agent 不代操作 |
| `uv.lock` diff 巨大且含 marker 变动 | uv 版本漂移重解析 | 见「锁文件专用判读」 |
| `gh` 报 `HTTP 401/403` | token 失效或缺 scope | 提示用户 `gh auth login`，Agent 不代登录 |
| 合并后远端分支仍在 | 未带 `--delete-branch` | 报告用户，由用户决定是否手动删分支 |

---

## 禁止命令速查

以下命令**任何情况下都不得执行**（即便用户口头要求，也须先说明风险再二次确认）：

```bash
gh pr merge --auto          # 开启自动合并
gh pr merge --admin         # 绕过分支保护
gh pr checkout <n>          # 切换本地工作区分支（属 §2.1「改分支」）
gh pr review <n> --approve  # 自评审
gh pr close <n>             # 关闭 PR
gh pr comment <n> --body    # 评论
gh pr edit <n>              # 编辑
gh api -X POST|PATCH|DELETE # 任何写方法
```

> `gh pr checkout` 之所以禁止，是因为它切换本地工作区分支，直接落在 §2.1「改分支」的禁止范围内。需要本地复验时，改由用户自行执行，Agent 只读远端状态。
