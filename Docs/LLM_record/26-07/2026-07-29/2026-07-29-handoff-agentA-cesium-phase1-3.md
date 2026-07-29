# 前端 domains 架构 Phase 1/2/3 交接文件（Agent A — Cesium 域）

> 交接人：Agent A（Cesium 域 Phase 1/2/3）
> 日期：2026-07-29
> 版本：V3.4.90 → V3.4.91
> 任务等级：L3 架构级
> 适用范围：`frontend/src/domains/cesium/`、`frontend/src/components/Cesium/`（已清空）、alias 配置、文档同步

---

## 1. 任务总览

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 1 | 建立 `domains/ol` / `domains/cesium` / `domains/common` 骨架与 alias | ✅ |
| Phase 2 | 迁移 Cesium 入口组件 / composables / terrain | ✅ |
| Phase 3 | 迁移 Cesium modules（analysis/cloud/fluid/shallow-water/player-controller/wind）+ vendors（cesium-navigation）| ✅ |

**核心目标**：将历史上以 `components/Cesium/` 寄生的三维子应用，升级为与 OL / Common 平级的 `domains/cesium/` 领域，包含 components / composables / modules / vendors / providers / layers 六类职责。

---

## 2. 顶层目录结构（Phase 3 完成后）

```text
frontend/src/
├── domains/
│   ├── ol/                    # 二维地图领域（Agent B 负责）
│   ├── cesium/                # 三维地图领域（Agent A ← 本交接）
│   │   ├── index.js
│   │   ├── components/        # 入口 Vue 组件（5 文件）
│   │   ├── composables/       # 组合式函数（按功能模块分层）
│   │   ├── modules/           # 业务模块（analysis/cloud/fluid/shallow-water/player-controller/wind）
│   │   ├── layers/            # 图层协议/adapter（Agent B Phase 6 迁入 toc-adapters）
│   │   ├── vendors/           # 内联第三方库（cesium-navigation）
│   │   └── providers/         # 自定义 provider（terrain）
│   └── common/                # 跨引擎应用壳（Agent B 负责）
├── api/、assets/、config/、constants/、locales/、router/、stores/、workers/  # 迁移期保留
├── App.vue、main.js、cesium-shim.js
```

---

## 3. 变更文件清单

### 3.1 配置文件（alias）

| 文件 | 改动 |
|---|---|
| `frontend/vite.config.js` | 新增 `@domains`、`@ol`、`@cesium-domain`、`@common` alias |
| `frontend/jsconfig.json` | 新增 domains alias 路径映射 |
| `frontend/tsconfig.json` | 新增 domains alias 路径映射 |

### 3.2 新建入口

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/ol/index.js` | OL 领域入口（空） |
| `frontend/src/domains/cesium/index.js` | Cesium 领域入口（导出 5 个入口组件） |
| `frontend/src/domains/common/index.js` | Common 领域入口（Agent B Phase 6 已扩展导出 layer-tree） |

### 3.3 `domains/cesium/components/`（Phase 2 迁入，5 文件）

```
CesiumContainer.vue
CesiumToolPanel.vue
CesiumAdvancedEffects.vue
CesiumDataImportDialog.vue
LilGuiControls.vue
```

### 3.4 `domains/cesium/composables/`（Phase 2 迁入 + Phase 3 import 更新）

```
index.js                              ← 更新 wind 引用
core/
  cesiumRuntime.js
  cesiumStorage.js
  cesiumTimeSystem.js
  useCesiumNavigation.js              ← 更新 vendor 引用
scene/
  cesiumAtmosphere.js
  useCesiumBeautify.js
  useCesiumCreditHider.js
camera/
  useCesiumAttrViewExtentSync.js      ← 更新 store 引用
  useCesiumCameraEnhanced.js
  useCesiumSceneActions.js
layers/
  useCesiumLayers.js                  ← 更新 terrain provider 引用
  useCesiumBasemapSwitcher.js
  useCesiumUrlTracking.js             ← 更新 basemapUrlMapping 引用
  layerUtils.js
interaction/
  useCesiumInteractions.js
  useCesiumFrameRate.js
  useCesiumRenderMode.js
terrain/
  useCesiumHeightSampler.js
models/
  useCesiumModelManager.js
dataImport/
  useCesiumDataImport.js
  dataSourceDisplay.js
  useCesiumDataOpsHandlers.js
  importUtils.js
  geoTiffUtils.js
  loaders/
    utils.js
    czmlLoader.js
    geojsonLoader.js
    geotiffLoader.js
    gltfLoader.js
    kmlLoader.js                      ← 修复 vectorUtils 引用
    shpLoader.js
    tilesetLoader.js
