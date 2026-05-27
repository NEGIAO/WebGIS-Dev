/**
 * 空间分析功能库
 * 提供缓冲区、叠加分析（交集/并集/差集）、凸包等空间分析能力
 *
 * 导出：
 * - createSpatialAnalysisFeature()
 */

import Feature from 'ol/Feature';
import { Point, Polygon, MultiPolygon, Circle as CircleGeom } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import { getArea, getLength } from 'ol/sphere';

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
    mapInstanceRef = { value: null },
    createManagedVectorLayer = () => null,
    emitGraphicsOverview = () => {},
    emitUserLayersChange = () => {},
    refreshUserLayerZIndex = () => {},
    userDataLayers = [],
    message = { info: () => {}, success: () => {}, warning: () => {}, error: () => {} },
}) {
    // 分析结果图层名称序列号
    let analysisSeedRef = { value: 1 };

    /**
     * 获取指定图层的所有要素
     * @param {string} layerId - 图层 ID
     * @returns {Array<Feature>} 要素数组
     */
    function getLayerFeatures(layerId) {
        const record = userDataLayers.find((item) => item.id === layerId);
        if (!record || !record.layer) return [];
        const source = record.layer.getSource();
        return source ? source.getFeatures() : [];
    }

    /**
     * 创建缓冲区多边形（基于正多边形近似）
     * @param {Array<number>} center - 中心点坐标 [lon, lat]（EPSG:4326）
     * @param {number} radius - 缓冲半径（米）
     * @param {number} sides - 正多边形边数（默认 64，越接近圆形）
     * @returns {Array<Array<number>>} 多边形坐标环（EPSG:4326）
     */
    function createBufferPolygon(center, radius, sides = 64) {
        const [lon, lat] = center;
        // 将中心点转为 EPSG:3857 用于距离计算
        const center3857 = fromLonLat([lon, lat]);
        const coords = [];

        for (let i = 0; i < sides; i++) {
            const angle = (2 * Math.PI * i) / sides;
            const dx = radius * Math.cos(angle);
            const dy = radius * Math.sin(angle);
            const point3857 = [center3857[0] + dx, center3857[1] + dy];
            coords.push(toLonLat(point3857));
        }
        // 闭合多边形
        coords.push(coords[0]);
        return coords;
    }

    /**
     * 对要素集合执行缓冲区分析
     * @param {Array<Feature>} features - 输入要素数组
     * @param {number} radius - 缓冲半径（米）
     * @returns {Array<Feature>} 缓冲区要素数组
     */
    function bufferFeatures(features, radius) {
        const results = [];

        features.forEach((feature) => {
            const geom = feature.getGeometry();
            if (!geom) return;

            const geomType = geom.getType();

            if (geomType === 'Point') {
                const coord = toLonLat(geom.getCoordinates());
                const bufferCoords = createBufferPolygon(coord, radius);
                results.push(
                    new Feature({
                        geometry: new Polygon([bufferCoords]),
                        _analysisType: 'buffer',
                        _sourceFeatureId: feature.getId(),
                    }),
                );
            } else if (geomType === 'MultiPoint') {
                geom.getCoordinates().forEach((coord) => {
                    const lonLat = toLonLat(coord);
                    const bufferCoords = createBufferPolygon(lonLat, radius);
                    results.push(
                        new Feature({
                            geometry: new Polygon([bufferCoords]),
                            _analysisType: 'buffer',
                        }),
                    );
                });
            } else if (geomType === 'LineString') {
                // 沿线每个节点生成缓冲区并合并（简化实现）
                const coords = geom.getCoordinates();
                coords.forEach((coord) => {
                    const lonLat = toLonLat(coord);
                    const bufferCoords = createBufferPolygon(lonLat, radius);
                    results.push(
                        new Feature({
                            geometry: new Polygon([bufferCoords]),
                            _analysisType: 'buffer',
                        }),
                    );
                });
            } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
                // 对面要素的每个顶点生成缓冲区（简化实现）
                const allCoords =
                    geomType === 'Polygon'
                        ? geom.getCoordinates()[0]
                        : geom.getCoordinates().flat(1);
                // 采样部分顶点避免过多缓冲区
                const step = Math.max(1, Math.floor(allCoords.length / 20));
                for (let i = 0; i < allCoords.length; i += step) {
                    const lonLat = toLonLat(allCoords[i]);
                    const bufferCoords = createBufferPolygon(lonLat, radius);
                    results.push(
                        new Feature({
                            geometry: new Polygon([bufferCoords]),
                            _analysisType: 'buffer',
                        }),
                    );
                }
            }
        });

        return results;
    }

    /**
     * 凸包算法（Graham Scan）
     * @param {Array<Array<number>>} points - 二维点数组 [[x, y], ...]
     * @returns {Array<Array<number>>} 凸包顶点（逆时针顺序）
     */
    function convexHull(points) {
        if (points.length < 3) return points;

        // 找到最下方（y 最小）的点作为基准
        let pivot = 0;
        for (let i = 1; i < points.length; i++) {
            if (
                points[i][1] < points[pivot][1] ||
                (points[i][1] === points[pivot][1] && points[i][0] < points[pivot][0])
            ) {
                pivot = i;
            }
        }
        // 将基准点放到首位
        [points[0], points[pivot]] = [points[pivot], points[0]];
        const base = points[0];

        // 按极角排序
        const sorted = points.slice(1).sort((a, b) => {
            const angleA = Math.atan2(a[1] - base[1], a[0] - base[0]);
            const angleB = Math.atan2(b[1] - base[1], b[0] - base[0]);
            if (angleA !== angleB) return angleA - angleB;
            // 极角相同时按距离排序
            const distA = (a[0] - base[0]) ** 2 + (a[1] - base[1]) ** 2;
            const distB = (b[0] - base[0]) ** 2 + (b[1] - base[1]) ** 2;
            return distA - distB;
        });

        const stack = [base, sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            while (
                stack.length > 1 &&
                crossProduct(stack[stack.length - 2], stack[stack.length - 1], sorted[i]) <= 0
            ) {
                stack.pop();
            }
            stack.push(sorted[i]);
        }

        return stack;
    }

    /**
     * 叉积计算（判断转向方向）
     * @param {Array<number>} O - 基准点
     * @param {Array<number>} A - 点 A
     * @param {Array<number>} B - 点 B
     * @returns {number} 正值=逆时针，负值=顺时针，0=共线
     */
    function crossProduct(O, A, B) {
        return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
    }

    /**
     * 对要素集合执行凸包分析
     * @param {Array<Feature>} features - 输入要素数组
     * @returns {Feature|null} 凸包多边形要素，无足够点时返回 null
     */
    function convexHullFeatures(features) {
        const allPoints = [];

        features.forEach((feature) => {
            const geom = feature.getGeometry();
            if (!geom) return;
            collectVertices(geom, allPoints);
        });

        if (allPoints.length < 3) return null;

        // 去重
        const unique = [];
        const seen = new Set();
        allPoints.forEach((p) => {
            const key = `${p[0].toFixed(8)},${p[1].toFixed(8)}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(p);
            }
        });

        const hull = convexHull(unique);
        if (hull.length < 3) return null;

        // 闭合多边形
        hull.push(hull[0]);

        return new Feature({
            geometry: new Polygon([hull]),
            _analysisType: 'convexHull',
        });
    }

    /**
     * 递归收集几何体的所有顶点坐标
     * @param {Geometry} geom - OL 几何对象
     * @param {Array<Array<number>>} accumulator - 收集结果数组
     */
    function collectVertices(geom, accumulator) {
        const type = geom.getType();
        if (type === 'Point') {
            accumulator.push(toLonLat(geom.getCoordinates()));
        } else if (type === 'MultiPoint' || type === 'LineString') {
            geom.getCoordinates().forEach((c) => accumulator.push(toLonLat(c)));
        } else if (type === 'MultiLineString' || type === 'Polygon') {
            geom.getCoordinates().forEach((ring) =>
                ring.forEach((c) => accumulator.push(toLonLat(c))),
            );
        } else if (type === 'MultiPolygon') {
            geom.getCoordinates().forEach((poly) =>
                poly.forEach((ring) => ring.forEach((c) => accumulator.push(toLonLat(c)))),
            );
        } else if (type === 'GeometryCollection') {
            geom.getGeometries().forEach((g) => collectVertices(g, accumulator));
        }
    }

    /**
     * 简单的面要素交集判断（基于包围盒）
     * @param {Feature} featureA - 要素 A
     * @param {Feature} featureB - 要素 B
     * @returns {boolean} 包围盒是否相交
     */
    function boundingBoxIntersects(featureA, featureB) {
        const extA = featureA.getGeometry()?.getExtent();
        const extB = featureB.getGeometry()?.getExtent();
        if (!extA || !extB) return false;

        return extA[0] <= extB[2] && extA[2] >= extB[0] && extA[1] <= extB[3] && extA[3] >= extB[1];
    }

    /**
     * 简化实现：交集分析（基于包围盒重叠检测 + 合并重叠区域）
     * 注：完整的几何交集计算需要 turf.js 等专业库，此处为简化版本
     * @param {Array<Feature>} featuresA - 图层 A 要素
     * @param {Array<Feature>} featuresB - 图层 B 要素
     * @returns {Array<Feature>} 重叠区域要素
     */
    function intersectionAnalysis(featuresA, featuresB) {
        const results = [];

        featuresA.forEach((fA) => {
            featuresB.forEach((fB) => {
                if (boundingBoxIntersects(fA, fB)) {
                    // 取两者包围盒的交集作为近似结果
                    const extA = fA.getGeometry().getExtent();
                    const extB = fB.getGeometry().getExtent();
                    const minX = Math.max(extA[0], extB[0]);
                    const minY = Math.max(extA[1], extB[1]);
                    const maxX = Math.min(extA[2], extB[2]);
                    const maxY = Math.min(extA[3], extB[3]);

                    if (minX < maxX && minY < maxY) {
                        const minCoord = toLonLat([minX, minY]);
                        const maxCoord = toLonLat([maxX, maxY]);
                        results.push(
                            new Feature({
                                geometry: new Polygon([
                                    [
                                        [minCoord[0], minCoord[1]],
                                        [maxCoord[0], minCoord[1]],
                                        [maxCoord[0], maxCoord[1]],
                                        [minCoord[0], maxCoord[1]],
                                        [minCoord[0], minCoord[1]],
                                    ],
                                ]),
                                _analysisType: 'intersection',
                            }),
                        );
                    }
                }
            });
        });

        return results;
    }

    /**
     * 并集分析（合并所有要素到一个图层）
     * @param {Array<Feature>} featuresA - 图层 A 要素
     * @param {Array<Feature>} featuresB - 图层 B 要素
     * @returns {Array<Feature>} 合并后的要素
     */
    function unionAnalysis(featuresA, featuresB) {
        const results = [];
        const cloneFeature = (f) => {
            const cloned = f.clone();
            cloned.set('_analysisType', 'union');
            return cloned;
        };
        featuresA.forEach((f) => results.push(cloneFeature(f)));
        featuresB.forEach((f) => results.push(cloneFeature(f)));
        return results;
    }

    /**
     * 差集分析（从图层 A 中排除与图层 B 相交的要素）
     * @param {Array<Feature>} featuresA - 图层 A 要素
     * @param {Array<Feature>} featuresB - 图层 B 要素
     * @returns {Array<Feature>} 差集结果要素
     */
    function differenceAnalysis(featuresA, featuresB) {
        return featuresA.filter((fA) => {
            const hasIntersection = featuresB.some((fB) => boundingBoxIntersects(fA, fB));
            if (!hasIntersection) {
                const cloned = fA.clone();
                cloned.set('_analysisType', 'difference');
                return true;
            }
            return false;
        }).map((f) => {
            f.set('_analysisType', 'difference');
            return f;
        });
    }

    /**
     * 执行空间分析并创建结果图层
     * @param {Object} params - 分析参数
     * @param {string} params.type - 分析类型：buffer/overlay/convexHull
     * @param {string} [params.targetLayerId] - 目标图层 ID（buffer/convexHull 使用）
     * @param {number} [params.radius] - 缓冲半径（米）（buffer 使用）
     * @param {string} [params.operation] - 叠加操作：intersection/union/difference（overlay 使用）
     * @param {string} [params.layerA] - 图层 A ID（overlay 使用）
     * @param {string} [params.layerB] - 图层 B ID（overlay 使用）
     */
    function runSpatialAnalysis(params = {}) {
        const { type } = params;

        if (!type) {
            message.warning('未指定分析类型');
            return;
        }

        let resultFeatures = [];
        let layerName = '';

        try {
            switch (type) {
                case 'buffer': {
                    const { targetLayerId, radius = 1000 } = params;
                    if (!targetLayerId) {
                        message.warning('请选择目标图层');
                        return;
                    }
                    const features = getLayerFeatures(targetLayerId);
                    if (!features.length) {
                        message.warning('目标图层无要素');
                        return;
                    }
                    resultFeatures = bufferFeatures(features, radius);
                    layerName = `缓冲区_${radius}m_${analysisSeedRef.value++}`;
                    break;
                }

                case 'overlay': {
                    const { operation, layerA, layerB } = params;
                    if (!layerA || !layerB) {
                        message.warning('请选择两个图层');
                        return;
                    }
                    if (layerA === layerB) {
                        message.warning('图层 A 和图层 B 不能相同');
                        return;
                    }
                    const fA = getLayerFeatures(layerA);
                    const fB = getLayerFeatures(layerB);

                    switch (operation) {
                        case 'intersection':
                            resultFeatures = intersectionAnalysis(fA, fB);
                            layerName = `交集分析_${analysisSeedRef.value++}`;
                            break;
                        case 'union':
                            resultFeatures = unionAnalysis(fA, fB);
                            layerName = `并集分析_${analysisSeedRef.value++}`;
                            break;
                        case 'difference':
                            resultFeatures = differenceAnalysis(fA, fB);
                            layerName = `差集分析_${analysisSeedRef.value++}`;
                            break;
                        default:
                            message.warning(`不支持的叠加操作：${operation}`);
                            return;
                    }
                    break;
                }

                case 'convexHull': {
                    const { targetLayerId } = params;
                    if (!targetLayerId) {
                        message.warning('请选择目标图层');
                        return;
                    }
                    const features = getLayerFeatures(targetLayerId);
                    if (!features.length) {
                        message.warning('目标图层无要素');
                        return;
                    }
                    const hullFeature = convexHullFeatures(features);
                    if (!hullFeature) {
                        message.warning('要素点数不足，无法生成凸包');
                        return;
                    }
                    resultFeatures = [hullFeature];
                    layerName = `凸包分析_${analysisSeedRef.value++}`;
                    break;
                }

                default:
                    message.warning(`不支持的分析类型：${type}`);
                    return;
            }

            if (!resultFeatures.length) {
                message.warning('分析未产生结果要素');
                return;
            }

            // 创建结果图层
            createManagedVectorLayer({
                name: layerName,
                type: resultFeatures[0]?.getGeometry?.()?.getType?.() || 'Polygon',
                sourceType: 'spatial-analysis',
                features: resultFeatures,
                fitView: true,
            });

            emitGraphicsOverview();
            emitUserLayersChange();
            message.success(`${layerName} 完成，共 ${resultFeatures.length} 个要素`);
        } catch (error) {
            console.error('[SpatialAnalysis] Error:', error);
            message.error(`空间分析失败：${error?.message || '未知错误'}`);
        }
    }

    return {
        runSpatialAnalysis,
        bufferFeatures,
        convexHullFeatures,
        intersectionAnalysis,
        unionAnalysis,
        differenceAnalysis,
    };
}
