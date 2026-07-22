# 2026-07-22 体积云迁移缺陷修复（V3.3.20）

## 基本信息
- **日期时间**: 2026-07-22 10:30
- **修改类型**: Bug 修复（迁移残留缺陷）
- **严重程度**: 中高（体积云核心链路：云层基准球错位 / BSM 纹理注入失效 / 底图过曝 / shader 双轨）

---

## 事件逻辑链分析

### 核心症状
体积云模块（`Cloud/`，源码内联移植自 cesium-clouds-atmosphere / three-geospatial，V3.3.19 集成）迁移后"还是有诸多问题"：
1. 云层高度与地球不对齐、相机移动时云层抖动；
2. BSM 云影/丁达尔时灵时不灵；
3. 底图过曝发白；
4. 改 shader 文件后行为不变化。

### 根因（源码实证）
| # | 根因 | 触发链 |
|---|------|--------|
| 1 | `bottomRadius` 双值不一致 | `AtmosphereParameters.bottomRadius=6371030`(m) 与 `pipeline.params.bottomRadius=6371860`(m) 并存。云 shader `u_bottomRadius` 取后者、`u_altitudeCorrection` 取前者 → 云层基准球与相机偏移基准球错位 830m，云漂浮高度/BSM 求交错位 |
| 2 | shader 三处副本漂移 + 双轨加载 | `bundledShaders.js`（内联 bundle）优先命中，`public/cloud-atmosphere/shaders/*` 与 `lib/AtmosphereFromThreeGeospatial/Shaders/*` 成为死代码；改后两处不生效 |
| 3 | BSM 纹理自定义 `bind()` 注入不被 Cesium 识别 | `_bsmResolveGetTexture` 返回 `{_texture, bind(){...}}` 裸句柄，Cesium PostProcessStage uniform 采样走内部逻辑、不调用自定义 `bind` → BSM 纹理绑不上或采样残留 |
| 5 | `shadowFar=40000` 与云可见距离 `200000` 不匹配 | 超过 40km 的云看得见但不产生 BSM，cascade 边界硬切、移动时阴影弹出 |
| 7 | Aerial stage 曝光取错字段 | `u_atmosphereExposure` 取 `getStageByName(...)._atmosphereExposure`（手动曝光字段，`exposureFollowTimeline=true` 时不生效）而非 `_getEffectiveAtmosphereExposure()`，fallback=1.5（库原过曝值）→ 底图发白 |
| 10 | `window.__bsmShadowIntervals` 调试残留 | 生产每帧写全局变量 |
| 11 | 纹理 `.catch(()=>null)` 吞错不报 url | 某纹理 404 时只见 Cesium "uniform is null" 报错，定位困难 |

### 受影响模块
- `Cloud/lib/ThreeGeospatialPipeline.js`（bottomRadius 统一、BSM 注入、shadowFar、纹理报错）
- `Cloud/lib/AtmosphereFromThreeGeospatial/AerialPerspectiveEffect.js`（曝光取值）
- `Cloud/lib/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js`（暴露 getEffectiveExposure）
- `Cloud/lib/CloudShadowPass.js`（调试残留）
- `Cloud/lib/shaderLoader.js` / `bundledShaders.js`（shader 来源统一 + LF 行尾）

### 优化解决方案
1. **bottomRadius 统一**：`pipeline.params.bottomRadius` 改为从 `atmosphereParams.bottomRadius` 派生，删除独立默认值；所有 `u_bottomRadius`/`u_altitudeCorrection`/BSM 几何统一取自 `atmosphereParams`。保留 GUI 调参能力（通过 `atmosphereParams.bottomRadius`）。
2. **BSM 注入**：`_bsmResolveGetTexture` 不再返回自定义 `bind` 对象；resolve 输出统一经 `_blitBSM` 写入真正的 `Cesium.Texture`（`getCloudShadowTargetTexture`），uniform 返回该 `Cesium.Texture`。与 CloudShadowPass 已用 `Cesium.Texture` 包 RT 的路径对齐。
3. **Aerial 曝光**：`AtmospherePostProcess` 暴露 `getEffectiveExposure()` 公开方法；`AerialPerspectiveEffect` 持有 atmosphere 引用并调用同一方法，而非反射 `getStageByName()._atmosphereExposure`。fallback 改为 1.0（不再用过曝 1.5）。
4. **shader 来源统一**：`shaderLoader` 内联 bundle 为唯一真源；保留 fetch 回退仅用于 bundle 未命中时（带 HTML 检测），但标注 public/ 与 lib/Shaders/ 为镜像、以 bundle 为准；`bundledShaders.js` 的 `aerialPerspectiveEffect.frag` 行尾统一 LF。
5. **shadowFar**：默认值提升到与 `maxShadowLengthRayDistance` 同量级，并在 `_syncBSM` 注释明确二者关系。
6. **调试残留**：`window.__bsmShadowIntervals` 用 `import.meta.env.DEV` 包裹。
7. **纹理报错**：`.catch` 内打印失败 url。

---

## 修改内容
1. `ThreeGeospatialPipeline.js`：`params.bottomRadius` 改为派生自 `atmosphereParams`；`_bsmResolveGetTexture` 去掉自定义 `bind`、改返回 blit 后的 Cesium 纹理；`shadowFar` 默认提升；纹理 catch 补 url 日志。
2. `AerialPerspectiveEffect.js`：`u_atmosphereExposure` 改走 atmosphere 实例的 `getEffectiveExposure()`，fallback 1.0。
3. `AtmospherePostProcess.js`：新增公开 `getEffectiveExposure()` 方法（包裹现有 `_getEffectiveAtmosphereExposure`）。
4. `CloudShadowPass.js`：`window.__bsmShadowIntervals` 调试写入加 `import.meta.env.DEV` 守卫。
5. `shaderLoader.js` / `bundledShaders.js`：标注 bundle 为唯一真源；`aerialPerspectiveEffect.frag` 行尾 LF。

## 影响范围
- Cesium 三维视图体积云：云层高度对齐地球、BSM 阴影稳定生效、底图不再过曝。
- 改 shader 现在改 bundle 即生效（唯一来源）。
- 不影响关闭体积云时的原生天空与其它后处理链路。

## 测试方案
1. 进入 Cesium 视图，启用体积云（流畅档）：天空切换 Bruneton，云层贴合理想高度，移动相机云层不抖。
2. 切换均衡/极致档（启用 BSM）：地面出现云影、丁达尔光柱，移动无闪烁弹出。
3. 底图亮度正常（无发白），晨昏过渡平滑。
4. 改 `bundledShaders.js` 中某 shader → 刷新页面行为变化（验证唯一来源）。
5. 关闭体积云：管线销毁，原生天空恢复。
6. 控制台：纹理加载失败时打印 `[Cloud] 纹理加载失败: <url>`；生产环境无 `window.__bsmShadowIntervals`。

## 性能指标
- bottomRadius 统一：无额外开销，消除错位抖动。
- BSM 注入：去掉自定义 `bind` 路径，blit 已有，无新增 GPU 负担。
- shadowFar 提升：BSM 级联覆盖范围扩大，中端设备若帧率下降可经面板调 `shadowFar`。

## 修改的文件路径
- `frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js`
- `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/AerialPerspectiveEffect.js`
- `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js`
- `frontend/src/components/Cesium/Cloud/lib/CloudShadowPass.js`
- `frontend/src/components/Cesium/Cloud/lib/shaderLoader.js`
- `frontend/src/components/Cesium/Cloud/lib/shaders/bundledShaders.js`

## 依赖
- Cesium 1.132（CDN）、three@^0.185（仅 .bin 解析，未改动）。
