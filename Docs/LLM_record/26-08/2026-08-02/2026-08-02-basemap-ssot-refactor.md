# 底图配置架构重构：单一真相源 + Cesium 自动派生

| 项目 | 内容 |
|---|---|
| **日期与时间** | 2026-08-02 20:30 |
| **任务等级** | L3（架构级） |
| **版本** | V3.5.9 |

---

## 问题分析

### 核心症状

底图配置分散在 3 个文件中，通过「人工保持同步」的方式维护一致性：

| 文件 | 引擎 | 内容 | 行数 |
|---|---|---|---|
| `basemapConfig.ts` | OpenLayers | `createSource` 工厂 + URL | ~1267 → ~1548 |
| `sourceDescriptors.ts` | Cesium | 纯元数据（id/name/category/url） | ~887 → **已删除** |
| `basemapPresets.ts` | 无引擎依赖 | 预设堆叠顺序 | ~215 → ~230 |

**痛点**：
- 增删改一个底图需同时改 3 个文件，人工同步易出错
- `sourceDescriptors.ts` 是 `basemapConfig.ts` 的真子集（字段完全重复）
- 文件头注释写着「三个文件必须同步」本身就是架构负债

### 根本原因

历史演化路径：
1. 先有 `basemapConfig.ts`（OL 专用，含 createSource 工厂）
2. 引入 Cesium 时，Cesium 不需要工厂函数只需要元数据，于是复制一份 → `sourceDescriptors.ts`
3. 为了优化登录页打包体积，抽离 `basemapPresets.ts`

结果：同一份知识（底图 URL / id / name）存在 3 处，违反 SSOT 原则。

### 受影响模块

- 底图配置层（`ol/basemap/constants/`）
- Cesium 引擎适配层（`cesium/constants/basemapProviderFactory.ts`）
- Cesium 图层 composable（`cesium/composables/layers/layerUtils.js`）
- 预设 UI（`basemapResolver.ts` → `BASEMAP_OPTIONS`）

---

## 方案对比

| 方案 | 优点 | 缺点 | 选择 |
|---|---|---|---|
| **A. 三文件保持 + 加强注释** | 零改动 | 人工同步问题未解决 | ❌ |
| **B. 单文件 + Cesium 自动派生 + Presets 序号前缀** | 彻底解决 SSOT；增删改只需 1 文件 | 需重构 7 文件 | ✅ |
| **C. 运行时动态生成 sourceDescriptors** | 零维护 | 运行时开销；类型安全弱 | ❌ |

**选定方案 B**：单一真相源 + 编译时自动派生 + Presets 序号前缀。

---

## 修改内容

### 阶段一：改造 `basemapConfig.ts`

1. **类型定义更新**：`LayerSourceDefinition` 新增 `url`、`serviceType`、`maxZoom`、`tilePixelRatio`、`subdomains`、`needsContext`、`wms`、`wmts` 字段
2. **删除废弃机制**：`GOOGLE_MANUAL_HOST`、`activeGoogleTileHost`、`buildGoogleTileUrl` 完全删除
3. **Google URL 硬编码**：`imagery_gac` 从 `buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}')` 改为 `'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}'`
4. **批量注入字段**：90 个图层定义补充 `url` + `serviceType` 字段（通过 Node.js 脚本批量注入）
5. **新增派生函数**：`TileSourceDescriptor` 类型 + `getDescriptorById()` + `getAllDescriptorIds()`
6. **头注释更新**：从「三文件必须同步」改为「单一真相源」

### 阶段二：删除 sourceDescriptors.ts + 更新引用

1. **删除文件**：`sourceDescriptors.ts`（887 行）
2. **更新 `index.ts`**：
   - 删除 `GOOGLE_MANUAL_HOST`/`activeGoogleTileHost`/`buildGoogleTileUrl` 导出
   - `TileSourceDescriptor`/`getDescriptorById`/`getAllDescriptorIds` 改为从 `basemapConfig` 导出
3. **更新 Cesium 引用**：
   - `basemapProviderFactory.ts`：import 路径 `sourceDescriptors` → `basemapConfig`
   - `layerUtils.js`：import 路径 `sourceDescriptors` → `basemapConfig`

### 阶段三：Presets 加序号前缀

1. **`basemapPresets.ts`**：
   - 新增 `ALL_BASEMAP_PRESETS`（`BASEMAP_PRESETS` 每条 label 加序号前缀 `"${index} ${label}"`，与 URL 参数 `l` 索引对齐）
   - `URL_LAYER_OPTIONS` 改为基于 `ALL_BASEMAP_PRESETS`
   - 更新头注释（删除「三文件必须同步」）

