# 2026-07-26 会话交接文档（OAuth 配置 → 属性表 → 架构治理）

> 面向：下一个开发会话（人类或 AI Agent）。本文档汇总当日本会话完成的全部工作、
> 当前系统状态、必读契约与坑、以及按优先级排序的待办。逐项细节见文末日志索引。
> **⚠️ 已合并（2026-07-26 V3.4.46）**：本文 §三 契约已并入 `Docs/Guide/handover.md` §7，
> §四 待办已并入 `Docs/TODO/bugfix-optimization-plan.md`（唯一滚动规划）。本文仅作当日历史快照保留，
> **新会话请以上述两文件为准**。

---

## 一、当日完成（本会话负责的版本条目）

| 版本 | 主题 | 核心产出 |
|------|------|----------|
| V3.4.6(部分) | OAuth 回调推导修复与验证 | redirect_uri 由 BACKEND_PUBLIC_URL 推导（不再必配）；6 场景 12 断言验证；`Docs/Guide/oauth-deployment.md` HF 生产配置手册 |
| V3.4.11 | 本地 admin 登录回归修复 | APP_ENV 注入链路（compose `../.env` 挂载 + `backend/.env` 桥接 + LocalDev 自动生成根 .env） |
| V3.4.18 | 属性表稳定性 | syncLayers 内容签名增量同步、滚动保持、视图筛选 3857/4326 归一、幽灵数据集清理、排序/搜索接线 |
| V3.4.20 | 属性表交互二轮 | hover rAF 去重零闪烁、Ctrl/Shift 多选透传、双击缩放、列宽拖拽、搜索防抖 |
| V3.4.22 | 修订号契约 + CSV | 注册表单点 revision（features 引用比较）→ attrStore 免构建快路径；`utils/attributeTableCsv.ts` 导出 |
| V3.4.23 | 表头对齐根治 | 全列确定性像素宽（双 grid fr 解算不一致的结构性修复）、斑马纹 data-index 化 |
| V3.4.29 | 容器瘦身一轮+二轮首簇 | MapContainer 2222→~2040、CesiumContainer 1053→915；新模块 4 个（token 池/分享解析/数据操作转发/启动视图解析） |
| V3.4.31 | 架构快赢 | barrel 注册规范成文、`CheckStructureTree.py` 门禁（382⇄382 零漂移）、api 收敛标注、**barrel 链两层化**、LocalDev 门禁接入 |

另：暂存区 code review（发现 `.env` 误跟踪、版本文档不一致）、`.git/index.lock` 死锁清理指引。

## 二、当前系统状态（关键事实）

- **配置**：三层模型全落地（L1 根 .env / L2 Admin+DB / L3 HF Secrets）；本地 OAuth 仅需 `GITHUB_OAUTH_CLIENT_ID/SECRET`（回调自动推导 `http://localhost:7860/api/auth/oauth/github/callback`，控制台须逐字符一致）；本地 admin=123456 依赖 development 判定，环境变量改动**必须重建容器**（热重载只更新代码）。
- **barrel 链**：已两层化——`composables/map/index.js` 直连 `features/index.js`，**新增 feature 模块只登记 features/index.js 一处**；领域 barrel（basemapSystem 等）仅存量直接导入方使用。规范见 `features/README.md`。
- **属性表数据链**：图层 → 注册表 revision（features 数组**整体重赋值**触发递增）→ attrStore 快路径跳过构建 → 签名兜底。⚠️ 不变式：任何内容级变更必须重新赋值 `item.features` 数组，就地改属性会静默失效（注册表注释有说明）。
- **门禁**：`CheckConfigRegistry.py`（配置登记）+ `CheckStructureTree.py`（结构树，`--quiet` 可用，概括目录豁免见脚本头）已挂 LocalDev.bat advisory 运行。
- **验证基线**：全部涉改文件 ESLint 零告警；后端配置层多轮场景断言通过；**尚未做整体运行时冒烟**。

## 三、必读契约与坑（新会话开工前）

