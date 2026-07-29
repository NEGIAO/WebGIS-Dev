# 前端 Ol / Cesium / Common 领域化重构方案与执行计划

> 文档状态：草案 / 待确认  
> 创建日期：2026-07-29  
> 任务等级：L3 架构级重构计划  
> 适用范围：`frontend/src/` 前端目录结构、模块归属、跨引擎边界、后续迁移执行计划  
> 核心目标：将历史上以 OpenLayers 为默认语境生长的前端结构，演进为 `domains/ol`、`domains/cesium`、`domains/common` 三领域架构，降低 Cesium 模块深度与跨域耦合，方便多 Agent / 多会话分阶段交接实施。

---

## 1. 背景与核心问题

当前 `frontend/src/` 的历史演进路径是：

1. 项目早期主要围绕 OpenLayers 二维地图开发；
2. 因此 `src/components`、`src/composables/map`、`src/utils/gis` 等目录天然以 OL / 2D 地图为默认上下文；
3. 后续新增 Cesium 三维能力后，大量三维模块集中放入 `frontend/src/components/Cesium/`；
4. 结果导致 `components/Cesium` 实际承担了完整三维子应用的职责，而不仅是 Vue 组件目录。

当前最突出的结构问题：

- `components/Cesium/` 目录过深、过重，混合了 UI、runtime、provider、shader、vendor、data import、tool modules 等职责；
- `src/` 根目录仍隐含“OL 应用”的历史假设，Cesium 只能寄生在 `components` 下；
- OL、Cesium、公共应用壳、图层树、数据导入协议之间的边界不够明确；
- 后续新增三维能力时，默认会继续塞入 `components/Cesium/`，导致该目录继续膨胀；
- 多 Agent / 多会话协作时，缺少明确的阶段计划、边界规则和交接标准。

本次重构不是简单“移动文件夹”，而是建立新的前端领域边界。

---

## 2. 重构目标

### 2.1 顶层目标

将前端主要业务代码组织为三个领域：

```text
frontend/src/domains/
├── ol/        # OpenLayers 二维地图领域
├── cesium/    # Cesium 三维地图领域
└── common/    # 跨 OL / Cesium 的应用壳、公共 UI、协议与共享能力
```

目标是让 `src/` 不再默认等价于 OL 应用，而是成为多个地图引擎领域并存的前端根目录。

### 2.2 非目标

本计划第一阶段不追求一次性完成所有迁移。

以下事项不在第一批强制范围内：

- 不一次性迁移全部 451 个前端文件；
- 不第一时间重构所有巨型 Vue 文件；
- 不第一时间拆分全部 Pinia store；
- 不第一时间重写 API 层；
- 不第一时间移动 `locales/`、`assets/`、`workers/`；
- 不在未验证构建前批量删除旧路径；
- 不在未取得用户明确批准前进行 L3 目录迁移实施。

---

## 3. 总体依赖规则

三大领域必须遵守单向依赖规则：

```text
domains/ol      ─┐
                 ├──> domains/common
domains/cesium  ─┘

domains/common  不直接 import domains/ol
domains/common  不直接 import domains/cesium
domains/ol      不直接 import domains/cesium
domains/cesium  不直接 import domains/ol
```

允许：

- `ol -> common`
- `cesium -> common`

禁止：

- `common -> ol`
- `common -> cesium`
- `ol -> cesium`
- `cesium -> ol`

如 OL 与 Cesium 必须互通，应通过 common 中的协议层、命令总线或 adapter 间接连接，例如：

```text
domains/common/map-view/
domains/common/layer-tree/
domains/common/command-bus/
domains/common/data-protocol/
```

---

## 4. 目标目录结构总览

