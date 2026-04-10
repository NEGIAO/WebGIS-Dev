/**
 * useLayerMetadataNormalization.js
 * 
 * [作用] 提取图层元数据规范化及代表点坐标推断逻辑
 * [特点] 支持图层坐标系统规范化、缺失坐标智能推断、URL分享和地图定位等功能
 * [模式] Factory 函数，依赖注入必需的工具函数
 * 
 * 中文注释遵循原有约定，保持代码可读性。
 */

import { toLonLat } from 'ol/proj';
import { getCenter as getExtentCenter } from 'ol/extent';


/**
 * 创建图层元数据规范化特性工厂函数
 * 
 * @param {Object} options - 工厂选项 (当前版本无需外部依赖)
 * 
 * @returns {Object} 返回元数据处理功能对象
 * @returns {Function} returns.getFeatureRepresentativeLonLat - 获取单个要素的代表点坐标
 * @returns {Function} returns.inferLayerRepresentativeLonLat - 推断图层的代表点坐标
 * @returns {Function} returns.normalizeLayerMetadata - 规范化图层元数据
 */
export function createLayerMetadataNormalizationFeature() {

    /**
     * 获取单个要素的代表点坐标（经纬度）
     * 
     * 不论要素是点/线/面，都返回代表点：
     * - Point：直接返回该点
     * - LineString/Polygon：返回其范围的中心
     * 
     * @param {Feature} feature - OL Feature 对象
     * @returns {Array|null} [longitude, latitude] 或 null
     */
    function getFeatureRepresentativeLonLat(feature) {
        const geometry = feature?.getGeometry?.();
        if (!geometry) return null;

        const extent = geometry.getExtent?.();
        if (!extent || extent.some(v => !Number.isFinite(v))) return null;

        const centerCoord = geometry.getType?.() === 'Point'
            ? geometry.getCoordinates?.()
            : getExtentCenter(extent);

        if (!Array.isArray(centerCoord) || centerCoord.length < 2) return null;

        const [lon, lat] = toLonLat(centerCoord);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

        return [lon, lat];
    }

    /**
     * 推断图层的代表点坐标
     * 
     * 遍历图层要素，返回第一个有效的代表点坐标
     * 
     * @param {Array<Feature>} features - 要素数组
     * @returns {Array|null} [longitude, latitude] 或 null
     */
    function inferLayerRepresentativeLonLat(features = []) {
        for (const feature of features || []) {
            const pair = getFeatureRepresentativeLonLat(feature);
            if (pair) return pair;
        }
        return null;
    }

    /**
     * 规范化图层的元数据结构
     * 
     * 处理步骤：
     * 1. 规范化坐标系统（'wgs84' 或 'gcj02'）
     * 2. 如缺失经纬度，从要素中智能推断
     * 
     * @param {Object} metadata - 原始元数据
     * @param {Array<Feature>} features - 要素数组（用于推断缺失坐标）
     * @returns {Object} 规范化后的元数据
     */
    function normalizeLayerMetadata(metadata, features = []) {
        const nextMetadata = { ...(metadata || {}) };
        const normalizedCrs = String(nextMetadata.crs || 'wgs84').toLowerCase();
        nextMetadata.crs = normalizedCrs === 'gcj02' ? 'gcj02' : 'wgs84';

        if (!(Number.isFinite(nextMetadata.longitude) && Number.isFinite(nextMetadata.latitude))) {
            const pair = inferLayerRepresentativeLonLat(features);
            if (pair) {
                nextMetadata.longitude = Number(pair[0].toFixed(6));
                nextMetadata.latitude = Number(pair[1].toFixed(6));
            }
        }

        return nextMetadata;
    }

    return {
        getFeatureRepresentativeLonLat,
        inferLayerRepresentativeLonLat,
        normalizeLayerMetadata
    };
}
