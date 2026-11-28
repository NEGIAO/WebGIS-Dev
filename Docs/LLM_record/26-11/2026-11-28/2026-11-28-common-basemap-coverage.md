# 2026-11-28 补全互联网常用底图资源（V3.7.34）

- **日期与时间**：2026-11-28 14:37 – 14:45（CST）
- **任务等级**：L2（公共底图资源普查 + 定义补全 + 适配器注册）
- **本次版本**：V3.7.34
- **任务来源**：用户指令：目标是罗列清晰并归类互联网上所有常用底图；检查当前瓦片底图还有哪些缺失但为互联网/GISer 常用的资源，去网上搜索并补充完善、分类。

## 问题分析

**核心症状**：目录已有 188 条定义，但部分 GISer 日常高频使用的公共底图缺席，尤其是 Bing 全系（使用 quadkey 而非 XYZ）、Mapbox/MapTiler/CARTO 常用风格变体、USGS 国家地图、OpenSeaMap/OpenRailwayMap 专题层、NASA GIBS 全球影像。

**研究来源**：
- `leaflet-providers`（GitHub `leaflet-extras/leaflet-providers`，1137 行）作为公共 XYZ 源清单，提取 OpenStreetMap / Stadia / Esri / CartoDB / NASA GIBS / USGS / HERE / TomTom 等官方 URL 模板与变体。
- `xyzservices`（geopandas）检索结果交叉确认 CARTO / Stadia 变体命名。
- 真实瓦片请求：北京 `z12/x3371/y1551`（Bing/Mapbox/MapTiler）；NASA `z8/x210/y96`。

## 实测证据（节选）

| 探测项 | 响应 | 判定 |
| :--- | :--- | :--- |
| Bing `a{q}.jpeg`（quadkey） | 200 JPEG RGB 256²，31,329 B | 纯影像底图可用 |
| Bing `r{q}.png` | 200 PNG P 256²，32,183 B | 道路底图可用 |
| Bing `h{q}.jpeg` | 200 JPEG RGB 256²，24,976 B | 混合影像可用 |
| Mapbox streets-v12 / outdoors-v12 / light-v11 / dark-v11 | 均 200 PNG P **512²** | 需 `tilePixelRatio:2` |
| MapTiler bright-v2 / positron | 均 200 PNG P **512²** | 需 `tilePixelRatio:2` |
| NASA MODIS Terra True Color（2026-11-20） | 200 JPEG RGB 256²，15,609 B | GIBS 模板可用 |
| 百度 `qt=tile&styles=pl` 卫星 | 200 但仅 197 B 纯空白 PNG | 坐标网格不匹配，未纳入 |
| Yandex / CARTO / Stadia / USGS 直连 | 本地代理 502 / SSL EOF | 采用 leaflet-providers 官方模板，参数可信 |

## 修改内容

### 1. 新增 19 条定义（下表 order 为新增时分配；与并发会话合并后 order 连续覆盖 1..206，实际编号以代码为准）

| order | id | 分类 | 服务商 | 说明 |
| ---: | :--- | :--- | :--- | :--- |
| 189 | `imagery_bing_aerial` | imagery | Bing | Bing 影像（quadkey，OL only） |
| 190 | `vector_bing_road` | electronic | Bing | Bing 道路（OL only） |
| 191 | `imagery_bing_hybrid` | imagery | Bing | Bing 混合影像（OL only） |
| 192 | `vector_mapbox_streets` | electronic | Mapbox | Streets v12，512px |
| 193 | `terrain_mapbox_outdoors` | terrain | Mapbox | Outdoors v12，512px |
| 194 | `vector_mapbox_light` | electronic | Mapbox | Light v11，512px |
| 195 | `vector_mapbox_dark` | electronic | Mapbox | Dark v11，512px |
| 196 | `vector_maptiler_bright` | electronic | MapTiler | Bright v2，512px |
| 197 | `vector_maptiler_positron` | electronic | MapTiler | Positron，512px |
| 198 | `vector_carto_voyager` | electronic | Carto | Voyager |
| 199 | `vector_carto_positron_nolabels` | electronic | Carto | light_nolabels |
| 200 | `vector_carto_dark_nolabels` | electronic | Carto | dark_nolabels |
| 201 | `terrain_usgs_topo` | terrain | Other(USGS) | USGSTopo |
| 202 | `imagery_usgs` | imagery | Other(USGS) | USGSImageryOnly |
| 203 | `imagery_usgs_topo` | imagery | Other(USGS) | USGSImageryTopo |
| 204 | `label_openseamap` | terrain | OpenSeaMap | seamark 海图注记层 |
| 205 | `vector_openrailwaymap` | electronic | OpenRailwayMap | standard 铁路专题层 |
| 206 | `imagery_nasa_modis_terra` | imagery | NASA | MODIS Terra True Color（2026-11-20） |
| 207 | `imagery_nasa_viirs_night` | imagery | NASA | VIIRS City Lights 2012 |

