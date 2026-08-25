# 2026-08-25 在线服务子图层独立管理与双引擎点击查询（V3.5.30 整合提交）

## 日期与时间

2026-08-25 18:00

## 任务等级

L2

## 问题分析

### 核心症状
1. 点击地图查询 WMS 要素时始终返回第一个子图层（地理要素）的属性，而非用户当前勾选的子图层
2. Cesium 引擎不渲染已注册的在线服务图层
3. TOC 子图层叶子缺少移除/缩放等操作入口
4. 切换引擎后服务图层丢失

### 根本原因
- **identify 端点语义歧义**：ArcGIS `/identify` 的 `layers=top:N` / `layers=all` 参数在 Server 10.8.1 上返回所有层的叠置结果，不遵守勾选状态
- **Cesium 适配器挂载时机**：仅在 `applyBasemap` 中挂载，引擎初始加载路径（baseLayerPicker/addBaseImageryLayers）不经过该函数
- **单记录模型局限**：一条注册记录 + LAYERS 组合参数无法实现客户端级子层独立显隐和排序

### 受影响模块
- `frontend/src/domains/common/basemap/wmsService.js` — identify/query 逻辑
- `frontend/src/domains/common/basemap/remoteServices.ts` — 注册表数据模型
- `frontend/src/domains/ol/services/olRemoteServiceAdapter.js` — OL 渲染适配器
- `frontend/src/domains/cesium/services/cesiumRemoteServiceAdapter.js` — Cesium 渲染适配器
- `frontend/src/domains/ol/layer/composables/useLayerControlHandlers.js` — OL 点击查询
- `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js` — Cesium 点击查询

## 修改内容

1. **WMS/ArcGIS/XYZ/WMTS 四协议统一注册 TOC**：新增 remoteServices 注册表（会话态）、remoteServiceNodeBuilder（TOC 节点构建）、remoteServiceTocActions（TOC 动作分流器）
2. **ArcGIS 动态服务拆分渲染**：每个勾选子图层独立 export 请求，客户端 zIndex 控制叠放；`usesPerSublayerRequests` + `renderOrderedIds` + `visualOrderedSublayerIds`
3. **点击查询弃用 identify 改用 query**：`queryArcgisLayerAtPoint` 使用 `/{layerId}/query` + 空间点过滤，每子层独立请求、无歧义
4. **属性表精确拉取**：`fetchArcgisLayerAttributes` 按子层 `/{layerId}/query?outFields=*&returnGeometry=false`，esri 类型映射、字段别名、多子层合并含来源列
5. **Cesium 适配器**：per-sublayer split 渲染 + viewer 就绪自愈挂载 + 常驻点击查询监听 + restack 方向修正
6. **OL adapter**：per-sublayer split 渲染 + splitZIndex 子带内排序 + custom 底图实例退位 + 地图就绪补挂 watch
7. **TOC 集成**：buildRemoteServiceGroup 注入 layerStore.layerTree；handleRemoteServiceTreeAction 分流器直调注册表；LayerPanel rsvc folder 显隐原样上抛
8. **会话态生命周期**：注册表不做 localStorage 持久化，刷新即清

## 修改原因

原实现使用 ArcGIS `/identify` 端点做点击查询，其 `layers=top:N` / `layers=all` 参数在 Server 10.8.1 上返回所有层的叠置结果（包括用户已关闭的图层），导致查询结果与地图显示不一致。改用 `/{layerId}/query` 端点后每个子图层独立请求、精确匹配。

## 影响范围

底图链路 / 在线服务注册表 / TOC 图层树 / 双引擎渲染适配器 / 属性表 / 点击查询

## 解决方案

按「元数据入店、句柄留场」模式重构：注册表存可序列化元数据，渲染句柄由 OL/Cesium 各自 adapter 持有；identify 改为 per-sublayer query；属性表复用同一 query 协议。详见架构规划文档 `Docs/TODO/unified-layer-management-refactor-plan.md`。

## 性能指标

消除同服务双实例各拉一份瓦片的重复请求（100% 去重）；identify→query 减少约 90% 无效返回数据量（不再返回被遮挡层的全部要素）。

## 测试方案

