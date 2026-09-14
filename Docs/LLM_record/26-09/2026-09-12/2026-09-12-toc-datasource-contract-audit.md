# 2026-09-12 Cesium/OL 数据源注册契约审计 + Force_command 强制规则

## 日期与时间

2026-09-12 11:20

## 任务等级

L2（跨模块审计 + 规范增补 + 远程 GLB 契约修复收尾）

## 问题分析

- **核心症状**：远程 GLB 经 URL 加载后，TOC 显隐/透明度/移除/重定位等基础能力失效。
- **根本原因**：未按统一数据源契约实现——`nextId` 未导出、远程记录缺 `sourceUrl` 时重定位仍读 `blobUrl`、加载路径未走 `dataImport` 注册入口。
- **受影响模块**：`gltfLoader` / `useCesiumDataImport` / `useCesiumLayers` / TOC（`cesiumLayers` + `cesiumLayerNodeBuilder`）。

## 接口契约（审计基准）

**元数据入店、句柄留场**（`cesiumLayers.ts`）：

| 层 | 职责 |
|---|---|
| `loadedDataSources` | 句柄 + 扩展字段（entity/sourceUrl/tilesetGeo…） |
| `cesiumLayers` store | 可序列化元数据（visible/opacity/supportsOpacity…） |
| adapter（CesiumContainer） | setVisible / setOpacity / flyTo / remove / reposition / setBaseHeight… |

`syncFromImport`：`type` 决定 `supportsOpacity`、TOC 动作位（gltf→reposition，3dtiles→高度/材质）。

## 审计结论（按注册路径）

| 路径 | 注册 | TOC 能力 | 结论 |
|---|---|---|---|
| 文件导入 geojson/kml/czml/shp/tif/3dtiles/gltf | `loadedDataSources` + loaderCtx | 全量 | 合规 |
| 远程 Ion / I3S / 3D Tiles URL | `registerExternalDataSource` | 高度/材质/显隐等 | 合规 |
| 远程 GLB URL | `loadRemoteGlb` → `loadGltfFromUrl` | 显隐/透明度/定位/重定位/移除 | **本次修复后合规** |
| 面状航线 / 路线漫游工作集 | Container 写入 `loadedDataSources`（managedByModule） | 经 adapter 分流 | 合规 |
| `useCesiumModelManager.addModel` | **不进 TOC**（玩家/模块专用） | 无 TOC 节点 | 有意隔离；禁止当作用户数据导入入口 |
| 底图/地形/在线服务 | 影像/地形管线，非「三维数据」组 | 另册 | 不在本契约范围 |

## 本次修复（远程 GLB 对齐契约）

1. `useCesiumDataImport`：导出 `nextId`；新增 `loadRemoteGlb`（loaderCtx 入口）。
2. `gltfLoader.loadGltfFromUrl`：record 含 `type:'gltf'`、`sourceUrl`、`blobUrl:null`、`visible/opacity`；flyTo + requestRender；`minimumPixelSize`。
3. `confirmGltfReposition`：`sourceUrl || blobUrl`。
4. `setRecordVisible`：同步 `entity.model.show`。
5. `useCesiumLayers`：只调 `dataImport.loadRemoteGlb`。

## 二次细查（loader 逐条 vs TOC 契约）

| type | 记录关键字段 | 显隐 | 透明度 | flyTo | remove | 专用动作 | 缺口 |
|---|---|---|---|---|---|---|---|
| geojson | entity | ✅ | ✅ | ✅ | dataSources | — | 无 |
| kml | entity | ✅ | ✅ | ✅ | dataSources | — | 无 |
| **kmz** | entity + blobUrls | ✅ | ❌→**已修** | ✅→显式分支 | blobUrls 回收 | — | OPACITY 表缺 kmz |
| czml | entity + blobUrl | ✅ | ✅ | ✅ | blobUrl | — | 无 |
| shp | entity | ✅ | ✅ | ✅ | dataSources | — | 无 |
| tif | entity + blobUrl | ✅ | ✅ | ✅ | blobUrl + heightMesh | stretchHeight | 无 |
| gltf 本地 | entity + blobUrl | ✅ | ✅ | ✅ | entities + blobUrl | reposition | 无 |
| gltf 远程 | entity + sourceUrl | ✅ | ✅ | ✅ | entities | reposition | 上一轮已修 |
| 3dtiles 文件/样例 | entity + 贴地字段 | ✅ | ✅ | ✅ | primitives | 高度/材质 | 无 |
| 3dtiles 远程 | registerExternalDataSource | ✅ | ✅ | ✅ | primitives | 高度/材质 | 无 |
| wayline/route 工作集 | managedByModule | ✅ | wayline 在 OPACITY 表 | ✅ | 先复位控制器 | — | TYPE_LABELS 缺航线→已修 |

### 本轮再修

1. `OPACITY_SUPPORTED_TYPES` 增加 **`kmz`**。
2. `TYPE_LABELS` 增加 **`wayline: '航线'`**。
3. `flyToEntity` 显式处理 kml/kmz/geojson/czml/shp。

## Force_command 增补

§3 阶段三新增 **数据源注册前置（TOC）**；§7 DoD 增加对应勾选项。用户会话内明确要求写入规范。

## 影响范围

规范文档 + Cesium 数据导入链路；OL 规则写入规范（本次未改 OL 代码）。

## 性能指标

未实测（契约修复，非热路径重构）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `node --check` gltfLoader / useCesiumDataImport / dataSourceDisplay / useCesiumLayers | 远程 GLB 后 TOC：显隐、透明度、定位、移除、调整位置 |
| 接口对照审计（上表） | 新增任一远程/文件导入是否自动出现在「三维数据」组 |

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `Docs/Force_command.md` | 数据源注册前置 + DoD |
| `frontend/.../gltfLoader.js` | 远程 GLB record/渲染契约 |
| `frontend/.../useCesiumDataImport.js` | nextId / loadRemoteGlb / reposition uri |
| `frontend/.../useCesiumLayers.js` | 统一入口调用 |
| `frontend/.../dataSourceDisplay.js` | model.show 同步 |
| 本文件 | 审计日志 |

## 遗留与风险

1. `modelManager` 与 TOC 双轨：模块模型不进 TOC；若未来要进，必须走 `registerExternalDataSource` 或等价。
2. OL 侧未做同等全量扫描（本批以 Cesium 契约为主）；后续若加远程图层仍须进 layer-tree。
3. 校园级 GLB 体积大，首载慢与 CORS 限制与契约无关，属运维/源站问题。
4. **Git**：本地 HEAD 曾落后 origin 约 6 commit（含 Worker 迁出、429 toast 等同主题改动）。用户须先 `git pull --ff-only` 再提交 V3.6.3，避免与 origin 重复/冲突。
5. `useCesiumDataImport.js` 中 `loadRemoteGlb` 曾误插在 `registerExternalDataSource` JSDoc 与函数之间（注释错位）；**review 时已在工作区修正**（函数顺序与 JSDoc 对齐）。
6. `useCesiumDataOpsHandlers` 内置西大 GLB 样例 URL 为第三方直链，CORS/可用性依赖对方站点。
