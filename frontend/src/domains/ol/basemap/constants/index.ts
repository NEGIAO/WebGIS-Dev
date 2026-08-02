/**
 * 底图配置模块 barrel export
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  数据流（依赖方向，单向，无环）                                        │
 * │                                                                     │
 * │  basemapPresets.ts  ──→  basemapConfig.ts  ──→  basemapResolver.ts  │
 * │  (纯数据,零依赖)        (OL 工厂 + 类型)        (解析 + 消费入口)     │
 * │       │                     │                       │                │
 * │       │ re-export           │ import                │ import         │
 * │       └─────────────────────┤                       │                │
 * │                             └───────────────────────┘                │
 * │                                                                     │
 * │  本文件（index.ts）：聚合 barrel，对外统一入口                         │
 * │  ─────────────────────────────────────────────────────────────────  │
 * │  • 消费方只写 `import { ... } from '@ol/basemap/constants'`          │
 * │  • 不直接引用 ./basemapConfig 或 ./basemapResolver 等子路径           │
 * │  • 子路径之间的 re-export 在此汇总，避免消费方关心内部文件拆分          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * 三个子文件职责：
 *   1. basemapConfig.ts   — 类型定义 + LAYER_SOURCE_DEFINITIONS（OL 工厂 + URL）
 *                           + 自动派生的 Cesium 描述符（getDescriptorById）
 *                           + re-export 预设数据（向后兼容）
 *   2. basemapPresets.ts  — 底图预设目录（stack 叠加顺序），纯数据零依赖
 *                           + DEFAULT_BASEMAP_PRESET_ID / URL_LAYER_OPTIONS
 *                           ⚠ 禁止 import ol/cesium/任何工厂模块
 *   3. basemapResolver.ts — 解析入口：createLayerConfigs / resolvePresetLayerIds
 *                           组合「图层源定义」+「预设目录」→ 运行时可消费的图层树
 *
 * 一致性约束：新增/修改图层 id 时，三个文件必须同步（id 是它们之间的索引契约）。
 */

// 从配置文件导出（类型 + 图层源定义 + 工具函数 + Cesium 描述符）
export type {
    LayerCategory,
    LayerGroup,
    TileSourceInstance,
    LayerFactoryContext,
    LayerSourceDefinition,
    BasemapPresetDefinition,
    UserEditableTileLayerConfig,
} from './basemapConfig';

export {
    TILE_HOSTS,
    DEFAULT_BASEMAP_PRESET_ID,
    buildTiandituUrl,
    LAYER_SOURCE_DEFINITIONS,
    BASEMAP_PRESETS,
} from './basemapConfig';

// 从解析器导出（预设解析 + 图层配置工厂 + composable）
export {
    DEFAULT_BASEMAP_LAYER_INDEX,
    URL_LAYER_OPTIONS,
    BASEMAP_OPTIONS,
    resolvePresetLayerIds,
    getBasemapOptionLabel,
    getLayerCategory,
    getLayerGroup,
    createLayerConfigs,
    useBasemapManager,
} from './basemapResolver';

// 从 basemapConfig 导出（引擎无关的图层源元数据，sourceDescriptors.ts 已合并至此）
export type { TileSourceDescriptor } from './basemapConfig';
export {
    getDescriptorById,
    getAllDescriptorIds,
} from './basemapConfig';

// 从 cesiumProviderFactory 导出（描述符 → Cesium ImageryProvider 工厂）
// 已迁移至 domains/cesium/constants/basemapProviderFactory.ts，由 useCesiumLayers 直接引用

// 从 useTileSourceFactory 转发（保持向后兼容）
export {
    createAutoTileSourceFromUrl,
    detectCustomTileServiceKind,
    detectNonStandardXYZ,
    normalizeTileY,
    toQuadKey,
} from '@ol/tile-source';

export type {
    TileYNormalizeMode,
    CustomTileSourceKind,
    AutoTileSourceResult,
} from '@ol/tile-source';
