# 新增规范 §12：线上机器人 PR 处置指引（本地 GitHub CLI）

- **日期与时间**：2026-11-01 12:20
- **任务等级**：L3（依据 `Force_command.md` §10——修改本规范文件本身属 L3，须先批准方案再施工）
- **方案文档**：[`Docs/TODO/2026-11-01-bot-pr-handling-guideline-plan.md`](../../TODO/2026-11-01-bot-pr-handling-guideline-plan.md)（已获用户批准）
- **目标版本**：V3.6.37

---

## 1. 问题分析

### 1.1 核心症状

`Force_command.md` 全文未规定 Agent 如何处置依赖机器人开出的 PR，导致三个具体缺口：

| # | 缺口 | 表现 |
|:---:|---|---|
| 1 | 权限灰区 | §2.1 第 1 条禁止清单是**枚举式**的（`commit` / `push` / `stash` / `reset` / `checkout --` / `rebase` / 改分支），**未列 PR 合并**。`gh pr merge` 会写远端 `main`，按字面不违规、按精神违规 |
| 2 | 判定标准缺失 | 无客观准入条件，「什么算可以合」只能凭临场判断，major 破坏性升级可能被当补丁合并 |
| 3 | 版本/日志归属不明 | 为一次依赖合并升版本号会污染版本历史语义（版本号应对应「本项目做了什么」）；不升又怕违反 §5 |

### 1.2 根本原因

规范撰写时的语境是「Agent 产出代码 → 用户提交」，未预见「机器人产出 PR → 谁来合并」这条独立链路。§2.1 用穷举法表达禁止边界，对**新出现的写操作通道**天然存在遗漏。

### 1.3 受影响模块

- 主：`Docs/Force_command.md`（§1 分级、§2.1 硬边界、新增 §12）
- 从：`Docs/Guide/dev-conventions.md`（强制规范摘要，§10 要求同步）
- 从：根 `README.md`（§5 三处版本号）、`Docs/Guide/CHANGELOG.md`

---

## 2. 修改内容

| # | 文件 | 位置 | 内容 |
|:---:|---|---|---|
| 1 | `Docs/Force_command.md` | 新增 §12（置于 §11 之后、结尾引言之前） | 「线上机器人 PR 处置（GitHub CLI）」全节，含 12.1 事实基线 / 12.2 权限三分 / 12.3 五步只读核查 / 12.4 合并准入六条件 / 12.5 授权与执行 / 12.6 版本号与日志归属 / 12.7 本节禁止事项 / 12.8 常见故障对照 |
| 2 | `Docs/Force_command.md` | §2.1 第 1 条末尾 | 追加「PR 合并同样属禁止范围（含 `gh pr merge` 与网页端合并）；唯一例外是 §12.5 的 Dependabot PR 逐次显式授权」 |
| 3 | `Docs/Force_command.md` | §1 分级表下方 | 追加「机器人 PR 例外」注记：查看与合并不计入 L0–L3 代码任务；仅「改代码适配」环节按 L2 计级 |
| 4 | `Docs/Guide/dev-conventions.md` | 「强制规范（摘要）」第 14 条 | 新增摘要条目，指向 §12 |
| 5 | 根 `README.md` | 三处 | 项目简介行 `V3.6.36 → V3.6.37`；版本演进表首行新增 V3.6.37、删除最旧 V3.6.35（恒 3 行）；页脚 `V3.6.37 · 2026-11-01` |
| 6 | `Docs/Guide/CHANGELOG.md` | 顶部 | 追加 V3.6.37 完整条目 |
| 7 | `Docs/TODO/bugfix-optimization-plan.md` | 追加条目 | 记录 README 版本号历史缺口（见 §7.1） |
| 8 | `Docs/TODO/2026-11-01-bot-pr-handling-guideline-plan.md` | 新建 | L3 方案文档（施工前产出） |
| 9 | 本文件 | 新建 | 任务日志 |

### 2.1 §12 的规则设计（核心）

**权限三分**：

