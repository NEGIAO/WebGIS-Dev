import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { createLayerMetadataNormalizationFeature } from '../composables/map/features';

type AttrFieldType = 'string' | 'number' | 'date' | 'boolean';

export type AttrFieldConfigItem = {
    key: string;
    alias: string;
    visible: boolean;
    type: AttrFieldType;
};

export type AttrRow = {
    id: string;
    featureId: string;
    layerId: string;
    layerName: string;
    sourceType: string;
    geometryType: string;
    properties: Record<string, unknown>;
    rawAttributes: Record<string, unknown>;
    statistics: Record<string, unknown>;
    geometry: any;
    extent: [number, number, number, number] | null;
    searchText: string;
};

type AttrLayerDataset = {
    id: string;
    layerId: string;
    layerName: string;
    sourceType: string;
    geometryType: string;
    metadata: Record<string, unknown>;
    rows: AttrRow[];
    fieldConfig: Record<string, AttrFieldConfigItem>;
    statistics: Record<string, unknown>;
};

type PanelRect = {
    x: number;
    y: number;
    width: number;
    height: number;
    initialized: boolean;
};

const { flattenAttributes, inferValueType, normalizeLayerAttributeSnapshot } = createLayerMetadataNormalizationFeature();

function toFeatureId(feature: any, index: number): string {
    const candidates = [
        feature?.id,
        feature?._gid,
        feature?.properties?._gid,
        feature?.properties?.id,
        feature?.properties?.OBJECTID,
        feature?.properties?.FID,
        feature?.properties?.objectid,
        feature?.properties?.fid
    ];
    const matched = candidates.find((item) => String(item || '').trim().length > 0);
    return String(matched || `feature_${index + 1}`);
}

