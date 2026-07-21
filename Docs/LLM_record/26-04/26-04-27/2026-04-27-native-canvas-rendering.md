# 2026-04-22-native-canvas-rendering

## 日期和时间
2026-04-27 11:32

## 修改内容
1. 完整重构 `CompassManager.ts`，将风水罗盘地图模式改为 OpenLayers 原生 Canvas 矢量渲染：
   - 使用 `Style({ renderer })` 在 `VectorLayer` 管线内直接绘制圈层、分隔线、刻度与文字。
   - 使用 `ctx.beginPath`、`ctx.arc`、`ctx.lineTo`、`ctx.strokeText`、`ctx.fillText` 实现地图原生绘制。
2. 严格移除旧的像素直算逻辑（`PixelSize = D / res`），改为地理米制采样：
   - 通过 `ol/sphere` 的 `offset` 先构造“中心点东向 radiusMeters”地理点。
   - 再通过 `map.getPixelFromCoordinate` 计算米制半径在当前视图下的像素值。
3. 天心十字线绘制规则落地：
   - 十字长度严格限定为半径的 `1/3`。
4. LOD（细节层级）策略落地：
   - 在半径较小时自动跳过 24 山/60 龙等高密度文本，避免画面拥挤。
5. 传感器双模式联动修正：
   - 设备朝向监听仅在 `HUD` 模式且启用传感器时启动。
   - 继续保留 iOS `DeviceOrientationEvent.requestPermission` 授权链路。
6. 删除旧渲染文件 `compassVectorRenderer.ts`，确保“渲染逻辑只在 `CompassManager.ts` 中”。

## 修改原因
1. 满足“地图模式必须是 GIS 引擎原生渲染实体”的硬要求，避免 Overlay/贴图缩放带来的失真与交互不一致。
2. 满足“禁止 `D/res` 简单像素缩放”的强约束，改为米制真实半径采样。
3. 满足“渲染逻辑集中封装在 `@/services/CompassManager.ts`”的架构约束。

## 影响范围
1. 前端地图渲染链路：罗盘绘制完全由 OpenLayers Vector Renderer 承担。
2. 前端罗盘模式行为：HUD 模式与设备传感器的绑定逻辑更严格，与 GIS 模式职责分离。
3. 代码结构：旧 `compassVectorRenderer.ts` 被移除，减少渲染实现分散。

## 修改的文件路径（绝对路径）
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\CompassManager.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\compassVectorRenderer.ts
- d:\Dev\GitHub\WebGIS_Dev\Docs\2026-04-22-native-canvas-rendering.md

## 验证情况
1. `CompassManager.ts` 静态检查通过，无 TypeScript 错误。
2. 已确认不再存在对 `compassVectorRenderer.ts` 的引用。
3. URL 状态链路继续覆盖 `position/rotation/cid/mode`（`clng/clat/crot/cid/cmode`）。
