/**
 * 图层工具函数
 * 纯函数，不依赖 Vue 响应式状态
 */

export type LayerHandlers = {
    onToggleVisibility?: (payload: { layerId: string; visible: boolean }) => void;
    onZoom?: (layerId: string) => void;
    onView?: (layerId: string) => void;
    onRemove?: (layerId: string) => void;
    onReorder?: (payload: { fromId: string; toId: string }) => void;
    onSolo?: (layerId: string) => void;
    onToggleLabel?: (payload: { layerId: string; visible: boolean }) => void;
    onHighlightFeature?: (payload: { layerId: string; featureId: string; feature?: any }) => void;
    onZoomFeature?: (payload: { layerId: string; featureId: string; feature?: any }) => void;
    onViewFeature?: (payload: { layerId: string; featureId: string; feature?: any }) => void;
};

export type StandardLayerCapabilities = {
    attribute?: boolean;
    style?: boolean;
    label?: boolean;
    copyCoordinates?: boolean;
    toggleLayerCRS?: boolean;
    exportLayerData?: boolean;
    canExportCSV?: boolean;
    canExportTXT?: boolean;
    canExportGeoJSON?: boolean;
    canExportKML?: boolean;
    exportFormats?: string[];
    openAoiPanel?: boolean;
    zoom?: boolean;
    remove?: boolean;
};

export type StandardTOCItem = {
    id?: string;
    name?: string;
    nodeType?: 'group' | 'layer';
    layerType?: string;
    sourceType?: string;
    format?: string;
    parentId?: string | null;
    visible?: boolean;
    opacity?: number;
    selected?: boolean;
    expanded?: boolean;
    featureCount?: number;
    capabilities?: StandardLayerCapabilities;
    children?: StandardTOCItem[];
    metadata?: Record<string, any>;
};

export type LayerStoreLayer = {
    id: string;
    name?: string;
    type?: string;
    sourceType?: string;
    order?: number;
    visible?: boolean;
    featureCount?: number;
    features?: any[];
    opacity?: number;
    autoLabel?: boolean;
    labelVisible?: boolean;
    category?: string;
    crs?: string;
    longitude?: number;
    latitude?: number;
    styleConfig?: any;
    standardTocItem?: StandardTOCItem | null;
    capabilities?: StandardLayerCapabilities;
};

/**
 * 判断是否为栅格图层
 */
export function isRasterLayer(layer: any): boolean {
    const t = String(layer?.type || '').toLowerCase();
    return t === 'tif' || t === 'tiff';
}

/**
 * 格式化图层显示名称
 */
export function formatLayerDisplayName(name: string): string {
    const raw = String(name || '').trim();
    if (!raw) return '未命名图层';
    try {
        return decodeURIComponent(raw.replace(/\+/g, '%20'));
    } catch {
        return raw;
    }
}

/**
 * 判断图层是否有属性要素
 * [性能优化] 优先检查 featureCount（O(1)），避免频繁访问 features 数组
 */
export function hasAttributeFeatures(layer: any): boolean {
    if (typeof layer?.featureCount === 'number' && layer.featureCount > 0) return true;
    return Array.isArray(layer?.features) && layer.features.length > 0;
}

/**
 * 判断是否可以切换标签
 */
export function canToggleLabel(layer: any): boolean {
    return (
        !!layer?.autoLabel || String(layer?.sourceType || '').toLowerCase() === 'district-boundary'
    );
}

/**
 * 判断图层是否有坐标信息
 */
export function layerHasCoordinates(layer: any): boolean {
    return Number.isFinite(layer?.longitude) && Number.isFinite(layer?.latitude);
}

/**
 * 判断是否支持坐标操作
 */
export function supportsCoordinateOperations(layer: any): boolean {
    if (!layer) return false;
    if (isRasterLayer(layer)) return false;
    return true;
}

/**
 * 获取图层 POI ID
 * [性能优化] 优先从 metadata 读取，避免遍历 features 数组
 */
export function getLayerPoiId(layer: any): string {
    // 快速路径：从 metadata 中读取（图层导入时已提取）
    const metaPoi = layer?.metadata?.poiId || layer?.metadata?.POI_ID;
    if (metaPoi) return String(metaPoi).trim();

    const features = Array.isArray(layer?.features) ? layer.features : [];
    if (!features.length) return '';
    const firstFeature = features[0] || {};
    const properties =
        firstFeature?.properties && typeof firstFeature.properties === 'object'
            ? firstFeature.properties
            : {};

    return String(properties?.POI_ID || properties?.poiid || properties?.id || '').trim();
}

/**
 * 标准化图层类型
 */
export function normalizeStandardLayerType(rawType: unknown): string {
    const normalized = String(rawType || '')
        .trim()
        .toLowerCase();
    if (!normalized) return 'geojson';
    if (normalized === 'kmz') return 'kml';
    if (normalized === 'tiff') return 'tif';
    return normalized;
}