| 档位 | 动作 | 授权 |
|:---:|---|---|
| ✅ 只读·随时可做 | `pr list` / `pr view` / `pr checks` / `pr diff` / `gh repo view` / `gh api` GET | 无需 |
| ⚠️ 逐次显式授权 | `gh pr merge <n> --squash --delete-branch` | 须用户说出「合并 #n」；不跨会话、不跨 PR 继承 |
| ⛔ 一律禁止 | `--auto` / `--admin` / `pr checkout` / `pr review` / `pr close` / `pr comment` / `pr edit` / `gh api` 写方法 | 无出口 |

**合并准入六条件**：① `MERGEABLE` + `CLEAN`；② required checks 全绿；③ diff 仅含锁文件/依赖清单；④ 版本跨越已判定；⑤ 不触部署面（`deploy/.env.example`、`catalog.py`、`.github/workflows/`）；⑥ 已获授权。

---

## 3. 修改原因

1. **消除权限灰区**：把「PR 合并」显式纳入 §2.1 禁止范围，同时给出唯一且受控的例外出口，避免 Agent 各自解释。
2. **判定可执行化**：六条件均为可机器判定的客观指标（`mergeable` / `mergeStateStatus` / checks 状态 / `--name-only` 输出），不依赖主观判断。
3. **保护版本历史语义**：明确依赖合并不升版本，避免版本号序列被机器人 PR 稀释；同时为「确实需要改代码适配」保留 L2 出口，不留死角。
4. **补齐原规范未覆盖的缝隙**：`gh pr checkout` 会切换本地工作区分支，属 §2.1「改分支」，但原禁止清单未提及 `gh` 系列命令。

---

## 4. 影响范围

| 模块 | 影响 |
|---|---|
| Agent 行为边界 | 新增一类受控写操作通道（仅 Dependabot PR 合并），其余写操作限制不变 |
| 版本号语义 | 依赖合并不再消耗版本号，版本序列更纯粹 |
| 文档一致性 | `dev-conventions.md` 摘要新增第 14 条，与权威版保持同步（§10 义务） |
| 前端构建 | `vite.config.js` 正则从 README「项目简介」行提取版本，本次已同步该行，`__APP_VERSION__` 下次 build / dev 重启即为 3.6.37 |
| 部署面 | 无影响，未触及 `deploy/`、`backend/`、`.github/workflows/` |
| 代码 | 零代码改动，纯规范与文档 |

---

## 5. 解决方案

### 5.1 方案对比

| 方案 | 做法 | 结论 |
|---|---|---|
| A | 仅在 §2 后追加 3–5 行 `gh pr list` 用法 | 否决：未解决权限灰区，无判定标准 |
| B | 新增独立 §12 + §2.1 交叉引用 + §1 注记 + 摘要同步 | **选定** |
| C | 把规则塞进 §2.1 第 1 条的例外括注 | 否决：破坏 §2.1「一句话一条禁令」体例，且 §12 类操作内容无处安放 |

### 5.2 选型理由

§12 独立成节可容纳完整流程（权限矩阵 / 核查步骤 / 准入条件 / 故障对照），且与 §11 同为「特定场景的专门规则」，体例一致。§2.1 只保留一句交叉引用，维持硬边界清单的可扫读性。

### 5.3 实施步骤

1. 核查事实基线（`gh` 版本与认证、机器人身份、仓库合并策略、命令旗标可用性）
2. 产出 L3 方案文档 → 用户批准
3. 改 `Force_command.md` 三处
4. 同步 `dev-conventions.md` 摘要
5. 更新 `README.md` 三处 + `CHANGELOG.md`
6. 写本日志 + TODO 记录
7. 跑门禁脚本

---

## 6. 性能指标

不适用（纯文档任务）。**未实测**。

---

## 7. 测试方案

### 7.1 Agent 已执行

