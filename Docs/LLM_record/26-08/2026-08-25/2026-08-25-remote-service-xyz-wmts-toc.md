# 2026-08-25 在线服务注册表扩展：XYZ/WMTS 接入 TOC 统一管理

## 日期和时间

2026-08-25 12:10

## 修改内容

在既有「在线服务」注册表（此前仅 WMS/ArcGIS）基础上，将标准 XYZ 瓦片与 WMTS 服务纳入 TOC 统一管理：

1. **kind 扩展**：`'wms' | 'arcgis' | 'xyz' | 'wmts'`；新增 `yScheme`（`zxy` 标准 slippy / `zyx` ArcGIS 行序 `{z}/{y}/{x}` / `tms` 南起 y 反算）、`matrixSet`、`style` 可选字段。
2. **新增公共解析模块** `common/basemap/xyzWmtsCapabilities.js`（纯 JS 无 OL 依赖）：`detectTileYScheme`、`ensureWmtsServiceInfo`（GetCapabilities 拉取 + Promise 缓存 + 图层清单/优选 3857 系 TileMatrixSet 解析）。

---

## 同日补充（13:10）——在线服务查询能力保持

**问题**：服务进入 TOC「在线服务」分组后，原生的要素查询能力存在两个断点：
1. TOC 节点"打开属性表"动作对 rsvc 节点打开的是空属性表（在线服务没有 features）；
2. OL 端点选监听仅在 custom URL 加载流程中绑定——若服务经其他入口注册，地图点击无查询响应。

**修复**：
1. `TOCPanel.vue openAttributeTable`：拦截 `rsvc:` 前缀节点——queryable 且可见的服务给出引导提示（"直接在地图上单击要素即可查看属性"），未开放查询的提示"该服务未开放查询能力"，不再打开空属性表；
2. `useLayerControlHandlers.js`：`singleclick` 监听改为 `watch(mapInstanceRef)` 地图就绪即常驻绑定（无候选时处理器自行短路），注册表中任何 visible && queryable 的服务在任意入口加载后都保持点选查询。

**现状说明**：OL/Cesium 双引擎的点选候选收集均已以注册表为源（`kind === 'arcgis' && visible && queryable`），本次修复补齐了"监听绑定时机"与"TOC 动作语义"两个缺口。WMS GetFeatureInfo 尚未实现（现有 identify 仅覆盖 ArcGIS REST），已在迭代清单中记录。
