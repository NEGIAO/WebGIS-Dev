# 底图目录统一元数据与分类架构重构方案

> 状态：阶段 1–4 已落地，阶段 5 清理与文档同步中（需求见 [`../TODO/2026-11-27-basemap-catalog-requirements.md`](../TODO/2026-11-27-basemap-catalog-requirements.md)）
> 日期：2026-11-27
> 适用：OpenLayers 与 Cesium 双引擎、WebGIS-Dev 全站底图体系

---

## 1. 背景与目标

当前底图系统已接入上百个瓦片源，但缺少统一分类与元数据：

- 图层定义散落在 `domains/ol/basemap/constants/definitions/group-1~4.ts`，同一条源需要同时写 `url` 与 `createSource`（OL 工厂），Cesium 又通过 side-effect projection + `basemapProviderFactory.ts` 再解释一遍。
- 预设 `basemapPresets.ts` 只有 `id / label / stack`，148 条线性排列；UI 平铺下拉难以查找。
- 坐标系归属没有字段，只能从 id 后缀（`_wgs` / `_gcj`）、纠偏代理包装（`gcj2wgsProxyUrl` / `wgs2gcjProxyUrl` / `bd2wgsProxyUrl`）或服务商语义推断。
- 历史影像（Sentinel 固定年份、ESRI Wayback 动态目录）、组合底图（AMAP 256 ltype、Google 全组合）、自定义 WMS/WMTS/MVT/XYZ 各自有专用过滤逻辑，分散在 UI composable 中。

**目标**：建立一份声明式、引擎无关的底图目录 SSOT；每个图层完整声明属性；UI 按「六大类 → 来源 → 坐标系 → 编号条目」自动渲染；OL 与 Cesium 共享同一份定义与检索 UI 语义；新增底图只需登记元数据。

**不可破坏的兼容契约**：

1. URL 参数 `l` 为 **1-based** 预设序号；管理页 `default_basemap_index` 为 **0-based**。
2. `ALL_BASEMAP_PRESETS` / `URL_LAYER_OPTIONS` / `BASEMAP_OPTIONS` 的既有顺序与 label 的「编号 + 名称」格式必须保持。
3. 所有历史 id、代理前缀路径与 XYZ 索引语义保持不变。
4. 默认预设 `custom_China_Blender_preset_2` 不变。

---

## 2. 现状调查摘要

### 2.1 数据与定义层

| 位置 | 现状 |
|---|---|
| `ol/basemap/constants/basemapCore.ts` | `LayerSourceDefinition`：`id/name/category/group/url/serviceType/createSource` + 可选 `maxZoom/tilePixelRatio/adapters/wms/wmts/styleUrl/needsContext`。`url` 给 Cesium 描述，`createSource` 给 OL 构造源，两处必须同步。 |
| `ol/basemap/constants/definitions/group-1~4.ts` | 约 174 条图层定义：`imagery/vector/terrain/theme/label/custom` 六大 legacy category；`serviceType` 以 `xyz` 为主，另有 `wms/wmts/osm/vector-tile/custom`；纠偏代理包装约 33 处（每处出现两次）。 |
| `common/basemap/basemapPresets.ts` | 148 个预设，`{id,label,stack}`；`ALL_BASEMAP_PRESETS` 按序加 `${index+1} ` 前缀。末尾 20 条 AMAP 256 组合、30 条 Google 组合由用户要求逐条显式声明，编号 99–148（当前工作树）。 |
| `common/basemap/basemapOptions.ts` | `getBasemapIdByUrlLayerNumber(n)` = `ALL_BASEMAP_PRESETS[n-1].id`，是 `l` 契约的单一入口。 |
| `common/basemap/catalogProjection.ts` + `ol/basemap/constants/basemapResolver.ts` | OL 模块加载时把 5 个查询函数发布给 Cesium；Cesium 静态 import 会有时序风险，因此用惰性 getter 规避。 |

### 2.2 UI 与交互