| 项 | 命令 / 方式 | 结果 |
|---|---|---|
| `gh` 版本与认证 | `gh --version`、`gh auth status` | ✅ 2.95.0，账号 NEGIAO，scopes 含 `repo` |
| 机器人过滤语法 | `gh pr list --author "app/dependabot" --state open --json number,title` | ✅ 返回 #45 / #46 |
| PR 详情字段 | `gh pr view 45 --json mergeable,mergeStateStatus,statusCheckRollup` | ✅ 字段有效，返回 `CLEAN` / `MERGEABLE` |
| 检查命令旗标 | `gh pr checks --help` | ✅ `--required` / `--watch` / `--fail-fast` 均存在 |
| 合并命令旗标 | `gh pr merge --help` | ✅ `--squash` / `--delete-branch` 存在 |
| 仓库合并策略 | `gh repo view --json squashMergeAllowed,deleteBranchOnMerge` | ✅ `squash=true`、**`deleteBranchOnMerge=false`** |
| README 三处一致性 | `grep -n "当前版本 V3\|<sub>V3"` | ✅ 均为 V3.6.37 |
| README 版本表行数 | `grep -c "^| \*\*V3\.6\."` | ✅ 3 行（3.6.37 / 3.6.36 / 3.6.35） |
| 结构树门禁 | `python Scripts/CheckStructureTree.py` | 见 §7.3 执行结果 |
| 配置登记门禁 | `python Scripts/CheckConfigRegistry.py` | 见 §7.3 执行结果 |

> 本次**未**执行 `gh pr merge`（未获授权），故「合并链路」本身未经实机验证。

### 7.2 待用户实机验证

1. **文档可读性**：打开 `Docs/Force_command.md`，确认 §12 位于 §11 之后、结尾引言之前；§12.2 表格在 GitHub 渲染正常（含 `POST\|PATCH\|DELETE` 的转义竖线）。
2. **锚点有效性**：§1 注记中 `[§12](#12-线上机器人-pr-处置本地-github-cli)` 与 §2.1 中 `[§12.5](#125-授权与执行)` 两处内链在 GitHub 上可跳转。
3. **摘要同步**：`Docs/Guide/dev-conventions.md` 第 14 条与 §12 表述一致，无冲突。
4. **版本号生效**：重启 `npm run dev` 或重新 build，确认页面展示版本为 `V3.6.37`（`vite.config.js` 从 README 正则提取）。
5. **提交**：由你执行 `git add` / `commit` / `push`（Agent 未做任何 Git 写操作）。

### 7.3 门禁执行结果

- `python Scripts/CheckStructureTree.py` → **通过**（exit 0）：`[结构树门禁] 文档条目 522 · 磁盘文件 522 · 漏登记 0 · 幽灵条目 0`。同步动作：`Docs/Guide/project-structure.md` 的 `26-11/` 月份摘要行补记本次日志。
- `python Scripts/CheckConfigRegistry.py` → **通过**（exit 0）：B1–B4 / F1–F3 共 7 项全绿，统计 `catalog 130 key · 前端使用 VITE_ 15 个`；本次未新增任何配置 key。

> 结构树粒度说明：`LLM_record/` 按月份目录登记（括号内摘要当月日志），`Docs/TODO/` 仅列非日期命名的方案文件（既有 `2026-08-20` / `2026-10-17` / `2026-10-31` 三个日期命名方案均未列入）。本次新增的日期命名方案与日志遵循既有粒度，不单独列入明细。

### 7.4 平台红线自查（§11.2）

| # | 检查项 | 结果 |
|:---:|---|---|
| 1 | `playwright\|patchright\|selenium\|puppeteer\|2captcha\|stealth\|xvfb\|x11vnc\|tigervnc\|novnc` @ `backend/` `deploy/` `frontend/src/` | ✅ 无真实命中。`backend/` 零命中；`frontend/src/` 命中 7 个文件，逐一核对均为 `maxRayDistance`（体积云 raymarch 参数）被 `xray` 子串匹配的**假阳性**；`Docs/` 内命中为 §11.2 规则文本自身 |
| 2 | `xray\|v2ray\|wireproxy\|hysteria\|shadowsocks\|cloudflared\|ngrok\|socat\|openvpn\|wireguard\|hermes\|autogpt` @ `backend/` | ✅ `backend/` 零命中 |
| 3 | `telegram\|telebot\|autossh\|UptimeRobot\|keepalive\.py\|start_keepalive` @ `backend/` `deploy/` `frontend/src/` `.github/` | ✅ 零命中 |
| 4 | `ALLOW_PRIVATE_HOSTS=true\|ALLOWED_HOSTS=*\|RATE_LIMIT=0` @ `deploy/.env` | ✅ `REDLINE-4-CLEAN`，生产基线未被破坏 |

