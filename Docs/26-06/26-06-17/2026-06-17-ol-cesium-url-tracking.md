# OL / Cesium URL 状态同步

## 日期和时间

2026-06-17 17:58

## 修改内容

- 新增 `view=ol|cesium` 地图引擎 URL 参数，用于刷新、分享、直链恢复 2D / 3D 面板。
- 新增 Cesium 双通道 URL 追踪：坐标面板实时捕捉后写回 `lng/lat/z`，相机停止移动后写回 `cv` 编码视角。
- 在 `view=cesium` 下让 `z` 表示坐标面板捕捉到的高程；在 `view=ol` 下继续让 `z` 表示 OpenLayers 缩放级别。
- 为 `MapContainer.vue` 增加 `urlSyncEnabled` 控制，3D 面板显示时停止隐藏 OL 面板的 URL 写回，避免覆盖 Cesium 相机状态。
- 扩展路由和 `useUrlParamStore.ts`，让 `view` 进入 URL 参数提取、校验与延迟应用流程。
- 同步更新项目根、前端、后端三个 README 的目录树和版本说明。

## 修改原因

当前 URL 动态更新只由 `MapContainer.vue` / OpenLayers 触发：

1. `useMapState.js` 监听 OL `moveend`，写回 `lng/lat/z/l/s/loc/p`。
2. Cesium 面板没有相机 URL 追踪，用户切到 3D 后刷新或分享链接会回到 OL。
3. `z` 在 OL 中是缩放级别，但在 Cesium 中应表达相机高度，两者不能直接共用同一套隐式语义。
4. OL 组件使用 `v-show` 常驻页面，若不限制写回时机，隐藏状态下仍可能覆盖 Cesium 的 URL 状态。

本次改动通过 `view` 明确区分引擎，并把 OL 与 Cesium 的视角写回逻辑拆开，避免语义冲突。

## 影响范围

- 前端 URL 参数管理：`lng`、`lat`、`z`、`l`、`view`、`cv`。
- OpenLayers 地图状态链路：`useMapState.js`、`MapContainer.vue`。
- Cesium 地球 URL 链路：`CesiumContainer.vue`、`useCesiumInteractions.js`、`useCesiumUrlTracking.js`、`utils/url/crypto.js`。
- 首页 2D / 3D 面板切换：`HomeView.vue`。
- 路由与延迟参数应用：`router/index.js`、`useUrlParamStore.ts`。
- 文档与维护日志：根 README、前端 README、后端 README。

## 优化解决方案

### 事件逻辑链条

1. 用户进入 `/home?view=cesium&lng=...&lat=...&z=...`。
2. 路由守卫读取 `view` 并写入 `useUrlParamStore.ts`。
3. `HomeView.vue` 通过 `useMapViewUrlState()` 读取 `view`，若为 `cesium` 则懒加载 `CesiumContainer.vue` 并显示 3D 面板。
4. `CesiumContainer.vue` 初始化 viewer 后优先调用 `restoreCameraFromUrl()`，避免默认 `flyToHome(0)` 覆盖直链视角。
5. Cesium 鼠标移动时，`useCesiumInteractions.js` 先更新坐标面板，再把同一份经纬度和高程交给 `useCesiumUrlTracking.js` 写回 `view=cesium`、`lng/lat/z`。
6. Cesium 相机移动停止时，`useCesiumUrlTracking.js` 读取相机经纬度、高度、heading/pitch/roll，经 `encodeCesiumCameraState()` 编码为 `cv`；分享链接进入时优先解码 `cv` 并 `camera.setView()` 完整还原视角。
7. 切回 OL 时，`HomeView.vue` 写回 `view=ol`，`MapContainer.vue` 重新启用 OL URL 同步。
8. `MapContainer.vue` 隐藏时停止 `bindMapViewSync()`，避免隐藏 OL 面板继续覆盖 Cesium URL。

### 关键策略

- 使用 `view=ol|cesium` 作为引擎选择参数，避免复用模糊的 `mode`。
- 复用现有 `useMapState.js` 的 OL 参数生成与未知参数保留能力。
- 新建 `useCesiumUrlTracking.js`，把 Cesium 坐标面板同源 URL 写回与 `cv` 相机视角还原集中封装，避免把复杂逻辑堆进组件。
- `view=cesium` 下的 `z` 作为坐标面板高程处理；`useUrlParamStore.ts` 按 `view` 校验 `z`，避免用 OL 的 0-30 缩放范围截断高程。

## 性能指标

- 本次为 URL 状态同步功能增强，不涉及渲染或网络性能优化。
- Cesium 坐标面板复用鼠标 `MOUSE_MOVE` 拾取结果，确保 `lng/lat/z` 与坐标面板实时同源；相机视角只在 `moveEnd` 后写入 `cv`，避免每帧更新 URL。
- OL 隐藏时停止 URL 监听，减少不必要的 `moveend` 同步和 router replace。

## 测试方案

1. 打开 `view=ol&lng=114.302000&lat=34.814600&z=10&l=0`，确认进入 OL 并恢复坐标、缩放和图层。
2. 点击 3D 切换，确认 URL 写入 `view=cesium`，且没有丢失未知 query 参数。
3. 在 Cesium 中移动鼠标，确认坐标面板实时更新，URL 同步写回同一份 `lng/lat/z`，其中 `z` 为面板显示高程。
4. 在 Cesium 中调整相机视角，确认 URL 写入 `cv`；复制该分享链接到新会话/刷新页面后，确认优先解析 `cv` 并完整还原相机位置与姿态。
5. 切回 OL，确认 URL 写回 `view=ol`，OL 的 `z` 继续表示缩放级别。
6. 执行针对变更文件的 ESLint 校验。

## 验证结果

- 已通过 `encodeCesiumCameraState()` / `decodeCesiumCameraState()` Node 级回环验证，确认 `cv` 可还原经纬度、高度、heading、pitch、roll。
- 已通过针对变更文件的 ESLint：
  - `src/composables/useMapViewUrlState.js`
  - `src/components/Cesium/composables/useCesiumInteractions.js`
  - `src/components/Cesium/composables/useCesiumUrlTracking.js`
  - `src/components/Cesium/CesiumContainer.vue`
  - `src/views/HomeView.vue`
  - `src/components/Map/MapContainer.vue`
  - `src/stores/useUrlParamStore.ts`
  - `src/router/index.js`
  - `src/utils/url/crypto.js`
- 全量 `npm --prefix frontend run lint -- --quiet` 未通过，失败来自既有未改文件：
  - `frontend/src/components/Layer/TOCPanel.vue`：`TIANDITU_TK` 未定义
  - `frontend/src/components/feng-shui-compass-svg/feng-shui-compass-svg.vue`：`ref` 未使用
  - `frontend/src/composables/auth/useAuthIdentity.js`：`no-control-regex`
  - `frontend/src/utils/abortManager.js`：`key` 未使用
  - `frontend/src/utils/gis/batchProcessor.js`：`getBaseStem` 未使用

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMapState.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMapViewUrlState.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumInteractions.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumUrlTracking.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\router\index.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useUrlParamStore.ts`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\url\crypto.js`
- `D:\Dev\GitHub\WebGIS_Dev\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-17\2026-06-17-ol-cesium-url-tracking.md`
