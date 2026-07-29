/**
 * 绘制要素样式功能库
 * 负责 drawType/styleParams 驱动的基础形状、箭头、军标与选中高亮样式。
 */

import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import {
    buildSmallArrowHeadPolygon,
    buildTaperedArrowPolygon,
} from '@ol/drawing/geometry/drawingGeometryUtils';
import {
    hasFill,
    isArrowTool,
    normalizeDrawingStyleParams,
} from '@ol/drawing/registry/drawingToolRegistry';

/**
 * 将 HEX 颜色转换为 rgba 字符串
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
export function hexToRgba(hex, alpha = 1) {
    const safeHex = String(hex || '#27AE60').replace('#', '');
    if (safeHex.length !== 6) return `rgba(39, 174, 96, ${alpha})`;
    const r = parseInt(safeHex.slice(0, 2), 16);
    const g = parseInt(safeHex.slice(2, 4), 16);
    const b = parseInt(safeHex.slice(4, 6), 16);
    if (![r, g, b].every(Number.isFinite)) return `rgba(39, 174, 96, ${alpha})`;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 构建通用描边配置
 * @param {Object} params
 * @returns {Stroke}
 */
export function buildDrawingStroke(params = {}) {
    const p = normalizeDrawingStyleParams(params);
    const strokeOptions = {
        color: hexToRgba(p.strokeColor, p.strokeOpacity),
        width: p.strokeWidth,
        lineCap: 'round',
        lineJoin: 'round',
    };
    if (p.strokeDashType === 'dashed') {
        strokeOptions.lineDash = [p.dashLength, p.dashGap];
    }
    return new Stroke(strokeOptions);
}

/**
 * 创建普通点线面/圆样式
 * @param {string} drawType
 * @param {Object} params
 * @returns {Style|null}
 */
export function createBasicDrawingStyle(drawType, params = {}) {
    const p = normalizeDrawingStyleParams(params);
    if (drawType === 'Point') {
        return new Style({
            image: new CircleStyle({
                radius: p.radius,
                fill: new Fill({ color: hexToRgba(p.strokeColor, p.strokeOpacity * 0.3) }),
                stroke: new Stroke({
                    color: hexToRgba(p.strokeColor, p.strokeOpacity),
                    width: p.strokeWidth,
                }),
            }),
        });
    }

    if (drawType === 'LineString') {
        return new Style({ stroke: buildDrawingStroke(p) });
    }

    if (drawType === 'CircleOutline') {
        return new Style({ stroke: buildDrawingStroke(p) });
    }

    if (hasFill(drawType) || ['Polygon', 'Rectangle', 'Ellipse'].includes(drawType)) {
        return new Style({
            stroke: buildDrawingStroke(p),
            fill: new Fill({ color: hexToRgba(p.fillColor, p.fillOpacity) }),
        });
    }

    return new Style({ stroke: buildDrawingStroke(p) });
}

/**
 * 创建小箭头样式（线 + 三角箭头头）
 * @param {Feature} feature
 * @param {Object} params
 * @returns {Style|Style[]}
 */
export function createSmallArrowStyle(feature, params = {}) {
    const p = normalizeDrawingStyleParams(params);
    const geometry = feature?.getGeometry?.();
    const coords = geometry?.getCoordinates?.();
    const arrowHead = buildSmallArrowHeadPolygon(coords, p);
    if (!arrowHead) return new Style({ stroke: buildDrawingStroke(p) });

    const rgba = hexToRgba(p.strokeColor, p.strokeOpacity);
    return [
        new Style({ stroke: buildDrawingStroke(p) }),
        new Style({
            geometry: arrowHead,
            fill: new Fill({ color: rgba }),
            stroke: new Stroke({ color: rgba, width: 1 }),
        }),
    ];
}

/**
 * 创建风向箭头样式（平滑渐宽 Polygon）
 * @param {Feature} feature
 * @param {Object} params
 * @returns {Style}
 */
