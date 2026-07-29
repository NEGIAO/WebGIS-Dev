/**
 * 底图配置模块 barrel export
 */

// 从配置文件导出
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
    GOOGLE_MANUAL_HOST,
    DEFAULT_BASEMAP_PRESET_ID,
    activeGoogleTileHost,
    buildGoogleTileUrl,
    buildTiandituUrl,
    LAYER_SOURCE_DEFINITIONS,
    BASEMAP_PRESETS,
} from './basemapConfig';

// 从解析器导出
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

// 从 sourceDescriptors 导出（引擎无关的图层源元数据）
export type { TileSourceDescriptor } from './sourceDescriptors';
export {
    TILE_SOURCE_DESCRIPTORS,
    getDescriptorById,
    getAllDescriptorIds,
} from './sourceDescriptors';

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
