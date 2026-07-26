/**
 * 高级 2D 绘制交互功能库
 * 负责矩形/椭圆/圆/箭头等 Draw 生命周期，并写入托管图层（sourceType: draw）。
 */

import Draw from 'ol/interaction/Draw';
import Snap from 'ol/interaction/Snap';
import { unByKey } from 'ol/Observable';
import {
    getEllipseGeometryFunction,
    getRectangleGeometryFunction,
} from './drawingGeometryUtils';
import {
    applyDrawingFeatureStyle,
    createDrawingStyleFromParams,
    setDrawingFeatureMetadata,
} from './useDrawingFeatureStyle';
import {
    getDrawingTypeLabel,
    getOpenLayersDrawType,
    isAdvancedDrawingType,
    normalizeDrawingStyleParams,
    toManagedStyleConfig,
} from './drawingToolRegistry';

/**
 * 工厂函数：创建高级绘制交互
 * @param {Object} options
 * @returns {Object}
 */
export function createAdvancedDrawingFeature({
    mapInstanceRef = { value: null },
    drawSource = null,
    createManagedVectorLayer = () => null,
    emitGraphicsOverview = () => {},
    emitUserLayersChange = () => {},
    drawStyleConfig = { value: {} },
    drawingStyleParamsRef = { value: {} },
    drawGraphicSeedRef = { value: 1 },
    userDataLayers = [],
} = {}) {
    let drawInteraction = null;
    let snapInteraction = null;
    const listenerKeys = [];

    /**
     * 读取当前绘制样式参数
     * @returns {Object}
     */
    function getCurrentDrawingParams() {
        const fromPanel = drawingStyleParamsRef?.value || {};
        const fromLayerStyle = drawStyleConfig?.value || {};
        return normalizeDrawingStyleParams({
            ...fromLayerStyle,
            ...fromPanel,
            // 兼容旧图层级字段
            fillOpacity:
                fromPanel.fillOpacity ??
                fromLayerStyle.fillOpacity ??
                fromPanel.fillOpacityPct / 100,
            radius: fromPanel.radius ?? fromLayerStyle.pointRadius ?? fromLayerStyle.radius,
        });
    }

    /**
     * 清理高级绘制交互
     */
    function clearAdvancedDrawingInteractions() {
        const map = mapInstanceRef.value;
        if (drawInteraction && map) map.removeInteraction(drawInteraction);
        if (snapInteraction && map) map.removeInteraction(snapInteraction);
        listenerKeys.forEach((key) => unByKey(key));
        listenerKeys.length = 0;
        drawInteraction = null;
        snapInteraction = null;

        const viewport = map?.getViewport?.();
        if (viewport) viewport.style.cursor = '';
    }

    /**
     * 构建 Draw 配置
     * @param {string} type
     * @param {Object} params
     * @returns {Object|null}
     */
    function buildDrawOptions(type) {
        const olType = getOpenLayersDrawType(type);
        if (!olType || !drawSource) return null;

        const options = {
            source: drawSource,
            type: olType,
            // 使用实时样式参数，保证激活工具后再切换虚线/颜色也能即时生效
            style: (feature) => createDrawingStyleFromParams(type, getCurrentDrawingParams(), feature),
        };

        if (type === 'Rectangle') {
            options.geometryFunction = getRectangleGeometryFunction();
        } else if (type === 'Ellipse') {
            options.geometryFunction = getEllipseGeometryFunction(64);
        }

        return options;
    }

    /**
     * 将绘制完成的 feature 转为托管图层
     * @param {Feature} feature
     * @param {string} type
     * @param {Object} params
     * @returns {Promise<string|null>}
     */
    async function commitDrawingFeature(feature, type, params) {
        if (!feature) return null;

        const nextParams = { ...params };
        if (type === 'CircleOutline') {
            const geometry = feature.getGeometry?.();
            if (geometry?.getRadius) {
                nextParams.radius = geometry.getRadius();
            }
        }

        setDrawingFeatureMetadata(feature, type, nextParams);
        applyDrawingFeatureStyle(feature);

        // OL Draw 会在 drawend 后再把 feature 插入 source：延迟移除，避免临时绘制层与托管图层重复显示
        window.setTimeout(() => drawSource?.removeFeature?.(feature), 0);

        const label = getDrawingTypeLabel(type);
        const seed = drawGraphicSeedRef.value++;
        const layerName = `绘制_${label}_${seed}`;
        const geometryType = feature.getGeometry?.()?.getType?.() || 'Geometry';

        const layerId = await createManagedVectorLayer({
            name: layerName,
            type: geometryType,
            sourceType: 'draw',
            features: [feature],
            styleConfig: toManagedStyleConfig(nextParams),
            autoLabel: false,
            metadata: {
                drawType: type,
                editorType: 'advanced-2d',
                styleParams: nextParams,
            },
            fitView: false,
        });

        emitGraphicsOverview();
        emitUserLayersChange();
        return layerId;
    }

    /**
     * 激活高级绘制工具
     * @param {string} type
     * @returns {boolean}
     */
    function activateAdvancedDrawing(type) {
        clearAdvancedDrawingInteractions();
        if (!isAdvancedDrawingType(type)) return false;

        const map = mapInstanceRef.value;
        if (!map || !drawSource) return false;

        const drawOptions = buildDrawOptions(type);
        if (!drawOptions) return false;

        drawInteraction = new Draw(drawOptions);
        listenerKeys.push(
            drawInteraction.on('drawend', (evt) => {
                // 异步提交，不阻塞 draw 生命周期；提交时读取最新面板样式
                Promise.resolve(commitDrawingFeature(evt.feature, type, getCurrentDrawingParams())).catch((error) => {
                    console.warn('[useAdvancedDrawing] commit failed:', error);
                });
            }),
        );

        map.addInteraction(drawInteraction);
        snapInteraction = new Snap({ source: drawSource });
        map.addInteraction(snapInteraction);

        const viewport = map.getViewport?.();
        if (viewport) viewport.style.cursor = 'crosshair';
        return true;
    }

    /**
     * 撤销最近创建的绘制托管图层
     * @param {Function} removeManagedLayerById
     * @returns {Promise<boolean>}
     */
    async function undoLastDrawingLayer(removeManagedLayerById) {
        const drawLayers = (userDataLayers || []).filter((item) => item?.sourceType === 'draw');
        const last = drawLayers[drawLayers.length - 1];
        if (!last?.id || typeof removeManagedLayerById !== 'function') return false;
        await removeManagedLayerById(last.id);
        emitGraphicsOverview();
        emitUserLayersChange();
        return true;
    }

    return {
        activateAdvancedDrawing,
        clearAdvancedDrawingInteractions,
        getCurrentDrawingParams,
        undoLastDrawingLayer,
        isAdvancedDrawingType,
    };
}
