# Cesium 三维特效架构说明

日期：2026-07-21

适用范围：`frontend/src/components/Cesium/` 下的三维特效相关模块，包括 `Cloud/`（体积云）、`Wind2D.js` + `composables/useCesiumWind.js`（风场粒子）、`ShallowWater/`（热带浅水叠加）、`terrain/`（地形提供者）、`composables/cesiumAtmosphere.js` + `composables/useCesiumBeautify.js` + `CesiumAdvancedEffects.vue`（大气与后处理），以及集成入口 `composables/useCesiumToolModules.js` / `CesiumToolPanel.vue` / `CesiumContainer.vue`。

本文是长期参考文档，说明 WebGIS 3.0 中"三维特效"功能的实现原理、文件组织、GPU 渲染管线与参数集成机制，供后续维护、调参与算法升级时对照。洪水淹没模拟（`FluidSimulation/`）已有独立文档 [`cesium-fluid-flood-simulation.md`](./cesium-fluid-flood-simulation.md)，本文只在 §10 说明它与本组特效的关系，不再展开。

> **⚠️ 准确性声明（务必先读）**
>
> **本文以当前代码库（frontend README 版本记录截至 V3.3.18 / 2026-07-21）的真实实现为准。** 项目 README 的"版本记录"中描述的部分三维特效已在后续版本中被删除或替换，**当前代码中并不存在**，包括但不限于：
>
> - **TAAU 时序抗锯齿 / 16x 时序上采样**（README V3.3.9 提到的 `useCesiumTemporalUpsampling.js`）——已不存在；
> - **BSM Shadow TAA 时序抗锯齿**（README V3.3.9 提到的 `shadowResolveShaders.js`）——已不存在；
> - **大气散射 LUT 纹理集成**（README V3.3.9 提到的 `atmosphereLutResources.js` 及 `atmosphere/` 目录 14 个文件）——已在 V3.3.10 整体删除；
> - **wind-core 风场 TS 模块**（README V3.3.14 提到的 10 个 TS 源文件、3 个 ComputeCommand + DrawCommand + Runge-Kutta 二阶积分、`useWindLayer` / `windLayerController` / `windSampleData`、`cesium-wind-layer` 依赖）——已被移除，仅残留**空目录** `Wind/wind-core/`（内含一个同样为空的 `shaders/` 子目录，无任何文件）。
>
> 上述功能的现状详见 §2「README 描述与代码现状差异」。下文凡描述"实现"之处，均指当前真实存在的代码；凡涉及已删除功能，都会显式标注。

## 1. 功能定位

"三维特效"是 Cesium 三维视图下的一组**视觉增强模块**，由统一的工具面板（`CesiumToolPanel.vue`）开关与调参。当前真实存在的特效分为五类：

1. **体积云**（`Cloud/`）：基于 `PostProcessStage` 的屏幕空间 ray marching 体积云，Frostbite 风格的密度采样 + 光照积分，支持四档质量预设。
2. **风场粒子**（`Wind2D.js`）：基于 WebGL2 GPGPU 的粒子风场可视化，`DrawCommand` 乒乓缓冲 + **Euler 积分**推进粒子，按风速着色绘制为箭头/线段。
3. **热带浅水**（`ShallowWater/`）：一套**独立的 Three.js 渲染场景**，以透明叠加层形式盖在 Cesium canvas 之上（含水面折射/反射、焦散、天空、云穹、闪电），属于演示性场景而非 Cesium 原生特效。
4. **地形提供者**（`terrain/`）：天地图高度图地形、ArcGIS 地形增强包装器，以及一个 POI 矢量瓦片图层（`GeoWTFS.js`，名为 WFS 实为 POI 注记）。
5. **大气与后处理**（`composables/cesiumAtmosphere.js`、`composables/useCesiumBeautify.js`、`CesiumAdvancedEffects.vue`）：调用 **Cesium 原生** `SkyAtmosphere` / 雾 / Bloom 并调参，外加自定义的高度雾、HBAO、移轴模糊后处理级。

**重要边界**：除体积云与洪水模拟外，本组特效均为**视觉近似**而非物理求解器。风场粒子是运动学平流（无动力学方程），热带浅水是离线渲染场景（不求解浅水方程），大气效果复用 Cesium 内置模型（无自研散射 LUT）。各模块的精度边界见 §11。

## 2. README 描述与代码现状差异

本节如实列出 README"版本记录"中提及、但**经逐一核实当前代码已不存在**的内容，避免按 README 误判现有实现。核实方式为对 `frontend/src` 全量文件名检索与关键字检索。

