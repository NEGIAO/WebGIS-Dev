# 2026-07-21 Cesium 体积云·大气一体化模块集成（cesium-clouds-atmosphere）

## 基本信息
- **日期时间**: 2026-07-21 14:45
- **修改类型**: 功能替换 / 模块集成
- **严重程度**: 中高（替换已空置的 `Cloud/` 实现，重写工具面板体积云控件，引入 ~29MB 静态 LUT/纹理资源）

---

## 事件逻辑链分析

### 核心症状
1. `frontend/src/components/Cesium/Cloud/` 目录为空，但 `CesiumContainer.vue` 仍 `import { setupCloudIntegration } from './Cloud'`，运行时一旦进入 Cesium 初始化会直接失败（模块解析失败）或被 try/catch 静默跳过。
2. `useCesiumToolModules.js` 仍保留一整套**旧体积云**参数与控件（`cloudCoverage` / `cloudQuality` / Frostbite 风格调参），对应后端实现（`CloudManager.ts` 等）已不存在——架构文档 `cesium-3d-effects.md` 描述的 TypeScript Cloud 模块与磁盘现状脱节。
3. 需要将外部库 `cesium-clouds-atmosphere`（体积云 raymarch + Bruneton 大气 + 空中透视 + BSM 云影/丁达尔 + 可选 LensFlare）作为 WebGIS 的正式三维特效模块接入。

### 根因
- 历史迭代中旧 `Cloud/` / `Clouds/` 与大气 LUT 多次删除/重写（见 `cesium-3d-effects.md` §2），最新一次留下**空目录 + 仍存活的面板参数总线**。
- 新库与旧 UI 参数模型不兼容（旧：单层 coverage/quality；新：三层 layers + BSM + Bruneton LUT + 原生 WebGL 阴影）。

### 受影响模块
| 模块 | 影响 |
|------|------|
| `Cloud/` | 写入库核心源码 + 桥接 composable |
| `useCesiumToolModules.js` | 替换 `cloudParams` / `createCloudControls` |
| `CesiumContainer.vue` | 保持 `setupCloudIntegration` 调用点（实现恢复可用） |
| `public/cloud-atmosphere/` | 新增运行时纹理 / Bruneton LUT / shader 静态资源 |
| `Docs/Architecture/cesium-3d-effects.md` | 同步真实实现 |
| 三个 README | 文件树 / 版本说明 |

### 优化解决方案
1. **源码内联移植**：将 `cesium-clouds-atmosphere/src/**` 拷贝到 `Cloud/lib/`，避免 npm 私有包与 CDN 发布依赖；peer 的 `three` 项目已有（`^0.185`），`dat.gui` **不引入**——管线默认 `enableGui: false`，调参走 WebGIS 工具面板。
2. **资源落地**：`public/cloud-atmosphere/` 提供可 fetch 路径；云 3D 纹理优先复用已有 `public/textures/cloud/` 同源文件，并补齐 `stbn.bin`、蓝噪声、大气 5 个 LUT。
3. **懒加载生命周期**：仅当 `cloudsEnabled=true` 时 `await createCloudAtmosphere`；关闭时 `destroy()` 并恢复 Cesium 原生 `skyAtmosphere`/`skyBox`。
4. **参数映射**：工具面板新控件直接读写 `pipeline.params`（覆盖率、层高、曝光、BSM、丁达尔、风速、采样步数等），去掉失效的旧 Frostbite 字段。
5. **与原生大气共存策略**：启用体积云管线时临时关闭 Cesium `skyAtmosphere`/`skyBox`（由 Bruneton 天空接管）；关闭后恢复进入时快照。

### 实施步骤
1. 写本维护日志（事件链）
2. 拷贝库源码 + 静态资源
3. 适配：去掉强制 dat.gui、资源 base 走 `import.meta.env.BASE_URL`
4. 编写 `setupCloudIntegration` / `index.js` / 参数应用器
5. 重写 tool modules 体积云控件
6. 更新架构文档与三份 README 树

---

## 修改内容（实施后回填）
1. 新增 `Cloud/lib/**`：ThreeGeospatialPipeline / BSM / Bruneton / Aerial / LensFlare 等核心
2. 新增 `Cloud/setupCloudIntegration.js`、`Cloud/cloudParamsApply.js`、`Cloud/assetConfig.js`、`Cloud/index.js`
3. 重写 `useCesiumToolModules.js` 中 cloud 模块参数与控件
4. 新增 `public/cloud-atmosphere/**` 静态资源
5. 更新 `Docs/Architecture/cesium-3d-effects.md` 与三个 README