2. **`basemapResolver.ts`**：
   - 改用 `ALL_BASEMAP_PRESETS` 替代 `BASEMAP_PRESETS`
   - `LAYER_SOURCE_DEFINITIONS` 改为从 `basemapConfig` 导入

---

## 修改原因

1. **减少维护成本**：增删改底图从 3 文件 → 1 文件
2. **消除漂移风险**：Cesium 描述符自动从 OL 配置派生，不可能不一致
3. **URL 参数对齐**： Presets label 加序号前缀，与 URL `l` 参数索引一致，便于分享链接
4. **清理历史负债**：废弃的 Google 主机切换机制（`activeGoogleTileHost` 响应式 ref）已被更简单的硬编码替代

---

## 影响范围

| 模块 | 影响 |
|---|---|
| 底图配置 | 单一真相源，增删改只需维护 `basemapConfig.ts` |
| Cesium 引擎 | `getDescriptorById()` 行为不变，数据源从手动维护改为自动派生 |
| OL 引擎 | 无影响（`createSource` 工厂不变） |
| UI 预设下拉 | Presets label 加序号前缀（`"0 本地瓦片"`），与 URL `l` 参数索引对齐 |
| 后端 | 零改动 |
| 配置 key | 无新增 |

---

## 性能指标

**未实测**（架构重构，无性能影响预期）。

---

## 测试方案

### Agent 已执行

- `tsc --noEmit` 零新报错（EXIT: 0）
- 检查所有 `getDescriptorById` 调用点 import 路径正确（2 处：`basemapProviderFactory.ts`、`layerUtils.js`）
- 检查 `sourceDescriptors.ts` 无外部引用残留（grep 确认仅文件内部使用）
- 检查 `TILE_SOURCE_DESCRIPTORS` 无外部引用
- 临时脚本 `inject-url-fields.cjs` 已清理
- 门禁脚本未运行（需用户验证）

### 待用户实机验证

- OL 引擎：切换所有底图预设，确认瓦片正常加载
- Cesium 引擎：切换所有底图预设，确认瓦片正常加载
- 代理图层（高德 WGS、Google 后端代理）：确认纠偏/代理生效
- 天地图图层：确认 token 注入正常
- 自定义 URL（custom）：确认输入 URL 后正常加载
- 自动兜底 preset：在 UI 底部可见「Other: xxx」选项（未实现，本次不包含）
- `imagery_gac`（Google gac）：确认瓦片正常（URL 已硬编码）

---

## 变更文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | 修改 | 新增 url 字段、getDescriptorById；删除 Google 切换机制；类型扩展 |
| `frontend/src/domains/ol/basemap/constants/sourceDescriptors.ts` | **删除** | 由 basemapConfig 自动派生替代 |
| `frontend/src/domains/ol/basemap/constants/basemapPresets.ts` | 修改 | 新增 ALL_BASEMAP_PRESETS（序号前缀） |
| `frontend/src/domains/ol/basemap/constants/basemapResolver.ts` | 修改 | 使用 ALL_BASEMAP_PRESETS；import 路径调整 |
| `frontend/src/domains/ol/basemap/constants/index.ts` | 修改 | 删除 Google 切换导出；sourceDescriptors 导出改为 basemapConfig |
| `frontend/src/domains/cesium/constants/basemapProviderFactory.ts` | 修改 | import 路径 sourceDescriptors → basemapConfig |
| `frontend/src/domains/cesium/composables/layers/layerUtils.js` | 修改 | import 路径 sourceDescriptors → basemapConfig |
| `README.md` | 修改 | 版本号三处（V3.5.8 → V3.5.9） |
| `Docs/Guide/CHANGELOG.md` | 修改 | 顶部追加 V3.5.9 条目 |
| `Docs/Guide/frontend-structure.md` | 修改 | 删除 sourceDescriptors.ts 条目；更新 basemapConfig/Presets 注释 |

---

## 遗留与风险

| 项目 | 说明 |
|---|---|
| `BASEMAP_PRESETS` 仍从 `basemapConfig` re-export | 向后兼容，后续可清理 |
| 未在 preset 中配置的底图不会出现在 UI 下拉 | 需手动在 `basemapPresets.ts` 添加 preset；后续可选实现自动兜底 |
| `adapters` 字段仍在使用 | Maps For Free 系列需要，保留在类型定义中 |

---

## 下一步建议

1. 运行门禁脚本：`python CheckStructureTree.py` + `python CheckConfigRegistry.py`
2. 实机验证：OL/Cesium 切换底图
3. 后续可选：实现自动兜底 preset（未配置的底图自动追加到 UI 底部）