| README 描述 | 关联版本 | 当前代码现状（已核实） |
|------|------|------|
| TAAU 16x 时序上采样、方差裁剪、速度重投影、STBN 蓝噪声（`useCesiumTemporalUpsampling.js`） | V3.3.9 | **不存在**。全库无此文件，无任何 `TemporalUpsampling` 引用。当前抗锯齿仅有 **FXAA**（见 §9.2 `useCesiumBeautify.js`）。 |
| BSM Shadow TAA 时序抗锯齿（`shadowResolveShaders.js`） | V3.3.9 | **不存在**。全库无此文件，无 `shadowResolve` 引用。 |
| 大气散射 LUT 纹理集成（`atmosphereLutResources.js`、大气透视合成、天空辐照度计算） | V3.3.9 | **不存在**。`atmosphereLutResources.js` 与 `atmosphere/` 目录（14 文件）已在 V3.3.10 删除，无 `atmosphereLut` 引用。当前大气为 **Cesium 原生 `SkyAtmosphere`** 调参（见 §9.1）。 |
| wind-core 模块：10 个核心 TS 源文件、GPU 计算管线（3 ComputeCommand）+ 渲染管线（DrawCommand）+ Runge-Kutta 二阶积分 | V3.3.14 | **不存在**。`Wind/wind-core/` 为**空目录**（仅含空的 `shaders/` 子目录，零文件）。无 `Runge`/`RungeKutta`/`RK2` 引用。当前风场为 `Wind2D.js`（**DrawCommand GPGPU + Euler 积分**，见 §6）。 |
| `useWindLayer` Composable、`windLayerController` lil-gui 模块、`windSampleData` 示例数据、`cesium-wind-layer` 依赖 | V3.3.14 | **不存在**。三者文件均无；`frontend/package.json` 无 `cesium-wind-layer` 依赖。当前风场入口为 `composables/useCesiumWind.js`（包装 `Wind2D`，内置模拟数据生成器）。 |
| 旧 `Clouds/` 目录（12 文件） | V3.3.10 删除 | **不存在**。已被 TypeScript 重写的 `Cloud/` 模块取代（见 §5）。 |

**保留至今的历史结论**：README V3.3.10「删除 atmosphere 目录 + 旧 Clouds/ 目录、新增 `useCesiumBeautify.js` / `ShallowWater/` / 大气高度阈值」、V3.3.11「`ArcGISTerrainProvider` 增强包装器」、V3.3.12「体积云独立模块 `Cloud/`（TypeScript 重构）」均与当前代码一致。

> 一句话总结：**当前没有 TAAU、没有 BSM Shadow TAA、没有自研大气散射 LUT、没有 wind-core/ComputeCommand 风场**；抗锯齿=FXAA，大气=Cesium 原生 SkyAtmosphere，风场=Wind2D（DrawCommand + Euler）。

## 3. 文件结构

下表仅列出**当前真实存在**且与三维特效直接相关的文件（行数为近似值）。

