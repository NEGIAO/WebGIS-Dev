# 2026-08-27 — V3.5.33 全项目审查离散缺陷集中修复

> 本日志为 **V3.5.33** 版本记录：对 2026-08-27 四维全项目 Code Review（后端安全 / 前端质量 / 性能泄漏 / V3.5.30~32 回归风险）发现的全部离散缺陷集中修复，暂存区多会话产出归并为单一版本。

## 基本信息

- **日期和时间**：2026-08-27 19:20
- **日志作者**：AI Agent（Claude）
- **任务等级**：L2（审查 + Bug 修复 + 单源收敛 + 文档/版本号同步）
- **变更类型**：回归修复 + 安全加固 + 性能优化 + 死代码清理

## 问题分析（事件逻辑链条）

1. **核心症状**

   - V3.5.30~32 引擎感知迁移留下 4 处回归缺口（TOC 绘制页 3D 不路由 Cesium、viewer 重试重建后 TOC 僵尸档案、Action Router 异步 rejection 逃逸、AttributeTable/MapDownloader 静态打进首屏 chunk）；
   - useChatSession 对全部会话历史深度 watch，流式回复期间逐字触发深遍历 + 300ms 全量 JSON.stringify，长会话聊天卡顿；
   - 后端管理端数据浏览器可对 users/sessions/api_keys 等核心表任意增删改；location.py 导入 auth 私有符号；DEV_DEFAULT_ADMIN_PASSWORD 双处定义；
   - 约 2700 行零引用死代码；日期格式化六处重复实现、zoom=16 魔法数字四处双写、compat.js 内联 nadir 公式不复用单源。

2. **根本原因**

   - 引擎化迁移只覆盖 ControlsPanel 入口与部分生命周期边界；
   - 深度 watch 是多会话重构时为省事留下的兜底，未随流式打字机特性重新评估；
   - 管理端 CRUD 只做了标识符注入防护，未做表级白名单；
   - 工具函数无 SSOT 约束，各组件复制粘贴演化。

3. **受影响模块**

   图层树交互（TOC/HomeView）、Cesium 绘制/路线/风场/数据导入、Chat 会话持久化、admin 数据浏览器 API、location API、viewScale 兼容层、公共 utils。

## 修改内容

### 回归修复

1. HomeView `handleInteraction` 委托引擎感知的 `handleControlsMapInteraction`（TOC 绘制页 3D 正确路由 Cesium）；九个公交/驾车桥接统一 `callCesiumBridge()` helper——容器或方法未就绪显式 reject，消除 `resolve(undefined)` 被误判"绘制成功"。
2. `useCesiumDrawMeasure.reset()` / `useCesiumRouteRendering.reset()` 补逐条 `purgeRecord`：viewer 重试重建链路不再残留 TOC 僵尸档案。
3. `unifiedActionRouter.dispatchLayerAction` 检测 thenable 并 `.catch(warn)` 包装：异步 rejection 不逃逸也不再被记"已处理"。
4. `useChatSession` 移除 sessions 深度 watch → 11 个离散变更点显式 `schedulePersist()`；ChatPanelContent 在流结束边界（完成/出错/停止）通知持久化；onScopeDispose 时 pending 防抖先同步 flush 再清理（防关闭面板丢最近改动）。
5. MapContainer 的 AttributeTable、TOCPanel 的 MapDownloader 改 `defineAsyncComponent` 异步加载，移出首屏 chunk。

### 安全加固

6. ~~admin 数据浏览器核心表写保护~~ **【已按用户裁决移除，不入库】**：审查阶段曾实现 `PROTECTED_WRITE_TABLES` + `_ensure_table_writable()` 守卫三个写入助手；用户随后裁决「admin 身份就是最高权限，允许对任意表增删改」，相关代码（30 行）已从工作区全部移除，最终提交不含此项。管理端维持既有行为：仅做标识符注入防护，无表级白名单。
7. location.py 私有符号导入消除：公开鉴权依赖 `resolve_optional_session()` 落位 auth/dependencies.py 并经包门面导出，location.py 删除本地重复实现改用之。
8. `DEV_DEFAULT_ADMIN_PASSWORD` 单源 config/catalog.py，auth/constants.py 本地副本移除（保留指引注释）。

### 性能与正确性

9. `loadedDataSources` / `wind2D` 改 shallowRef（写入点均为整组替换或引用比较，已核实）；消除 Cesium 原生句柄 Vue 深代理双身份。
10. CesiumAdvancedEffects preRender uniform 变更检测门控（fog/HBAO/tiltShift/atmosphere 各自缓存上次值，阈差写入门控；stage 实例在单次挂载周期内恒定，缓存生命周期与之对齐）。
11. finishInteraction 成品落盘 try/catch：失败回滚半成品实体入场景；detachEntityFromScene 地形分支补 viewer.scene + EllipsoidTerrainProvider 构造器守卫；clearAllDataSources 回退分支补 warn 日志。
12. 文件夹清空 toast 文案改为进行时语义「已开始清空 {n} 个图层」（zh/en locale 同步）。

