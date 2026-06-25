# 把 `@takram/three-clouds` 体积云移植到 Cesium —— 阅读 / 算法 / 复刻指南
> 文件路径C:\Users\DMWGGB4\Desktop\clouds
> 目标读者:想在 Cesium(WebGL)中复刻这套地理空间体积云的人。
> 本文分三部分:**(A) 怎么读这些文件**、**(B) 用了什么方法和算法**、**(C) 怎么在 Cesium 里复刻**。
>
> 所有行号、文件名都指向当前仓库 `src/` 下的真实文件。

---

## 0. 一句话概括它在做什么

每一帧,在屏幕空间对一个全屏四边形跑 fragment shader,从相机沿每条视线在**地心坐标系(ECEF)** 里做 **ray marching**(光线步进),在云壳球层之间采样体积密度、累积散射光与透射率,最后把结果作为一张半透明 buffer 交给大气包(`@takram/three-atmosphere`)做大气透视合成。

它不是一个独立渲染器,而是 `postprocessing` 的一个 `Effect`。要复刻到 Cesium,本质是复刻:**坐标系约定 + 云的体积建模 + 多遍 ray march 管线 + 时序重建(TAA/上采样)+ 与大气/场景深度的合成**。

---

## A. 怎么读这些文件

### A.1 推荐阅读顺序

按"由外到内、由编排到算法"的顺序读,不要一上来就钻 `clouds.frag`:

1. **`README.md`** —— 先读 "Rendering path"、"Parameters"、"Limitations"、"References" 四节,建立全局认知。
2. **`src/CloudsEffect.ts`** (807 行) —— 总编排类。看它持有哪些子对象、`update()` 每帧做什么。这是"主函数"。
3. **`src/CloudsPass.ts` / `src/ShadowPass.ts` / `src/PassBase.ts`** —— 三个渲染通道怎么串起来、render target 怎么 ping-pong。
4. **`src/uniforms.ts` + `src/CloudLayers.ts` + `src/CloudLayer.ts` + `src/DensityProfile.ts`** —— 数据模型:4 层云如何打包成 `vec4` 喂给 shader。
5. **`src/shaders/parameters.glsl` + `types.glsl`** —— shader 的 uniform/struct 声明清单(等于"接口定义")。
6. **`src/shaders/clouds.glsl`** (190 行) —— **云的建模核心**:weather 采样、shape 采样、密度合成、cube-sphere UV。这是最该精读的算法文件之一。
7. **`src/shaders/clouds.frag`** (1003 行) —— **主 ray march**:相位函数、二次步进、BSM 查询、多重散射、能量守恒积分、大气透视、haze、速度向量。最大、最核心。
8. **`src/shaders/shadow.frag`** (193 行) + **`structuredSampling.glsl`** —— **BSM 阴影生成** + 结构化体采样(SVS)。
9. **`src/shaders/cloudsResolve.frag` + `shadowResolve.frag` + `varianceClipping.glsl`** —— **时序重建**(TAA / TAAU 上采样 + 方差裁剪)。
10. **`src/CascadedShadowMaps.ts` + `helpers/splitFrustum.ts` + `helpers/FrustumCorners.ts`** —— 级联阴影几何。
11. **噪声生成**(可选,首次可跳过,用预烘焙 `.bin`/`.png` 即可):`localWeather.frag`、`cloudShape.frag`、`cloudShapeDetail.frag`、`turbulence.frag`、`tileableNoise.glsl`、`perlin.glsl`。

### A.2 文件职责速查表

