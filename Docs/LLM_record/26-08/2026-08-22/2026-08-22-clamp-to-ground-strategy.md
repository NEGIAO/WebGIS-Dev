# Cesium 导入数据贴地策略统一重构

- **日期时间**：2026-08-22 12:10
- **任务等级**：L3
- **方案批准**：用户于会话中明确批准（「执行」），方案文档 [Docs/Architecture/2026-08-22-clamp-to-ground-strategy.md](../../Architecture/2026-08-22-clamp-to-ground-strategy.md)

---

## 问题分析

### 核心症状

Cesium 场景默认开启天地图世界地形，但导入数据（含样例数据）贴地行为不一致：部分数据悬空/埋地，用户感知为"没有贴地"；且现有措施零散分布在 6+ 处，兜底方式危险。

### 根本原因

1. Cesium 官方**不存在场景级全局 clampToGround 开关**，必须按几何类型逐项设置属性或预采样高度——缺乏统一策略层导致各路径自行其是。
2. GLTF 数据导入路径的兜底逻辑错误：采样失败直接关闭全局地形（一个模型的失败摧毁整个场景设置并连锁触发 refit watcher）。
3. 模型管理器与数据导入两条模型路径行为割裂：前者完全无贴地（`height ?? 0` 裸放）。
4. 三套高度采样实现并存，容错能力参差（`useCesiumHeightSampler` 甚至依赖 `provider._bottomLevel` 私有字段）。

### 受影响模块

Cesium 数据导入（loaders ×7）、模型管理器、地形采样器、地形切换监听。

## 修改内容

| # | 改动 | 文件 |
|---|---|---|
| S1 | 🔴 删除「采样失败→关闭全局地形」兜底，改为保持原高 + message.warning | `gltfLoader.js` |
| S2 | 模型管理器接入采样贴地（低于地表抬升至地表，高于地表保留语义高度） | `useCesiumModelManager.js` |
| S3 | 新建采样网关收编 tilesetLoader 的完整兼容链；gltfLoader / heightSampler / tilesetLoader 三处全部改调 | `terrain/terrainSampling.js` ★新 |
| S4 | 新建贴地策略唯一权威模块（原 `clampToGround.js` 并入后删除）；类型登记表 `CLAMPABLE_VECTOR_TYPES` 从 useCesiumDataImport 迁入 | `terrain/terrainClampService.js` ★新 |
| S5 | `isTerrainEnabled` 强化：instanceof + try/catch 降级引用比较（兼容 shim Proxy 场景） | 同上 |
| — | 结构树同步（含顺手修正 HEAD 已删除文件的幽灵条目 toolsModule.js） | `frontend-structure.md` |

**语义保护规则（集中声明）**：时间动态实体（CZML 轨迹）/ 数据自带海拔（perPositionHeight=true）/ 已有非 NONE 高度引用 → 跳过不覆盖。此设计合理保留，用户感知的"部分没贴地"多源于此。

## 关键修正（方案文档勘误）

初版方案误判「ArcGIS / 天地图 GeoTerrainProvider 无 availability」——经用户指正并核实源码，两个自研 provider 均已实现 `availability` getter（`ArcGISTerrainProvider.js:108`、`GeoTerrainProvider.js:125`），首选 mostDetailed 直达最高精度；显式层级阶梯仅作未知第三方 provider 的防御性兜底。文档与代码注释均已按此修正。

## 解决方案

分层收敛而非逐点修补：能力层（采样网关）→ 服务层（策略路由 + 语义保护）→ 时序层（导入时贴地 + terrainProviderChanged 重贴地双链路，后者沿用既有 watcher 仅改指向）。对外行为变化仅两处：GLTF 采样失败不再关全局地形（改为警告）；模型管理器新增自动贴地提示消息。

## 性能指标

未实测（重构无新增计算；mostDetailed 首选化理论上提升首次采样精度）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| eslint 全部涉改 9 文件 ✅ 零告警 | ① 天地图地形下导入 KML/GeoJSON/SHP/CZML 各一份 → 全部贴地 |
| `npm run build` ✅（20.5s） | ② 导入低于地表的 GLTF → 抬升至地表上方，且地形保持开启 |
| 门禁 CheckStructureTree ✅（433/433） | ③ 模型管理器添加模型 → 自动落至地表并有提示消息 |
| 门禁 CheckConfigRegistry ✅ | ④ ellipsoid↔天地图↔ArcGIS 地形来回切换 → 已加载数据自动重贴 |
| clampToGround.js 全库引用清零复核 ✅ | ⑤ 样例白膜（武汉建筑）贴地正常、手动高度滑杆可用 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/terrain/terrainSampling.js` | ★新增：采样统一网关 |
| `frontend/src/domains/cesium/composables/terrain/terrainClampService.js` | ★新增：贴地策略唯一权威 |
| `frontend/src/domains/cesium/composables/dataImport/loaders/clampToGround.js` | ★删除（并入 service） |
| `frontend/src/domains/cesium/composables/dataImport/loaders/gltfLoader.js` | 危险兜底移除 + 网关接入 |
| `frontend/src/domains/cesium/composables/dataImport/loaders/tilesetLoader.js` | 本地采样函数删除改调网关 |
| `frontend/src/domains/cesium/composables/dataImport/loaders/{czml,geojson,kml,shp}Loader.js` | 导入路径改指 service |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataImport.js` | 类型登记表迁出 + import 更新 |
| `frontend/src/domains/cesium/composables/models/useCesiumModelManager.js` | 接入自动贴地 |
| `frontend/src/domains/cesium/composables/terrain/useCesiumHeightSampler.js` | 内部批量采样改调网关，移除私有字段依赖 |
| `Docs/Guide/frontend-structure.md` | terrain 目录 +2 新文件、loaders -clampToGround、toolsModule 幽灵条目清理 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本号 V3.5.28 三处 + 条目 |
| 本日志 + 方案文档状态更新 | — |

