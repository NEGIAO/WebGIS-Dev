/**
 * 功能名称：地图装饰图层（经纬网 + 中心点标记）
 * 日    期：2026/11/13
 *
 * 从 useMapState 拆出：经纬网 Graticule 与 '+' 中心点矢量图层的创建、
 * 联动显隐、移动跟随与清理；状态完全内聚，宿主只拿四个控制入口。
 */
import type { Ref } from 'vue';
import type Map from 'ol/Map';
import Graticule from 'ol/layer/Graticule';
import { unByKey } from 'ol/Observable';
import { Fill, Stroke, Style, Text } from 'ol/style';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Z_BAND } from '@ol/layer/zIndexBands';

/**
 * 创建地图装饰图层控制器
 * @param mapInstance OL 地图实例 ref
 * @returns setGraticuleActive / toggleGraticule / stopGraticule / stopCenterPoint
 */
export function useMapDecorations(mapInstance: Ref<Map | null> | Ref<Map | undefined>) {
    let graticuleLayer: any = null;        // 经纬网图层
    let graticuleActive = false;      // 经纬网激活状态
    let centerPointLayer: any = null;      // 中心点矢量图层
    let centerPointMoveEndKey: any = null; // 地图移动事件监听句柄
/**
 * 确保经纬网图层已创建
 * 使用 OpenLayers 内置 Graticule 类以获得最佳性能和平滑渲染
 * @returns {Graticule|null} 经纬网图层
 * @private
 */
function ensureGraticuleLayer() {
    const map = mapInstance?.value;
    if (!map) return null;
    if (graticuleLayer) return graticuleLayer;

    graticuleLayer = new Graticule({
        strokeStyle: new Stroke({
            color: 'rgba(200, 200, 200, 0.6)',
            width: 1.5,
            lineDash: [5, 5],
        }),
        showLabels: true,
        lonLabelStyle: new Text({
            font: 'bold 14px "Times New Roman", serif',
            fill: new Fill({ color: '#fff' }),
            stroke: new Stroke({ color: '#000', width: 3 }),
            backgroundFill: new Fill({ color: 'rgba(0, 0, 0, 0.5)' }),
            backgroundStroke: new Stroke({ color: '#999', width: 1 }),
            padding: [3, 5, 3, 5],
            offsetY: -80,
            textAlign: 'center',
        }),
        latLabelStyle: new Text({
            font: 'bold 14px "Times New Roman", serif',
            fill: new Fill({ color: '#fff' }),
            stroke: new Stroke({ color: '#000', width: 3 }),
            backgroundFill: new Fill({ color: 'rgba(0, 0, 0, 0.5)' }),
            backgroundStroke: new Stroke({ color: '#999', width: 1 }),
            padding: [3, 5, 3, 5],
            offsetX: -50,
            textAlign: 'center',
        }),
        zIndex: Z_BAND.SYSTEM, // 系统叠加带：经纬网恒在标注带之上
    });
    map.addLayer(graticuleLayer);
    return graticuleLayer;
}

// ========== 新增：中心点标记相关函数 ==========

/**
 * 确保中心点矢量图层已创建
 * 创建一个带 '+' 符号的矢量点图层
 * @returns {VectorLayer|null} 中心点图层实例
 * @private
 */
function ensureCenterPointLayer() {
    const map = mapInstance?.value;
    if (!map) return null;
    if (centerPointLayer) return centerPointLayer;

    // 创建矢量源并添加一个初始要素（坐标先设为原点，后续更新）
    const source = new VectorSource();
    const feature = new Feature({
        geometry: new Point([0, 0]),
    });
    // 设置 '+' 样式（半透金黄加黑色描边）
    feature.setStyle(
        new Style({
            text: new Text({
                text: '+',
                font: '700 30px "Segoe UI", "Arial", sans-serif',
                fill: new Fill({ color: 'rgba(255, 235, 130, 0.98)' }),
                stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.78)', width: 3 }),
                textAlign: 'center',
                textBaseline: 'middle',
            }),
        }),
    );
    source.addFeature(feature);

    centerPointLayer = new VectorLayer({
        source: source,
        zIndex: Z_BAND.SYSTEM + 10, // 高于经纬网，确保显示在地图元素之上
        visible: graticuleActive, // 初始可见性与经纬网保持一致
    });
    map.addLayer(centerPointLayer);
    return centerPointLayer;
}