| 文件 | 职责 | 复刻时重要度 |
|---|---|---|
| `CloudsEffect.ts` | 总编排、参数暴露、每帧 update | ★★★ 逻辑参考 |
| `CloudsPass.ts` | 主云通道 + resolve,render target 管理 | ★★★ |
| `ShadowPass.ts` | BSM 通道 + shadow resolve | ★★★ |
| `CloudsMaterial.ts` | 主 shader 的 uniform/define/相机矩阵/时序 jitter | ★★★ |
| `ShadowMaterial.ts` | BSM shader 装配 | ★★ |
| `*ResolveMaterial.ts` | TAA/上采样 shader 装配 | ★★ |
| `uniforms.ts` | 4 层参数打包成 vec4 / 高度区间计算 | ★★★ |
| `CloudLayers.ts` | 层数组 + `packIntervalHeights`(区间合并) | ★★★ |
| `qualityPresets.ts` | low/medium/high/ultra 档位 | ★ 调参参考 |
| `shaders/clouds.glsl` | **云建模**:weather/shape/density | ★★★ 核心算法 |
| `shaders/clouds.frag` | **主 ray march** | ★★★ 核心算法 |
| `shaders/shadow.frag` | **BSM 生成** | ★★★ 核心算法 |
| `shaders/structuredSampling.glsl` | SVS 结构化体采样 | ★★ |
| `shaders/cloudsResolve.frag` | TAAU 上采样 | ★★ |
| `shaders/varianceClipping.glsl` | 方差裁剪 | ★★ |
| `shaders/parameters.glsl` / `types.glsl` | uniform/struct 声明 | ★★★ 接口 |
| `CascadedShadowMaps.ts` | CSM 投影矩阵 | ★★ |
| `shaders/*Noise*.glsl` + `cloudShape*.frag` 等 | 程序化噪声 | ★(可预烘焙) |

### A.3 一个关键的"隐藏依赖"

`clouds.frag` / `clouds.vert` 顶部 `#include "atmosphere/bruneton/..."` 和 `core/...`,这些**不在本仓库**,而来自:
- `@takram/three-atmosphere/shaders/bruneton` —— **Bruneton 预计算大气散射模型**(`GetSunAndSkyIrradiance`、`GetSkyRadianceToPoint`、透射率/散射/辐照度 3D 纹理)。
- `@takram/three-geospatial/shaders` —— 工具函数(`raySphereIntersection`、`cascadedShadowMaps`、`vogelDisk`、`interleavedGradientNoise`、`turbo`、`math`、`depth` 等)。

这些 `#include` 在 JS 端通过 `resolveIncludes()`(见 `CloudsMaterial.ts:155-188`)做字符串拼接注入。**这是移植到 Cesium 时最大的工作量来源之一**(见 C.4)。

---

## B. 用了什么方法和算法

### B.1 坐标系与空间约定(理解一切的前提)

- **工作空间 = ECEF**(地心地固直角坐标,单位米)。所有 ray march 都在 ECEF 里做。
- `bottomRadius` = 大气底半径 ≈ 地球半径。云层用一组**同心球壳**表示:`bottomRadius + {altitude, altitude+height}`。
- 顶点着色器 `clouds.vert` 把相机位置/视线方向用 `worldToECEFMatrix` 变到 ECEF,并在此预计算太阳/天空辐照度传给 fragment(插值近似用)。
- `altitudeCorrection`(`CloudsEffect.ts:368-378`,来自 atmosphere 包的 `getAltitudeCorrectionOffset`):把"局部世界原点"与真实地心高度对齐,**缓解高空浮点精度问题**。
- **cube-sphere UV**(`clouds.glsl:15-46` `getCubeSphereUv`):把 2D weather 纹理平铺到球面。用立方体→球面松弛映射。已知缺陷:有接缝(README 提到)。

> **Cesium 红利**:Cesium 的原生坐标就是 ECEF(`Cartesian3` 就是米制地心坐标)。这套球壳 / ray-sphere / cube-sphere 逻辑几乎可以原样搬,不需要像 Three.js 那样额外维护 `worldToECEFMatrix`。

### B.2 云的体积建模(`clouds.glsl`)—— 核心

整个建模是把"**2D 天气图 × 3D 形状噪声 × 高度密度剖面**"逐层(4 层)合成,全部以 `vec4`(每分量一层)并行计算。

**(1) 高度归一化** `sampleWeather` (`clouds.glsl:75-103`)
```
heightFraction = remapClamped(height, minLayerHeights, maxLayerHeights)  // 每层 0..1
```

**(2) 天气信号 + coverage 调制**(Skybolt 风格)
```glsl
localWeather = pow(texture(localWeatherTexture, uv*repeat+offset).RGBA, weatherExponents)
heightScale  = shapeAlteringFunction(heightFraction, bias)  // 半圆变换,让云顶变圆
factor       = 1.0 - coverage * heightScale
density      = remapClamped(mix(localWeather,1,filterWidth), factor, factor+filterWidth)
```
- `shapeAlteringFunction`(`clouds.glsl:68-73`):`biased = pow(η, bias); x = clamp(biased*2-1,-1,1); return 1-x*x`(上凸抛物线 → 云顶圆润、云底收窄)。
- `coverage` 越大 → `factor` 越小 → 密度阈值越低 → 云越多。