## 遗留与风险

- 分析模块（限高/通视）临时实体不在管道内（方案明确排除，影响小）
- 「强制贴地」UI 开关未做（P5，需求确认后再立项）；被语义保护跳过的实体目前仅有 console 说明
- GLTF 抬升缓冲保留历史 +10m、模型管理器贴地为精确地表（offset=0），两者语义不同属有意设计

---

## 暂存区复审增量（2026-08-22 12:40 · 同任务二轮审查）

> 用户要求按 Force_command 对暂存区复审。逐文件过目 staged diff 后修复 2 个问题：

1. **假警告 Bug**：`liftModelCoordsToTerrain` 在地形未开启时也返回 `sampled:false`，gltfLoader 误判为"采样失败"，椭球地形下导入带坐标模型会弹虚假警告。修复：返回值增加 `reason` 字段（`'invalid-coords' | 'terrain-off' | 'sample-failed' | 'above-ground' | null`），gltfLoader 仅在 `reason === 'sample-failed'` 时提示。
2. **进度语义**：`useCesiumHeightSampler` 批量采样中无效高程点被跳过时进度不推进，含空洞批次进度永远 <100%。修复：无效点保持 null 结果但进度照常计数。

### 复审变更文件

| 文件 | 说明 |
|---|---|
| `terrainClampService.js` | lift 返回值增加 reason 字段 + JSDoc |
| `gltfLoader.js` | 警告条件改按 reason 判定 |
| `useCesiumHeightSampler.js` | 进度推进与结果写入解耦 |

### 复审验证

eslint 3 文件 ✅ / build ✅（21.6s）/ 门禁 ×2 ✅。修复位于工作区，需用户再次 `git add` 后随 V3.5.28 一并提交。

---

## KMZ 湖泊面不贴地根因修复（2026-08-22 13:20 · 用户实测反馈）

### 根因（本地 Cesium 1.132 bundle 实证）

用户以 `HENU湖泊.kmz`（河南大学金明校区，6 个 MultiGeometry/Polygon，坐标高度全 0，altitudeMode=clampToGround）实测仍不贴地。逐环排查加载链路后，在自托管 bundle 中实证：

```js
// KmlDataSource.load：
this._clampToGround = t.clampToGround ?? !1;   // 默认 false
// GeoJsonDataSource 的 clampToGround 默认变量：Xq=!1 同为 false
```

**KML/KMZ 加载期从未开启贴地**：`loadKmlDataSource` 只传 camera/canvas，依赖的默认值实为 false；图元按坐标原始高度（椭球面 0m）生成，开封当地真实地面约 +70m → 整片湖泊被埋在地下。此前 geojson/shp 贴地正常纯粹因为显式传了 true——恰印证 cesium-skills 官方范式「DataSource.load 必须显式 clampToGround」。加载期之后的实体属性补贴地救不了已按错误几何生成的 primitive。

### 修复

`kmlLoader.loadKmlDataSource` 显式传入 `clampToGround: true`（KML/KMZ 共用此函数，一处修复两格式生效），注释记录 bundle 实证结论防止回归。

### 验证

| Agent 已执行 | 待用户实机验证 |
|---|---|
| eslint ✅ / build ✅（26.6s）/ 门禁 ×2 ✅ | 重新导入 HENU湖泊.kmz：6 个湖面应贴于影像地表（含地形起伏处）；点/线类 KMZ 同验 |
| doc.kml 内容分析：6 Polygon、extrude=0、altitudeMode=clampToGround、高度全 0 | 切换 ellipsoid↔天地图地形，湖面始终贴合 |

---

## 三轮收敛：矢量全面回归官方 clampToGround（2026-08-22 13:50 · 用户架构裁决）

> 用户指出：点线面/矢量数据官方 `clampToGround: true` 一步到位即可，此前的实体级补贴地策略与地形切换重贴监听均属多余。采纳并执行以下收敛。

### 收敛内容

