/**
 * 功能名称：Canvas 罗盘层边界/宫格几何
 * 日    期：2026-11-24
 * 说    明：2D OL renderer 与 3D Cesium 贴地纹理共用的纯 Canvas 路径工具。
 *           与 SVG 组件一致：circle 层画弧，polygon 层按宫位数连线成多边形。
 */
import type { Layer } from '@common/compass/svg/types';

const TAU = Math.PI * 2;

/**
 * 求任意角度到该层真实边界的半径。
 * circle 层返回外接圆半径；polygon 层按正多边形边心距求交：
 * ρ = R·cos(π/n) / cos(θ - φ)，φ 为最近边中点的法线角。
 */
export function getBoundaryRadiusAtAngle(
    layer: Layer | undefined,
    circumRadius: number,
    angle: number,
): number {
    const radius = Number(circumRadius);
    if (!Number.isFinite(radius) || radius <= 0) return radius;
    if (layer?.shape !== 'polygon') return radius;

    const sides = Array.isArray(layer?.data) ? layer.data.length : 0;
    if (sides < 3) return radius;

    const span = TAU / sides;
    const start = -Math.PI / 2 + (Number(layer.startAngle || 0) * Math.PI) / 180;
    let delta = (angle - start) % TAU;
    if (delta < 0) delta += TAU;

    const edgeIndex = Math.round(delta / span - 0.5);
    const edgeMidAngle = start + (edgeIndex + 0.5) * span;
    let diff = angle - edgeMidAngle;
    diff = (((diff + Math.PI) % TAU) + TAU) % TAU - Math.PI;

    return (radius * Math.cos(span / 2)) / Math.cos(diff);
}

/**
 * 绘制一层罗盘的外边界路径（不 fill/stroke，由调用方决定样式）
 * @param ctx Canvas 上下文（原点已在罗盘中心）
 * @param layer 当前层配置
 * @param outerR 层外半径
 * @param startOffset 层起始角（弧度），与分隔线/文字共用同一基准
 */
export function traceLayerBorder(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    outerR: number,
    startOffset = 0,
): void {
    const sides = Array.isArray(layer?.data) ? layer.data.length : 0;
    ctx.beginPath();
    if (layer?.shape === 'polygon' && sides >= 3) {
        for (let i = 0; i <= sides; i += 1) {
            const angle = -Math.PI / 2 + startOffset + (i * TAU) / sides;
            const x = Math.cos(angle) * outerR;
            const y = Math.sin(angle) * outerR;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        return;
    }
    ctx.arc(0, 0, outerR, 0, TAU);
}

/** 沿一层边界从 start 角走到 end 角；polygon 用折线采样，circle 用弧 */
function traceBoundarySegment(
    ctx: CanvasRenderingContext2D,
    layer: Layer | undefined,
    circumRadius: number,
    startAngle: number,
    endAngle: number,
): void {
    if (layer?.shape !== 'polygon') {
        ctx.arc(0, 0, circumRadius, startAngle, endAngle, endAngle < startAngle);
        return;
    }
    const sides = Array.isArray(layer?.data) ? layer.data.length : 3;
    const steps = Math.max(2, Math.ceil(Math.abs(endAngle - startAngle) / (TAU / sides)) * 2);
    for (let i = 0; i <= steps; i += 1) {
        const angle = startAngle + ((endAngle - startAngle) * i) / steps;
        const r = getBoundaryRadiusAtAngle(layer, circumRadius, angle);
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
}

/**
 * 绘制单个宫格路径，供选中高亮复用。
 * 内外边界都按各自层的真实形状求交，避免 polygon 层端点悬空。
 */
export function traceLattice(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    innerBoundaryLayer: Layer | undefined,
    innerR: number,
    outerR: number,
    segmentIndex: number,
    segmentCount: number,
    startOffset: number,
): void {
    const count = Math.max(1, segmentCount);
    const span = TAU / count;
    const a0 = -Math.PI / 2 + startOffset + segmentIndex * span;
    const a1 = a0 + span;
    const outerAtStart = getBoundaryRadiusAtAngle(layer, outerR, a0);

    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * outerAtStart, Math.sin(a0) * outerAtStart);
    traceBoundarySegment(ctx, layer, outerR, a0, a1);
    traceBoundarySegment(ctx, innerBoundaryLayer, innerR, a1, a0);
    ctx.closePath();
}
