/**
 * 底图配置模块 barrel export
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  数据流（依赖方向，单向，无环）                                        │
 * │                                                                     │
 * │  common/basemap/definitions/  ──→  basemapResolver.ts               │
 * │  (纯数据 + 类型 + URL 解析，零引擎依赖)  (解析 + 消费入口)             │
 * │       │                             │                               │
 * │       └───────────── re-export ─────┘                               │
 * │                                                                     │
 * │  本文件（index.ts）：聚合 barrel，对外统一入口                         │
 * │  ─────────────────────────────────────────────────────────────────  │
 * │  • 消费方只写 `import { ... } from '@ol/basemap/constants'`          │
 * │  • 不直接引用 ./basemapResolver 等子路径                             │
 * │  • 子路径之间的 re-export 在此汇总，避免消费方关心内部文件拆分          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * V3.7.16：图层定义已迁入 common/basemap/definitions（SSOT），
 * basemapConfig.ts（SSOT + Cesium 描述符派生）与 basemapCore.ts
 *（类型/适配器/URL 构建器）已删除；旧 LayerSourceDefinition /
 * TileSourceDescriptor / createSource 类型一并删除。
 * 预设数据仍由 @common/basemap/basemapPresets 提供（见 basemapConfig 旧注）。
 */

// 从 common 定义层导出（类型 + 图层定义聚合 + 描述符 + 密钥池判定）
export type {
    CoordCorrection,
    LayerCategory,
    LayerGroup,
    ProxyMode,
    TileLayerContext,
    TileLayerDefinition,
    TileLoadMethod,
} from '@common/basemap/definitions/types';

export {
    TILE_LAYER_DEFINITIONS,
    getDescriptorById,
    getTileLayerDefinitionById,
    getAllTileLayerIds,
    resolveRuntimeTokenPoolKey,
    resolveTileUrl,
} from '@common/basemap/definitions';

export type { BasemapPresetDefinition } from '@common/basemap/basemapPresets';
export {
    BASEMAP_PRESETS,
    DEFAULT_BASEMAP_PRESET_ID,
} from '@common/basemap/basemapPresets';

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