> 本次改动仅涉及 `Docs/*.md` 与根 `README.md`，未触 `backend/`、`deploy/`、`frontend/src/`、`.github/workflows/`，红线自查属预防性执行。

---

## 8. 变更文件清单

| 仓库相对路径 | 说明 |
|---|---|
| `Docs/Force_command.md` | 新增 §12（8 小节）；§2.1 第 1 条补 PR 合并交叉引用；§1 补机器人 PR 分级注记 |
| `Docs/Guide/dev-conventions.md` | 「强制规范（摘要）」新增第 14 条 |
| `README.md` | 版本号三处同步至 V3.6.37；版本演进表首行新增、删最旧，恒 3 行 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.6.37 条目 |
| `Docs/Guide/project-structure.md` | `26-11/` 月份摘要行补记本次日志 |
| `Docs/TODO/2026-11-01-bot-pr-handling-guideline-plan.md` | 新建：L3 方案文档 |
| `Docs/TODO/bugfix-optimization-plan.md` | 追加：README 版本号历史缺口记录 |
| `Docs/LLM_record/26-11/2026-11-01/2026-11-01-bot-pr-handling-guideline.md` | 新建：本日志 |

---

## 9. 遗留与风险

### 9.1 已知缺口（已记入 TODO）

**README 版本号历史缺口**：V3.6.37 发布时，上一会话只更新了「版本演进」表与 `CHANGELOG.md`，**未同步**「项目简介」行与页脚（§5 要求三处同步），导致长期处于 3.6.36 / 3.6.37 并存状态。

- 本次处置：按用户裁定不做专项返工，仅记入 `Docs/TODO/bugfix-optimization-plan.md`。
- 附带效果：§5 强制本次三处同步至 V3.6.37，缺口已**被动闭合**，但历史成因留档备查。
- 风险提示：缺口存续期间，`vite.config.js` 注入的 `__APP_VERSION__` 一直读到 3.6.36，与实际发布版本不符。

### 9.2 未验证项

| 项 | 状态 |
|---|---|
| `gh pr merge` 实际执行效果 | ⚠️ 未验证（本次未获授权，未执行） |
| §12 内链锚点在 GitHub 的渲染 | ⚠️ 未验证（需推送后在网页确认） |
| 依赖机器人 PR 的实际合并耗时 | 不适用 |

### 9.3 风险

1. **双份摘要漂移**：`dev-conventions.md` 第 14 条是 §12 的摘要，后续若单独修改 §12 而未同步摘要，将产生漂移。§10 已规定同步义务，但仍依赖执行。
2. **Dependabot 安全更新不受 schedule 约束**：PR 可能在任意时间新增，`open-pull-requests-limit` 为 3，积压时新 PR 会被抑制，需定期查看 `security/dependabot` 页面。
3. **`uv.lock` revision 漂移**：若本地 uv 版本与 Dependabot 生成锁文件的版本不一致，未来任何 `uv lock` 都会再次改写 `revision` 与 marker，造成反复 diff。建议固定团队 uv 版本。
4. **当前 2 个待处理 PR 未动**：#45（follow-redirects 1.16.1→1.16.2，仅 `package-lock.json`，4 检查全绿）、#46（certifi 2026.4.22→2026.10.18，`uv.lock` revision 3→5 且 marker 变动，7 检查全绿）。二者均满足 §12.4 条件 1–5，**待用户授权后即可按 §12.5 合并**。
