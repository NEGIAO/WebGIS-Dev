/**
 * 空间分析功能（后端 Shapely 实现）
 * 前端负责序列化要素、调用后端 API、解析结果并渲染图层
 *
 * 导出：
 * - createSpatialAnalysisFeature()
 */

import GeoJSON from 'ol/format/GeoJSON';
import { toLonLat } from 'ol/proj';
import { apiSpatialAnalysis } from '../../../api/backend';

/**
 * 工厂函数 - 返回空间分析相关的导出函数
 * @param {Object} options 配置选项
 * @param {Object} options._mapInstanceRef - 地图实例 ref
 * @param {Function} options.createManagedVectorLayer - 创建托管矢量图层函数
 * @param {Function} options.emitGraphicsOverview - 发出图形概览事件
 * @param {Function} options.emitUserLayersChange - 发出用户图层变化事件
 * @param {Function} options._refreshUserLayerZIndex - 刷新图层 z-index
 * @param {Array} options.userDataLayers - 用户数据图层数组
 * @param {Object} options.message - 消息通知对象
 * @returns {Object} 包含空间分析函数的对象
 */
export function createSpatialAnalysisFeature({
     
    _mapInstanceRef = { value: null },
    createManagedVectorLayer = () => null,
    emitGraphicsOverview = () => {},
    emitUserLayersChange = () => {},
     
    _refreshUserLayerZIndex = () => {},
    userDataLayers = [],
    message = { info: () => {}, success: () => {}, warning: () => {}, error: () => {} },
}) {
    const gjFormat = new GeoJSON();
    let analysisSeed = 1;

    /**
     * 将米近似转换为度（基于参考纬度）
     * @param {number} meters - 距离（米）
     * @param {number} refLat - 参考纬度（度）
     * @returns {number} 距离（度）
     */
    function metersToDegrees(meters, refLat) {
        const latRad = (refLat * Math.PI) / 180;
        const metersPerDegreeLat = 111320;
        const metersPerDegreeLon = 111320 * Math.cos(latRad);
        const metersPerDegree = (metersPerDegreeLat + metersPerDegreeLon) / 2;
        return meters / metersPerDegree;
    }

    /**
     * 从 OL Feature 数组中获取参考纬度（质心纬度）
     * @param {Array} olFeatures - OL Feature 数组
     * @returns {number} 参考纬度（度），默认 35
     */
    function getReferenceLat(olFeatures) {
        for (const feat of olFeatures) {
            const geom = feat.getGeometry();
            if (geom) {
                const extent = geom.getExtent();
                // extent: [minX, minY, maxX, maxY] in EPSG:3857
                // 取中心 Y 转为 WGS84 纬度
                const centerY3857 = (extent[1] + extent[3]) / 2;
                const [, lat] = toLonLat([0, centerY3857]);
                return lat;
            }
        }
        return 35; // 默认中纬度
    }

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
     * @param {string} params.type - 分析类型：buffer/overlay/convexHull/voronoi/aggregation/multiRingBuffer/simplify
     * @param {string} [params.targetLayerId] - 目标图层 ID
     * @param {number} [params.radius] - 缓冲半径（米）（buffer 使用）
     * @param {string} [params.operation] - 叠加操作：intersection/union/difference（overlay 使用）
     * @param {string} [params.layerA] - 图层 A ID（overlay 使用）
     * @param {string} [params.layerB] - 图层 B ID（overlay 使用）
     * @param {number[]} [params.distances] - 多环缓冲区距离数组（米）
     * @param {number} [params.tolerance] - 几何简化容差（度）
     * @param {number[]} [params.bbox] - 可视范围 [minLon, minLat, maxLon, maxLat]
     * @param {string} [params.gridType] - 网格类型：grid/hexbin
     * @param {number} [params._gridSize] - 网格大小（度）
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
            } else if (type === 'voronoi') {
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
                if (featuresA.length < 2) {
                    message.warning('泰森多边形分析至少需要 2 个点要素');
                    return;
                }
                operation = 'voronoi';
                layerName = `泰森多边形_${analysisSeed++}`;
            } else if (type === 'aggregation') {
                const { targetLayerId, bbox, gridType = 'grid', _gridSize = 0.01 } = params;
                if (!targetLayerId) {
                    message.warning('请选择目标图层');
                    return;
                }
                if (!bbox || bbox.length !== 4) {
                    message.warning('请先框选可视范围或手动输入 BBox');
                    return;
                }
                featuresA = getLayerFeatures(targetLayerId);
                if (!featuresA.length) {
                    message.warning('目标图层无要素');
                    return;
                }
                operation = 'aggregation';
                const gridLabel = gridType === 'hexbin' ? '六边形' : '方格';
                layerName = `${gridLabel}聚合_${analysisSeed++}`;
            } else if (type === 'multiRingBuffer') {
                const { targetLayerId, distances } = params;
                if (!targetLayerId) {
                    message.warning('请选择目标图层');
                    return;
                }
                if (!distances || !distances.length) {
                    message.warning('请输入至少一个缓冲距离');
                    return;
                }
                featuresA = getLayerFeatures(targetLayerId);
                if (!featuresA.length) {
                    message.warning('目标图层无要素');
                    return;
                }
                operation = 'multiRingBuffer';
                layerName = `多环缓冲区_${analysisSeed++}`;
            } else if (type === 'simplify') {
                const { targetLayerId, tolerance } = params;
                if (!targetLayerId) {
                    message.warning('请选择目标图层');
                    return;
                }
                if (!tolerance || tolerance <= 0) {
                    message.warning('请输入有效的简化容差');
                    return;
                }
                featuresA = getLayerFeatures(targetLayerId);
                if (!featuresA.length) {
                    message.warning('目标图层无要素');
                    return;
                }
                operation = 'simplify';
                layerName = `几何简化_${analysisSeed++}`;
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
            // 高级分析参数
            if (type === 'multiRingBuffer' && params.distances) {
                payload.distances = params.distances;
            }
            if (type === 'simplify' && params.tolerance) {
                // 前端传入的容差单位为米，需转换为度供后端 Shapely 使用
                const refLat = getReferenceLat(featuresA);
                payload.tolerance = metersToDegrees(params.tolerance, refLat);
            }
            if (type === 'aggregation') {
                payload.bbox = params.bbox;
                payload.grid_type = params.gridType || 'grid';
                payload.grid_size = params._gridSize || 0.01;
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

            // 构建结果提示信息
            let resultMsg = `${layerName} 完成，共 ${resultFeatures.length} 个要素`;
            if (type === 'simplify' && resultGeoJSON.total_original_vertices) {
                const orig = resultGeoJSON.total_original_vertices;
                const simp = resultGeoJSON.total_simplified_vertices;
                const ratio = ((1 - simp / orig) * 100).toFixed(1);
                resultMsg += `（节点 ${orig} → ${simp}，减少 ${ratio}%）`;
            }
            message.success(resultMsg);
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