1. **并行会话**：本仓库常有多个 AI 会话同时工作，版本号会撞（当日撞过 3 次）——写版本记录前先 `grep 当前版本 README.md`，撞号则顺延并调整排序；文件可能在你读写之间被改，Edit 失败就重读再改。
2. **挂载环境限制**：Cowork 挂载盘**禁止 rm/mv**（.git 目录完全只读）——删除/改名类重构需用户本机执行，或"新建文件 + 标注 DEPRECATED + 给用户 git 命令"模式（api/backend.js 即此状态，待 `git rm frontend/src/api/backend.js`）。
3. **git 操作**：Agent 严禁 commit/stash/push（Force_command 第 3 条）；超时被杀的 git 命令可能残留 `.git/index.lock`，需用户手动删。
4. **容器抽离模式**：factory 注入依赖；晚声明依赖用 getter 延迟解析；工厂参数在调用点求值——**逐一核对 TDZ**（函数声明提升可依赖，const 不行）。
5. **ESM `export *` 重名静默丢弃**：同源绑定不歧义（re-export 自同一模块安全）；改 barrel 前先做导出名核验（V3.4.31 日志有现成 node 校验脚本可抄）。
6. **Force_command**：每任务必须日志 + README 版本三处 + CHANGELOG + 文件树同步；README 版本表只留最新 3 条（移出的须确认已在 CHANGELOG）。

## 四、待办（按优先级）

**P0 · 用户侧动作（开工第一件事）**
- [ ] 整体冒烟：2D 底图/token 切换、分享链接（s=1 与旧版 from=share）、admin/123456 登录、3D 数据导入全套、属性表全功能（筛选/排序/搜索/多选/双击缩放/列宽/CSV）、绘制与几何编辑
- [ ] `git rm frontend/src/api/backend.js`（零改动兼容已验证）
- [ ] 确认 `docker compose` ≥ v2.24 无关紧要（现方案已版本无关），旧容器执行过一次重建

**P1 · 容器二轮剩余簇（V3.4.29 日志有路线图，模式照抄一轮）**
- [ ] MapContainer：`runDeferredStartupTasks`（~170 行，最大目标）、`activateInteraction`（~121）、`syncAttributeTableMapExtent` 段、尾部 `getMapExtent` 簇
- [ ] CesiumContainer：`bootCesium/initViewer/reset` 启动簇（~244）、`applyAtmosphereParams` 簇（~165）、`handleNavTargetSelect`（~84）
- 目标：MapContainer ~1200 行、CesiumContainer ~500 行

**P2 · 架构 T2（需本机移动文件）**
- [ ] `utils/` 21 文件分域、`composables/map/features/` 42 文件分子目录（门禁可即时验证）
- [ ] 两处 `dataImport/` 目录消歧（2D 与 Cesium 同名）

**P3 · 架构 T3**
- [ ] Cesium 库级代码（Cloud/lib、内嵌 npm 包、terrain providers）迁 `src/lib/`
- [ ] TS 化推进（js:ts=257:85，从 stores/utils 纯逻辑层起）+ vue-tsc 门禁
- [ ] 属性表遗留小项：签名不含 geometry（几何编辑后 extent 可能滞后于视图筛选，低危已知）

## 五、当日日志索引（Docs/LLM_record/26-07-26/）

- `2026-07-26-oauth-config-derivation-fix-and-verify.md` — OAuth 推导修复+验证
- `2026-07-26-fix-local-admin-login-app-env.md` — admin 登录回归（env 注入链路）
- `2026-07-26-attribute-table-stability-and-features.md` — 属性表稳定性（V3.4.18）
- `2026-07-26-attribute-table-interaction-round2.md` — 交互二轮（V3.4.20）
- `2026-07-26-attribute-table-revision-contract-and-csv.md` — 修订号契约+CSV（V3.4.22）
- `2026-07-26-attribute-table-column-alignment-fix.md` — 对齐根治（V3.4.23）
- `2026-07-26-container-components-slimming-round1.md` — 容器瘦身（含二轮首簇补记与路线图）
- `2026-07-26-frontend-architecture-quickwins.md` — 架构快赢（含漂移清零、两层化补记）
- 指南：`Docs/Guide/oauth-deployment.md`（HF 生产 OAuth 手册）

---

*交接原则：先跑 P0 冒烟固化成果，再按 P1→P3 推进；每步遵守第三节契约。*
