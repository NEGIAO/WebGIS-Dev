# 2026-04-21 风水罗盘地理集成与传感器同步重构

## 日期和时间
2026-04-21 15:40

## 修改内容
1. 新增全局罗盘状态仓库 `useCompassStore`：
   - 管理 `enabled`、`position(lng/lat)`、`rotation`、`scale`、`zoomAdaptiveScale`、`placementMode`、`sensorEnabled`、`sensorPermission`。
   - 复用 `feng-shui-compass-svg` 的类型 `FengShuiCompassConfig` 与主题数据。
   - 支持主题切换、配置补丁、URL 还原态注入。
2. 新增侧边栏专用控制面板 `CompassControlPanel.vue`：
   - 支持启停罗盘覆盖层、放置模式、经纬度输入、GPS 放置、主题切换、手动旋转、缩放、十字线样式控制。
   - 支持 iOS `DeviceOrientationEvent.requestPermission()` 授权流程。
3. 顶栏接入罗盘入口：
   - `TopBar.vue` 新增显式罗盘按钮（🧭）并修复菜单项事件处理函数。
   - 发出 `open-compass` 事件切换到罗盘控制面板。
4. Home 页面联动改造：
   - `HomeView.vue` 新增 `openCompassPanel()`，打开侧栏罗盘页并自动启用罗盘覆盖层。
   - 切换到非罗盘功能页或折叠侧栏时自动关闭传感器同步与放置模式，避免“僵尸监听”。
5. SidePanel 模式扩展：
   - 新增 `activeTab === 'compass'` 分支，渲染 `CompassControlPanel`。
   - 现有新闻/工具箱/公交/驾车模式保留。
6. MapContainer 深度集成 OpenLayers Overlay：
   - 将 `FengShuiCompassSvg` 包装为 `ol.Overlay` 元素并挂载到地图。
   - 支持放置模式下点击地图定位罗盘（坐标由 `toLonLat` 回写 Store）。
   - 监听 `moveend` 动态计算缩放补偿，按 zoom 自动调整罗盘视觉尺寸层级。
   - 新增“天心十字延长线”SVG，实时对齐罗盘像素中心并延伸到地图容器边缘。
7. 设备朝向同步（移动端）接入：
   - 监听 `deviceorientation` 事件。
   - 优先使用 `webkitCompassHeading`；若不可用则使用 `alpha` 并映射为 `heading=(360-alpha)%360`。
   - 将 heading 持续写入罗盘 `rotation`，使 SVG 北向与设备物理北向联动。
8. URL 状态同步（共享恢复）扩展：
   - 新增 `clng`、`clat`、`crot`、`cscale`、`cshow` 查询参数。
   - MapContainer 在初始化时从 URL 还原罗盘状态；运行时通过 `history.replaceState` 节流写回。
   - 与既有 `s=1` 分享链路兼容，支持共享链接还原罗盘开关、位置、旋转。
9. 运行时依赖扩展：
   - `mapRuntimeDeps.js` 新增 `Overlay` 导出。
10. 兼容性修复：
   - 修复 `feng-shui-compass-svg` 部分主题文件错误类型别名 `@/types`，统一改为 `../types`。

## 修改原因
1. 罗盘组件原本为孤立 UI，未绑定地理坐标，无法在 GIS 语境下使用。
2. 无设备朝向接入，移动端无法实现“实景朝向-罗盘北向”同步。
3. 缺少 URL 同步，分享后无法完整复现罗盘状态（位置/旋转/显示）。
4. 缺少统一状态仓库，导致多个组件之间难以协调罗盘生命周期。

## Overlay 挂载逻辑（核心说明）
1. `MapContainer` 初始化地图后调用 `mountCompassOverlay()`：
   - 创建 `new Overlay({ element, positioning:'center-center', stopEvent:false })`。
   - 将罗盘 DOM 作为 Overlay element 注入 OpenLayers。
2. `updateCompassOverlayPosition()`：
   - 读取 Store 中 `position(lng/lat)`。
   - 通过 `fromLonLat([lng,lat])` 转投影后调用 `overlay.setPosition()`。
3. `updateCompassPixelAndViewport()`：
   - 通过 `map.getPixelFromCoordinate()` 求得罗盘像素中心。
   - 驱动“天心十字延长线”在容器内全幅绘制。
4. 监听 `moveend` 与 `resize`：
   - 更新像素中心与视口尺寸。
   - 根据 zoom 更新 `zoomAdaptiveScale`，实现自动视觉层级控制。

## 传感器映射逻辑（核心说明）
1. UI 层（CompassControlPanel）负责触发权限申请（满足 iOS 手势约束）。
2. Map 层（MapContainer）负责绑定/解绑 `deviceorientation` 监听。
3. 数据映射优先级：
   - `webkitCompassHeading`（iOS 高优先）
   - `alpha` 兜底，映射公式：`heading=(360-alpha)%360`
4. heading 写入 `compassStore.rotation`，并节流回写 URL。
5. 离开罗盘模块、关闭罗盘或组件卸载时强制解绑监听。

## 影响范围
1. 前端地图核心：MapContainer Overlay 系统、URL 同步行为。
2. 顶部菜单与侧边栏交互：新增罗盘入口与控制面板。
3. 移动端体验：新增朝向传感器实时联动能力。
4. 分享链路：新增罗盘状态参数，增强共享视图可恢复性。

## 修改的文件路径（绝对路径）
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useCompassStore.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\index.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\CompassControlPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\TopBar.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\SidePanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\mapRuntimeDeps.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\themes\theme-compass.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\themes\theme-dark.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\themes\theme-polygon.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\themes\theme-simple.ts
- d:\Dev\GitHub\WebGIS_Dev\Docs\2026-04-21-compass-integration.md

## 验证结果
1. `npm run build` 通过（exit code 0）。
2. 新增代码文件与改造文件均通过静态错误检查。
3. 运行时保留 chunk size 警告（既有体积问题，非本次回归）。
