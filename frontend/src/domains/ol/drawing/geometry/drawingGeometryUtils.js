/**
 * 高级绘制几何纯函数
 * 从 basemap DrawingToolbar 提取并加固，不依赖 Vue / Map 实例。
 */

import { Polygon } from 'ol/geom';

/**
 * 校验二维坐标点
 * @param {unknown} point
 * @returns {boolean}
 */
function isValidPoint(point) {
    return (
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1])
    );
}

/**
 * 过滤非法坐标
 * @param {Array} coords
 * @returns {Array}
 */
function sanitizeCoords(coords = []) {
    return (coords || []).filter(isValidPoint);
}

/**
 * OpenLayers Draw geometryFunction：矩形
 * 使用 Circle 拖拽交互生成矩形 Polygon。
 * @returns {Function}
 */
export function getRectangleGeometryFunction() {
    return (coordinates, optGeometry) => {
        const geometry = optGeometry || new Polygon([]);
        const start = coordinates?.[0];
        const end = coordinates?.[coordinates.length - 1];
        if (!isValidPoint(start) || !isValidPoint(end)) {
            return geometry;
        }

        geometry.setCoordinates([
            [
                [start[0], start[1]],
                [start[0], end[1]],
                [end[0], end[1]],
                [end[0], start[1]],
                [start[0], start[1]],
            ],
        ]);
        return geometry;
    };
}

/**
 * OpenLayers Draw geometryFunction：椭圆（64 段近似）
 * @param {number} [steps=64]
 * @returns {Function}
 */
export function getEllipseGeometryFunction(steps = 64) {
    const segmentCount = Math.max(16, Number(steps) || 64);
    return (coordinates, optGeometry) => {
        const geometry = optGeometry || new Polygon([]);
        const start = coordinates?.[0];
        const end = coordinates?.[coordinates.length - 1];
        if (!isValidPoint(start) || !isValidPoint(end)) {
            return geometry;
        }

        const cx = (start[0] + end[0]) / 2;
        const cy = (start[1] + end[1]) / 2;
        const rx = Math.abs(end[0] - start[0]) / 2;
        const ry = Math.abs(end[1] - start[1]) / 2;
        const ringCoords = [];
        for (let i = 0; i <= segmentCount; i += 1) {
            const angle = (2 * Math.PI * i) / segmentCount;
            ringCoords.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
        }
        geometry.setCoordinates([ringCoords]);
        return geometry;
    };
}

/**
 * Catmull-Rom 曲线平滑
 * @param {Array<[number, number]>} points
 * @param {number} [numSegments=24]
 * @returns {Array<[number, number]>}
 */