toolModules/
  useCesiumToolModules.js             ← 更新 cloud/wind/analysis 引用
  controlsUtils.js
  sceneModule.js
  atmosphereModule.js
  cloudModule.js                      ← 更新 cloudQualityPresets 引用
  fluidModule.js
  shallowWaterModule.js
  playerModule.js
  toolsModule.js
```

### 3.5 `domains/cesium/modules/`（Phase 3 迁入，6 个子模块）

```
analysis/
  index.js
  analysisModule.js
  analysisMath.js
  visibilityAnalysis.js
  heightLimitAnalysis.js
cloud/
  index.js
  setupCloudIntegration.js
  cloudParamsApply.js
  cloudQualityPresets.js
  assetConfig.js
  lib/
    createCloudAtmosphere.js
    ThreeGeospatialPipeline.js
    CloudShadowFrag.glsl.js
    CloudShadowPass.js
    ShadowResolvePass.js
    loadBinThreeGeospatial.js
    shaderLoader.js
    shaders/bundledShaders.js
    getCesium.js
    assetPaths.js
    index.js
    AtmosphereFromThreeGeospatial/
      AtmosphereParameters.js
      AtmospherePostProcess.js
      AerialPerspectiveEffect.js
      AtmosphereForClouds.js
      LensFlareBloomStage.js
      PrecomputedTexturesLoader.js
      Shaders/
        aerialPerspectiveEffect.frag
        sky.glsl
        bruneton/definitions.glsl、common.glsl、runtime.glsl
fluid-simulation/
  FluidSimulationPanel.vue            ← 更新 useMessage/useLocale 引用
  fluidRuntime.js
shallow-water/
  ShallowWaterOverlay.vue
  composables/useShallowWater.js
  shaders/caustics.glsl.js、clouds.glsl.js、waterSurface.glsl.js
  utils/textures.js
wind/
  index.mjs
  index.d.ts
  Wind2D.js
  useCesiumWind.js
  windModule.js
player-controller/
  index.js
  usePlayerController.js
  playerController.ts
  playerDefaults.ts
  dynamicObject.ts
  types.ts
  PlayerGuidePanel.vue
  NavGuideHUD.vue                     ← 更新 formatDistanceMeasure 引用
  NavTargetPicker.vue
  systems/AnimationSystem.ts、CameraSystem.ts、InputSystem.ts、PhysicsSystem.ts
  utils/frame.ts、gltfGeometry.ts、math.ts、mobileControls.ts、terrainHelper.ts
```

### 3.6 `domains/cesium/vendors/cesium-navigation/`（Phase 3 迁入）

```
CesiumNavigation.js
core/Utils.js、createFragmentFromTemplate.js、loadView.js
viewModels/NavigationViewModel.js、NavigationControl.js、ZoomNavigationControl.js、
           ResetViewNavigationControl.js、DistanceLegendViewModel.js、UserInterfaceControl.js
