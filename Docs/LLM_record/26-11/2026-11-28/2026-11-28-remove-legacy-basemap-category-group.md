# 2026-11-28 删除底图旧兼容字段 category / group

- **日期与时间**：2026-11-28 11:12
- **任务等级**：L3 跨文件重构（用户明确指令「不再兼容旧的东西，删除相关的兼容性包袱；所有的代码」，依 Force_command §0 优先级 1 视为批准）
- **本次版本**：并入 V3.7.20（同批次并行会话，版本号已由另一会话占用，按 §5 顺延规则不新增版本）

## 问题分析

**核心症状**：`TileLayerDefinition` 保留 `category: LayerCategory` / `group: LayerGroup` 两个「仅兼容 descriptor / z-band」字段。实测 174 条定义中**没有任何一条**填写它们：

- `getLayerCategory(id)` 恒返回默认值 `'theme'`；
- `getLayerGroup(id)` 恒返回默认值 `'专题'`。

下游 12 个文件、64 处引用层层透传这两个常量，形成典型兼容性包袱。其中 `isBasemapLayerId`（`useMapBasemapPipeline.ts`）用旧 category 白名单判断是否底图 id，因恒为 `'theme'` 而恒返回 true——隐性依赖默认值的脆弱逻辑。

**用户要求**：这是架构重构，无需考虑旧内容，删除所有相关兼容性代码。

## 修改内容

1. **类型删除**：`definitions/types.ts` 删除 `LayerCategory` / `LayerGroup` 类型与 `TileLayerDefinition.category/group`；新增 `zBand?: 'label' | 'basemap'`（部分定义已填值）。
2. **查询链删除**：`ol/basemap/constants/basemapResolver.ts` 删除 `getLayerCategory`/`getLayerGroup`；`catalogProjection.ts` 删除 `BasemapLayerCategory`/`BasemapLayerGroup` 与投影接口两项；`catalog/compat.ts` 不再导出旧函数。
3. **配置输出**：`createLayerConfigs()` 改输出 `zBand` / `serviceType` / `styleUrl`，不再输出 `category`/`group`。
4. **消费端改造**（12 文件）：
   - `isBasemapLayerId` 改用 `getDescriptorById(id) !== undefined` 精确判断 id 是否在 174 条定义集合中（比原白名单更准确，非底图 id 现在正确返回 false）；
   - z-index 判断 `category === 'label'` 改用 `zBand === 'label'`；
   - `useBasemapStateManagement` 广播字段由 `category/group` 改为 `zBand`；
   - Cesium `getPresetPickerColor` 由 `firstDesc.category` 改为 `firstDesc.catalogCategory`（新分类映射到颜色）；
   - `useHomeEngineSwitch` / `useCesiumUrlTracking` 删除 `getLayerCategoryById`/`getLayerGroupById` 注入（底图 URL 映射本就只用 id↔index）；
   - `MapContainer` → `useMapLayerAndRoutePipeline` → `useDeferredUserLayerApis` → `useUserLayerActions` 整条未使用的 `getLayerCategory` 参数链删除。
5. **文档同步**：架构文档 §3.1 字段表删除旧字段、补 `zBand`；§8 实施记录新增阶段 6。

## 修改原因

用户明确要求架构重构不背旧包袱。旧字段已无实际数据支撑，保留只会误导维护者并制造恒真判断。

## 影响范围

仅前端底图模块（12 个 `.ts`/`.vue` 文件），零后端改动。行为等价性：`isBasemapLayerId` 从恒真改为精确判断（改进），z-index 带由已填值的 `zBand` 驱动（等价且更准确），Picker 颜色映射从 6 类旧值改为 7 类新目录值。

## 验证

### Agent 已执行

- `npx vue-tsc --noEmit`：**0 错误**（中途多次迭代，与用户并行编辑同步后收敛）。
- 全仓残留扫描：`LayerCategory` / `LayerGroup` / `legacyCategory` / `getLayerCategory` / `getLayerGroup` **零命中**；定义中 `category:` / `group:` 零命中（`catalog/types.ts` 的 `category` 是新目录字段，保留）。
- `npm run check:basemap-catalog`：OK（148 presets）。
- `npm run check:layer-definitions`：OK（174 definitions, orders 1..174）。
- `node scripts/check-basemap-migration.mjs`：SKIP（HEAD 旧定义 115 条 ≠ 迁移基线 174 条，按脚本设计显式跳过，非失败）。

### 待用户实机验证

1. OL/Cesium 底图切换正常（验证 `isBasemapLayerId` 新判断未误伤）。
2. 注记图层仍在 LABEL 带（zIndex 150~199）渲染，不被数据几何遮挡。
3. Cesium Picker 各分类图标颜色符合新映射。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/types.ts`：删旧类型/字段，加 zBand。
- `frontend/src/domains/common/basemap/definitions/index.ts`：登记时不再输出 legacyCategory。
- `frontend/src/domains/common/basemap/catalog/types.ts`：删 legacyCategory。
- `frontend/src/domains/common/basemap/catalogProjection.ts`：删旧类型与查询函数。
- `frontend/src/domains/ol/basemap/constants/basemapResolver.ts`、`constants/index.ts`：删旧函数与导出。
- `frontend/src/domains/ol/basemap/composables/useBasemapStateManagement.ts`：广播改 zBand。
- `frontend/src/domains/ol/composables/useMapBasemapPipeline.ts`、`useMapBasemapInstances.ts`、`useMapLayerAndRoutePipeline.ts`：改用 descriptor/zBand。
- `frontend/src/domains/ol/basemap/composables/useBasemapLayerBootstrap.ts`：zBand 判断。
- `frontend/src/domains/ol/components/MapContainer.ts`：删参数传递。
- `frontend/src/domains/ol/layer/composables/useDeferredUserLayerApis.ts`、`useUserLayerActions.ts`：删参数链。
- `frontend/src/app/composables/useHomeEngineSwitch.ts`、`frontend/src/domains/cesium/composables/layers/useCesiumUrlTracking.ts`、`layerUtils.ts`：删注入/改颜色映射。
- `Docs/TODO/2026-11-28-remove-legacy-basemap-category-group-plan.md`、`Docs/Architecture/basemap-catalog-redesign.md`、`Docs/Guide/CHANGELOG.md`：方案与文档。

## 遗留与风险

- 本次与用户及其他并行会话同步编辑同一批文件，最终以 `vue-tsc --noEmit` 0 错误与全仓零残留扫描为准。
- `getPresetPickerColor` 的颜色映射由旧 6 类改为新 7 类（historical/electronic/service 等），视觉语义需实机确认。