| 文件 | 职责 |
|------|------|
| `Cloud/CloudManager.ts` | 体积云核心管理类：创建/销毁 `PostProcessStage`、加载纹理资产、桥接参数到 uniform（约 470 行） |
| `Cloud/CloudUniforms.ts` | 体积云 uniform 默认值、类型与 `createStageUniforms` 函数式回调映射 |
| `Cloud/CloudPresets.ts` | 四档质量预设（low/medium/high/ultra）：迭代次数、步长、散射阶数、二次 march 配置 |
| `Cloud/cloudIntegration.ts` | 集成桥接：`setupCloudIntegration` 将 `cloudParams`/`atmosphereParams` watcher 接到 `CloudManager`；lil-gui 参数定义 |
| `Cloud/composables/useVolumetricCloud.ts` | Vue 3 Composable 形式的另一套桥接（自动初始化/销毁、参数同步） |
| `Cloud/index.ts` | 模块统一导出 |
| `Cloud/shaders/cloudFragment.glsl` | 体积云片元着色器：ray marching 主循环 + 密度/光照/合成（约 635 行） |
| `Cloud/shaders/cloudVertex.glsl` / `noise.glsl` / `utils.glsl` | 顶点着色器、噪声库、工具函数（注：fragment 中已内联 Perlin/FBM，这些为辅助） |
| `Cloud/textures/` | `shape.bin`(128³)、`shape_detail.bin`(32³)、`local_weather.png`、`turbulence.png` 噪声/天气纹理 |
| `Wind2D.js` | 风场粒子主类：WebGL2 GPGPU 乒乓更新 + DrawCommand 箭头绘制（约 1132 行） |
| `composables/useCesiumWind.js` | 风场 Composable：包装 `Wind2D`，内置 5 层模拟风场数据生成器 |
| `ShallowWater/ShallowWaterOverlay.vue` | 热带浅水叠加层组件（绝对定位、`z-index:2` 盖在 Cesium canvas 上） |
| `ShallowWater/composables/useShallowWater.js` | Three.js 场景生命周期：水面/海床/岩石/天空/云穹/闪电/折射反射 RT（约 670 行） |
| `ShallowWater/shaders/*.glsl.js` | `waterSurface` / `caustics` / `clouds` 三组 GLSL（以 JS 字符串导出） |
| `ShallowWater/utils/textures.js` | 程序化生成法线图、沙地纹理、云噪声纹理 |
| `terrain/GeoTerrainProvider.js` | 天地图高度图地形提供者（`CustomHeightmapTerrainProvider` 子类，pako 解压） |
| `terrain/ArcGISTerrainProvider.js` | ArcGIS 地形增强包装器（补 `availability` / `getTileDataAvailable`） |
| `terrain/GeoWTFS.js` | **POI 矢量瓦片图层**（GEOPOI protobuf 解析，名为 WFS 实为注记，非地形） |
| `terrain/util.js` | `loadProto` protobuf 定义加载辅助（4 行） |
| `composables/cesiumAtmosphere.js` | 配置 Cesium 原生大气/雾/光照/Bloom，并提供状态快照与恢复 |
| `composables/useCesiumBeautify.js` | 场景美化：HDR + PBR 色调映射 + FXAA + 定向光 + 天空微调 + 分辨率缩放 |
| `CesiumAdvancedEffects.vue` | "Cinematic FX" 面板：高度雾 / HBAO / 移轴 / 大气+Bloom 四个后处理开关 + FPS 图表 |
| `composables/useCesiumToolModules.js` | 特效参数总线：集中管理各模块响应式参数与控件定义（约 1078 行） |
| `CesiumToolPanel.vue` | 工具面板 UI：模块卡片 + 控件渲染（约 1777 行） |
| `CesiumContainer.vue` | 容器组件：装配上述所有模块、watcher 与清理逻辑 |

## 4. 集成与参数总线

三维特效不是孤立组件，而是通过一条统一的参数链路装配进 Cesium 视图：

```
CesiumToolPanel.vue（UI 卡片/控件）
        │  handleToolControlChange(moduleId, controlId, value)
        ▼
useCesiumToolModules.js（参数总线，集中持有各模块 ref）
        │  各模块 ref：advancedEffectControls / baseAtmosphereParams /
        │             atmosphereParams / cloudParams / fluidParams /
        │             playerParams / shallowWaterVisible+shallowWaterParams
        ▼
CesiumContainer.vue（watcher → 调用对应模块 API）
        ├─ setupCloudIntegration({ viewer, cloudParams, atmosphereParams })  → CloudManager
        ├─ applyBaseAtmosphereParams / applyAtmosphereParams                 → cesiumAtmosphere.js
        ├─ useCesiumWind(...)                                                → Wind2D
        ├─ <CesiumAdvancedEffects :controls="advancedEffectControls">        → 后处理级
        ├─ <ShallowWaterOverlay v-bind="shallowWaterParams">                 → Three.js 场景
        └─ <FluidSimulationPanel>                                            → 洪水模拟（独立文档）
```

`useCesiumToolModules.js` 的关键参数对象（默认值，见源码 19–130 行）：

- `advancedEffectControls`：`{ fog, hbao, tiltShift, atmosphere }`，**全部默认关闭**。
- `baseAtmosphereParams`：晨昏半球相关（`enableLighting` / `showGroundAtmosphere` / 太阳/月亮/星空盒显示 / 大气强度与色相偏移 / 雾参数）。
- `atmosphereParams`：Tellux 风格日夜/月光/星空参数（`dayNightEnabled` / `moonLightIntensity` / `ambientIntensity` / `starsIntensity`）。
- `cloudParams`：体积云开关与全部散射/密度/雾/几何参数（`cloudsEnabled` 默认 `false`）。
- `shallowWaterVisible` + `shallowWaterParams`：浅水场景开关与太阳角度/清澈度/焦散/浪高/反射/云量/闪电参数。

