# Cesium 洪水淹没模拟（水体流体）架构说明

日期：2026-07-21

适用范围：`frontend/src/components/Cesium/FluidSimulation/` 模块。

本文是长期参考文档，说明 WebGIS 3.0 中"水体流体 / 洪水淹没模拟"功能的算法原理、数据结构、GPU 渲染管线与交互驱动机制，供后续维护、调参与算法升级时对照。

## 1. 功能定位

本功能在 Cesium 三维场景中，围绕用户点选的任意区域（默认 10km×10km）实时模拟水体在地形上的积聚与扩散，并支持"水位逐步上涨"的洪水淹没动画。

**重要边界**：这是一套**视觉导向的 GPU 近似汇流模型**，不是严格的水动力学求解器。它没有求解浅水方程（Saint-Venant / SWE），没有速度场、动量方程、平流项，也没有受 CFL 条件约束的时间积分。它适合做**淹没范围可视化与趋势演示**，不能直接用于需要精确水深、流速、到达时间的工程级洪水分析。若需后者，应替换为真正的浅水方程求解器（如 Godunov 格式）。

算法原型来自 Shadertoy 示例（`https://www.shadertoy.com/view/7tSSDD`，基于 mind3d 的 Cesium 流体示例），本项目将其改造为**使用真实 DEM 地形**并集成进 Cesium 渲染管线。

## 2. 文件结构

| 文件 | 职责 |
|------|------|
| `FluidSimulationPanel.vue` | UI 面板 + 编排层：地形采样、水位值域计算、洪水动画循环（CPU 侧）、参数映射、场景状态快照/恢复 |
| `fluidRuntime.js` | GPU 运行时：`FluidRenderer` 类 + 全部 GLSL 着色器 + 自定义绘制命令封装（`CustomPrimitive` / `RenderUtil`）+ 大气雾后处理（`createSkyEffect`） |

`fluidRuntime.js` 通过 `createFluidRuntime(Cesium)` 工厂函数导出 `{ FluidRenderer, createSkyEffect }`，延迟注入 Cesium 依赖，避免模块顶层持有全局 Cesium。

## 3. 算法总览

核心是**高度场管流模型（Pipe Model / 元胞自动机式汇流）+ 浴缸式淹没初始化 + 体积光线步进渲染**三层组合：

1. **汇流**：水从"水面总高（地形高程 + 水深）"高的单元流向低的单元，流量正比于水位差，叠加惯性衰减、流量阈值与质量守恒约束。
2. **淹没**：全局水面高程（`fluidParam.w`）决定哪些地形被淹——地形低于水面处即积水，水深 = 水面 − 地形（浴缸模型）。
3. **渲染**：把模拟区域当作包围盒做 ray marching，将水体以参与介质方式叠加在真实地形影像上。

## 4. 数据结构：4 张浮点纹理乒乓缓冲

模拟状态全部存于 GPU 的 `1024×1024` RGBA 浮点纹理（`_createTextures` 创建 A/B/C/D 四张），对应 `FLUID_HORIZONTAL_SIZE = 10000`（10km×10km）的模拟区域。每个纹素代表一个地面单元：

- **A/C 纹理（水深场）**：`.x` = 归一化地形高程 `[0,1]`，`.y` = 该单元水深
- **B/D 纹理（流出场）**：`.xyzw` = 分别流向东 / 北 / 西 / 南四个邻居的水量

GPU 不能在同一 pass 里边读边写同一张纹理（反馈环路），必须"读旧状态 → 写新状态"分离，即**乒乓缓冲（ping-pong）**。A/C 互为水深场新旧状态，B/D 互为流出场新旧状态；每帧还做两轮子迭代，因此各需两张。

## 5. 每帧 4 个计算 pass

`_createComputePasses` 将四个全屏四边形 `ComputeCommand` 按固定顺序执行（`iChannel0` = 水深场输入，`iChannel1` = 流出场输入，等号右侧为输出纹理）：

1. **A = 水深更新(C, D)** — 用上一帧水深 C 与流出 D 计算新水深（BufferA）
2. **B = 流出更新(A, D)** — 用新水深 A 与旧流出 D 计算新流出（BufferB）
3. **C = 水深更新(A, B)** — 用新水深 A 与新流出 B 再迭代一轮（BufferC）
4. **D = 流出更新(C, B)** — 收尾得到最新流出场（BufferD）

主渲染 pass 读取 **C**（最新水深场）。每帧实际执行两轮"水深 → 流出"松弛。

### 5.1 出流计算（BufferB / BufferD）

`computeOutFlowDir` 对四个邻居分别计算：

```glsl
return max(0.0, (centerHeight.x + centerHeight.y) - (dirHeight.x + dirHeight.y));
```

即 `出流 = max(0, 中心水面总高 − 邻居水面总高)`，水面总高 = 地形高程 + 水深。这是管流模型的驱动项——水往低处流，流量正比于水位差。

随后做三道处理：

