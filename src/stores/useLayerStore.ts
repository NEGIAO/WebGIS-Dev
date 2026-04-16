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

function toLayerNode(layer: any, level: number, group: string): any {
    const poiid = getLayerPoiId(layer);
    const isSearchPointLayer = group === 'search' && String(layer?.type || '').toLowerCase() === 'search';

    const baseNode = {
        id: layer.id,
        name: String(layer.name || ''),
        displayName: formatLayerDisplayName(layer.name),
        type: 'layer',
        visible: layer.visible !== false,
        children: [],
        expanded: false,
        level,
        featureCount: Number(layer.featureCount) || 0,
        labelVisible: layer.labelVisible !== false,
        showCheckbox: true,
        raw: layer,
        draggable: group === 'upload',
        droppable: group === 'upload',
        actions: {
            attribute: hasAttributeFeatures(layer),
            style: group !== 'route' && !isRasterLayer(layer),
            label: (group === 'search' || group === 'upload') && canToggleLabel(layer),
            copyCoordinates: supportsCoordinateOperations(layer) && layerHasCoordinates(layer),
            toggleLayerCRS: supportsCoordinateOperations(layer),
            exportLayerData: supportsCoordinateOperations(layer),
            openAoiPanel: isSearchPointLayer,
            aoiPanelPayload: {
                layerId: layer.id,
                layerName: String(layer.name || ''),
                poiid
            },
            zoom: true,
            remove: true,
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
    drawLayers: any[];
    routeLayers: any[];
    searchLayers: any[];
    uploadLayers: any[];
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
        const uploadChildren = uploadLayers.map((layer) => toLayerNode(layer, 1, 'upload'));
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
    const userLayers = ref<any[]>([]);
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
        userLayers.value = Array.isArray(nextLayers) ? nextLayers : [];
        overview.value = nextOverview || { drawCount: 0, uploadCount: 0, layers: [] };

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
