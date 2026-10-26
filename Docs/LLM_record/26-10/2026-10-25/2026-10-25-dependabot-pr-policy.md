# 2026-10-25 Dependabot 策略确认：只收 major 大版本更新 + 机器人不合并 main 核查

- **日期与时间**：2026-10-25 20:38–20:47
- **任务等级**：L2（单文件 `.github/dependabot.yml` 策略确认/修复 + 仓库配置核查，无业务代码改动）

---

## 问题分析（核心症状 → 根本原因 → 受影响模块）

### 核心症状
用户抱怨「机器人每天发消息干扰」，明确诉求：**只接收 major 大版本依赖更新 PR，minor/patch 一律不发**；且机器人的 branch 不得被合并进 main。

### 时间线证据（gh CLI + git log）
| 时间（北京时间） | 事件 |
|---|---|
| 12:21 | V3.6.25 首次创建 `.github/dependabot.yml`，当时采用 **groups 归组**方案（minor/patch 归 1 个 PR、安全更新归 1 个 PR） |
| 12:26–12:27 | 安全 PR **#42（frontend-security）/ #43（backend-security）仍被创建**——安全更新不受 weekly schedule 约束，GitHub 收录 advisory 即出 PR，归组压不住「每天冒 PR」 |
| 12:32 | #42/#43 被手动关闭（噪音） |
| 14:27 | V3.6.26 改为 **ignore minor/patch，只跟 major**（正确的最终方案） |

### 根本原因
1. **PR 噪音双源**：① minor/patch 版本更新（weekly 但量大）；② 安全更新（**不受 schedule 约束**，advisory 一到就出 PR）。V3.6.25 的 groups 方案只压缩了单次批量，压不住安全更新的每日触发。
2. **正确解法 = ignore 一刀切**：`ignore` 的 `version-update:semver-minor/patch` 对 version-updates 与 security-updates **同时生效**（GitHub 官方行为），因此 minor/patch 版本更新与 minor/patch 级安全补丁一律不再出 PR，只剩 rare 的 major 更新按周出一个 PR。V3.6.26 已采用该方案。
3. 本会话中途曾误判用户意图、误删 ignore 改用 groups，已在用户纠正后恢复（见「修改内容」）。

### 「机器人合并进 main」核查（gh CLI，2026-10-25）
| 核查项 | 命令 | 结果 |
|---|---|---|
| 仓库级 auto-merge | `gh api repos/NEGIAO/WebGIS-Dev --jq .allow_auto_merge` | `false` ✅ |
| 规则集 | `gh api repos/NEGIAO/WebGIS-Dev/rulesets` | `[]` ✅ |
| 分支保护 | `gh api repos/NEGIAO/WebGIS-Dev/branches/main/protection` | 无 required checks、无 lock ✅ |
| auto-merge workflow | `.github/workflows/` 仅 codeql / pre-check / traffic-counter / deploy 四个 | 均无自动合并逻辑 ✅ |
| 历史 PR 合并者 | `gh api repos/NEGIAO/WebGIS-Dev/issues/{33,34,35}/timeline` | actor 均为 `NEGIAO`（人工点击）✅ |
| 安全更新开关 | `gh api repos/NEGIAO/WebGIS-Dev/automated-security-fixes` | `{enabled:true, paused:false}`（保持开启） |

> 结论：仓库层面不存在任何自动合并机制，Dependabot 只开 PR、只写自己的 `dependabot/*` 分支，**合不合并完全由人工决定**。
> ⚠️ 唯一无法经 API 核查/关闭的：「Copilot cloud agent」——**更正（2026-10-26 复核）**：本仓库 `.github/workflows/` 实际只有 `codeql / deploy / pre-check / traffic-counter` 四个文件，**不存在**名为 Copilot 的 workflow；该项属 GitHub **账号级**能力（在 Settings → Copilot 下），原文「workflow 处于 active 状态」的表述不准确，特此更正。GitHub Copilot coding agent 若被配置为自动合并 Dependabot PR，合并动作发生在用户账号名下（actor 仍显示 NEGIAO）。该设置无公开 API，需网页关闭：`Settings → Copilot → Coding agent → 关闭 auto-merge`。

### 受影响模块
- `.github/dependabot.yml`（本文件）
- GitHub 仓库级设置（本次只核查不改动）
- 无前后端业务代码影响

---

## 修改内容

1. **恢复并保留两处 `ignore` 块**（npm / uv 各一）：
   - `dependency-name: "*"` + `update-types: [version-update:semver-minor, version-update:semver-patch]`
   - 效果：minor/patch 版本更新与 minor/patch 安全补丁一律不出 PR，**只有 major 更新按周出 PR**。
2. **头部注释补充「不合并、不推 main」核查证据**（allow_auto_merge=false、无 rulesets、无 auto-merge workflow、历史合并均为人工）与 Copilot coding agent 的关闭指引。
3. 保留：weekly 周一 09:00/09:30 Asia/Shanghai、`open-pull-requests-limit: 3`、labels、`chore(deps)` 提交前缀。
4. 撤销本会话中途的误改（曾误删 ignore 改用 groups，已回退）。

