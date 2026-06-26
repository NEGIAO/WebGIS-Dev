# 2026-06-26 完全移除 AtmosphereManager 模块

**日期**: 2026-06-26 15:30

---

## 问题描述

Cesium 初始化时加载了 `AtmosphereManager`（Tellux 移植的大气系统），但该模块默认关闭且很久未使用，需要完全移除。

## 问题分析

### 核心症状
- Cesium 初始化时加载了不需要的 `AtmosphereManager` 模块
- 该模块包含日夜过渡、月光、星空、体积云等子系统
- 默认配置下所有功能都是关闭的，但仍会初始化和占用资源

### 根本原因

`CesiumContainer.vue` 中的 `initViewer` 函数会初始化 `AtmosphereManager`，但 `useCesiumToolModules.js` 中默认配置所有大气功能都是关闭的。

### 受影响的模块
- `AtmosphereManager`（atmosphere/AtmosphereManager.js）
- `DayNightTransition`（atmosphere/DayNightTransition.js）
- `MoonLightSystem`（atmosphere/MoonLightSystem.js）
- `VolumetricCloudRenderer`（atmosphere/VolumetricCloudRenderer.js）
- `StarFieldRenderer`（atmosphere/StarFieldRenderer.js）
- `MoonPhaseCalculator`（atmosphere/MoonPhaseCalculator.js）
- `atmosphereConstants.js`
- `atmosphereDefaults.js`
- `index.js`
- `useCesiumAtmosphere.js`

## 修复方案

### 1. 删除 atmosphere 目录

完全删除 `frontend/src/components/Cesium/atmosphere/` 目录及其所有文件。

### 2. 清理 CesiumContainer.vue

删除：
- `AtmosphereManager` 导入
- `atmosphereManager` 变量声明
- `initViewer` 中的 `AtmosphereManager` 初始化代码
- `atmosphereParams` 解构
- 相关的 watch 监听器
- `setupAtmosphereRenderLoop` 函数
- `onUnmounted` 中的清理代码

### 3. 清理 useCesiumToolModules.js

- 移除 `atmosphereDefaults.js` 的导入
- 本地定义 `QUALITY_PRESETS` 常量

### 4. 保留基础功能

保留：
- `configureSolarLighting`（晨昏半球必需）
- `baseAtmosphereParams`（基础大气参数）
- `applyBaseAtmosphereParams`（应用基础大气参数）
- `CesiumAdvancedEffects` 组件（独立，不受影响）

---

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumToolModules.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\atmosphere\`（整个目录删除）

---

## 测试方案

1. 启动 Cesium 场景
2. 验证地形和底图正常显示
3. 验证晨昏半球效果正常（`globe.enableLighting = true`）
4. 验证无控制台错误
5. 验证体积云功能仍可通过 CesiumAdvancedEffects 使用

---

## 删除的文件

```
atmosphere/
├── AtmosphereManager.js
├── DayNightTransition.js
├── MoonLightSystem.js
├── MoonPhaseCalculator.js
├── VolumetricCloudRenderer.js
├── StarFieldRenderer.js
├── atmosphereConstants.js
├── atmosphereDefaults.js
├── index.js
├── useCesiumAtmosphere.js
├── FINAL_STATUS.md
├── INTEGRATION_STATUS.md
├── README.md
└── shaders/
    └── cloudShaders.js
```

---

## 大气增强高度阈值

`CesiumAdvancedEffects.vue` 的 `preRender` 循环中新增高度判断：相机高度低于 **800m** 时自动关闭大气增强（Bloom/HDR/SkyAtmosphere 微调），恢复为原始状态，避免与晨昏半球效果冲突。相机回到 800m 以上后自动重新启用。

---

## 场景美化模块

新增 `useCesiumBeautify.js` composable，提供 HDR、FXAA、定向光、天空大气微调等效果的开关和参数控制。

### 修改的文件

- `composables/useCesiumBeautify.js`（新建）
- `composables/useCesiumToolModules.js`（新增 beautifyParams + createBeautifyControls）
- `CesiumContainer.vue`（接入 useCesiumBeautify + watch）
- `CesiumAdvancedEffects.vue`（大气增强高度阈值 800m）

---

## 相关文档

- [[CesiumAdvancedEffects.vue]] - 高级特效组件（独立，不受影响）
- [[useCesiumToolModules.js]] - 工具模块配置（已更新）
- [[useCesiumBeautify.js]] - 场景美化 composable（新建）
- [[cesiumAtmosphere.js]] - 基础大气配置（保留 `configureSolarLighting`）
