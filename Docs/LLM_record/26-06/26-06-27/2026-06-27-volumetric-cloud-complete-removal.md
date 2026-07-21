# 2026-06-27 Cesium 体积云模块彻底删除

## 日期和时间
2026-06-27 11:00

## 修改内容
彻底删除 Cesium 主场景体积云（ECEF 球壳体积云）的所有代码、文件和依赖，为后续集成全新模块做准备。

## 修改原因
用户计划集成全新的体积云模块，要求彻底清除旧代码，不能有任何残留。需要确保 Cesium 能正常启动运行。

## 影响范围
- Cesium 高级特效系统（CesiumAdvancedEffects）
- 工具面板控件系统（useCesiumToolModules）
- 工具面板 UI（CesiumToolPanel）
- **不受影响**：ShallowWater 的 Three.js 云 Dome（独立系统）、Tellux 大气系统中的云控件

## 操作清单

### 1. 删除 cloud/ 目录（4 个文件）
- `cloud/cloudShader.js` — GLSL Fragment Shader
- `cloud/cloudPresets.js` — 质量预设 + 归一化
- `cloud/cloudControls.js` — UI 控件描述
- `cloud/useVolumetricCloud.js` — Vue composable

### 2. CesiumAdvancedEffects.vue（10 处清理）
- 删除 `import { useVolumetricCloud }` 导入
- 删除 composable 解构块（volumetricCloudsEnabled/initStage/updateUniforms/syncControls/degrade/cleanup）
- 删除 effectGuiControls 中的 volumetricClouds toggle
- 删除 syncExternalControls 中的 syncCloudControls 调用
- 删除 handleEffectGuiChange 中的 volumetricClouds 映射
- 删除 initCinematicEffects 中的 initVolumetricCloudsStage 调用
- 删除 degradeEffectsAfterRenderError 中的 degradeCloud 调用
- 删除 bindFrameUpdates 中的云 uniform 更新 if 块
- 删除 cleanupEffects 中的 cleanupCloud 调用

### 3. useCesiumToolModules.js（11 处清理）
- 删除两个 cloud/ import 语句
- 删除 advancedEffectControls 中的 `volumetricClouds: false`
- 删除 cloudParams ref 和 clouds 注入
- 从 status 三元表达式中移除 `|| volumetricClouds`
- 删除 volumetricClouds toggle 控件
- 删除 cloudQuality select + createCloudControls 展开
- 删除 isCloudControlId 处理块（含 normalizeCloudParams 逻辑）
- 更新注释移除 volumetricClouds
- 从 return 中移除 cloudParams

### 4. CesiumToolPanel.vue（2 处清理）
- 删除 `Cloud` 图标导入
- 删除 `clouds: Cloud` 图标映射

## 测试方案
`npm run build` 无报错 ✅

## 修改的文件路径
- `frontend/src/components/Cesium/cloud/`（删除整个目录，4 个文件）
- `frontend/src/components/Cesium/CesiumAdvancedEffects.vue`（修改）
- `frontend/src/components/Cesium/composables/useCesiumToolModules.js`（修改）
- `frontend/src/components/Cesium/CesiumToolPanel.vue`（修改）
