import Style from 'ol/style/Style';
import type { FengShuiCompassConfig, Layer } from '../components/feng-shui-compass-svg/types';

export type CompassVectorRenderState = {
    enabled: boolean;
    mode: 'vector' | 'hud';
    opacity: number;
    rotation: number;
    physicalDiameterMeters: number;
    minResolution: number;
    config: FengShuiCompassConfig;
    renderCacheToken: string;
};

type CompassRenderStateGetter = () => CompassVectorRenderState;

const SPRITE_CACHE_LIMIT = 28;
const BASE_CONFIG_SIZE = 800;

function clamp(value: number, minValue: number, maxValue: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return minValue;
    return Math.max(minValue, Math.min(maxValue, numeric));
}

function normalizeAngle(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const compact = numeric % 360;
    return compact < 0 ? compact + 360 : compact;
}

function toLayerArray(data: FengShuiCompassConfig['data']): Layer[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return [data as Layer];
    return [];
}

function quantizePixelDiameter(value: number): number {
    const clamped = clamp(value, 120, 2600);
    return Math.max(120, Math.round(clamped / 8) * 8);
}

function resolveTextColor(layer: Layer, textIndex = 0): string {
    const fallback = '#F8FAFC';
    if (Array.isArray(layer?.textColor)) {
        return String(layer.textColor[textIndex] || layer.textColor[0] || fallback);
    }
    return String(layer?.textColor || fallback);
}