`CesiumContainer.vue` 中体积云通过 `setupCloudIntegration` 桥接（源码 595–601 行），大气通过 `applyBaseAtmosphereParams` / `applyAtmosphereParams` 双函数管理（注释明确说明二者分工以避免"双写冲突"）。

## 5. 体积云（Cloud/）：PostProcessStage Ray Marching

### 5.1 总体方案

体积云是一个 **全屏后处理级**（`Cesium.PostProcessStage`），片元着色器 `cloudFragment.glsl`（约 635 行）实现完整的 Frostbite 风格体积云渲染。`CloudManager.init()` 先创建 1×1 fallback 纹理（保证 uniform setter 永不收到 null），再创建并 `add` 到 `scene.postProcessStages`，初始 `enabled=false`，待纹理异步加载完成后按用户设置启用。

由于 `PostProcessStage` 不自动注入 `czm_cameraPositionWC` 等内置 uniform，`CloudManager.buildStageUniforms()` 手动以函数式回调传入相机位置、逆投影/逆视图矩阵、太阳方向、椭球半径等（每帧自动同步，无需手动 update）。

### 5.2 渲染流程（cloudFragment.glsl `main`）

1. **射线重建**：从屏幕 `v_textureCoordinates` 还原 NDC，经 `u_inverseProjection` / `u_inverseView` 重建世界空间射线方向。
2. **云层壳体求交**：`getCloudLayerIntersections` 把云层当作 `ellipsoidRadii + [minHeight, maxHeight]` 的**球壳**，按相机在云底之下/云顶之上/云层之中三种情况求 ray-sphere 交点，确定 march 起止距离。
3. **深度裁剪**：读取 `depthTexture`，将云远端点投影到 clip space 与场景深度比较（`isCloudOccluded`，针对 Cesium 反向对数深度做了处理），云被地形/几何完全遮挡时直接跳过。
4. **主 Ray March**（`marchClouds`，最多 512 步）：自适应步长——云内缩小步长（`*0.8`）、空区域按 `perspectiveStepScale` 递增、云层外大步长跳过；透射率低于 `minTransmittance` 早停；含基于屏幕坐标的 jitter 抖动。
5. **合成**：`applyHaze` 叠加低空解析雾，乘昼夜因子后以 alpha blend 输出。

### 5.3 密度模型（sampleCloudDensity）

密度 = 天气覆盖率 × 高度密度剖面（`cloudDensityProfile`，含底部增强、顶部侵蚀、中部隆起），再经：

- **Shape 噪声**（低频形状，`u_shapeTexture` 128³）侵蚀基础密度；
- **Shape Detail**（高频细节，`u_shapeDetailTexture` 32³，按高度混合）；
- **Turbulence 域扭曲**（`u_turbulenceTexture` 偏移采样位置）。

3D 体积纹理以 2D 纹理（`size × size²`）存储，用 `sample3DAs2D` 重映射采样。**所有纹理加载失败时自动降级为内联 Perlin/FBM 程序化噪声**（着色器内 `perlinNoise3D` / `fbm3D`），保证无资产也能出云。

### 5.4 光照模型（computeLighting）

- 向太阳方向做**二次 ray march** 累积光学厚度（`maxIterationCountToSun`，步长倍增）；
- **双 Henyey-Greenstein 相位函数**混合（前向 `g1` + 后向 `g2`）；
- **多重散射近似**（`approximateMultipleScattering`，按 `multiScatteringOctaves` 阶数迭代）；
- 天空光梯度 + 地面反弹光 + **Powder 效应**（`1 - powderScale·exp(-extinction·150)`）；
- 夜间光照：按 `dayLightFactor` 混入月光 + 环境光（`nightColor`）。

主循环用 **Frostbite 能量守恒积分**：`scatteringIntegral = (radiance - radiance·transmittance) / extinction`，逐段累积辐射度并衰减透射率。

### 5.5 质量预设（CloudPresets.ts）

| 预设 | 主迭代 | 最小/最大步长 | 多重散射阶 | 向日 march | shapeDetail / turbulence |
|------|------|------|------|------|------|
| low | 64 | 200 / 2000 | 2 | 0 | 关 / 关 |
| medium（默认） | 128 | 100 / 1500 | 4 | 1 | 开 / 关 |
| high | 256 | 50 / 1000 | 6 | 2 | 开 / 开 |
| ultra | 512 | 20 / 800 | 8 | 3 | 开 / 开 |

### 5.6 参数桥接

