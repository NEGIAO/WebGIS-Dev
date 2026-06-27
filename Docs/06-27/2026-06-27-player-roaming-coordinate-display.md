# 2026-06-27 人物漫游坐标显示联动

## 日期和时间
2026-06-27 10:30

## 修改内容
- Cesium 三维模式下，开启人物漫游时坐标显示面板自动切换为人物的实时三维坐标（经度、纬度、海拔），漫游结束后恢复鼠标位置显示。

## 修改原因
- 原有的坐标显示面板仅显示鼠标指向的地面坐标，在人物漫游模式下无法直观看到角色当前的空间位置。
- `usePlayerController` 已有 `playerPosition` 响应式变量（每帧更新），但未被坐标面板消费。
- 需要将漫游人物位置与坐标面板联动，提升漫游体验。

## 影响范围
- Cesium 三维坐标显示面板
- 人物漫游控制器（PlayerController）

## 事件逻辑链条分析

### 核心症状
- 漫游模式下坐标面板仍显示鼠标位置，与人物实际位置无关。

### 根本原因
- `usePlayerController` 导出了 `playerPosition`（每帧更新 `{lng, lat, height}`），但 `CesiumContainer.vue` 的坐标面板直接使用 `useCesiumInteractions` 返回的 `coordinateDisplay`（鼠标位置），两者没有关联。

### 解决方案
- 在 `CesiumContainer.vue` 中新增 `activeCoordinateDisplay` 计算属性：
  - 当 `playerPosition` 有值（漫游激活）→ 显示人物坐标 + `(漫游)` 后缀
  - 否则 → 回退到鼠标位置 `coordinateDisplay`
- 模板中将 `{{ coordinateDisplay }}` 替换为 `{{ activeCoordinateDisplay }}`

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue`

## 测试方案
1. 启动 Cesium 三维模式，确认鼠标移动时坐标面板正常显示鼠标位置
2. 点击控制中心「漫游模式」按钮启动漫游
3. 使用 WASD 移动人物，确认坐标面板显示的是人物实时位置（带 `(漫游)` 后缀）
4. 按 ESC 退出漫游，确认坐标面板恢复为鼠标位置显示
