# 体积云地面阴影贴地锚定修复维护日志(V3.4.7)

## 日期和时间

2026-07-26 20:10

## 修改内容

修复体积云 BSM(Beer Shadow Map)地面阴影"不贴地"的三类底层 bug(V3.4.4 同步层修复后仍存留的根因):

1. 旋转视角时突然冒出大面积黑色阴影纹理。
2. 相机海拔垂直变化时阴影剧烈抖动,不贴地。
3. 阴影纹理固定在屏幕位置,而非锚定地面。

## 修改原因

V3.4.4 已处理"atlas 双缓冲 / history reset / 矩阵每帧发布"等同步问题,但三个症状依旧。本次自底向上重审整条链路(CSM 拟合 → BSM raymarch → 时域 resolve → blit → aerial 地面采样),定位到 5 个此前未发现的根因,其中第 1 条是坐标系级别的数学错误,是"阴影跟相机走、不贴地"的直接原因。

## 事件逻辑链分析

### 链路结构

```
CloudShadowPass.updateShadowCascades()   每帧用相机视锥拟合 4 级 CSM 正交盒(光空间)
        ↓ _shadowMatrices / _inverseShadowMatrices
CloudShadowPass.render()                 按 interval/运动节流,沿太阳方向 raymarch 写 BSM atlas(2×2)
        ↓ publish(矩阵与 atlas 配对快照)
ShadowResolvePass.render()               atlas 空间时域 EMA(velocity 重投影 + variance clipping)
        ↓
ThreeGeospatialPipeline._syncBSM()       blit 到共享纹理 → setCloudShadow(atmosphere/aerial)
        ↓
aerialPerspectiveEffect.frag             depth→ECEF → cascade 选择(czm_view+near/far)
                                          → shadowMatrix 投影 → atlas 采样 → exp(-od) 地面暗化
```

### 根因 1(核心,坐标系错误):光空间 bbox / texel 对齐在"转置光框架"中进行

`CloudShadowPass.updateShadowCascades()` 中:

```js
// 错误:invLightOrientation 是 光→世界,camWorld 是 相机→世界,乘积无几何意义
this._multiply(cameraToLight, invLightOrientation, camWorld);
...
// 错误配对:centerLS 回世界用了 lightOrientation(世界→光)
const centerWS4 = this._mulMat4Vec4(lightOrientation, centerLS);
```

`_lookAt` 产出的是 world→light 视图矩阵(gl-matrix 语义)。正确链应为
`cameraToLight = lightOrientation × camWorld`(相机视空间→世界→光空间),
中心回世界应乘 `invLightOrientation`。现状两处错误"互相抵消"使中心点仍连续,
但 **texel snap(`Math.round(centerLS/texel)*texel`)发生在与阴影图 x/y 轴不重合的转置框架里,量化完全失效**。

后果:cascade 正交盒原点随相机连续滑动(亚 texel),BSM 每次重栅格化时云场相对纹理网格漂移;
叠加 BSM shader 中按 `gl_FragCoord` 静态取样的 blue-noise jitter(绑定 atlas texel,而 atlas 跟随相机),
阴影内容(含噪声相位)整体跟随相机而非世界 → 症状 2(升降抖动)与症状 3(粘屏)。
snap 修复后:每级 cascade 的正交半径只依赖视锥参数(帧间常量),中心按整 texel 量化,
texel↔世界映射帧间分段恒定,静态 jitter 也随之世界稳定。

### 根因 2(节流误判):旋转运动被二次方弱化,cascade 冻结期新视野无阴影

`_measureCameraMotion()` 用 `dd = 1 - dot(dir, prevDir)`(≈θ²/2,小角度二次方)加权 160。
旋转 0.2°/帧(≈12°/s)时 dd×160≈1e-3 < 强制阈值 0.003 → **不触发强制刷新**。
smooth/balanced 预设 `bsmUpdateInterval=3~4`:旋转中 atlas+矩阵冻结 3~4 帧,
旋入的新视野区域落在旧 cascade 盒之外(UV 越界 → od=0 无阴影),到更新帧阴影整块弹入
→ 症状 1(旋转时大面积黑色阴影突然出现)。`ShadowResolvePass` 同款度量(dd×100)
使慢速运动时 temporalAlpha 仅 ~0.3,66% 权重的过期 history 在 atlas 空间被复用 → 拖影/粘滞感。

### 根因 3(矩阵/atlas 错帧):主云 stage 读 RAW 矩阵,atlas 却是 published

`_buildCloudUniforms` 中 `u_shadowMatrices` 读 `pass._shadowMatrices`、`u_shadowFar` 读 `pass._shadowFar`
(RAW,`updateShadowCascades` 每帧覆盖),而 atlas 在 interval>1 的跳帧期是旧的 published 内容
→ 跳帧期间矩阵与 atlas 失配,云体侧 BSM 采样(shadowLength/丁达尔)错位闪烁。
另:云 shader cascade 选择用当前相机 `u_cameraNear`,与 published intervals 的 near 语义不一致。

### 根因 4(atlas 跨 tile 渗色):PCF 采样无 gutter

2×2 atlas + LINEAR 过滤,消费端 PCF vogel 偏移(半径至 3 texel)可越过 tile 边界,
读到相邻 cascade 的数据(矩阵语义不同)→ cascade 盒边缘出现异常黑条/斑块(症状 1 的次要来源)。
三处消费 shader(aerial / atmosphere / 主云)均无半 texel 内缩。

