# 2026-06-26 近地大气自动关闭 + 体积云模块拆分

**日期和时间**：2026-06-26 18:30

---

## 修改内容

### 功能一：近地自动关闭大气+光照

- 新增 `useAtmosphereAutoClose.js` composable：监听相机高度（对应 URL z 参数），低于 80000m 阈值时自动关闭地面大气（`globe.showGroundAtmosphere`）、天空大气（`scene.skyAtmosphere.show`）和日照（`globe.enableLighting`）
- 自动关闭前保存 `enableLighting` 原始值，恢复时精确还原（不硬编码 true）
- 在控制中心「大气·光照·天空」模块顶部新增「近地自动关大气+光照」开关按钮（默认开启）
- `CesiumContainer.vue` 中接入 composable 生命周期：cesiumReady 时启动监听、watch 同步开关状态、unmount 时清理
- `applyBaseAtmosphereParams` 增加自动关闭状态保护：当大气被自动关闭时，跳过 `enableLighting` 和 `showGroundAtmosphere` 赋值，避免用户调整其他参数时意外恢复

### 功能二：体积云独立面板 + 模块拆分

- 体积云从「大气·光照·天空」面板中拆出，升级为控制中心独立一级模块「体积云」，与大气面板同级
- 新增 `useVolumetricClouds.js`：从 `useCesiumToolModules.js` 中拆分体积云相关逻辑，独立管理云参数状态、质量预设、UI 控件定义、参数归一化
- `useCesiumToolModules.js` 改为从 `useVolumetricClouds.js` 导入 `QUALITY_PRESETS`、`createCloudControls`、`isCloudControlId`、`normalizeCloudParams`，删除本地重复定义
- 体积云控件变更路由从 `moduleId === 'atmosphere'` 迁移到 `moduleId === 'cloud'`
- 大气面板状态计算移除 `volumetricClouds` 引用
- 移除 `useCesiumToolModules.js` 中不再使用的 `toFiniteNumber` 工具函数

---

## 修改原因

Cesium 默认始终显示大气效果（地面大气光晕 + 天空大气散射），当日照（`enableLighting`）开启时，用户放大到近地面（如查看建筑、地形细节）时大气光晕会产生视觉干扰，影响近地面场景的清晰度。需要一个自动化机制：放大到阈值以下时自动关闭大气，拉远后自动恢复，同时在控制中心提供手动开关让用户可以覆盖自动行为。

---

## 影响范围

- **Cesium 场景大气+光照系统**：`globe.enableLighting`、`globe.showGroundAtmosphere`、`scene.skyAtmosphere.show`
- **控制中心面板**：「大气·光照·天空」模块新增开关控件、体积云独立为一级模块
- **参数同步链路**：`useCesiumToolModules` ↔ `CesiumContainer` ↔ `useAtmosphereAutoClose`

---

## 优化解决方案

### 事件逻辑链条分析

1. **核心症状**：近地面大气光晕干扰视觉，但远景需要大气效果增强空间感
2. **根本原因**：Cesium 没有内置的"近地自动关闭大气"机制，`showGroundAtmosphere` 是全局布尔值
3. **受影响模块**：`CesiumContainer.vue`（场景参数应用）、`useCesiumToolModules.js`（UI 控件定义）

### 解决方案

1. **高度阈值监听**：通过 `scene.postRender` 事件监听相机高度（`Cartographic.fromCartesian(camera.positionWC).height`），阈值 800m
2. **自动切换**：低于阈值时设置 `globe.showGroundAtmosphere = false` + `scene.skyAtmosphere.show = false`；高于阈值时恢复为 `true`
3. **手动覆盖**：控制中心开关 `atmosphereAutoCloseEnabled` 控制自动关闭功能的启用/禁用；禁用时立即恢复大气显示
4. **冲突保护**：`applyBaseAtmosphereParams` 检查 `atmosphereAutoClosed` 状态，避免其他参数变更时覆盖自动关闭

---

## 测试方案

1. 打开 3D 场景，确认大气+日照默认开启（晨昏半球 + 地面大气光晕 + 日照贴图）
2. 放大到高度 < 80000m，确认大气自动关闭、日照自动关闭（晨昏线消失）
3. 拉远到高度 > 80000m，确认大气+日照自动恢复
4. 在控制中心关闭「近地自动关大气+光照」开关，确认大气和日照始终显示（无论高度）
5. 在近地面时调整其他大气参数（如雾效、太阳），确认大气和光照不会被意外恢复
6. 重新开启「近地自动关大气+光照」，确认自动行为恢复
7. 确认 URL 中 z 参数与实际阈值一致（z < 80000 触发关闭）

---

## 修改的文件路径

- `frontend/src/components/Cesium/composables/useAtmosphereAutoClose.js`（新增）
- `frontend/src/components/Cesium/composables/useVolumetricClouds.js`（新增，从 useCesiumToolModules 拆分）
- `frontend/src/components/Cesium/composables/useCesiumToolModules.js`（新增 atmosphereAutoClose 控件 + 体积云拆为独立一级模块 + 移除本地云代码改为导入）
- `frontend/src/components/Cesium/CesiumContainer.vue`（接入 atmosphereAutoClose composable）
- `frontend/README.md`（目录结构树更新）