1. **geojson/shp**：删除加载后 `clampDataSourceToGround` 补贴地 pass（加载期选项已覆盖面/线/点，且 GroundPrimitive 随地形自动跟随）。
2. **kml/kmz**：同上，删除 `applyGroundClamping`；KML 自身 altitudeMode 语义（absolute/relative 高度）由 KmlDataSource 原生尊重，比一刀切更正确。
3. **watcher 矢量分支删除**：`terrainProviderChanged` 监听仅保留 3D Tiles 重配准；矢量贴地随地形切换由 Cesium 内部自动处理。
4. **service 瘦身**：`CLAMPABLE_VECTOR_TYPES` 登记表无消费方随之删除；模块职责收敛为「CZML 实体贴地（无加载期选项，heightReference 即官方 API）+ glTF 模型采样抬升（裸 primitive 无官方贴地能力）」。

### 未采纳部分及原因（如实说明）

- **glTF/模型 Entity 化**（ModelGraphics.heightReference 是官方模型贴地道）：现有模型管线（重定位拖拽、primitives.remove 移除、flyTo）深度绑定裸 primitive + modelMatrix，改造涉及三条链路，回归风险大——登记 TODO 后续专项立项，本轮维持采样抬升一次方案。

### 最终架构一览

| 数据类型 | 贴地方式 | 地形切换 |
|---|---|---|
| GeoJSON/SHP/KML/KMZ | 加载期 `clampToGround: true`（官方） | Cesium 自动跟随 |
| CZML | 实体 heightReference（官方 API，经 service） | Cesium 自动跟随 |
| glTF 模型 | 采样抬升一次（service.liftModelCoordsToTerrain） | 不跟随（TODO：Entity 化） |
| 3D Tiles | 基底配准（tilesetLoader，另一类地理配准问题） | watcher 手动重配准 |

### 三轮验证

eslint dataImport+terrain 全目录 ✅ / build ✅（32.6s）/ 门禁 ×2 复跑 ✅。工作区改动需用户 `git add` 随版本提交。

---

## 四轮收敛：glTF/模型全面 Entity 化 + 暂存区终审（2026-08-22 15:30 · 合并会话补记）

> 三轮收敛时「未采纳」的 Entity 化方案在后续迭代中**已实际落地**（本节为合并会话按最终暂存代码补记，此前日志停留在三轮结论，属文档滞后）。版本整合：原 V3.5.26–V3.5.28 三轮增量按用户指令合并为单一 **V3.5.26** 提交。

### Entity 化实际落地内容

1. **gltfLoader**：`loadGltfWithCoords` 改用 Entity ModelGraphics——语义高度 > 0 → `RELATIVE_TO_GROUND`（保留离地意图、规避"半截入土"），否则 `CLAMP_TO_GROUND`；姿态统一 ENU 四元数（弃旧 `('north','west')` 约定）；`getAutoPlaceCoords` 不再采样（CLAMP 自动落地表）。
2. **模型管理器**：primitive → Entity 全链路改造——addModel / updateModelTransform（position+orientation 重算）/ removeModel（entities.remove）/ playAnimation·stopAnimation（runAnimations 整体开关，具名动画/速率 @deprecated）；非均匀缩放 {x,y,z} 退化等比并告警；已知取舍：ModelGraphics 无 errorEvent/readyEvent，乐观置 READY。
3. **useCesiumDataImport**：重定位（confirmGltfReposition）与移除（removeDataSource）按 `entity.model` 分型移除；terrainProviderChanged 监听仅保留 3D Tiles。
4. **utils.js**：删除 primitive 方案专用的 sampleTerrainHeight/calcTerrainOffset；flyToEntity 增加 gltf 分支（viewer.flyTo 直接支持 Entity）。

### 终审修复（合并会话逐文件 review 发现）

| # | 问题 | 文件 |
|---|---|---|
| 1 | `clearAllDataSources` 仍按 primitive 移除 glTF（Entity 静默 no-op → 清空后模型残留场景且 blobUrl 被吊销），与 removeDataSource 不一致 | `useCesiumDataImport.js` |
| 2 | `setRecordOpacity` gltf 分支对 Entity 赋 `.color` 是无效属性（须写 `entity.model.color`），透明度滑杆失效 | `dataSourceDisplay.js` |

### 终审验证

| Agent 已执行 | 待用户实机验证 |
|---|---|
| eslint 涉改文件 ✅ / 门禁 ×2 ✅ / build ✅（结果见交接块） | ① 导入 glTF → 开/关地形模型始终贴地跟随；② TOC 透明度滑杆拖动模型半透明生效；③ 「清空所有数据」后 Entity 模型从场景消失；④ 模型管理器添加/重定位/动画开关全链路可用 |

### 架构表更新（覆盖三轮的「最终架构一览」）

| 数据类型 | 贴地方式 | 地形切换 |
|---|---|---|
| GeoJSON/SHP/KML/KMZ | 加载期 `clampToGround: true`（官方） | Cesium 自动跟随 |
| CZML | 实体 heightReference（官方 API，经 service） | Cesium 自动跟随 |
| **glTF 模型** | **Entity ModelGraphics heightReference（官方机制）**（~~采样抬升一次~~ 已被本轮取代） | **自动跟随** |
| 3D Tiles | 基底配准（tilesetLoader，另一类地理配准问题） | watcher 手动重配准 |