svgPaths/svgCompassGyro.js、svgCompassOuterRing.js、svgCompassRotationMarker.js、svgReset.js
styles/cesium-navigation.css
```

### 3.7 `domains/cesium/providers/terrain/`（Phase 2 迁入）

```
GeoTerrainProvider.js
ArcGISTerrainProvider.js
GeoWTFS.js
decodeWorkerPool.js
lercDecode.worker.js
geoTerrainDecode.worker.js
util.js
```

### 3.8 `domains/cesium/layers/toc-adapters/`（Agent B Phase 6 迁入，非 Agent A 改动）

```
cesiumTocActions.js
```

### 3.9 被清空的旧目录

```
frontend/src/components/Cesium/   ← 已清空（所有子模块已迁入 domains/cesium/）
```

### 3.10 其他修改文件（适配 parallel agent 改动）

| 文件 | 改动原因 |
|---|---|
| `frontend/src/composables/useLayerDataImport.js` | parallel agent 已迁移 `map/toc/factory` → `@common/layer-tree/factory`，更新引用 |
| `frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue` | 修复 parallel agent 的相对路径引用（`../../../../utils/biz` → `@/utils/biz`）|
| `frontend/src/cesium-shim.js` | 注释更新为迁移期说明 |
| `frontend/src/views/HomeView.vue` | lazy import 路径改为 `@cesium-domain/components/CesiumContainer.vue` |
| `frontend/src/router/lazyHomeViewLoader.js` | 被 parallel agent 错误修改后已恢复为 `views/HomeView.vue` |
| `frontend/src/App.vue` | 被 parallel agent 错误修改后已恢复为 `components/Shell/GlobalLoading.vue` |
| `frontend/src/composables/useMessage.js` | 被 parallel agent 错误修改后已恢复为 `components/Shell/Message.vue` |
| `frontend/src/components/ControlsPanel/SpatialAnalysisPanel.vue` | 被 parallel agent 错误修改后已恢复为 `components/Common/ExtentPicker.vue` |
| `frontend/src/components/Map/MapDownloader.vue` | 被 parallel agent 错误修改后已恢复为 `components/Common/ExtentPicker.vue` |

### 3.11 文档与版本

| 文件 | 改动 |
|---|---|
| `README.md` | 版本号三处更新（V3.4.90 → V3.4.91）+ 版本演进表 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.91 条目 |
| `Docs/Guide/frontend-structure.md` | 同步为新领域树（domains/cesium 完整子树） |
| `Docs/LLM_record/26-07/2026-07-29/2026-07-29-v3490-frontend-domains-phase1-2.md` | Phase 1/2 日志 |
| `Docs/LLM_record/26-07/2026-07-29/2026-07-29-v3491-frontend-domains-phase3.md` | Phase 3 日志 |

---

## 4. 验证结果

| 门禁 | 结果 |
|---|---|
| `npm run build`（前端构建） | ✅ 通过 |
| `CheckStructureTree.py` | ✅ 文档 401 · 磁盘 401 · 漏登记 0 · 幽灵 0 |
| `CheckConfigRegistry.py` | ✅ 7 项全通过 |

---

## 5. 设计约束（后续 Agent 必须遵守）

### 5.1 依赖方向

```text
domains/ol      ─┐
                 ├──> domains/common
domains/cesium  ─┘

domains/common  不直接 import domains/ol
domains/common  不直接 import domains/cesium
domains/ol      不直接 import domains/cesium
domains/cesium  不直接 import domains/ol
```

### 5.2 文件所有权

| 域 | 负责 Agent | 禁止其他 Agent 修改 |
|---|---|---|
| `domains/cesium/*` | Agent A | ✅ |
| `domains/ol/*` | Agent B | ✅ |
| `domains/common/*` | Agent B | ✅ |
| alias 配置文件（vite/jsconfig/tsconfig） | 已稳定 | 非必要不修改 |

### 5.3 禁止事项

- 禁止 Git 写操作（commit/push/stash/reset/checkout/rebase）
- 禁止在 `/Docs` 之外新建说明类文档
- 禁止越权扩大范围
- 禁止臆造 API / 路径
- 禁止谎报测试

---

## 6. 遗留与风险

### 6.1 本阶段遗留

- `components/Cesium/` 已清空，但历史 git 记录仍保留
- terrain worker 路径需实机验证
- lazy import 路径需实机验证

### 6.2 parallel agent 遗留（需 Agent B 自行清理）

- Agent B 在执行 Phase 4/5 时留下了 stale `components/Layer`、`components/Shell`、`components/Map` 副本，其相对 import 已断裂，会阻塞完整构建
- Agent B 在执行 Phase 6 时修改了 `domains/cesium/layers/toc-adapters/cesiumTocActions.js`（非 Agent A 改动，但属于 Cesium 域，需注意）

### 6.3 后续阶段待启动

- Phase 7：Data Import / GIS IO 拆分（`composables/dataImport/`、`utils/gis/`、`domains/cesium/composables/dataImport/` 统一拆成 `common/data-import/` + `ol/data-import/` + `cesium/data-import/` 三层）
- Phase 8：stores / services / utils / constants 整理
- Phase 9：清理兼容壳与旧路径

---

## 7. 下一步建议

1. **立即**：Agent B 清理它留下的 stale `components/Layer`、`components/Shell`、`components/Map` 副本
2. **立即**：Agent B 完成 Phase 4/5（Common Shell/Home + OL 核心）
3. **后续**：启动 Phase 7（Data Import / GIS IO 拆分）
4. **最终**：Phase 8 + Phase 9（stores/services/utils/constants 整理 + 旧路径清理）

---

## 8. 关键路径别名速查

| alias | 指向 |
|---|---|
| `@/` | `frontend/src/` |
| `@domains/` | `frontend/src/domains/` |
| `@ol/` | `frontend/src/domains/ol/` |
| `@cesium-domain/` | `frontend/src/domains/cesium/` |
| `@common/` | `frontend/src/domains/common/` |

---

*本交接文件遵循 [Force_command.md](Docs/Force_command.md) 第 8 节规范编写，供后续会话零成本接续。*
