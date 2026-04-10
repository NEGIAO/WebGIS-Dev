/**
 * 地图搜索和坐标输入功能库
 * 负责地名搜索结果落图与手动坐标绘制
 * 
 * 导出：
 * - handleSearchJump(payload)
 * - drawPointByCoordinatesInput(payload)
 */

import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';

/**
 * 工厂函数 - 返回搜索和坐标输入相关的导出函数
 * @param {Object} options 配置选项
 * @param {Object} options.message - 消息系统
 * @param {Object} options.mapInstanceRef - 地图实例 ref
 * @param {Function} options.createManagedVectorLayer - 创建托管矢量图层的函数
 * @param {Function} options.gcj02ToWgs84 - GCJ02转WGS84转换函数
 * @param {Object} options.searchResultStyle - 搜索结果样式配置
 * @returns {Object} 包含 handleSearchJump 和 drawPointByCoordinatesInput 的对象
 */
export function createMapSearchAndCoordinateInputFeature({
    message = {},
    mapInstanceRef = { value: null },
    createManagedVectorLayer = () => null,
    gcj02ToWgs84 = () => [0, 0],
    searchResultStyle = {}
}) {
    /**
     * 处理地名搜索跳转
     * 接收 LayerControlPanel 解析后的定位载荷并渲染搜索结果图层
     * @param {Object} payload - 搜索结果 { lng, lat, name, zoom }
     */
    function handleSearchJump(payload) {
        if (!mapInstanceRef.value || !payload) return;

        const lon = Number(payload.lng);
        const lat = Number(payload.lat);
        if (Number.isNaN(lon) || Number.isNaN(lat)) {
            message.warning?.('无法解析该结果的坐标');
            return;
        }
        const coord = fromLonLat([lon, lat]);

        const layerName = (payload.name || `搜索结果_${lon.toFixed(5)}_${lat.toFixed(5)}`).trim();
        const f = new Feature({
            geometry: new Point(coord),
            type: 'search',
            名称: layerName,
            经度: Number(lon.toFixed(6)),
            纬度: Number(lat.toFixed(6)),
            坐标系: 'wgs84'
        });
        createManagedVectorLayer?.({
            name: layerName,
            type: 'search',
            sourceType: 'search',
            features: [f],
            styleConfig: searchResultStyle,
            autoLabel: true,
            metadata: {
                longitude: Number(lon.toFixed(6)),
                latitude: Number(lat.toFixed(6)),
                crs: 'wgs84'
            },
            fitView: false
        });

        // 动画缩放到位置
        mapInstanceRef.value?.getView()?.animate?.({
            center: coord,
            zoom: Number(payload.zoom) > 0 ? Number(payload.zoom) : 16,
            duration: 700
        });
    }

    /**
     * 手动坐标绘制
     * 接收输入经纬度（WGS-84 / GCJ-02），落图并自动飞行到目标点
     * @param {Object} payload - 坐标输入 { lng, lat, crsType, displayName }
     */
    function drawPointByCoordinatesInput(payload) {
        if (!mapInstanceRef.value || !payload) return;

        const rawLng = Number(payload.lng);
        const rawLat = Number(payload.lat);
        const crsType = String(payload.crsType || 'wgs84').toLowerCase();

        if (!Number.isFinite(rawLng) || !Number.isFinite(rawLat)) {
            message.warning?.('输入坐标无效，请检查经纬度');
            return;
        }

        if (rawLng < -180 || rawLng > 180 || rawLat < -90 || rawLat > 90) {
            message.warning?.('输入坐标超出范围（经度 -180~180，纬度 -90~90）');
            return;
        }

        let mapLng = rawLng;
        let mapLat = rawLat;
        if (crsType === 'gcj02') {
            [mapLng, mapLat] = gcj02ToWgs84(rawLng, rawLat);
        }

        if (!Number.isFinite(mapLng) || !Number.isFinite(mapLat)) {
            message.error?.('坐标转换失败，请稍后重试');
            return;
        }

        const mapCoord = fromLonLat([mapLng, mapLat]);
        const displayName = String(payload.displayName || `输入点_${rawLng.toFixed(6)}_${rawLat.toFixed(6)}`);

        const pointFeature = new Feature({
            geometry: new Point(mapCoord),
            type: 'Point',
            名称: displayName,
            经度: Number(rawLng.toFixed(6)),
            纬度: Number(rawLat.toFixed(6)),
            坐标系: crsType
        });

        createManagedVectorLayer?.({
            name: displayName,
            type: 'Point',
            sourceType: 'draw',
            features: [pointFeature],
            metadata: {
                longitude: Number(rawLng.toFixed(6)),
                latitude: Number(rawLat.toFixed(6)),
                crs: crsType
            },
            fitView: false
        });

        mapInstanceRef.value?.getView()?.animate?.({
            center: mapCoord,
            zoom: 16,
            duration: 700
        });

        message.success?.(`已绘制点位：${displayName}`);
    }

    return {
        handleSearchJump,
        drawPointByCoordinatesInput
    };
}