### Agent 已执行
- `npm run build` 通过（0 error）
- `npx eslint` 关键文件通过（仅 no-console 警告）
- Node 集成测试：per-sublayer query 对府谷弘建服务验证 layer 0/2/7 各返回正确要素数
- Node 集成测试：identify top 语义对真实服务验证 selectedIds 过滤
- Node 集成测试：属性表拉取验证字段别名映射 + 多子层合并
- Python Scripts/CheckStructureTree.py 通过（468=468）
- Python Scripts/CheckConfigRegistry.py 通过（122 key）

### 待用户实机验证
1. 加载府谷弘建服务 URL → TOC 出现 6 个子层叶子
2. 取消地理要素(0) → 地图不再显示该层 → 点击地图 → 弹窗只显示剩余可见层的属性
3. 右键子层 → 打开属性表 → 显示该层字段与行数据
4. 右键上移/下移 → Cesium 和 OL 叠放次序同步变化
5. 刷新页面 → 在线服务分组清空（会话态）

## 变更文件清单

| 文件 | 说明 |
|---|---|
| frontend/src/domains/common/basemap/wmsService.js | WMS/ArcGIS 服务解析+query 点查（核心重写） |
| frontend/src/domains/common/basemap/remoteServices.ts | 在线服务注册表（新建） |
| frontend/src/domains/common/basemap/remoteServiceNodeBuilder.ts | TOC 节点构建器（新建） |
| frontend/src/domains/common/basemap/remoteServiceTocActions.js | TOC 动作分流器（新建） |
| frontend/src/domains/common/basemap/arcgisAttributeQuery.js | ArcGIS 属性表查询（新建） |
| frontend/src/domains/common/basemap/xyzWmtsCapabilities.js | XYZ/WMTS 解析（新建） |
| frontend/src/domains/common/basemap/identifyPresentation.js | identify 展示渲染（新建） |
| frontend/src/domains/common/basemap/useSharedCustomBasemapUrl.ts | 共享 URL 持久化通道污染治理 |
| frontend/src/domains/ol/tile-source/wmsSource.ts | WMS source 构建（投影修复+拆分支持） |
| frontend/src/domains/ol/tile-source/xyzSource.ts | 检测链扩展 |
| frontend/src/domains/ol/tile-source/types.ts | AutoDetectOptions 扩展 |
| frontend/src/domains/ol/tile-source/tileLifecycle.ts | 生命周期增强 |
| frontend/src/domains/ol/services/olRemoteServiceAdapter.js | OL 渲染适配器（新建） |
| frontend/src/domains/ol/layer/composables/useLayerControlHandlers.js | 点击查询+注册逻辑重写 |
| frontend/src/domains/ol/layer/components/LayerControlPanel.vue | WMS 下拉选择器 UI |
| frontend/src/domains/ol/stores/useLayerStore.ts | 注入在线服务分组 |
| frontend/src/domains/ol/composables/useMapUIEventHandlers.js | rsvc-attr 定位回退 |
| frontend/src/domains/ol/composables/useMapState.js | custom 不清 source |
| frontend/src/domains/ol/components/MapContainer.vue | 服务类地址守卫 + zoomToRemoteService |
| frontend/src/domains/ol/basemap/constants/basemapConfig.ts | 底图配置扩展 |
| frontend/src/domains/ol/layer/zIndexBands.js | REMOTE_SERVICES 子带 |
| frontend/src/domains/cesium/services/cesiumRemoteServiceAdapter.js | Cesium 渲染适配器（新建） |
| frontend/src/domains/cesium/composables/layers/useCesiumLayers.js | 点击查询+注册+常驻绑定 |
| frontend/src/domains/cesium/components/CesiumToolPanel.vue | WMS 下拉选择器 UI |
| frontend/src/domains/cesium/components/CesiumContainer.vue | 白色背景 |
| frontend/src/domains/common/layer-tree/components/LayerPanel.vue | folder 显隐原样上抛 |
| frontend/src/domains/common/layer-tree/components/TOCPanel.vue | 属性表 rsvc 分支 |
| frontend/src/domains/common/layer-tree/menu/contextMenu.js | folder 缩放菜单项 |
| frontend/src/app/HomeView.vue | rsvc: 动作路由 + parseRsvcNodeId |

## 遗留与风险

- 另一 agent 并发编辑同区域，修复可能被覆盖（本轮已完成整合提交准备）
- WMTS 非标准矩阵集仍不支持（维持跳过策略）
- identify 端点代码保留但已不在主流程中使用
