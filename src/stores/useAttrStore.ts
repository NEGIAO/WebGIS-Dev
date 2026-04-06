import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

type AttrFieldType = 'string' | 'number' | 'date';

export type AttrFieldConfigItem = {
    key: string;
    alias: string;
    visible: boolean;
    type: AttrFieldType;
};

export type AttrRow = {
    featureId: string;
    layerId: string;
    properties: Record<string, unknown>;
    geometry: any;
    extent: [number, number, number, number] | null;
};

type AttrLayerDataset = {
    layerId: string;
    layerName: string;
    rows: AttrRow[];
    fieldConfig: Record<string, AttrFieldConfigItem>;
};

type PanelRect = {
    x: number;
    y: number;
    width: number;
    height: number;
    initialized: boolean;
};

function toFeatureId(feature: any, index: number): string {
    const candidates = [
        feature?.id,
        feature?._gid,
        feature?.properties?._gid,
        feature?.properties?.id,
        feature?.properties?.OBJECTID,
        feature?.properties?.FID
    ];
    const matched = candidates.find((item) => String(item || '').trim().length > 0);
    return String(matched || `feature_${index + 1}`);
}

function inferFieldType(values: unknown[]): AttrFieldType {
    let numberLike = 0;
    let dateLike = 0;
    let valid = 0;

    for (const raw of values) {
        if (raw === null || raw === undefined || raw === '') continue;
        valid += 1;

        if (typeof raw === 'number' && Number.isFinite(raw)) {
            numberLike += 1;
            continue;
        }

        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed) continue;
            const asNumber = Number(trimmed);
            if (Number.isFinite(asNumber)) {
                numberLike += 1;
                continue;
            }
            const asDate = Date.parse(trimmed);
            if (Number.isFinite(asDate)) {
                dateLike += 1;
            }
            continue;
        }

        if (raw instanceof Date && Number.isFinite(raw.getTime())) {
            dateLike += 1;
        }
    }

    if (!valid) return 'string';
    if (numberLike / valid >= 0.8) return 'number';
    if (dateLike / valid >= 0.8) return 'date';
    return 'string';
}

function extractProperties(feature: any): Record<string, unknown> {
    const props = feature?.properties && typeof feature.properties === 'object'
        ? { ...feature.properties }
        : {};

    delete (props as any).geometry;
    delete (props as any).style;
    return props;
}

function accumulateCoords(coord: any, bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
    if (!Array.isArray(coord)) return;

    if (coord.length >= 2 && Number.isFinite(Number(coord[0])) && Number.isFinite(Number(coord[1]))) {
        const x = Number(coord[0]);
        const y = Number(coord[1]);
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
        return;
    }

    coord.forEach((child) => accumulateCoords(child, bounds));
}

function computeGeometryExtent(geometry: any): [number, number, number, number] | null {
    const coordinates = geometry?.coordinates;
    if (!coordinates) return null;

    const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
    };

    accumulateCoords(coordinates, bounds);

    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
        return null;
    }

    return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}

function intersectsExtent(
    a: [number, number, number, number],
    b: [number, number, number, number]
): boolean {
    return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
}

function isRasterType(layerType: unknown): boolean {
    const t = String(layerType || '').toLowerCase();
    return t === 'tif' || t === 'tiff';
}

function buildFieldConfig(
    rows: AttrRow[],
    previousMap: Record<string, AttrFieldConfigItem> = {}
): Record<string, AttrFieldConfigItem> {
    const keys = new Set<string>();
    rows.forEach((row) => {
        Object.keys(row.properties || {}).forEach((key) => keys.add(key));
    });

    const nextMap: Record<string, AttrFieldConfigItem> = {};
    Array.from(keys).forEach((fieldKey) => {
        const values = rows.map((row) => row.properties?.[fieldKey]);
        const oldConfig = previousMap[fieldKey];

        nextMap[fieldKey] = {
            key: fieldKey,
            alias: String(oldConfig?.alias || fieldKey),
            visible: oldConfig?.visible !== false,
            type: oldConfig?.type || inferFieldType(values)
        };
    });

    return nextMap;
}

function buildLayerDataset(
    layerId: string,
    layerName: string,
    features: any[],
    previousFieldConfig: Record<string, AttrFieldConfigItem> = {}
): AttrLayerDataset {
    const rows: AttrRow[] = (features || []).map((feature, index) => {
        const properties = extractProperties(feature);
        return {
            featureId: toFeatureId(feature, index),
            layerId,
            properties,
            geometry: feature?.geometry || null,
            extent: computeGeometryExtent(feature?.geometry)
        };
    });

    return {
        layerId,
        layerName,
        rows,
        fieldConfig: buildFieldConfig(rows, previousFieldConfig)
    };
}

