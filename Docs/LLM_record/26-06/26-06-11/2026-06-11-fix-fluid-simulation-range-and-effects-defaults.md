# 2026-06-11 流体模拟范围修复 + 特效默认关闭

**日期**：2026-06-11 17:30

---

## 一、事件逻辑链条分析

### 核心症状
1. 水体流体模拟的扩散范围与用户预期不符
2. Cesium 高级特效（雾/HBAO/移轴/大气）默认全部开启，影响初始加载性能

### 根本原因
**流体模拟范围问题**：UI 参数（threshold/blend/lightStrength）仅写入 `customParam`（渲染参数），未传递到 `fluidParam`（模拟参数）。流体扩散行为始终使用硬编码默认值，用户调节滑块对模拟零影响。

**特效默认值问题**：`fogEnabled`/`tiltShiftEnabled`/`atmosphereEnabled` 初始值为 `true`，且 `initCinematicEffects` 无条件调用 `applyAtmosphereEnhancement`。

### 受影响模块
- `fluidRuntime.js` — 流体渲染引擎（8 个 bug）
- `FluidSimulationPanel.vue` — 流体面板参数映射
- `CesiumAdvancedEffects.vue` — 特效默认值
- `CesiumContainer.vue` — 特效控制默认值

---

## 二、修改内容

### fluidRuntime.js（8 项修复）

| # | 问题 | 修复 |
|---|------|------|
| 1 | UI 参数不控制 `fluidParam` | `fluidParam` 支持外部传入，UI 参数同步写入 `fluidParam` |
| 2 | `terrainColor()` UV 错误 | `p.xz` → `p.xz + 0.5`，修正 [-0.5,0.5] → [0,1] |
| 3 | `frustum.far` 裁剪高耸地形 | 动态计算 `max(dimensions.z*2, heightRange + dimensions.z)` |
| 4 | `waterSize` uniform 未使用 | 移除声明和 uniform 绑定 |
| 5 | `terrainColor` 采样错误源 | 改采样 `iChannel0`（模拟输出）而非 `heightMap`（原始高度） |
| 6 | 初始水深硬编码 | 改用 `fluidParam.w` 控制，默认 0.03（3%） |
| 7 | `getHeight()` 使用 `texture()` | 改用 `texelFetch()` 避免插值伪影 |
| 8 | Ray March 步长 0.1 过小 | 提升到 0.3，80 次迭代足够穿越整个 box |

### FluidSimulationPanel.vue（参数映射）

- `applyFluidParams()` 同时更新 `customParam`（渲染）和 `fluidParam`（模拟）
- 构造 `FluidRenderer` 时传入 `fluidParams` 初始值
- UI → 模拟映射：threshold→minTotalFlow, blend→strength, lightStrength→attenuation

### CesiumAdvancedEffects.vue + CesiumContainer.vue

- 四个特效 ref 默认值全部改为 `false`
- `advancedEffectControls` 默认值全部改为 `false`
- `initCinematicEffects` 中 `applyAtmosphereEnhancement` 改为条件调用

---

## 三、性能指标

- 特效默认关闭：首屏减少 4 个 PostProcessStage 的初始化开销
- Ray March 步长提升 3 倍：渲染收敛更快，减少视觉伪影

---

## 四、测试方案

1. **流体模拟范围**：调节 threshold/blend/lightStrength 滑块，验证流体扩散范围实时变化
2. **流体默认行为**：不调参直接创建流体，验证 3% 初始水深正确显示
3. **高耸地形**：在珠峰附近创建流体，验证 frustum 不裁剪
4. **特效默认关闭**：刷新页面后，所有特效开关应为关闭状态
5. **手动开启特效**：逐个开启 fog/hbao/tiltShift/atmosphere，验证功能正常

---

## 五、修改的文件路径

```
frontend/src/components/Cesium/FluidSimulation/fluidRuntime.js
frontend/src/components/Cesium/FluidSimulation/FluidSimulationPanel.vue
frontend/src/components/Cesium/CesiumAdvancedEffects.vue
frontend/src/components/Cesium/CesiumContainer.vue
```