```text
frontend/src/
├── domains/
│   ├── ol/
│   │   ├── components/
│   │   ├── basemap/
│   │   ├── layer/
│   │   ├── drawing/
│   │   ├── measure/
│   │   ├── routing/
│   │   ├── search/
│   │   ├── spatial-analysis/
│   │   ├── data-import/
│   │   ├── tile-source/
│   │   ├── startup/
│   │   ├── url-state/
│   │   ├── composables/
│   │   ├── services/
│   │   ├── adapters/
│   │   ├── utils/
│   │   └── index.js
│   │
│   ├── cesium/
│   │   ├── components/
│   │   ├── modules/
│   │   │   ├── analysis/
│   │   │   ├── cloud/
│   │   │   ├── fluid-simulation/
│   │   │   ├── shallow-water/
│   │   │   ├── wind/
│   │   │   ├── player-controller/
│   │   │   └── navigation/
│   │   ├── composables/
│   │   ├── layers/
│   │   ├── providers/
│   │   ├── runtime/
│   │   ├── data-import/
│   │   ├── vendors/
│   │   ├── shaders/
│   │   ├── adapters/
│   │   ├── utils/
│   │   ├── types/
│   │   └── index.js
│   │
│   └── common/
│       ├── app/
│       ├── shell/
│       ├── components/
│       ├── ui/
│       ├── layer-tree/
│       ├── map-view/
│       ├── data-protocol/
│       ├── data-import/
│       ├── command-bus/
│       ├── url-state/
│       ├── user/
│       ├── chat/
│       ├── weather/
│       ├── compass/
│       ├── services/
│       ├── stores/
│       ├── utils/
│       └── index.js
│
├── api/          # HTTP API 层，迁移期暂时保留
├── assets/       # 全局样式与静态资源，迁移期暂时保留
├── config/       # publicRuntime 等全局配置，迁移期暂时保留
├── constants/    # 迁移期暂时保留，后续按职责下沉/上移
├── locales/      # i18n，迁移期暂时保留
├── router/       # 路由，迁移期暂时保留
├── stores/       # Pinia 全局 store，迁移期暂时保留
├── workers/      # Worker，迁移期暂时保留
├── App.vue
├── main.js
└── cesium-shim.js
```

---

## 5. `domains/cesium` 设计

### 5.1 定位

`domains/cesium` 是完整三维地图领域，不再挂在 `components/Cesium` 下。

它可以包含：

- Cesium Vue UI 组件；
- Cesium composables；
- Cesium runtime；
- Cesium provider；
- Cesium shader；
- Cesium 内联第三方库；
- Cesium 数据加载器；
- Cesium 图层 adapter；
- Cesium 工具面板模块。

### 5.2 推荐结构

```text
frontend/src/domains/cesium/
├── components/
│   ├── CesiumContainer.vue
│   ├── CesiumToolPanel.vue
│   ├── CesiumAdvancedEffects.vue
│   ├── CesiumDataImportDialog.vue
│   ├── LilGuiControls.vue
│   └── panels/
│
├── modules/
│   ├── analysis/
│   ├── cloud/
│   ├── fluid-simulation/
│   ├── shallow-water/
│   ├── wind/
│   ├── player-controller/
│   └── navigation/
│
├── composables/
│   ├── core/
│   ├── scene/
│   ├── camera/
│   ├── interaction/
│   ├── terrain/
│   ├── models/
│   ├── tool-modules/
│   └── index.js
│
├── layers/
│   ├── imagery/
│   ├── terrain/
│   ├── data-source/
│   ├── tileset/
│   ├── toc-adapters/
│   └── index.js
│
├── providers/
│   └── terrain/
│
├── runtime/
│   ├── cesiumRuntime.js
│   ├── cesiumStorage.js
│   ├── cesiumTimeSystem.js
│   └── getCesium.js
│
├── data-import/
│   ├── composables/
│   ├── loaders/
│   ├── adapters/
│   └── utils/
│
├── vendors/
│   ├── cesium-navigation/
│   ├── cesium-wind-layer/
│   └── cloud-atmosphere/
│
├── shaders/
├── utils/
├── types/
└── index.js
```

### 5.3 当前文件迁移参考

| 当前路径 | 目标路径 |
|---|---|
| `components/Cesium/CesiumContainer.vue` | `domains/cesium/components/CesiumContainer.vue` |
| `components/Cesium/CesiumToolPanel.vue` | `domains/cesium/components/CesiumToolPanel.vue` |
| `components/Cesium/CesiumAdvancedEffects.vue` | `domains/cesium/components/CesiumAdvancedEffects.vue` |
| `components/Cesium/CesiumDataImportDialog.vue` | `domains/cesium/components/CesiumDataImportDialog.vue` |
| `components/Cesium/LilGuiControls.vue` | `domains/cesium/components/LilGuiControls.vue` |
| `components/Cesium/Analysis/` | `domains/cesium/modules/analysis/` |
| `components/Cesium/Cloud/` | `domains/cesium/modules/cloud/`，内部 vendor 代码可再下沉到 `vendors/cloud-atmosphere/` |
| `components/Cesium/FluidSimulation/` | `domains/cesium/modules/fluid-simulation/` |
| `components/Cesium/ShallowWater/` | `domains/cesium/modules/shallow-water/` |
| `components/Cesium/PlayerController/` | `domains/cesium/modules/player-controller/` |
| `components/Cesium/cesium-navigation/` | `domains/cesium/vendors/cesium-navigation/` |
| `components/Cesium/cesium-wind-layer/` | `domains/cesium/modules/wind/` 或 `domains/cesium/vendors/cesium-wind-layer/` |
| `components/Cesium/composables/` | `domains/cesium/composables/`，其中 data import / runtime / layers 可继续归位 |
| `components/Cesium/terrain/` | `domains/cesium/providers/terrain/` |