- **OL**：`LayerControlPanel.vue/.ts` 的组合下拉 = 平铺常规项 + 两层折叠组合项（AMAP/Google → GCJ/WGS）+ 历史影像页签（Sentinel 年份折叠 / ESRI Wayback 懒加载）+ 自定义 URL/WMS 输入；另有图层管理面板（拖拽排序、显隐、右键菜单、名称/ID 搜索）。
- **Cesium**：`CesiumToolPanel.vue/.ts` 有独立底图网格、两层折叠组合项、自定义 XYZ/WMS 输入；无常驻搜索；原生 BaseLayerPicker 与自定义面板双向同步。
- **共享**：`useSharedCustomBasemapUrl.ts`、`remoteServices.ts` 已是真共享；`comboBasemaps.ts` 刚被两边复用；历史影像分组与 Wayback 动态目录仍分散。

### 2.3 引擎适配

- Cesium 消费的是 `BasemapTileSourceDescriptor`（OL 模块投影出的 engine-neutral 元数据），而非 `LayerSourceDefinition.createSource`。
- `cesium/constants/basemapProviderFactory.ts` 按 `serviceType` 构造 `UrlTemplateImageryProvider` / WMS / WMTS；`vector-tile` 返回 null，MVT 通过 `CESIUM_SOURCE_FALLBACK_MAP` 降级；MFF 不支持。
- `cesium/composables/layers/imageryProviderBuilders.ts` 另有 `google/custom/tianditu` 硬编码分支，与 descriptor 路线并行，是主要漂移风险。

---

## 3. 统一元数据模型

### 3.1 一级分类（category）

| code | 名称 | 说明 |
|---|---|---|
| `service` | WMS/WMTS/MVT/XYZ 功能入口 | `custom`、`local_tiles`、远程服务注册入口、服务型图层 |
| `recommended` | 常用推荐底图 | 人工精选；默认预设及高频组合可打 `recommended` 标记 |
| `imagery` | 影像底图 | 卫星、航空类栅格底图 |
| `terrain` | 地形底图 | Google 山体、ESRI 山体阴影、MapTiler/Stamen/Stadia 地形、MFF、等高线等，不再混入影像/电子 |
| `electronic` | 电子底图 | 矢量渲染的电子地图、路网、注记、专题栅格图 |
| `historical` | 历史影像 | Sentinel 年度影像、ESRI Wayback 动态快照 |
| `vector` | 矢量瓦片 | MVT / ol-mapbox-style 样式类 |

> 一条记录只有一个主 `category`；多维属性用 `tags` 表达（如 Sentinel = `category: 'historical'`, `tags: ['imagery','yearly']`）。

### 3.2 二级分类（provider）

`AMAP` / `Google` / `Tianditu` / `Tuxin(图新)` / `Baidu` / `Tencent` / `ESRI` / `MapTiler` / `Mapbox` / `OSM` / `Carto` / `Stadia` / `Stamen` / `MFF` / `MineMap` / `GeoQ` / `Windy` / `Sentinel` / `ESRI Wayback` / `Local` / `Custom` / `Other`。

provider 由 id/name/url 显式声明，不再靠 UI 正则猜测；未知源统一 `Other` 并记录待归类。

### 3.3 三级分类（coord）

| code | 名称 | 判定 |
|---|---|---|
| `WGS84` | WGS-84 | 原生 WGS 或经 `gcj2wgs` / `bd2wgs` 纠偏后的输出 |
| `GCJ02` | GCJ-02 | 原生 GCJ 或经 `wgs2gcj` 火星化后的输出 |
| `BD09` | BD-09 | 百度原生网格；`wgs2bd` 输出 |
| `NONE` | 无坐标系 | 服务入口、纯 UI 触发项 |
| `MIXED` | 混合/复合 | 多图层堆叠且分属不同坐标系（如 China Blender） |

### 3.4 图层定义类型

