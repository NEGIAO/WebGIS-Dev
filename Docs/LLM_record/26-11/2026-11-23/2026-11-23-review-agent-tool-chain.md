# Agent 工具链全量 Code Review：17 个工具的可执行性审查（L2）

## 日期与时间

2026-11-23 20:50

## 任务等级

**L2（常规）** —— 审查 + 4 处修复，无架构变更。

## 审查范围与方法

不靠阅读印象，分四层取证：

| 层 | 方法 | 覆盖 |
|---|---|---|
| **结构层** | 脚本交叉比对 7 个文件的符号集合 | schema 17 / registry 17 / 门面 19 方法 / 白名单 12 条 / OL 11 handler / Cesium 10 handler / 注入 sink 10+9 / 容器 85 public 方法 |
| **类型层** | `vue-tsc --noEmit` | 全量 |
| **路由层** | 编译真实 `MapCommandBus` 为 CJS，用 mock adapter 跑 29 项断言 | 命令路由、引擎能力拦截、参数透传、异常归一 |
| **语义层** | 逐工具核对 schema 参数名 → 门面签名 → adapter 解构 → 返回值字段 | 17 个工具 |

## 17 个工具的执行链矩阵

| # | 工具 | 门面方法 | 走 bus | 白名单命令 | 引擎 | sink 目标 | 结论 |
|:--:|---|---|:--:|---|---|---|---|
| 1 | `set_map_view` | `setMapView` | ✔（special） | `setMapView` | 双 | 引擎切换链 | ✅ 既有 |
| 2 | `set_view_center` | `setViewCenter` | ✔ | `setViewCenter` | 双 | `getMap()` / viewer | ✅ 既有 |
| 3 | `set_camera_orientation` | `setCameraOrientation` | ✔ | `setCameraOrientation` | 3D | viewer | ✅ 既有 |
| 4 | `zoom_to_extent` | `zoomToExtent` | ✔ | `zoomToExtent` | 双 | `getMap()` / viewer | ✅ 既有 |
| 5 | `search_and_zoom` | `searchAndZoom` | ✔ | `setViewCenter` + `addSearchResultLayer` | 双 | 地理编码 + 建层 | ✅ 既有 |
| 6 | `switch_basemap` | `switchBasemap` | ✔ | `switchBasemap` | 双 | `setBaseLayerActive` / `setBasemapById` | ✅ 既有 |
| 7 | `get_weather` | `getWeather` | ✘ | — | 双 | 高德 API | ✅ 既有 |
| 8 | `get_map_state` | `getMapState` | ✘ | — | 双 | `captureMapContext` + `listLayers` | ✅ 只读 |
| 9 | `list_layers` | `listLayers` | ✘ | — | 双 | 运行时桥 `listLayers()` | ✅ 截图已证 |
| 10 | `get_layer_info` | `getLayerInfo` | ✘ | — | 双 | 同上（取单条） | ✅ 只读 |
| 11 | `get_measure_result` | `readMeasureResult` | ✘ | — | 双 | `olMeasure` / `drawMeasure` store | ✅ 已补 2D |
| 12 | `set_layer_visibility` | `setLayerVisibility` | ✔ | `setLayerVisibility` | 双 | `setUserLayerVisibility` / `setVisible` | ✅ 路由通 |
| 13 | `set_layer_opacity` | `setLayerOpacity` | ✔ | `setLayerOpacity` | 双 | `setUserLayerOpacity` / `setOpacity` | ✅ 路由通 |
| 14 | `zoom_to_layer` | `zoomToLayer` | ✔ | `zoomToLayer` | 双 | `zoomToUserLayer` / `flyTo` | ✅ 路由通 |
| 15 | `solo_layer` | `soloLayer` | ✔ | `soloLayer` | 仅 2D | `soloUserLayer` | ✅ 3D 显式拦截 |
| 16 | `export_layer_geojson` | `exportLayerGeoJson` | ✔ | `exportLayerGeoJson` | 仅 2D | `exportUserLayerGeoJSON` + Blob 下载 | ✅ 3D 显式拦截 |
| 17 | `remove_layer` | `removeLayer` | ✔ | `removeLayer` | 双 | `removeUserLayer` / `remove` | ✅ 路由通 |

**参数名一致性**：17 个工具的 schema 参数名与 adapter 解构逐一核对，无一处错位（`layerId` / `visible` / `opacity` / `mode` / `limit` / `bbox` / `includeLayerNames` 等）。

## 路由测试（29 项断言，全部通过）

编译真实 `MapCommandBus.ts`（零依赖模块）为 CJS，注入 mock adapter 后运行：

| 组 | 断言数 | 内容 |
|---|:--:|---|
| 双引擎命令 × 2 视图 | 16 | 8 条命令在 ol / cesium 均返回 `success:true, code:'OK'` 且 `layerId` 透传 |
| 仅 2D 命令 | 4 | `soloLayer` / `exportLayerGeoJson` 在 ol 成功、在 cesium 返回 `COMMAND_UNSUPPORTED_FOR_VIEW` |
| 仅 3D 命令 | 2 | `setCameraOrientation` 在 cesium 成功、在 ol 被拦截 |
| 特殊命令 `setMapView` | 2 | 正常切换；非法 `view` 返回 `INVALID_ARGUMENT` |
| 未知命令 | 1 | `dropDatabase` → `UNKNOWN_COMMAND` |
| 参数透传 | 1 | `{layerId:'X9', opacity:0.42}` 原样到达 handler |
| handler 抛错 | 1 | → `COMMAND_EXECUTION_FAILED`（不冒泡） |
| 适配器缺失 | 1 | → `MAP_RUNTIME_NOT_READY` |
| 白名单条数 | 1 | 12 条 |

