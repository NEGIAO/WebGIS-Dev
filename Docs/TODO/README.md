# TODO 索引（方案与待办）

> **本文件是 `Docs/TODO/` 的唯一索引入口。** 接手时先读本页，再决定打开哪一篇。
> 建立于 V3.6.37（2026-11-01）。此前该目录无索引，23 个文件平铺、13 个无状态字段，无法判断哪些还活着。

---

## 一、状态机（唯一合法取值）

每个方案文件**必须**在文件头部写明 `> 状态：<取值>`。取值只能是下列六种之一：

| 状态 | 含义 | 处置 |
|---|---|---|
| 🟢 **活跃** | 正在推进的滚动项 | 留在本目录 |
| 🟡 **待批准** | 方案完成，等用户批准（L3 禁止未批施工） | 留在本目录 |
| 🔵 **实施中** | 部分已落地，剩余项待做 | 留在本目录，须注明已完成阶段 |
| ⏸ **搁置** | 主动暂停，须写明理由与重启条件 | 留在本目录 |
| ✅ **已完成** | 全部落地 | **迁 `archive/`** |
| ⚠️ **待人工确认** | 无法从代码或文档判定 | 留在本目录，标注待查点 |

**归档判据（三重，权重从高到低）**：

1. **代码存在性**（最高）—— 方案声称新增的文件 / 函数 / 配置 key 是否真在仓库中（`grep` 实测）
2. **显式状态行**（高）
3. **完成标记**（低，**仅作辅助**）

> ⚠️ **血泪教训**：`2026-10-31-turnstile-auth-hardening-plan.md` 有 4 处 `✅`，但 `grep -ril turnstile frontend/src backend` 返回 **0 个文件** —— 那些 `✅` 是**设计决策标记**（「选定」「排除游客」），不是完成标记。**禁止按 `✅` 数量机械归档。**

---

## 二、活跃方案（本目录）

| 文件 | 状态 | 一句话 | 已完成 / 待做 |
|---|:---:|---|---|
| `bugfix-optimization-plan.md` | 🟢 活跃 | **滚动修复主规划**（P0–P3 分级），所有「顺带发现」的登记处 | 136 项待办，持续勾选 |
| `account-panel-ui-optimization.md` | 🔵 实施中 | 账号面板 UI 优化 | 2 项已做 / 8 项待做 |
| `loading-performance-optimization-plan.md` | 🔵 实施中 | 登录页 / 首屏加载性能 | 1 项已做 / 4 项待做 |
| `plan-download-async-l2-ttl.md` | 🔵 实施中 | 下载服务异步化 + L2 缓存 TTL | 7 项已做 / 5 项待做 |
| `proxy-ssrf-hardening-plan.md` | 🔵 实施中 | 代理 SSRF 加固（S1–S4 分阶段） | S1+S2 已实施 V3.4.65；**S3 缓存治理 / S4 鉴权限流待评估** |
| `2026-08-20-planar-route-migration-proposal.md` | 🟡 待批准 | 平面路线迁移方案 | 3 项已做 / 6 项待做 |
| `2026-10-31-turnstile-auth-hardening-plan.md` | 🟡 待批准 | Turnstile 人机校验加固（`off/log/enforce` 三档） | **未实施**，代码 0 命中 |
| `cesium-toolpanel-migration-plan.md` | 🟡 待批准 | CesiumToolPanel 功能迁入统一 TOC | 未施工 |
| `plan-ovital-tdtkey-l2.md` | 🟡 待批准 | 奥维 tdtkey 密钥池化（L2） | 未施工 |
| `route-fly-module-plan.md` | 🟡 待批准 | 路线漫游 RouteFly（贴地线路 + 第一/三人称相机） | 未施工 |
| `tencent-building-import-plan.md` | 🟡 待批准 | 腾讯建筑白模抓取入库（**V3.6.37 自 Architecture 迁入**） | 未施工 |
| `2026-10-25-tileset-large-area-terrain-fit-plan.md` | 🟡 待确认 | 3D Tiles 大面积地形贴合优化（**V3.6.37 自 Architecture 迁入**） | 未施工 |
| `remote-service-sublayer-independent-layers-plan.md` | 🟡 待实施 | 在线服务子图层独立成层 + 统一排序 | 未施工 |
| `plan-download-feature-git-marker.md` | ⏸ 搁置 | 底图下载代码位置标记 | 搁置理由：HF 禁第三方瓦片中转 + VPS 内存风险 |
| `backend-reorg-plan.md` | ⚠️ 待人工确认 | 后端包结构重构 | 状态行称「已批准逐步执行」，但方案目标中的 `backend/utils/` **不存在**；实际结构为 `api/core/services/config/tests/scripts`。需确认是「已按变体落地」还是「未完成」 |
| `2026-10-17-landing-njnu-14-items-plan.md` | ⚠️ 待人工确认 | 南师大 14 条借鉴清单落地 LandingView | 无状态行；`LandingView.vue` 已 5379 行（基线 2930），疑似已实施但无日志佐证 |
| `OverPassApiIntegration/` | 🔵 调研 | OverPass API 集成调研目录 | 非方案文件，保留 |

