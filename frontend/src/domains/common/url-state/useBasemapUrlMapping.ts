/**
 * 底图 URL 映射功能库
 * 负责底图索引与 ID 的互相转换。
 *
 * 导出：
 * - getLayerIdByIndex(index)
 * - getLayerIndexById(layerId)
 */

/**
 * 工厂函数 - 返回底图映射相关的导出函数
 * @param {Array<string>} urlLayerOptions - URL 图层索引映射数组
 * @returns {Object} 包含 getLayerIdByIndex、getLayerIndexById 的对象
 */
export function createBasemapUrlMappingFeature({
	urlLayerOptions = [] as string[],
}: {
	urlLayerOptions?: string[];
} = {}) {
    /**
     * 根据图层索引获取底图 ID
     * 在 URL 参数中使用图层索引而非 ID，提供更简洁的 URL 格式
     * @param {number} index - 图层索引
     * @returns {string|null} 底图 ID 或 null
     */
    function getLayerIdByIndex(index: any) {
        const normalizedIndex = Number(index);
        if (!Number.isInteger(normalizedIndex)) return null;
        if (normalizedIndex < 1 || normalizedIndex > urlLayerOptions.length) return null;
        return urlLayerOptions[normalizedIndex - 1] || null;
    }

    /**
     * 根据底图 ID 获取其在 URL 中的索引
     * 支持 URL 参数与底图配置解耦
     * @param {string} layerId - 底图 ID
     * @returns {number|null} 图层索引或 null
     */
    function getLayerIndexById(layerId: any) {
        const idx = urlLayerOptions.indexOf(String(layerId || ''));
        return idx >= 0 ? idx + 1 : null;
    }

    return {
        getLayerIdByIndex,
        getLayerIndexById,
    };
}
