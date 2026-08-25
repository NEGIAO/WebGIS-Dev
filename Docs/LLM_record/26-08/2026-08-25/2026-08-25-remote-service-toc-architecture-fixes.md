# 2026-08-25 在线服务 TOC 统一管理架构评审与 P0/P1 问题修复

## 日期和时间

2026-08-25 11:40

## 修改内容

针对「WMS/WMTS/XYZ 瓦片统一注册到 TOC 管理」的架构评审落地，本次先解决既有实现的 4 个缺陷：

1. **P0-1**：HomeView.vue 导入名 `setRemoteServiceVisibility` 与模块实际导出 `setRemoteServiceVisible` 不匹配导致启动白屏（对齐命名）。
2. **P0-2**：双通道重复渲染——loadCustomMap 既保留 custom 底图实例可见、又经注册表 adapter 再建一层 OL 图层。修复为：WMS/ArcGIS 服务成功注册后 custom 底图实例退位（隐藏+清请求），渲染统一收口到注册表 adapter；非 WMS/ArcGIS 的自定义 XYZ 仍走原 custom 通道。
3. **P1-1**：adapter reconcile 仅由 records watch 驱动，首次执行时地图尚未创建（setup 阶段 vs onMounted 创建），刷新页面后 localStorage 恢复的服务不会上图。修复为：增加 mapInstanceRef watch，地图就绪后自动补挂。
4. **P1-2**：「在线服务」分组在三维模式下照常显示但无 Cesium 渲染端消费。修复为：registry 模块新增 `activeTocEngine` 状态（默认 'ol'），layerTree 仅在 OL 引擎下拼入该分组；HomeView.setMapView 时同步引擎状态。

## 修改原因

* 架构评审结论：三段式设计（元数据注册表 / TOC 节点构建 / 各引擎渲染适配器）方向正确，是后续扩展 WMTS/XYZ kind 的正确底座；但 P0-2 双通道重复渲染会造成双倍瓦片流量与透明度/显隐状态错乱，必须先行裁决"渲染归属单一化"；P1 两项属于生命周期闭环缺口。

## 影响范围

* frontend/src/app/HomeView.vue（导入名对齐 + setMapView 同步引擎状态）
* frontend/src/domains/common/basemap/remoteServices.ts（新增 activeTocEngine 状态）
* frontend/src/domains/ol/services/olRemoteServiceAdapter.js（地图就绪补挂 + zIndex 正向映射语义注释）
* frontend/src/domains/ol/stores/useLayerStore.ts（在线服务分组按引擎过滤）
* frontend/src/domains/ol/layer/composables/useLayerControlHandlers.js（custom 实例退位逻辑 + 两处被挤压的函数签名格式修复）

## 优化解决方案

1. 渲染归属单一化（方案 A）：解析器（loadCustomMap/wmsService）负责协议识别与元数据产出；渲染统一由注册表 adapter 承担；custom 底图实例仅承载非 WMS/ArcGIS 的自由 XYZ。
2. 生命周期闭环：adapter 增加 `watch(mapInstanceRef)` 就绪回调，替代依赖外部时序的手动触发。
3. 双引擎过滤：引擎状态收敛在 common 注册表模块（未来补 Cesium adapter 后仅需移除过滤条件）。

## 性能指标

消除 WMS/ArcGIS 场景下 100% 的重复瓦片请求（原先同服务两实例各拉一份）；刷新恢复路径新增一次 O(n) 内存 reconcile，无网络开销。

## 测试方案

1. 启动 dev server 无 SyntaxError（导入名已对齐导出清单）。
2. 加载一个 ArcGIS REST 服务 → Network 面板确认 `/tile/` 或 `/export` 请求仅单份；TOC「在线服务」分组出现且显隐/透明度/缩放/移除可用。
3. F5 刷新 → 分组条目仍在且地图图层自动恢复。
4. 切换三维模式 → 「在线服务」分组隐藏；切回二维恢复。
5. 加载纯 XYZ 模板 URL → 仍走原 custom 底图通道，行为不变。

## 修改的文件路径

见上方影响范围。