## 修改原因

用户明确「只接收大版本依赖更新，不然每天都给我发消息」。V3.6.26 的 ignore 策略正是为此设计，本任务确认其正确性、补齐核查证据，并把「机器人不合并进 main」的保证写进配置。

## 影响范围

- GitHub 依赖更新流水线（Dependabot）：minor/patch 更新全部静默，仅 major 出 PR；合并动作仍 100% 由人工决定。
- 不改动任何业务系统（鉴权 / 底图链路 / 数据库 / 图层管理均无涉）。

## 解决方案（对比与选型）

| 方案 | 描述 | 评估 |
|---|---|---|
| A. groups 归组（V3.6.25 实装过） | minor/patch 归 1 PR、安全归 1 PR | ⚠️ 安全更新不受 schedule 约束，advisory 一到仍出 PR（当日 #42/#43 即实证），噪音未根治 |
| B. **ignore 一刀切（选定，V3.6.26 已实装）** | minor/patch（含安全补丁）一律静默，只出 major PR | ✅ PR 噪音根治；代价：minor/patch 安全补丁 PR 被静默，需定期人工复查 security/dependabot 页（用户已接受该取舍） |
| C. 直接关闭 automated-security-fixes | 连安全补丁 PR 通道一起掐断 | 备选：若实机观察发现 ignore 未覆盖某些安全 PR，再升级到此方案 |

选定 **B**，理由：用户拍板「只接收大版本依赖更新」；major 更新 rare，按周检查足够。

## 性能指标

不适用（CI 配置变更，无运行时性能影响）。

## 测试方案

**Agent 已执行**
- `python Scripts/CheckStructureTree.py` ✅（512/512）
- `python Scripts/CheckConfigRegistry.py` ✅（B1–B4 / F1–F3 全通过）
- 平台红线 §11.2 四条 rg 自查 ✅ 全绿
- YAML 语法与 Dependabot schema 人工复核（`ignore.dependency-name` / `update-types` 均为合法键）
- 以上均为静态验证；Dependabot 解析配置发生在 GitHub 侧，本地无法端到端模拟。

**待用户实机验证**
1. push 本改动后，下周一 09:00 Asia/Shanghai 的 weekly 调度：预期只有 major 更新出 PR（当前依赖 major 无更新则无 PR）；
2. 下一个 advisory 到来时：预期**不再**创建安全 PR（ignore 同时生效）；若仍冒出安全 PR，说明 ignore 未覆盖该场景，升级到方案 C（关闭 automated-security-fixes）；
3. Dependabot job 状态可查：`Insights → Dependency graph → Dependabot`。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `.github/dependabot.yml` | 恢复 ignore（只跟 major）+ 头部注释补核查证据与 Copilot 指引 |
| `Docs/LLM_record/26-10/2026-10-25/2026-10-25-dependabot-pr-policy.md` | 本日志 |
| `README.md` | 版本号三处同步 V3.6.28 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.6.28 条目 |

## 门禁结果

- `CheckStructureTree.py`：✅ 512/512，漏登记 0，幽灵条目 0
- `CheckConfigRegistry.py`：✅ 全通过
- 平台红线 §11.2：✅ 全绿

## 遗留与风险

1. **Copilot coding agent 的 auto-merge 开关**无法经 API 读取/关闭，如曾开启需网页手动关闭——「机器人代点合并」唯一可能的现实入口。
2. **残留 dependabot 远程分支已清理（2026-10-25 20:51，用户明确指示后执行）**：
   删除 6 条（均无 open PR 引用，属关闭/合并 PR 后的残留）：
   `dependabot/npm_and_yarn/frontend/{eslint/js-10.0.1, frontend-minor-patch-03f89f0b06, pinia-4.1.0, rollup-plugin-visualizer-7.1.1, vue-router-5.4.0}`、`dependabot/uv/backend/backend-minor-patch-2128f7b09f`。
   执行方式：`gh api -X DELETE repos/NEGIAO/WebGIS-Dev/git/refs/heads/<urlencoded>`，逐条返回成功；
   复核：远程 dependabot 分支计数 0，`git fetch --prune` 后本地跟踪引用同步清除。
   现远程仅余 `main`、`archive/v2.8.8-snapshot`、`archive/v3.5.0-snapshot`、`tiles-full-v3.6.18`。
3. minor/patch 安全补丁 PR 被静默的取舍已确认接受；人工复查入口：`https://github.com/NEGIAO/WebGIS-Dev/security/dependabot`。
4. 版本号顺延：V3.6.27 已被同日 ships66 任务占用，本任务按规范顺延取 **V3.6.28**。
5. 本地工作树有未提交改动 `backend/uv.lock`、`frontend/package-lock.json`（非本次任务产物，未触碰）；本地 `main` 落后 `origin/main` 2 个提交（#44 README 补丁合并），push 前需先 pull。
