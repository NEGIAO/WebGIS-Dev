/**
 * useManagedFeatureOperations.js
 * 
 * [作用] 提取托管图层要素搜索和缩放操作
 * [特点] 支持要素查找、定位缩放、高亮显示等交互操作
 * [模式] Factory 函数，依赖注入地图实例和交互方法
 * 
 * 中文注释遵循原有约定，保持代码可读性。
 */


/**
 * 创建托管要素操作特性工厂函数
 * 
 * @param {Object} options - 工厂选项
 * @param {Ref} options.mapInstanceRef - OpenLayers Map 实例引用
 * @param {Array} options.userDataLayers - 用户数据图层数组
 * @param {Function} options.getCurrentHighlightedFeature - 获取当前高亮要素方法
 * @param {Function} options.setCurrentHighlightedFeature - 设置当前高亮要素方法
 * @param {Function} options.clearManagedFeatureHighlight - 清除要素高亮方法
 * @param {Function} options.createManagedFeatureHighlightStyle - 创建高亮样式方法
 * 
 * @returns {Object} 返回要素操作功能对象
 */
export function createManagedFeatureOperationsFeature({
    mapInstanceRef,
    userDataLayers,
    getCurrentHighlightedFeature,
    setCurrentHighlightedFeature,
    clearManagedFeatureHighlight,
    createManagedFeatureHighlightStyle
}) {

    /**
     * 根据图层 ID 和要素 ID 查找托管图层中的要素实例
     * 
     * 支持通过要素 ID 或 _gid 属性查找，返回 OL Feature 实例。
     * 用于后续的样式应用、高亮处理等操作。
     * 
     * @param {string} layerId - 托管图层 ID
     * @param {string} featureId - 要素 ID
     * @returns {Feature|null} OL Feature 实例或 null
     */
    function findManagedFeature(layerId, featureId) {
        const target = userDataLayers.find(item => item.id === layerId);
        if (!target) return null;
        const source = target.layer?.getSource?.();
        const normalizedId = String(featureId || '');
        const sourceFeature = source?.getFeatureById?.(normalizedId)
            || source?.getFeatures?.()?.find((feature) => String(feature?.getId?.() || feature?.get?.('_gid') || '') === normalizedId);
        return sourceFeature || null;
    }

    /**
     * 定位并高亮显示指定的托管要素
     * 
     * 步骤：
     * 1. 查找要素
     * 2. 计算要素范围
     * 3. 地图缩放至该范围
     * 4. 清除其他高亮，高亮该要素
     * 
     * @param {Object} options - 操作选项
     * @param {string} options.layerId - 托管图层 ID
     * @param {string} options.featureId - 要素 ID
     */
    function zoomToManagedFeature({ layerId, featureId }) {
        if (!mapInstanceRef.value) return;
        const feature = findManagedFeature(layerId, featureId);
        if (!feature) return;
        const geometry = feature.getGeometry?.();
        const extent = geometry?.getExtent?.();
        if (!extent || extent.some(v => !Number.isFinite(v))) return;
        mapInstanceRef.value.getView().fit(extent, {
            padding: [80, 80, 80, 80],
            duration: 800,
            maxZoom: 18
        });
        clearManagedFeatureHighlight(getCurrentHighlightedFeature());
        setCurrentHighlightedFeature(feature);
        feature.setStyle(createManagedFeatureHighlightStyle(feature));
    }

    return {
        findManagedFeature,
        zoomToManagedFeature
    };
}
