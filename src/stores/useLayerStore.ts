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

    return {
        userLayers,
        overview,
        selectedDrawTool,
        selectedEditLayerId,
        attributeTableLayerId,
        attributeTableVisible,
        selectedAttributeFeatureId,
        sortedUserLayers,
        drawLayers,
        uploadLayers,
        routeLayers,
        searchLayers,
        hasDrawCard,
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
        isRasterLayer,
        formatLayerDisplayName
    };
});
