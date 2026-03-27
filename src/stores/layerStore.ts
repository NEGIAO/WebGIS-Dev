import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export type LayerKind = 'vector' | 'raster';

export type LayerStyleConfig = {
    strokeColor?: string;
    strokeWidth?: number;
    fillColor?: string;
    fillOpacity?: number;
    pointRadius?: number;
    [key: string]: unknown;
};

export type LayerRecord = {
    id: string;
    name: string;
    type: LayerKind;
    isRequested: boolean;
    visible: boolean;
    opacity: number;
    olFeatures?: unknown;
    olSource?: unknown;
    style: LayerStyleConfig;
    meta?: Record<string, unknown>;
};

export type AddLayerInput = Omit<LayerRecord, 'id' | 'isRequested'> & { id?: string; isRequested?: boolean };

type ReorderPayload =
    | { fromId: string; toId: string }
    | { orderedIds: string[] };

const DEFAULT_STYLE: LayerStyleConfig = {
    strokeColor: '#2f7d3c',
    strokeWidth: 2,
    fillColor: '#5fbf7a',
    fillOpacity: 0.2,
    pointRadius: 6
};

function createLayerId(prefix = 'layer'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOpacity(opacity: unknown): number {
    const parsed = Number(opacity);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(0, Math.min(1, parsed));
}

export const useLayerStore = defineStore('layerDataStore', () => {
    const layers = ref<LayerRecord[]>([]);

    const visibleLayers = computed(() => layers.value.filter((item) => item.visible));

    function addLayer(payload: AddLayerInput): LayerRecord {
        const id = String(payload?.id || createLayerId(payload?.type || 'layer'));
        const normalized: LayerRecord = {
            id,
            name: String(payload?.name || id),
            type: payload?.type === 'raster' ? 'raster' : 'vector',
            isRequested: payload?.isRequested ?? payload?.visible !== false,
            visible: payload?.visible !== false,
            opacity: normalizeOpacity(payload?.opacity ?? 1),
            olFeatures: payload?.olFeatures,
            olSource: payload?.olSource,
            style: { ...DEFAULT_STYLE, ...(payload?.style || {}) },
            meta: payload?.meta || {}
        };

        const existingIndex = layers.value.findIndex((item) => item.id === id);
        if (existingIndex >= 0) {
            layers.value.splice(existingIndex, 1, normalized);
        } else {
            layers.value.push(normalized);
        }

        return normalized;
    }

    function removeLayer(layerId: string): void {
        const targetId = String(layerId || '').trim();
        if (!targetId) return;
        layers.value = layers.value.filter((item) => item.id !== targetId);
    }

    function toggleLayerVisibility(layerId: string, visible?: boolean): void {
        const target = layers.value.find((item) => item.id === layerId);
        if (!target) return;

        if (typeof visible === 'boolean') {
            target.visible = visible;
            if (visible) {
                target.isRequested = true;
            }
            return;
        }

        target.visible = !target.visible;
        if (target.visible) {
            target.isRequested = true;
        }
    }

    function setLayerRequested(layerId: string, requested = true): void {
        const target = layers.value.find((item) => item.id === layerId);
        if (!target) return;
        target.isRequested = !!requested;
    }

    function updateLayerStyle(layerId: string, stylePatch: LayerStyleConfig): void {
        const target = layers.value.find((item) => item.id === layerId);
        if (!target) return;
        target.style = { ...target.style, ...(stylePatch || {}) };
    }

    function reorderLayers(payload: ReorderPayload): void {
        if ('orderedIds' in payload) {
            const orderedMap = new Map(layers.value.map((item) => [item.id, item]));
            const next = payload.orderedIds.map((id) => orderedMap.get(id)).filter(Boolean) as LayerRecord[];
            const missing = layers.value.filter((item) => !payload.orderedIds.includes(item.id));
            layers.value = [...next, ...missing];
            return;
        }

        const fromIndex = layers.value.findIndex((item) => item.id === payload.fromId);
        const toIndex = layers.value.findIndex((item) => item.id === payload.toId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const [moved] = layers.value.splice(fromIndex, 1);
        layers.value.splice(toIndex, 0, moved);
    }

    return {
        layers,
        visibleLayers,
        addLayer,
        removeLayer,
        toggleLayerVisibility,
        setLayerRequested,
        updateLayerStyle,
        reorderLayers
    };
});
