const DEFAULT_SOURCE_TYPE = 'upload';

function normalizeLayerType(rawType = '') {
    const normalized = String(rawType || '').trim().toLowerCase();
    if (!normalized) return 'geojson';

    if (normalized === 'kmz') return 'kml';
    if (normalized === 'tiff') return 'tif';
    if (normalized === 'shape') return 'shp';
    if (normalized === 'raster') return 'tif';

    return normalized;
}

function normalizeFormat(rawFormat = '', normalizedLayerType = '') {
    const normalized = String(rawFormat || '').trim().toLowerCase();
    if (normalized) {
        if (normalized === 'tiff') return 'tif';
        if (normalized === 'kmz') return 'kml';
        return normalized;
    }

    if (normalizedLayerType === 'tif' || normalizedLayerType === 'tiff') return 'tif';
    if (normalizedLayerType === 'kml' || normalizedLayerType === 'kmz') return 'kml';
    if (normalizedLayerType === 'shp') return 'shp';
    return normalizedLayerType || 'geojson';
}

function deriveFeatureCount(input = {}) {
    if (Number.isFinite(input.featureCount)) return Number(input.featureCount);

    const features = Array.isArray(input.features) ? input.features : [];
    if (features.length) return features.length;

    const parsedData = input.parsedData;
    if (parsedData && typeof parsedData === 'object') {
        if (Array.isArray(parsedData.features)) return parsedData.features.length;
        if (Array.isArray(parsedData.geojsonData?.features)) return parsedData.geojsonData.features.length;
    }

    if (normalizeLayerType(input.layerType || input.type || input.kind) === 'tif') {
        return 1;
    }

    return 0;
}

function getDefaultCapabilities(layerType = 'geojson') {
    const normalizedLayerType = normalizeLayerType(layerType);
    const isRaster = normalizedLayerType === 'tif';

    return {
        attribute: !isRaster,
        style: !isRaster,
        label: !isRaster,
        copyCoordinates: !isRaster,
        toggleLayerCRS: !isRaster,
        exportLayerData: !isRaster,
        openAoiPanel: false,
        zoom: true,
        remove: true,
        reorder: true,
        toggleVisibility: true,
        setOpacity: true
    };
}

function sanitizeParsedData(parsedData) {
    if (!parsedData || typeof parsedData !== 'object') return {};

    const summary = {};

    if (parsedData.kind) summary.kind = String(parsedData.kind);
    if (parsedData.entryName) summary.entryName = String(parsedData.entryName);
    if (parsedData.dispatchEntryName) summary.dispatchEntryName = String(parsedData.dispatchEntryName);
    if (parsedData.dataProjection) summary.dataProjection = String(parsedData.dataProjection);
    if (typeof parsedData.needsReprojection === 'boolean') {
        summary.needsReprojection = parsedData.needsReprojection;
    }

    return summary;
}

export function createStandardItem(input = {}) {
    const normalizedLayerType = normalizeLayerType(input.layerType || input.type || input.kind || input.format);
    const format = normalizeFormat(input.format, normalizedLayerType);
    const featureCount = deriveFeatureCount(input);

    const customCapabilities = input.capabilities && typeof input.capabilities === 'object'
        ? input.capabilities
        : {};

    const metadata = input.metadata && typeof input.metadata === 'object'
        ? input.metadata
        : {};

    return {
        id: input.id != null ? String(input.id) : '',
        name: String(input.name || input.layerName || '未命名图层'),
        nodeType: input.nodeType === 'group' ? 'group' : 'layer',
        layerType: normalizedLayerType,
        sourceType: String(input.sourceType || DEFAULT_SOURCE_TYPE),
        format,
        parentId: input.parentId != null ? String(input.parentId) : null,
        visible: input.visible !== false,
        opacity: Number.isFinite(input.opacity) ? Math.max(0, Math.min(1, Number(input.opacity))) : 1,
        selected: !!input.selected,
        expanded: input.expanded !== false,
        featureCount,
        capabilities: {
            ...getDefaultCapabilities(normalizedLayerType),
            ...customCapabilities
        },
        children: Array.isArray(input.children) ? input.children : [],
        metadata: {
            ...sanitizeParsedData(input.parsedData),
            ...metadata
        }
    };
}

export function getStandardCapabilitiesByLayerType(layerType = '') {
    return getDefaultCapabilities(layerType);
}