`cloudIntegration.ts` 的 `setupCloudIntegration` 保证**单实例**：`cloudsEnabled` 首次为 true 时才 `init()`，之后参数变化只 `updateUniforms`。它把 `cloudParams.cloudXxx` 映射到 `CloudUniformValues.xxx`（如 `cloudCoverage→coverage`、`cloudBottom→minHeight`、`cloudAnisotropy1→scatterAnisotropy1`），并从 `atmosphereParams` 同步夜间光照（`moonLightIntensity→nightMoonIntensity` 等）。`useVolumetricCloud.ts` 是等价的 Composable 形态桥接。

## 6. 风场粒子（Wind2D.js）：DrawCommand GPGPU + Euler 积分

### 6.1 总体方案

`Wind2D` 是一个加入 `scene.primitives` 的自定义图元，要求 **WebGL2**。它用 **GPGPU 乒乓缓冲**更新粒子状态，再用 `DrawCommand` 把粒子绘制为按风速着色的箭头/线段。注意：它使用的是 `Cesium.DrawCommand`（渲染到 framebuffer 做 GPGPU），**不是 ComputeCommand**——README 中"wind-core 的 3 个 ComputeCommand + Runge-Kutta 二阶积分"模块已不存在（见 §2），当前实现是更轻量的 **Euler 积分**。

### 6.2 数据组织：风场图集纹理

`loadData(apiData)` 接收多层网格风场（`altitude` / `sizeMesh` / `count` / `hspeed` / `hdir` / `vspeed`），把各层水平风速按风向分解为 East/North 分量并连同垂直速度打包进一张 **RGBA16F 图集纹理**（`windAtlas`，宽 = 最大网格边长，高 = 边长 × 层数），`.a` 作有效标志。同时由中心经纬度 + 网格尺度换算出 `bounds`（经纬高范围）与 ENU `modelMatrix`。

### 6.3 粒子状态：位置 + 速度双纹理乒乓

`_rebuildParticleResources` 创建两套（ping/pong）：

- **位置纹理**（`particlePositionTextures`，RGBA FLOAT，NEAREST 采样）：`.xyz` = 归一化粒子位置 `[0,1]`，`.w` 打包"年龄 + 归一化速度"；
- **速度纹理**（`velocityTextures`）：`.xyz` = 采样到的风矢量；
- 两个 `Framebuffer` 各挂 2 个 color attachment（MRT，`drawBuffers([COLOR_ATTACHMENT0, COLOR_ATTACHMENT1])`）。

粒子数量由 `particleDensity × 数据点数` 决定，纹理边长取 2 的幂（`computeParticleTextureSize`，16~2048）。

### 6.4 更新 pass（_buildUpdateProgram，Euler 积分）

更新用一个全屏四边形 `DrawCommand` 渲染到写侧 framebuffer，片元着色器：

```glsl
age += decaySpeed;
if (age > 1.0) { age = 0.0; pos = randomPos(...); }   // 寿命到则随机重生
vec4 sampled = sampleWind(pos);                        // 按高度在层间插值采样风
vec3 nextPos = pos + wind * speedFactor * 0.001;       // ★ Euler 积分推进
pos = vec3(wrap01(nextPos.x), wrap01(nextPos.y), wrap01(nextPos.z));  // 环绕
packed = floor(normalizedSpeed * 255.0) + age;         // 速度+年龄打包进 .w
```

`sampleWind` 按粒子高度 `z` 在相邻两层间线性插值，并受 `visibleLayerMin/Max` 层范围裁剪；采样无效（`.a<0.5`）则粒子重生。这就是**一阶显式 Euler 平流**（位置 += 速度 × 步长），无 RK2、无动力学。

### 6.5 绘制 pass（_buildDrawProgram）

绘制 `DrawCommand` 用 `LINES` 图元，顶点缓冲是 `0..N` 的粒子索引（每粒子 6 顶点 = 2 条线）。顶点着色器：

- 由 `particleIndex/6` 反查粒子 UV，读位置/速度纹理；
- 速度超出 `speedMin/Max` 裁剪范围则 `v_culled=1`（顶点置零）；
- 把归一化位置经 `bounds` 还原为经纬高 → ECEF → 以中心 ENU 矩阵转到本地坐标；
- 沿风向构造箭头几何（`tip = pos + forward·arrowLength`，`tail = pos - forward·trailLength`，加两个箭头翼点）。

片元着色器按归一化速度 `speedToColor`（蓝→青→绿→黄→红五段色带）着色，alpha 随年龄衰减（`(1-age)·alphaFactor`）。

### 6.6 每帧驱动与封装