结果：`通过 29 / 失败 0`。

## 发现的问题（3 个真实缺失，已修）

### 1. `name` 未透传给 LLM

`remove_layer` 返回 `{name, featureCount, deleted}`，但 `formatToolResultForLLM` 的 `extraKeys` 白名单里没有 `name` —— 模型只能从 `message` 里读到中文描述，拿不到结构化字段。若模型需要在后续轮引用「被删的图层名」，只能从自然语言里猜。

**修复**：`extraKeys` 增加 `name`。

### 2. `deleted` 未透传

同上，`deleted:true` 是明确的成功标志位，模型看不到就得靠 `success` 推断。

**修复**：加入 `extraKeys`。

### 3. `sceneApplied` 未透传且 message 未提示

3D 删除时若场景适配器未注册，`cesiumLayers.remove` 只删记录、场景数据可能残留，返回 `sceneApplied:false`。但门面的 message 仍写「已删除图层「X」」，**与事实不符**。

**修复**：`extraKeys` 加 `sceneApplied`；门面 message 在 `sceneApplied === false` 时追加「（3D 场景未挂载，仅移除了图层记录，场景数据可能残留）」。

### 误报说明（结构性检查脚本报的 4 项）

| 报错 | 实际 |
|---|---|
| OL/Cesium 适配器缺少 `setMapView` handler | `setMapView` 是 `special: true` 命令，由 `MapCommandBus.executeSetMapView` 直接处理，**不走适配器**，正常 |
| Cesium 缺 `switchBasemap` / `addSearchResultLayer` sink | 注入名是 `setBasemap` / `importGeoJson`（与 handler 名不同），已核对确实注入，正常 |

## 修改内容

1. `agentToolsSchema.ts`：`formatToolResultForLLM` 的 `extraKeys` 增加 `name` / `deleted` / `sceneApplied`。
2. `GISCommander.ts`：`removeLayer` 的 message 对 `sceneApplied === false` 追加场景残留说明。
3. `ChatPanelContent.ts`：新增 `stableToolSignature()`（键按字典序递归排序），替换多轮编排里两处 `JSON.stringify` 签名计算，消除「参数顺序变化导致重复检测失效」的隐患。

## 修改原因

工具返回的结构化字段若被格式化层过滤，模型等于「看不见」，只能依赖自然语言摘要 —— 一旦摘要措辞有偏差，模型就会基于错误信息继续推理。审查的价值不在于「确认能跑」，而在于找出这类**数据在传递链上被截断**的位置。

## 影响范围

| 项 | 影响 |
|---|---|
| 工具数 | 17（不变） |
| 消息体积 | 每次删除结果多约 60 字符（三个字段） |
| 行为 | 3D 场景未挂载时的删除，回复会明确告知「仅删记录」 |
| 其他工具 | 无影响（字段名不冲突） |

## 性能指标

无变化。

## 测试方案

### Agent 已执行

- `vue-tsc --noEmit` —— 0 报错
- `eslint`（2 个变更文件）—— 0 warning
- 跨层结构检查 —— 17/17/19/12/11/10/10/9 全对齐，零缺失
- 路由测试 —— 29/29 通过
- 临时产物已清理（`.audit-tmp` 删除，脚本内容记入本日志）

### 必须在浏览器验证（静态手段覆盖不到）

静态检查证明了「命令能被正确路由到 sink」，但**sink 是否真的改变了地图**只能在浏览器里看：

1. `set_layer_visibility` → 图层消失/出现
2. `set_layer_opacity` → 肉眼可见变淡
3. `zoom_to_layer` → 视图贴合图层范围
4. `solo_layer` → 其余图层消失，且回复列出被隐藏项
5. `export_layer_geojson` → 浏览器真的下载文件
6. `remove_layer` → 图层从 TOC 消失
7. 多轮编排 → 出现两张工具卡片而非一张

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/constants/agentToolsSchema.ts` | extraKeys 补 3 个字段 |
| `frontend/src/domains/common/command-bus/GISCommander.ts` | 3D 删除的 message 补场景残留提示 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本号 V3.7.9 |

## 遗留与风险

1. **sink → 容器的实际效果未验证**：`MapContainer.setUserLayerVisibility` 等 6 个方法存在且签名匹配，但「调用后地图是否正确变化」需浏览器确认。若某条链路失败，最可能的位置是 `userLayerFacade` 的懒加载时序（首次调用触发动态 import，理论上被 `await` 覆盖）。
2. **门面层的单元测试缺位**：`GISCommander` 依赖 `@/api/*`（geocode/weather），在 node 下无法直接加载，本次未做自动化测试，仅静态核对。
3. **重复调用检测已改为键顺序无关**：原 `JSON.stringify([name, args])` 在 `{layerId, visible}` 与 `{visible, layerId}` 之间会产生不同签名，护栏失效。现改为 `stableToolSignature()`（键按字典序递归排序后序列化），本轮已修并复检通过。
4. **3D 能力缺口**：`solo_layer` / `export_layer_geojson` 仅 2D，3D 依显式拦截；若用户期望 3D 也能导出，需单独立项（`exportData` 走浏览器下载通道，需先解决从 `dataSources` 提取几何）。
5. **多轮 token 成本**：4 轮上限 ≈ 4 倍首轮消耗，未做按场景裁剪工具集。