**(3) 细节形状采样** `sampleMedia` (`clouds.glsl:119-179`)
- **shape 纹理**(128³ Perlin-Worley,`getPerlinWorley`):在 ECEF 坐标 ×`shapeRepeat` 处采样,`density = remapClamped(density, (1-shape)*shapeAmount, 1)` —— 用噪声**侵蚀**云壳。
- **shape detail 纹理**(32³ Worley FBM):仅在近处(`mipLevel*0.5 + (jitter-0.5)*0.5 < 0.5`)采样,顶部蓬松/底部锐利:`mix(pow(detail,6), 1-detail, ...)`。
- **turbulence**(2D curl noise):对 shape 采样位置做域扭曲,仅在云底强(`turbulenceDisplacement * (tex*2-1) * ...`),制造风的卷动感。
- **density profile**(`getLayerDensity`):`a·exp(b·η) + c·η + d`,默认 `{a:0,b:0,c:0.75,d:0.25}`(上密下疏)。
- 最终:`scattering = densitySum * σs`;`extinction = densitySum * σa + scattering`;`weight = density/densitySum`(各层占比,用于混合天空梯度)。

**(4) 局部演化**:`evolution = -surfaceNormal * |localWeatherOffset| * 2e4`,让 shape 随 weather 偏移而上下移动,避免云"原地变形"。

### B.3 主 ray march(`clouds.frag` `marchClouds` 472-618)—— 核心

这是经典 Frostbite/Nubis 体积云步进,要点:

1. **求步进范围**(`getIntersections` 730 / `getRayNearFar` 743):对 4 个球壳(`0, minHeight, maxHeight, shadowTopHeight`)做 ray-sphere 求交,按相机在云下/云中/云上分三种情况确定 `[near, far]`;再用场景深度 `getRayDistanceToScene`(812)裁剪 far,使云被实体遮挡。
2. **自适应步长**:`stepSize *= perspectiveStepScale`(默认 1.01,越远步越大);空白处直接跳大步(`mix(stepSize, maxStepSize, mipLevel)`);`insideLayerIntervals`(`clouds.glsl:57-61`)跳过层与层之间的空隙(由 `packIntervalHeights` 预算出 ≤3 个区间)。
3. **每个有效采样点**:
   - 太阳辐照度 / 天空辐照度(精确逐点 `GetSunAndSkyScalarIrradiance` 或顶点插值近似,由 `ACCURATE_SUN_SKY_LIGHT` 决定)。
   - **向太阳二次步进** `marchOpticalDepth`(346):少量步(`maxIterationCountToSun`,默认 2-3),补 BSM 缺的近处细节。
   - **BSM 查询** `sampleShadowOpticalDepth`(221):从 Beer shadow map 取远处光学深度,太阳近地平线时叠加 **Vogel disk PCF**(`sampleShadowOpticalDepthPCF` 185)。
   - **多重散射近似** `approximateMultipleScattering`(397,Oz/oz_volumes):多 octave 累积,每 octave 衰减系数 `(a,b,c) *= 0.5`,`a`=亮度、`b`=透射衰减、`c`=相位衰减。
   - **天空梯度**(`skyGradient`)、**地面反弹** `approximateRadianceFromGround`(449,向下二次步进 + 0.3 反照率)、**powder 项**(`1 - powderScale*exp(-ext*powderExp)`,Horizon Zero Dawn)。
4. **能量守恒解析积分**(Frostbite 5.6.3):
   ```glsl
   transmittance     = exp(-extinction * stepSize);
   scatteringIntegral = (radiance - radiance*transmittance) / extinction;
   radianceIntegral  += transmittanceIntegral * scatteringIntegral;
   transmittanceIntegral *= transmittance;
   ```
5. **透射率加权平均深度**(Frostbite 5.9.1):`frontDepth = Σ(dist·T) / ΣT` —— 用单个深度近似代表整段云,供大气透视用(README 指出这是 ghosting/伪影来源之一)。
6. **提前终止**:`transmittanceIntegral <= minTransmittance` 时 break。
7. 输出:`color.rgb=radianceIntegral`、`color.a=1-透射率`、`depthVelocity=(frontDepth, 屏幕速度)`。

**相位函数**(`clouds.frag:298-344`):双瓣 Henyey-Greenstein(`g1=0.7, g2=-0.2, mix=0.5`)是默认;`ACCURATE_PHASE_FUNCTION` 时用 NVIDIA 数值拟合 Mie(Draine,d=10μm)。