### 单源收敛

13. 新增 `common/utils/datetime.js`（parseDateValue/formatDateTime/formatTimeShort/formatDateEpoch）；ChatMessageList、ApiKeysManagementPanel、ApiManagementPanel、PersistentAnnouncementBar、OverviewTab、wmsService 六处改为薄包装并保留各自空值/非法回退语义。
14. 新增 `common/utils/mapDefaults.js`（DEFAULT_SEARCH_ZOOM/MAX_SEARCH_ZOOM）；GISCommander.searchAndZoom、useMapState.locateAddress、chatIntentFallback、agentToolsSchema 四处 zoom=16 魔法数字统一接入。
15. compat.js nadir 公式委托 cesiumScale.js 单源（olZoomToCesiumHeight / cesiumHeightToOlZoom 内部走 canonical 链路）。

### 死代码清理（均先 grep 验证零引用）

16. 删除 GeoWTFS.js(1053)、universalAmapParser.js(298)、MapEasterEgg.vue(285)、vectorWorkerUtils.js(128)、interactionHandlers.js(31)、useDataManager.js(341)、routeService.js(3)、loadTiandituSdk.js(95)、frontend/.tmp-test/*.mjs ×4。

## 修改原因

多批次快速迭代后，离散缺陷分散在回归、安全、性能、维护性四个维度；集中审查后一次归并修复，避免碎片化小提交。结构性重构项（大文件拆分、API /api/v1 全量前缀迁移、TS strict、SQLite 连接池、statistics.py 拆分、全局限流中间件）范围大需单独排期，明确不在本版内。

## 影响范围

- 前端：TOC 绘制入口、3D 桥接、绘制/路线生命周期、Chat 持久化、首屏 chunk 组成、公共工具层；
- 后端：admin 数据浏览器写入路径、location 鉴权依赖、auth 包门面导出、常量来源；
- 文档：README 三处版本号、CHANGELOG、frontend-structure.md 结构树。

## 解决方案

方案对比要点：
- Chat 持久化候选：watch 缩窄到长度/id vs 手动调度 —— 选手动 schedulePersist（深数组内对象变更无法被浅 watch 捕获，且逐字更新本就不应落盘）；防抖窗口丢失风险以 dispose flush 收口。
- admin 写保护候选：只读白名单 vs 写黑名单 —— 曾选写黑名单实施；**用户最终裁决：admin 即最高权限，任意表可增删改，整个写保护逻辑移除不采纳**（裁决记录于本日志，后续审查不再重复报告此条）。
- shallowRef 替代 ref：前提是所有写入为整组替换，逐一核实七个 loader 与 filter/sync 路径及唯一 watch（deep:false 引用比较）后才动手。
- 门控缓存生命周期风险：核实 cleanupEffects 仅在 onUnmounted 触发、stage 实例单周期恒定后确认安全，无需额外失效钩子。

## 性能指标

未实测量化数据；定性收益：流式长会话期间每字符 O(会话树) 深遍历 + 全量序列化 → 0 次（仅边界持久化）；AttributeTable(~2500 行含虚拟表格) 与 MapDownloader 移出首屏 chunk（构建产物按路由懒分片）；requestRenderMode 下相机静止时 preRender 不再反复写 uniform 打断脏检查。构建产物体积见构建日志（chunkSizeWarning 为既有状态，非本版引入）。

## 测试方案

**Agent 已执行**：

- `npm run build` 生产构建通过（28.8s，无编译错误）；
- 改动文件 ESLint 全部通过（12 个前端文件零告警）；
- 后端改动文件 `ast.parse` 语法校验通过；跨模块 grep 确认无残留 `_extract_token/_get_session_sync/DEV_DEFAULT_ADMIN_PASSWORD/require_api_access_optional` 私有引用；
- 8 个删除文件逐一 grep 零引用验证后再删；
- 结构树/配置登记门禁脚本通过（结果见下）。

**待用户实机验证**（npm run dev / python main.py）：

1. OL 与 3D 模式下 TOC 绘制页画点/线/面/测距/测面（3D 应在 Cesium 场景出图；ZoomToGraphics 类型应有降级提示）；
2. 触发一次 Cesium viewer 重试重建（或卸载重进 3D）→ TOC「三维数据」分组无僵尸条目；
3. Chat 发起一次流式回复 → 流畅无卡顿；完成后刷新页面消息仍在；停止生成 → 最后一条保留；关闭面板立即重开 → 最新消息不丢；
4. ~~管理端数据浏览器对 users 表增/改/删应返回 403~~ **【已随写保护移除而取消】**；回归确认：管理端数据浏览器对任意表（含 users）的常规增删改不受影响即可。
5. 关于页版本号显示 3.5.33（dev 重启后生效）；
6. 公告栏时间、API Keys 面板时间、用户概览注册时间等格式化展示正常。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/admin.py` | ~~写保护守卫~~ 实施后经用户裁决移除，最终版恢复原样（无净变更） |
| `backend/api/auth/dependencies.py` | 新增公开依赖 resolve_optional_session |
| `backend/api/auth/__init__.py` | 导出 resolve_optional_session |
| `backend/api/auth/constants.py` | 删除 DEV_DEFAULT_ADMIN_PASSWORD 本地副本 |
| `backend/api/location.py` | 改用公开依赖，删除本地 require_api_access_optional |
| `frontend/src/app/HomeView.vue` | handleInteraction 引擎感知委托 + callCesiumBridge 统一桥接 |
| `frontend/src/domains/common/layer-tree/actions/unifiedActionRouter.js` | thenable catch 包装 |
| `frontend/src/domains/common/layer-tree/components/TOCPanel.vue` | MapDownloader defineAsyncComponent |
| `frontend/src/domains/ol/components/MapContainer.vue` | AttributeTable defineAsyncComponent |
| `frontend/src/domains/common/chat/composables/useChatSession.js` | 去 deep watch；schedulePersist 显式化；dispose flush |
| `frontend/src/domains/common/chat/components/ChatPanelContent.vue` | 流结束边界通知持久化 |
| `frontend/src/domains/common/chat/components/ChatMessageList.vue` | formatTime 接入 datetime 单源 |
| `frontend/src/domains/cesium/composables/draw/useCesiumDrawMeasure.js` | reset purgeRecord；finishInteraction 回滚 |
| `frontend/src/domains/cesium/composables/draw/useCesiumRouteRendering.js` | reset purgeRecord |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataImport.js` | loadedDataSources shallowRef；回退分支 warn |
| `frontend/src/domains/cesium/composables/dataImport/loaders/utils.js` | 地形分支构造器守卫 |
| `frontend/src/domains/cesium/modules/wind/useCesiumWind.js` | wind2D shallowRef |
| `frontend/src/domains/cesium/components/CesiumAdvancedEffects.vue` | preRender uniform 门控 |
| `frontend/src/domains/cesium/components/CesiumToolPanel.vue` | 场景菜单 timer 泄漏收口（onBeforeUnmount） |
| `frontend/src/domains/common/utils/datetime.js` | 新增：日期格式化单源 |
| `frontend/src/domains/common/utils/mapDefaults.js` | 新增：搜索 zoom 默认值单源 |
| `frontend/src/domains/common/utils/viewScale/compat.js` | nadir 公式委托 cesiumScale |
| `frontend/src/domains/common/user/components/ApiKeysManagementPanel.vue` | formatTime 薄包装 |
| `frontend/src/domains/common/user/components/ApiManagementPanel.vue` | 同上（固定 zh-CN 保持原行为） |
| `frontend/src/domains/common/user/components/tabs/OverviewTab.vue` | formatDateTime 薄包装 |
| `frontend/src/domains/common/shell/PersistentAnnouncementBar.vue` | formatTimeLabel 薄包装 |
| `frontend/src/domains/common/basemap/wmsService.js` | formatDateEpoch 导入单源 |
| `frontend/src/domains/common/command-bus/GISCommander.js` | DEFAULT/MAX_SEARCH_ZOOM 接入 |
| `frontend/src/domains/ol/composables/useMapState.js` | locateAddress 默认值接入 |
| `frontend/src/domains/common/chat/composables/chatIntentFallback.js` | 意图兜底 zoom 接入 |
| `frontend/src/domains/common/chat/constants/agentToolsSchema.js` | Schema default 接入 |
| `frontend/src/locales/zh-CN.js` / `en-US.js` | folderCleared 进行时文案 |
| 删除 ×8 + .tmp-test ×4 | 见修改内容 #16 |

## 遗留与风险

1. **结构性重构 deferred**（需单独评估排期，建议记入 TODO 台账）：HomeView(2466)/CesiumToolPanel(2724)/AttributeTable(2500)/RegisterView(2654)/TOCPanel(2328) 大文件拆分；API `/api/v1` 前缀全量迁移（约 50 个老端点无版本段）；TS strict 渐进开启；SQLite 连接池（H3，单实例部署下现状可接受）；statistics.py(1503 行)拆分；全局 HTTP 限流中间件。
2. 使用深链接分享或清理 localStorage 前后，Chat 持久化时机从"每次输入防抖后"变为"离散变更点 + 300ms 防抖"，理论上极端高频点击会话切换可能有最多 300ms 窗口的最后切换态延迟落盘（dispose flush 已收口面板关闭路径）。
3. `POST /api/log-visit` 曾被标记"无独立限流"，核实为误报：走 require_api_access_or_guest 按 IP+UA+设备桶消耗每日配额（游客 100/日，超限 429），无需加码。
4. 前轮遗留（v3532 日志 #1）：`Docs/LLM_record/2026-08-27/` 两份缺月份层级目录的历史日志仍待 git mv 纠正。

关联：V3.5.32 日志 [2026-08-27-v3532-staged-consolidation-review-fix.md](./2026-08-27-v3532-staged-consolidation-review-fix.md)
