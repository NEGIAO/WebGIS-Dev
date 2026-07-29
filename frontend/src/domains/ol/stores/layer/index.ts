/**
 * 图层模块 barrel export
 */

// 类型定义
export type {
    LayerHandlers,
    StandardLayerCapabilities,
    StandardTOCItem,
    LayerStoreLayer,
} from './layerHelpers';

// 工具函数
export {
    isRasterLayer,
    formatLayerDisplayName,
    hasAttributeFeatures,
    canToggleLabel,
    layerHasCoordinates,
    supportsCoordinateOperations,
    getLayerPoiId,
    normalizeStandardLayerType,
    getLayerStandardItem,
    normalizeLayerRecord,
    normalizeExportFormats,
    resolveLayerCapabilities,
} from './layerHelpers';

// 树构建器
export {
    countLeafVisibility,
    folderNode,
    normalizeUploadFolderPath,
    splitUploadFolderPath,
    buildUploadFolderPathChain,
    toUploadFolderNodeId,
    deriveUploadFolderDisplayName,
    buildUploadLayerChildren,
    toDistrictLayerNode,
    toLayerNode,
    buildLayerTree,
} from './layerTreeBuilder';
