# 体积云地面阴影垂直移动残余抖动修复维护日志(V3.4.12)

## 日期和时间

2026-07-26 21:20

## 修改内容

V3.4.7 修复 CSM 矩阵配对/texel snap 后,旋转黑闪与粘屏已消除,但相机海拔垂直移动时地面阴影仍有抖动。本次修复 4 个"snap 修复后暴露的第二层"根因。

## 修改原因 / 事件逻辑链分析

### 根因 1(核心):BSM raymarch 噪声锚定 atlas 像素,随 snap 跳变整场重噪

`CloudShadowFrag` 的 `getBlueNoise()` 用 `gl_FragCoord.xy/256` 采样 —— 噪声相位绑定 **atlas 像素**。
texel snap 使 cascade 窗口随相机按**整 texel 跳变**:每次跳变,同一世界点落到相邻像素,
噪声相位相对世界滑动 1 texel,该 cascade 的 OD 场整体"重新掷骰子"。
垂直移动时 4 级 cascade(texel 约 50m/235m/1km/2km)以不同节奏持续跳变 → 阴影周期性"跳纹理"= 抖动。

**修复**:噪声改为世界锚定 —— `updateShadowCascades` 记录每级 snap 后中心的 texel 计数
(`round(centerLS/texel) mod 256`),作为 `u_jitterOffset` 传入,采样
`(gl_FragCoord.xy + u_jitterOffset)/256`。数学上
`fragCoord + center/texel = (x_light + radius)/texel` 与窗口位置无关 → 噪声随纹理网格一起贴住世界,
跳变前后 BSM 内容严格一致。

### 根因 2:resolve 运动期重置阈值过紧,时域平滑在移动中完全失效

V3.4.7 将 reset 阈值收到 motion>0.005(当时锚定还不可信,宁可断开 history)。
锚定修复后重投影已精确(cascade 窗口平移被逐 texel velocity 精确捕捉),
而垂直移动 dp≈2m/帧 → motion≈0.004~0.01,几乎每帧触发 reset/高 alpha → 根因 1 的重噪原样暴露。

**修复**:reset 阈值回调至 motion>0.05(仅保留给真正的不连续:预设切换/大跳变);
运动期 alpha 上限由 1.0 降为 0.5(t=motion/0.02);resolve 的 history 重投影 `prevUv`
增加 **tile 内 clamp**(fragment 所属 cascade tile 的半 texel 内缩范围),
杜绝速度把 history 采样拉进相邻 cascade tile。`_syncBSM` forceReset 同步 0.005→0.05。

### 根因 3:PCF 半径随视距连续变化,升降时模糊宽度"呼吸"

aerial/atmosphere 地面采样 `pcfRadius = mix(1.5, 3.0, viewDist/far)`:海拔变化 → 视距连续变化
→ 模糊半径连续变化(cascade3 上等效 1.5~3km)→ 阴影边缘宽度肉眼可见地涨缩。
**修复**:固定 `pcfRadius = 2.0`(texel 单位,随 cascade 分辨率自适应,不再随视距呼吸)。

### 根因 4:cascade 硬边界随相机扫动

`getFadedCascadeIndex` 用固定 0.35 阈值 → cascade 交界是一条硬线;边界位于固定视距处,
升降时随相机扫过地面,两侧分辨率/滤波足迹不同 → 可见"扫描线"。
**修复**:aerial/atmosphere 地面版本改为逐像素 IGN 抖动阈值(`alpha > jitter`,空间稳定的蓝噪声式
边界渐变,PCF 自然平滑);云体版本 jitter 为逐帧 STBN,保持硬阈值不变以免引入时域闪烁。

### 已排除

- 主相机 `frustum.near/far` 动态变化:全库仅洪水模拟的独立正交相机修改自身 frustum,主相机恒定。
- 高度淡出(`altitudeFadeStart/End`):平滑函数,非抖动源。

## 影响范围

- BSM 生成(CloudShadowPass + CloudShadowFrag)、时域 resolve、管线同步阈值。
- aerial / atmosphere 地面云影采样(PCF 半径、cascade 边界)。
- 无文件增删,文件树不变;不涉及后端。

## 优化解决方案(实施步骤)

1. `CloudShadowPass.js`:新增 `_jitterOffsets[4]`,snap 后记录 texel 计数 mod 256;render() 逐 tile 传 `u_jitterOffset`。
2. `CloudShadowFrag.glsl.js`:新增 `uniform vec2 u_jitterOffset`,`getBlueNoise()` 加偏移采样。
3. `ShadowResolvePass.js`:reset 阈值 0.005→0.05;运动 alpha 上限 0.5;shader `prevUv` tile 内 clamp。
4. `ThreeGeospatialPipeline.js`:`_syncBSM` forceReset 阈值 0.005→0.05。
5. `aerialPerspectiveEffect.frag` / `AtmospherePostProcess.js`:PCF 半径固定 2.0;cascade 选择抖动阈值。

## 性能指标

- 全部为常数级修改,无额外纹理/带宽开销;resolve 运动期恢复累积可略降低闪烁噪声感知。

## 测试方案

### 已执行

- 改动 JS 文件 ESLint 零告警;GLSL 变更 grep 复核落位。
- 数学复核:噪声偏移 `fragCoord + round(center/texel)` 与窗口位置解耦(整数域,f32 精确)。

### 需人工 GPU 验证

1. 垂直升降(100m→10km 往返,三档预设):地面阴影纹理不再周期性跳动,边界无扫描线;
2. 复测旋转 360° 与平移:V3.4.7 的修复无回退;
3. 静止 2s:时域降噪收敛正常。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowPass.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowFrag.glsl.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ShadowResolvePass.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\Shaders\aerialPerspectiveEffect.frag
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AtmospherePostProcess.js
- D:\Dev\GitHub\WebGIS-Dev\README.md / Docs\Guide\CHANGELOG.md / frontend\README.md(版本记录)
