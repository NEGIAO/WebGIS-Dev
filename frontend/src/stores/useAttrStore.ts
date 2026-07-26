import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { createLayerMetadataNormalizationFeature } from '../composables/map/features';

type AttrFieldType = 'string' | 'number' | 'date' | 'boolean';

export type AttrFieldConfigItem = {
    key: string;
    alias: string;
    visible: boolean;
    type: AttrFieldType;
    /** 用户拖拽设定的列宽（px）；未设定时由表格用弹性宽度渲染 */
    width?: number;
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

const { flattenAttributes: _flattenAttributes, inferValueType, normalizeLayerAttributeSnapshot } =
    createLayerMetadataNormalizationFeature();

function toFeatureId(feature: any, index: number): string {
    const candidates = [
        feature?.id,
        feature?._gid,
        feature?.properties?._gid,
        feature?.properties?.id,
        feature?.properties?.OBJECTID,
        feature?.properties?.FID,
        feature?.properties?.objectid,
        feature?.properties?.fid,
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

function accumulateCoords(
    coord: any,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
) {
    if (!Array.isArray(coord)) return;

    if (
        coord.length >= 2 &&
        Number.isFinite(Number(coord[0])) &&
        Number.isFinite(Number(coord[1]))
    ) {
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
        maxY: Number.NEGATIVE_INFINITY,
    };

    accumulateCoords(coordinates, bounds);

    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
        return null;
    }

    return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}

function intersectsExtent(
    a: [number, number, number, number],
    b: [number, number, number, number],
): boolean {
    return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
}

// ─── 范围坐标系归一（EPSG:3857 → EPSG:4326，纯数学无 OL 依赖）───
const WEB_MERCATOR_LIMIT = 20037508.342789244;

/**
 * 判断范围数值是否更像 Web Mercator 米制坐标。
 * EPSG:4326 合法值域不超过 ±180/±90，任一分量绝对值超过 360 视为 3857。
 * （±0.36~360 米的赤道原点微小范围存在理论歧义，实际业务数据不会落入。）
 */
function looksLikeWebMercatorExtent(extent: [number, number, number, number]): boolean {
    return extent.some((value) => Math.abs(value) > 360);
}

/** Web Mercator X（米） → 经度（度）。 */
function mercatorToLon(x: number): number {
    return (x / WEB_MERCATOR_LIMIT) * 180;
}

/** Web Mercator Y（米） → 纬度（度）。 */
function mercatorToLat(y: number): number {
    return (Math.atan(Math.exp((y / WEB_MERCATOR_LIMIT) * Math.PI)) * 360) / Math.PI - 90;
}

/**
 * 将任意来源的范围归一到 EPSG:4326 后返回。
 *
 * 背景：行数据来自 OL 要素时 extent 为 3857 米制，来自 GeoJSON 记录时为 4326
 * 经纬度；地图视图范围则始终是 3857。混用坐标系做相交判断会让「视图筛选范围」
 * 结果完全错乱，因此行侧与地图侧统一归一到 4326 再比较。
 */
function normalizeExtentTo4326(
    extent: [number, number, number, number] | null,
): [number, number, number, number] | null {
    if (!extent || !extent.every(Number.isFinite)) return null;
    if (!looksLikeWebMercatorExtent(extent)) return extent;
    return [
        mercatorToLon(extent[0]),
        mercatorToLat(extent[1]),
        mercatorToLon(extent[2]),
        mercatorToLat(extent[3]),
    ];
}

/** FNV-1a 32 位哈希（可传入种子实现流式累计）。 */
function fnv1aHash(text: string, seed = 0x811c9dc5): number {
    let hash = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

/**
 * 计算数据集内容签名：图层元信息 + 行数 + 逐行 featureId/searchText 哈希。
 * 签名一致 → 数据未实质变化 → 跳过替换，保持 rows 引用稳定，
 * 使属性表的虚拟滚动、选中态不因无关的图层事件被重置。
 */
function computeDatasetSignature(dataset: AttrLayerDataset): string {
    let hash = 0x811c9dc5;
    dataset.rows.forEach((row) => {
        hash = fnv1aHash(`${row.featureId}|${row.searchText}`, hash);
    });
    return [
        dataset.layerName,
        dataset.sourceType,
        dataset.geometryType,
        dataset.rows.length,
        hash.toString(16),
    ].join('|');
}

function buildFieldConfig(
    rows: AttrRow[],
    previousMap: Record<string, AttrFieldConfigItem> = {},
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
            type: (oldConfig?.type ||
                Object.entries(typeCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ||
                'string') as AttrFieldType,
            // 数据集重建时保留用户拖拽过的列宽
            ...(Number.isFinite(oldConfig?.width) ? { width: oldConfig?.width } : {}),
        };
    });

    return nextMap;
}

function buildLayerDataset(
    layer: any,
    previousSnapshot: AttrLayerDataset | null = null,
): AttrLayerDataset {
    const snapshot = normalizeLayerAttributeSnapshot(layer);
    const rows: AttrRow[] = (snapshot.rows || snapshot.records || []).map(
        (record: any, index: number) => {
            const properties =
                record?.properties && typeof record.properties === 'object'
                    ? { ...record.properties }
                    : {};
            const rawAttributes =
                record?.rawAttributes && typeof record.rawAttributes === 'object'
                    ? { ...record.rawAttributes }
                    : {};
            const statistics =
                record?.statistics && typeof record.statistics === 'object'
                    ? { ...record.statistics }
                    : {};

            return {
                id: String(record?.id || record?.featureId || toFeatureId(record, index)),
                featureId: String(record?.featureId || record?.id || toFeatureId(record, index)),
                layerId: String(record?.layerId || snapshot.layerId || layer?.id || ''),
                layerName: String(
                    record?.layerName || snapshot.layerName || layer?.name || '未命名图层',
                ),
                sourceType: String(
                    record?.sourceType || snapshot.sourceType || layer?.sourceType || 'upload',
                ),
                geometryType: String(
                    record?.geometryType || snapshot.geometryType || layer?.type || 'unknown',
                ),
                properties,
                rawAttributes,
                statistics,
                geometry: record?.geometry || null,
                // 统一归一到 4326，与地图视图范围（同样归一）可靠相交比较
                extent: normalizeExtentTo4326(
                    record?.extent || computeGeometryExtent(record?.geometry),
                ),
                searchText: String(
                    record?.searchText ||
                        stringifySearchText([
                            record?.featureId,
                            record?.geometryType,
                            record?.properties,
                            record?.rawAttributes,
                            record?.statistics,
                            snapshot.layerName,
                            layer?.name,
                        ]),
                ),
            };
        },
    );

    return {
        id: String(snapshot.id || layer?.id || ''),
        layerId: String(snapshot.layerId || layer?.id || ''),
        layerName: String(snapshot.layerName || layer?.name || '未命名图层'),
        sourceType: String(snapshot.sourceType || layer?.sourceType || 'upload'),
        geometryType: String(snapshot.geometryType || layer?.type || 'unknown'),
        metadata: { ...(snapshot.metadata || {}) },
        rows,
        fieldConfig: buildFieldConfig(
            rows,
            (previousSnapshot?.fieldConfig || snapshot.fieldConfig || {}) as Record<
                string,
                AttrFieldConfigItem
            >,
        ),
        statistics: { ...(snapshot.statistics || {}) },
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
        initialized: false,
    });

    const activeDataset = computed<AttrLayerDataset | null>(
        () => datasets.value[activeLayerId.value] || null,
    );
    const activeRows = computed<AttrRow[]>(() => activeDataset.value?.rows || []);
    const activeFields = computed<AttrFieldConfigItem[]>(() =>
        Object.values(activeDataset.value?.fieldConfig || {}),
    );
    const visibleFields = computed<AttrFieldConfigItem[]>(() =>
        activeFields.value.filter((item) => item.visible),
    );
    const numericFields = computed<AttrFieldConfigItem[]>(() =>
        activeFields.value.filter((item) => item.type === 'number'),
    );

    function matchesCurrentView(row: AttrRow): boolean {
        if (!filterByCurrentView.value || !currentMapExtent.value) return true;
        if (!row.extent) return true;
        return intersectsExtent(
            row.extent,
            currentMapExtent.value as [number, number, number, number],
        );
    }

    function matchesSearch(row: AttrRow): boolean {
        const query = String(searchQuery.value || '')
            .trim()
            .toLowerCase();
        if (!query) return true;
        return String(row.searchText || '').includes(query);
    }

    const filteredRows = computed<AttrRow[]>(() =>
        activeRows.value.filter((row) => matchesCurrentView(row) && matchesSearch(row)),
    );

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
                const leftBoolean =
                    String(leftValue).toLowerCase() === 'true' || leftValue === true ? 1 : 0;
                const rightBoolean =
                    String(rightValue).toLowerCase() === 'true' || rightValue === true ? 1 : 0;
                return (leftBoolean - rightBoolean) * direction;
            }

            return String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN') * direction;
        });
    });

    /** 各图层数据集的内容签名缓存（非响应式，仅用于增量同步比较）。 */
    const datasetSignatures: Record<string, string> = {};
    /** 各图层上游内容修订号缓存（来自 useManagedLayerRegistry 的 revision 契约）。 */
    const layerRevisions: Record<string, number> = {};

    function upsertDatasetSnapshot(layer: any): void {
        const layerId = String(layer?.id || '').trim();
        if (!layerId) return;

        const previous = datasets.value[layerId] || null;

        // 快路径：上游修订号契约——revision 未变则内容必未变，
        // 直接跳过整个快照构建（normalize + 行映射 + searchText 序列化）。
        const revisionRaw = (layer as { revision?: unknown })?.revision;
        const revisionNumber = Number(revisionRaw);
        const revision = Number.isFinite(revisionNumber) ? revisionNumber : null;
        if (previous && revision !== null && layerRevisions[layerId] === revision) {
            return;
        }

        // 慢路径（revision 变化或上游未提供 revision）：全量构建 + 内容签名兜底。
        // buildLayerDataset 内部已按字段 key 合并 previous.fieldConfig（保留别名/可见性/列宽）
        const snapshot = buildLayerDataset(layer, previous);
        const nextSignature = computeDatasetSignature(snapshot);
        if (revision !== null) {
            layerRevisions[layerId] = revision;
        }

        // 签名一致说明数据未实质变化，保留旧 dataset 引用，
        // 避免 rows 引用更替引发属性表全量重渲染与滚动/选中丢失。
        if (previous && datasetSignatures[layerId] === nextSignature) {
            return;
        }

        datasetSignatures[layerId] = nextSignature;
        datasets.value[layerId] = snapshot;
    }

    function syncLayers(layers: any[] = []): void {
        const incomingIds = new Set(
            (layers || [])
                .map((layer) => String(layer?.id || '').trim())
                .filter((id) => id.length > 0),
        );

        (layers || []).forEach((layer) => upsertDatasetSnapshot(layer));

        // 清理已删除图层的数据集、签名与修订号，避免属性表继续展示"幽灵图层"
        Object.keys(datasets.value).forEach((layerId) => {
            if (!incomingIds.has(layerId)) {
                delete datasets.value[layerId];
                delete datasetSignatures[layerId];
                delete layerRevisions[layerId];
            }
        });

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
            statistics: {},
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
        // 切换到不同图层时清除选中，避免旧图层的 featureId 残留误高亮新图层同名要素
        if (activeLayerId.value !== normalizedLayerId) {
            selectedFeatureId.value = '';
        }
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
        // 地图视图范围（OL 侧为 3857）与行范围统一归一到 4326 再参与相交比较
        currentMapExtent.value = normalizeExtentTo4326([
            normalized[0],
            normalized[1],
            normalized[2],
            normalized[3],
        ]);
    }

    function setFieldAlias(fieldKey: string, alias: string): void {
        const dataset = activeDataset.value;
        if (!dataset) return;
        if (!dataset.fieldConfig[fieldKey]) return;
        dataset.fieldConfig[fieldKey] = {
            ...dataset.fieldConfig[fieldKey],
            alias: String(alias || fieldKey),
        };
    }

    function setFieldVisibility(fieldKey: string, visibleFlag: boolean): void {
        const dataset = activeDataset.value;
        if (!dataset) return;
        if (!dataset.fieldConfig[fieldKey]) return;
        dataset.fieldConfig[fieldKey] = {
            ...dataset.fieldConfig[fieldKey],
            visible: !!visibleFlag,
        };
    }

    /** 设置列宽（表头拖拽），钳制在 80–600px；随字段配置在数据集生命周期内保留 */
    function setFieldWidth(fieldKey: string, width: number): void {
        const dataset = activeDataset.value;
        if (!dataset) return;
        if (!dataset.fieldConfig[fieldKey]) return;
        const clamped = Math.max(80, Math.min(600, Math.round(Number(width) || 0)));
        dataset.fieldConfig[fieldKey] = {
            ...dataset.fieldConfig[fieldKey],
            width: clamped,
        };
    }

    function setPanelRect(nextRect: Partial<PanelRect>): void {
        panelRect.value = {
            ...panelRect.value,
            ...nextRect,
            initialized: true,
        };
    }

    function resetPanelRectInitialized(): void {
        panelRect.value = {
            ...panelRect.value,
            initialized: false,
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
        setFieldWidth,
        setPanelRect,
        resetPanelRectInitialized,
    };
});
