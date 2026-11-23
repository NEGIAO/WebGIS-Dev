/**
 * 绘图与测量交互功能库
 * 负责绘制图形、测量距离/面积、清理交互等
 *
 * 导出：
 * - createDrawMeasureFeature()
 */

import Draw from 'ol/interaction/Draw';
import Snap from 'ol/interaction/Snap';
import Overlay from 'ol/Overlay';
import { Polygon } from 'ol/geom';
import { toLonLat } from 'ol/proj';
import { getArea, getLength } from 'ol/sphere';
import { unByKey } from 'ol/Observable';
import { formatAreaMeasure, formatDistanceMeasure } from '@common/map-view/units';
import { useOlMeasureStore } from '@ol/stores/useOlMeasureStore';
import {
    applyDrawingFeatureStyle,
    createDrawingStyleFromParams,
    setDrawingFeatureMetadata,
} from '@ol/drawing/composables/useDrawingFeatureStyle';
import {
    normalizeDrawingStyleParams,
    toManagedStyleConfig,
} from '../registry/drawingToolRegistry';

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
/** createDrawMeasureFeature 的依赖注入项（均由 MapContainer 侧提供） */
export interface DrawMeasureOptions {
    mapInstanceRef?: { value: any };
    drawSource?: any;
    /** 由样式配置创建 OL Style 的函数 */
    createStyleFromConfig?: (config?: any) => any;
    /** 创建托管矢量图层，返回 OL Layer（或 null） */
    createManagedVectorLayer?: (options?: any) => any;
    emitGraphicsOverview?: () => void;
    refreshUserLayerZIndex?: () => void;
    emitUserLayersChange?: () => void;
    removeManagedLayerById?: any;
    /** 绘图样式配置 ref */
    drawStyleConfig?: { value: any };
    /** 实时绘图样式参数 ref（面板未保存的临时参数） */
    drawingStyleParamsRef?: { value: any };
    drawGraphicSeedRef?: { value: number };
    userDataLayers?: any[];
    tooltipRef?: { helpTooltipEl: any; helpTooltipOverlay: any };
}

