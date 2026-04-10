/**
 * 托管要素序列化功能库
 * 负责要素 ID 管理与 GeoJSON 序列化转换
 * 
 * 导出：
 * - ensureFeatureId(feature, layerName, index)
 * - serializeManagedFeature(feature, layerName, index)
 * - serializeManagedFeatures(features, layerName)
 */

/**
 * 确保托管图层中的每个要素都有唯一 ID
 * 支持后续的查找、更新、样式应用等操作
 * @param {Feature} feature - OL Feature 实例
 * @param {string} layerName - 图层名称
 * @param {number} index - 要素在图层中的索引
 * @returns {string} 要素的唯一 ID
 */
function ensureFeatureId(feature, layerName, index) {
    const existingId = feature?.getId?.() || feature?.get?.('_gid') || feature?.get?.('id');
    const featureId = String(existingId || `${layerName || 'layer'}_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    if (typeof feature?.setId === 'function') {
        feature.setId(featureId);
    }
    if (typeof feature?.set === 'function') {
        feature.set('_gid', featureId);
    }
    return featureId;
}

/**
 * 将单个托管图层要素转换为 GeoJSON-like 对象
 * 便于存储在 userDataLayers 中，支持后续查找、更新、样式应用
 * @param {Feature} feature - OL Feature 实例
 * @param {string} layerName - 图层名称
 * @param {number} index - 要素在图层中的索引
 * @returns {Object} GeoJSON-like Feature 对象
 */
function serializeManagedFeature(feature, layerName, index) {
    const featureId = ensureFeatureId(feature, layerName, index);
    const geometry = feature?.getGeometry?.();
    const properties = { ...(feature?.getProperties?.() || {}) };
    delete properties.geometry;
    delete properties.style;

    const serializedGeometry = geometry
        ? {
            type: geometry.getType?.() || 'Geometry',
            coordinates: geometry.getCoordinates?.()
        }
        : null;

    properties._gid = featureId;

    return {
        type: 'Feature',
        id: featureId,
        _gid: featureId,
        properties,
        geometry: serializedGeometry
    };
}

/**
 * 将托管图层要素列表转换为 GeoJSON-like 对象列表
 * 便于批量存储在 userDataLayers 中
 * @param {Feature[]} features - OL Feature 实例数组
 * @param {string} layerName - 图层名称
 * @returns {Object[]} GeoJSON-like Feature 对象数组
 */
function serializeManagedFeatures(features = [], layerName = '') {
    return (features || []).map((feature, index) => serializeManagedFeature(feature, layerName, index));
}

/**
 * 工厂函数 - 返回所有序列化相关的导出函数
 * 保持与其他特性库的 API 一致性
 */
export function createManagedFeatureSerializationFeature() {
    return {
        ensureFeatureId,
        serializeManagedFeature,
        serializeManagedFeatures
    };
}