**大气透视**(`applyAerialPerspective` 701):调用 atmosphere 的 `GetSkyRadianceToPoint`,在 `frontDepth` 处取透射率+内散射,`color = color*transmittance + inscatter*color.a`。

**Haze**(`approximateHaze` 654):基于 iq 的指数雾解析积分,密度随相机高度指数衰减,带 shadowLength 的阴影项。便宜,默认开。

### B.4 Beer Shadow Map(`shadow.frag`)—— 核心

不是普通深度阴影图,而是存"光学深度重建参数"的图:

- 在**太阳正交投影**下,对每个 cascade、每个 texel,沿 `-sunDirection` 做 ray march。
- **SVS 结构化体采样**(`structuredSampling.glsl`):用二十面体顶点选一组对齐平面来定步进位置(`getStructureNormal` + `intersectStructuredPlanes`)。好处:**时序稳定**(低分辨率阴影图下单像素闪烁很显眼),代价是空间锯齿(靠 STBN 抖动 + TAA 缓解)。
- 每 texel 输出 `vec4`:`r=frontDepth`(云前沿距离)、`g=meanExtinction`(平均消光)、`b=maxOpticalDepth`、`a=maxOpticalDepthTail`(提前终止后尾部补偿,`shadow.frag:104-116`)。
- 主通道里用 `readShadowOpticalDepth`(`clouds.frag:172`)**重建任意点的光学深度**:
  ```glsl
  distanceToFront = max(0, distanceToTop - distanceOffset - shadow.r);
  opticalDepth    = min(shadow.b + shadow.a, shadow.g * distanceToFront);
  ```
  即"用前沿距离 + 平均消光 线性重建,封顶到最大光学深度"。这就是 BSM 省内存/带宽的关键。

### B.5 级联阴影(`CascadedShadowMaps.ts`)

- 把主相机视锥按 `practical`(uniform 与 logarithmic 的混合,`splitLambda` 控制)切成 N 段。
- 每段拟合一个**太阳空间正交投影**(包围盒 + 半径),并做 **texel snapping**(`updateMatrices` 241-244,对齐到整 texel,消抖动)。
- `fade` 在级联边界扩张包围盒做淡入淡出。
- 参考 three-csm。输出 `intervals` / `matrices` / `inverseMatrices` 给主、阴影 shader 与大气合成共用。

### B.6 时序重建:TAA + TAAU 上采样

**时序上采样**(`CloudsMaterial.setSize` + `CloudsPass.setSize:203` + `cloudsResolve.frag`):
- 主云只渲染 **1/16 像素**:低分辨率 = `ceil(w/4) × ceil(h/4)`。
- 每帧用 4×4 **Bayer 序**(`cloudsResolve.frag:42-47` + `bayer.ts`)选出当前帧负责的那个子像素;`currentFrame` 的格子直接用新值,其余格子用历史重投影。
- 16 帧凑齐一张全分辨率图。相机抖动:`temporalJitter = (bayerOffset-0.5)/resolution*4`,并把抖动塞进投影矩阵(`CloudsMaterial.ts:339-356`)。

**方差裁剪**(`varianceClipping.glsl`,Salvi 的方法 + Playdead 的 AABB clip):
- 取邻域 4 或 9 个样本算均值/方差,构造 color AABB,把历史色 clip 进盒子,抑制 ghosting。
- **速度膨胀**(`getClosestFragment`):取邻域最近深度的速度向量,减少边缘拖影。
- **STBN**(spatiotemporal blue noise,`getSTBN` in `clouds.glsl:1-5`):3D 蓝噪声,按 `frame % depth` 取层,做随机抖动,把锯齿换成视觉上更柔和的噪声。

整个 ping-pong:`CloudsPass` 维护 `current / resolve / history` 三个 render target,每帧 `swapBuffers()`(174)交换 resolve↔history。

### B.7 程序化噪声(可选)

- `tileableNoise.glsl`:可平铺 Worley + value noise(Sébastien Hillaire 的 TileableVolumeNoise)。
- `cloudShape.frag`:Perlin-Worley remap → 128³ shape。
- `cloudShapeDetail.frag`:Worley FBM → 32³ detail。
- `localWeather.frag`:多频 Worley/Perlin 写进 RGBA 四通道(对应 4 层默认天气)。
- `turbulence.frag`:Perlin 的 **curl noise**(无散度向量场)→ 2D RGB。

