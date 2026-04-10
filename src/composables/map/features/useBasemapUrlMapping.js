/**
 * 底图URL映射功能库
 * 负责底图索引与ID的互相转换、分类与分组信息查询
 * 
 * 导出：
 * - getLayerIdByIndex(index)
 * - getLayerIndexById(layerId)
 * - getLayerCategory(layerId)
 * - getLayerGroup(layerId)
 */

/**
 * 工厂函数 - 返回底图映射相关的导出函数
 * @param {Array<string>} urlLayerOptions - URL 图层索引映射数组
 * @param {Function} getLayerCategoryById - 获取底图分类的函数
 * @param {Function} getLayerGroupById - 获取底图分组的函数
 * @returns {Object} 包含 getLayerIdByIndex、getLayerIndexById、getLayerCategory、getLayerGroup 的对象
 */
export function createBasemapUrlMappingFeature({
    urlLayerOptions = [],
    getLayerCategoryById = () => null,
    getLayerGroupById = () => null
}) {
    /**
     * 根据图层索引获取底图 ID
     * 在 URL 参数中使用图层索引而非 ID，提供更简洁的 URL 格式
     * @param {number} index - 图层索引
     * @returns {string|null} 底图 ID 或 null
     */
    function getLayerIdByIndex(index) {
        const normalizedIndex = Number(index);
        if (!Number.isInteger(normalizedIndex)) return null;
        if (normalizedIndex < 0 || normalizedIndex >= urlLayerOptions.length) return null;
        return urlLayerOptions[normalizedIndex] || null;
    }

    /**
     * 根据底图 ID 获取其在 URL 中的索引
     * 支持 URL 参数与底图配置解耦
     * @param {string} layerId - 底图 ID
     * @returns {number|null} 图层索引或 null
     */
    function getLayerIndexById(layerId) {
        const idx = urlLayerOptions.indexOf(String(layerId || ''));
        return idx >= 0 ? idx : null;
    }

    /**
     * 根据底图 ID 判断图层属于底图还是覆盖层
     * @param {string} layerId - 底图 ID
     * @returns {string} 底图分类（如：'basemap', 'overlay' 等）
     */
    function getLayerCategory(layerId) {
        return getLayerCategoryById(layerId);
    }

    /**
     * 为底图面板提供分组标签（影像/矢量/专题/注记）
     * @param {string} layerId - 底图 ID
     * @returns {string} 底图分组名称
     */
    function getLayerGroup(layerId) {
        return getLayerGroupById(layerId);
    }

    return {
        getLayerIdByIndex,
        getLayerIndexById,
        getLayerCategory,
        getLayerGroup
    };
}