---

## 6. `domains/ol` 设计

### 6.1 定位

`domains/ol` 放所有 OpenLayers 二维地图相关内容。

包括：

- OL 地图容器；
- 2D 图层；
- 2D 底图；
- OL 绘制；
- OL 测量；
- OL 路线渲染；
- OL 空间分析；
- OL 数据导入 adapter；
- OL tile source；
- OL 事件交互；
- OL 搜索联动。

### 6.2 推荐结构

```text
frontend/src/domains/ol/
├── components/
│   ├── MapContainer.vue
│   ├── MapControlsBar.vue
│   ├── MapSwipeController.vue
│   ├── MapDownloader.vue
│   └── MapEasterEgg.vue
│
├── basemap/
│   ├── composables/
│   ├── constants/
│   ├── factories/
│   ├── resilience/
│   └── index.js
│
├── layer/
│   ├── components/
│   ├── composables/
│   ├── managers/
│   ├── style/
│   ├── feature/
│   ├── export/
│   └── index.js
│
├── drawing/
├── measure/
├── routing/
├── search/
├── spatial-analysis/
├── data-import/
├── tile-source/
├── startup/
├── url-state/
├── composables/
├── services/
├── adapters/
├── utils/
└── index.js
```

### 6.3 当前文件迁移参考

| 当前路径 | 目标路径 |
|---|---|
| `components/Map/` | `domains/ol/components/` |
| `composables/map/basemapSystem.js` | `domains/ol/basemap/` |
| `composables/map/features/useBasemapLayerBootstrap.js` | `domains/ol/basemap/composables/` |
| `composables/map/features/useBasemapResilience.js` | `domains/ol/basemap/resilience/` |
| `composables/map/features/useDrawMeasure.js` | `domains/ol/drawing/composables/` 或 `domains/ol/measure/composables/` |
| `composables/map/features/drawingToolRegistry.js` | `domains/ol/drawing/registry/` |
| `composables/map/features/drawingGeometryUtils.js` | `domains/ol/drawing/geometry/` |
| `components/Routing/` | `domains/ol/routing/components/` |
| `composables/map/features/useRouteRendering.js` | `domains/ol/routing/renderers/` |
| `composables/map/routeService.js` | `domains/ol/routing/services/` |
| `components/Search/` | `domains/ol/search/components/` |
| `composables/map/features/useSpatialAnalysis.js` | `domains/ol/spatial-analysis/composables/` |
| `composables/tileSource/` | `domains/ol/tile-source/`，如果 Cesium 不复用 |
| `utils/map/` | `domains/ol/utils/` 或 `domains/common/map-view/`，按复用情况决定 |

---

## 7. `domains/common` 设计

### 7.1 定位

`common` 不是垃圾桶。只有跨 OL / Cesium 都需要的能力才进入 common。

允许放入：

- 应用壳；
- 跨引擎公共 UI；
- 跨引擎协议；
- 通用服务；
- 全局用户、聊天、天气、罗盘等非单一地图引擎逻辑；
- 通用工具函数；
- 公共状态协调。

禁止放入：

- Cesium provider；
- Cesium shader；
- OL draw interaction；
- OL 专用 layer factory；
- 具体到单一引擎的数据渲染 adapter；
- 因“不知道放哪”而临时堆放的业务逻辑。

### 7.2 推荐结构

```text
frontend/src/domains/common/
├── app/
│   ├── HomeView.vue
│   ├── home/
│   └── layout/
│
├── shell/
│   ├── TopBar.vue
│   ├── SidePanel.vue
│   ├── ResizeHandle.vue
│   ├── GlobalLoading.vue
│   ├── Message.vue
│   ├── PersistentAnnouncementBar.vue
│   └── MagicCursor.vue
│
├── components/
│   ├── ExtentPicker.vue
│   └── shared/
│
├── ui/
├── layer-tree/
├── map-view/
├── data-protocol/
├── data-import/
├── command-bus/
├── url-state/
├── user/
├── chat/
├── weather/
├── compass/
├── services/
├── stores/
├── utils/
└── index.js
```

### 7.3 当前文件迁移参考