```ts
export type BasemapCategory = 'service' | 'recommended' | 'imagery' | 'electronic' | 'historical' | 'vector';
export type BasemapProvider = /* 3.2 枚举 */;
export type BasemapCoord = 'WGS84' | 'GCJ02' | 'BD09' | 'NONE' | 'MIXED';
export type BasemapServiceType = 'xyz' | 'wms' | 'wmts' | 'osm' | 'vector-tile' | 'custom' | 'service-trigger';

export interface BasemapLayerDefinition {
  // 既有兼容字段
  id: string;
  name: string;
  group: string;                 // legacy 分组，保留以兼容 getLayerGroup()
  legacyCategory: LegacyCategory; // 原 category，保留兼容
  serviceType: BasemapServiceType;
  url: string;                   // 引擎无关模板（含代理包装）
  defaultVisible?: boolean;

  // 新分类元数据
  category: BasemapCategory;
  provider: BasemapProvider;
  coord: BasemapCoord;
  description: string;           // 悬停提示
  keywords?: string[];           // 搜索扩展词
  tags?: string[];               // 多维标签
  date?: string | number;        // 历史快照年份/日期
  source?: string;               // 出处/署名，用于 attribution
  recommended?: boolean;

  // 技术服务参数（原样迁移）
  needsContext?: 'tiandituTk' | 'ovitalTdtkey' | string[];
  tokenParam?: string;
  maxZoom?: number;
  tilePixelRatio?: number;
  subdomains?: string[];
  adapters?: unknown;
  styleUrl?: string;
  wms?: unknown;
  wmts?: unknown;
  nonStandardAdapter?: string;
}
```

### 3.5 预设定义类型

```ts
export interface BasemapPresetV2 {
  id: string;                    // 原 preset id，不变
  label: string;                 // 不含编号的短名
  stack: string[];               // layer id 列表，渲染顺序不变
  category: BasemapCategory;     // 显式声明，UI 直接用
  provider: BasemapProvider;
  coord: BasemapCoord;
  description?: string;
  keywords?: string[];
  date?: string | number;
  recommended?: boolean;
  dynamic?: 'wayback' | 'custom-service'; // 动态目录来源
}
```

**编号生成**：`ALL_BASEMAP_PRESETS` / `BASEMAP_OPTIONS` 继续按数组顺序生成 `编号 = index + 1`，与分类树完全解耦。UI 展示的是同一编号，只是按分类树重新排布。

---

## 4. 目录树与检索设计

### 4.1 树结构

```text
底图目录（顶部常驻搜索框：编号 / id / 名称 / 服务商 / 坐标系 / 描述）
├─ WMS/WMTS/MVT/XYZ 功能入口 (service)
│  └─ Custom ─ NONE ─ [2 自定义 XYZ / 2 WMS/WMTS/MVT]
├─ 常用推荐底图 (recommended)
│  └─ Tianditu / Google / AMAP ─ GCJ/WGS ─ [...]
├─ 影像底图 (imagery)
│  ├─ Google ─ WGS84 ─ [卫星/影像混合/纠偏 GCJ]
│  ├─ AMAP ─ GCJ02 ─ [原始影像]
│  └─ ESRI ─ WGS84 ─ [...]
├─ 电子底图 (electronic)
│  ├─ AMAP ─ GCJ02 / WGS84 ─ [土地利用/道路/建筑/水系…]
│  ├─ Google ─ GCJ02 / WGS84 ─ [标准电子/纯路网/水体/PB…]
│  └─ 天地图 ─ GCJ02 ─ [...]
├─ 历史影像 (historical)
│  ├─ Sentinel ─ WGS84 ─ [2016…2025]
│  └─ ESRI Wayback ─ WGS84 ─ [动态年份/日期快照]
└─ 矢量瓦片 (vector)
   ├─ Tianditu ─ GCJ02 ─ [MVT]
   └─ OpenFreeMap ─ WGS84 ─ [Liberty]
```

### 4.2 搜索契约

单框搜索，输入可匹配：

- **编号**：`99`、`高德256` 等；编号即 URL `l` 的 1-based 值。
- **图层 id**：`vector_amap_256_ltype_11_gcj`。
- **名称 / description / keywords**：`建筑`、`水系`、`无注记`、`山体阴影`。
- **provider / coord**：`Google`、`GCJ`、`WGS`。

搜索时自动展开命中的分类层级，显示扁平命中结果并显示其完整面包屑（分类 / 来源 / 坐标系），点击直接切换底图。

