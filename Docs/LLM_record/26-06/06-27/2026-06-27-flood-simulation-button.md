# 2026-06-27 洪水模拟功能开发

## 日期和时间
2026-06-27 14:45

## 修改内容
在水体流体模块（FluidSimulation）中新增洪水模拟功能，通过控制中心统一接入：
- 在 `useCesiumToolModules.js` 控制中心新增「洪水模拟」动作按钮
- 在控制中心新增「洪水速度」滑块控件，**速度根据水位值域动态计算**
- `FluidSimulationPanel.vue` 提供核心动画逻辑，通过 `defineExpose` 暴露给控制中心调用
- 洪水模拟运行时按钮高亮显示为「停止洪水」，可随时点击停止
- 水位达到最大值后自动停止并提示用户

## 修改原因
用户需要可视化洪水淹没过程，观察水位从低到高逐渐覆盖地形的动态效果，用于洪水风险评估和地形分析场景。

## 影响范围
- `useCesiumToolModules.js` — 控制中心：新增 fluid 模块的 `floodSim` 动作、`floodSpeed` 控件、`floodSimActive` 状态
- `FluidSimulationPanel.vue` — 流体面板：新增洪水动画核心逻辑，通过 `defineExpose` 暴露接口

## 优化解决方案

### 问题分析
水体流体模块已有水位（Water Level）滑块，但需要手动拖动。洪水模拟需要自动、连续地改变水位值。UI 控件应通过 `useCesiumToolModules.js` 集中管理。

### 速度动态计算
- **默认速度** = 水位值域 ÷ 10，即默认 10s 完成洪水模拟
- **滑块范围**：值域÷100（100s 完成）→ 值域÷1（1s 完成）
- **显示格式**：`12.5 m/s（10.0s）`，同时展示速度和预计完成时间
- 面板捕捉高度图后自动计算默认速度，通过 state-change 同步到控制中心

### 架构设计
- **控制中心层** (`useCesiumToolModules.js`)：
  - `fluidState.floodSimActive` — 洪水运行状态
  - `fluidParams.floodSpeed` — 洪水速度参数（由面板自动计算同步）
  - `handleFluidStateChange` 同步面板计算的默认速度
- **面板层** (`FluidSimulationPanel.vue`)：
  - 水位值域确定时自动计算 `floodSimSpeed = rangeSpan / 10`
  - `requestAnimationFrame` 驱动帧级精度水位递增
  - 通过 `defineExpose` 暴露 5 个方法

### 核心逻辑
```
默认速度 = (waterLevelMax - waterLevelMin) / 10
每帧水位增量 = floodSimSpeed × deltaTime（秒）
waterLevel += 增量
当 waterLevel ≥ maxHeight → 停止动画
```

## 性能指标
- 动画使用 `requestAnimationFrame`，与浏览器刷新率同步，无额外渲染开销
- 水位变化通过已有的 `applyWaterLevelParam()` watch 链路同步到 GPU 渲染器

## 测试方案
1. 点击「捕捉高度图」选点创建流体
2. 验证洪水速度滑块默认值 = 值域/10，显示预计完成时间
3. 在控制中心点击「洪水模拟」按钮，观察水位自动上涨
4. 调整「洪水速度」滑块，验证速度和完成时间变化
5. 点击「停止洪水」按钮，验证动画停止
6. 水位到达最大值后验证自动停止和提示信息
7. 点击「清除」按钮验证洪水动画同步停止

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumToolModules.js`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\FluidSimulation\FluidSimulationPanel.vue`
