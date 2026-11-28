# 2026-11-28 修复图层 id 重复与 Bing 道路坐标系（V3.7.37）

- **日期与时间**：2026-11-28 15:12 – 15:14（CST）
- **任务等级**：L1（数据一致性修复）
- **本次版本**：V3.7.37
- **任务来源**：用户截图反馈 `[basemap-definitions] 图层定义校验失败：图层 vector_geoq_hydro 的 id 重复`。

## 问题分析

截图中的重复 id 来自并发会话中间态：核查时 `vector_geoq_hydro` 在源码中已唯一（仅 `category-electronic.ts` 一条，另有 `vector_geoq_hydro_wgs` 派生版），`check-layer-definitions` 的重复 id 分支已可通过。但继续跑门禁发现第二个遗留问题：`vector_bing_road` 被误标为 `GCJ02`，触发「原始 GCJ 图层缺 gcj2wgs 派生版」门禁。

## 修改内容

- 确认 `vector_geoq_hydro` 全仓唯一，无需再删除定义。
- `vector_bing_road`：`coord` 由 `GCJ02` 改回 `WGS84`，description 同步；URL、method、`nonStandardAdapter`、`engines:['ol']`、`maxZoom:19` 均不变。
- README / CHANGELOG V3.7.37；架构/交接/结构树计数同步为 205 定义 / 181 preset。

## 修改原因

Bing 道路与 Bing 影像/混合同源，均为标准 Web Mercator WGS84；误标 GCJ02 会触发无意义的纠偏预期并使配对门禁失败。

## 影响范围

仅 `vector_bing_road` 的坐标元数据；不影响瓦片请求 URL 与加载管线。当前定义总数 205，order 连续 1..205。

## 测试方案

- Agent：`check-layer-definitions` / `check-basemap-catalog` 全绿；全仓 `vector_geoq_hydro` 仅一处定义。
- 用户：刷新应用后不应再出现 id 重复弹窗；Bing 道路坐标徽标显示 WGS84。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-electronic.ts`——Bing 道路坐标修正
- `README.md` / `Docs/Guide/CHANGELOG.md`——V3.7.37
- `Docs/Architecture/basemap-catalog-redesign.md` / `Docs/Guide/handover.md` / `Docs/Guide/frontend-structure.md`——计数同步
- 本日志