### 2. 引擎与目录适配

- `nonStandardAdapters.ts` 注册 `buildBingQuadKeyAdapter` 三个变体（`a` / `r` / `h`）。该适配器已存在于 `ol/tile-source/xyzSource.ts`，此前未接入注册表。
- Bing 三条标 `engines:['ol']`：Cesium 侧 `nonStandardAdapter` 仅支持 MFF，quadkey 尚无对应实现，避免在 3D 引擎中产生无效图层。
- `taxonomy.ts` 的 `PROVIDER_ORDER` 与 `PROVIDER_MATCHERS` 补 Bing / NASA / OpenSeaMap / OpenRailwayMap；类型早已声明这些 provider，但排序表缺席会导致目录树不输出。
- `basemapPresets.ts` 追加 19 个 preset（编号 163..181），既有 1..162 不变。
- 门禁数量与末项断言同步；架构/交接/结构树计数 206 定义 / 181 preset。

## 修改原因

目录的「全面覆盖」目标要求既有大众源（Bing / Mapbox / Esri / Google）也有专题源（海图、铁路、NASA）。Bing 因 quadkey 编码长期缺席，是本次最关键的补齐项；其适配器已在代码库但从未注册，属于断链修复。

## 影响范围

仅新增定义与 preset、适配器注册、provider 排序；不改既有 order、URL、纠偏语义。Cesium 目录会显示 Bing 条目但加载返回 null（与既有 MVT 行为一致），待后续补 Cesium quadkey 适配器。

## 解决方案

```mermaid
flowchart LR
    A[leaflet-providers / xyzservices] --> B[筛选高频公共源]
    B --> C[真实瓦片请求验证]
    C --> D[新增 19 条定义 + preset]
    D --> E[Bing quadkey 适配器注册]
    E --> F[provider 排序补全]
    F --> G[206 定义 / 181 preset 全量门禁]
```

## 性能指标

新增 19 条定义对目录构建为 O(19) 增量；512px 图源显式 `tilePixelRatio:2` 避免渲染缩放错误。

## 测试方案

### Agent 已执行

- 31 组候选 URL 实测（Bing 3 / 百度 1 / Yandex 1 / Mapbox 4 / CARTO 3 / Stadia 2 / MapTiler 2 / USGS 3 / NASA 2），记录 HTTP/格式/尺寸/透明率。
- `check-basemap-catalog`：OK 181 presets。
- `check-layer-definitions`：OK 206 definitions，order 1..206，配对门禁通过。
- `vue-tsc` 与其余门禁见最终回复。

### 待用户实机验证

1. OL 目录新增 163..181 编号；Bing 影像/道路/混合瓦片正确加载（quadkey 编码生效）。
2. Mapbox / MapTiler 512px 瓦片显示为 256 网格清晰度，不错位。
3. Cesium 目录显示 Bing 但不加载（已知限制）；NASA/USGS/OpenSeaMap 在 OL 中可见。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-imagery.ts`——新增 6 条（189/191/202/203/206/207）
- `frontend/src/domains/common/basemap/definitions/category-electronic.ts`——新增 10 条（190/192/194/195/196/197/198/199/200/205）
- `frontend/src/domains/common/basemap/definitions/category-terrain.ts`——新增 3 条（193/201/204）
- `frontend/src/domains/common/basemap/basemapPresets.ts`——新增 19 个 preset（163..181）
- `frontend/src/domains/ol/basemap/loaders/nonStandardAdapters.ts`——注册 Bing quadkey 适配器
- `frontend/src/domains/common/basemap/catalog/taxonomy.ts`——provider 排序/匹配补 4 类
- `frontend/scripts/check-layer-definitions.mjs` / `check-basemap-catalog.mjs`——数量与末项断言
- `Docs/Architecture/basemap-catalog-redesign.md` / `Docs/Guide/handover.md` / `Docs/Guide/frontend-structure.md`——计数同步
- `README.md` / `Docs/Guide/CHANGELOG.md`——V3.7.34 版本更新
- 本日志

## 遗留与风险

1. **Bing 在 Cesium 不可用**：`nonStandardAdapter` 在 Cesium 侧仅 MFF，quadkey 未实现；条目已标 `engines:['ol']` 但目录层未做引擎过滤，3D 端选中会静默跳过。
2. **CARTO / Stadia / USGS 未本地实测**：代理拦截，采用 leaflet-providers 官方模板；如服务端策略变更需复核。
3. **百度卫星影像未纳入**：实测返回空白瓦片，推测其网格与标准 XYZ 不一致，需专门适配器后才能补齐。
4. **需要 API key 的 HERE / TomTom / Azure Maps / Thunderforest / OpenWeatherMap 未纳入**：项目现有 token 池只覆盖天地图/奥维，引入新凭据体系超出本次范围。
5. NASA MODIS 使用固定日期 `2026-11-20`；如需动态近实时需扩展 `TileLayerContext` 日期占位符。
