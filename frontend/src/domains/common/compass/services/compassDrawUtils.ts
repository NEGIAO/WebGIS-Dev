/**
 * 功能名称：风水罗盘绘制纯工具（颜色/角度/像素解析/径向文字）
 * 日    期：2026/11/13
 *
 * 从 CompassManager 拆出：不持有地图与 store 状态的绘制辅助函数。
 */

import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type { FengShuiCompassConfig, Layer } from '@common/compass/svg/types';

/** 画布逻辑尺寸基准（与配置坐标系一致） */
export const BASE_CONFIG_SIZE = 1000;

/** 携带 together 样式字段的矢量图层（罗盘宿主图层） */
export interface VectorLayerWithTogetherStyle extends VectorLayer<VectorSource> {
    togetherStyle?: 'equally' | 'stacked';
}


/**
 * 数值夹紧函数
 * 将数值限制在指定的最小值和最大值之间
 * @param value - 待夹紧的数值
 * @param minValue - 最小值
 * @param maxValue - 最大值
 * @returns 夹紧后的数值，若输入为 NaN 则返回最小值
 */
export function clamp(value: number, minValue: number, maxValue: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return minValue;
    return Math.max(minValue, Math.min(maxValue, numeric));
}
/**
 * 将 HEX 颜色转换为 rgba 字符串
 * 支持 3/4/6/8 位 hex 格式（如 #f00, #ff0000, #ff000080）
 * @param hex - HEX 颜色值
 * @param alpha - 不透明度 0~1
 * @returns rgba 字符串
 */
export function hexToRgba(hex: string, alpha: number): string {
    let h = String(hex || '#000000').replace('#', '').trim();
    // 展开 3 位短格式：f00 → ff0000
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    // 展开 4 位短格式（含 alpha）：f008 → ff000088
    if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
/**
 * 角度规范化函数
 * 将任意角度值转换为 [0, 360) 范围内的标准角度
 * @param value - 待规范化的角度值
 * @returns 规范化后的角度值（0-360）
 */
export function normalizeAngle(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const compact = numeric % 360;
    return compact < 0 ? compact + 360 : compact;
}
/**
 * 图层数据转换函数
 * 将指南针配置中的 data 字段转换为统一的 Layer 数组格式
 * @param data - 原始数据配置，可能是单个对象或数组
 * @returns 转换后的图层数组
 */
export function toLayerArray(data: FengShuiCompassConfig['data']): Layer[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return [data as Layer];
    return [];
}
/**
 * 文本颜色解析函数
 * 从图层配置中解析出指定索引的文本颜色
 * @param layer - 图层配置对象
 * @param textIndex - 文本行索引（用于数组类型的多色文本）
 * @returns 文本颜色值，默认为 '#F8FAFC'
 */
export function resolveTextColor(layer: Layer, textIndex = 0): string {
    const fallback = '#F8FAFC';
    if (Array.isArray(layer?.textColor)) {
        return String(layer.textColor[textIndex] || layer.textColor[0] || fallback);
    }
    return String(layer?.textColor || fallback);
}
/**
 * 像素坐标解析函数
 * 从 OpenLayers 渲染器提供的坐标数据中提取有效的 [x, y] 像素坐标
 * @param pixelCoordinates - 原始像素坐标数据（可能是嵌套数组结构）
 * @returns 解析后的 [x, y] 坐标对，若数据无效返回 null
 */
export function resolvePoint(pixelCoordinates: unknown): [number, number] | null {
    if (!Array.isArray(pixelCoordinates)) return null;

    if (Array.isArray(pixelCoordinates[0])) {
        const first = pixelCoordinates[0];
        if (!Array.isArray(first) || first.length < 2) return null;
        const x = Number(first[0]);
        const y = Number(first[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return [x, y];
    }

    if (pixelCoordinates.length < 2) return null;
    const x = Number(pixelCoordinates[0]);
    const y = Number(pixelCoordinates[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
}
/**
 * 放射性文本绘制函数
 * 在圆周上按指定角度、半径绘制旋转对齐的文本
 * 支持两种对齐模式：径向垂直（朝向圆心）和环形横向（沿切线方向）
 *
 * @param ctx - Canvas 2D 上下文
 * @param angleRad - 文本在圆周上的角度（弧度制）
 * @param radiusPx - 文本距离原点的半径（像素）
 * @param text - 待绘制的文本内容
 * @param fontSize - 字体大小（像素）
 * @param color - 文本颜色
 * @param vertical - 对齐模式
 *   - true: 径向垂直模式，文字沿半径方向朝向圆心
 *   - false: 环形横向模式，文字沿切线方向（垂直于半径）
 */
export function drawRadialText(
    ctx: CanvasRenderingContext2D,
    angleRad: number,
    radiusPx: number,
    text: string,
    fontSize: number,
    color: string,
    vertical = false, // true: 径向垂直(朝向圆心) | false: 环形横向(沿切线)
): void {
    const content = String(text || '').trim();
    if (!content) return;

    // 1. 计算文字在圆周上的位置
    const x = Math.cos(angleRad) * radiusPx;
    const y = Math.sin(angleRad) * radiusPx;

    ctx.save();
    ctx.translate(x, y); // 把原点移到文字位置（关键：旋转中心在这里）

    let rotate: number;

    if (vertical) {
        // 径向垂直：文字沿半径方向，朝向圆心
        rotate = angleRad;
        // 自动翻转：保证文字在所有位置都正立（不会倒着）
        if (angleRad > Math.PI / 2 && angleRad < (Math.PI * 3) / 2) {
            rotate += Math.PI;
        }
    } else {
        // 环形横向：文字沿切线方向（垂直于半径）
        rotate = angleRad + Math.PI / 2; // +90° 让文字垂直于半径，沿切线排列
        // 自动翻转：保证文字在所有位置都正立
        if (rotate > Math.PI / 2 && rotate < (Math.PI * 3) / 2) {
            rotate += Math.PI;
        }
    }

    ctx.rotate(rotate); // 应用旋转

    // 文字样式设置
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(fontSize)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.75, fontSize * 0.12);

    // 描边（抗锯齿，和原图效果一致）
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.strokeText(content, 0, 0);
    // 填充文字
    ctx.fillStyle = color;
    ctx.fillText(content, 0, 0);

    ctx.restore();
}
