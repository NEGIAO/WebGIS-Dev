import { transformExtent } from 'ol/proj';

/**
 * 地图 UI 事件处理统一库（Phase 18）
 *
 * 功能：
 * - UI 组件事件转发
 * - 简单的状态更新与属性表同步
 *
 * 注：复杂的图层控制逻辑（handleLayerChange/OrderUpdate）保留在 MapContainer
 */


export function createMapUIEventHandlers({
    mapInstanceRef,
    attrStoreRef,
    emit,
    highlightManagedFeature,
    batchHighlightManagedFeatures,
    clearManagedFeatureHighlight,
    getCurrentHighlightedFeature,
    setCurrentHighlightedFeature,
    zoomToManagedFeature,
    findManagedFeature,
    getUserDataLayers,
    toggleGraticule,
    showDynamicSplitLinesRef,
    selectedLayerRef,
    INITIAL_VIEW,
    flyToView,
    getLayerIndexById,
}) {
    /**
     * 彩蛋：图片开启
     */
    function handleEasterEggImageOpen(src) {
        emit?.('update-news-image', src);
    }

    /**
     * 彩蛋：位置变化
     */
    function handleEasterEggLocationChange(payload) {
        emit?.('location-change', payload);
    }

    /**
     * 同步属性表地图范围
     */
    function syncAttributeTableMapExtent() {
        const map = mapInstanceRef?.value;
        // 兼容 ref 包装与 Pinia store 直传两种注入形态：此前仅解 .value，
        // MapContainer 直传 store 实例时恒为 undefined → extent 同步静默失效，
        // 2D「视图筛选范围」勾选与 moveend 两条同步路径实际全部空转。
        const attrStore = attrStoreRef?.value ?? attrStoreRef;

        if (!map || !attrStore) return;

        const size = map.getSize?.();
        if (!Array.isArray(size) || size.length < 2) return;

        const extent = map.getView()?.calculateExtent?.(size);
        attrStore.setMapExtent(Array.isArray(extent) ? extent : null);
    }

    /**
     * 属性表：聚焦要素
     * 支持 mode 透传：默认 'replace'；Ctrl+点击 'toggle'；Shift+点击 'range'
     * B3：range 时 payload.featureIds 携带表格展示顺序的连续区间 ID 列表 →
     *     批量追加高亮（append 与 featureStyleStore range「保留旧高亮，只追加区间」契约一致）
     * 注：参数 zoomToManagedFeature 仍由外部传入以兼容调用方契约，
     *     但聚焦事件默认不触发缩放（避免与属性表点击冲突）。
     */
    function handleAttributeTableFocusFeature(payload) {
        if (!payload?.layerId || !payload?.featureId) return;

        // ── 在线服务属性表（数据集 id 前缀 rsvc-attr:）：无托管要素，
        //    双击按行自带范围（EPSG:4326）定位视图 ──
        if (String(payload.layerId).startsWith('rsvc-attr:')) {
            const store = attrStoreRef?.value ?? attrStoreRef;
            const row = store?.datasets?.[payload.layerId]?.rows?.find(
                (item) => String(item.featureId) === String(payload.featureId),
            );
            const map = mapInstanceRef?.value;
            if (!row?.extent || !map?.getView) return;
            const view = map.getView();
            let targetExtent;
            try {
                targetExtent = transformExtent(row.extent, 'EPSG:4326', view.getProjection());
            } catch {
                return;
            }
            if (!targetExtent.every(Number.isFinite)) return;
            view.fit(targetExtent, {
                size: map.getSize?.(),
                padding: [80, 80, 80, 80],
                maxZoom: 19,
                duration: 600,
            });
            return;
        }

        const mode = payload?.mode || 'replace';
        if (mode === 'range' && Array.isArray(payload?.featureIds) && payload.featureIds.length) {
            batchHighlightManagedFeatures?.({
                layerId: payload.layerId,
                featureIds: payload.featureIds,
                mode: 'append',
            });
        } else {
            highlightManagedFeature?.({ ...payload, mode });
        }
        // 属性表双击行请求缩放（payload.zoom=true）时才触发视图 fit，
        // 单击聚焦保持不缩放，避免与表格浏览操作冲突。
        if (payload?.zoom) {
            zoomToManagedFeature?.({ layerId: payload.layerId, featureId: payload.featureId });
        }
    }

    /**
     * 属性表：单元格编辑提交 → 写回 OL 要素属性并 bump revision 触发表格刷新
     *
     * 双数据源同步：userDataLayers[].features 是 serializeManagedFeatures 生成的
     * GeoJSON-like 副本（属性表快照的唯一数据源），只改 OL Feature 实例不改这份副本，
     * revision bump 后快照会用旧值把表格改回去——表现为"编辑没有生效"。
     */
    function handleAttributeTableCellEdit(payload) {
        if (!payload?.layerId || !payload?.featureId || !payload?.field) return;
        const feature = findManagedFeature?.(payload.layerId, payload.featureId);
        if (feature) {
            feature.setProperties({ [payload.field]: payload.value });
        }

        // 同步注册表中的序列化要素副本
        const layerRec = (getUserDataLayers?.() || []).find((l) => l?.id === payload.layerId);
        const serialized = (layerRec?.features || []).find(
            (item) => String(item?.id || item?._gid || '') === String(payload.featureId),
        );
        if (serialized) {
            serialized.properties = {
                ...(serialized.properties || {}),
                [payload.field]: payload.value,
            };
        }

        if (!feature && !serialized) {
            console.warn('[AttrTable] edit target feature not found:', payload.featureId);
            return;
        }
        bumpLayerRevision(payload.layerId);
    }

    /**
     * 属性表：删除要素 → 从托管源移除并同步图层树/属性表
     *
     * 与编辑同理需双数据源同步：仅从 OL source 移除而保留 userDataLayers[].features
     * 副本的话，revision bump 后快照重建会让被删行在表格中"复活"。
     */
    function handleAttributeTableDeleteFeature(payload) {
        if (!payload?.layerId || !payload?.featureId) return;
        const feature = findManagedFeature?.(payload.layerId, payload.featureId);
        const layerRec = (getUserDataLayers?.() || []).find((l) => l?.id === payload.layerId);
        const source = layerRec?.layer?.getSource?.();
        if (feature && source?.hasFeature?.(feature)) {
            source.removeFeature(feature);
        } else {
            feature?.dispose?.();
        }
        // 同步移除注册表中的序列化副本
        if (Array.isArray(layerRec?.features)) {
            layerRec.features = layerRec.features.filter(
                (item) => String(item?.id || item?._gid || '') !== String(payload.featureId),
            );
            layerRec.featureCount = layerRec.features.length;
        }
        bumpLayerRevision(payload.layerId);
        const attrStore = attrStoreRef?.value ?? attrStoreRef;
        if (String(attrStore?.selectedFeatureId || '') === String(payload.featureId)) {
            attrStore.setSelectedFeature?.('');
        }
    }

    /** 内部：递增图层修订号并触发属性表快照重建 */
    function bumpLayerRevision(layerId) {
        const rec = (getUserDataLayers?.() || []).find((l) => l?.id === layerId);
        if (!rec) return;
        rec.revision = (Number(rec.revision) || 0) + 1;
        const attrStore = attrStoreRef?.value ?? attrStoreRef;
        attrStore?.syncLayers?.(getUserDataLayers?.() || []);
    }

    /**
     * 属性表：高亮要素（featureId 为 null 时清除高亮）
     * 支持 mode 透传：默认 'replace'；Ctrl+鼠标悬停切换；Shift+鼠标悬停区间
     */
    function handleAttributeTableHighlightFeature(payload) {
        if (!payload?.layerId) return;
        if (!payload.featureId) {
            // 清除当前高亮并重置引用
            const current = getCurrentHighlightedFeature?.();
            if (current) {
                clearManagedFeatureHighlight?.(current);
                setCurrentHighlightedFeature?.(null);
            }
            return;
        }
        const mode = payload?.mode || 'replace';
        highlightManagedFeature?.({ ...payload, mode });
    }

    /**
     * 经纬网开关
     */
    function handleToggleGraticule() {
        if (showDynamicSplitLinesRef) {
            showDynamicSplitLinesRef.value = toggleGraticule?.() ?? !showDynamicSplitLinesRef.value;
        }
    }

    /**
     * 视图更新：通过经纬度、缩放级别和图层索引
     */
    function updateViewByParams(lng, lat, z, layer) {
        const nextLng = Number(lng);
        const nextLat = Number(lat);
        if (!Number.isFinite(nextLng) || !Number.isFinite(nextLat)) return;

        const map = mapInstanceRef?.value;
        const currentMapZoom = Number(map?.getView?.()?.getZoom?.() ?? INITIAL_VIEW?.zoom ?? 17);
        const targetZoomRaw = Number(z);
        const targetZoom = Number.isFinite(targetZoomRaw) ? targetZoomRaw : currentMapZoom;

        const targetLayerRaw = Number(layer);
        const targetLayerIndex = Number.isInteger(targetLayerRaw)
            ? targetLayerRaw
            : getLayerIndexById?.(selectedLayerRef?.value);

        flyToView?.({
            lng: nextLng,
            lat: nextLat,
            zoom: targetZoom,
            layerIndex: targetLayerIndex,
        });

        emit?.('location-change', { lon: nextLng, lat: nextLat, source: 'view-param-update' });
        emit?.('coordinate-jump', { lng: nextLng, lat: nextLat });
    }

    /**
     * 坐标跳转
     */
    function handleJumpToCoordinates({ lng, lat }) {
        const map = mapInstanceRef?.value;
        const currentMapZoom = Number(map?.getView?.()?.getZoom?.() ?? INITIAL_VIEW?.zoom ?? 17);
        const nextZoom = Math.max(currentMapZoom, 12);

        updateViewByParams(lng, lat, nextZoom, getLayerIndexById?.(selectedLayerRef?.value));
    }

    /**
     * 复位视图到初始状态
     */
    function resetView() {
        const initialCenter = INITIAL_VIEW?.center || [114.302, 34.8146];
        const initialZoom = INITIAL_VIEW?.zoom || 17;
        updateViewByParams(
            initialCenter[0],
            initialCenter[1],
            initialZoom,
            getLayerIndexById?.(selectedLayerRef?.value),
        );
    }

    return {
        handleEasterEggImageOpen,
        handleEasterEggLocationChange,
        syncAttributeTableMapExtent,
        handleAttributeTableFocusFeature,
        handleAttributeTableHighlightFeature,
        handleAttributeTableCellEdit,
        handleAttributeTableDeleteFeature,
        handleToggleGraticule,
        updateViewByParams,
        handleJumpToCoordinates,
        resetView,
    };
}