export function createWindArrowStyle(feature, params = {}) {
    const p = normalizeDrawingStyleParams(params);
    const coords = feature?.getGeometry?.()?.getCoordinates?.();
    const polygon = buildTaperedArrowPolygon(coords, p, true);
    if (!polygon) return new Style({ stroke: buildDrawingStroke(p) });

    return new Style({
        geometry: polygon,
        stroke: new Stroke({
            color: hexToRgba(p.strokeColor, p.strokeOpacity),
            width: p.strokeWidth,
            lineJoin: 'round',
            lineCap: 'round',
        }),
        fill: new Fill({ color: hexToRgba(p.fillColor || p.strokeColor, p.fillOpacity) }),
    });
}

/**
 * 创建军标攻击箭头样式（Canvas renderer + 渐变填充）
 * @param {Feature} feature
 * @param {Object} params
 * @returns {Style}
 */
export function createBattleArrowStyle(feature, params = {}) {
    const p = normalizeDrawingStyleParams(params);
    return new Style({
        renderer: (pixelCoordinates, state) => {
            const geometry = state.geometry || feature?.getGeometry?.();
            const coords = geometry?.getCoordinates?.();
            const polygon = buildTaperedArrowPolygon(coords, p, false);
            if (!polygon) return;

            const ring = polygon.getCoordinates?.()?.[0];
            if (!ring?.length) return;

            const transform = state.coordinateToPixelTransform;
            let pixelRing = null;
            if (transform) {
                pixelRing = ring.map((coord) => [
                    transform[0] * coord[0] + transform[2] * coord[1] + transform[4],
                    transform[1] * coord[0] + transform[3] * coord[1] + transform[5],
                ]);
            } else if (Array.isArray(pixelCoordinates)) {
                pixelRing = normalizePixelCoordinates(pixelCoordinates, p);
            }
            if (!pixelRing?.length) return;

            const context = state.context;
            if (!context) return;

            const tail = pixelRing[0];
            const head = pixelRing[Math.floor(pixelRing.length / 2)] || pixelRing[pixelRing.length - 1];
            const gradient = context.createLinearGradient(tail[0], tail[1], head[0], head[1]);
            gradient.addColorStop(0, hexToRgba(p.gradientStartColor, p.gradientStartOpacity));
            gradient.addColorStop(1, hexToRgba(p.gradientEndColor, p.gradientEndOpacity));

            context.save();
            context.beginPath();
            context.moveTo(pixelRing[0][0], pixelRing[0][1]);
            for (let i = 1; i < pixelRing.length; i += 1) {
                context.lineTo(pixelRing[i][0], pixelRing[i][1]);
            }
            context.closePath();
            context.fillStyle = gradient;
            context.fill();
            context.strokeStyle = hexToRgba(p.strokeColor, p.strokeOpacity);
            context.lineWidth = p.strokeWidth;
            context.lineJoin = 'round';
            context.lineCap = 'round';
            context.stroke();
            context.restore();
        },
    });
}

/**
 * 创建 drawType/styleParams 对应样式
 * @param {string} drawType
 * @param {Object} params
 * @param {Feature} [feature]
 * @returns {Style|Style[]|null}
 */
export function createDrawingStyleFromParams(drawType, params = {}, feature = null) {
    if (drawType === 'Arrow') return createSmallArrowStyle(feature, params);
    if (drawType === 'WindArrow') return createWindArrowStyle(feature, params);
    if (drawType === 'BattleArrow') return createBattleArrowStyle(feature, params);
    return createBasicDrawingStyle(drawType, params);
}

/**
 * 将要素自身的 drawType/styleParams 应用为 OL style
 * @param {Feature} feature
 * @returns {Style|Style[]|null}
 */
export function applyDrawingFeatureStyle(feature) {
    const drawType = feature?.get?.('drawType');
    const params = feature?.get?.('styleParams');
    if (!drawType || !params) return null;
    const style = createDrawingStyleFromParams(drawType, params, feature);
    if (style) feature.setStyle(style);
    return style;
}

/**
 * 构建选中高亮叠加样式（光晕 + 虚线描边），供绘制/通用两种高亮复用
 * @param {Object} params - 归一化后的样式参数（取线宽/半径作为高亮基准）
 * @returns {Style[]}
 */
