# 2026-06-27 体积云代码模块化提取

## 日期和时间
2026-06-27 10:00

## 修改内容
将 Cesium 主场景体积云的所有代码从分散的两个文件中提取到独立的 `cloud/` 子文件夹，形成 4 个职责单一的模块。

## 修改原因
体积云代码此前分散在 `CesiumAdvancedEffects.vue`（~450 行 GLSL 内联 + Stage 生命周期）和 `useCesiumToolModules.js`（预设 + 控件 + 归一化）中，耦合度高、难以独立复用和测试。提取为独立模块后，便于后续功能扩展和统一维护。

## 影响范围
- Cesium 高级特效系统（CesiumAdvancedEffects）
- 工具面板控件系统（useCesiumToolModules）
- 体积云渲染链路（PostProcessStage → GLSL → Uniform 更新）

## 优化解决方案

### 事件逻辑链条分析

**核心症状**：体积云代码职责混杂，GLSL 着色器内联在 Vue 组件中（450 行），参数管理与 UI 控件描述混在同一个 composable 中。

**根本原因**：历史迭代中体积云功能逐步叠加，未做模块化拆分。

**受影响模块**：
- `CesiumAdvancedEffects.vue` — 体积云 Stage 初始化、每帧 Uniform 更新、降级、清理
- `useCesiumToolModules.js` — 质量预设、参数定义、UI 控件描述、参数归一化

**解决方案**：按职责拆分为 4 个文件，通过 composable 模式封装生命周期。

### 新建文件

| 文件 | 职责 | 行数 |
|------|------|------|
| `cloud/cloudShader.js` | GLSL Fragment Shader 常量 | ~450 |
| `cloud/cloudPresets.js` | 质量预设 + 默认参数 + normalizeCloudParams + normalizeCloudControls | ~140 |
| `cloud/cloudControls.js` | createCloudControls（UI 描述）+ isCloudControlId（ID 判断） | ~180 |
| `cloud/useVolumetricCloud.js` | Vue composable：initStage / updateUniforms / syncControls / degrade / cleanup | ~230 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `useCesiumToolModules.js` | 删除 QUALITY_PRESETS、cloudParams、createCloudControls、isCloudControlId、normalizeCloudParams、toFiniteNumber；改为从 cloud/ 导入 |
| `CesiumAdvancedEffects.vue` | 删除 VOLUMETRIC_CLOUDS_FRAGMENT_SHADER（450 行）、6 个云函数、2 个云变量；改为调用 useVolumetricCloud composable |

### 数据流（保持不变）
```
useCesiumToolModules (cloudParams → advancedEffectControls.clouds)
    ↓
CesiumContainer.vue (controls prop 透传)
    ↓
CesiumAdvancedEffects.vue (syncCloudControls → composable 内部 cloudControls)
    ↓
GPU PostProcessStage (GLSL 实时渲染)
```

## 性能指标
- 无运行时性能变化（纯代码重组，渲染逻辑完全保留）
- 构建产物大小不变

## 测试方案
1. 打开 Cesium 场景 → 工具面板 → 大气模块 → 开启"云层"开关 → 确认体积云渲染正常
2. 拖动云量/密度/阴影等滑块 → 确认实时响应
3. 切换 low/medium/high/ultra 质量 → 确认 stepCount 和 maxDistance 自动更新
4. `npm run build` 无报错 ✅

## 修改的文件路径
- `frontend/src/components/Cesium/cloud/cloudShader.js`（新建）
- `frontend/src/components/Cesium/cloud/cloudPresets.js`（新建）
- `frontend/src/components/Cesium/cloud/cloudControls.js`（新建）
- `frontend/src/components/Cesium/cloud/useVolumetricCloud.js`（新建）
- `frontend/src/components/Cesium/composables/useCesiumToolModules.js`（修改）
- `frontend/src/components/Cesium/CesiumAdvancedEffects.vue`（修改）
