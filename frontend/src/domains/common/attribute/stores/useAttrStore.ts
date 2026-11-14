import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { AttrFieldConfigItem, AttrLayerDataset, AttrRow, PanelRect, buildLayerDataset, computeDatasetSignature, intersectsExtent, normalizeExtentTo4326 } from './attrStoreHelpers';




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
        // 在写回缓存前先记录"revision 是否实际变化"，供下方签名守卫分流
        const revisionChanged = revision !== null && layerRevisions[layerId] !== revision;

        // 慢路径（revision 变化或上游未提供 revision）：全量构建 + 内容签名兜底。
        // buildLayerDataset 内部已按字段 key 合并 previous.fieldConfig（保留别名/可见性/列宽）
        const snapshot = buildLayerDataset(layer, previous);
        const nextSignature = computeDatasetSignature(snapshot);
        if (revision !== null) {
            layerRevisions[layerId] = revision;
        }

        // 签名守卫仅服务于"无 revision 契约"的来源：签名不含几何，
        // 仅编辑形状（属性/行数不变）时签名相同但 extent 已变——revision 已变化时
        // 必须以上游契约为准强制替换，否则视图筛选会使用过期范围（B2 修复）。
        if (!revisionChanged && previous && datasetSignatures[layerId] === nextSignature) {
            return;
        }

        datasetSignatures[layerId] = nextSignature;
        datasets.value[layerId] = snapshot;
    }

    /**
     * 外部注入的数据集 id（三维实体 / 在线服务查询）。
     *
     * `syncLayers` 的「幽灵图层」清理以 userLayers 为准，而这些数据集的 id 永远
     * 不会出现在 userLayers 里——不豁免的话，任意一次图层广播都会把正在查看的
     * 三维属性表删掉（表现为「表突然变空」）。
     */
    const externalDatasetIds = new Set<string>();

    /**
     * 注入由引擎侧构建好的数据集（不参与 userLayers 同步）。
     * @param dataset 需已符合 AttrLayerDataset 形状
     */
    function setExternalDataset(dataset: AttrLayerDataset): void {
        const id = String(dataset?.id || '').trim();
        if (!id) return;
        externalDatasetIds.add(id);
        datasets.value[id] = dataset;
    }

    /** 移除外部数据集（图层被删 / 容器卸载时调用，避免残留可打开的幽灵表） */
    function dropExternalDataset(id: string): void {
        const key = String(id || '').trim();
        if (!key) return;
        externalDatasetIds.delete(key);
        delete datasets.value[key];
        if (activeLayerId.value === key) {
            activeLayerId.value = '';
            selectedFeatureId.value = '';
            visible.value = false;
        }
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
            if (externalDatasetIds.has(layerId)) return;
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
        // 地图视图范围与行范围统一归一到 4326 再参与相交比较：
        // 2D（OL）传 3857 米制经归一转换；3D（Cesium 视域）直传 4326 度值原样放行
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
        setExternalDataset,
        dropExternalDataset,
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

// 对外类型契约保持不变（AttributeTable.vue 经 @/stores 引用 AttrRow 等）
export type { AttrFieldConfigItem, AttrRow } from './attrStoreHelpers';