function buildSelectionOverlayStyles(params) {
    const outerGlow = new Style({
        stroke: new Stroke({
            color: 'rgba(26, 188, 156, 0.55)',
            width: params.strokeWidth + 6,
            lineCap: 'round',
            lineJoin: 'round',
        }),
        fill: new Fill({ color: 'rgba(26, 188, 156, 0.08)' }),
        image: new CircleStyle({
            radius: params.radius + 8,
            fill: new Fill({ color: 'rgba(26, 188, 156, 0.12)' }),
            stroke: new Stroke({ color: 'rgba(26, 188, 156, 0.6)', width: 3 }),
        }),
    });

    const innerDash = new Style({
        stroke: new Stroke({
            color: '#1ABC9C',
            width: params.strokeWidth + 2,
            lineCap: 'round',
            lineJoin: 'round',
            lineDash: [8, 4],
        }),
        image: new CircleStyle({
            radius: params.radius + 4,
            fill: new Fill({ color: 'rgba(26, 188, 156, 0.08)' }),
            stroke: new Stroke({ color: '#1ABC9C', width: 2.5, lineDash: [6, 3] }),
        }),
    });

    return [outerGlow, innerDash];
}

/**
 * 创建选中高亮样式（绘制要素：基础样式 + 高亮叠加）
 * @param {Feature} feature
 * @returns {Style[]}
 */
export function createSelectionHighlightStyle(feature) {
    const params = normalizeDrawingStyleParams(feature?.get?.('styleParams') || {});
    const drawType = feature?.get?.('drawType');
    const baseStyle = createDrawingStyleFromParams(drawType, params, feature);
    const baseStyles = Array.isArray(baseStyle) ? baseStyle : baseStyle ? [baseStyle] : [];
    return [...baseStyles, ...buildSelectionOverlayStyles(params)];
}

/**
 * 创建通用选中高亮样式（非绘制来源要素：上传/搜索/行政区划）
 * 仅返回光晕 + 虚线描边叠加，不重建基础样式，避免覆盖原图层样式语义
 * @param {Object} [params] - 可选样式参数（用于线宽/点半径基准）
 * @returns {Style[]}
 */
export function createGenericSelectionHighlightStyle(params = {}) {
    return buildSelectionOverlayStyles(normalizeDrawingStyleParams(params));
}

/**
 * 判断 feature 是否高级绘制要素
 * @param {Feature} feature
 * @returns {boolean}
 */
export function isDrawingStyledFeature(feature) {
    return !!feature?.get?.('drawType') && !!feature?.get?.('styleParams');
}

/**
 * 设置要素绘制类型与样式参数
 * @param {Feature} feature
 * @param {string} drawType
 * @param {Object} params
 * @returns {Object}
 */
export function setDrawingFeatureMetadata(feature, drawType, params = {}) {
    const normalized = normalizeDrawingStyleParams(params);
    feature?.set?.('drawType', drawType);
    feature?.set?.('styleParams', normalized);
    return normalized;
}

/**
 * Canvas renderer 回退路径：将像素路径转换为箭头 Polygon 的像素环
 * @param {Array} pixelCoordinates
 * @param {Object} params
 * @returns {Array|null}
 */
function normalizePixelCoordinates(pixelCoordinates, params) {
    if (!Array.isArray(pixelCoordinates) || !pixelCoordinates.length) return null;
    let path = pixelCoordinates;
    if (!Array.isArray(pixelCoordinates[0])) {
        path = [];
        for (let i = 0; i < pixelCoordinates.length; i += 2) {
            path.push([pixelCoordinates[i], pixelCoordinates[i + 1]]);
        }
    }
    const pixelPolygon = buildTaperedArrowPolygon(path, params, false);
    return pixelPolygon?.getCoordinates?.()?.[0] || null;
}

/**
 * 当前工具是否需要高级要素样式
 * @param {string} drawType
 * @returns {boolean}
 */
export function needsDrawingFeatureStyle(drawType) {
    return isArrowTool(drawType) || ['Point', 'LineString', 'Polygon', 'Rectangle', 'Ellipse', 'CircleOutline'].includes(drawType);
}
