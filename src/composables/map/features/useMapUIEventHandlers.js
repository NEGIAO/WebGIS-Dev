/**
 * 地图 UI 事件处理统一库（Phase 18）
 * 
 * 功能：
 * - UI 组件事件转发
 * - 简单的状态更新与属性表同步
 * 
 * 注：复杂的图层控制逻辑（handleLayerChange/OrderUpdate）保留在 MapContainer
 */

import { toLonLat } from 'ol/proj';

export function createMapUIEventHandlers({
    mapInstanceRef,
    attrStoreRef,
    emit,
    highlightManagedFeature,
    zoomToManagedFeature,
    toggleGraticule,
    showDynamicSplitLinesRef,
    selectedLayerRef,
    INITIAL_VIEW,
    flyToView,
    getLayerIndexById
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
        const attrStore = attrStoreRef?.value;
        
        if (!map || !attrStore) return;

        const size = map.getSize?.();
        if (!Array.isArray(size) || size.length < 2) return;

        const extent = map.getView()?.calculateExtent?.(size);
        attrStore.setMapExtent(Array.isArray(extent) ? extent : null);
    }

    /**
     * 属性表：聚焦要素
     */
    function handleAttributeTableFocusFeature(payload) {
        if (!payload?.layerId || !payload?.featureId) return;
        highlightManagedFeature?.(payload);
        zoomToManagedFeature?.(payload);
    }

    /**
     * 属性表：高亮要素
     */
    function handleAttributeTableHighlightFeature(payload) {
        if (!payload?.layerId || !payload?.featureId) return;
        highlightManagedFeature?.(payload);
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
            layerIndex: targetLayerIndex
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
            getLayerIndexById?.(selectedLayerRef?.value)
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
        resetView
    };
}