| 当前路径 | 目标路径 |
|---|---|
| `views/HomeView.vue` | `domains/common/app/HomeView.vue` |
| `views/home/` | `domains/common/app/home/` |
| `components/Shell/` | `domains/common/shell/` |
| `components/Common/ExtentPicker.vue` | `domains/common/components/ExtentPicker.vue` |
| `components/UserCenter/` | `domains/common/user/components/` |
| `components/Chat/` | `domains/common/chat/components/` |
| `composables/chat/` | `domains/common/chat/composables/` |
| `services/agent/` | `domains/common/chat/agent/` 或 `domains/common/command-bus/`，按职责拆 |
| `components/Weather/` | `domains/common/weather/components/` |
| `composables/weather/` | `domains/common/weather/composables/` |
| `components/Compass/` | `domains/common/compass/components/` |
| `components/feng-shui-compass-svg/` | `domains/common/compass/svg/` |
| `services/CompassManager.ts` | `domains/common/compass/services/CompassManager.ts` |
| `utils/url/` | `domains/common/url-state/` |
| `utils/units.js` | `domains/common/map-view/units.js` |
| `utils/coordinateFormatter.js` | `domains/common/map-view/coordinateFormatter.js` |
| `utils/map/featureKey.js` | `domains/common/data-protocol/featureKey.js` |

---

## 8. Layer / TOC 特殊拆分规则

Layer / TOC 不能简单归入 OL。

原因：当前 TOC / 图层树已经包含 Cesium 三维数据元数据，图层树本质上已经是跨 2D / 3D 的公共层。

目标拆分：

```text
domains/common/layer-tree/
├── components/
│   ├── TOCPanel.vue
│   ├── LayerPanel.vue
│   ├── TOCTreeItem.vue
│   ├── LayerPropertiesDialog.vue
│   └── SharedResourceTreeItem.vue
│
├── protocol/
│   ├── layerNode.ts
│   ├── layerAction.ts
│   └── layerAdapter.ts
│
├── actions/
├── menu/
└── index.js
```

```text
domains/ol/layer/
├── adapters/
├── feature/
├── style/
├── export/
└── components/
    └── LayerControlPanel.vue
```

```text
domains/cesium/layers/
├── adapters/
├── data-source/
├── tileset/
├── terrain/
└── toc-adapters/
```

归属原则：

| 内容 | 目标位置 |
|---|---|
| 图层树 UI 壳 | `common/layer-tree/components/` |
| 图层树协议 | `common/layer-tree/protocol/` |
| 右键菜单调度 | `common/layer-tree/menu/` 或 `common/layer-tree/actions/` |
| OL 图层实现 | `ol/layer/` |
| Cesium 图层实现 | `cesium/layers/` |
| 跨引擎图层节点构建协议 | `common/layer-tree/protocol/` |

---

## 9. Data Import / GIS IO 特殊拆分规则

Data Import / GIS IO 跨 OL 和 Cesium，不能粗暴归一边。

目标拆分：

```text
domains/common/data-import/
├── parsers/
├── archive/
├── crs/
├── protocol/
└── index.js
```

```text
domains/ol/data-import/
├── composables/
├── adapters/
├── renderers/
└── index.js
```

```text
domains/cesium/data-import/
├── composables/
├── loaders/
├── adapters/
└── index.js
```

判断标准：

| 内容类型 | 放置位置 |
|---|---|
| 解析 KML / SHP / TIF / DBF / ZIP | `common/data-import` |
| CRS、坐标纠偏、解压、格式识别 | `common/data-import` |
| 生成 OL Layer / Feature | `ol/data-import` |
| OL 栅格 / 矢量渲染 | `ol/data-import/renderers` |
| 生成 Cesium DataSource / Entity / Tileset | `cesium/data-import` |
| Cesium GLTF / 3D Tiles / CZML 加载 | `cesium/data-import/loaders` |
| UI 面板 | 根据入口归属 OL 或 Cesium |

---

## 10. 迁移期暂不移动的目录

第一轮迁移建议暂时保留以下目录，避免扩大风险：

```text
frontend/src/api/
frontend/src/assets/
frontend/src/config/
frontend/src/constants/
frontend/src/locales/
frontend/src/router/
frontend/src/stores/
frontend/src/workers/
```

原因：

- `api/` 是 HTTP 层，第一阶段迁移收益不高；
- `config/publicRuntime.ts` 是配置单点入口，保持稳定更安全；
- `stores/` 是 Pinia 全局状态，贸然拆分会影响面过大；
- `locales/` 体积大但不是当前核心问题；
- `workers/` 应等待 data import 分层稳定后再处理；
- `constants/` 迁移期可作为兼容层，后续逐步下沉到 OL / Cesium 或上移到 Common。