### 4.3 悬停提示

每个条目 `title` 显示：`编号 · name · provider / coord · description · source/date`，替代现在只有编号+名称的裸文本。

---

## 5. 引擎适配层

```text
common/basemap/catalog/            ← SSOT（纯数据 + 查询）
  types.ts                         类型与枚举
  taxonomy.ts                      分类标签与判定
  layers/                          声明式图层定义（迁移 group-1~4）
  presets.ts                       有序预设（迁移 basemapPresets）
  registry.ts                      byId / byCategory / byProvider / byCoord / tree / search
  compat.ts                        ALL_BASEMAP_PRESETS / URL_LAYER_OPTIONS / BASEMAP_OPTIONS 兼容导出

common/basemap/ui/                  ← 共享 UI 语义（无 OL/Cesium 依赖）
  basemapTree.ts                    树构建、过滤、面包屑
  basemapLabels.ts                  短标签与 tooltip 格式化

ol/basemap/adapters/                ← OL 专用
  createOlSource.ts                 从定义构造 XYZ/OSM/VectorTile/WMS/WMTS
cesium/basemap/adapters/            ← Cesium 专用
  createCesiumProvider.ts           从同一定义构造 ImageryProvider
```

- `catalogProjection.ts` 在迁移完成后降级为兼容层，不再承担 SSOT 发布职责。
- Cesium 侧 `google/custom/tianditu` 硬编码分支逐步收口到 `createCesiumProvider.ts`；MVT/MFF 降级策略作为定义上的 `fallbackLayerId` 声明，而不是散落 switch。
- `url` 中的纠偏代理包装成为定义的一部分，OL/Cesium 都读同一个字段，消除「url 与 createSource 两处同改」。

---

## 6. 历史影像与动态源

- Sentinel 年度影像：`category: historical`, `provider: Sentinel`, `coord: WGS84`, `date: 2016..2025`。
- ESRI Wayback：静态兜底定义保留；动态快照目录加载后映射为 `provider: ESRI Wayback`, `coord: WGS84`, `date: snapshot.date`, `dynamic: 'wayback'`，进入同一棵树，不再有独立 UI 分支。
- 自定义 XYZ / WMS / MVT：`provider: Custom`, `coord: NONE`, `dynamic: 'custom-service'`，统一落在 `service` 一级分类。

---

## 7. 分阶段实施计划

### 阶段 0：现状冻结与文档（本次）
- 产出本文档；确认分类、字段与兼容契约。
- 验收：评审通过，编号/兼容清单确认。

### 阶段 1：建立 common catalog 骨架（不改 UI）
- 新增 `types.ts / taxonomy.ts / registry.ts / compat.ts`。
- 从现有 `basemapPresets.ts` 与 definitions 生成初始元数据（先补 `category/provider/coord/description`，不改变顺序）。
- 加断言：148 个预设、编号映射、`ALL_BASEMAP_PRESETS` 与 `URL_LAYER_OPTIONS` 完全一致。
- 验收：`npm run typecheck` 通过；现有 URL `l` 行为不变。

### 阶段 2：迁移图层定义为声明式 SSOT
- 逐组迁移 group-1~4；把 `url + createSource` 合并为一条定义 + 引擎适配器。
- 保留 legacy 字段兼容导出，直到 OL/Cesium 适配层都切换完成。
- 验收：layer id 集合一致；纠偏代理 URL 字节级一致；Cesium descriptor 字段一致。

### 阶段 3：OL 下拉重构
- 顶部常驻搜索框；六大类折叠树；三级展开；悬停 tooltip。
- 删除 `comboBasemaps.ts` 特判与历史影像专用 UI 分支，改由 catalog tree 驱动。
- 验收：可从搜索命中任意编号/id/关键字；视觉上历史与组合项进入统一树。

### 阶段 4：Cesium UI 与适配层统一
- `CesiumToolPanel` 使用同一棵树与搜索逻辑；收口 `imageryProviderBuilders.ts` 硬编码分支。
- 验收：OL/Cesium 同一 preset 的 URL、坐标、tooltip 完全一致；MVT 降级显式标注。

