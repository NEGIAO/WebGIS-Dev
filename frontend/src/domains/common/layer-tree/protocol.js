export const TOC_EXPORT_FORMATS = Object.freeze(['csv', 'txt', 'geojson', 'kml']);

/**
 * TOC 图层跨容器拖拽的 DataTransfer 类型（与排序用的 text/plain 并存，互不干扰）。
 * 放置目标（如 Cesium 画布）凭此识别图层拖拽，文件拖拽走 files 通道。
 */
export const TOC_LAYER_DRAG_MIME = 'application/x-webgis-layer';

const TOC_EXPORT_FORMAT_SET = new Set(TOC_EXPORT_FORMATS);

export const TOC_MENU_COMMANDS = Object.freeze({
    MULTI_SELECT_ADD: 'multi-select-add',
    MULTI_SELECT_REMOVE: 'multi-select-remove',
    MULTI_SELECT_CLEAR: 'multi-select-clear',
    FOLDER_MULTI_SELECT_ADD: 'folder-multi-select-add',
    FOLDER_MULTI_SELECT_REMOVE: 'folder-multi-select-remove',
    FOLDER_CLEAR_LAYERS: 'folder-clear-layers',
    BATCH_SHOW: 'batch-show',
    BATCH_HIDE: 'batch-hide',
    BATCH_REMOVE: 'batch-remove',
    BATCH_EXPORT_CSV: 'batch-export-csv',
    BATCH_EXPORT_TXT: 'batch-export-txt',
    BATCH_EXPORT_GEOJSON: 'batch-export-geojson',
    BATCH_EXPORT_KML: 'batch-export-kml',
    VIEW: 'view',
    SOLO: 'solo',
    EDIT: 'edit',
    ATTRIBUTE: 'attribute',
    STYLE: 'style',
    OPEN_AOI_PANEL: 'open-aoi-panel',
    LABEL: 'label',
    COPY: 'copy',
    CONVERT_WGS84_TO_GCJ02: 'convert-wgs84-to-gcj02',
    CONVERT_GCJ02_TO_WGS84: 'convert-gcj02-to-wgs84',
    EXPORT_CSV: 'export-csv',
    EXPORT_TXT: 'export-txt',
    EXPORT_GEOJSON: 'export-geojson',
    EXPORT_KML: 'export-kml',
    ZOOM: 'zoom',
    IMPORT_TO_3D: 'import-to-3d',
    REMOVE: 'remove',
    RENAME: 'rename',
    OPACITY: 'opacity',
    PROPERTIES: 'properties',
    // 三维数据专属（cesium:* 节点，由 cesiumTocActions 消费）
    SET_HEIGHT: 'set-height',
    MATERIAL: 'set-material',
    REPOSITION: 'reposition',
    STRETCH_HEIGHT: 'stretch-height',
    FIT_TERRAIN: 'fit-terrain',
    FIT_TERRAIN_IN_VIEW: 'fit-terrain-view',
    RESET_TERRAIN: 'reset-terrain',
});

export function normalizeTocLayerId(id) {
    return String(id || '').trim();
}

export function normalizeTocLayerIdList(ids = []) {
    if (!Array.isArray(ids)) return [];

    const seen = new Set();
    const normalized = [];
    ids.forEach((id) => {
        const key = normalizeTocLayerId(id);
        if (!key || seen.has(key)) return;
        seen.add(key);
        normalized.push(key);
    });

    return normalized;
}

export function normalizeTocExportFormat(rawFormat = '', fallback = 'csv') {
    const normalized = String(rawFormat || '')
        .trim()
        .toLowerCase();
    if (TOC_EXPORT_FORMAT_SET.has(normalized)) return normalized;

    const normalizedFallback = String(fallback || 'csv')
        .trim()
        .toLowerCase();
    return TOC_EXPORT_FORMAT_SET.has(normalizedFallback) ? normalizedFallback : 'csv';
}

export function resolveTocExportFormatFromCommand(commandKey = '', fallback = 'csv') {
    const key = String(commandKey || '')
        .trim()
        .toLowerCase();

    for (const format of TOC_EXPORT_FORMATS) {
        if (key.endsWith(format)) return format;
    }

    return normalizeTocExportFormat(fallback, 'csv');
}
