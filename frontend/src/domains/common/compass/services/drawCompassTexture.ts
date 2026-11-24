/**
 * 功能名称：风水罗盘通用 Canvas 纹理绘制
 * 日    期：2026-11-24
 * 说    明：从 OL renderer 提炼的纯画布绘制函数，供 2D Canvas 与 Cesium ImageMaterialProperty 共用。
 *           不依赖 OL / Cesium 实例，只消费配置与 CanvasRenderingContext2D。
 */
import type { FengShuiCompassConfig, Layer } from '@common/compass/svg/types';
import {
    BASE_CONFIG_SIZE,
    clamp,
    drawRadialText,
    hexToRgba,
    normalizeAngle,
    resolveTextColor,
    toLayerArray,
} from './compassDrawUtils';
import { getBoundaryRadiusAtAngle, traceLattice, traceLayerBorder } from './compassCanvasGeometry';

/** 纹理绘制选项 */
export interface CompassTextureOptions {
    /** 输出画布边长（正方形），默认 1024 */
    size?: number;
    /** 渐变背景基色，默认黑色 */
    backgroundColor?: string;
    /** 罗盘旋转角（度），默认取 config.rotate */
    rotation?: number;
    /** 当前选中宫位，绘制高亮扇区 */
    selectedPalace?: { layerIndex: number; segmentIndex: number } | null;
}

/**
 * 绘制罗盘纹理到 Canvas
 * @param config 主题归一化后的罗盘配置
 * @param options 画布尺寸 / 背景色 / 旋转角
 * @returns 已绘制完成的透明底 Canvas（供 2D 或 3D 材质消费）
 */
