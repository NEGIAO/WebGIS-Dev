/**
 * 坐标系转换功能库
 * 负责矢量要素坐标在 WGS-84 与 GCJ-02 之间的转换与图层坐标系管理
 * 
 * 导出：
 * - applyCrsConversionToFeature(feature, converter, targetCrs)
 * - toggleLayerCRS(payload)
 * - toggleSearchLayerCRS(payload)
 */

/**
 * 工厂函数 - 返回坐标转换相关的导出函数
 * @param {Object} options 配置选项
 * @param {Array} options.userDataLayers - 用户数据图层数组
 * @param {Object} options.message - 消息系统
 * @param {Function} options.wgs84ToGcj02 - WGS84转GCJ02转换函数
 * @param {Function} options.gcj02ToWgs84 - GCJ02转WGS84转换函数
 * @param {Function} options.isVectorManagedLayer - 判断是否为矢量管理图层
 * @param {Function} options.serializeManagedFeatures - 特性序列化函数
 * @param {Function} options.normalizeLayerMetadata - 标准化图层元数据函数
 * @param {Function} options.getFeatureRepresentativeLonLat - 获取要素代表点的函数
 * @param {Function} options.emitUserLayersChange - 广播用户图层变化的函数
 * @returns {Object} 包含 applyCrsConversionToFeature 和 toggleLayerCRS 的对象
 */
export function createCoordinateSystemConversionFeature({
    userDataLayers = [],
    message = {},
    wgs84ToGcj02 = () => [0, 0],
    gcj02ToWgs84 = () => [0, 0],
    isVectorManagedLayer = () => false,
    serializeManagedFeatures = () => [],
    normalizeLayerMetadata = (m) => m,
    getFeatureRepresentativeLonLat = () => null,
    emitUserLayersChange = () => {}
}) {
    /**
     * 应用坐标系转换到单个要素
     * @param {Feature} feature - OL Feature 实例
     * @param {Function} converter - 坐标转换函数（如 wgs84ToGcj02）
     * @param {string} targetCrs - 目标坐标系（'wgs84' 或 'gcj02'）
     * @returns {Array|null} 转换后的代表点 [lon, lat] 或 null
     */
    function applyCrsConversionToFeature(feature, converter, targetCrs) {
        const geometry = feature?.getGeometry?.();
        if (!geometry || typeof geometry.clone !== 'function') return null;

        const convertedGeometry = geometry.clone();
        convertedGeometry.transform('EPSG:3857', 'EPSG:4326');

        convertedGeometry.applyTransform((input, output, stride) => {
            const out = output || new Array(input.length);
            for (let i = 0; i < input.length; i += stride) {
                const [newLon, newLat] = converter(input[i], input[i + 1]);
                out[i] = Number.isFinite(newLon) ? newLon : input[i];
                out[i + 1] = Number.isFinite(newLat) ? newLat : input[i + 1];
                for (let j = 2; j < stride; j++) {
                    out[i + j] = input[i + j];
                }
            }
            return out;
        });

        convertedGeometry.transform('EPSG:4326', 'EPSG:3857');
        feature.setGeometry(convertedGeometry);
        feature.set('坐标系', targetCrs);

        const representative = getFeatureRepresentativeLonLat(feature);
        if (representative) {
            feature.set('经度', Number(representative[0].toFixed(6)));
            feature.set('纬度', Number(representative[1].toFixed(6)));
        }

        return representative;
    }

    /**
     * 在 WGS-84 与 GCJ-02 间切换任意矢量图层坐标并刷新显示字段
     * @param {Object} payload - 操作载荷 { layerId, fromCrs, toCrs }
     */
    function toggleLayerCRS(payload) {
        if (!payload?.layerId) return;

        const nextCrs = String(payload.toCrs || payload.crs || 'wgs84').toLowerCase();
        const explicitFromCrs = String(payload.fromCrs || '').toLowerCase();
        if (!['wgs84', 'gcj02'].includes(nextCrs)) {
            message.warning?.('目标坐标系不支持');
            return;
        }

        const layerData = userDataLayers.find(item => item.id === payload.layerId);
        if (!layerData) {
            message.warning?.('未找到目标图层');
            return;
        }

        if (!isVectorManagedLayer(layerData)) {
            message.warning?.('该图层不是矢量图层，无法进行坐标转换');
            return;
        }

        const source = layerData.layer?.getSource?.();
        const features = source?.getFeatures?.() || [];
        if (!features.length) {
            message.warning?.('图层中没有可转换的几何对象');
            return;
        }

        const currentCrs = String(layerData.metadata?.crs || 'wgs84').toLowerCase();
        const sourceCrs = ['wgs84', 'gcj02'].includes(explicitFromCrs) ? explicitFromCrs : currentCrs;

        if (sourceCrs === nextCrs) {
            message.info?.(`源坐标系与目标坐标系一致：${nextCrs.toUpperCase()}，无需转换`);
            return;
        }

        const converter = sourceCrs === 'wgs84' && nextCrs === 'gcj02'
            ? wgs84ToGcj02
            : (sourceCrs === 'gcj02' && nextCrs === 'wgs84' ? gcj02ToWgs84 : null);

        if (!converter) {
            message.warning?.('无法判定坐标转换方向，请重试并指定目标坐标系');
            return;
        }

        let firstCoordinate = null;
        features.forEach((feature) => {
            const representative = applyCrsConversionToFeature(feature, converter, nextCrs);
            if (!firstCoordinate && representative) {
                firstCoordinate = representative;
            }
        });

        const nextMetadata = {
            ...(layerData.metadata || {}),
            crs: nextCrs
        };
        if (firstCoordinate) {
            nextMetadata.longitude = Number(firstCoordinate[0].toFixed(6));
            nextMetadata.latitude = Number(firstCoordinate[1].toFixed(6));
        }
        layerData.metadata = normalizeLayerMetadata(nextMetadata, features);

        layerData.features = serializeManagedFeatures(features, layerData.name);
        source?.changed?.();
        layerData.layer?.changed?.();
        emitUserLayersChange?.();

        message.success?.(`已完成 ${sourceCrs.toUpperCase()} => ${nextCrs.toUpperCase()} 坐标转换`);
    }

    /**
     * 兼容旧事件命名，避免上游调用中断
     */
    function toggleSearchLayerCRS(payload) {
        toggleLayerCRS(payload);
    }

    return {
        applyCrsConversionToFeature,
        toggleLayerCRS,
        toggleSearchLayerCRS
    };
}
