/**
 * 绘图与测量交互功能库
 * 负责绘制图形、测量距离/面积、清理交互等
 *
 * 导出：
 * - createDrawMeasureFeature()
 */

import { Draw, Snap } from 'ol/interaction';
import Overlay from 'ol/Overlay';
import { Polygon } from 'ol/geom';
import { getArea, getLength } from 'ol/sphere';

/**
 * 工厂函数 - 返回绘图与测量相关的导出函数
 * @param {Object} options 配置选项
 * @param {Object} options.mapInstanceRef - 地图实例ref
 * @param {Object} options.drawSource - 绘图数据源
 * @param {Function} options.createStyleFromConfig - 样式创建函数
 * @param {Function} options.createManagedVectorLayer - 图层创建函数
 * @param {Function} options.emitGraphicsOverview - 发出图形概览事件
 * @param {Function} options.refreshUserLayerZIndex - 刷新图层z-index
 * @param {Function} options.emitUserLayersChange - 发出用户图层变化事件
 * @param {Object} options.drawStyleConfig - 绘图样式配置ref
 * @param {Ref<number>} options.drawGraphicSeedRef - 绘图图形序列号ref
 * @param {Object} options.tooltipRef - 用于存储tooltip元素的对象 {helpTooltipEl, helpTooltipOverlay}
 * @returns {Object} 包含绘图和测量相关函数的对象
 */