/**
 * 获取图层标准 TOC 项
 */
export function getLayerStandardItem(layer: LayerStoreLayer): StandardTOCItem | null {
    const candidate = layer?.standardTocItem;
    if (!candidate || typeof candidate !== 'object') return null;

    return {
        ...candidate,
        id: String(candidate.id || layer.id || ''),
        name: String(candidate.name || layer.name || ''),
        nodeType: candidate.nodeType === 'group' ? 'group' : 'layer',
        layerType: normalizeStandardLayerType(
            candidate.layerType || candidate.format || layer.type,
        ),
        sourceType: String(candidate.sourceType || layer.sourceType || 'upload'),
        format: String(
            candidate.format || candidate.layerType || layer.type || 'geojson',
        ).toLowerCase(),
        parentId: candidate.parentId != null ? String(candidate.parentId) : null,
        visible: candidate.visible !== false && layer.visible !== false,
        opacity: Number.isFinite(candidate.opacity)
            ? Number(candidate.opacity)
            : Number.isFinite(layer.opacity)
              ? Number(layer.opacity)
              : 1,
        selected: !!candidate.selected,
        expanded: candidate.expanded !== false,
        featureCount: Number.isFinite(candidate.featureCount)
            ? Number(candidate.featureCount)
            : Number(layer.featureCount) || 0,
        capabilities:
            candidate.capabilities && typeof candidate.capabilities === 'object'
                ? { ...candidate.capabilities }
                : {},
        children: Array.isArray(candidate.children) ? candidate.children : [],
        metadata:
            candidate.metadata && typeof candidate.metadata === 'object'
                ? { ...candidate.metadata }
                : {},
    };
}

/**
 * 标准化图层记录
 */
export function normalizeLayerRecord(layer: any): LayerStoreLayer {
    const normalizedLayer: LayerStoreLayer = {
        ...(layer || {}),
        id: String(layer?.id || ''),
        name: String(layer?.name || ''),
        type: String(layer?.type || ''),
        sourceType: String(layer?.sourceType || 'upload'),
        standardTocItem: layer?.standardTocItem || null,
    };

    normalizedLayer.standardTocItem = getLayerStandardItem(normalizedLayer);
    return normalizedLayer;
}

/**
 * 标准化导出格式
 */
export function normalizeExportFormats(rawFormats: unknown): string[] {
    if (!Array.isArray(rawFormats)) return [];

    const seen = new Set<string>();
    const normalized: string[] = [];
    rawFormats.forEach((item) => {
        const key = String(item || '')
            .trim()
            .toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        normalized.push(key);
    });

    return normalized;
}

/**
 * 解析图层能力
 */
export function resolveLayerCapabilities(
    layer: LayerStoreLayer,
    group: string,
    standardItem: StandardTOCItem | null,
): StandardLayerCapabilities {
    const coordinateOpsSupported = supportsCoordinateOperations(layer);

    const defaults: StandardLayerCapabilities = {
        attribute: hasAttributeFeatures(layer),
        style: group !== 'route' && !isRasterLayer(layer),
        label: (group === 'search' || group === 'upload') && canToggleLabel(layer),
        copyCoordinates: coordinateOpsSupported && layerHasCoordinates(layer),
        toggleLayerCRS: coordinateOpsSupported,
        exportLayerData: coordinateOpsSupported,
        canExportCSV: coordinateOpsSupported,
        canExportTXT: coordinateOpsSupported,
        canExportGeoJSON: coordinateOpsSupported,
        canExportKML: coordinateOpsSupported,
        openAoiPanel: false,
        zoom: true,
        remove: true,
    };

    const merged = {
        ...defaults,
        ...(standardItem?.capabilities || {}),
        ...(layer?.capabilities || {}),
    };

    const explicitFormats = normalizeExportFormats(merged.exportFormats);
    const hasExplicitFormats = explicitFormats.length > 0;
    const exportEnabled = merged.exportLayerData !== false && coordinateOpsSupported;

    merged.canExportCSV =
        exportEnabled &&
        merged.canExportCSV !== false &&
        (!hasExplicitFormats || explicitFormats.includes('csv'));
    merged.canExportTXT =
        exportEnabled &&
        merged.canExportTXT !== false &&
        (!hasExplicitFormats || explicitFormats.includes('txt'));
    merged.canExportGeoJSON =
        exportEnabled &&
        merged.canExportGeoJSON !== false &&
        (!hasExplicitFormats || explicitFormats.includes('geojson'));
    merged.canExportKML =
        exportEnabled &&
        merged.canExportKML !== false &&
        (!hasExplicitFormats || explicitFormats.includes('kml'));

    merged.exportLayerData =
        exportEnabled &&
        !!(
            merged.canExportCSV ||
            merged.canExportTXT ||
            merged.canExportGeoJSON ||
            merged.canExportKML
        );

    if (group === 'route') {
        merged.style = false;
        merged.label = false;
    }

    return merged;
}