`update(frameState)`：读旧状态 → 更新命令写新 framebuffer → 交换 `particleState` → 把绘制命令 push 进 `frameState.commandList`。`useCesiumWind.js` 负责创建/销毁 `Wind2D`、`flyTo` 定位，并用 `generateSimulatedWindData` 生成以 (104°E, 35°N) 为中心、5 个高度层的**模拟风场**（涡旋状风向 + 随高度增强的风速）；暴露 `speedFactor` / `arrowLength` / `trailLength` / `alphaFactor` 四个滑块参数。

## 7. 热带浅水（ShallowWater/）：Three.js 叠加场景

### 7.1 技术栈定位（重要）

`ShallowWater` **不是 Cesium 原生特效，也不求解浅水方程**。它是一套**独立的 Three.js（`three@^0.185`）渲染场景**：`useShallowWater.js` 创建一个 `alpha:true` 的 `WebGLRenderer`，其 canvas 由 `ShallowWaterOverlay.vue` 以绝对定位、`z-index:2` 盖在 Cesium canvas 之上，用透明背景与 Cesium 视图"视觉融合"。它是一个自包含的热带浅水**演示场景**（有自己的相机、`OrbitControls`、键盘漫游、动画循环），与 Cesium 的相机/坐标系**不联动**。

### 7.2 场景构成

- **天空**：Three.js `Sky`（turbidity/rayleigh/mie 参数）+ `PMREMGenerator` 生成环境贴图；
- **水面**：`PlaneGeometry(16000×16000, 384×384)` + 自定义 `ShaderMaterial`（`waterSurface.glsl`），uniform 含折射 RT、深度纹理、立方体环境 RT、法线图、吸收系数、清晰度、浪高、泡沫、反射强度；
- **折射/反射**：每帧先隐藏水面/云穹/闪电，把场景渲染到 `refractionRT`（带 `DepthTexture`）做折射；`CubeCamera` + `cubeRT` 做环境反射；
- **海床与岩石**：程序化起伏的沙地平面（`makeSandTexture`）+ 30 个随机十二面体岩石，均通过 `addCaustics` 注入**焦散**效果（`caustics.glsl`，`uTime`/`uCaustic` 驱动）；
- **云穹**：`SphereGeometry(8000)` 背面渲染的程序化云着色器（`clouds.glsl`，`uCoverage` 控制云量）；
- **闪电**：`TubeGeometry` 沿随机折线生成主干+分支，加性混合，按指数衰减闪烁并瞬时抬升 `toneMappingExposure`。

### 7.3 参数与生命周期

`ShallowWaterOverlay.vue` 接收 `visible` 与 11 个参数 props（太阳高度/方位角、清澈度、焦散强度、水色、浪高、泡沫宽度、反射强度、云量、闪电开关/间隔），watch 后调用 `updateParams` 同步到 Three.js uniform。`visible` 为 true 时 `init + start`，false 时 `pause`；组件卸载时 `dispose` 释放全部 geometry/material/RT。

## 8. 地形提供者（terrain/）

### 8.1 GeoTerrainProvider.js — 天地图高度图地形

工厂函数 `createGeoTerrainProvider(Cesium)` 返回一个继承自 `CustomHeightmapTerrainProvider` 的类（64×64 网格）：

- `requestTileGeometry` 按层级请求：`level < _topLevel(5)` 返回平坦默认高度缓冲；`level >= _bottomLevel(11)` 拒绝；中间层级从 `{url}`（支持 `{s}` 子域、`{token}`、`{x}{y}{z}`，注意请求层级为 `level+1`）取 ArrayBuffer，**经 pako `inflate` 解压**后转高度图；
- `_transformBuffer` 把 150×150 源网格重采样到 64×64，按 `dataType`（int16/float）解码高程，越界值（>10000 或 <-2000）置 0，再按 `terrainDataStructure`（`heightScale:0.001`、`heightOffset:-1000`、大端、3 元素/高度）编码为 RGBA；
- 提供 `availability`（`TileAvailability`）与 `getTileDataAvailable`，并维护 `_getChildTileMask` 子瓦片掩码。

### 8.2 ArcGISTerrainProvider.js — ArcGIS 地形增强包装器

`ArcGISTiledElevationTerrainProvider` 原生不暴露 `availability` / `getTileDataAvailable`，导致 `sampleTerrainMostDetailed` 只能查到最低精度。本包装器（V3.3.11 引入）参照天地图模式补这两个接口：构造 `TileAvailability` 并**逐级标记全球瓦片范围为可用**（`2^level` 网格），其余方法全部委托内部 provider。`fromUrl(url)` 工厂返回增强实例。这一能力是洪水模拟地形采样（见独立文档 §6）正确取到最高精度的前提。

