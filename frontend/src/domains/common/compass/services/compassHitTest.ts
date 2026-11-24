/**
 * 功能名称：风水罗盘宫位极坐标命中判定
 * 日    期：2026-11-24
 * 说    明：2D 与 3D 共用的纯函数。调用方只需提供「距罗盘中心的距离、地理/屏幕方位角、
 *           罗盘半径」，即可按与绘制函数完全一致的层带与扇区规则算出命中宫位。
 */
import type { FengShuiCompassConfig } from '@common/compass/svg/types';
import { BASE_CONFIG_SIZE, clamp, toLayerArray } from './compassDrawUtils';

const TAU = Math.PI * 2;

/** 极坐标命中输入 */
export interface CompassPolarHitOptions {
    /** 点击点到罗盘中心的距离，单位与 radius 一致（2D=px，3D=米） */
    distance: number;
    /** 从正北顺时针计的方位角（弧度） */
    bearingRad: number;
    /** 罗盘外圆半径，单位与 distance 一致 */
    radius: number;
    /** 罗盘配置（主题） */
    config: Partial<FengShuiCompassConfig> | null | undefined;
    /** 罗盘旋转角（度） */
    rotationDeg: number;
}

/** 命中的宫位 */
export interface CompassPalaceHit {
    layerIndex: number;
    segmentIndex: number;
    data: string | string[];
}

/**
 * 按极坐标判定点击落在哪一层哪一宫。
 * @returns 命中宫位；落在天池内或罗盘外返回 null
 */
export function resolveCompassPalaceByPolar({
    distance,
    bearingRad,
    radius,
    config,
    rotationDeg,
}: CompassPolarHitOptions): CompassPalaceHit | null {
    const layers = toLayerArray(config?.data as FengShuiCompassConfig['data']);
    if (!layers.length) return null;

    const dist = Number(distance);
    const r = Number(radius);
    if (!Number.isFinite(dist) || !Number.isFinite(r) || r <= 0) return null;

    const configWidth = Number(config?.compassSize?.width || BASE_CONFIG_SIZE);
    const tianChiRatio = clamp(
        Number(config?.compassSize?.tianChiRadius || configWidth * 0.1) / Math.max(1, configWidth),
        0.06,
        0.22,
    );
    const tianChiRadius = r * tianChiRatio;
    const contentOuterRadius = config?.isShowScale !== false ? r * 0.82 : r * 0.95;
    if (dist < tianChiRadius || dist > contentOuterRadius) return null;

    const layerBand = (contentOuterRadius - tianChiRadius) / layers.length;
    const layerIndex = clamp(Math.floor((dist - tianChiRadius) / layerBand), 0, layers.length - 1);
    const layer = layers[layerIndex];
    if (!layer) return null;

    const segmentCount = Array.isArray(layer.data) ? Math.max(1, layer.data.length) : 1;
    const span = TAU / segmentCount;
    const startOffset = (Number(layer.startAngle || 0) * Math.PI) / 180;
    const rotationRad = (Number(rotationDeg || 0) * Math.PI) / 180;

    let angle = (bearingRad - rotationRad - startOffset) % TAU;
    if (angle < 0) angle += TAU;
    const segmentIndex = clamp(Math.floor(angle / span), 0, segmentCount - 1);
    const data = Array.isArray(layer.data)
        ? (layer.data[segmentIndex] ?? '')
        : (layer.data ?? '');

    return { layerIndex, segmentIndex, data: data as string | string[] };
}