```glsl
nOutFlow = fluidParam.x * oOutFlow + fluidParam.y * nOutFlow;   // 惯性衰减 + 流出强度
if (totalFlow > fluidParam.z) {                                  // 最小流量阈值
    if (height.y < totalFlow)
        nOutFlow = nOutFlow * (height.y / totalFlow);            // 质量守恒：不能流出超过现有水深
} else {
    nOutFlow = vec4(0);                                          // 低于阈值归零，防止数值抖动
}
```

- `fluidParam.x`（attenuation，0.9~0.999）：保留上一帧出流的比例 → 越大水走得越远（黏性/惯性）
- `fluidParam.y`（strength，0~1）：新水位差的驱动强度 → 越大扩散越快
- `fluidParam.z`（minTotalFlow）：流量阈值，低于则归零，避免水永远缓慢渗流
- 质量守恒钳制：总出流超过当前水深时按比例缩小，保证单元不被抽成负水深

### 5.2 连续性方程更新水深（BufferA / BufferC）

```glsl
waterDept = height.y - totalOutFlow + totalInFlow;
```

新水深 = 旧水深 − 流出总量 + 流入总量。流入量取法：我的东邻居的 `.z` 分量（它向西的出流）正是流向我的，故 `totalInFlow += readOutFlow(p + ivec2(1,0)).z`，四方向同理。这是离散化的质量守恒（连续性方程）。

### 5.3 初始注水（浴缸模型，仅 iFrame == 0）

首帧 BufferA 不做汇流，直接按全局水位初始化：

```glsl
float animatedFilmDepth = min(min(fluidParam.w, minAnimatedFilmDepth), max(1.0 - terrainElevation, 0.0));
float waterDept = max(fluidParam.w - terrainElevation, animatedFilmDepth);
```

`fluidParam.w` 为归一化**全局水面高程**。地形低于水面处被淹没，水深 = 水面 − 地形。`minAnimatedFilmDepth`（0.003）保证一层薄水膜用于视觉效果。

## 6. 地形高程来源（真实 DEM）

与纯 Shadertoy demo 的关键区别：**使用真实地形**。

### 6.1 主路径：采样地形提供者

`FluidSimulationPanel.vue` 的 `createTerrainHeightMapSource` 在选点后，以约 `TERRAIN_SAMPLE_TARGET_SPACING = 60`m 间距布设采样网格（`chooseTerrainSampleSize` 将点数约束在 64~160），通过 `createTerrainSamplePositions` 在选点处建立 ENU 局部坐标系生成均匀分布的采样位置，调用 `Cesium.sampleTerrain()` 从当前地形提供者（天地图 / ArcGIS 等）采出真实高程，`createSampledHeightMapSource` 打包为 Float32 RGBA 高度图纹理。

采样层级由 `getExplicitTerrainSampleLevel` 决定：天地图（`_bottomLevel=11`）走 level 10，其余走 `min(maximumLevel, 12)`，避免 `sampleTerrainMostDetailed` 请求过高精度导致瓦片过载。

### 6.2 归一化

BufferA 中将真实高程归一化到 `[0,1]`：

```glsl
terrainElevation = clamp((texture(heightMap, uv).r - minHeight) / max(maxHeight - minHeight, 0.0001), 0.0, 1.0);
```

`minHeight` / `maxHeight` 由 `resolveFluidVerticalRange` 从采样结果与选点高度共同确定（选点高度参与 min/max 计算，保证选点一定在水位值域内）。

### 6.3 退路

- **纯椭球（无地形）**：`createFlatHeightMapSource` 返回全零平面。
- **采样失败**：`_generateHeightMapTexture` 架一台正交相机（`_createOrthographicCamera`）从正上方对地球做**深度预渲染**，并通过 `_processHeightMapShaders` / `_modifyFragmentShader` 给地形 shader 注入逆 ENU 矩阵 `u_inverseEnuMatrix`，把每个片元的本地高度 `posMC.z` 写回颜色输出，相当于"现场扫描"出一张高度图。该路径会临时改写地形绘制命令的 shaderProgram 与 uniform，结束后由 `_restoreHeightMapShaders` 恢复。

## 7. 体积渲染：光线步进合成

主渲染 pass（`renderShaderSource`）把模拟区域当作一个 `dimensions.x × dimensions.y × dimensions.z`（10km×10km×水深）的**单位包围盒**，经 `generateModelMatrix` 以 ENU 框架放置（选点经纬度 + baseHeight + 垂直范围中点）。每个片元：

1. **射线与包围盒求交**（`boxIntersection`），进入盒体后开始步进。
2. **地形求交**：沿射线步进（最多 80 步）直到 `p.y < getHeight(p).x`（射线落到地形表面以下）。地形颜色不自行着色，而是直接采样 Cesium 已渲染好的 globe 颜色纹理（`colorTexture`，取自 `globeDepth.colorFramebufferManager`），因此看到的是真实地图影像。
3. **水面求交**：同样步进直到 `p.y < getHeight(p).y`（水面 = 地形 + 水深），用高度场有限差分（`getNormal`）计算水面法线。
4. **合成**：地形颜色按"视线穿过水体的距离"向水色做雾衰减（`applyFog`，`customParam.x` 控制雾距），并叠加水面镜面高光（`customParam.y` 高光指数、`customParam.z` 高光强度）。