### 8.3 GeoWTFS.js — POI 矢量瓦片图层（非地形）

虽位于 `terrain/` 目录且名为 WFS，`GeoWTFS.js`（约 963 行）实际是**POI 注记矢量瓦片图层**：用 `protobufjs` 解析 `GEOPOI.PBPOITile`（含 `PBPOI` 的 `Name` / `Coordinates` / `SymbolID` / `FontColor` / `FontSize` / `ZCoordType` 等字段，多版本 proto 定义），渲染地名/兴趣点注记。它与地形高程无关，归类于此是因为同样按瓦片金字塔组织。`util.js` 仅 4 行，提供 `loadProto`。

## 9. 大气与后处理

### 9.1 cesiumAtmosphere.js — Cesium 原生大气调参（非自研 LUT）

`configureRealisticAtmosphere(viewer, Cesium)` 配置的是 **Cesium 内置大气模型**，而非自研散射 LUT（README 的 LUT 集成已删除，见 §2）：

- `globe`：开启 `enableLighting` / `showGroundAtmosphere` / 动态大气光照，设置 Rayleigh/Mie 系数（`atmosphereRayleighCoefficient` = (5.5,13.0,28.4)e-6、`atmosphereMieCoefficient` = 21e-6）、尺度高度（Rayleigh 10000、Mie 3200）、Mie 各向异性 0.92、晨昏淡入淡出距离；
- `skyAtmosphere`：`perFragmentAtmosphere` + 色相/饱和/亮度偏移 + 同样的散射系数；
- 场景雾 `scene.fog`（density 0.00012 等）、`SunLight`（intensity 2.35）、Bloom（contrast/brightness/delta/sigma/stepSize）、太阳/月亮/星空盒显示、HDR。

`captureRealisticAtmosphereState` / `restoreRealisticAtmosphere` 提供完整状态快照与恢复（含 Cartesian3 序列化），确保大气增强不永久污染场景。

### 9.2 useCesiumBeautify.js — 场景美化

`applyBeautify(params)` 提供：HDR 开关 + 曝光、`Tonemapper.PBR_NEUTRAL` 色调映射（Cesium 1.104+，旧版降级）、`DirectionalLight`/`SunLight` 切换与光强、`skyAtmosphere` 亮度/饱和/色相偏移、**FXAA 抗锯齿**（`postProcessStages.fxaa.enabled`）、`depthTestAgainstTerrain`、设备像素比缩放。`restoreDefaults` 用首次 `captureState` 的快照还原。**当前项目的抗锯齿方案就是这里的 FXAA**——没有 TAAU。

### 9.3 CesiumAdvancedEffects.vue — Cinematic FX 面板

提供四个后处理开关（默认全关），并在 `preRender` 中按相机高度/俯仰角动态调参：

| 开关 | 实现 | 说明 |
|------|------|------|
| Height Fog（高度雾） | 自定义 `PostProcessStage` | 由 `czm_readDepth` + `czm_windowToEyeCoordinates` 还原线性深度，`1-exp(-depth·density)` 指数雾，`cameraHeightFactor` 随相机高度调节密度 |
| HBAO（微阴影） | Cesium `ambientOcclusion` 级（或 `PostProcessStageLibrary.createAmbientOcclusionStage`） | 环境光遮蔽，调 intensity/bias/lengthCap/stepSize/frustumLength |
| Tilt Shift（移轴） | 自定义 `PostProcessStage` | 按 `uv.y` 与焦点距离做 7-tap 横向模糊，俯仰角 `> -0.62` 时随角度增强 |
| Atmosphere + Bloom | 调用 §9.1 `configureRealisticAtmosphere` | 相机高度 ≥ 80000m 才启用，低于阈值自动恢复，避免与晨昏半球冲突 |

面板还内置渲染错误守卫（`scene.renderError` → 自动降级关闭全部特效并提示）与一个 ECharts 实时图表（相机高度/俯仰角/FPS）。

## 10. 与洪水模拟的关系

`FluidSimulation/`（洪水淹没模拟）在 UI 上与本组特效同属工具面板的一个模块，但算法与渲染管线完全独立，详见 [`cesium-fluid-flood-simulation.md`](./cesium-fluid-flood-simulation.md)。需要特别强调的一点：

