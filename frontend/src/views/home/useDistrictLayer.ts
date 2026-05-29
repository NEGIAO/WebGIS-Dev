/**
 * 行政区图层管理逻辑
 * 处理行政区图层的聚焦、可见性、移除等操作
 */

/**
 * 创建行政区图层管理功能
 * @param {Object} deps - 依赖注入
 * @param {import('vue').Ref} deps.mapContainerRef - MapContainer 组件引用
 */
export function useDistrictLayer({ mapContainerRef }) {
    /**
     * 获取图层元数据
     * @param {string} layerId - 图层 ID
     * @returns {Object|null} 图层元数据
     */
    function getLayerMetaById(layerId) {
        return mapContainerRef.value?.getLayerMetaById?.(layerId) || null;
    }

    /**
     * 判断是否为行政区图层
     * @param {string} layerId - 图层 ID
     * @returns {boolean}
     */
    function isDistrictLayer(layerId) {
        const meta = getLayerMetaById(layerId);
        return meta?.sourceType === 'district-boundary';
    }

    /**
     * 获取行政区元数据
     * @param {string} layerId - 图层 ID
     * @returns {Object|null}
     */
    function getDistrictMeta(layerId) {
        return getLayerMetaById(layerId);
    }

    /**
     * 聚焦行政区图层
     * @param {string} layerId - 图层 ID
     */
    function focusDistrictLayer(layerId) {
        mapContainerRef.value?.focusDistrictByAdcode?.({
            adcode: layerId.replace('district-', ''),
        });
    }

    /**
     * 设置行政区图层可见性
     * @param {string} layerId - 图层 ID
     * @param {boolean} visible - 是否可见
     */
    function handleDistrictLayerVisibility(layerId, visible) {
        const adcode = layerId.replace('district-', '');
        mapContainerRef.value?.setDistrictLayerVisibility?.(adcode, visible);
    }

    /**
     * 移除行政区图层
     * @param {string} layerId - 图层 ID
     */
    function handleDistrictLayerRemove(layerId) {
        const adcode = layerId.replace('district-', '');
        mapContainerRef.value?.removeDistrictLayer?.(adcode);
    }

    /**
     * 同步行政区图层可见性
     * @param {string} layerId - 图层 ID
     */
    function syncDistrictLayerVisibility(layerId) {
        // 可以在这里添加同步逻辑
    }

    return {
        getLayerMetaById,
        isDistrictLayer,
        getDistrictMeta,
        focusDistrictLayer,
        handleDistrictLayerVisibility,
        handleDistrictLayerRemove,
        syncDistrictLayerVisibility,
    };
}
