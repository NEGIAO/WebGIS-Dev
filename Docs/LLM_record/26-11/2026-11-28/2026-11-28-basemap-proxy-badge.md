# 2026-11-28 底图条目「proxy」纠偏/代理标识（V3.7.24）

- **日期与时间**：2026-11-28 12:15 – 12:25（CST）
- **任务等级**：L2（数据链 + 双引擎渲染，多文件）
- **本次版本**：V3.7.24
- **任务来源**：用户指令——经纠偏/代理的图层在条目前加 `proxy` 标识（样式类似坐标徽标），表明该图源经 VPS 瓦片代理。

## 问题分析

**核心症状**：目录条目无法区分「直连图源」与「经 VPS 纠偏/代理图源」——后者依赖外部 VPS 可用性，故障排查与选图时无从判断。

**判定口径（SSOT 落在登记点）**：`correction !== 'none'`（纠偏必经 VPS）或 `proxy === 'proxy'`（显式代理）→ `proxied: true`；`proxy: 'auto'`（兜底代理，直连为主）与 `'direct'` 不标识。

**受影响模块**：`definitions/index.ts`（登记点）、`catalog/{types,registry}.ts`、双引擎目录条目渲染（推荐 / 服务商平铺 / 搜索结果共 6 处）。

## 修改内容

1. `definitions/index.ts`：登记映射时计算 `proxied` 字段（判定口径唯一出处，注释写明 auto/direct 不标识的理由）。
2. `catalog/types.ts`：`BasemapLayerDefinition.proxied?` 与 `BasemapCatalogEntry.proxied?` 字段。
3. `catalog/registry.ts`：`buildEntries` 透传 `proxied`，并向 keywords 追加 `'proxy'`（搜索「proxy」可列出全部代理图源）。
4. 双引擎条目渲染（OL/Cesium 各 3 处：推荐、服务商平铺、搜索结果）：编号后、名称前插入 `<span class="entry-proxy-tag">proxy</span>`（title 说明「经 VPS 瓦片代理（纠偏/代理转发）」）。
5. 徽标 CSS（`.entry-proxy-tag`，两引擎镜像）：accent 淡底 + `--brand-accent-dark/accent` 前景，与右侧灰色坐标徽标形成「前 proxy / 后坐标」阅读序；触屏档字号同步放大（两引擎 coarse 块）。

## 修改原因

让代理依赖在选图时可见——VPS 不可达时这类图源会加载失败，用户应能预先识别。

## 影响范围

目录条目渲染与搜索关键词。不影响：加载链路、编号契约、纠偏/代理行为本身。

## 性能指标

不适用（静态字段 + 条件渲染）。

## 测试方案

### Agent 已执行

- 一次性冒烟脚本：`proxied 36 / 148`（33 纠偏 + 3 显式代理，与 V3.7.16 迁移日志的纠偏 33/代理 3 计数吻合）；搜索 `proxy` 命中 36/36 PASS。
- `vue-tsc --noEmit`：**0 错误**。
- `check-layer-definitions` / `check-basemap-catalog` / 结构树 / 配置登记 / 分域依赖：**全绿**（合并并行会话改动状态）。
- §11.2 红线扫描：仅既有假阳性。

### 待用户实机验证

1. OL/Cesium 目录：高德(WGS)、百度、Google 纠偏系列等条目前显示 `proxy` 徽标，WGS84 原生条目（如天地图）不显示。
2. 搜索框输入 `proxy` 命中全部 36 条代理图源。
3. 徽标悬停提示「经 VPS 瓦片代理（纠偏/代理转发）」；触屏档字号可读。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/index.ts`——登记时计算 proxied
- `frontend/src/domains/common/basemap/catalog/types.ts`——两处 proxied 字段
- `frontend/src/domains/common/basemap/catalog/registry.ts`——透传 + 搜索关键词
- `frontend/src/domains/ol/layer/components/LayerControlPanel.vue`——3 处渲染 + CSS + 触屏档
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue`——3 处渲染 + CSS + 触屏档
- `README.md` / `Docs/Guide/CHANGELOG.md`——V3.7.24 三处版本号 + 条目
- 本日志

## 遗留与风险

- `auto` 兜底代理的图层不加标识（直连为主的口径）；若希望「运行时实际走了代理」的动态标识，需订阅瓦片请求结果，属另一量级任务，未纳入。
- 徽标文案为英文 `proxy`（与 WGS84/GCJ02 技术标识风格一致）；如需改「代理」中文文案，两引擎模板各改一词。