/**
 * 更新中心点位置到当前地图视图的中心
 * @private
 */
function updateCenterPointPosition() {
    const map = mapInstance?.value;
    if (!centerPointLayer || !graticuleActive || !map) return; // 只有激活时才更新

    const view = map.getView();
    if (!view) return;

    const centerCoord = view.getCenter(); // 投影坐标系坐标
    if (!centerCoord) return;

    const source = centerPointLayer.getSource();
    if (!source) return;

    const feature = source.getFeatures()[0];
    if (feature) {
        feature.getGeometry().setCoordinates(centerCoord);
    }
}

/**
 * 绑定地图移动事件，实时更新中心点位置
 * @private
 */
function bindCenterPointMoveListener() {
    if (centerPointMoveEndKey) return;
    const map = mapInstance?.value;
    if (!map) return;

    centerPointMoveEndKey = map.on('moveend', () => {
        if (graticuleActive) {
            updateCenterPointPosition();
        }
    });
}

/**
 * 解绑中心点移动监听
 * @private
 */
function unbindCenterPointMoveListener() {
    if (!centerPointMoveEndKey) return;
    unByKey(centerPointMoveEndKey);
    centerPointMoveEndKey = null;
}

/**
 * 清理中心点图层（卸载时调用）
 * @private
 */
function stopCenterPoint() {
    if (centerPointLayer && mapInstance?.value) {
        mapInstance.value.removeLayer(centerPointLayer);
        centerPointLayer = null;
    }
    unbindCenterPointMoveListener();
}

// ========== 修改：设置经纬网的激活状态，同时联动中心点 ==========
/**
 * 设置经纬网的激活状态，同时联动控制中心点标记的显示/隐藏
 * @param {boolean} active - 是否激活
 * @returns {boolean} 设置后的激活状态
 */
function setGraticuleActive(active: any) {
    graticuleActive = !!active;
    const map = mapInstance?.value;
    if (!map) return graticuleActive;

    // 处理经纬网图层
    const layer = ensureGraticuleLayer();
    if (layer) {
        layer.setVisible(graticuleActive);
    }

    // 处理中心点图层（联动）
    if (graticuleActive) {
        // 激活时：确保中心点图层存在，更新当前位置，绑定移动监听
        ensureCenterPointLayer();
        if (centerPointLayer) {
            updateCenterPointPosition();
            centerPointLayer.setVisible(true);
        }
        bindCenterPointMoveListener();
    } else {
        // 关闭时：隐藏中心点图层，解绑移动监听
        if (centerPointLayer) {
            centerPointLayer.setVisible(false);
        }
        unbindCenterPointMoveListener();
    }

    return graticuleActive;
}

/**
 * 切换经纬网的显示/隐藏状态（同时切换中心点）
 * @returns {boolean} 切换后的激活状态
 */
function toggleGraticule() {
    return setGraticuleActive(!graticuleActive);
}

/**
 * 停止经纬网和中心点，隐藏并清理资源
 */
function stopGraticule() {
    if (graticuleLayer && mapInstance?.value) {
        mapInstance.value.removeLayer(graticuleLayer);
        graticuleLayer = null;
    }
    if (centerPointLayer) {
        centerPointLayer.setVisible(false);
    }
    unbindCenterPointMoveListener();
    graticuleActive = false;
}

    return {
        setGraticuleActive,
        toggleGraticule,
        stopGraticule,
        stopCenterPoint,
    };
}