> 复刻初期建议直接用仓库 `assets/` 里预烘焙的 `shape.bin`(128³)、`shape_detail.bin`(32³)、`local_weather.png`、`turbulence.png`,把噪声生成放到最后。

### B.8 数据流总图

```
                    每帧 CloudsEffect.update()
                              │
   ┌──────────────────────────┼───────────────────────────┐
   │ 1. 程序化纹理 render(如有)                            │
   │ 2. updateSharedUniforms:层参数打包/速度/altitudeCorr/ │
   │    CSM.update(太阳方向→级联正交矩阵)                  │
   └──────────────────────────┼───────────────────────────┘
                              ▼
        ShadowPass ──► shadow.frag (SVS ray march, MRT: N cascade)
            │             └► shadowResolve.frag (TAA over BSM)
            ▼
        cloudsPass.shadowBuffer = BSM(sampler2DArray)
            │
        CloudsPass ──► clouds.frag (主 ray march, MRT: color+depthVel[+shadowLen])
            │             └► cloudsResolve.frag (TAAU 上采样 16→1)
            ▼
   outputBuffer / shadowLengthBuffer / atmosphereShadow
            │
            ▼
   交给 AerialPerspective(atmosphere 包)做大气透视 + 合成进场景
```

---

## C. 怎么在 Cesium 里复刻

### C.1 总体可行性判断

| 维度 | Three 实现 | Cesium 对应 | 难度 |
|---|---|---|---|
| 坐标系 | 手动维护 ECEF 矩阵 | **原生 ECEF**(Cartesian3) | 🟢 反而更简单 |
| WebGL2 / sampler3D / 2DArray | 依赖 | Cesium 默认开 WebGL2 | 🟢 |
| 后处理框架 | `postprocessing` Effect | `PostProcessStage` | 🟡 |
| **MRT 多目标输出** | `WebGLRenderTarget.textures` | PostProcessStage **不支持**,需私有 `Framebuffer`+`DrawCommand` | 🔴 主要工作量 |
| **预计算大气**(Bruneton) | `@takram/three-atmosphere` | Cesium 无等价可调用 API | 🔴 主要工作量 |
| 场景深度 | depthTexture | `czm_globeDepthTexture` / depth | 🟡 |
| 级联阴影几何 | `CascadedShadowMaps.ts` | 纯 CPU 数学,可移植 | 🟢 |
| 时序重建 | resolve passes | 自建 ping-pong framebuffer | 🟡 |

结论:**可行,但不是"翻译 shader"那么简单**。两个硬骨头是 **MRT 多通道** 和 **大气模型**。建议分阶段。

### C.2 Cesium 的渲染接入方式选择

Cesium 公开的 `PostProcessStage` 只能单输入单输出、不支持 MRT,也不让你自由插多 pass。要复刻这套管线,有三条路:

1. **私有渲染 API 路线(推荐,最贴近原版)**
   用 Cesium 内部的 `Framebuffer`、`Texture`、`DrawCommand`、`ClearCommand`、`ShaderProgram`、`Pass`,在 `scene.preRender` / 自定义 `primitive.update(frameState)` 里手动调度多个 DrawCommand,自己建 MRT framebuffer(`new Framebuffer({ colorTextures: [...] })`)。
   - 优点:能 1:1 还原 shadow→shadowResolve→clouds→cloudsResolve 四遍 + MRT。
   - 缺点:用到非公开 API,Cesium 升级可能 break。

2. **多个单输出 PostProcessStage 串联(折中)**
   把每个 MRT 拆成多个单输出 pass(例如 color 一个 stage、depthVelocity 一个 stage),用 `PostProcessStageComposite` 串。
   - 缺点:同样的 ray march 要跑多次(因为不能一次写多个目标),性能差;pass 间传递中间纹理麻烦。

3. **Custom Primitive + 自管 framebuffer(最灵活)**
   写一个实现了 `update(frameState)` 的 primitive,内部完全自管资源,只在最后把云纹理 blend 到场景。实际上是路线 1 的封装形式。

> 建议:**路线 1/3**。先不追求 16x 上采样和 MRT,做一个"全分辨率、单 pass、单输出"的最小可用版本(见 C.6 阶段一),跑通后再加 MRT 与时序。

### C.3 必须建立的资源(对照 Three 版)