export function drawCompassTexture(
    config: FengShuiCompassConfig,
    options: CompassTextureOptions = {},
): HTMLCanvasElement {
    const size = Math.max(256, Math.round(Number(options.size || 1024)));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const layers: Layer[] = toLayerArray(config?.data);
    if (!layers.length) return canvas;

    const center = size / 2;
    const radius = size * 0.46;
    const line = config?.line || {
        borderColor: '#AAAAAA',
        scaleColor: '#AAAAAA',
        scaleHighlightColor: '#FF0000',
    };
    const configWidth = Number(config?.compassSize?.width || BASE_CONFIG_SIZE);
    const tianChiRatio = clamp(
        Number(config?.compassSize?.tianChiRadius || configWidth * 0.1) / Math.max(1, configWidth),
        0.06,
        0.22,
    );
    const tianChiRadius = radius * tianChiRatio;
    const hasScale = config?.isShowScale !== false;
    const contentOuterRadius = hasScale ? radius * 0.82 : radius * 0.95;
    const layerBand = Math.max(
        1,
        (contentOuterRadius - tianChiRadius) / Math.max(1, layers.length),
    );

    // 背景渐变在旋转前绘制，避免旋转时背景出现方向性漂移
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
    const base = String(options.backgroundColor || '#000000');
    gradient.addColorStop(0, hexToRgba(base, 0.42));
    gradient.addColorStop(0.55, hexToRgba(base, 0.18));
    gradient.addColorStop(1, hexToRgba(base, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(
        (normalizeAngle(Number(options.rotation ?? config?.rotate ?? 0)) * Math.PI) / 180,
    );

    const strokeWidth = Math.max(1, radius / 260);
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = String(line.borderColor || '#AAAAAA');

    // 天池圆
    ctx.beginPath();
    ctx.arc(0, 0, tianChiRadius, 0, Math.PI * 2);
    ctx.stroke();

    const showUltraDenseText = radius >= 130;
    const showDenseText = radius >= 95;

    layers.forEach((layer, layerIndex) => {
        const innerR = tianChiRadius + layerBand * layerIndex;
        const outerR = innerR + layerBand;
        const segmentCount = Math.max(1, Array.isArray(layer?.data) ? layer.data.length : 0);
        const startOffset = (Number(layer?.startAngle || 0) * Math.PI) / 180;
        const innerBoundaryLayer = layers[layerIndex - 1];

        traceLayerBorder(ctx, layer, outerR, startOffset);
        ctx.stroke();

        // 选中宫位高亮：与 2D renderer 保持同一颜色与扇区角度
        const selected = options.selectedPalace;
        if (
            selected &&
            selected.layerIndex === layerIndex &&
            selected.segmentIndex >= 0 &&
            selected.segmentIndex < segmentCount
        ) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 215, 0, 0.38)';
            traceLattice(
                ctx,
                layer,
                innerBoundaryLayer,
                innerR,
                outerR,
                selected.segmentIndex,
                segmentCount,
                startOffset,
            );
            ctx.fill();
            ctx.restore();
        }

        for (let i = 0; i < segmentCount; i += 1) {
            const angle = -Math.PI / 2 + startOffset + (i * Math.PI * 2) / segmentCount;
            const startRadius = getBoundaryRadiusAtAngle(innerBoundaryLayer, innerR, angle);
            const endRadius = getBoundaryRadiusAtAngle(layer, outerR, angle);
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * startRadius, Math.sin(angle) * startRadius);
            ctx.lineTo(Math.cos(angle) * endRadius, Math.sin(angle) * endRadius);
            ctx.stroke();
        }

        if (
            (segmentCount >= 60 && !showUltraDenseText) ||
            (segmentCount >= 24 && !showDenseText)
        ) {
            return;
        }

        const defaultFont =
            clamp(Number(layer?.fontSize || 16), 8, 34) * (radius / (BASE_CONFIG_SIZE / 2));
        for (let i = 0; i < segmentCount; i += 1) {
            const angleMid =
                -Math.PI / 2 + startOffset + ((i + 0.5) * Math.PI * 2) / segmentCount;
            const label = Array.isArray(layer?.data) ? layer.data[i] : '';
            const drawR = innerR + layerBand * 0.52;

            if (Array.isArray(label)) {
                const rows = label.map((item) => String(item || '').trim()).filter(Boolean);
                const equally = (layer as Layer & { togetherStyle?: string }).togetherStyle === 'equally';
                rows.forEach((rowText, rowIndex) => {
                    const rr = equally ? drawR : innerR + layerBand * ((rowIndex + 1) / (rows.length + 1));
                    const offset = equally
                        ? (rowIndex - (rows.length - 1) / 2) * ((Math.PI * 2 / segmentCount) * 0.85 / rows.length)
                        : 0;
                    drawRadialText(
                        ctx,
                        angleMid + offset,
                        rr,
                        rowText,
                        defaultFont * (equally ? 0.85 : 0.76),
                        resolveTextColor(layer, rowIndex),
                        false,
                    );
                });
                continue;
            }

            drawRadialText(
                ctx,
                angleMid,
                drawR,
                String(label || ''),
                defaultFont,
                resolveTextColor(layer, i),
                Boolean((layer as Layer & { vertical?: boolean }).vertical),
            );
        }
    });

    if (hasScale) {
        const scale = config?.scaclStyle || {
            minLineHeight: 10,
            midLineHeight: 20,
            maxLineHeight: 25,
            numberFontSize: 13,
        };
        const scaleInner = radius * 0.825;
        const baseScale = radius / (BASE_CONFIG_SIZE / 2);
        const shortLen = clamp(Number(scale.minLineHeight || 10) * baseScale, 2, radius * 0.03);
        const midLen = clamp(Number(scale.midLineHeight || 20) * baseScale, 3, radius * 0.05);
        const longLen = clamp(Number(scale.maxLineHeight || 25) * baseScale, 4, radius * 0.06);
        const numberFont = clamp(Number(scale.numberFontSize || 13) * baseScale, 6, radius * 0.05);

        for (let degree = 0; degree < 360; degree += 1) {
            const angle = -Math.PI / 2 + (degree * Math.PI) / 180;
            const isTen = degree % 10 === 0;
            const isFive = degree % 5 === 0;
            const markLen = isTen ? longLen : isFive ? midLen : shortLen;
            const color = isTen
                ? String(line.scaleHighlightColor || '#FF0000')
                : String(line.scaleColor || '#AAAAAA');
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(0.5, baseScale * 0.8);
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * scaleInner, Math.sin(angle) * scaleInner);
            ctx.lineTo(Math.cos(angle) * (scaleInner + markLen), Math.sin(angle) * (scaleInner + markLen));
            ctx.stroke();
            if (isTen && radius > 120) {
                drawRadialText(ctx, angle, radius * 0.9, String(degree), numberFont * 1.5, color, false);
            }
        }
    }

    if (config?.isShowTianxinCross !== false) {
        ctx.strokeStyle = String(config?.tianxinCrossColor || '#FF0000');
        ctx.lineWidth = clamp(Number(config?.tianxinCrossWidth || 2), 1, 8) * (radius / (BASE_CONFIG_SIZE / 2));
        const crossHalf = radius / 3;
        ctx.beginPath();
        ctx.moveTo(-crossHalf, 0);
        ctx.lineTo(crossHalf, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -crossHalf);
        ctx.lineTo(0, crossHalf);
        ctx.stroke();
    }

    ctx.restore();
    return canvas;
}