function stringifySearchText(parts: unknown[]): string {
    return parts
        .map((part) => {
            if (part === null || part === undefined) return '';
            if (typeof part === 'string') return part;
            if (typeof part === 'number' || typeof part === 'boolean') return String(part);
            if (part instanceof Date) return part.toISOString();
            try {
                return JSON.stringify(part);
            } catch {
                return String(part);
            }
        })
        .join(' ')
        .toLowerCase();
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
    if (!geometry) return null;
    if (typeof geometry.getExtent === 'function') {
        const extent = geometry.getExtent();
        if (Array.isArray(extent) && extent.length >= 4 && extent.every(Number.isFinite)) {
            return [extent[0], extent[1], extent[2], extent[3]] as [number, number, number, number];
        }
    }

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
        const typeCounts = values.reduce<Record<string, number>>((acc, value) => {
            const type = inferValueType(value);
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        nextMap[fieldKey] = {
            key: fieldKey,
            alias: String(oldConfig?.alias || fieldKey),
            visible: oldConfig?.visible !== false,
            type: (oldConfig?.type || Object.entries(typeCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || 'string') as AttrFieldType
        };
    });

    return nextMap;
}

function buildLayerDataset(layer: any, previousSnapshot: AttrLayerDataset | null = null): AttrLayerDataset {
    const snapshot = normalizeLayerAttributeSnapshot(layer);
    const rows: AttrRow[] = (snapshot.rows || snapshot.records || []).map((record: any, index: number) => {
        const properties = record?.properties && typeof record.properties === 'object'
            ? { ...record.properties }
            : {};
        const rawAttributes = record?.rawAttributes && typeof record.rawAttributes === 'object'
            ? { ...record.rawAttributes }
            : {};
        const statistics = record?.statistics && typeof record.statistics === 'object'
            ? { ...record.statistics }
            : {};

        return {
            id: String(record?.id || record?.featureId || toFeatureId(record, index)),
            featureId: String(record?.featureId || record?.id || toFeatureId(record, index)),
            layerId: String(record?.layerId || snapshot.layerId || layer?.id || ''),
            layerName: String(record?.layerName || snapshot.layerName || layer?.name || '未命名图层'),
            sourceType: String(record?.sourceType || snapshot.sourceType || layer?.sourceType || 'upload'),
            geometryType: String(record?.geometryType || snapshot.geometryType || layer?.type || 'unknown'),
            properties,
            rawAttributes,
            statistics,
            geometry: record?.geometry || null,
            extent: record?.extent || computeGeometryExtent(record?.geometry),
            searchText: String(record?.searchText || stringifySearchText([
                record?.featureId,
                record?.geometryType,
                record?.properties,
                record?.rawAttributes,
                record?.statistics,
                snapshot.layerName,
                layer?.name
            ]))
        };
    });

    return {
        id: String(snapshot.id || layer?.id || ''),
        layerId: String(snapshot.layerId || layer?.id || ''),
        layerName: String(snapshot.layerName || layer?.name || '未命名图层'),
        sourceType: String(snapshot.sourceType || layer?.sourceType || 'upload'),
        geometryType: String(snapshot.geometryType || layer?.type || 'unknown'),
        metadata: { ...(snapshot.metadata || {}) },
        rows,
        fieldConfig: buildFieldConfig(rows, (previousSnapshot?.fieldConfig || snapshot.fieldConfig || {}) as Record<string, AttrFieldConfigItem>),
        statistics: { ...(snapshot.statistics || {}) }
    };
}

export const useAttrStore = defineStore('attrStore', () => {
    const datasets = ref<Record<string, AttrLayerDataset>>({});
    const visible = ref(false);
    const minimized = ref(false);
    const activeLayerId = ref('');
    const selectedFeatureId = ref('');
    const filterByCurrentView = ref(false);
    const searchQuery = ref('');
    const sortKey = ref('');
    const sortDirection = ref<'asc' | 'desc'>('asc');
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

    function matchesCurrentView(row: AttrRow): boolean {
        if (!filterByCurrentView.value || !currentMapExtent.value) return true;
        if (!row.extent) return true;
        return intersectsExtent(row.extent, currentMapExtent.value as [number, number, number, number]);
    }

    function matchesSearch(row: AttrRow): boolean {
        const query = String(searchQuery.value || '').trim().toLowerCase();
        if (!query) return true;
        return String(row.searchText || '').includes(query);
    }

    const filteredRows = computed<AttrRow[]>(() => activeRows.value.filter((row) => matchesCurrentView(row) && matchesSearch(row)));

    const displayRows = computed<AttrRow[]>(() => {
        const rows = filteredRows.value;
        const fieldKey = String(sortKey.value || '').trim();
        if (!fieldKey) return rows;

        const field = activeFields.value.find((item) => item.key === fieldKey);
        if (!field) return rows;

        const direction = sortDirection.value === 'asc' ? 1 : -1;
        return [...rows].sort((left, right) => {
            const leftValue = left.properties?.[fieldKey];
            const rightValue = right.properties?.[fieldKey];

            if (leftValue === rightValue) return 0;
            if (leftValue === null || leftValue === undefined || leftValue === '') return 1;
            if (rightValue === null || rightValue === undefined || rightValue === '') return -1;

            if (field.type === 'number') {
                const leftNumber = Number(leftValue);
                const rightNumber = Number(rightValue);
                if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
                    return (leftNumber - rightNumber) * direction;
                }
            }

            if (field.type === 'date') {
                const leftDate = new Date(String(leftValue)).getTime();
                const rightDate = new Date(String(rightValue)).getTime();
                if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
                    return (leftDate - rightDate) * direction;
                }
            }

            if (field.type === 'boolean') {
                const leftBoolean = String(leftValue).toLowerCase() === 'true' || leftValue === true ? 1 : 0;
                const rightBoolean = String(rightValue).toLowerCase() === 'true' || rightValue === true ? 1 : 0;
                return (leftBoolean - rightBoolean) * direction;
            }

            return String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN') * direction;
        });
    });

    function upsertDatasetSnapshot(layer: any): void {
        const layerId = String(layer?.id || '').trim();
        if (!layerId) return;

        const previous = datasets.value[layerId] || null;
        const snapshot = buildLayerDataset(layer, previous);
        datasets.value[layerId] = {
            ...snapshot,
            fieldConfig: buildFieldConfig(snapshot.rows, (previous?.fieldConfig || {}) as Record<string, AttrFieldConfigItem>)
        };
    }

    function syncLayers(layers: any[] = []): void {
        (layers || []).forEach((layer) => upsertDatasetSnapshot(layer));

        if (activeLayerId.value && !datasets.value[activeLayerId.value]) {
            activeLayerId.value = '';
            selectedFeatureId.value = '';
            visible.value = false;
        }
    }

    function ensureDataset(layerId: string, layerName = ''): AttrLayerDataset {
        const normalizedLayerId = String(layerId || '').trim();
        const existing = datasets.value[normalizedLayerId];
        if (existing) {
            if (layerName) existing.layerName = layerName;
            return existing;
        }

        const placeholder: AttrLayerDataset = {
            id: normalizedLayerId,
            layerId: normalizedLayerId,
            layerName: String(layerName || '未命名图层'),
            sourceType: 'upload',
            geometryType: 'unknown',
            metadata: {},
            rows: [],
            fieldConfig: {},
            statistics: {}
        };
        datasets.value[normalizedLayerId] = placeholder;
        return placeholder;
    }

    function openTable(layerId: string, layerName = ''): void {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId) return;

        ensureDataset(normalizedLayerId, layerName);
        activeLayerId.value = normalizedLayerId;
        visible.value = true;
        minimized.value = false;
        selectedFeatureId.value = '';
    }

    function setActiveLayer(layerId: string): void {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId) return;
        ensureDataset(normalizedLayerId);
        activeLayerId.value = normalizedLayerId;
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

    function setSearchQuery(query: string): void {
        searchQuery.value = String(query || '');
    }

    function setSortState(nextKey: string, nextDirection: 'asc' | 'desc' = 'asc'): void {
        sortKey.value = String(nextKey || '').trim();
        sortDirection.value = nextDirection === 'desc' ? 'desc' : 'asc';
    }

    function toggleSort(fieldKey: string): void {
        const normalizedKey = String(fieldKey || '').trim();
        if (!normalizedKey || normalizedKey === '___index') {
            sortKey.value = '';
            sortDirection.value = 'asc';
            return;
        }

        if (sortKey.value === normalizedKey) {
            sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
            return;
        }

        sortKey.value = normalizedKey;
        sortDirection.value = 'asc';
    }

    function clearSort(): void {
        sortKey.value = '';
        sortDirection.value = 'asc';
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
        searchQuery,
        sortKey,
        sortDirection,
        currentMapExtent,
        panelRect,
        activeDataset,
        activeRows,
        activeFields,
        visibleFields,
        numericFields,
        filteredRows,
        displayRows,
        syncLayers,
        openTable,
        setActiveLayer,
        closeTable,
        toggleMinimized,
        setSelectedFeature,
        setFilterByCurrentView,
        setSearchQuery,
        setSortState,
        toggleSort,
        clearSort,
        setMapExtent,
        setFieldAlias,
        setFieldVisibility,
        setPanelRect,
        resetPanelRectInitialized
    };
});
