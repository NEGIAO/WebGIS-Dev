# Cesium 统一图层管理设计文档落档（评审稿，V3.4.27）

## 日期和时间

2026-07-26 20:01（北京时间）

## 事件逻辑链条分析

- **核心症状**：Cesium 导入数据只活在 3D 控制台数据页签（定位/删除 + 类型特化），无可见性开关与不透明度；3D 模式下侧栏 TOC 显示的仍是 2D 图层树——两套图层管理割裂。用户要求参考 2D 已有实现给出统一方案。
- **根本原因**：Cesium 数据导入体系（loadedDataSources ref 组件内私有）与 2D 图层体系（Pinia store + toLayerNode capabilities 契约 + TOCPanel）各自演进，从未打通；Cesium 对象不能进响应式系统的约束也使"直接塞进 2D store"不可行。
- **受影响模块（若实施）**：stores/layer、useCesiumDataImport、CesiumToolPanel 数据页签、TOCPanel 动作分流、CesiumContainer adapter 注册。
- **解决思路**：调研两侧代码坐标 → 设计文档先行（用户选定"先出设计文档"），把架构原则、数据模型、路由方案、风险与决策点写清供评审，评审通过后分两步实施。

## 修改内容

新增 `Docs/Architecture/cesium-unified-layer-management.md`（评审稿），共 10 节：

1. 问题与背景（割裂点定位）；
2. 现状盘点表（含代码坐标：layerTreeBuilder.toLayerNode 契约、TOCPanel 2492 行 capabilities 驱动、useCesiumDataImport 的 loadedDataSources/remove/flyTo 半套能力、数据页签卡片现状）；
3. 目标与非目标（一期不做 3D 属性表/样式/编辑/排序）；
4. 总体设计 Mermaid 图 + 核心原则「元数据入店、句柄留场」（Pinia 只存可序列化元数据，Cesium 句柄留在 composable 内 Map，store action 经注册 adapter 回调触达）；
5. CesiumLayerRecord 数据模型 + 类型×能力矩阵（geojson/kml/czml/shp→DataSource.show；tif→ImageryLayer.show+alpha 且同步 heightMesh；gltf→Model.show+color alpha；3dtiles→show+style，标注与 applyTilesetMaterial 互写 style 风险及 adapter 单点合成对策）；
6. 第一步详设（cesiumLayers store：register/rename/setVisible/setOpacity + registerAdapter 时序防守；import 挂钩兼容期保留旧 ref；卡片加眼睛/透明度/重命名）+ DoD-1；
7. 第二步详设（cesiumLayerNodeBuilder 对齐 toLayerNode，capabilities 只开 visible/locate/remove/opacity/rename；树合并按 getCurrentMapView 拼「三维数据」分组；动作路由 TOCPanel 按 engine 分流直调 Pinia——沿用项目「TOCPanel 直更 Pinia」既有先例，HomeView 事件链零改动）+ DoD-2；
8. 风险与对策表（响应式深代理、style 互写、viewer 销毁时序、TIF 双句柄、TOCPanel 回归面）；
9. 工作量评估（第一步 0.5–1 天、第二步 1–1.5 天）；
10. 4 个待评审决策点（分组形态/2D 模式表现/切换保留策略/矢量 opacity 范围）。

同步：README 架构文档表新增行 + 版本 V3.4.27 三处 + 版本表保留最新三条；CHANGELOG V3.4.27 条目。

## 修改原因

用户明确选择"先出设计文档"路线；且该功能触及 TOCPanel（2492 行）与跨引擎状态管理，属高风险改造，符合 Force_command"先写文档、评审后实施"的执行准则。

## 影响范围

纯文档；未改动任何前后端代码。

## 优化解决方案

设计上避开两大陷阱：①Cesium 对象进 Pinia 的深代理灾难（元数据/句柄分离 + adapter 回调）；②TOCPanel 大改（capabilities 契约使其只需数据源 computed 与动作分流两点加法）。分两步交付使第一步独立可用且是第二步地基，评审焦点收敛到 4 个产品决策点。

## 性能指标

不适用（设计文档）。

## 测试方案

- 文档内 Mermaid flowchart 语法自查（引号包裹节点文本，无保留字）；
- 各代码坐标（文件/行为描述）与当前仓库实况核对一致（调研命令输出为据）；
- 实施阶段测试方案已内置于文档 DoD-1/DoD-2。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\Docs\Architecture\cesium-unified-layer-management.md（新增）
- D:\Dev\GitHub\WebGIS-Dev\README.md（架构文档表 + 版本 V3.4.27 三处 + 版本表裁剪）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.27 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-cesium-unified-layer-mgmt-design.md（本日志）

> 备注：未执行任何 git 操作；评审通过后按文档实施并另开维护日志。
