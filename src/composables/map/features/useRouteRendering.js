/**
 * 路线绘制功能库
 * 负责公交和驾车路线的绘制、缩放和托管图层同步
 *
 * 导出：
 * - drawRouteOnMap(route)
 * - drawDriveRouteOnMap(routeLatLonStr)
 */

import { isEmpty as isExtentEmpty } from 'ol/extent';

/**
 * 工厂函数 - 返回路线绘制相关的导出函数
 * @param {Object} options 配置选项
 * @param {Object} options.mapInstanceRef - 地图实例ref
 * @param {Object} options.busRouteLayerRef - 公交路线图层ref
 * @param {Object} options.busRouteSource - 公交路线数据源
 * @param {Function} options.resetRouteStepStates - 重置路线步骤状态
 * @param {Function} options.ensureRouteBuilderApi - 确保路由构建器API就绪
 * @param {Array} options.userDataLayers - 用户数据图层列表
 * @param {Function} options.addManagedLayerRecord - 添加托管图层记录
 * @param {Object} options.busRouteManagedLayerIdRef - 公交路线托管图层ID ref
 * @param {Function} options.emitUserLayersChange - 发出用户图层变化事件
 * @param {Function} options.emitGraphicsOverview - 发出图形概览事件
 * @returns {Object} 包含路线绘制相关函数的对象
 */
export function createRouteRenderingFeature({
    mapInstanceRef = { value: null },
    busRouteLayerRef = null,
    busRouteSource = null,
    resetRouteStepStates = () => {},
    ensureRouteBuilderApi = async () => ({}),
    userDataLayers = [],
    addManagedLayerRecord = () => null,
    busRouteManagedLayerIdRef = { value: null },
    emitUserLayersChange = () => {},
    emitGraphicsOverview = () => {}
}) {
    /**
     * 同步路线图层到托管图层记录
     * @param {Object} payload - { name, type, category, featureCount }
     */
    function syncRouteManagedLayer({ name, type, category, featureCount }) {
        const routeFeatureCount = Number(featureCount || 0);
        let managedItem = busRouteManagedLayerIdRef.value
            ? userDataLayers.find(item => item.id === busRouteManagedLayerIdRef.value)
            : null;

        if (!managedItem && busRouteLayerRef) {
            busRouteManagedLayerIdRef.value = addManagedLayerRecord({
                name,
                type,
                sourceType: 'search',
                layer: busRouteLayerRef,
                featureCount: routeFeatureCount,
                styleConfig: null,
                metadata: { category }
            });
            managedItem = userDataLayers.find(item => item.id === busRouteManagedLayerIdRef.value) || null;
        }

        if (managedItem) {
            managedItem.featureCount = routeFeatureCount;
            managedItem.metadata = { category };
            emitUserLayersChange();
        }

        emitGraphicsOverview();
    }

    /**
     * 将公交方案绘制到路线图层并自动缩放
     * @param {Object} route - 公交路线方案对象
     * @throws {Error} 地图未初始化或方案无效时抛出
     */
    async function drawRouteOnMap(route) {
        const map = mapInstanceRef.value;
        if (!map) {
            throw new Error('地图尚未初始化');
        }

        if (busRouteLayerRef && !map.getLayers().getArray().includes(busRouteLayerRef)) {
            map.addLayer(busRouteLayerRef);
        }

        // 只清理旧线路，保留起终点 marker
        busRouteSource.clear();
        resetRouteStepStates();

        const { buildRouteRenderData, fitExtentToCoverage } = await ensureRouteBuilderApi();
        const { features, fitExtent, featureCount, hasGeometry } = buildRouteRenderData('bus', route);
        
        if (!featureCount) {
            throw new Error('公交方案中未找到分段信息（segments 为空）');
        }

        busRouteSource.addFeatures(features);

        const routeFeatureCount = busRouteSource.getFeatures().length;
        if (!routeFeatureCount || !hasGeometry || isExtentEmpty(fitExtent)) {
            throw new Error('公交方案存在，但未解析到可绘制的有效坐标点');
        }

        if (!isExtentEmpty(fitExtent)) {
            fitExtentToCoverage(map, fitExtent, {
                targetCoverage: 0.72,
                bufferRatio: 0.08,
                minBufferMeters: 120,
                maxBufferMeters: 1800,
                padding: [80, 80, 80, 80],
                duration: 700,
                minZoom: 6,
                maxZoom: 19
            });
        }

        busRouteLayerRef?.changed?.();

        syncRouteManagedLayer({
            name: '公交规划路线',
            type: 'bus_route',
            category: 'route',
            featureCount: routeFeatureCount
        });
    }

    /**
     * 将驾车路径绘制到路线图层并自动缩放
     * @param {string} routeLatLonStr - 驾车路线的经纬度字符串
     * @throws {Error} 地图未初始化或路线坐标不足时抛出
     */
    async function drawDriveRouteOnMap(routeLatLonStr) {
        const map = mapInstanceRef.value;
        if (!map) {
            throw new Error('地图尚未初始化');
        }

        if (busRouteLayerRef && !map.getLayers().getArray().includes(busRouteLayerRef)) {
            map.addLayer(busRouteLayerRef);
        }

        // 清理旧路线，保留起终点 marker
        busRouteSource.clear();
        resetRouteStepStates();

        const { buildRouteRenderData, fitExtentToCoverage } = await ensureRouteBuilderApi();
        const { features, fitExtent, hasGeometry } = buildRouteRenderData('drive', routeLatLonStr);
        
        if (!hasGeometry || !features.length) {
            throw new Error('驾车路线坐标不足，无法绘制');
        }

        busRouteSource.addFeatures(features);

        if (!isExtentEmpty(fitExtent)) {
            fitExtentToCoverage(map, fitExtent, {
                targetCoverage: 0.72,
                bufferRatio: 0.08,
                minBufferMeters: 120,
                maxBufferMeters: 1800,
                padding: [80, 80, 80, 80],
                duration: 700,
                minZoom: 6,
                maxZoom: 19
            });
        }

        busRouteLayerRef?.changed?.();

        syncRouteManagedLayer({
            name: '驾车规划路线',
            type: 'drive_route',
            category: 'route',
            featureCount: busRouteSource.getFeatures().length
        });
    }

    return {
        drawRouteOnMap,
        drawDriveRouteOnMap,
        syncRouteManagedLayer
    };
}
