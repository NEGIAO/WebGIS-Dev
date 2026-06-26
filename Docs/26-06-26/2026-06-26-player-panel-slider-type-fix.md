# 2026-06-26 人物漫游面板修复 + ArcGIS 地形兼容

## 日期和时间
2026-06-26

## 修改内容
1. 修复人物漫游面板 5 个参数滑块控件类型声明错误（`type: 'slider'` → `type: 'range'`）
2. 全局移除 `lil-separator` 分隔符 div（`type: 'info'` 控件），清理所有 `_sep_` 定义
3. 修复 ArcGIS 世界地形无法被人物漫游和物理碰撞系统识别的问题
4. 修复 ArcGIS 地形下 `sampleTerrainMostDetailed` 不兼容导致采样失败的问题（降级到 `sampleTerrain` level 17）
5. 修正初始位置高度判断逻辑：有地形 → 采样成功用地形高度+500m，采样失败用相机高度+500m；仅平面地形（EllipsoidTerrainProvider）才进入飞行模式

## 修改原因
1. 人物漫游面板使用 `type: 'slider'`，但 `LilGuiControls`（基于 `lil-gui`）只识别 `type: 'range'`，导致滑块降级为文本输入框
2. `lil-separator` 是一个手写 DOM div，视觉上突兀且无实际功能价值
3. `PhysicsSystem.ts` 和 `usePlayerController.js` 通过 `provider.availability` 判断是否有地形，但 `ArcGISTiledElevationTerrainProvider` 不暴露该属性，导致 ArcGIS 地形被误判为"无地形"，人物漫游时无法采样高度、无法生成碰撞网格

## 影响范围
- `LilGuiControls.vue`：移除 `type: 'info'` 的 DOM 创建逻辑
- `useCesiumToolModules.js`：移除 8 个 `_sep_` 分隔符定义
- `usePlayerController.js`：地形检测改用 `hasRealTerrain()`
- `PhysicsSystem.ts`：地形检测改用 `hasRealTerrain()`
- 新增 `terrainHelper.ts`：统一地形 provider 检测工具

## 优化解决方案
1. 新增 `utils/terrainHelper.ts`，提供 `hasRealTerrain(provider)` 统一判断
2. 新增 `terrain/ArcGISTerrainProvider.js`，参照天地图 `GeoTerrainProvider` 的模式，为 ArcGIS 地形补充 `availability` + `getTileDataAvailable`，使 `sampleTerrainMostDetailed` 能原生支持
3. `PhysicsSystem.ts` 和 `usePlayerController.js` 中保留 try-catch 降级到 `sampleTerrain(17)` 作为安全兜底

## 测试方案
1. 切换到 ArcGIS 世界地形 → 启动人物漫游 → 确认角色出生在地形表面（非悬浮 500m）
2. 确认 WASD 移动时有碰撞检测（不穿过地形）
3. 切换天地图/Cesium 地形，重复上述测试确认无回归

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\LilGuiControls.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumToolModules.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\usePlayerController.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\systems\PhysicsSystem.ts`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\utils\terrainHelper.ts`（新增）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\terrain\ArcGISTerrainProvider.js`（新增）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumLayers.js`（ArcGIS 地形改用增强包装器）