export const useAttrStore = defineStore('attrStore', () => {
    const datasets = ref<Record<string, AttrLayerDataset>>({});
    const visible = ref(false);
    const minimized = ref(false);
    const activeLayerId = ref('');
    const selectedFeatureId = ref('');
    const filterByCurrentView = ref(false);
    const currentMapExtent = ref<[number, number, number, number] | null>(null);
    const panelRect = ref<PanelRect>({
        x: 0,
        y: 0,
        width: 940,
        height: 360,
        initialized: false
    });

    const activeDataset = computed<AttrLayerDataset | null>(() => datasets.value[activeLayerId.value] || null);
    const activeRows = computed<AttrRow[]>(() => activeDataset.value?.rows || []);
    const activeFields = computed<AttrFieldConfigItem[]>(() => Object.values(activeDataset.value?.fieldConfig || {}));
    const visibleFields = computed<AttrFieldConfigItem[]>(() => activeFields.value.filter((item) => item.visible));
    const numericFields = computed<AttrFieldConfigItem[]>(() => activeFields.value.filter((item) => item.type === 'number'));

    const filteredRows = computed<AttrRow[]>(() => {
        if (!filterByCurrentView.value || !currentMapExtent.value) return activeRows.value;
        return activeRows.value.filter((row) => {
            if (!row.extent) return true;
            return intersectsExtent(row.extent, currentMapExtent.value as [number, number, number, number]);
        });
    });

    function syncLayers(layers: any[] = []): void {
        const nextMap: Record<string, AttrLayerDataset> = {};

        (layers || []).forEach((layer) => {
            const layerId = String(layer?.id || '').trim();
            if (!layerId) return;
            if (isRasterType(layer?.type)) return;

            const features = Array.isArray(layer?.features) ? layer.features : [];
            const layerName = String(layer?.name || '未命名图层');
            const prevFieldConfig = datasets.value[layerId]?.fieldConfig || {};
            nextMap[layerId] = buildLayerDataset(layerId, layerName, features, prevFieldConfig);
        });

        datasets.value = nextMap;

        if (activeLayerId.value && !datasets.value[activeLayerId.value]) {
            activeLayerId.value = '';
            selectedFeatureId.value = '';
            visible.value = false;
        }
    }

    function openTable(layerId: string, layerName = ''): void {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId) return;

        if (!datasets.value[normalizedLayerId]) {
            datasets.value[normalizedLayerId] = {
                layerId: normalizedLayerId,
                layerName: String(layerName || '未命名图层'),
                rows: [],
                fieldConfig: {}
            };
        }

        if (layerName) {
            datasets.value[normalizedLayerId].layerName = layerName;
        }

        activeLayerId.value = normalizedLayerId;
        visible.value = true;
        minimized.value = false;
        selectedFeatureId.value = '';
    }

    function closeTable(): void {
        visible.value = false;
        selectedFeatureId.value = '';
    }

    function toggleMinimized(): void {
        minimized.value = !minimized.value;
    }

    function setSelectedFeature(featureId: string): void {
        selectedFeatureId.value = String(featureId || '');
    }

    function setFilterByCurrentView(enabled: boolean): void {
        filterByCurrentView.value = !!enabled;
    }

    function setMapExtent(extent: number[] | null | undefined): void {
        if (!Array.isArray(extent) || extent.length < 4) {
            currentMapExtent.value = null;
            return;
        }
        const normalized = extent.slice(0, 4).map((item) => Number(item));
        if (!normalized.every(Number.isFinite)) {
            currentMapExtent.value = null;
            return;
        }
        currentMapExtent.value = [
            normalized[0],
            normalized[1],
            normalized[2],
            normalized[3]
        ];
    }

    function setFieldAlias(fieldKey: string, alias: string): void {
        const dataset = activeDataset.value;
        if (!dataset) return;
        if (!dataset.fieldConfig[fieldKey]) return;
        dataset.fieldConfig[fieldKey].alias = String(alias || fieldKey);
    }

    function setFieldVisibility(fieldKey: string, visibleFlag: boolean): void {
        const dataset = activeDataset.value;
        if (!dataset) return;
        if (!dataset.fieldConfig[fieldKey]) return;
        dataset.fieldConfig[fieldKey].visible = !!visibleFlag;
    }

    function setPanelRect(nextRect: Partial<PanelRect>): void {
        panelRect.value = {
            ...panelRect.value,
            ...nextRect,
            initialized: true
        };
    }

    function resetPanelRectInitialized(): void {
        panelRect.value = {
            ...panelRect.value,
            initialized: false
        };
    }

    return {
        datasets,
        visible,
        minimized,
        activeLayerId,
        selectedFeatureId,
        filterByCurrentView,
        currentMapExtent,
        panelRect,
        activeDataset,
        activeRows,
        activeFields,
        visibleFields,
        numericFields,
        filteredRows,
        syncLayers,
        openTable,
        closeTable,
        toggleMinimized,
        setSelectedFeature,
        setFilterByCurrentView,
        setMapExtent,
        setFieldAlias,
        setFieldVisibility,
        setPanelRect,
        resetPanelRectInitialized
    };
});