---

## 11. 路径别名建议

建议新增 alias：

```text
@/              -> frontend/src/
@domains/       -> frontend/src/domains/
@ol/            -> frontend/src/domains/ol/
@cesium-domain/ -> frontend/src/domains/cesium/
@common/        -> frontend/src/domains/common/
```

不优先建议 `@cesium/`，原因是可能与第三方 Cesium 概念混淆。

如果后续确认团队更偏好短路径，可改为：

```text
@ol/
@cesium/
@common/
```

但必须在方案批准阶段一次性确定，避免迁移中反复变更 import 风格。

---

## 12. 多阶段执行计划

> 重要：每个阶段都应作为独立任务执行，完成后更新日志、版本号、结构树并跑门禁。不要跨阶段顺手改其他问题。

### Phase 0：方案确认与基线盘点

**目标**：确认架构方案、冻结迁移规则、建立迁移基线。

**任务**：

1. 用户确认本文件中的目标结构；
2. 明确 alias 命名，尤其是 Cesium alias；
3. 明确 Layer / TOC 是否按 `common/layer-tree + ol/layer + cesium/layers` 拆；
4. 明确 Data Import 是否按 `common/data-import + ol/data-import + cesium/data-import` 拆；
5. 扫描当前 `frontend/src/` 文件数、主要大文件、当前 import 热点；
6. 记录当前可用构建 / 检查命令。

**预期产物**：

- 本方案文档获得用户明确批准；
- 形成后续阶段执行顺序；
- 不改业务代码。

**验收标准**：

- 用户明确批准进入 Phase 1；
- 未执行 Git 写操作；
- 后续 Agent 能只读本文件理解整体路线。

---

### Phase 1：建立 `domains` 骨架与 alias

**目标**：建立新架构入口，但不迁移业务逻辑。

**任务**：

1. 新建目录：

```text
frontend/src/domains/ol/
frontend/src/domains/cesium/
frontend/src/domains/common/
```

2. 新增各域 `index.js` 或 `index.ts` 空出口 / 注释出口；
3. 在 Vite / JS config / TS config 中配置 alias：

```text
@domains/
@ol/
@cesium-domain/
@common/
```

4. 确认 ESLint / Vite 对 alias 解析正常；
5. 更新 `Docs/Guide/frontend-structure.md`；
6. 如涉及结构树检查，同步运行 `CheckStructureTree.py`；
7. 如未涉及配置 key，不需要修改 `.env.example` 与 `catalog.py`。

**预期产物**：

- 新目录骨架存在；
- alias 可解析；
- 没有业务行为变化。

**验收标准**：

- `npm run build` 或项目约定前端构建通过；
- `python CheckStructureTree.py` 通过或明确说明失败原因；
- `python CheckConfigRegistry.py` 通过或明确说明与本阶段无关但仍执行结果；
- README / CHANGELOG / LLM 日志按 Force 规范完成。

---

### Phase 2：迁移 Cesium 领域第一批

**目标**：把当前最重的 `components/Cesium/` 从 components 目录释放出来，建立正式三维领域。

**任务**：

1. 迁移 Vue 入口组件：

```text
components/Cesium/CesiumContainer.vue
components/Cesium/CesiumToolPanel.vue
components/Cesium/CesiumAdvancedEffects.vue
components/Cesium/CesiumDataImportDialog.vue
components/Cesium/LilGuiControls.vue
```

到：

```text
domains/cesium/components/
```

2. 迁移 Cesium composables：

```text
components/Cesium/composables/
```

到：

```text
domains/cesium/composables/
```

3. 迁移 terrain provider：

```text
components/Cesium/terrain/
```

到：

```text
domains/cesium/providers/terrain/
```

4. 更新所有 import；
5. 优先使用 `@cesium-domain/` alias，减少深层相对路径；
6. 不改业务逻辑，只做路径迁移；
7. 更新 `frontend-structure.md`；
8. 运行构建与门禁。

**预期产物**：

- `components/Cesium` 主要入口和 composables 被迁出；
- `components/` 目录语义开始恢复为 UI 组件集合；
- Cesium 领域具备新根目录。

**风险点**：

- 相对路径更新遗漏；
- lazy import 路径失效；
- CSS / asset 引用路径失效；
- worker 或 shader 路径如果被移动可能失效，因此本阶段尽量不动 shader / vendor 深层资源。

**验收标准**：

- 前端构建通过；
- Cesium 页面能打开；
- 基础 3D 场景、工具面板、底图、地形能正常加载；
- 未引入新的类型错误；
- 结构树、日志、版本号完成。