---

## 三、归档方案（`archive/`）

以下方案经**代码存在性核验**确认已落地，或已明确作废。**仅迁移，未删改内容**，仍可检索。

| 文件 | 落地版本 | 核验依据 |
|---|---|---|
| `agent-override-key-leak-plan.md` | V3.4.63 | `backend/api/agent_chat/utils.py` 含 `_is_disallowed_override_host` / `_coerce_ip_literal` |
| `cesium-ground-placement-unification-plan.md` | V3.6.27（P0–P2） | `composables/terrain/groundPlacement{Capabilities,Registry,Service}.ts` 存在 |
| `engine-aware-map-operations-migration-plan.md` | V3.5.32（P0–P2） | `drawEntityFactory` / `cesiumLayerNodeBuilder` 含 category 路由 |
| `requestrendermode-plan.md` | V3.4.61 + V3.4.64 | `composables/interaction/useCesiumRenderMode.js` 存在 |
| `unified-layer-management-refactor-plan.md` | V3.5.31（P0–P2） | `domains/common/layer-tree/` 完整存在 |
| `configuration-architecture-plan.md` | V3.4.6–V3.4.13（全阶段） | 状态行「全部阶段已落地」+ `Architecture/configuration-three-tier.md` |
| `next-sprint-bugfix-and-optimization.md` | — | 自我声明「历史归档」，内容已并入 `bugfix-optimization-plan.md` |
| `next-session-prompt-rendering.md` | — | 接续提示词模板，引用 `Force_command v2` 与 `26-07-26` 旧路径，已被 `Guide/handover.md` 取代 |
| `2026-11-01-bot-pr-handling-guideline-plan.md` | V3.6.37 | 规范 §12 机器人 PR 处置指引，方案已全量落地 |
| `2026-11-01-docs-organization-governance-plan.md` | V3.6.37 | 文档治理（目录按生命周期分层 / TODO 索引 / Force_command 精炼），方案已全量落地 |

---

## 四、命名约定

本目录**历史上并存四套命名**，V3.6.37 起统一如下（**存量不改名**，避免打断 40+ 处跨文档引用）：

| 形态 | 适用 | 示例 |
|---|---|---|
| `YYYY-MM-DD-<topic>-plan.md` | **新建方案（推荐）** | `2026-11-01-docs-organization-governance-plan.md` |
| `YYYY-MM-DD-<topic>-proposal.md` | 早期提案（存量） | `2026-08-20-planar-route-migration-proposal.md` |
| `<topic>-plan.md` / `plan-<topic>.md` | 专题计划（存量） | `route-fly-module-plan.md` |
| `<topic>.md` | 无后缀（存量） | `backend-reorg-plan.md` 以外者 |

> **为何不统一改名**：这些文件被 `CHANGELOG.md`、`project-structure.md`、各期维护日志引用 40+ 处；改名会让历史引用全部失效，而历史日志按 `Force_command.md` §6 不可改写。**用索引解决「找不到」，不用改名解决「不整齐」。**

---

## 五、维护义务

1. **新增方案**：建文件 → 头部写 `> 状态：` → 在本索引第二节加一行。
2. **方案完成**：改状态为 ✅ → 迁 `archive/` → 索引移到第三节并补「核验依据」。
3. **方案废弃**：状态改 ⏸ 或直接迁 `archive/` 并注明理由，**不删除**（`Force_command.md` §2.4）。
4. **每次 L2/L3 收尾**：若本次触碰了某个方案，同步更新其状态与本表。

---

## 相关文档

| 文档 | 用途 |
|---|---|
| [`../Force_command.md`](../Force_command.md) | Agent 强制执行规范（边界 / SOP / DoD） |
| [`../Guide/handover.md`](../Guide/handover.md) | 接手导航 |
| [`../Guide/dev-conventions.md`](../Guide/dev-conventions.md) | 分层边界 / 技术约定 |
| [`../Guide/project-structure.md`](../Guide/project-structure.md) | 目录树唯一权威 |
