# 2026-06-27 漫游导航指引功能

## 日期和时间
2026-06-27 17:30

## 修改内容
人物漫游模式新增导航指引功能：
- 新增「设置导航」按钮，弹出三选一对话框：搜索地点 / 选择数据要素 / 地图点选
- 新增 NavGuideHUD 组件：屏幕顶部显示目标名称 + 方向箭头 + 距离
- 到达目标（< 10m）时 HUD 变绿显示 "✓ 已到达"
- 利用 Cesium 原生 Selection Indicator 持久聚焦目标实体
- 搜索选点结果在 3D 模式下自动成为导航目标
- **导航独立于漫游状态**：可先设导航再启动漫游，也可中途更改目标

## 修改原因
用户在漫游模式下需要方向引导，特别是大型 3D 场景中容易迷路。通过导航 HUD 可以快速找到目标位置。

## 影响范围
- `usePlayerController.js` — 新增导航状态和方位计算
- `NavGuideHUD.vue` — 新增 HUD 组件（有目标即显示）
- `NavTargetDialog.vue` — 新增三选一对话框
- `useCesiumToolModules.js` — 控制中心新增导航 actions（不受漫游状态限制）
- `CesiumContainer.vue` — 挂载 HUD + 对话框 + 搜索目标接入
- `HomeView.vue` — 搜索结果传递到 Cesium

## 优化解决方案

### 架构设计
```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 设置导航（三选一）│────▶│ navTarget ref    │────▶│ NavGuideHUD.vue  │
│ 🔍 搜索地点      │     │ { lng, lat, name }│     │ 方向箭头 + 距离   │
│ 📁 数据要素      │     │ bearing, distance │     │ 到达提示          │
│ 📍 地图点选      │     │ _entity          │     └──────────────────┘
└─────────────────┘     └──────────────────┘
                               ▲
                        Selection Indicator
                        （持久聚焦，不随漫游停止清除）
```

### 关键设计决策
1. **导航独立于漫游**：`navTarget` 不在 `stopPlayer()` 中清除，可先设目标再漫游
2. **HUD 显示条件**：`v-if="navTarget"` 而非 `v-if="isActive"`，有目标即显示
3. **Selection Indicator 持久化**：`viewer.selectedEntity` 保持设置，蓝色选中框常驻
4. **对话框三选一**：搜索 → 提示使用搜索框；数据要素 → 进入 entity 点选；地图 → 进入地形点选

### 核心逻辑
1. **目标设置**：`setNavTarget()` 创建 Cesium Entity + 设置 `viewer.selectedEntity`
2. **每帧更新**：preUpdateListener 中 Haversine 计算距离 + 方位角
3. **HUD 渲染**：CSS rotate 箭头指向目标方位，距离实时更新
4. **搜索联动**：HomeView 监听搜索事件，3D 模式下传递给 CesiumContainer

## 性能指标
- 方位/距离计算：纯数学函数，每帧一次，无性能开销
- HUD 渲染：Vue 响应式更新，仅在值变化时重渲染

## 测试方案
1. 不启动漫游 → 点击「设置导航」→ 选择「地图点选」→ 点击地图 → 验证 HUD + Selection Indicator
2. 启动漫游 → 验证导航 HUD 保持显示 + 方向实时更新
3. 走向目标 → 验证距离递减 + 箭头方向变化
4. 到达目标（< 10m）→ 验证 "已到达" 提示
5. 停止漫游 → 验证导航 HUD 仍然显示
6. 点击「更改目标」→ 重新选择 → 验证目标更新
7. 点击「清除导航」→ 验证 HUD + Selection Indicator 消失
8. 漫游模式下搜索地名 → 验证自动设为导航目标

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\usePlayerController.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\NavGuideHUD.vue`（新增）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\NavTargetDialog.vue`（新增）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumToolModules.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue`
