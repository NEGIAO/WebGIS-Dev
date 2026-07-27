# 体积云 + 2D 风场性能优化维护日志(V3.4.16)

## 日期和时间

2026-07-26 22:10

## 修改内容

体积云渲染管线与 cesium-wind-layer 2D 风场的性能优化(帧率导向,画质近似不变)。

## 事件逻辑链分析(热点定位)

### 风场(cesium-wind-layer)

| 热点 | 现状 | 代价 |
|------|------|------|
| **粒子数量** | `useCesiumWind` 默认 `particlesTextureSize: 600` → 600²=36 万粒子(库默认 100²=1 万) | 段绘制 144 万顶点/帧,顶点着色器每顶点 4 次纹理采样(~580 万次/帧);3 个 compute pass 逐 600² float 纹理;**36 倍于库设计默认负载,头号热点** |
| **几何构建** | `createSegmentsGeometry` 用 JS `push` 循环构建 st/normal/index(36 万粒子时 ~940 万次 push) | 创建与每次改粒子数时数百 ms 主线程卡顿 |

### 体积云

| 热点 | 现状 | 代价 |
|------|------|------|
| **主 raymarch 全分辨率** | 三档预设 cloud stage 均全屏逐像素 raymarch(smooth 108 步/balanced 156/ultra 340,每命中再乘 maxStepsToSun) | 每帧最大单项 GPU 开销,与像素数线性 |
| **BSM 运动期每帧重绘** | V3.4.7 起 motion>0.001 即强制每帧 raymarch 4×tile;而 snap+世界锚定噪声修复后,**未跨 texel 跳变时内容逐位不变** | balanced/ultra 运动期整张 512/1024 atlas 每帧白算;ultra interval=1 静止时也每帧算 |
| **共享纹理 blit** | `_syncBSM` 每帧 clear+blit 1024² 共享纹理,即使 BSM/resolve 本帧未更新 | 每帧一次全幅 blit 浪费 |
| **地面 PCF 16 tap 硬编码** | aerial/atmosphere 地面云影固定 16 tap,无视预设 `shadowPcfTaps`(1/4/8) | 两个全分辨率 pass 每地面像素 16 次纹理读 |

已确认不构成热点:TAA readPixels 回读(`temporalEnabled` 三档均 false,路径不活跃)。

## 优化解决方案(实施步骤)

### 风场

1. `useCesiumWind.js` / `Wind2D.js`:默认 `particlesTextureSize` 600→256(6.5 万粒子,全球风场视觉密度仍充足),`Wind2D` 构造与 `updateOptions` 增加 [16,512] clamp 防面板误设超载。顶点数 144 万→26 万(÷5.5)。
2. `index.mjs createSegmentsGeometry`:JS push 循环改预分配 TypedArray 直写,消除创建/改档卡顿(36 万粒子 ~940 万次 push → 0)。

### 体积云

3. **BSM 内容签名跳过**(`CloudShadowPass`):`updateShadowCascades` 生成签名 = 各 cascade snap 整数 + 量化太阳方向(2e-4 rad);`updateDynamicParams` 值变更时 bump `_paramsRev`。`render()` 仅在 签名/参数变化 || 演化刷新到期(`max(bsmUpdateInterval, 8)` 帧,windSpeed/evolutionSpeed 均为 0 时不刷) || 首帧 时执行 raymarch。正确性依据:snap 修复后 BSM 内容 = f(snap 窗口, 太阳, 天气偏移, 参数),与相机连续位移解耦。
4. **blit 门控**(`_syncBSM`):仅 pass 或 resolve 本帧更新时才 clear+blit 共享纹理;消费端继续采样上次 blit 结果(内容未变)。
5. **地面 PCF tap 数接入预设**:`setCloudShadow` 增加 `pcfTaps`,aerial/atmosphere 新增 `u_cloudShadowPcfTaps`,循环上限 16 内按预设 1/4/8 tap。
6. **云主 pass 分辨率缩放**(`cloudResolutionScale`):新增预设参数 smooth=0.5 / balanced=0.75 / ultra=1.0。<1 时管线改为 PostProcessStageComposite:子 stage A 以 `textureScale` 低分辨率 raymarch,输出预乘云色(`SPLIT_CLOUD_OUTPUT` define,跳过场景合成);子 stage B 全分辨率 `scene*(1-a)+cloud` 合成。=1 时走原单 stage 路径(ultra 零回归)。对外仍暴露 `pipeline.cloudStage`(composite 同样有 enabled),外部调用零改动。raymarch 像素:smooth ÷4,balanced ÷1.78。

## 影响范围

- 前端体积云模块(CloudShadowPass / ThreeGeospatialPipeline / AtmospherePostProcess / aerialPerspectiveEffect.frag / cloudQualityPresets / cloudParamsApply)。
- cesium-wind-layer(useCesiumWind / Wind2D / index.mjs)。
- 无后端改动、无文件增删。

## 性能指标(理论量级,待实测)

- 风场:段绘制顶点与 VS 纹理采样 ÷5.5;compute 纹理 600²→256²(÷5.5);创建期卡顿消除。
- 云 smooth:raymarch 像素 ÷4(约等效把最重项砍 75%)。
- 云 balanced:raymarch 像素 ÷1.78;BSM 运动期从每帧 → 仅 snap 跳变帧(慢速运动约 ÷3~5);地面 PCF ÷4。
- 云 ultra:BSM 静止/慢速运动从每帧 → ~每 8 帧 + 跳变帧;地面 PCF ÷2;主 pass 不变(画质优先)。

## 测试方案

### 已执行
- 全部改动 JS/MJS 文件 ESLint 零告警(cesium-wind-layer/index.js 为未改动的 CJS 构建产物,其既有告警不在本次范围)。
- 关键链路复核:BSM 签名门控账本(签名/paramsRev/演化计时)读写点齐全;`_syncBSM` blit 门控在 pass 重建后由 `_bsmBlitDone=false` 兜底首帧必 blit;拆分模式 ultra 走原单 stage 路径字节级不变;`u_cloudShadowPcfTaps` 三处(声明/绑定/注入)对齐。
- 说明:`updateDynamicParams` 数组改为 pass 自有副本比较,规避与 `_syncBSM` scratch 数组共享引用导致的变更检测失效。

### 需人工 GPU 验证
1. 风场:开启全球风场,对比开启前后帧率;粒子视觉密度可接受;面板调粒子数无长卡顿。
2. 云三档:静止与运动帧率对比;smooth/balanced 云边缘无明显分辨率瑕疵;balanced/ultra 地面云影仍平滑贴地(V3.4.12 行为不回退)。
3. 切换质量预设、开关云、开关 BSM 反复 5 次无异常。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\cesium-wind-layer\useCesiumWind.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\cesium-wind-layer\Wind2D.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\cesium-wind-layer\index.mjs
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowPass.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AtmospherePostProcess.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AerialPerspectiveEffect.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\Shaders\aerialPerspectiveEffect.frag
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudQualityPresets.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\cloudParamsApply.js(如需传递新参数)
- D:\Dev\GitHub\WebGIS-Dev\README.md / Docs\Guide\CHANGELOG.md / frontend\README.md(版本记录)