---

### Phase 3：迁移 Cesium modules / vendors

**目标**：继续整理 Cesium 内部模块，让三维域内部结构清晰。

**任务**：

1. 迁移分析模块：

```text
components/Cesium/Analysis/ -> domains/cesium/modules/analysis/
```

2. 迁移流体模拟：

```text
components/Cesium/FluidSimulation/ -> domains/cesium/modules/fluid-simulation/
```

3. 迁移浅水：

```text
components/Cesium/ShallowWater/ -> domains/cesium/modules/shallow-water/
```

4. 迁移人物漫游：

```text
components/Cesium/PlayerController/ -> domains/cesium/modules/player-controller/
```

5. 迁移导航 vendor：

```text
components/Cesium/cesium-navigation/ -> domains/cesium/vendors/cesium-navigation/
```

6. 风场模块按实际耦合决定：

```text
components/Cesium/cesium-wind-layer/ -> domains/cesium/modules/wind/
```

或：

```text
components/Cesium/cesium-wind-layer/ -> domains/cesium/vendors/cesium-wind-layer/
```

7. Cloud 模块暂时可先整体迁入：

```text
components/Cesium/Cloud/ -> domains/cesium/modules/cloud/
```

后续再决定是否拆出 `vendors/cloud-atmosphere`。

**预期产物**：

- `components/Cesium/` 基本清空或仅保留兼容壳；
- Cesium 内部模块按功能归类；
- vendor 与业务模块有初步区分。

**风险点**：

- Cloud / shader / public asset 路径；
- wind layer 内部相对 import；
- player controller TS 类型路径；
- worker 路径。

**验收标准**：

- Cesium 大气 / 云 / 风场 / 流体 / 人物漫游基础功能可用；
- 前端构建通过；
- 结构树同步；
- 日志和版本号完成。

---

### Phase 4：迁移 Common Shell / Home

**目标**：把应用壳与地图引擎域分离。

**任务**：

1. 迁移 Home：

```text
views/HomeView.vue -> domains/common/app/HomeView.vue
views/home/ -> domains/common/app/home/
```

2. 更新 router lazy import；
3. 迁移 Shell：

```text
components/Shell/ -> domains/common/shell/
```

4. 迁移公共组件：

```text
components/Common/ -> domains/common/components/
```

5. 更新 Home / Shell / common components 的 import；
6. 不在本阶段迁移 OL / Cesium 业务逻辑；
7. 更新结构树与门禁。

**预期产物**：

- Home 与应用壳归入 common；
- 地图引擎入口由 common app 组合 OL / Cesium；
- 后续可逐步让 common 成为跨引擎协调层。

**风险点**：

- Router 路径；
- lazyHomeViewLoader；
- Shell 对地图状态、store、组件路径的依赖；
- 全局 loading / message 路径。

**验收标准**：

- 首页可正常进入；
- 顶栏、侧栏、全局 loading、消息、公告条正常；
- 2D / 3D 入口仍可访问；
- 构建与门禁通过。

---

### Phase 5：迁移 OL 地图核心

**目标**：将历史默认 OL 代码显式归入 `domains/ol`。

**任务**：

1. 迁移地图组件：

```text
components/Map/ -> domains/ol/components/
```

2. 迁移 `composables/map/`，但不原样塞入一个目录，应按职责拆分：

```text
composables/map/features/useBasemap* -> domains/ol/basemap/
composables/map/features/useDraw* -> domains/ol/drawing/
composables/map/features/useRoute* -> domains/ol/routing/
composables/map/features/useSpatialAnalysis.js -> domains/ol/spatial-analysis/
composables/map/features/useStartup* -> domains/ol/startup/
composables/map/features/useMapViewUrl* / useBasemapUrlMapping -> domains/ol/url-state/ 或 common/map-view/
```

3. 迁移 tile source：

```text
composables/tileSource/ -> domains/ol/tile-source/
```

4. 按复用情况处理 basemap constants：

- OL 专用：`domains/ol/basemap/constants/`；
- OL / Cesium 共用：保留在 `constants/` 或上移到 `domains/common/map-view/`，另开阶段处理。

5. 更新 import；
6. 运行构建与门禁。

**预期产物**：

- 2D 地图核心显式进入 `domains/ol`；
- `composables/map/features` 巨型抽屉消失或明显瘦身；
- OL 领域初步成型。

**风险点**：

- MapContainer 体量大；
- OL interaction / layer / route / startup 互相依赖；
- URL 状态同时影响 2D / 3D；
- basemap 同时被 Cesium 使用。

**验收标准**：