### 阶段 5：清理与治理
- 删除临时兼容层与 side-effect projection；更新 architecture/usage/README 文档。
- 新增「新增底图」清单与校验脚本（id 唯一、provider/coord 必填、description 必填、URL 模板可解析）。
- 验收：全量 typecheck + 关键 URL 回归 + 文档一致。

---

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 148 个预设顺序被无意改动导致分享链接失效 | 阶段 1 加断言锁定编号；迁移只追加 metadata，不改数组顺序。 |
| 声明式定义遗漏 token/adapter 等运行时参数 | 阶段 2 逐字段对照迁移清单，分层验证。 |
| Cesium 特殊分支收口后行为漂移 | 阶段 4 建立 preset→provider 快照回归（URL、serviceType、fallback）。 |
| 动态 Wayback 快照为空时树节点消失 | 保留静态兜底项与加载状态，不删除一级分类。 |
| 分类主观性导致反复调整 | 分类字段与展示树解耦；改分类只改 metadata，不改 id/编号。 |

---

## 9. 附录：迁移字段清单

必须迁移：`id`, `name`, `legacyCategory`, `group`, `serviceType`, `url`, `defaultVisible`, `needsContext`, `tokenParam`, `maxZoom`, `tilePixelRatio`, `subdomains`, `adapters`, `styleUrl`, `wms`, `wmts`, `nonStandardAdapter`, `stack`。

新增必填：`category`, `provider`, `coord`, `description`。

新增可选：`keywords`, `tags`, `date`, `source`, `recommended`, `dynamic`, `fallbackLayerId`。

## 10. 实施记录（2026-11-27）

| 阶段 | 状态 | 落地内容 |
|---|---|---|
| 0 现状与文档 | ✅ | 完成三路调查，产出本文档与需求整理文档。 |
| 1 catalog 骨架 | ✅ | `common/basemap/catalog/{types,taxonomy,layers,registry,compat,index}.ts`；`check-basemap-catalog` 校验 148 预设与编号。 |
| 2 图层元数据登记 | ✅ | `definitions/` 已从 group-1~4 重组为 6 个分类文件：`category-service/imagery/terrain/electronic/historical/vector.ts`。174 条定义逐条显式写入 `order/id/name/url/catalogCategory/provider/coord/description`（历史项含 `date`），每条 URL 均为完整字面量或代理包装的字面量。`basemapConfig.ts` 按 `order` 恢复原顺序；`registry.ts` 从源定义读取元数据。 |
| 3 OL 下拉重构 | ✅ | `useBasemapCatalog` 接入共享 `useBasemapCatalogUi`；下拉改为「常驻搜索 + 六大类 → 服务商 → 坐标系 → 编号条目」；Wayback 动态快照并入历史影像分类。 |
| 4 Cesium 共享目录 | ✅ | `CesiumToolPanel` 使用同一棵目录树与搜索；`buildUnifiedBasemapOptions()` 用 catalog 元数据填充 description/provider/coord。 |
| 5 清理治理 | 🔄 | 校验脚本与文档已同步；`imageryProviderBuilders.ts` 的 google/custom/tianditu 兼容分支暂保留为 fallback，后续可在行为快照回归后移除。 |

**关键实现文件**：

- `frontend/src/domains/common/basemap/catalog/`
- `frontend/src/domains/common/basemap/ui/useBasemapCatalogUi.ts`
- `frontend/src/domains/ol/layer/components/LayerControlPanel.vue/.ts`
- `frontend/src/domains/ol/layer/composables/useBasemapCatalog.ts`
- `frontend/src/domains/cesium/components/CesiumToolPanel.vue/.ts`
- `frontend/src/domains/cesium/composables/layers/layerUtils.ts`
- `frontend/scripts/check-basemap-catalog.mjs`

**验收命令**：

```bash
cd frontend
npm run typecheck
npm run check:basemap-catalog
```

> 后续清理：在建立 preset→provider 行为快照回归后，移除 Cesium 旧硬编码分支与 `catalogProjection` 兼容层。
