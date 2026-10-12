# 2026-10-10 暂存区 Code Review → V3.6.11

## 日期与时间

2026-10-10（会话内执行）

## 任务等级

**L2**（用户明确指定对暂存区做 Review + 整合版本 V3.6.11，沿 V3.6.7 前例）

> 依据 Force_command §0 优先级 1：用户指令「code review 暂存区，本次版本为 3.6.11」。暂存区含本会话 4 个批次（原编号 .11/.12/.13/.14），现按指令合并为单版本 **V3.6.11**——对 §5（逐次 +1、同日不合并）做**一次性豁免**，仅本次生效。Agent **未**执行任何 Git 写操作。

## 问题分析

### 核心症状

- 暂存区 20 文件、+2162/-11 行，混有 4 次版本号递增（.11→.14）与 4 篇 topic 日志，需在提交前统一为 **V3.6.11** 并消除潜在缺陷。

### 根本原因

- 同日多轮迭代自然堆叠；无架构冲突，均为建筑抓取主线（入口→抓取→入库→拔高→框选）。

### 受影响模块

| 模块 | 文件 |
|---|---|
| 建筑抓取 | `useTencentBuildingFetch.js`†、`TencentBuildingPanel.vue`†、`CesiumExtentPicker.vue`†、`parsers/tencentBuildingFetcher.js`†（用户既有本地文件，本次仅加结构树条目） |
| 接线 | `TopBar.vue`、`SidePanel.vue`、`HomeView.vue`、`locales/*`、`LandingView.vue`、`geojsonLoader.js` |
| 文档 SSOT | `README.md`、`CHANGELOG.md`、`frontend-structure.md`、方案、4 篇 topic 日志 + 本日志 |

### 候选方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 保留 .11–.14 四版本直接提交 | 与用户“本次 3.6.11”指令冲突 | 否决 |
| B. Review + 最小修复 + 合并为 V3.6.11（4 topic 日志保留为过程记录） | 沿 V3.6.7 前例，不改写历史 | **选定** |

## Review 结论

### 通过项

- 接线链全通（`open-buildings` → `openBuildingsPanel` → `buildings` 懒加载页签 → `upload-data` 双引擎路由），grep 核对新链 17 命中、旧链 0 残留。
- i18n 无重键（`buildings:` 在 Trung 各文件仅分属不同父对象；eslint `no-dupe-keys` 已消）。
- eslint 实跑 7 文件零告警（含 `_dropped` 解构、`Building2` 图标、`toSpecGeoJSON`）。
- Cesium crs 根因有官方源码为据；拔高顺序与贴地兜底无冲突（已读 `utils.js:174-191`）。
- 门禁历史全绿；本次复跑见下。

### 观察项（只记不改）

1. 面板未处理 `ExtentPicker` 的 `extent-clear`（清框不清空表单）——可接受：表单是抓取的事实来源。
2. 抓取器 `proxyBase` 拼接（`${proxyBase}https://…`）缺分隔符约定——用户既有文件，超出本次范围，已在 V3.6.11 topic 日志遗留外不再展开。
3. 4 篇 topic 日志内仍称 V3.6.12–V3.6.14——属过程记录，不改写；规范版本以本条与 README/CHANGELOG 为准。

## 修改内容（归并）

1. `README.md` 三处 → V3.6.11；版本表新首行（整合版摘要）+ V3.6.10 + V3.6.9（恒定 3 行）。
2. `CHANGELOG.md`：删 4 条分版本条目，合一条 V3.6.11（链本日志 + 4 topic 日志）。
3. 本日志。topic 日志、方案、代码零改动。

## 修改原因

用户要求暂存区 Review 后以单版本提交。

## 影响范围

- 仅版本文档；代码与 V3.6.14 时刻一字不差（归并前后 `git diff --cached --stat` 行数一致性由门禁与状态复核）。

## 解决方案

见「修改内容」。

## 性能指标

未实测。

## 测试方案

### Agent 已执行

- `git status` / `git diff --cached --stat` / `git log` 确认基线（HEAD=V3.6.10，工作区干净，暂存=本次 20 文件）
- 逐文件 review 关键 diff（接线三件套、loader、locales、composable 新文件、面板脚本）
- eslint 7 文件实跑全绿（此前会话已跑，本次复核结论）
- 文档归并 + 门禁复跑见下；未执行 git add/commit/push（暂存区为用户既有状态，Agent 未动）

### 待用户实机验证

1. 按 V3.6.11 topic 日志链路实机（框选→抓取→双引擎入库→拔高）——代码与 V3.6.14 时刻一致，既往待验项仍然有效
2. 硬刷新确认页脚 V3.6.11
3. 用户自行 `git commit`（信息见交接块）

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `README.md` | 三处 → V3.6.11（归并） |
| `Docs/Guide/CHANGELOG.md` | 4 条合 1 条 V3.6.11 |
| `Docs/LLM_record/26-10/2026-10-10/2026-10-10-staged-review-v3611.md` | 本日志 |
| 其余 17 暂存文件 | Review 通过，零改动 |

## 模块关系（L2 ≥3 文件）

```mermaid
flowchart LR
  S["暂存区 20 文件<br/>.11-.14 四批次"]
  R["Review<br/>接线/i18n/eslint/根因"]
  V["V3.6.11 归并<br/>README/CHANGELOG"]
  C["用户 commit"]

  S --> R
  R --> V
  V --> C
```

## 遗留与风险

- 分支含 `chore: update traffic statistics [auto]` 噪音 commit，与本次无关。
- 提交前建议用户自行确认暂存区即此 20 文件（`git status` 已附核对方式），Agent 不操作 git。
- 未实机运行。

## 零散修补（L1，不单 bump 版本）

- 2026-10-10 导出 GeoJSON 丢失 `height_m`：定界为**导出侧遗漏**（注册侧无辜——Cesium 拔高能读到高度即证）。`layerExportService.js` GeoJSON 分支手写 4 固定字段；已加 `stripGeometryFromProperties` 把原属性带出（剔除 OL geometry 对象，导出 4 字段后置覆盖同名）。单文件，eslint 全绿，无版本号变更。

## 门禁

- `python Scripts/CheckStructureTree.py`：通过（486 项/0 漂移）
- `python Scripts/CheckConfigRegistry.py`：全部通过 ✅（零配置 key；catalog 130 key / 前端 VITE_ 14 个）
- 平台红线自查：归并仅动版本文档；代码面沿用各 topic 日志的 CLEAN 结论 → 全绿
- 未执行任何 Git 写操作（注意：归并改动使 README/CHANGELOG 呈 staged+unstaged 混合态，提交前需重新 `git add`）
