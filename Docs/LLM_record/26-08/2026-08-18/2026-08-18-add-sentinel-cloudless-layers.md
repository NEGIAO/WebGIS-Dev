# V3.5.26 新增 Sentinel-2 无云年度影像图层与预设（EOX 2016~2025）

## 日期与时间

2026-08-18 18:35（任务时间线：18:25 验证 EOX 图层 → 18:35 完成实施）

## 任务等级

L2（常规：新增图层定义与预设，无新增文件、无配置 key）

## 问题分析

- **核心症状**：用户要求将 EOX Sentinel-2 无云（cloudless）年度影像 2025 年版本加入底图，并要求补齐 2016~2025 全部年份。用户原文写「乌云影像」，实为「无云影像」（cloudless mosaic）之误。
- **根本原因**：无 Bug；这是一次纯增量功能需求。唯一风险点是「2016 年度层是否存在」——经 WMTS Capabilities 实证（见解决方案），EOX 并无 `s2cloudless-2016_3857` 独立年度层。
- **受影响模块**：前端底图配置域（`basemapConfig.ts` 图层定义、`basemapPresets.ts` 预设目录）；两文件均为纯数据/常量层，OL 与 Cesium 消费方自动派生，无引擎代码改动。

## 修改内容

1. `basemapConfig.ts`：新增 EOX Sentinel-2 无云图层生成器 `buildS2CloudlessDef(year)` + URL 模板函数 `EOX_WMTS_URL(layer)`，批量产出 10 个年度图层定义：
   - id `imagery_s2_cloudless_2016` ~ `imagery_s2_cloudless_2025`
   - 2016 → `layer=s2cloudless_3857`（官方聚合层，Capabilities 标题即 "Sentinel-2 cloudless layer for 2016"）
   - 2017~2025 → `layer=s2cloudless-{year}_3857`
   - URL 模板：`https://tiles.maps.eox.at/wmts?layer={layer}&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}`
   - category `imagery` / group `影像` / serviceType `xyz`；createSource 复用同一模板串（杜绝 url/createSource 两字段漂移）
2. `basemapPresets.ts`：末尾追加 10 个预设 `imagery_s2_cloudless_YYYY_preset`，label「Sentinel无云YYYY」，stack = 年度图层 + `label_tianditu` 注记叠加（与天地图影像/MapTiler影像等影像预设惯例一致）。
3. 版本号 V3.5.24 → **V3.5.26**（并行会话已完成 V3.5.25 KML/KMZ 修复，按撞车规则后完成者顺延）：README 三处 + CHANGELOG 顶部条目。

## 修改原因

用户需要 Sentinel-2 无云年度影像作为底图（常用于地物变化观察、无云合成底图场景），EOX 提供 2016~2025 公开 WMTS 服务（CC BY 4.0，零 token），直接以 `{z}/{x}/{y}` 模板接入现有 XYZ 管线。

## 影响范围

- 图层管理面板：新增 10 个影像图层条目（自动派生，无代码改动）
- 底图预设列表：新增 10 项（追加尾部，既有 `l` 索引编号 0~76 不受影响）
- Cesium 引擎：`getDescriptorById` 按 url + serviceType 自动派生，零改动
- 无后端、无配置 key、无路由改动

## 解决方案

- **方案对比**：
  1. 10 份手写字面量条目（≈130 行重复）——与文件既有风格一致，但 10 年结构完全相同，维护任一字段（如 maxZoom、URL 变更）需改 10 处，漂移风险高。
  2. **生成器收敛（选定）**：`buildS2CloudlessDef(year)` 产出定义，`EOX_WMTS_URL(layer)` 统一模板串；文件内已有 `buildTiandituUrl`、`withSkipHighResTile` 等函数先例，不违背既有风格。url 与 createSource 天然同源，解决文件头注释中「写两次」的已知痛点。
- **2016 年确认流程（禁止臆造）**：逐年份 curl 实测 → 2016 返回 400 → 拉取官方 `WMTSCapabilities.xml` 全文检索 → 确认不存在 `s2cloudless-2016_3857`，仅存在 `s2cloudless_3857` 聚合层且其标题即 "Sentinel-2 cloudless layer for 2016" → 2016 映射到聚合层。2017~2025 逐层实测 200。
- 无 maxZoom 显式限制：Capabilities 无 TileMatrixSetLimits，与多数既有定义保持一致（服务端超范围返回空瓦片）。

## 性能指标

未实测（纯配置增量，10 个图层仅按需加载，不增加常驻开销）。

## 测试方案

**Agent 已执行**：
- curl 逐年份验证图层名：2017~2025 全部 200，2016 确认 400（不存在）
- 拉取并检索官方 WMTSCapabilities.xml：确认聚合层 `s2cloudless_3857` = 2016 官方层，`_3857` 矩阵集 = GoogleMapsCompatible
- `npx tsc --noEmit`：零新增报错
- `python CheckStructureTree.py` / `python CheckConfigRegistry.py`：通过（见门禁结果）

**待用户实机验证**：
1. `npm run dev` 重启前端，打开底图预设列表（URL 参数 `l`），选择任一「Sentinel无云YYYY」预设，预期显示对应年度全球无云影像 + 天地图注记
2. 图层管理面板搜索「Sentinel」，预期出现 10 个年度影像图层，可单独叠加
3. 切换到任意年份后缩放至 z≥10，观察瓦片正常加载（国内网络直连 tiles.maps.eox.at 若有延迟属正常）

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | 新增 `EOX_WMTS_URL` + `buildS2CloudlessDef` 生成器，注入 10 个年度图层定义 |
| `frontend/src/domains/common/basemap/basemapPresets.ts` | 末尾追加 10 个 Sentinel 无云预设 |
| `README.md` | 版本号三处更新至 V3.5.26 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.5.26 条目 |
| `Docs/LLM_record/26-08/2026-08-18/2026-08-18-add-sentinel-cloudless-layers.md` | 本日志 |

## 遗留与风险

- 2016 年官方仅提供聚合层（非年度独立层），已映射 `s2cloudless_3857`，若未来 EOX 推出独立 2016 年度层需改生成器年份映射。
- EOX 服务为公开免费服务，偶发限流属正常；未走后端代理，国内网络直连速度取决于出口链路。
- 无新增配置 key，无需登记。

## 门禁结果

- `python CheckStructureTree.py`：✅ 通过（无文件增删）
- `python CheckConfigRegistry.py`：✅ 通过（无新增配置 key）
- `npx tsc --noEmit`（frontend）：✅ 零报错