- 2D 地图能初始化；
- 底图切换、图层管理、绘制测量、路线、搜索、空间分析基本可用；
- 构建通过；
- 门禁通过。

---

### Phase 6：拆 Layer / TOC

**目标**：把跨引擎图层树与 OL / Cesium 图层实现拆开。

**任务**：

1. 迁移图层树 UI：

```text
components/Layer/TOCPanel.vue
components/Layer/LayerPanel.vue
components/Layer/TOCTreeItem.vue
components/Layer/LayerPropertiesDialog.vue
components/Layer/SharedResourceTreeItem.vue
```

到：

```text
domains/common/layer-tree/components/
```

2. 迁移 TOC 菜单 / action 调度：

```text
composables/map/toc/ -> domains/common/layer-tree/
```

3. OL 专用图层能力进入：

```text
domains/ol/layer/
```

4. Cesium 专用图层能力进入：

```text
domains/cesium/layers/
```

5. `stores/layer/` 是否迁移需谨慎，本阶段可先保持 `stores/layer/`，只调整 import 和 adapter；
6. 明确 layer node protocol，避免 common 反向依赖 OL / Cesium。

**预期产物**：

- 图层树 UI / 协议归 common；
- OL 图层实现归 OL；
- Cesium 图层实现归 Cesium；
- TOC 不再被误认为纯 OL 能力。

**风险点**：

- TOC 当前可能直接调用 OL / Cesium 实现；
- 右键菜单动作可能依赖具体 map runtime；
- 属性表与 OL Feature 绑定较深；
- Cesium layer metadata 与 TOC 节点映射。

**验收标准**：

- TOC 能显示 2D / 3D 图层；
- 图层显隐、透明度、右键菜单核心动作正常；
- 属性表可用；
- Cesium 图层节点不丢失；
- 构建与门禁通过。

---

### Phase 7：拆 Data Import / GIS IO

**目标**：统一数据导入、解析、引擎 adapter 边界。

**任务**：

1. 通用解析 / CRS / 解压进入 common：

```text
utils/gis/parsers/ -> domains/common/data-import/parsers/
utils/gis/archive/decompress/crs 相关 -> domains/common/data-import/
utils/coordTransform.js / utils/crsUtils.js -> domains/common/data-import/crs/ 或 common/map-view/
```

2. OL 导入进入：

```text
composables/useLayerDataImport.js -> domains/ol/data-import/composables/
composables/dataImport/ -> domains/ol/data-import/renderers/ 或 common/data-import，按职责拆
```

3. Cesium 导入进入：

```text
components/Cesium/composables/dataImport/ -> domains/cesium/data-import/
```

4. Worker 暂时可保留原路径，待引用稳定后再决定是否迁移；
5. 明确 parser / loader / adapter / renderer 命名；
6. 更新 import；
7. 运行构建与关键导入功能验证。

**预期产物**：

- 格式解析能力不再散落；
- OL / Cesium 只保留各自 adapter 和渲染逻辑；
- 后续修 KML / SHP / TIF 能明确改哪里。

**风险点**：

- TIF / SHP / KML 文件导入链路长；
- Worker 路径和动态 import 容易断；
- 2D / 3D 对同一格式的处理差异；
- 大文件性能回归。

**验收标准**：

- GeoJSON / KML / SHP / TIF / GLTF / 3D Tiles 关键路径按实际支持范围验证；
- 大文件导入无明显性能回退；
- 构建与门禁通过。

---

### Phase 8：整理 stores / services / utils / constants

**目标**：在主要领域稳定后，清理剩余横切目录。

**任务**：

1. 检查 `stores/` 中哪些是全局状态、哪些是 OL 专用、哪些是 Cesium 专用；
2. 全局状态可保持 `stores/` 或迁入 `domains/common/stores/`；
3. OL 专用状态可迁入 `domains/ol/stores/`；
4. Cesium 专用状态可迁入 `domains/cesium/stores/`；
5. 检查 `services/` 中的领域归属；
6. 检查 `utils/` 中的纯函数、业务工具、GIS 工具是否归位；
7. 检查 `constants/` 中 basemap / tile source / agent schema 等归属。

**预期产物**：

- 横切目录明显瘦身；
- 领域内部聚合度提高；
- 新代码有明确落点。

**风险点**：

- Store 迁移影响全局；
- services 与 API / composables 关系复杂；
- constants 被多处依赖。

**验收标准**：

- 构建通过；
- 主要页面和核心功能可用；
- 文档树更新完整；
- 无新的循环依赖或深层相对路径大面积回潮。

---

### Phase 9：清理兼容壳与旧路径

