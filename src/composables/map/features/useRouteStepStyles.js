import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

const BUS_STEP_COLOR_PALETTE = [
    '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'
];

const DRIVE_STEP_COLOR_PALETTE = [
    '#10B981', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'
];

/**
 * 路线步骤样式功能库
 * 职责：公交/驾车步骤样式生成与缓存，不关心业务数据来源。
 */
export function createRouteStepStyles() {
    const styleCache = new globalThis.Map();

    const hexToRgba = (hexColor, alpha = 1) => {
        const hex = String(hexColor || '').replace('#', '').trim();
        if (hex.length !== 6) return `rgba(59, 130, 246, ${alpha})`;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const getBusStepColor = (stepIndex) => {
        const idx = Math.abs(Number(stepIndex || 0)) % BUS_STEP_COLOR_PALETTE.length;
        return BUS_STEP_COLOR_PALETTE[idx];
    };

    const getDriveStepColor = (stepIndex) => {
        const idx = Math.abs(Number(stepIndex || 0)) % DRIVE_STEP_COLOR_PALETTE.length;
        return DRIVE_STEP_COLOR_PALETTE[idx];
    };

    const getBusStepStyle = (stepIndex, isWalk = false, isActive = false) => {
        const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
        const key = `${normalizedStep}_${isWalk ? 'walk' : 'transit'}_${isActive ? 'active' : 'normal'}`;
        if (styleCache.has(key)) return styleCache.get(key);

        const baseColor = getBusStepColor(normalizedStep);
        const color = isWalk
            ? hexToRgba(baseColor, isActive ? 0.9 : 0.6)
            : hexToRgba(baseColor, isActive ? 1 : 0.88);

        const style = new Style({
            stroke: new Stroke({
                color,
                width: isActive ? (isWalk ? 6 : 7) : (isWalk ? 4 : 5),
                lineDash: isWalk ? [8, 6] : undefined,
                lineCap: 'round',
                lineJoin: 'round'
            })
        });

        styleCache.set(key, style);
        return style;
    };

    const getBusStepPointStyle = (stepIndex, markerRole = 'segment-start', isActive = false, stationName = '') => {
        const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
        const role = markerRole === 'segment-end' ? 'segment-end' : 'segment-start';

        const baseColor = getBusStepColor(normalizedStep);
        const fillColor = role === 'segment-end'
            ? hexToRgba(baseColor, isActive ? 1 : 0.88)
            : hexToRgba(baseColor, isActive ? 0.9 : 0.72);

        const labelText = String(stationName || '').trim();

        return new Style({
            image: new CircleStyle({
                radius: isActive ? 7 : 5,
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: '#ffffff', width: 2 })
            }),
            text: labelText
                ? new Text({
                    text: labelText,
                    offsetY: role === 'segment-end' ? -14 : 14,
                    font: isActive ? '600 12px "Microsoft YaHei", sans-serif' : '500 11px "Microsoft YaHei", sans-serif',
                    fill: new Fill({ color: '#111827' }),
                    stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 })
                })
                : undefined
        });
    };

    const getDriveStepStyle = (stepIndex = 0, isActive = false, isStepSegment = false) => {
        if (!isStepSegment) {
            const key = 'drive_overview';
            if (styleCache.has(key)) return styleCache.get(key);

            const style = new Style({
                stroke: new Stroke({
                    color: 'rgba(5, 150, 105, 0.35)',
                    width: 4,
                    lineCap: 'round',
                    lineJoin: 'round'
                })
            });

            styleCache.set(key, style);
            return style;
        }

        const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
        const key = `drive_step_${normalizedStep}_${isActive ? 'active' : 'normal'}`;
        if (styleCache.has(key)) return styleCache.get(key);

        const color = hexToRgba(getDriveStepColor(normalizedStep), isActive ? 0.98 : 0.9);

        const style = new Style({
            stroke: new Stroke({
                color,
                width: isActive ? 8 : 6,
                lineCap: 'round',
                lineJoin: 'round'
            })
        });

        styleCache.set(key, style);
        return style;
    };

    const clearRouteStepStyleCache = () => {
        styleCache.clear();
    };

    return {
        getBusStepStyle,
        getBusStepPointStyle,
        getDriveStepStyle,
        clearRouteStepStyleCache
    };
}
