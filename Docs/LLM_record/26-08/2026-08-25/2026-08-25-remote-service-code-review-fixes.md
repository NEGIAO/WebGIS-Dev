# 2026-08-25 在线服务注册表 Code Review 修复与优化

## 日期和时间

2026-08-25 15:20

## 任务等级

L2

## 问题分析

**核心症状**：暂存区「在线服务 XYZ/WMTS 统一接入」批次经全面 Code Review 发现 2 个 P0 功能缺陷、4 个 P1、9 个 P2 及若干 P3。

**根本原因**：
1. P0-1 `computeLayersParam` 采用排除式分支 `kind !== 'wms'`，WMTS 记录误入 ArcGIS 分支被加上 `show:` 前缀 → 双引擎 WMTS 渲染全失效；
2. P0-2 Cesium zyx「占位符换位」基于对 UrlTemplateImageryProvider 替换机制的错误认知（该 Provider 为纯具名替换，顺序无关）→ 换位反而破坏瓦片 URL；
3. P1-1 Cesium restack 循环方向写反（尾→头 raiseToTop = 最早注册者居顶），与 OL 端 zIndex 正向映射语义相反；
4. 结构性问题：节点 id 解析逻辑三处重复、renderSignature 双份复制、分组常量双份导出 + LayerPanel 字面量硬编码——同一协议约定散落多处，漂移风险高。

**受影响模块**：remoteServices.ts / xyzWmtsCapabilities.js / 双引擎 adapter / remoteServiceTocActions.js / HomeView.vue / LayerPanel.vue / frontend-structure.md。

## 候选方案对比

- computeLayersParam：A) 排除式加 wmts 豁免 vs **B) 显式枚举 arcgis 分支（选定）**——B 使未来新增 kind 默认安全（走 wms 式兜底而非错误拼接）。
- WMS「全不勾」语义裁决：勾选集合是唯一事实来源，全不勾应渲染为空 LAYERS（用户明确取消全部叠加），回退 layersParam 会复活初始组合违背直觉。**选定：全不勾 = 空**；layersParam 仅在 sublayers 为空时兜底。
- 引擎定位分发：保留双引擎逐个尝试（引擎切换瞬间另一侧可能仍持有有效实例），但补 dispose 反注册消除 stale closure。

## 解决方案与实施步骤

1. `computeLayersParam` 重构：显式枚举 arcgis export 分支；xyz/wmts 无子层概念恒走 layersParam 兜底；wms 全不勾返回空串；同步修正 selectedIds 字段注释矛盾。
2. 删除 Cesium zyx 占位符换位（UrlTemplate 具名替换顺序无关）；tms 反算保留并注释说明。
3. restack 循环方向修正为头→尾（最后注册者最后 raiseToTop = 居顶），对齐 OL 正向映射。
4. 下沉共享工具到 remoteServices.ts：`parseRsvcNodeId`（节点 id 协议解析唯一实现）、`renderSignature`（渲染签名唯一实现）、`RSVC_GROUP_NODE_ID`（分组 id 唯一真源）；HomeView/tocActions/双 adapter 全部改为引用共享版。
5. HomeView.parseRsvcNodeId 函数从两条 import 之间移至 import 块后（可读性）。
6. LayerPanel.vue 字面量 `'rsvc:'` / `'remote-service-group'` 改为导入常量。
7. 双 adapter dispose 补 `unregisterRsvcEngineApi(engine)` 反注册；zoomTo 内部不再剥前缀（调用方 tocActions 已保证传 serviceId）——保持 zoomTo(id) 语义纯净。
8. xyzWmtsCapabilities.js detectTileYScheme 正则 `[^]*?`（Annex B 遗留）改为 `[\s\S]*?`。
9. Cesium syncRecord 移除 forEach 死实参 index。
10. 结构树补录 7 个漏登记文件；版本号治理（V3.5.35 后两份日志追认 V3.5.36/V3.5.37，本次 V3.5.38）。

## 修改原因

P0 两项直接导致 WMTS 功能不可用与 XYZ(ArcGIS 行序)瓦片错位；restack 方向不一致使多服务叠放顺序跨引擎不可预期；重复实现违反 SSOT 且已被证明会产生漂移（本次 P0-1 即是排除式分支的恶果）。

## 影响范围

* 在线服务注册表元数据推导（computeLayersParam/renderSignature）
* TOC「在线服务」分组动作链（HomeView/tocActions/LayerPanel）
* OL/Cesium 双引擎渲染 adapter
* 文档治理（frontend-structure.md / CHANGELOG / README 版本号）

## 性能指标

未实测（均为正确性与结构修复，无热路径变化；renderSignature/parseRsvcNodeId 下沉为零成本引用搬移）。

## 测试方案

**Agent 已执行**：
1. `python Scripts/CheckStructureTree.py` — 通过 ✅
2. `python Scripts/CheckConfigRegistry.py` — 通过 ✅
3. `npx vite build`（frontend/）— 构建成功无报错 ✅

**待用户实机验证**：
1. 加载 WMTS 服务（如 `https://tiles.geoserver.example/geoserver/gwc/service/wmts`）→ 地图出图、TOC 显隐/缩放/移除正常；
2. 加载 ArcGIS REST 服务（{z}/{y}/{x} 行序切片缓存）→ 瓦片不错位（原换位 bug 回归验证）；
3. 同 url 注册 ≥2 个在线服务 → 后注册者压盖在上（双引擎切换后一致）；
4. WMS 子图层全部取消勾选 → 地图无该服务内容（不再复活初始组合）；
5. 二维↔三维来回切换后再点 TOC「缩放至图层」→ 相机正常飞行（反注册回归验证）。

## 变更文件清单

见下方路径清单。

## 遗留与风险

1. XYZ 注册进会话态注册表后刷新即消失，但 custom URL 持久化通道会在下次启动时复活加载（TOC 分组却不再显示）——体验断裂，已在 TODO 登记，需产品决策（XYZ 是否持久化）后另行处理；
2. WMS GetFeatureInfo 已由同日 fix-remote-service-query-preserve 日志覆盖，本批未触碰 identify 链路；
3. 旧日志 2026-08-25-remote-service-toc-architecture-fixes.md 的测试方案第 3 条（F5 刷新恢复）已被持久化移除推翻——按规范不改历史日志正文，以本日志为准。