**目标**：删除迁移期兼容层，完成结构收口。

**任务**：

1. 搜索旧路径引用：

```text
components/Cesium
components/Map
composables/map/features
composables/tileSource
components/Layer
```

2. 删除已无引用的兼容 barrel / 转发壳；
3. 清理废弃注释；
4. 更新 `frontend-structure.md` 为最终树；
5. 检查 README / CHANGELOG 是否只保留摘要，避免复制完整结构树；
6. 运行完整门禁。

**预期产物**：

- 旧目录不再承担业务；
- 新架构成为唯一事实；
- 文档、结构树、代码路径一致。

**验收标准**：

- 全量构建通过；
- CheckStructureTree 通过；
- CheckConfigRegistry 通过；
- 文档结构树与真实目录一致；
- 无旧路径残留引用。

---

## 13. 每阶段 Agent 交接模板

每个阶段结束时，必须在会话末尾提供 Force 规范要求的交接块，并额外补充本计划专用交接信息。

建议每个阶段日志中包含：

```markdown
## 架构重构阶段交接

- 当前阶段：Phase X - <阶段名>
- 阶段目标：<本阶段原计划目标>
- 已完成：
  - <完成项 1>
  - <完成项 2>
- 未完成：
  - <未完成项，说明原因>
- 改动范围：
  - <目录 / 文件>
- 旧路径引用处理：
  - <已清理 / 保留兼容 / 待下一阶段>
- 构建与门禁：
  - npm run build: <结果>
  - CheckStructureTree.py: <结果>
  - CheckConfigRegistry.py: <结果>
- 已知风险：
  - <风险点>
- 下一阶段建议：
  - <下一 Agent 应从哪里开始>
```

---

## 14. 每阶段通用执行约束

所有后续 Agent 必须遵守：

1. 每次开始先声明任务等级；
2. L3 实施前必须取得用户明确批准；
3. 禁止 Git 写操作；
4. 禁止顺手扩大范围；
5. 不凭印象改 import，必须读实际文件确认；
6. 不一次性跨多个 Phase 大搬家；
7. 每阶段完成后必须更新 `Docs/Guide/frontend-structure.md`；
8. 每阶段完成后必须更新 README 版本号三处和 `Docs/Guide/CHANGELOG.md`；
9. 每阶段必须创建 `Docs/LLM_record/YY-MM/YYYY-MM-DD/` 下的日志；
10. 每阶段必须运行结构树和配置登记门禁，失败必须说明；
11. 如果发现本计划与实际代码冲突，应停止实施，报告矛盾点，等待用户决策。

---

## 15. 当前建议的第一批执行范围

建议第一批只做：

```text
Phase 1：建立 domains 骨架与 alias
Phase 2：迁移 Cesium 领域第一批
```

不建议第一批同时迁移 OL / Common / Layer / Data Import。

原因：

- 当前最痛点就是 `components/Cesium/`；
- Cesium 边界相对清晰；
- 第一批收益最大、风险相对可控；
- 完成后可以验证新领域结构是否适合项目；
- 若 alias / import 策略有问题，能尽早暴露，避免扩散到全项目。

---

## 16. 待用户确认事项

正式进入实施前，请用户确认：

1. 是否确认采用：

```text
frontend/src/domains/ol
frontend/src/domains/cesium
frontend/src/domains/common
```

2. Cesium alias 是否采用：

```text
@cesium-domain/
```

3. Layer / TOC 是否确认按以下方式拆：

```text
common/layer-tree/   # 图层树 UI + 协议
ol/layer/            # OL 图层实现
cesium/layers/       # Cesium 图层实现
```

4. Data Import / GIS IO 是否确认按以下方式拆：

```text
common/data-import/  # parser / crs / archive / protocol
ol/data-import/      # OL adapter / renderer
cesium/data-import/  # Cesium loader / adapter
```

5. 第一批是否只执行：

```text
Phase 1 + Phase 2
```

---

## 17. 总结

本次重构的核心不是“把 Cesium 文件夹搬浅”，而是把前端从历史 OL 单引擎结构升级为多地图引擎领域结构。

最终目标：

```text
OL 二维能力       -> domains/ol
Cesium 三维能力   -> domains/cesium
跨引擎应用能力    -> domains/common
```

后续任何新增功能应先判断领域归属，再决定落点：

- 只属于 2D：进 `domains/ol`；
- 只属于 3D：进 `domains/cesium`；
- 同时服务 2D / 3D：进 `domains/common`；
- 不确定：先写入阶段日志或 TODO，向用户确认，禁止临时塞入 Common。