> **`FluidSimulation` 是整个 Cesium 前端中唯一使用 `Cesium.ComputeCommand` 的模块**（其 4 个全屏四边形计算 pass 用 ComputeCommand 做水深/流出场乒乓更新）。本组三维特效均不使用 ComputeCommand：体积云用 `PostProcessStage`，风场 `Wind2D` 用 `DrawCommand`（渲染到 framebuffer 实现 GPGPU），浅水用独立的 Three.js 渲染器。README 中"wind-core 含 3 个 ComputeCommand"的描述对应的模块已不存在（见 §2）。

## 11. 局限与升级方向

**现有局限：**

1. **抗锯齿能力有限**：当前仅 FXAA（§9.2），无时序抗锯齿。README 提到的 TAAU/BSM Shadow TAA 已删除，体积云 ray marching 与风场粒子在低采样下可能出现闪烁/锯齿，依赖 jitter 与 FXAA 缓解。
2. **大气为内置模型调参**：复用 Cesium `SkyAtmosphere`（§9.1），无自研散射 LUT，无法做自定义波长/气溶胶剖面或离线烘焙的高保真大气透视。
3. **风场为运动学平流**：`Wind2D` 是一阶 Euler 平流（§6.4），无动力学方程、无 RK2 高阶积分（README 的 wind-core/RK2 已删除），大步长下粒子轨迹精度有限；数据当前为内置模拟风场，未接真实气象数据源。
4. **热带浅水与 Cesium 解耦**：`ShallowWater` 是独立 Three.js 场景（§7.1），与 Cesium 相机/坐标/地形不联动，仅做固定区域演示，且额外占用一套 WebGL 上下文与渲染开销。
5. **体积云为屏幕空间后处理**：ray marching 在全屏执行，高预设（ultra 512 步 + 多次二次 march）开销大；云与场景仅做端点深度遮挡判断（§5.2），未做逐样本深度合成，复杂几何穿插时可能有不精确遮挡。
6. **目录命名误导**：`terrain/GeoWTFS.js` 实为 POI 图层、`Wind/wind-core/` 为空目录残留，易误导维护者。

**升级方向：**

1. **恢复/重构时序抗锯齿**：如需 TAAU/BSM 能力，应基于当前 Cesium 版本重新实现速度缓冲与历史重投影，而非恢复已删除的旧模块；或评估 Cesium 新版本内建 TAA。
2. **风场升级**：接入真实气象数据（GRIB/NetCDF）替换模拟数据；将 Euler 积分升级为 RK2/RK4 提高轨迹精度；如需更高并行度与分辨率，可参考洪水模拟用 `ComputeCommand`（或 WebGPU Compute Shader）重构粒子更新。
3. **浅水与 Cesium 融合**：若需地理配准的浅水效果，可将 Three.js 场景相机与 Cesium 相机同步，或改用 Cesium 原生 `PostProcessStage`/自定义 Primitive 实现水面，避免双渲染器开销。
4. **大气保真**：如需工程级大气，可重新引入预计算散射 LUT（Bruneton 风格）并作为独立模块管理生命周期，注意与现有 `SkyAtmosphere` 调参路径避免双写。
5. **目录清理**：移除空的 `Wind/wind-core/` 残留目录，将 `GeoWTFS.js` 迁出 `terrain/` 或在文档/命名上明确其 POI 图层属性。

## 12. 关键事实速查

| 项 | 当前真实情况 |
|------|------|
| 体积云实现 | `PostProcessStage` ray marching（`Cloud/`，TS），约 635 行 fragment shader，四档质量预设 |
| 风场实现 | `Wind2D.js`：WebGL2 GPGPU 乒乓 + **DrawCommand** + **Euler 积分**，约 1132 行 |
| 风场数据 | `useCesiumWind.js` 内置 5 层模拟风场（中心 104°E,35°N） |
| 热带浅水 | 独立 **Three.js** 叠加场景（`z-index:2`），非 Cesium 原生、非 SWE 求解 |
| 地形 | 天地图高度图（pako 解压）+ ArcGIS 增强包装器；`GeoWTFS.js` 为 POI 图层 |
| 大气 | Cesium 原生 `SkyAtmosphere` 调参（无自研 LUT） |
| 抗锯齿 | **FXAA**（无 TAAU / BSM Shadow TAA） |
| 后处理特效 | 高度雾 / HBAO / 移轴 / 大气+Bloom（`CesiumAdvancedEffects.vue`） |
| ComputeCommand 使用者 | **仅 `FluidSimulation`**（本组特效均不用） |
| 已删除（README 仍有描述） | TAAU、BSM Shadow TAA、大气散射 LUT、wind-core(ComputeCommand+RK2)、旧 `Clouds/` |
