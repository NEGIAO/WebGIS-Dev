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
        handleToggleGraticule,
        updateViewByParams,
        handleJumpToCoordinates,
        resetView,
    };
}
