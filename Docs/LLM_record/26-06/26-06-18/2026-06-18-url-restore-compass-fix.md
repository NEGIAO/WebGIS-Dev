# 2026-06-18 URL 视图复原与罗盘默认关闭修复

## 日期和时间

2026-06-18 18:09

## 修改内容

- 修复 OL 模式分享链接刷新后可能无法按 `lng/lat/z` 复原、被启动阶段 URL 写回覆盖为默认/`(0,0)` 视图的问题。
- 修复罗盘未开启时仍因 URL 残留 `cs` 参数被重新启用并绘制的问题。
- 明确罗盘 URL 语义：无 `cs` 或 `cs=0` 表示罗盘关闭；只有完整合法的 `cs` 才恢复罗盘绘制。
- 新增启动 URL 恢复守卫，将 OL 初始写回与延迟 URL 参数应用解耦。

## 修改原因

### 核心症状

1. 用户在 OL 模式分享链接后刷新，地图未回到分享时的原始视图，只跳转到 `(0,0)` 或被当前启动视图覆盖。
2. 罗盘即便未在 UI 中开启，刷新地图后仍会绘制；URL 中罗盘参数不为默认关闭值。

### 根本原因

1. `MapContainer.vue` 在 `initMap()` 后立即执行 `syncUrlFromActiveMap()`，而 `applyDeferredUrlParams()` 在底图稳定后才应用 URL 参数。启动阶段先写后读会让当前 OL view 覆盖分享链接中的 `lng/lat/z`。
2. `writeCompassUrlState()` 删除 `cs` 时仍保留 `window.location.search`，导致顶层 `/home?cs=...#/home?...` 中的 `cs` 无法真正移除；刷新时 `readMergedQuery()` 又会读回该残留参数并触发 `CompassManager.restoreFromUrlState()` 启用罗盘。
3. `restoreFromUrlState()` 只要经纬度有限就启用罗盘，对 `radius` 完整性与 `cs=0` 关闭语义约束不足。

## 影响范围

- 前端 URL 状态同步：OpenLayers 分享链接恢复、Cesium/OL 视图互斥写回。
- 罗盘状态管理：`cs` URL 参数读取、写入、刷新恢复、vector/HUD 绘制开关。
- 文档维护：根 README、前端 README、后端 README 与本维护日志同步。

## 优化解决方案

1. 新增 `useStartupUrlRestoreGuard.js`：
   - 判断启动 URL 是否存在待恢复的 OL 坐标参数；
   - 在延迟参数处理前阻止 OL 写回 URL；
   - 在参数成功、失败、无效或 Cesium 跳过路径均释放守卫。
2. 修复 `MapContainer.vue` 启动链路：
   - `syncUrlFromActiveMap()` 与 `urlSyncEnabled` watcher 统一通过守卫判断；
   - `applyDeferredUrlParams()` 负责在所有终止路径标记初始 URL 参数已处理。
3. 修复罗盘 URL 状态：
   - `readCompassUrlState()` 显式将空 `cs` 与 `cs=0` 视为关闭；
   - `writeCompassUrlState()` 写回时不再保留原始 `window.location.search`，避免顶层残留 `cs` 复活。
4. 强化罗盘恢复与绘制前置条件：
   - 仅当 `lng/lat/radius` 完整合法且 `radius > 0` 时恢复并启用罗盘；
   - `syncFeatureGeometry()` 在罗盘未启用或非 vector 模式时直接返回，避免关闭状态被地图中心初始化。

## 性能指标

本次为启动时序与 URL 状态修复，不涉及渲染性能或接口性能优化；预期无新增网络请求与长期定时器。

## 测试方案

1. OL 分享链接恢复：打开 OL，移动到非默认位置并缩放，复制 URL 后硬刷新，确认恢复到 URL 中 `lng/lat/z`，不跳转 `(0,0)`。
2. Cesium 分享链接恢复：打开包含 `view=cesium`、`lng/lat/z/cv` 的 URL，确认 Cesium 相机恢复且 OL 不覆盖 URL。
3. 罗盘默认关闭：打开无 `cs` 的 URL，确认刷新后罗盘不启用、不绘制且 URL 不新增 `cs`。
4. `cs=0` 关闭语义：打开带 `cs=0` 的 URL，确认罗盘仍关闭。
5. 顶层残留 `cs` 清理：打开 `/home?cs=<valid-code>#/home?...`，关闭罗盘后确认顶层 `cs` 被移除，刷新不再自动启用。
6. 罗盘开启持久化：开启罗盘并设置位置/半径，确认 URL 写入有效 `cs`，刷新后按参数恢复。
7. 执行前端可用的 lint/build/test 命令，记录结果。

## 补充修复：罗盘面板隐式启用链路（2026-06-18 继续排查）

### 核心症状

用户打开无 `cs` 或已清空 `cs` 的链接后，罗盘仍可能被绘制；重新打开罗盘侧栏后，URL 又出现有效 `cs`，而不是保持 `0` 或空值。

### 事件逻辑链条分析

1. `HomeView.vue` 与 `views/home/useSidePanel.ts` 的 `openCompassPanel()` 在打开罗盘面板时直接执行 `compassStore.setEnabled(true)`。
2. `CompassManager.syncFeatureGeometry()` 的设计是：罗盘已启用但暂无有效位置时，用当前地图中心补齐罗盘位置。
3. `CompassManager.scheduleUrlSync()` 检测到 `enabled=true` 后，将补齐的地图中心位置和半径编码为有效 `cs`。
4. 刷新页面时，`restoreFromUrlState()` 读取到合法 `cs`，再次启用罗盘并绘制。

### 根本原因

打开罗盘配置面板被错误地等同于“启用罗盘绘制”。这绕过了 `CompassControlPanel.vue` 中已有的显式启用开关，使配置面板展示动作触发了地图中心默认定位、URL 持久化和刷新恢复。

### 影响范围

- 前端罗盘侧栏入口：`HomeView.vue`、`views/home/useSidePanel.ts`。
- 罗盘绘制生命周期：`CompassManager` 的启用状态、位置补齐和 URL 同步。
- URL 分享语义：无 `cs` / `cs=0` 应保持罗盘关闭；只有用户显式启用或有效分享参数才绘制。

### 优化解决方案

1. 移除打开罗盘面板时的隐式 `compassStore.setEnabled(true)`。
2. 保留 `CompassControlPanel.vue` 的用户显式启用入口，由“启用罗盘”复选框、GPS 定位或手动坐标设置决定是否绘制。
3. 保留合法 `cs` 刷新恢复逻辑，避免破坏用户主动分享的罗盘状态。
4. 同步更新根、前端、后端 README，说明本次为前端罗盘面板启用链路修复，后端结构无变更。

### 性能指标

本次修复减少无意打开罗盘面板时的矢量图层创建、Canvas 罗盘绘制与 URL 防抖写回；不新增网络请求或后台任务。

### 补充测试方案

1. 打开无 `cs` URL，点击罗盘入口仅展示面板，确认罗盘开关未自动勾选、地图不绘制罗盘、URL 不新增 `cs`。
2. 在罗盘面板中手动勾选启用或使用定位/坐标功能，确认罗盘正常绘制并写入有效 `cs`。
3. 刷新带有效 `cs` 的分享链接，确认罗盘仍可恢复。
4. 切换到非罗盘侧栏后确认放置模式等瞬态交互仍被关闭。


- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\compass\urlState.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\CompassManager.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useStartupUrlRestoreGuard.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
- d:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-18\2026-06-18-url-restore-compass-fix.md
