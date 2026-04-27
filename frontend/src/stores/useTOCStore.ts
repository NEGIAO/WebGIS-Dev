import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export type TOCLayerMetadata = {
    id: string;
    name: string;
    adcode: string;
    sourceType: string;
    sourceUrl: string;
    visible: boolean;
    featureCount: number;
    extent: number[];
    updatedAt: string;
    metadata: Record<string, any>;
};

function normalizeExtent(rawExtent: unknown): number[] {
    if (!Array.isArray(rawExtent) || rawExtent.length < 4) return [];

    return rawExtent
        .slice(0, 4)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
}

function normalizeText(value: unknown, fallback = ''): string {
    const compact = String(value || '').trim();
    return compact || fallback;
}

/**
 * TOC Store: 记录额外图层元信息（例如行政区边界），供 TOC 组件或调试面板消费。
 */
export const useTOCStore = defineStore('tocStore', () => {
    const layerMetadataMap = ref<Record<string, TOCLayerMetadata>>({});

    const layerMetadataList = computed(() => {
        return Object.values(layerMetadataMap.value)
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    });

    function upsertLayerMeta(meta: Partial<TOCLayerMetadata> & { id: string }): TOCLayerMetadata {
        const layerId = normalizeText(meta.id);
        if (!layerId) {
            throw new Error('upsertLayerMeta 需要有效的 id');
        }

        const previous = layerMetadataMap.value[layerId];
        const nextItem: TOCLayerMetadata = {
            id: layerId,
            name: normalizeText(meta.name, previous?.name || '未命名图层'),
            adcode: normalizeText(meta.adcode, previous?.adcode || ''),
            sourceType: normalizeText(meta.sourceType, previous?.sourceType || 'unknown'),
            sourceUrl: normalizeText(meta.sourceUrl, previous?.sourceUrl || ''),
            visible: meta.visible !== undefined ? Boolean(meta.visible) : previous?.visible !== false,
            featureCount: Number.isFinite(meta.featureCount)
                ? Number(meta.featureCount)
                : Number(previous?.featureCount || 0),
            extent: normalizeExtent(meta.extent ?? previous?.extent ?? []),
            updatedAt: normalizeText(meta.updatedAt, new Date().toISOString()),
            metadata: {
                ...(previous?.metadata || {}),
                ...((meta.metadata && typeof meta.metadata === 'object') ? meta.metadata : {})
            }
        };

        layerMetadataMap.value = {
            ...layerMetadataMap.value,
            [layerId]: nextItem
        };

        return nextItem;
    }

    function removeLayerMeta(layerId: string): void {
        const id = normalizeText(layerId);
        if (!id || !layerMetadataMap.value[id]) return;

        const nextMap = { ...layerMetadataMap.value };
        delete nextMap[id];
        layerMetadataMap.value = nextMap;
    }

    function clearLayerMeta(): void {
        layerMetadataMap.value = {};
    }

    function getLayerMeta(layerId: string): TOCLayerMetadata | null {
        const id = normalizeText(layerId);
        return layerMetadataMap.value[id] || null;
    }

    return {
        layerMetadataMap,
        layerMetadataList,
        upsertLayerMeta,
        removeLayerMeta,
        clearLayerMeta,
        getLayerMeta
    };
});
