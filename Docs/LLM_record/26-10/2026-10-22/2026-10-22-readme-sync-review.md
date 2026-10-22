# 2026-10-22 README 全量核对与事实修正

- **日期与时间**：2026-10-22 09:30
- **任务等级**：L2（纯文档任务，但涉及 README 多节改动 + 版本号三处 + CHANGELOG）

## 问题分析

- **核心症状**：README 数月未系统性核对，期间合入大量小功能（历史影像、人物漫游、新闻热榜、实时统计等），表述与代码现状漂移。
- **根本原因**：README 属人工维护文档，无自动校验；本次大改版（同日早些时候的 README 重写）还引入一处回归——「项目简介」行丢失 `当前版本 V3.x.x` 标识。
- **受影响模块**：`README.md`（版本号 SSOT、核心能力表、文档导航、已知限制）、`Docs/Guide/CHANGELOG.md`、本日志。
- **关键机制**：`frontend/vite.config.js:129` 用正则 `/当前版本[^\d]*(\d+\.\d+\.\d+)/` 从 README 提取 `__APP_VERSION__`，匹配不到时**静默回退 `V0.0.0`**（不报错）。格式丢失 → 前端版本展示失真，属隐性破坏。

## 修改内容（逐条，均经代码实测）

1. 恢复「项目简介」行 `（当前版本 V3.6.23）` 标识（vite 机器读取源，格式不得改动）。
2. 底图源：`96 个图层定义` → `106 个图层定义`（`basemapConfig.ts` L199–1806 实测 106 个唯一 id；90 个预设经 `basemapPresets.ts` L23–332 复核无误）。
3. 账号体系：补 Hugging Face OAuth（`backend/api/auth/constants.py` `SUPPORTED_OAUTH_PROVIDERS = {google, github, huggingface}`；`RegisterView.vue` 三个 OAuth 按钮；`SecurityTab.vue` 绑定链）。
4. 侧栏标签页：修正为实际 8 个——`新闻热榜（info 默认页）/ 工具箱 / 驾车规划 / 公交规划 / 风水罗盘 / 建筑抓取 / 天气 / AI 助手`（SidePanel.vue 模板实测：`info` 页签内容即新闻仪表盘，原列表把「信息」与「新闻热榜」并列为两项）。
5. 本地开发镜像：Docker Hub API 实测两个标签——`V3.5`（2026-08-03 推送）与 `latest`（2026-08-23 推送），原文只提 V3.5；保留「与源码存在代差」警告并同步版本号。
6. 已知限制「单元测试 ❌ 尚未引入」更正：`backend/tests/` 已有 6 个 unittest 文件（test_agent_map_context / test_config_env_loading / test_historical_imagery / test_realtime_stats / test_sqlite_recovery / test_webhook_helpers），前端仍无单测。
7. 规模速览：i18n 命名空间 27 → 30（zh-CN.js 顶层块实测）；Docs 篇目 548 → 549（含本日志）。
8. 版本演进表：新增 V3.6.23 行、移除 V3.6.20 行（恒定 3 行）；保留 SidePanel 调试提交（`6bf80e5`）未发版的提示。

## 复核确认无误的表述（抽查留痕）

- 空间分析「8 算子」：`operations/` 9 文件，overlay 承载交/并/差三集合运算，`models.py` 对外 10 类型 = 8 算子口径成立。
- 前端 511 源文件 / 184,599 行（≈18.5 万）、70 个 Vue SFC；后端 70 个 .py / 21,505 行（≈2.15 万）；后端 15 组路由（app.py include_router 计数）。
- 新闻热榜 22 平台（cls 上游恒定 504，「其余 21 个正常」成立）；9 类绘制工具（drawingToolRegistry 实测：点/线/面/矩形/椭圆/圆/箭头/风向/军标 + 选择编辑）。
- 三维分析双实现（heightLimitAnalysis.js / visibilityAnalysis.js）；后处理 HBAO/移轴（CesiumAdvancedEffects.vue）。
- 技术栈徽章与 `package.json` / `pyproject.toml` / `Dockerfile` 一致（Vue 3.5、Vite 6.2、OL 10.5、Cesium 1.132、Rapier 0.14、FastAPI ≥0.100、Python 3.12、Node 20+）。
- AI 三种接入模式成立（useChatAgentConfig.js 三个存储键：defaultAI / personal / proxy）。

## 修改原因

README 是项目门面与版本号 SSOT；表述失真会误导接手者，且本轮大改引入的版本标识回归会直接导致构建期版本号静默回退。

## 影响范围

纯文档：README.md、CHANGELOG.md、本日志。零代码改动。版本号 V3.6.22 → V3.6.23（文档级 +1）。

## 解决方案

逐节核对 README 每个可验证断言 → 对代码/配置/API 实测 → 只改不符项，已准确项不动。版本号三处同步（简介行 / 版本演进首行 / 页脚），CHANGELOG 顶部追加。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 全部修正项均对照源码/命令输出核验（见上） | `cd frontend && npm run dev`，确认页面底部/关于处版本号显示 V3.6.23（验证「当前版本」行恢复后 `__APP_VERSION__` 提取恢复） |
| `python Scripts/CheckStructureTree.py` 通过 | 浏览 README 各内部锚点链接跳转正常 |
| `python Scripts/CheckConfigRegistry.py` 通过 | GitHub 渲染下 Mermaid 图与表格显示正常 |

## 变更文件清单

- `README.md` — 上述 8 项修正 + 版本号三处
- `Docs/Guide/CHANGELOG.md` — 顶部追加 V3.6.23 条目
- `Docs/LLM_record/26-10/2026-10-22/2026-10-22-readme-sync-review.md` — 本日志

## 遗留与风险

- 提交 `6bf80e5`（"debug"，SidePanel.vue +213/-39）为未记版本的代码改动，无日志无版本号，违反 §5/§6 流程——已在 README 版本演进末尾标注，建议用户补记或归入下一版本。
- `Docs/Architecture/spatial-analysis-backend.md` 正文仍写「8 种分析操作」，与 README 口径一致（8 算子）但与 `models.py` 的 10 类型存在口径差；如需统一，建议在该文补一句「overlay 承载交/并/差，对外 10 类型」。本次未改（避免越权扩大范围）。
- `frontend/package.json` 的 `version: 2.0.0` 依旧未维护（README 已知限制表已声明）。