export function catmullRomSmooth(points, numSegments = 24) {
    const safePoints = sanitizeCoords(points);
    if (safePoints.length < 3) return [...safePoints];

    const segments = Math.max(1, Number(numSegments) || 24);
    const result = [safePoints[0]];

    for (let i = 0; i < safePoints.length - 1; i += 1) {
        const p0 = safePoints[Math.max(i - 1, 0)];
        const p1 = safePoints[i];
        const p2 = safePoints[i + 1];
        const p3 = safePoints[Math.min(i + 2, safePoints.length - 1)];

        for (let j = 1; j <= segments; j += 1) {
            const t = j / (segments + 1);
            const t2 = t * t;
            const t3 = t2 * t;
            const x =
                0.5 *
                (2 * p1[0] +
                    (-p0[0] + p2[0]) * t +
                    (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                    (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
            const y =
                0.5 *
                (2 * p1[1] +
                    (-p0[1] + p2[1]) * t +
                    (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                    (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                result.push([x, y]);
            }
        }
    }

    result.push(safePoints[safePoints.length - 1]);
    return result;
}

/**
 * 构建渐变宽度箭头 Polygon（风向/军标共用）
 * @param {Array<[number, number]>} coords - 路径坐标
 * @param {Object} params - 样式参数
 * @param {boolean} [smooth=false] - 是否 Catmull-Rom 平滑
 * @returns {Polygon|null}
 */
export function buildTaperedArrowPolygon(coords, params = {}, smooth = false) {
    const safeCoords = sanitizeCoords(coords);
    if (safeCoords.length < 2) return null;

    let path = safeCoords;
    if (smooth && safeCoords.length >= 3) {
        path = catmullRomSmooth(safeCoords, 24);
    }
    if (path.length < 2) return null;

    const segLens = [];
    let totalLen = 0;
    for (let i = 1; i < path.length; i += 1) {
        const dx = path[i][0] - path[i - 1][0];
        const dy = path[i][1] - path[i - 1][1];
        const d = Math.sqrt(dx * dx + dy * dy);
        segLens.push(d);
        totalLen += d;
    }
    if (totalLen < 1e-6) totalLen = 1;

    const scale = Math.max(0.2, Number(params.arrowScale) || 1);
    const strokeWidth = Math.max(0.5, Number(params.strokeWidth) || 2);
    const headW = Math.max(1, Number(params.arrowHeadWidth) || 8) * scale;
    const bodyW = headW * 0.6;
    const tailW = Math.max(strokeWidth * 0.4, 1) * scale;

    const leftSide = [];
    const rightSide = [];
    let acc = 0;

    for (let i = 0; i < path.length; i += 1) {
        if (i > 0) acc += segLens[i - 1] || 0;
        const t = acc / totalLen;

        let halfWidth;
        if (t < 0.2) {
            halfWidth = tailW + (bodyW - tailW) * (t / 0.2);
        } else if (t < 0.8) {
            halfWidth = bodyW;
        } else {
            const p = (t - 0.8) / 0.2;
            halfWidth = bodyW + (headW - bodyW) * p;
        }

        let dx;
        let dy;
        if (i === 0) {
            dx = path[1][0] - path[0][0];
            dy = path[1][1] - path[0][1];
        } else if (i === path.length - 1) {
            dx = path[i][0] - path[i - 1][0];
            dy = path[i][1] - path[i - 1][1];
        } else {
            dx = path[i + 1][0] - path[i - 1][0];
            dy = path[i + 1][1] - path[i - 1][1];
        }

        const normalLen = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / normalLen;
        const ny = dx / normalLen;
        leftSide.push([path[i][0] + nx * halfWidth, path[i][1] + ny * halfWidth]);
        rightSide.push([path[i][0] - nx * halfWidth, path[i][1] - ny * halfWidth]);
    }

    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    const lastAngle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    const tipExtend = headW * 1.6;
    const tip = [
        last[0] + Math.cos(lastAngle) * tipExtend,
        last[1] + Math.sin(lastAngle) * tipExtend,
    ];

    const ring = [...leftSide, tip, ...rightSide.reverse()];
    if (!ring.length) return null;
    ring.push(ring[0]);
    return new Polygon([ring]);
}

/**
 * 构建小箭头头部三角形 Polygon
 * @param {Array<[number, number]>} coords
 * @param {Object} params
 * @returns {Polygon|null}
 */
export function buildSmallArrowHeadPolygon(coords, params = {}) {
    const safeCoords = sanitizeCoords(coords);
    if (safeCoords.length < 2) return null;

    const last = safeCoords[safeCoords.length - 1];
    const prev = safeCoords[safeCoords.length - 2];
    const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    const scale = Math.max(0.2, Number(params.arrowScale) || 1);
    const headW = Math.max(1, Number(params.arrowHeadWidth) || 5);
    const headLen = 10 * scale;
    const halfW = headW * scale * 0.8;

    const tip = [last[0] + Math.cos(angle) * headLen, last[1] + Math.sin(angle) * headLen];
    const baseLeft = [
        last[0] + Math.cos(angle + Math.PI / 2) * halfW,
        last[1] + Math.sin(angle + Math.PI / 2) * halfW,
    ];
    const baseRight = [
        last[0] + Math.cos(angle - Math.PI / 2) * halfW,
        last[1] + Math.sin(angle - Math.PI / 2) * halfW,
    ];

    return new Polygon([[tip, baseLeft, baseRight, tip]]);
}