### 根因 5(监听顺序脆弱):运行时重建 pass 后产生固定 1 帧滞后

运行时切换质量预设时 `_ensureBSMPasses` 重建 CloudShadowPass,其自注册 preRender listener
排到 `_syncBSM`(init 时注册)之后 → 此后每帧 `_syncBSM` 消费的是上一帧状态,
且 `wasUpdatedThisFrame` 语义错乱(resolve 对同一 atlas 重复执行)→ 高速旋转时阴影恒滞后 1 帧。

## 优化解决方案(实施步骤)

1. **CloudShadowPass.js**
   - 修正 `cameraToLight = lightOrientation × camWorld`;`centerLS → 世界` 改乘 `invLightOrientation`,
     使 texel snap 真正作用于阴影图 x/y 轴(根因 1)。
   - `_lookAt` up 向量在与太阳方向近平行时退化 → 增加 `[0,1,0]` 兜底(光矩阵与逐 cascade view 同 up)。
   - `_measureCameraMotion` 改用角度度量 `sqrt(2(1-dot))`(≈弧度),权重 8,强制阈值 0.003→0.001(根因 2)。
   - 新增 `autoRender` 选项;pipeline 场景不再自注册 preRender listener(根因 5)。
2. **ThreeGeospatialPipeline.js**
   - `_syncBSM` 在 `updateDynamicParams` 后显式调用 `sp.render()`,保证"矩阵→raymarch→publish→resolve→blit→setCloudShadow"同帧顺序确定(根因 5)。
   - 云 stage uniforms 改读 published:`getShadowMatrices()/getShadowFar()`;新增 `u_shadowNear`(published near)供 cascade 选择(根因 3)。
   - 云 shader `readShadowOpticalDepth` 增加 tile UV 半 texel gutter clamp(根因 4)。
   - resolve forceReset 阈值 0.02→0.005(根因 2)。
3. **ShadowResolvePass.js**:运动度量角度化(权重 8),`resetHistory` 阈值 0.02→0.005(根因 2)。
4. **aerialPerspectiveEffect.frag / AtmospherePostProcess.js**:`readShadowOpticalDepth(Ground)` 增加半 texel gutter clamp(根因 4)。

## 影响范围

- 前端 Cesium 体积云模块(BSM 生成、时域 resolve、管线同步)。
- 大气/空中透视后处理的地面太阳透过率与丁达尔采样。
- 不涉及后端、不涉及 UI 组件、不新增/删除文件(文件树无变化)。

## 性能指标

- texel snap 修复与 gutter clamp 为纯数学修正,零额外开销。
- 旋转期强制刷新更灵敏:smooth/balanced 预设在旋转中 BSM 刷新频率提高(与 ultra 一致的每帧),
  静止时节流不变;实测目标为旋转黑闪消除,静止帧率不回退。

## 测试方案

### 已执行(本次会话)

1. `npx eslint` 对 4 个改动 JS 文件(CloudShadowPass / ShadowResolvePass / ThreeGeospatialPipeline / AtmospherePostProcess)全部零告警。
2. grep 复核 3 处 GLSL gutter clamp、`u_shadowNear` 声明/赋值/调用点均已落位,uniform 名与既有声明(`u_shadowTexelSize` / `u_cloudShadowTexelSize`)一致。
3. 数学推导复核 snap 正确性:修复后逐 cascade view(`_lookAt(positionWS, centerWS, up)`)与 `lightOrientation` 旋转基完全一致(同 z=toSun、同 up),view 平移 x/y = -centerLS.xy(已整 texel 量化),且正交半径仅依赖视锥参数(帧间常量)→ 世界→texel 网格帧间分段恒定,满足 CSM 稳定化不变量。
4. 确认 `CloudShadowPass` 仅由 `ThreeGeospatialPipeline` 实例化,`autoRender:false` 无其他调用方受影响;`_syncBSM` 内 render→resolve→blit→setCloudShadow 同帧顺序核对无误。

### 需人工 GPU 验证(Chrome + WebGL2,三档质量预设各测)

1. 中低空(500m~5km)拖拽旋转视角 360°:不再出现大面积黑色阴影突然弹入/消失;
2. 垂直升降相机(100m→10km 往返):地面阴影轮廓无剧烈跳动,边缘仅有轻微噪声级变化;
3. 平移+静止 2s:阴影贴地不随屏幕滑动,静止后时域降噪正常收敛;
4. 运行时切换质量预设后重复 1~3:行为一致,无 1 帧滞后拖影。

## 文档同步说明

- 根 `README.md`:版本三处更新为 V3.4.7,版本表新增 V3.4.7 并保留最新三条(V3.4.4 行移除,完整记录已在 CHANGELOG)。
- `Docs/Guide/CHANGELOG.md`:新增 V3.4.7 完整条目。
- `frontend/README.md`:标题/当前版本/说明更新为 V3.4.7。
- `backend/README.md` 与 `Docs/Guide/project-structure.md`:本次无后端改动、无文件增删(文件树不变),不作变更。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\CloudShadowPass.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ShadowResolvePass.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\ThreeGeospatialPipeline.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\Shaders\aerialPerspectiveEffect.frag
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\Cloud\lib\AtmosphereFromThreeGeospatial\AtmospherePostProcess.js
- D:\Dev\GitHub\WebGIS-Dev\README.md(版本 V3.4.7)