- **3D 纹理**:shape(128³ R)、shape_detail(32³ R)、STBN(R,Data3DTexture)。Cesium 用 `new Texture` 目前主要面向 2D;3D 纹理需要走 `gl.texImage3D` 自建(私有 API 或直接拿 `context._gl`)。从 `.bin` 读 `Uint8Array`/`Float16` 上传。
- **2D 纹理**:local_weather(RGBA)、turbulence(RGB)。普通 `Texture` 即可。
- **2DArray 纹理**:BSM(`outputColor[CASCADE_COUNT]`)。同样需 `texImage3D`/`TEXTURE_2D_ARRAY`。
- **MRT framebuffer**:clouds 输出 2~3 个 color attachment;shadow 输出 `2*cascadeCount` 个。需 `WEBGL_draw_buffers`(WebGL2 原生 `gl.drawBuffers`)。
- **ping-pong**:resolve/history 各一组,逐帧交换。

### C.4 大气依赖怎么办(最关键决策)

`clouds.frag` 重度依赖 Bruneton 预计算大气:`GetSunAndSkyIrradiance`(逐点光照)、`GetSkyRadianceToPoint`(大气透视)、以及 transmittance/scattering/irradiance 纹理。三种处理方式:

1. **移植 Bruneton 模型(最高保真)**
   把 Eric Bruneton 的 precomputed atmospheric scattering(开源,BSD)在 Cesium 里预计算出 transmittance/scattering/irradiance 纹理,移植对应的 `GetSunAndSkyIrradiance` / `GetSkyRadianceToPoint` GLSL。工作量大但效果最好。`@takram/three-atmosphere` 本身就是它的移植,可作参考。

2. **用 Cesium 自带大气近似(最省事)**
   Cesium 有 `SkyAtmosphere` / `Atmosphere` 和内置 `czm_` 大气函数(如 fog、`czm_computeScattering` 相关)。把云的 sun/sky 辐照度换成简化解析模型(如 Preetham/Hosek 或常量+太阳色),大气透视用 Cesium 的 fog/atmosphere 参数近似。保真度下降,但能快速出图。

3. **混合**:先用方式 2 的常量/解析光照把云跑通,再逐步替换为方式 1。

> 强烈建议先走方式 2 验证管线,大气是可以后期升级的独立模块。把 shader 里所有 `GetSunAndSkyScalarIrradiance(...)` / `GetSkyRadianceToPoint(...)` 调用先用桩函数(返回常量太阳色 + 天空色)替换。

### C.5 GLSL 移植注意点(Three → Cesium)

- **`#include` 解析**:Three 用 `resolveIncludes()` 字符串注入;Cesium 有自己的 `ShaderSource` + `#include` 机制(以及 `czm_` 内建)。需要把 `core/math`、`raySphereIntersection`、`vogelDisk`、`interleavedGradientNoise` 等工具函数**手动内联或重写**(它们来自 `@takram/three-geospatial/shaders`,不在本仓库)。
- **GLSL 版本**:本项目是 GLSL3(`#version 300 es`,`in/out`、`texture()`、`textureLod()`、`layout(location=)`)。Cesium 默认 GLSL1 风格 + 自动转译;自管 `ShaderProgram` 时可指定。MRT 需要 GLSL3 + `gl.drawBuffers`。
- **内建变量**:Three 的 `gl_FragCoord`、`resolution` uniform → Cesium 有 `czm_viewport`、`gl_FragCoord` 可用。相机矩阵用 `czm_view`、`czm_projection`、`czm_inverseView` 等,**但注意 Cesium 的视图矩阵基于其相机参考系**,reprojection(上一帧矩阵)需要自己缓存。
- **深度读取**:`clouds.frag:812 getRayDistanceToScene` 读 `depthBuffer` + `reverseLogDepth`(对数深度)。Cesium 也用对数深度缓冲(`czm_log2FarDepthFromNearPlusOne` 等),要用 Cesium 的深度解码(`czm_unpackDepth` / globe depth),把视线与场景实体求交逻辑替换为 Cesium 版本。
- **`define` 宏**:`SHAPE_DETAIL`、`TURBULENCE`、`SHADOW_LENGTH`、`HAZE`、`ACCURATE_*`、`MULTI_SCATTERING_OCTAVES`、`SHADOW_CASCADE_COUNT` 等(见 `CloudsMaterial.ts:436-481`)用来开关特性/展开循环。Cesium 的 `ShaderSource.defines` 同样支持,直接对应。
- **循环展开**:`#pragma unroll_loop_start/end` 是 Three 特有,Cesium 没有;改成手写定长循环或用 `#define` 常量上界。