水体因此呈现**参与介质**效果：水柱越深，底下地形越偏向水色，水面带反光。`createSkyEffect` 额外提供一个屏幕空间大气散射后处理（Rayleigh + Mie，ray marching 球面近似），增强水体场景的天空氛围。

## 8. 洪水动画驱动（CPU 侧）

"洪水上涨"由面板而非 GPU 驱动。`startFloodSimulation` 用 `requestAnimationFrame` 按 `floodSimSpeed`（m/s）线性抬升 `waterLevel`，从当前值涨到区域最大高程；到达最大值后停止并提示。每次抬升触发：

```
waterLevel 变化 → watch → applyWaterLevelParam()
  → normalizeWaterLevel()（绝对高程 → [0,1]）
  → fluidRenderer.setInitialWaterLevel()
  → 改写 fluidParam.w + resetSimulation()（_frameCount 归零）
```

`_frameCount` 归零使 BufferA 在下一帧重新执行浴缸式注水（按新水位重建淹没状态），随后汇流松弛在新状态上继续。因此整个洪水模拟本质是**一串准静态浴缸淹没状态序列**：全局水位逐步抬高 → 低洼处依次被淹 → 管流模型在帧间做横向扩散松弛 → 视觉上呈现水位上涨、淹没范围扩大。

默认上涨速度由 `createFluidAtScreenPosition` 在水位值域确定后自动设为 `值域跨度 / 10`（约 10s 完成全程模拟），可由外部控制中心经 `setFloodSpeed` 覆盖。

## 9. UI 参数与模拟参数映射

`applyFluidParams` 的映射关系（面板注释已固化）：

| UI 参数 | 映射到 | 取值范围 | 作用 |
|---------|--------|---------|------|
| threshold | `fluidParam.z`（minTotalFlow） | 0~500 → 0~0.01 | 越大越难开始流动，水更易积成潭 |
| blend | `fluidParam.y`（strength） | 0~50 → 0~1 | 越大出流越强，扩散越快 |
| lightStrength | `fluidParam.x`（attenuation） | 0~10 → 0.9~0.999 | 越大衰减越慢，水走得更远（同时增强高光） |
| waterLevel | `fluidParam.w`（归一化水位） | [minHeight, maxHeight] → [0,1] | 全局水面高程，决定淹没范围 |
| waterColor | `waterColor`（vec3） | hex → RGB | 水体颜色 |

`customParams`（`Cartesian4(t, b, l, 10)`）另作渲染参数：x = 雾化距离阈值、y = 高光指数、z = 高光强度。

## 10. 场景状态管理

`prepareScene` 在创建流体前对 Cesium 场景做一次性配置（开启阴影、HDR、对数深度、地形深度测试、光照、大气等），并以 `sceneSnapshot` 保存原始状态；`restoreScene` 在清理时还原。这保证流体渲染管线所需的渲染特性（尤其是对数深度与地形深度测试）不会永久污染场景。

## 11. 局限与升级方向

**现有局限：**

1. **非物理精确**：无动量/流速场、无平流、时间步长无 CFL 约束，属扩散波量级的松弛近似。
2. **准静态洪水**：洪水动画是浴缸淹没序列，不模拟洪水波的传播速度与到达时间。
3. **分辨率受限**：1024×1024 网格覆盖 10km 时单元约 10m，细粒度建筑级淹没不可表达。
4. **边界开放**：`readOutFlow` 在边界外返回 0，相当于开放边界（水可流出区域），无回水/边界反射。

**升级方向（如需工程级能力）：**

1. 引入真正的浅水方程求解器（Saint-Venant 方程组 + Godunov / WAF 格式），获得水深与流速场。
2. 用 WebGPU Compute Shader 替代全屏四边形 ComputeCommand，提升并行度与分辨率。
3. 接入水文模型输出（如 SWMM、HEC-RAS 结果）作为水位驱动，替代线性上涨。
4. 增加流量过程线、淹没历时、最大水深等统计量输出，支持灾损评估。

## 12. 关键常量速查

| 常量 | 值 | 含义 |
|------|-----|------|
| `FLUID_TEXTURE_SIZE` | 1024 | 模拟网格分辨率 |
| `FLUID_HORIZONTAL_SIZE` | 10000 | 水平范围（m），10km×10km |
| `FLUID_FALLBACK_DEPTH` | 1200 | 无地形采样时的回退垂直深度（m） |
| `FLUID_INITIAL_WATER_RATIO` | 0.03 | 初始水位占垂直范围比例 |
| `TERRAIN_SAMPLE_TARGET_SPACING` | 60 | 地形采样目标间距（m） |
| `TERRAIN_SAMPLE_MIN_SIZE` / `MAX_SIZE` | 64 / 160 | 采样网格边长上下限 |
| `minAnimatedFilmDepth`（GLSL） | 0.003 | 最小动画水膜深度（归一化） |
| `timeStep` | 0.3 | 每帧帧计数增量（控制松弛节奏） |
