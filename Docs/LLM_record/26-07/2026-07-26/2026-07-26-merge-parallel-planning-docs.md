# 并行会话规划/交接文档合流（V3.4.46）

- **日期与时间**：2026-07-26 20:57
- **任务等级**：L2（多文件文档整编 + 文件删除）

## 问题分析

- **核心症状**：仓库同时存在两套「交接 + 修复规划」文档——A 套（`Docs/LLM_record/26-07-26/2026-07-26-session-handover.md` + `Docs/TODO/next-sprint-bugfix-and-optimization.md`，OAuth/属性表/架构治理线产出）与 B 套（`Docs/Guide/handover.md` + `Docs/TODO/bugfix-optimization-plan.md`，V3.4.37/V3.4.39 正式落档）。两套 TODO 均为滚动修复规划、语义同位；两套交接均含"契约与坑"，互有独有内容。新会话喂错任一套都会丢信息或跟进过期状态（如 A 套 B2/B5/B6 已在 V3.4.40 完成、B 套 P0-2/P0-3/P1-3 已在 V3.4.43 完成，互不知晓）。
- **根本原因**：多 AI 会话并行开发，各自会话末独立产出交接/规划文档，未经合流，违反 Force_command §4 SSOT 原则（接手导航唯一权威 = `Guide/handover.md`；越权范围记录处 = `Docs/TODO/bugfix-optimization-plan.md`）。
- **受影响模块**：仅 Docs（导航/规划文档），零代码改动。

## 修改内容

1. `Docs/TODO/bugfix-optimization-plan.md`（存续正典）并入 next-sprint 全部独有内容：
   - 新增 **P0-4 属性表 Bug 簇（B1–B6）**：保留原编号以衔接既有日志引用；B2/B5/B6 标注 ✅V3.4.40（日志 `2026-07-26-phase1-quickfix-b2-b5-b6.md`），B1/B3/B4 待办；附验收口径与 **V3.5.0 里程碑**约定。
   - **P3-1** 补容器二轮既有路线图（V3.4.29 日志坐标 + MapContainer/CesiumContainer 各簇行数与目标）。
   - 新增 **P3-3**（T2 分域，需本机 mv）、**P3-4**（门禁进 CI）、**P3-5**（Cesium 库级代码迁移）、**P3-6**（TS 化）、**P2-4**（属性表性能：searchText 惰性化/列宽持久化/CSV 范围选项/列虚拟化）。
   - 文头加合并说明；执行顺序标注已完成项并补「冒烟回归自动升最高优先级」条款。
2. `Docs/Guide/handover.md` §7 并入 A 套 6 条独有契约：挂载盘禁 rm/mv 与 `.git` 只读、index.lock 处置、沙盒 ESLint 跑法（`node node_modules/eslint/bin/eslint.js`）；barrel 两层化单点登记 + `export *` 重名静默丢弃与核验脚本坐标；属性表 revision 整体重赋值不变式；容器 factory 抽离 TDZ 核对模式；版本撞号 grep 复核。基线版本行更新 V3.4.36→V3.4.46。
3. `2026-07-26-session-handover.md` 文头加「已合并」横幅（§三→handover §7，§四→bugfix-optimization-plan），转为当日历史快照。
4. 删除 `next-sprint-bugfix-and-optimization.md`、`next-session-prompt.md`（后者自声明"用完可删"）——挂载盘禁 rm，由用户执行 `git rm`。

## 修改原因

消除双套并存导致的信息分裂与状态漂移；恢复 SSOT：唯一接手导航 + 唯一滚动规划。

## 影响范围

文档导航层（Docs/TODO、Docs/Guide、LLM_record 横幅）。不涉及任何运行时代码。

## 解决方案

- **方案对比**：a) 反向合并（以 next-sprint 为存续）——否：bugfix-optimization-plan 是 Force_command §2.5 点名文件、V3.4.39 已正式落档且并行会话正按其执行（V3.4.43 勾选三项）；b) 两套都保留加互链——否：滚动文档双头维护必然再漂移；c) **选定**：B 套为存续正典、A 套独有内容全量并入后删除 A 套。
- **session-handover.md 特殊处置**：属 LLM_record 历史日志（被 `2026-07-26-handover-ui-ux-workstream.md` 等交叉引用），删除会断链且违背日志不可变惯例 → 保留 + 文头横幅声明已合并。
- 编号策略：B1–B6 原编号并入（既有日志已引用），容器项沿用 P3-1 扩展而非新开，避免引用漂移。

## 性能指标

不适用（纯文档任务）。

## 测试方案

- **Agent 已执行**：合并前全量比对四份文档逐节覆盖清单（B1–B6 状态与 CHANGELOG V3.4.40 交叉核实、P0-2/P0-3/P1-3 与 V3.4.43 核实）；被删两文件的全库引用扫描（仅历史日志与自引用，无活文档断链）；`CheckStructureTree.py` 于本批次任务收尾统一运行（结果见交接块）。
- **待用户实机验证**：执行 `git rm Docs/TODO/next-sprint-bugfix-and-optimization.md` 与 `git rm Docs/TODO/next-session-prompt.md`；抽查合并后 `bugfix-optimization-plan.md` P0-4/P3 各项与原文无信息丢失。

## 变更文件清单

- `Docs/TODO/bugfix-optimization-plan.md` — 并入 P0-4/P2-4/P3-3~P3-6、P3-1 路线图、文头合并说明、执行顺序更新
- `Docs/Guide/handover.md` — §7 补 6 条契约；基线版本行更新
- `Docs/LLM_record/26-07-26/2026-07-26-session-handover.md` — 文头「已合并」横幅
- `Docs/TODO/next-sprint-bugfix-and-optimization.md` — 删除（待用户 git rm）
- `Docs/TODO/next-session-prompt.md` — 删除（待用户 git rm）
- `README.md` — 版本三处 V3.4.46
- `Docs/Guide/CHANGELOG.md` — V3.4.46 条目
- `Docs/LLM_record/26-07/2026-07-26/2026-07-26-merge-parallel-planning-docs.md` — 本日志

## 遗留与风险

- 两文件物理删除依赖用户执行 git rm；执行前 TODO 目录短暂存在已合并的旧文件（文件本身未再被任何活文档引用，风险低）。
- 顺带发现（未处置，仅登记）：`project-structure.md` 将 `Docs/TODO/OverPassApiIntegration` 标为目录，实为无扩展名文件——既有漂移，非本任务范围。
- `Docs/LLM_record/26-07-26/2026-07-26-next-bugfix-optimization-plan.md`（UI/UX 线规划）仍在被并行会话作为勾选台账使用（V3.4.41/45 更新过），**未**并入本次合流——它是会话内执行台账而非仓库级滚动规划，且正被活跃写入，合并会与并行会话冲突。待其执行完毕后可评估并入 bugfix-optimization-plan.md。
