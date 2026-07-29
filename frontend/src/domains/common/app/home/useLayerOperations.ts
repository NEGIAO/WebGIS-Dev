/**
 * 图层操作桥接逻辑
 * 将 HomeView 的图层操作事件转发到 MapContainer
 */

/**
 * 创建图层操作桥接功能
 * @param {Object} deps - 依赖注入
 * @param {import('vue').Ref} deps.mapContainerRef - MapContainer 组件引用
 * @param {Function} deps.emit - 事件发射函数
 */
export function useLayerOperations({ mapContainerRef, emit }) {
    /** 切换图层可见性 */
    function handleToggleLayerVisibility({ layerId, visible }) {
        mapContainerRef.value?.setUserLayerVisibility?.(layerId, visible);
    }

    /** 修改图层透明度 */
    function handleChangeLayerOpacity({ layerId, opacity }) {
        mapContainerRef.value?.setUserLayerOpacity?.(layerId, opacity);
    }

    /** 重命名图层 */
    function handleRenameLayer({ layerId, newName }) {
        mapContainerRef.value?.renameUserLayer?.(layerId, newName);
    }

    /** 设置底图 */
    function handleSetBaseLayer(layerId) {
        mapContainerRef.value?.setBaseLayer?.(layerId);
    }

    /** 切换底图可见性 */
    function handleToggleBaseLayerVisibility({ layerId, visible }) {
        mapContainerRef.value?.toggleBaseLayerVisibility?.(layerId, visible);
    }

    /** 缩放到图层 */
    function handleZoomLayer(layerId) {
        mapContainerRef.value?.zoomToLayer?.(layerId);
    }

    /** 查看图层 */
    function handleViewLayer(layerId) {
        mapContainerRef.value?.viewLayer?.(layerId);
    }

    /** 移除图层 */
    function handleRemoveLayer(layerId) {
        mapContainerRef.value?.removeUserLayer?.(layerId);
    }

    /** 重新排序图层 */
    function handleReorderUserLayers(payload) {
        mapContainerRef.value?.reorderUserLayers?.(payload);
    }

    /** 单独显示图层 */
    function handleSoloLayer(layerId) {
        mapContainerRef.value?.soloUserLayer?.(layerId);
    }

    /** 应用样式模板 */
    function handleApplyStyleTemplate(payload) {
        mapContainerRef.value?.applyStyleTemplate?.(payload);
    }

    /** 更新绘制样式 */
    function handleUpdateDrawStyle(styleConfig) {
        mapContainerRef.value?.setDrawStyle?.(styleConfig);
    }

    /** 更新图层样式 */
    function handleUpdateLayerStyle(payload) {
        mapContainerRef.value?.setUserLayerStyle?.(payload);
    }

    /** 高亮属性要素 */
    function handleHighlightAttributeFeature(payload) {
        mapContainerRef.value?.highlightManagedFeature?.(payload);
    }

    /** 缩放到属性要素 */
    function handleZoomAttributeFeature(payload) {
        mapContainerRef.value?.zoomToManagedFeature?.(payload);
    }

    /** 切换图层标注可见性 */
    function handleToggleLayerLabelVisibility(payload) {
        mapContainerRef.value?.toggleLayerLabelVisibility?.(payload);
    }

    /** 绘制坐标点 */
    function handleDrawPointByCoordinates(payload) {
        mapContainerRef.value?.drawPointByCoordinates?.(payload);
    }

    /** 绘制高德 AOI */
    function handleDrawAmapAoiFromJson(payload) {
        mapContainerRef.value?.drawAmapAoiFromJson?.(payload);
    }

    /** 切换图层 CRS */
    function handleToggleLayerCRS(payload) {
        mapContainerRef.value?.toggleLayerCRS?.(payload);
    }

    /** 导出图层数据 */
    function handleExportLayerData(payload) {
        mapContainerRef.value?.exportLayerCoordinates?.(payload);
    }

    /** 处理图层变更 */
    function handleUserLayersChange(layers) {
        emit('user-layers-change', layers);
    }

    /** 处理图形概览 */
    function handleGraphicsOverview(data) {
        emit('graphics-overview', data);
    }

    /** 处理底图变更 */
    function handleBaseLayersChange(layers) {
        emit('base-layers-change', layers);
    }

    return {
        handleToggleLayerVisibility,
        handleChangeLayerOpacity,
        handleRenameLayer,
        handleSetBaseLayer,
        handleToggleBaseLayerVisibility,
        handleZoomLayer,
        handleViewLayer,
        handleRemoveLayer,
        handleReorderUserLayers,
        handleSoloLayer,
        handleApplyStyleTemplate,
        handleUpdateDrawStyle,
        handleUpdateLayerStyle,
        handleHighlightAttributeFeature,
        handleZoomAttributeFeature,
        handleToggleLayerLabelVisibility,
        handleDrawPointByCoordinates,
        handleDrawAmapAoiFromJson,
        handleToggleLayerCRS,
        handleExportLayerData,
        handleUserLayersChange,
        handleGraphicsOverview,
        handleBaseLayersChange,
    };
}