### C.6 建议的分阶段路线图

**阶段一:最小可用(静态、全分辨率、单 pass、无阴影、无 TAA)**
1. 在 Cesium 里建一个自管 framebuffer 的全屏 pass,拿到 `czm_globeDepthTexture` 与相机矩阵。
2. 移植 `clouds.glsl` 的建模函数 + `clouds.frag` 的 `marchClouds`,**砍掉** BSM、shadowLength、haze、二次 march、多重散射(先用单次 Beer-Lambert + HG 相位)。
3. 光照用常量太阳/天空色(C.4 方式 2 桩函数)。
4. 用预烘焙 `assets/` 纹理(shape/detail/weather/turbulence)。
5. 把云的 RGBA 直接 alpha-blend 到场景之上,验证形状/coverage/层高度正确。

**阶段二:光照与阴影**
6. 接入二次 march(向太阳)+ 多重散射近似 + powder。
7. 实现 CSM(移植 `CascadedShadowMaps.ts`,纯数学)+ BSM 通道(`shadow.frag` + SVS)+ 主通道 BSM 查询。需要 2DArray 输出 → 用私有 framebuffer + drawBuffers。
8. 加 haze、地面反弹。

**阶段三:大气保真**
9. 移植 Bruneton 模型(C.4 方式 1),替换桩函数,接入大气透视 `GetSkyRadianceToPoint`。

**阶段四:性能(时序)**
10. 实现 cloudsResolve 的 TAAU 16x 上采样 + 方差裁剪 + STBN + 速度重投影 + ping-pong。
11. 实现 shadowResolve 的 BSM TAA。
12. 对齐 `qualityPresets` 的档位。

### C.7 移植时最容易踩的坑

- **MRT 不解决会逼你重复 ray march**:`depthVelocity`(速度向量)必须和 color 在同一 pass 输出,否则上采样无法重投影。要么上 MRT,要么放弃时序上采样(阶段一/二完全可以)。
- **对数深度**:Cesium 默认开 log depth,云与场景实体的遮挡判断必须用 Cesium 的深度解码,否则云会穿模或被错误遮挡。
- **精度**:远距离 ray march 在 ECEF(半径 ~6.37e6 米)下浮点精度敏感,原版用 `altitudeCorrection` 平移原点。Cesium 有 RTC(relative-to-center)惯例,务必沿用类似手段。
- **太阳方向 / 时间**:Cesium 用 `JulianDate` + `Cesium.Simon1994PlanetaryPositions` 算太阳方向(ECEF),替换原版的 `sunDirection`。
- **cube-sphere 接缝**:weather 平铺有接缝(README 已知问题),不是 bug,先忽略。
- **`packIntervalHeights` 的区间合并**(`CloudLayers.ts:141-180`)别漏:它把 4 层高度合并成 ≤3 个 march 区间用于跳空,直接影响性能与正确性。

---

## D. 参考文献(原 README References,复刻必读)

- **Frostbite**: *Physically Based Sky, Atmosphere and Cloud Rendering*(能量守恒积分 5.6.3、透射率加权深度 5.9.1)— 主 march 的理论基础。
- **Nubis (Decima)** / **Horizon Zero Dawn**(Guerrilla)— 云建模、powder 项。
- **Skybolt** (Prograda) — 全球云、coverage 调制(本项目 `sampleWeather` 直接参考)。
- **volsample** (huwb) — Structured Volume Sampling(`structuredSampling.glsl`)。
- **TileableVolumeNoise** (Sébastien Hillaire) — 噪声生成。
- **three-csm** (StrandedKitty) — 级联阴影。
- **Oz: The Great and Volumetric** — 多重散射近似(`approximateMultipleScattering`)。
- **NVIDIA Approximate Mie** — 精确相位函数(Draine)。
- **NVIDIA STBN** / **Salvi Temporal Supersampling**(方差裁剪)/ **Playdead temporal**(AABB clip)/ **INSIDE TAA** — 时序重建。
- **Bruneton Precomputed Atmospheric Scattering** — 大气模型(C.4 方式 1 的源头)。
- iq, *Fog*(haze 解析积分)。

---

*本文基于仓库快照逐文件精读整理。行号以当前 `src/` 为准,升级后可能漂移。*
```