## 修改文件路径
### 新增
1. `frontend/src/components/Cesium/Cloud/index.js` — 模块统一出口
2. `frontend/src/components/Cesium/Cloud/setupCloudIntegration.js` — Vue 桥接：懒加载/销毁/天空快照
3. `frontend/src/components/Cesium/Cloud/cloudParamsApply.js` — 面板参数 → pipeline.params 映射
4. `frontend/src/components/Cesium/Cloud/assetConfig.js` — public/cloud-atmosphere 路径 + 默认参数
5. `frontend/src/components/Cesium/Cloud/lib/getCesium.js` — 全局 Cesium 注入适配（避免裸 `Cesium.xxx` 在 ESM 下未定义）
6. `frontend/src/components/Cesium/Cloud/lib/**`（21 文件 / ~173KB）— 移植 `cesium-clouds-atmosphere` 核心：ThreeGeospatialPipeline / CloudShadowPass / ShadowResolvePass / CloudShadowFrag.glsl.js / AtmosphereFromThreeGeospatial/{Aerial,Atmosphere,AtmosphereForClouds,AtmosphereParameters,AtmospherePostProcess,LensFlareBloomStage,PrecomputedTexturesLoader}.js / Shaders / shaders/bundledShaders.js / assetPaths.js / shaderLoader.js / loadBinThreeGeospatial.js / createCloudAtmosphere.js / index.js
7. `frontend/public/cloud-atmosphere/clouds-assets/` — shape.bin / shape_detail.bin / stbn.bin / local_weather.png / turbulence.png（~3.8MB；复用 `public/textures/cloud/` 同源文件并补 `stbn.bin`）
8. `frontend/public/cloud-atmosphere/assets/` — transmittance / irradiance / scattering / single_mie_scattering / higher_order_scattering `.bin`（~24MB Bruneton LUT）
9. `frontend/public/cloud-atmosphere/noise/noisergba256.png` — 蓝噪声（~258KB）
10. `frontend/public/cloud-atmosphere/shaders/` — sky.glsl / aerialPerspectiveEffect.frag / bruneton/{definitions,common,runtime}.glsl

### 修改
1. `frontend/src/components/Cesium/composables/useCesiumToolModules.js` — `cloudParams` 重写（layers + BSM + LensFlare 字段集）、`createCloudControls` 全量替换、移除 `CLOUD_QUALITY_PRESETS` 与旧 Frostbite 字段；cloud 模块状态文案改为「云+BSM/仅体积云/未启用」
2. `frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js` — 移除顶部 `import * as dat from 'dat.gui'`、构造函数新增 `enableGui`、`_setupGUI()` 改为读取 `window.dat`；init 阶段不再自动调 `_setupGUI()`，仅当 `enableGui=true` 才创建
3. `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js` — 同上移除 dat.gui 强制 import；构造函数 + init 接入 `enableGui`
4. `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/LensFlareBloomStage.js` — 移除 dat.gui 强制 import；`createGUI()` 改为读取 `window.dat`
5. `frontend/src/components/Cesium/Cloud/lib/createCloudAtmosphere.js` — 当调用方已显式传入 `cloudsAssetsBase` / `brunetonShaderBase` 等时不再走 jsDelivr CDN；强制 `enableGui=false`
6. `Docs/Guide/frontend-structure.md` — `Cloud/` 树更新（移除 TS 旧结构 → 新 lib 内联架构）

### 未改动但已对齐
- `CesiumContainer.vue` 的 `setupCloudIntegration` 调用点继续可用（接口签名 `setupCloudIntegration({ viewer, cloudParams, atmosphereParams }) → cleanup` 保留）

## 影响范围
- Cesium 三维视图「体积云」卡片：参数模型变更，旧书签/本地存储若曾写 cloudParams 将不兼容（默认全关，无破坏性）
- 首次启用会加载约 29MB 纹理/LUT（可缓存）
- GPU：raymarch + 4 级联 BSM，中端设备需降 `maxSteps`

## 测试方案
1. 进入 Cesium 视图：无体积云时界面正常，控制台无 `./Cloud` 解析错误
2. 打开工具面板 → 体积云 → 启用：天空切换为 Bruneton，体积云可见
3. 调节覆盖率 / 曝光 / BSM：实时生效
4. 关闭体积云：管线销毁，原生天空恢复
5. 切换离开 Cesium / 组件卸载：无 WebGL 泄漏报错

## 性能指标
- 静态资源：云纹理 ~4MB + 大气 LUT ~24MB
- 运行时：默认 `maxSteps=500`、BSM 1024×4；可用面板降采样步数
- 默认关闭，不占用首屏初始化时间

## 依赖
- `three`（已有，用于 `.bin` → Data3DTexture 解析）
- 全局 `window.Cesium`（CDN 升级到 1.132，因 `Texture3D` 自 1.130 引入；1.122 缺该类导致初始化失败；变更见 [cesiumRuntime.js](frontend/src/components/Cesium/composables/cesiumRuntime.js)）
