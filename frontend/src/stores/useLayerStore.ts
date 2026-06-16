import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { useTOCStore } from './useTOCStore';
import { useSwipeConfigStore } from './useSwipeConfigStore';
import type { LayerHandlers, LayerStoreLayer } from './layer';
import {
    isRasterLayer,
    formatLayerDisplayName,
    normalizeLayerRecord,
    normalizeUploadFolderPath,
    buildUploadFolderPathChain,
    toUploadFolderNodeId,
    buildLayerTree,
} from './layer';

export const useLayerStore = defineStore('layerStore', () => {
    const tocStore = useTOCStore();
    const userLayers = ref<LayerStoreLayer[]>([]);
    const overview = ref<any>({ drawCount: 0, uploadCount: 0, layers: [] });
    const selectedDrawTool = ref('AttributeQuery');

    // 缓存上一次的图层 ID 序列，避免不必要的 layerTree 重建
    let lastLayerIdSequence = '';
    const cachedLayerTree = shallowRef<any[]>([]);
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
        'folder-upload': true,
        'folder-district': true,
    });

    // ========== Map Swipe Configuration (代理到 useSwipeConfigStore) ==========
    // 卷帘配置已拆分至独立 Store，此处保持引用以兼容现有消费者
    const swipeStore = useSwipeConfigStore();
    const { swipeConfig } = swipeStore;

    const sortedUserLayers = computed(() =>
        [...userLayers.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    );
    const drawLayers = computed(() =>
        sortedUserLayers.value.filter((layer) => layer.sourceType === 'draw'),
    );
    const uploadLayers = computed(() =>
        sortedUserLayers.value.filter((layer) => layer.sourceType === 'upload'),
    );
    const routeLayers = computed(() =>
        sortedUserLayers.value.filter((layer) => {
            if (layer.sourceType !== 'search') return false;
            if (layer.category === 'route') return true;
            return /_route$/i.test(String(layer.type || ''));
        }),
    );
    const searchLayers = computed(() =>
        sortedUserLayers.value.filter((layer) => {
            if (layer.sourceType !== 'search') return false;
            if (layer.category === 'route') return false;
            return !/_route$/i.test(String(layer.type || ''));
        }),
    );

    const districtLayers = computed(() => {
        return (tocStore.layerMetadataList || [])
            .filter((meta) => String(meta?.sourceType || '') === 'district-boundary')
            .map((meta) => ({
                ...meta,
                id: String(meta.id || ''),
                name: String(meta.name || meta.adcode || '行政区划'),
                sourceType: 'district-boundary',
                visible: meta.visible !== false,
            }));
    });

    const hasDrawCard = computed(
        () => drawLayers.value.length > 0 || Number(overview.value?.drawCount || 0) > 0,
    );

    const activeAttributeLayer = computed(
        () => userLayers.value.find((layer) => layer.id === attributeTableLayerId.value) || null,
    );
    const activeAttributeTable = computed(() => {
        const features = activeAttributeLayer.value?.features;
        return Array.isArray(features) ? features : [];
    });

    const editableLayers = computed(() => [
        { id: 'draw', name: `绘制图形 (${overview.value?.drawCount || 0})` },
        ...searchLayers.value.map((layer) => ({
            id: layer.id,
            name: `${layer.name} (${layer.featureCount || 0})`,
        })),
        ...sortedUserLayers.value
            .filter((layer) => layer.sourceType !== 'search' && !isRasterLayer(layer))
            .map((layer) => ({ id: layer.id, name: `${layer.name} (${layer.featureCount || 0})` })),
    ]);

    const layerTree = computed(() => {
        // 生成当前图层 ID 序列，用于判断是否需要重建树
        const currentIdSequence = [
            ...drawLayers.value.map(l => l.id),
            ...routeLayers.value.map(l => l.id),
            ...searchLayers.value.map(l => l.id),
            ...uploadLayers.value.map(l => l.id),
            ...districtLayers.value.map(l => l.id),
        ].join(',');

        // 只在图层顺序或数量变化时才重建树
        if (currentIdSequence !== lastLayerIdSequence) {
            lastLayerIdSequence = currentIdSequence;
            cachedLayerTree.value = buildLayerTree({
                drawLayers: drawLayers.value,
                routeLayers: routeLayers.value,
                searchLayers: searchLayers.value,
                uploadLayers: uploadLayers.value,
                districtLayers: districtLayers.value,
                expandedState: layerTreeExpandedState.value,
            });
        }

        return cachedLayerTree.value;
    });

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

        if (
            attributeTableLayerId.value &&
            !userLayers.value.find((layer) => layer.id === attributeTableLayerId.value)
        ) {
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

    function renameLayer(layerId: string, newName: string): void {
        const id = String(layerId || '').trim();
        const name = String(newName || '').trim();
        if (!id || !name) return;

        const idx = userLayers.value.findIndex((l: any) => String(l.id).trim() === id);
        if (idx < 0) return;

        const layer: any = { ...userLayers.value[idx] };
        layer.name = name;
        layer.displayName = name;

        if (layer.standardTocItem) {
            layer.standardTocItem = { ...layer.standardTocItem, name };
        }

        const updated = [...userLayers.value];
        updated[idx] = layer;
        userLayers.value = updated;
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
        return (
            activeAttributeTable.value.find((feature: any) => {
                const keys = [
                    feature?.id,
                    feature?._gid,
                    feature?.properties?._gid,
                    feature?.properties?.id,
                ];
                return keys.some((key) => String(key || '') === featureKey);
            }) || null
        );
    }

    function highlightFeature(featureId: string): void {
        const layer = activeAttributeLayer.value;
        if (!layer) return;
        const feature = findActiveAttributeFeature(featureId);
        if (!feature) return;
        selectedAttributeFeatureId.value = String(featureId);
        handlers.value.onHighlightFeature?.({
            layerId: layer.id,
            featureId: String(featureId),
            feature,
        });
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
            [id]: !!expanded,
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
        swipeConfig,
        sortedUserLayers,
        drawLayers,
        uploadLayers,
        routeLayers,
        searchLayers,
        districtLayers,
        hasDrawCard,
        layerTree,
        activeAttributeLayer,
        editableLayers,
        activeAttributeTable,
        syncLayers,
        bindHandlers,
        setStyleTarget,
        renameLayer,
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
        // ========== Map Swipe API (代理到 useSwipeConfigStore) ==========
        setSwipeConfig: swipeStore.setSwipeConfig,
        updateSwipePosition: swipeStore.updateSwipePosition,
        updateSwipeMode: swipeStore.updateSwipeMode,
        enableSwipe: swipeStore.enableSwipe,
        disableSwipe: swipeStore.disableSwipe,
        isRasterLayer,
        formatLayerDisplayName,
    };
});