export function createDrawMeasureFeature({
    mapInstanceRef = { value: null },
    drawSource = null,
    createStyleFromConfig = (_config?: any): any => {},
    createManagedVectorLayer = (_options?: any): any => null,
    emitGraphicsOverview = () => {},
    refreshUserLayerZIndex = () => {},
    emitUserLayersChange = () => {},
    removeManagedLayerById = null,
    drawStyleConfig = { value: {} },
    drawingStyleParamsRef = { value: {} },
    drawGraphicSeedRef = { value: 1 },
    userDataLayers = [],
    tooltipRef = { helpTooltipEl: null, helpTooltipOverlay: null },
}: DrawMeasureOptions = {}) {
    // 内部状态
    let drawInteraction: any = null;
    let snapInteraction: any = null;
    let measureTooltipEl: any = null;
    let measureTooltipOverlay: any = null;
    let helpTooltipEl: any = null;
    let helpTooltipOverlay: any = null;
    let sketchFeature: any = null;
    let geometryChangeKey: any = null;

    // 2D 测量结果店：drawend 时落库，供 Agent 的 get_measure_result 读取（V3.7.10）
    const olMeasureStore = useOlMeasureStore();
    const drawListenerKeys: any[] = []; // [C7] 存储 drawstart/drawend 监听器 key

    /**
     * 格式化线长度显示文本（跟随用户偏好单位制：公制 m/km，英制 ft/mi）
     * @param {LineString} line - OL LineString对象
     * @returns {string} 格式化后的长度文本
     */
    function formatLength(line: any) {
        return formatDistanceMeasure(getLength(line));
    }

    /**
     * 格式化面面积显示文本（跟随用户偏好单位制：公制 m²/km²，英制 ft²/acre）
     * @param {Polygon} poly - OL Polygon对象
     * @returns {string} 格式化后的面积文本
     */
    function formatArea(poly: any) {
        return formatAreaMeasure(getArea(poly));
    }

    /**
     * 把刚完成的测量写入结果店（供 Agent 的 `get_measure_result` 读取）。
     *
     * 数值与 tooltip 同源：距离用 `getLength`、面积用 `getArea`，再交给同一套
     * `formatDistanceMeasure` / `formatAreaMeasure` 生成文本 —— 保证模型报出的数字
     * 与用户屏幕上看到的一致（此处不改用 EPSG:4326 大地测量，否则两者会分歧）。
     *
     * @param geom 完成测量的几何（地图投影坐标）
     * @param measureType `MeasureDistance` 或 `MeasureArea`
     */
    function recordMeasureResult(geom: any, measureType: string) {
        if (!geom) return;
        try {
            const isArea = measureType === 'MeasureArea';
            const value = isArea ? getArea(geom) : getLength(geom);
            const text = isArea ? formatArea(geom) : formatLength(geom);
            const rawCoords = isArea
                ? geom.getCoordinates?.()?.[0] || []
                : geom.getCoordinates?.() || [];
            const coordinates = (rawCoords as any[])
                .map((pair: any) => {
                    const [lng, lat] = toLonLat(pair);
                    return [Number(lng), Number(lat)] as [number, number];
                })
                .filter(
                    (pair: [number, number]) =>
                        Number.isFinite(pair[0]) && Number.isFinite(pair[1]),
                );

            olMeasureStore.setResult({
                type: isArea ? 'MeasureArea' : 'MeasureDistance',
                value: Number(value) || 0,
                text,
                coordinates,
            });
        } catch (error: unknown) {
            // 落库失败不影响绘制本身：tooltip 已显示，不打断用户操作
            console.warn('[DrawMeasure] 测量结果落库失败：', error);
        }
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
            positioning: 'center-left',
        });
        map.addOverlay(helpTooltipOverlay);

        // 同步到外部ref，供MapContainer中的事件处理器使用
        tooltipRef.helpTooltipEl = helpTooltipEl;
        tooltipRef.helpTooltipOverlay = helpTooltipOverlay;

        if (measureTooltipOverlay && map) {
            map.removeOverlay(measureTooltipOverlay);
        }

        measureTooltipEl = document.createElement('div');
        measureTooltipEl.className = 'ol-tooltip ol-tooltip-measure';
        measureTooltipOverlay = new Overlay({
            element: measureTooltipEl,
            offset: [0, -15],
            positioning: 'bottom-center',
            stopEvent: false,
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
        if (measureTooltipOverlay) {
            map.removeOverlay(measureTooltipOverlay);
            measureTooltipOverlay = null;
        }

        if (geometryChangeKey) {
            unByKey(geometryChangeKey);
            geometryChangeKey = null;
        }

        // [C7] 清理 drawstart/drawend 监听器
        drawListenerKeys.forEach((key) => unByKey(key));
        drawListenerKeys.length = 0;

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
     * @param {Function} _emitFeatureSelected - 发出要素选中事件的回调
     */
    function activateInteraction(type: any, _emitFeatureSelected: (payload?: any) => void = () => {}) {
        clearInteractions();
        const map = mapInstanceRef.value;
        if (!map || !drawSource) return;

        const isMeasure = ['MeasureDistance', 'MeasureArea'].includes(type);
        const drawType =
            type === 'MeasureDistance' ? 'LineString' : type === 'MeasureArea' ? 'Polygon' : type;

        const currentDrawingStyleParams = () =>
            normalizeDrawingStyleParams({
                ...(drawStyleConfig?.value || {}),
                ...(drawingStyleParamsRef?.value || {}),
                radius:
                    drawingStyleParamsRef?.value?.radius ??
                    drawStyleConfig?.value?.pointRadius ??
                    drawStyleConfig?.value?.radius,
            });

        drawInteraction = new Draw({
            source: drawSource,
            type: drawType,
            style: isMeasure
                ? createStyleFromConfig(drawStyleConfig.value)
                : (feature: any) => createDrawingStyleFromParams(drawType, currentDrawingStyleParams(), feature as any),
        });

        map.addInteraction(drawInteraction);
        snapInteraction = new Snap({ source: drawSource });
        map.addInteraction(snapInteraction);

        if (isMeasure) {
            createTooltips();
            drawListenerKeys.push(drawInteraction.on('drawstart', (evt: any) => {
                sketchFeature = evt.feature;
                geometryChangeKey = sketchFeature.getGeometry().on('change', (e: any) => {
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
            }));
            drawListenerKeys.push(drawInteraction.on('drawend', () => {
                // 先落库再清空 sketchFeature：Agent 要能读到这次测量（V3.7.10）
                recordMeasureResult(sketchFeature?.getGeometry?.(), type);
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
            }));
        } else {
            drawListenerKeys.push(drawInteraction.on('drawend', async (evt: any) => {
                const feature = evt.feature;
                const geom = feature.getGeometry();
                const geomType = geom?.getType?.() || drawType;
                // OL Draw 会在 drawend 后再把 feature 插入 source：延迟移除，避免临时绘制层与托管图层重复显示
                window.setTimeout(() => drawSource.removeFeature(feature), 0);

                // 为基础绘制补充 drawType/styleParams，便于后续选择编辑与样式恢复
                const styleParams = currentDrawingStyleParams();
                setDrawingFeatureMetadata(feature, drawType, styleParams);
                applyDrawingFeatureStyle(feature);

                await createManagedVectorLayer({
                    name: `绘制_${geomType}_${drawGraphicSeedRef.value++}`,
                    type: geomType,
                    sourceType: 'draw',
                    features: [feature],
                    styleConfig: toManagedStyleConfig(styleParams),
                    metadata: {
                        drawType,
                        editorType: 'basic-2d',
                        styleParams,
                    },
                    fitView: false,
                });
                emitGraphicsOverview();
            }));
        }
    }

    /**
     * 清理所有绘制图形和用户图层中的绘制层
     */
    async function clearAllGraphics() {
        const map = mapInstanceRef.value;
        if (!map || !drawSource) return;

        drawSource.clear();
        // 图形清空后测量结果已无对应实体：同步失效，避免 Agent 报出与画面不符的旧值
        olMeasureStore.reset();

        const drawLayerIds = userDataLayers
            .filter((item) => item?.sourceType === 'draw')
            .map((item) => item.id)
            .filter(Boolean);

        if (typeof removeManagedLayerById === 'function') {
            await Promise.allSettled(
                drawLayerIds.map((layerId) => removeManagedLayerById(layerId)),
            );
        } else {
            for (let i = userDataLayers.length - 1; i >= 0; i--) {
                if (userDataLayers[i].sourceType === 'draw') {
                    map.removeLayer(userDataLayers[i].layer);
                    userDataLayers.splice(i, 1);
                }
            }
            refreshUserLayerZIndex();
            emitUserLayersChange();
        }
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
        getSketchFeature,
    };
}
