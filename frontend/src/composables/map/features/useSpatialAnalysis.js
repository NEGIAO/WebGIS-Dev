/**
 * 空间分析功能（后端 Shapely 实现）
 * 前端负责序列化要素、调用后端 API、解析结果并渲染图层
 *
 * 导出：
 * - createSpatialAnalysisFeature()
 */

import GeoJSON from 'ol/format/GeoJSON';
import { apiSpatialAnalysis } from '../../../api/backend';

/**
 * 工厂函数 - 返回空间分析相关的导出函数
 * @param {Object} options 配置选项
 * @param {Object} options.mapInstanceRef - 地图实例 ref
 * @param {Function} options.createManagedVectorLayer - 创建托管矢量图层函数
 * @param {Function} options.emitGraphicsOverview - 发出图形概览事件
 * @param {Function} options.emitUserLayersChange - 发出用户图层变化事件
 * @param {Function} options.refreshUserLayerZIndex - 刷新图层 z-index
 * @param {Array} options.userDataLayers - 用户数据图层数组
 * @param {Object} options.message - 消息通知对象
 * @returns {Object} 包含空间分析函数的对象
 */
export function createSpatialAnalysisFeature({
    // eslint-disable-next-line no-unused-vars -- 保持接口兼容
    mapInstanceRef = { value: null },
    createManagedVectorLayer = () => null,
    emitGraphicsOverview = () => {},
    emitUserLayersChange = () => {},
    // eslint-disable-next-line no-unused-vars -- 保持接口兼容
    refreshUserLayerZIndex = () => {},
    userDataLayers = [],
    message = { info: () => {}, success: () => {}, warning: () => {}, error: () => {} },
}) {
    const gjFormat = new GeoJSON();
    let analysisSeed = 1;

    /**
     * 获取指定图层的所有 OL Feature（EPSG:3857）
     * @param {string} layerId - 图层 ID
     * @returns {Array} OL Feature 数组
     */
    function getLayerFeatures(layerId) {
        const record = userDataLayers.find((item) => item.id === layerId);
        if (!record || !record.layer) return [];
        const source = record.layer.getSource();
        return source ? source.getFeatures() : [];
    }

    /**
     * 将 OL Feature 数组序列化为 GeoJSON FeatureCollection（EPSG:4326）
     * @param {Array} olFeatures - OL Feature 数组（EPSG:3857）
     * @returns {Object} GeoJSON FeatureCollection
     */
    function featuresToGeoJSON(olFeatures) {
        if (!olFeatures || !olFeatures.length) {
            return { type: 'FeatureCollection', features: [] };
        }
        return gjFormat.writeFeaturesObject(olFeatures, {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326',
        });
    }

    /**
     * 将 GeoJSON FeatureCollection（EPSG:4326）解析为 OL Feature 数组（EPSG:3857）
     * @param {Object} geojson - GeoJSON FeatureCollection
     * @returns {Array} OL Feature 数组
     */
    function geoJSONToFeatures(geojson) {
        if (!geojson || !geojson.features || !geojson.features.length) {
            return [];
        }
        return gjFormat.readFeatures(geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
        });
    }

    /**
     * 执行空间分析（调用后端 API）
     * @param {Object} params - 分析参数
     * @param {string} params.type - 分析类型：buffer/overlay/convexHull
     * @param {string} [params.targetLayerId] - 目标图层 ID（buffer/convexHull 使用）
     * @param {number} [params.radius] - 缓冲半径（米）（buffer 使用）
     * @param {string} [params.operation] - 叠加操作：intersection/union/difference（overlay 使用）
     * @param {string} [params.layerA] - 图层 A ID（overlay 使用）
     * @param {string} [params.layerB] - 图层 B ID（overlay 使用）
     */
    async function runSpatialAnalysis(params = {}) {
        const { type } = params;

        if (!type) {
            message.warning('未指定分析类型');
            return;
        }

        let operation;
        let layerName = '';
        let featuresA = [];
        let featuresB = [];

        try {
            if (type === 'buffer') {
                const { targetLayerId, radius = 1000 } = params;
                if (!targetLayerId) {
                    message.warning('请选择目标图层');
                    return;
                }
                featuresA = getLayerFeatures(targetLayerId);
                if (!featuresA.length) {
                    message.warning('目标图层无要素');
                    return;
                }
                operation = 'buffer';
                layerName = `缓冲区_${radius}m_${analysisSeed++}`;
            } else if (type === 'overlay') {
                const { operation: op, layerA, layerB } = params;
                if (!layerA || !layerB) {
                    message.warning('请选择两个图层');
                    return;
                }
                if (layerA === layerB) {
                    message.warning('图层 A 和图层 B 不能相同');
                    return;
                }
                featuresA = getLayerFeatures(layerA);
                featuresB = getLayerFeatures(layerB);
                if (!featuresA.length || !featuresB.length) {
                    message.warning('所选图层无要素');
                    return;
                }
                operation = op;
                const opLabel = { intersection: '交集', union: '并集', difference: '差集' };
                layerName = `${opLabel[op] || op}分析_${analysisSeed++}`;
            } else if (type === 'convexHull') {
                const { targetLayerId } = params;
                if (!targetLayerId) {
                    message.warning('请选择目标图层');
                    return;
                }
                featuresA = getLayerFeatures(targetLayerId);
                if (!featuresA.length) {
                    message.warning('目标图层无要素');
                    return;
                }
                operation = 'convexHull';
                layerName = `凸包分析_${analysisSeed++}`;
            } else {
                message.warning(`不支持的分析类型：${type}`);
                return;
            }

            // 序列化要素为 GeoJSON（EPSG:4326）
            const geojsonA = featuresToGeoJSON(featuresA);
            const geojsonB = featuresB.length ? featuresToGeoJSON(featuresB) : undefined;

            // 调用后端 API
            const payload = {
                operation,
                features_a: geojsonA,
            };
            if (type === 'buffer') {
                payload.radius = params.radius || 1000;
            }
            if (geojsonB) {
                payload.features_b = geojsonB;
            }

            message.info('正在执行空间分析...');
            // 后端响应拦截器已解包：返回值即为 data.data（GeoJSON FeatureCollection）
            const resultGeoJSON = await apiSpatialAnalysis(payload);

            if (!resultGeoJSON || !resultGeoJSON.features || !resultGeoJSON.features.length) {
                message.warning('分析未产生结果要素');
                return;
            }

            // 将 GeoJSON 结果转回 OL Feature（EPSG:3857）
            const resultFeatures = geoJSONToFeatures(resultGeoJSON);
            if (!resultFeatures.length) {
                message.warning('结果要素解析失败');
                return;
            }

            // 创建结果图层（sourceType 用 'upload' 以匹配 TOC 分类规则）
            createManagedVectorLayer({
                name: layerName,
                type: resultFeatures[0]?.getGeometry?.()?.getType?.() || 'Polygon',
                sourceType: 'upload',
                features: resultFeatures,
                fitView: true,
            });

            emitGraphicsOverview();
            emitUserLayersChange();
            message.success(`${layerName} 完成，共 ${resultFeatures.length} 个要素`);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            const errMsg = detail || error?.message || '空间分析请求失败';
            console.error('[SpatialAnalysis] Error:', error);
            message.error(`空间分析失败：${errMsg}`);
        }
    }

    return {
        runSpatialAnalysis,
    };
}
