/**
 * 兼容出口：阶段 1 保持旧 import 路径与导出身份不变。
 *
 * 新代码应优先从 `@common/basemap/catalog` 取元数据；旧模块继续从原路径导入，
 * 待阶段 2/3 完成后再逐步收口。
 */

export {
    ALL_BASEMAP_PRESETS,
    BASEMAP_PRESETS,
    DEFAULT_BASEMAP_PRESET_ID,
    URL_LAYER_OPTIONS,
} from '../basemapPresets';

export {
    BASEMAP_OPTIONS,
    DEFAULT_BASEMAP_LAYER_INDEX,
    DEFAULT_BASEMAP_URL_LAYER_NUMBER,
    getBasemapIdByUrlLayerNumber,
    getUrlLayerNumberByBasemapId,
} from '../basemapOptions';

export {
    getBasemapEntries,
    getBasemapEntryById,
    getBasemapEntryByNumber,
    getBasemapTree,
    searchBasemapCatalog,
    getBasemapBreadcrumb,
} from './registry';