export function createDrawMeasureFeature({
    mapInstanceRef = { value: null },
    drawSource = null,
    createStyleFromConfig = () => {},
    createManagedVectorLayer = () => null,
    emitGraphicsOverview = () => {},
    refreshUserLayerZIndex = () => {},
    emitUserLayersChange = () => {},
    drawStyleConfig = { value: {} },
    drawGraphicSeedRef = { value: 1 },
    userDataLayers = [],
    tooltipRef = { helpTooltipEl: null, helpTooltipOverlay: null }
}) {
    // 内部状态
    let drawInteraction = null;
    let snapInteraction = null;
    let measureTooltipEl = null;
    let measureTooltipOverlay = null;
    let helpTooltipEl = null;
    let helpTooltipOverlay = null;
    let sketchFeature = null;

    /**
     * 格式化线长度显示文本
     * @param {LineString} line - OL LineString对象
     * @returns {string} 格式化后的长度文本
     */
    function formatLength(line) {
        const len = getLength(line);
        return len > 100 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(2)} m`;
    }

    /**
     * 格式化面面积显示文本
     * @param {Polygon} poly - OL Polygon对象
     * @returns {string} 格式化后的面积文本
     */
    function formatArea(poly) {
        const area = getArea(poly);
        return area > 10000 ? `${(area / 1000000).toFixed(2)} km²` : `${area.toFixed(2)} m²`;
    }

    /**
     * 创建测量提示覆盖物
     */
    function createTooltips() {
        const map = mapInstanceRef.value;
        if (!map) return;

        if (measureTooltipEl) measureTooltipEl.remove();
        if (helpTooltipEl) helpTooltipEl.remove();

        helpTooltipEl = document.createElement('div');
        helpTooltipEl.className = 'ol-tooltip hidden';
        helpTooltipOverlay = new Overlay({ 
            element: helpTooltipEl, 
            offset: [15, 0], 
            positioning: 'center-left' 
        });
        map.addOverlay(helpTooltipOverlay);
        
        // 同步到外部ref，供MapContainer中的事件处理器使用
        tooltipRef.helpTooltipEl = helpTooltipEl;
        tooltipRef.helpTooltipOverlay = helpTooltipOverlay;

        measureTooltipEl = document.createElement('div');
        measureTooltipEl.className = 'ol-tooltip ol-tooltip-measure';
        measureTooltipOverlay = new Overlay({ 
            element: measureTooltipEl, 
            offset: [0, -15], 
            positioning: 'bottom-center', 
            stopEvent: false 
        });
        map.addOverlay(measureTooltipOverlay);
    }

    /**
     * 清理绘图/捕捉交互和提示覆盖物
     */
    function clearInteractions() {
        const map = mapInstanceRef.value;
        if (!map) return;

        if (drawInteraction) map.removeInteraction(drawInteraction);
        if (snapInteraction) map.removeInteraction(snapInteraction);
        if (helpTooltipOverlay) map.removeOverlay(helpTooltipOverlay);

        drawInteraction = null;
        snapInteraction = null;
        helpTooltipEl = null;
        
        // 清理外部ref
        tooltipRef.helpTooltipEl = null;
        tooltipRef.helpTooltipOverlay = null;
    }

    /**
     * 激活指定类型的交互（绘图或测量）
     * @param {string} type - 交互类型：Point/LineString/Polygon/MeasureDistance/MeasureArea
     * @param {Function} emitFeatureSelected - 发出要素选中事件的回调
     */
    function activateInteraction(type, emitFeatureSelected = () => {}) {
        clearInteractions();
        const map = mapInstanceRef.value;
        if (!map || !drawSource) return;

        const isMeasure = ['MeasureDistance', 'MeasureArea'].includes(type);
        const drawType = type === 'MeasureDistance' 
            ? 'LineString' 
            : (type === 'MeasureArea' ? 'Polygon' : type);

        drawInteraction = new Draw({
            source: drawSource,
            type: drawType,
            style: createStyleFromConfig(drawStyleConfig.value)
        });

        map.addInteraction(drawInteraction);
        snapInteraction = new Snap({ source: drawSource });
        map.addInteraction(snapInteraction);

        if (isMeasure) {
            createTooltips();
            drawInteraction.on('drawstart', (evt) => {
                sketchFeature = evt.feature;
                sketchFeature.getGeometry().on('change', (e) => {
                    const geom = e.target;
                    let output, tooltipCoord;
                    if (geom instanceof Polygon) {
                        output = formatArea(geom);
                        tooltipCoord = geom.getInteriorPoint().getCoordinates();
                    } else {
                        output = formatLength(geom);
                        tooltipCoord = geom.getLastCoordinate();
                    }
                    if (measureTooltipEl) {
                        measureTooltipEl.innerHTML = output;
                    }
                    if (measureTooltipOverlay) {
                        measureTooltipOverlay.setPosition(tooltipCoord);
                    }
                });
            });
            drawInteraction.on('drawend', () => {
                if (measureTooltipEl) {
                    measureTooltipEl.className = 'ol-tooltip ol-tooltip-static';
                }
                if (measureTooltipOverlay) {
                    measureTooltipOverlay.setOffset([0, -7]);
                }
                sketchFeature = null;
                measureTooltipEl = null;
                createTooltips();
                emitGraphicsOverview();
            });
        } else {
            drawInteraction.on('drawend', (evt) => {
                const feature = evt.feature;
                const geom = feature.getGeometry();
                const geomType = geom?.getType?.() || drawType;
                drawSource.removeFeature(feature);

                createManagedVectorLayer({
                    name: `绘制_${geomType}_${drawGraphicSeedRef.value++}`,
                    type: geomType,
                    sourceType: 'draw',
                    features: [feature],
                    styleConfig: drawStyleConfig.value,
                    fitView: false
                });
                emitGraphicsOverview();
            });
        }
    }

    /**
     * 清理所有绘制图形和用户图层中的绘制层
     */
    function clearAllGraphics() {
        const map = mapInstanceRef.value;
        if (!map || !drawSource) return;

        drawSource.clear();
        for (let i = userDataLayers.length - 1; i >= 0; i--) {
            if (userDataLayers[i].sourceType === 'draw') {
                map.removeLayer(userDataLayers[i].layer);
                userDataLayers.splice(i, 1);
            }
        }
        refreshUserLayerZIndex();
        emitUserLayersChange();
        map.getOverlays().clear();
        emitGraphicsOverview();
    }

    /**
     * 获取当前的绘图交互实例
     */
    function getDrawInteraction() {
        return drawInteraction;
    }

    /**
     * 获取当前尝试的要素（草图）
     */
    function getSketchFeature() {
        return sketchFeature;
    }

    return {
        activateInteraction,
        clearInteractions,
        clearAllGraphics,
        formatLength,
        formatArea,
        createTooltips,
        getDrawInteraction,
        getSketchFeature
    };
}
