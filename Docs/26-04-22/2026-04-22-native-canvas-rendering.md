# 2026-04-22 罗盘原生 Canvas 矢量渲染重构

## 日期和时间
2026-04-26 10:45

## 修改内容
1. 新增罗盘配置后端接口 `backend/api/compass_config.py`：
   - 初始化 `compass_configs` 表并内置 5 套主题（Ancient Cinnabar / Dark Gold / Jade Realm / Minimalist / Cyber Blueprint）。
   - 提供 `GET /api/compass/configs` 与 `GET /api/compass/config/{cid}`。
2. `backend/app.py` 接入罗盘配置路由与启动初始化逻辑：
   - 在 `startup_event` 中调用 `init_compass_config_storage()`。
   - 注册 `compass_config_router`。
3. 新增前端罗盘状态仓库 `frontend/src/stores/useCompassStore.ts`：
   - 管理双模式（`vector` / `hud`）、坐标、旋转、`cid`、透明度、尺寸、传感器权限。
   - 通过 `cid` 拉取后端配置，失败时回退本地主题。
4. 新增罗盘 URL 状态模块 `frontend/src/services/compassUrlState.ts`：
   - 读写 `clng/clat/crot/cid/cmode` 参数，保持分享链路可恢复。
5. 重构 `frontend/src/services/CompassManager.ts` 为原生 Canvas 渲染主入口：
   - 使用 OpenLayers `Style({ renderer })` 直接在地图主 Canvas 绘制罗盘。
   - 以 `Feature(Point)` 为几何中心，按地理米制采样（中心坐标 + 半径米偏移）计算像素半径。
   - 绘制 7 层环、分隔线、刻度和文本，不再依赖 Overlay 图像缩放。
   - 天心十字严格限制为半径的 `1/3`。
   - 实现 LOD：在低分辨率/小像素半径下跳过密集文本（24/60 龙层）。
   - 集成设备朝向同步（`webkitCompassHeading` 优先，`alpha` 兜底）。
6. `frontend/src/components/MapContainer.vue` 仅保留管理器挂载：
   - 不再承载罗盘 GIS 细节逻辑。
   - 仅提供 HUD 宿主并在 `initMap/onUnmounted` 中初始化/销毁 `CompassManager`。
7. `frontend/src/components/CompassControlPanel.vue` 与 `SidePanel.vue` 打通：
   - 提供主题、模式、地理尺寸、透明度、阈值和传感器开关控制。
8. `frontend/src/components/TopBar.vue` 与 `HomeView.vue` 打通罗盘入口：
   - 菜单“风水罗盘”触发 `open-compass`，打开侧栏罗盘页。
9. `frontend/src/components/ControlsPanel.vue` 打通注释中待实现功能：
   - 图层：切换工具箱。
   - 绘制：激活 `Polygon`。
   - 测量：激活 `MeasureDistance`。
   - 标注：触发 `ReverseGeocodePick`。
   - 分析：切换工具箱并触发分析入口提示。

## 修改原因
1. 需要将罗盘从“界面贴图”重构为 GIS 原生矢量实体，保证缩放平滑与地图同帧渲染。
2. 需要满足“MapContainer 不堆叠 GIS 业务逻辑”的解耦要求。
3. 需要主题配置由后端 `cid` 驱动，支持 URL 分享恢复。

## 原生 Canvas 绘制逻辑说明
1. 以 `Feature(Point)` 作为地理锚点。
2. 在 renderer 内通过：
   - `centerCoord = feature.getGeometry().getCoordinates()`
   - `edgeCoord = [centerCoord[0] + radiusMeters, centerCoord[1]]`
   - `map.getPixelFromCoordinate(...)` 计算像素半径
   实现“按地理米制定义、由 OL 管线投影到像素”。
3. 通过 `ctx.save()` / `ctx.restore()` 包裹每帧渲染，避免污染地图主 Canvas 状态。
4. 通过分层环+分隔线+刻度+径向文字绘制完整罗盘。
5. LOD 规则：
   - `segmentCount >= 60` 且半径较小时跳过文本；
   - `segmentCount >= 24` 且半径较小时跳过文本。

## 影响范围
1. 前端地图渲染链路：MapCanvas 原生绘制罗盘。
2. 前端侧栏控制：新增罗盘控制面板与快捷侧栏联动。
3. 后端配置服务：新增罗盘主题配置接口。
4. URL 分享：新增并恢复罗盘关键参数。

## 修改的文件路径（绝对路径）
- d:\Dev\GitHub\WebGIS_Dev\backend\api\compass_config.py
- d:\Dev\GitHub\WebGIS_Dev\backend\app.py
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\api\backend.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useCompassStore.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\index.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\CompassManager.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\compassUrlState.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\CompassControlPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\SidePanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\TopBar.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ControlsPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\types\compass.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\feng-shui-compass-svg.vue
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
- d:\Dev\GitHub\WebGIS_Dev\Docs\26-04-22\2026-04-22-native-canvas-rendering.md

## 验证情况
1. 关键前后端改造文件已进行静态错误检查。
2. 罗盘渲染链路满足：`Feature(Point)` + Canvas renderer + LOD。
3. URL 可持久化 `position/rotation/cid/cmode`。