function resolvePoint(pixelCoordinates: any): [number, number] | null {
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

function createSpriteCanvas(size: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
}

function drawRadialText(
    ctx: CanvasRenderingContext2D,
    center: number,
    angleRad: number,
    radius: number,
    text: string,
    fontSize: number,
    color: string
): void {
    if (!text) return;

    const x = center + Math.cos(angleRad) * radius;
    const y = center + Math.sin(angleRad) * radius;

    ctx.save();
    ctx.translate(x, y);

    let rotate = angleRad + Math.PI / 2;
    if (rotate > Math.PI / 2 && rotate < (Math.PI * 3) / 2) {
        rotate += Math.PI;
    }
    ctx.rotate(rotate);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(fontSize)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.fillText(String(text), 0, 0);
    ctx.restore();
}

function drawCompassSprite(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: FengShuiCompassConfig
): void {
    const center = size / 2;
    const radius = Math.max(2, center - 2);

    const layers = toLayerArray(config?.data);
    if (!layers.length) return;

    const lineStyle = config?.line || {
        borderColor: '#AAAAAA',
        scaleColor: '#AAAAAA',
        scaleHighlightColor: '#FF0000'
    };

    const configWidth = Number(config?.compassSize?.width || BASE_CONFIG_SIZE);
    const rawTianChi = Number(config?.compassSize?.tianChiRadius || BASE_CONFIG_SIZE * 0.1);
    const tianChiRatio = clamp(rawTianChi / Math.max(1, configWidth), 0.06, 0.22);
    const tianChiRadius = radius * tianChiRatio;

    const hasScaleRing = config?.isShowScale !== false;
    const layerOuterRadius = hasScaleRing ? radius * 0.82 : radius * 0.95;
    const layerBand = Math.max(2, (layerOuterRadius - tianChiRadius) / Math.max(1, layers.length));

    ctx.clearRect(0, 0, size, size);

    // Tianchi core circle.
    ctx.save();
    ctx.strokeStyle = String(lineStyle.borderColor || '#AAAAAA');
    ctx.lineWidth = Math.max(1, size / 600);
    ctx.beginPath();
    ctx.arc(center, center, tianChiRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Layer rings, separators and labels.
    layers.forEach((layer, layerIndex) => {
        const innerR = tianChiRadius + layerBand * layerIndex;
        const outerR = innerR + layerBand;

        const segmentCountRaw = Array.isArray(layer?.data) ? layer.data.length : 0;
        const segmentCount = Math.max(1, segmentCountRaw);
        const startAngleOffset = (Number(layer?.startAngle || 0) * Math.PI) / 180;

        ctx.save();
        ctx.strokeStyle = String(lineStyle.borderColor || '#AAAAAA');
        ctx.lineWidth = Math.max(0.8, size / 900);

        // Outer boundary of the current ring.
        ctx.beginPath();
        ctx.arc(center, center, outerR, 0, Math.PI * 2);
        ctx.stroke();

        // Segment dividers.
        for (let i = 0; i < segmentCount; i += 1) {
            const angle = -Math.PI / 2 + startAngleOffset + (i * Math.PI * 2) / segmentCount;
            const sx = center + Math.cos(angle) * innerR;
            const sy = center + Math.sin(angle) * innerR;
            const ex = center + Math.cos(angle) * outerR;
            const ey = center + Math.sin(angle) * outerR;

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
        }
        ctx.restore();

        // Segment text.
        for (let i = 0; i < segmentCount; i += 1) {
            const angleMid = -Math.PI / 2 + startAngleOffset + ((i + 0.5) * Math.PI * 2) / segmentCount;
            const textRadius = innerR + layerBand * 0.52;
            const fontSizeBase = clamp(Number(layer?.fontSize || 16), 9, 34) * (size / BASE_CONFIG_SIZE);

            const label = Array.isArray(layer?.data) ? layer.data[i] : '';
            if (Array.isArray(label)) {
                const rows = label.map((item) => String(item || '').trim()).filter(Boolean);
                const rowCount = Math.max(1, rows.length);
                rows.forEach((rowText, rowIndex) => {
                    const rowRadius = innerR + layerBand * ((rowIndex + 1) / (rowCount + 1));
                    drawRadialText(
                        ctx,
                        center,
                        angleMid,
                        rowRadius,
                        rowText,
                        fontSizeBase * 0.76,
                        resolveTextColor(layer, rowIndex)
                    );
                });
                continue;
            }

            drawRadialText(
                ctx,
                center,
                angleMid,
                textRadius,
                String(label || ''),
                fontSizeBase,
                resolveTextColor(layer, i)
            );
        }
    });

    // Scale ring outside the content rings.
    if (hasScaleRing) {
        const scaleStyle = config?.scaclStyle || {
            minLineHeight: 10,
            midLineHeight: 20,
            maxLineHeight: 25
        };

        const scaleBase = size / BASE_CONFIG_SIZE;
        const shortLen = clamp(Number(scaleStyle.minLineHeight || 10) * scaleBase, 3, 26);
        const midLen = clamp(Number(scaleStyle.midLineHeight || 20) * scaleBase, 4, 32);
        const longLen = clamp(Number(scaleStyle.maxLineHeight || 25) * scaleBase, 6, 40);
        const numberFont = clamp(Number(scaleStyle.numberFontSize || 12) * scaleBase, 8, 18);

        const scaleInnerRadius = layerOuterRadius + 2;

        ctx.save();
        ctx.lineWidth = Math.max(0.8, size / 1000);

        for (let degree = 0; degree < 360; degree += 1) {
            const angle = -Math.PI / 2 + (degree * Math.PI) / 180;
            const isTenMark = degree % 10 === 0;
            const isFiveMark = degree % 5 === 0;
            const markLen = isTenMark ? longLen : isFiveMark ? midLen : shortLen;
            const markColor = isTenMark
                ? String(lineStyle.scaleHighlightColor || '#FF0000')
                : String(lineStyle.scaleColor || '#AAAAAA');

            const sx = center + Math.cos(angle) * scaleInnerRadius;
            const sy = center + Math.sin(angle) * scaleInnerRadius;
            const ex = center + Math.cos(angle) * (scaleInnerRadius + markLen);
            const ey = center + Math.sin(angle) * (scaleInnerRadius + markLen);

            ctx.strokeStyle = markColor;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();

            if (isTenMark) {
                drawRadialText(
                    ctx,
                    center,
                    angle,
                    scaleInnerRadius + markLen + numberFont * 0.95,
                    String(degree),
                    numberFont,
                    markColor
                );
            }
        }

        ctx.restore();
    }

    // Tianxin cross is constrained to exactly 1/3 of the compass radius.
    if (config?.isShowTianxinCross !== false) {
        const crossHalfLength = radius / 3;
        ctx.save();
        ctx.strokeStyle = String(config?.tianxinCrossColor || '#FF0000');
        ctx.lineWidth = clamp(Number(config?.tianxinCrossWidth || 2), 1, 8) * (size / BASE_CONFIG_SIZE);

        ctx.beginPath();
        ctx.moveTo(center - crossHalfLength, center);
        ctx.lineTo(center + crossHalfLength, center);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(center, center - crossHalfLength);
        ctx.lineTo(center, center + crossHalfLength);
        ctx.stroke();
        ctx.restore();
    }
}

export function createCompassVectorStyleRenderer(getState: CompassRenderStateGetter): {
    style: Style;
    clearCache: () => void;
} {
    const spriteCache = new Map<string, HTMLCanvasElement>();

    function clearCache(): void {
        spriteCache.clear();
    }

    function getOrCreateSprite(key: string, size: number, config: FengShuiCompassConfig): HTMLCanvasElement | null {
        const cached = spriteCache.get(key);
        if (cached) {
            spriteCache.delete(key);
            spriteCache.set(key, cached);
            return cached;
        }

        const canvas = createSpriteCanvas(size);
        if (!canvas) return null;

        const context = canvas.getContext('2d');
        if (!context) return null;

        drawCompassSprite(context, size, config);

        if (spriteCache.size >= SPRITE_CACHE_LIMIT) {
            const oldestKey = spriteCache.keys().next().value;
            if (oldestKey) spriteCache.delete(oldestKey);
        }

        spriteCache.set(key, canvas);
        return canvas;
    }

    const style = new Style({
        renderer: (pixelCoordinates: any, renderState: any) => {
            const state = getState();
            if (!state?.enabled || state?.mode !== 'vector') return;

            const resolution = Number(renderState?.resolution);
            if (!Number.isFinite(resolution) || resolution <= 0) return;

            const minResolution = clamp(Number(state?.minResolution || 450), 0.01, 50000);
            if (resolution > minResolution) return;

            const diameterPxRaw = Number(state?.physicalDiameterMeters || 220) / resolution;
            const diameterPx = quantizePixelDiameter(diameterPxRaw);
            if (!Number.isFinite(diameterPx) || diameterPx < 8) return;

            const spriteKey = `${String(state.renderCacheToken || '')}|${diameterPx}`;
            const sprite = getOrCreateSprite(spriteKey, diameterPx, state.config);
            if (!sprite) return;

            const point = resolvePoint(pixelCoordinates);
            if (!point) return;
            const [x, y] = point;

            const context = renderState?.context;
            if (!context) return;

            const opacity = clamp(Number(state?.opacity || 0.9), 0.1, 1);
            const rotationRad = (normalizeAngle(Number(state?.rotation || 0)) * Math.PI) / 180;

            context.save();
            context.globalAlpha = opacity;
            context.translate(x, y);
            context.rotate(rotationRad);
            context.drawImage(sprite, -diameterPx / 2, -diameterPx / 2, diameterPx, diameterPx);
            context.restore();
        }
    });

    return {
        style,
        clearCache
    };
}
