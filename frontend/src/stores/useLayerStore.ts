import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

type LayerHandlers = {
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

type StandardLayerCapabilities = {
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

type StandardTOCItem = {
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

type LayerStoreLayer = {
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

function isRasterLayer(layer: any): boolean {
    const t = String(layer?.type || '').toLowerCase();
    return t === 'tif' || t === 'tiff';
}

function formatLayerDisplayName(name: string): string {
    const raw = String(name || '').trim();
    if (!raw) return '未命名图层';
    try {
        return decodeURIComponent(raw.replace(/\+/g, '%20'));
    } catch {
        return raw;
    }
}

function hasAttributeFeatures(layer: any): boolean {
    return Array.isArray(layer?.features) && layer.features.length > 0;
}

function canToggleLabel(layer: any): boolean {
    return !!layer?.autoLabel;
}

function layerHasCoordinates(layer: any): boolean {
    return Number.isFinite(layer?.longitude) && Number.isFinite(layer?.latitude);
}

function supportsCoordinateOperations(layer: any): boolean {
    if (!layer) return false;
    if (isRasterLayer(layer)) return false;
    return true;
}

function getLayerPoiId(layer: any): string {
    const features = Array.isArray(layer?.features) ? layer.features : [];
    const firstFeature = features[0] || {};
    const properties = firstFeature?.properties && typeof firstFeature.properties === 'object'
        ? firstFeature.properties
        : {};

    return String(
        properties?.POI_ID
        || properties?.poiid
        || properties?.id
        || ''
    ).trim();
}

function normalizeStandardLayerType(rawType: unknown): string {
    const normalized = String(rawType || '').trim().toLowerCase();
    if (!normalized) return 'geojson';
    if (normalized === 'kmz') return 'kml';
    if (normalized === 'tiff') return 'tif';
    return normalized;
}

function getLayerStandardItem(layer: LayerStoreLayer): StandardTOCItem | null {
    const candidate = layer?.standardTocItem;
    if (!candidate || typeof candidate !== 'object') return null;

    return {
        ...candidate,
        id: String(candidate.id || layer.id || ''),
        name: String(candidate.name || layer.name || ''),
        nodeType: candidate.nodeType === 'group' ? 'group' : 'layer',
        layerType: normalizeStandardLayerType(candidate.layerType || candidate.format || layer.type),
        sourceType: String(candidate.sourceType || layer.sourceType || 'upload'),
        format: String(candidate.format || candidate.layerType || layer.type || 'geojson').toLowerCase(),
        parentId: candidate.parentId != null ? String(candidate.parentId) : null,
        visible: candidate.visible !== false && layer.visible !== false,
        opacity: Number.isFinite(candidate.opacity)
            ? Number(candidate.opacity)
            : (Number.isFinite(layer.opacity) ? Number(layer.opacity) : 1),
        selected: !!candidate.selected,
        expanded: candidate.expanded !== false,
        featureCount: Number.isFinite(candidate.featureCount)
            ? Number(candidate.featureCount)
            : (Number(layer.featureCount) || 0),
        capabilities: candidate.capabilities && typeof candidate.capabilities === 'object'
            ? { ...candidate.capabilities }
            : {},
        children: Array.isArray(candidate.children) ? candidate.children : [],
        metadata: candidate.metadata && typeof candidate.metadata === 'object'
            ? { ...candidate.metadata }
            : {}
    };
}

function normalizeLayerRecord(layer: any): LayerStoreLayer {
    const normalizedLayer: LayerStoreLayer = {
        ...(layer || {}),
        id: String(layer?.id || ''),
        name: String(layer?.name || ''),
        type: String(layer?.type || ''),
        sourceType: String(layer?.sourceType || 'upload'),
        standardTocItem: layer?.standardTocItem || null
    };

    normalizedLayer.standardTocItem = getLayerStandardItem(normalizedLayer);
    return normalizedLayer;
}

function normalizeExportFormats(rawFormats: unknown): string[] {
    if (!Array.isArray(rawFormats)) return [];

    const seen = new Set<string>();
    const normalized: string[] = [];
    rawFormats.forEach((item) => {
        const key = String(item || '').trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        normalized.push(key);
    });

    return normalized;
}

function resolveLayerCapabilities(layer: LayerStoreLayer, group: string, standardItem: StandardTOCItem | null): StandardLayerCapabilities {
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
        remove: true
    };

    const merged = {
        ...defaults,
        ...(standardItem?.capabilities || {}),
        ...(layer?.capabilities || {})
    };

    const explicitFormats = normalizeExportFormats(merged.exportFormats);
    const hasExplicitFormats = explicitFormats.length > 0;
    const exportEnabled = merged.exportLayerData !== false && coordinateOpsSupported;

    merged.canExportCSV = exportEnabled
        && merged.canExportCSV !== false
        && (!hasExplicitFormats || explicitFormats.includes('csv'));
    merged.canExportTXT = exportEnabled
        && merged.canExportTXT !== false
        && (!hasExplicitFormats || explicitFormats.includes('txt'));
    merged.canExportGeoJSON = exportEnabled
        && merged.canExportGeoJSON !== false
        && (!hasExplicitFormats || explicitFormats.includes('geojson'));
    merged.canExportKML = exportEnabled
        && merged.canExportKML !== false
        && (!hasExplicitFormats || explicitFormats.includes('kml'));

    merged.exportLayerData = exportEnabled
        && !!(merged.canExportCSV || merged.canExportTXT || merged.canExportGeoJSON || merged.canExportKML);

    if (group === 'route') {
        merged.style = false;
        merged.label = false;
    }

    return merged;
}

function countLeafVisibility(nodes: any[] = []): { total: number; visible: number } {
    let total = 0;
    let visible = 0;
    for (const node of nodes) {
        if (node.type === 'folder') {
            const sub = countLeafVisibility(node.children || []);
            total += sub.total;
            visible += sub.visible;
            continue;
        }
        if (node.showCheckbox === false) continue;
        total += 1;
        if (node.visible) visible += 1;
    }
    return { total, visible };
}

function folderNode({
    id,
    name,
    level,
    children,
    expandedState
}: {
    id: string;
    name: string;
    level: number;
    children: any[];
    expandedState: Record<string, boolean>;
}): any {
    const summary = countLeafVisibility(children);
    const total = summary.total;
    const visible = summary.visible;
    return {
        id,
        name,
        displayName: name,
        type: 'folder',
        visible: total > 0 && visible === total,
        indeterminate: visible > 0 && visible < total,
        children,
        expanded: expandedState[id] !== false,
        level,
        showCheckbox: total > 0
    };
}

const UPLOAD_DYNAMIC_FOLDER_PREFIX = 'folder-upload-dyn:';

function normalizeUploadFolderPath(rawParentId: unknown): string {
    let value = String(rawParentId || '').trim();
    if (!value) return '';

    if (value.startsWith(UPLOAD_DYNAMIC_FOLDER_PREFIX)) {
        value = value.slice(UPLOAD_DYNAMIC_FOLDER_PREFIX.length);
    }

    value = value
        .replace(/\\/g, '/')
        .replace(/\s*>\s*/g, '/')
        .replace(/\/+/g, '/');

    return value
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/');
}

function splitUploadFolderPath(rawPath: string): string[] {
    return normalizeUploadFolderPath(rawPath)
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
}

function buildUploadFolderPathChain(rawPath: string): string[] {
    const segments = splitUploadFolderPath(rawPath);
    const chain: string[] = [];

    segments.forEach((segment, index) => {
        if (index === 0) {
            chain.push(segment);
            return;
        }
        chain.push(`${chain[index - 1]}/${segment}`);
    });

    return chain;
}

function toUploadFolderNodeId(rawPath: string): string {
    return `${UPLOAD_DYNAMIC_FOLDER_PREFIX}${rawPath}`;
}

function deriveUploadFolderDisplayName(segment: string): string {
    const raw = String(segment || '').trim();
    if (!raw) return '未命名分组';

    const compacted = raw.replace(/^folder[-_:]/i, '').trim();
    const display = formatLayerDisplayName(compacted || raw)
        .replace(/[_]+/g, ' ')
        .trim();

    return display || '未命名分组';
}

type UploadFolderChildRef =
    | { kind: 'folder'; id: string }
    | { kind: 'layer'; node: any };

type UploadFolderEntry = {
    id: string;
    name: string;
    parentId: string | null;
    orderedChildren: UploadFolderChildRef[];
};

function buildUploadLayerChildren(uploadLayers: LayerStoreLayer[], expandedState: Record<string, boolean>): any[] {
    if (!uploadLayers.length) return [];

    const folderMap = new Map<string, UploadFolderEntry>();
    const rootChildren: UploadFolderChildRef[] = [];
    const rootFolderSeen = new Set<string>();

    function pushRootFolderOnce(folderId: string): void {
        if (!folderId || rootFolderSeen.has(folderId)) return;
        rootFolderSeen.add(folderId);
        rootChildren.push({ kind: 'folder', id: folderId });
    }

    function appendFolderChildOnce(parentEntry: UploadFolderEntry, folderId: string): void {
        if (!folderId) return;

        const exists = parentEntry.orderedChildren.some((child) => {
            return child.kind === 'folder' && child.id === folderId;
        });
        if (exists) return;

        parentEntry.orderedChildren.push({ kind: 'folder', id: folderId });
    }

    function ensureUploadFolderBySegments(segments: string[]): UploadFolderEntry | null {
        if (!segments.length) return null;

        let parentEntry: UploadFolderEntry | null = null;
        let currentPath = '';
        let deepestEntry: UploadFolderEntry | null = null;

        segments.forEach((segment) => {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            const folderId = toUploadFolderNodeId(currentPath);

            let entry = folderMap.get(folderId);
            if (!entry) {
                entry = {
                    id: folderId,
                    name: deriveUploadFolderDisplayName(segment),
                    parentId: parentEntry?.id || null,
                    orderedChildren: []
                };
                folderMap.set(folderId, entry);
            }

            if (parentEntry) {
                appendFolderChildOnce(parentEntry, entry.id);
            }

            parentEntry = entry;
            deepestEntry = entry;
        });

        return deepestEntry;
    }

    uploadLayers.forEach((layer) => {
        const baseLayerNode = toLayerNode(layer, 1, 'upload');
        const rawParentPath = normalizeUploadFolderPath(layer.standardTocItem?.parentId);
        if (!rawParentPath) {
            rootChildren.push({ kind: 'layer', node: { ...baseLayerNode, level: 1, parentId: null } });
            return;
        }

        const segments = splitUploadFolderPath(rawParentPath);
        const rootPath = segments[0] || '';
        const deepestEntry = ensureUploadFolderBySegments(segments);
        if (!deepestEntry) {
            rootChildren.push({ kind: 'layer', node: { ...baseLayerNode, level: 1, parentId: null } });
            return;
        }

        deepestEntry.orderedChildren.push({ kind: 'layer', node: baseLayerNode });

        if (rootPath) {
            pushRootFolderOnce(toUploadFolderNodeId(rootPath));
        }
    });

    function buildUploadFolderNode(folderId: string, level: number): any | null {
        const entry = folderMap.get(folderId);
        if (!entry) return null;

        const children = entry.orderedChildren
            .map((child): any | null => {
                if (child.kind === 'folder') {
                    return buildUploadFolderNode(child.id, level + 1);
                }

                return {
                    ...child.node,
                    level: level + 1,
                    parentId: folderId
                };
            })
            .filter(Boolean);

        return folderNode({
            id: entry.id,
            name: entry.name,
            level,
            children,
            expandedState
        });
    }

    return rootChildren
        .map((child): any | null => {
            if (child.kind === 'folder') {
                return buildUploadFolderNode(child.id, 1);
            }
            return child.node;
        })
        .filter(Boolean);
}

function toLayerNode(layer: LayerStoreLayer, level: number, group: string): any {
    const standardItem = getLayerStandardItem(layer);
    const layerType = normalizeStandardLayerType(standardItem?.layerType || layer?.type || '');
    const poiid = getLayerPoiId(layer);
    const isSearchPointLayer = group === 'search' && layerType === 'search';
    const capabilities = resolveLayerCapabilities(layer, group, standardItem);

    const baseNode = {
        id: layer.id,
        name: String(standardItem?.name || layer.name || ''),
        displayName: formatLayerDisplayName(standardItem?.name || layer.name || ''),
        type: 'layer',
        visible: standardItem?.visible !== false && layer.visible !== false,
        children: [],
        expanded: false,
        level,
        featureCount: Number(standardItem?.featureCount) || Number(layer.featureCount) || 0,
        labelVisible: layer.labelVisible !== false,
        showCheckbox: true,
        raw: layer,
        standardTocItem: standardItem,
        layerType,
        sourceType: String(standardItem?.sourceType || layer.sourceType || group),
        format: String(standardItem?.format || layerType || ''),
        opacity: Number.isFinite(layer.opacity)
            ? Number(layer.opacity)
            : (Number.isFinite(standardItem?.opacity) ? Number(standardItem?.opacity) : 1),
        selected: !!standardItem?.selected,
        parentId: standardItem?.parentId || null,
        draggable: group === 'upload',
        droppable: group === 'upload',
        actions: {
            attribute: capabilities.attribute !== false && hasAttributeFeatures(layer),
            style: capabilities.style !== false && group !== 'route' && !isRasterLayer(layer),
            label: capabilities.label !== false && (group === 'search' || group === 'upload') && canToggleLabel(layer),
            copyCoordinates: capabilities.copyCoordinates !== false && supportsCoordinateOperations(layer) && layerHasCoordinates(layer),
            toggleLayerCRS: capabilities.toggleLayerCRS !== false && supportsCoordinateOperations(layer),
            exportLayerData: capabilities.exportLayerData === true,
            canExportCSV: capabilities.canExportCSV === true,
            canExportTXT: capabilities.canExportTXT === true,
            canExportGeoJSON: capabilities.canExportGeoJSON === true,
            canExportKML: capabilities.canExportKML === true,
            openAoiPanel: capabilities.openAoiPanel === true || isSearchPointLayer,
            aoiPanelPayload: {
                layerId: layer.id,
                layerName: String(layer.name || ''),
                poiid
            },
            zoom: capabilities.zoom !== false,
            remove: capabilities.remove !== false,
            removeTip: group === 'search' ? '清空' : '移除',
            viewEvent: 'view-layer',
            viewPayload: { layerId: layer.id },
            zoomEvent: 'zoom-layer',
            zoomPayload: { layerId: layer.id },
            removeEvent: 'remove-layer',
            removePayload: { layerId: layer.id },
            soloEvent: (group === 'draw' || group === 'upload') ? 'solo-layer' : '',
            soloPayload: { layerId: layer.id }
        }
    };

    if (group === 'route') {
        baseNode.actions.style = false;
        baseNode.actions.label = false;
    }
    return baseNode;
}

function buildLayerTree({
    drawLayers,
    routeLayers,
    searchLayers,
    uploadLayers,
    hasDrawCard,
    drawCount,
    expandedState
}: {
    drawLayers: LayerStoreLayer[];
    routeLayers: LayerStoreLayer[];
    searchLayers: LayerStoreLayer[];
    uploadLayers: LayerStoreLayer[];
    hasDrawCard: boolean;
    drawCount: number;
    expandedState: Record<string, boolean>;
}): any[] {
    const tree: any[] = [];

    if (hasDrawCard) {
        const drawChildren = drawLayers.length
            ? drawLayers.map((layer) => toLayerNode(layer, 1, 'draw'))
            : [
                {
                    id: 'draw_virtual',
                    name: '绘制图形集合',
                    displayName: '绘制图形集合',
                    type: 'layer',
                    visible: true,
                    children: [],
                    expanded: false,
                    level: 1,
                    featureCount: Number(drawCount) || 0,
                    showCheckbox: false,
                    draggable: false,
                    droppable: false,
                    actions: {
                        attribute: false,
                        style: true,
                        styleTarget: 'draw',
                        label: false,
                        copyCoordinates: false,
                        toggleLayerCRS: false,
                        exportLayerData: false,
                        canExportCSV: false,
                        canExportTXT: false,
                        canExportGeoJSON: false,
                        canExportKML: false,
                        zoom: true,
                        zoomEvent: 'interaction',
                        zoomPayload: { interaction: 'ZoomToGraphics' },
                        remove: true,
                        removeTip: '清空',
                        removeEvent: 'interaction',
                        removePayload: { interaction: 'Clear' },
                        viewEvent: 'interaction',
                        viewPayload: { interaction: 'ViewGraphics' },
                        soloEvent: 'interaction',
                        soloPayload: { interaction: 'ZoomToGraphics' }
                    }
                }
            ];

        tree.push(folderNode({
            id: 'folder-draw',
            name: '绘制图层',
            level: 0,
            children: drawChildren,
            expandedState
        }));
    }

    if (routeLayers.length) {
        const routeChildren = routeLayers.map((layer) => toLayerNode(layer, 1, 'route'));
        tree.push(folderNode({
            id: 'folder-route',
            name: '路线图层',
            level: 0,
            children: routeChildren,
            expandedState
        }));
    }

    if (searchLayers.length) {
        const searchChildren = searchLayers.map((layer) => toLayerNode(layer, 1, 'search'));
        tree.push(folderNode({
            id: 'folder-search',
            name: '搜索结果图层',
            level: 0,
            children: searchChildren,
            expandedState
        }));
    }

    if (uploadLayers.length) {
        const uploadChildren = buildUploadLayerChildren(uploadLayers, expandedState);
        tree.push(folderNode({
            id: 'folder-upload',
            name: '上传图层',
            level: 0,
            children: uploadChildren,
            expandedState
        }));
    }

    return tree;
}

export const useLayerStore = defineStore('layerStore', () => {
    const userLayers = ref<LayerStoreLayer[]>([]);
    const overview = ref<any>({ drawCount: 0, uploadCount: 0, layers: [] });
    const selectedDrawTool = ref('AttributeQuery');
    const selectedEditLayerId = ref('draw');
    const attributeTableLayerId = ref('');
    const attributeTableVisible = ref(false);
    const selectedAttributeFeatureId = ref('');
    const draggingLayerId = ref('');
    const handlers = ref<LayerHandlers>({});
    const layerTreeExpandedState = ref<Record<string, boolean>>({
        'folder-draw': true,
        'folder-route': true,
        'folder-search': true,
        'folder-upload': true
    });

    const sortedUserLayers = computed(() => [...userLayers.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    const drawLayers = computed(() => sortedUserLayers.value.filter((layer) => layer.sourceType === 'draw'));
    const uploadLayers = computed(() => sortedUserLayers.value.filter((layer) => layer.sourceType === 'upload'));
    const routeLayers = computed(() => sortedUserLayers.value.filter((layer) => {
        if (layer.sourceType !== 'search') return false;
        if (layer.category === 'route') return true;
        return /_route$/i.test(String(layer.type || ''));
    }));
    const searchLayers = computed(() => sortedUserLayers.value.filter((layer) => {
        if (layer.sourceType !== 'search') return false;
        if (layer.category === 'route') return false;
        return !/_route$/i.test(String(layer.type || ''));
    }));

    const hasDrawCard = computed(() => drawLayers.value.length > 0 || Number(overview.value?.drawCount || 0) > 0);

    const activeAttributeLayer = computed(() => userLayers.value.find((layer) => layer.id === attributeTableLayerId.value) || null);
    const activeAttributeTable = computed(() => {
        const features = activeAttributeLayer.value?.features;
        return Array.isArray(features) ? features : [];
    });

    const editableLayers = computed(() => [
        { id: 'draw', name: `绘制图形 (${overview.value?.drawCount || 0})` },
        ...searchLayers.value.map((layer) => ({ id: layer.id, name: `${layer.name} (${layer.featureCount || 0})` })),
        ...sortedUserLayers.value
            .filter((layer) => layer.sourceType !== 'search' && !isRasterLayer(layer))
            .map((layer) => ({ id: layer.id, name: `${layer.name} (${layer.featureCount || 0})` }))
    ]);

    const layerTree = computed(() => buildLayerTree({
        drawLayers: drawLayers.value,
        routeLayers: routeLayers.value,
        searchLayers: searchLayers.value,
        uploadLayers: uploadLayers.value,
        hasDrawCard: hasDrawCard.value,
        drawCount: Number(overview.value?.drawCount || 0),
        expandedState: layerTreeExpandedState.value
    }));

    function syncLayers(nextLayers: any[] = [], nextOverview: any = {}): void {
        const normalizedLayers = Array.isArray(nextLayers)
            ? nextLayers.map((layer) => normalizeLayerRecord(layer))
            : [];

        userLayers.value = normalizedLayers;
        overview.value = nextOverview || { drawCount: 0, uploadCount: 0, layers: [] };

        const nextExpandedState: Record<string, boolean> = { ...layerTreeExpandedState.value };
        normalizedLayers.forEach((layer) => {
            const rawParentPath = normalizeUploadFolderPath(layer.standardTocItem?.parentId);

            if (layer.sourceType === 'upload' && rawParentPath) {
                const folderChain = buildUploadFolderPathChain(rawParentPath);
                folderChain.forEach((rawPath) => {
                    const folderId = toUploadFolderNodeId(rawPath);
                    if (nextExpandedState[folderId] === undefined) {
                        nextExpandedState[folderId] = true;
                    }
                });
                return;
            }

            const legacyFolderId = String(layer.standardTocItem?.parentId || '').trim();
            if (legacyFolderId && nextExpandedState[legacyFolderId] === undefined) {
                nextExpandedState[legacyFolderId] = true;
            }
        });
        layerTreeExpandedState.value = nextExpandedState;

        if (attributeTableLayerId.value && !userLayers.value.find((layer) => layer.id === attributeTableLayerId.value)) {
            attributeTableLayerId.value = '';
            attributeTableVisible.value = false;
            selectedAttributeFeatureId.value = '';
        }

        const editable = editableLayers.value;
        if (!editable.find((item) => item.id === selectedEditLayerId.value)) {
            selectedEditLayerId.value = editable[0]?.id || 'draw';
        }
    }

    function bindHandlers(nextHandlers: LayerHandlers = {}): void {
        handlers.value = nextHandlers;
    }

    function setStyleTarget(layerId?: string): void {
        selectedEditLayerId.value = layerId || 'draw';
    }

    function setDrawTool(tool: string): void {
        selectedDrawTool.value = tool;
    }

    function showAttributeTable(layerId: string): void {
        attributeTableLayerId.value = layerId;
        attributeTableVisible.value = true;
        selectedAttributeFeatureId.value = '';
    }

    function closeAttributeTable(): void {
        attributeTableVisible.value = false;
        selectedAttributeFeatureId.value = '';
    }

    function findActiveAttributeFeature(featureId: string): any | null {
        const featureKey = String(featureId || '').trim();
        if (!featureKey) return null;
        return activeAttributeTable.value.find((feature: any) => {
            const keys = [feature?.id, feature?._gid, feature?.properties?._gid, feature?.properties?.id];
            return keys.some((key) => String(key || '') === featureKey);
        }) || null;
    }

    function highlightFeature(featureId: string): void {
        const layer = activeAttributeLayer.value;
        if (!layer) return;
        const feature = findActiveAttributeFeature(featureId);
        if (!feature) return;
        selectedAttributeFeatureId.value = String(featureId);
        handlers.value.onHighlightFeature?.({ layerId: layer.id, featureId: String(featureId), feature });
    }

    function zoomToFeature(featureId: string): void {
        const layer = activeAttributeLayer.value;
        if (!layer) return;
        const feature = findActiveAttributeFeature(featureId);
        if (!feature) return;
        selectedAttributeFeatureId.value = String(featureId);

        const payload = { layerId: layer.id, featureId: String(featureId), feature };
        if (handlers.value.onZoomFeature) {
            handlers.value.onZoomFeature(payload);
            return;
        }
        if (handlers.value.onViewFeature) {
            handlers.value.onViewFeature(payload);
            return;
        }
        if (handlers.value.onZoom) {
            handlers.value.onZoom(layer.id);
            return;
        }
        handlers.value.onView?.(layer.id);
    }

    function onDragStart(layerId: string): void {
        draggingLayerId.value = layerId;
    }

    function onDrop(targetLayerId: string): void {
        if (!draggingLayerId.value || draggingLayerId.value === targetLayerId) return;
        handlers.value.onReorder?.({ fromId: draggingLayerId.value, toId: targetLayerId });
        draggingLayerId.value = '';
    }

    function setLayerTreeFolderExpanded(nodeId: string, expanded: boolean): void {
        const id = String(nodeId || '').trim();
        if (!id) return;
        layerTreeExpandedState.value = {
            ...layerTreeExpandedState.value,
            [id]: !!expanded
        };
    }

    function findLayerTreeNodeById(nodeId: string, nodes: any[] = layerTree.value): any | null {
        for (const node of nodes || []) {
            if (node.id === nodeId) return node;
            if (node.children?.length) {
                const found = findLayerTreeNodeById(nodeId, node.children);
                if (found) return found;
            }
        }
        return null;
    }

    function collectLayerTreeLeafNodes(node: any, bucket: any[] = []): any[] {
        if (!node) return bucket;
        if (node.type === 'layer') {
            if (node.showCheckbox !== false) bucket.push(node);
            return bucket;
        }
        (node.children || []).forEach((child: any) => collectLayerTreeLeafNodes(child, bucket));
        return bucket;
    }

    function getLayerLeafNodesByFolder(folderId: string): any[] {
        const node = findLayerTreeNodeById(folderId, layerTree.value);
        if (!node) return [];
        return collectLayerTreeLeafNodes(node, []);
    }

    return {
        userLayers,
        overview,
        selectedDrawTool,
        selectedEditLayerId,
        attributeTableLayerId,
        attributeTableVisible,
        selectedAttributeFeatureId,
        layerTreeExpandedState,
        sortedUserLayers,
        drawLayers,
        uploadLayers,
        routeLayers,
        searchLayers,
        hasDrawCard,
        layerTree,
        activeAttributeLayer,
        editableLayers,
        activeAttributeTable,
        syncLayers,
        bindHandlers,
        setStyleTarget,
        setDrawTool,
        showAttributeTable,
        closeAttributeTable,
        highlightFeature,
        zoomToFeature,
        onDragStart,
        onDrop,
        setLayerTreeFolderExpanded,
        findLayerTreeNodeById,
        collectLayerTreeLeafNodes,
        getLayerLeafNodesByFolder,
        isRasterLayer,
        formatLayerDisplayName
    };
});
