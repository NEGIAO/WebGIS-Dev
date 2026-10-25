/**
 * drawGeometry.ts — Cesium 绘制 / 测量的纯几何算法
 *
 * 设计约束：
 * - **不 import Cesium**：所有入参出参均为「度」为单位的经纬度或纯数值，
 *   便于 `tsc --noEmit` 通过，也便于脱离三维场景单独验证算法。
 * - 口径与 `useCesiumDrawMeasure` 既有实现保持一致：局部平面近似
 *   （111320 m/°lon × cos(lat)、110540 m/°lat），适用于测量工具的典型近地小范围。
 *
 * 调用方：`drawEntityFactory.ts`（成品实体与标注锚点）、`useCesiumDrawMeasure.js`（载荷组装）。
 */

/** 经纬度点：[经度, 纬度]，单位度 */
export type LonLat = [number, number];

/** 每度经纬对应的米数（局部平面近似） */
export interface MetersPerDegree {
    mx: number;
    my: number;
}

/** 经纬度矩形边界（度） */
export interface RectBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

/** 赤道处每度经度米数 */
const METERS_PER_DEG_LON = 111320;
/** 每度纬度米数 */
const METERS_PER_DEG_LAT = 110540;

/**
 * 指定纬度处每度经/纬度对应的米数。
 * @param latDeg 纬度（度）
 */
export function metersPerDegree(latDeg: number): MetersPerDegree {
    return {
        mx: METERS_PER_DEG_LON * Math.cos((latDeg * Math.PI) / 180),
        my: METERS_PER_DEG_LAT,
    };
}

/**
 * 两点地面距离（米），局部平面近似。
 * @param a 起点 [lon, lat]
 * @param b 终点 [lon, lat]
 */
export function groundDistance(a: LonLat, b: LonLat): number {
    const { mx, my } = metersPerDegree((a[1] + b[1]) / 2);
    return Math.hypot((b[0] - a[0]) * mx, (b[1] - a[1]) * my);
}

/**
 * 多边形投影面积（㎡）与周长（m）。
 * 以首点纬度为基准做等距展开，再用鞋带公式求面积。
 * @param lonLats 顶点序列（不要求闭合，内部按环处理）
 */
export function polygonAreaPerimeter(lonLats: LonLat[]): { area: number; perimeter: number } {
    const n = lonLats.length;
    if (n < 3) return { area: 0, perimeter: 0 };

    const { mx, my } = metersPerDegree(lonLats[0][1]);
    let perimeter = 0;
    let twiceArea = 0;

    for (let i = 0; i < n; i++) {
        const a = lonLats[i];
        const b = lonLats[(i + 1) % n];
        const ax = a[0] * mx;
        const ay = a[1] * my;
        const bx = b[0] * mx;
        const by = b[1] * my;
        perimeter += Math.hypot(bx - ax, by - ay);
        twiceArea += ax * by - bx * ay;
    }

    return { area: Math.abs(twiceArea) / 2, perimeter };
}

/**
 * 折线长度（米）。
 * @param lonLats 端点序列
 */
export function polylineLength(lonLats: LonLat[]): number {
    let total = 0;
    for (let i = 1; i < lonLats.length; i++) {
        total += groundDistance(lonLats[i - 1], lonLats[i]);
    }
    return total;
}

/**
 * 经纬度矩形的跨度、面积与周长。
 * @param rect 度制边界
 */
export function rectangleMetrics(rect: RectBounds): {
    width: number;
    height: number;
    area: number;
    perimeter: number;
} {
    const { mx, my } = metersPerDegree((rect.south + rect.north) / 2);
    const width = Math.abs(rect.east - rect.west) * mx;
    const height = Math.abs(rect.north - rect.south) * my;
    return {
        width,
        height,
        area: width * height,
        perimeter: 2 * (width + height),
    };
}

/** 矩形四角，按 西南 → 东南 → 东北 → 西北 顺序（与 GeoJSON 环方向一致） */
export function rectangleCorners(rect: RectBounds): LonLat[] {
    return [
        [rect.west, rect.south],
        [rect.east, rect.south],
        [rect.east, rect.north],
        [rect.west, rect.north],
    ];
}

/**
 * 以圆心 + 半径生成近似圆的闭合折线（经纬度序列，首尾不重复）。
 * @param center 圆心 [lon, lat]
 * @param radiusM 半径（米）
 * @param segments 分段数，默认 64（与 Demo 一致）
 */
export function circleRingLonLats(center: LonLat, radiusM: number, segments = 64): LonLat[] {
    const { mx, my } = metersPerDegree(center[1]);
    const ring: LonLat[] = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        ring.push([
            center[0] + (radiusM * Math.cos(angle)) / mx,
            center[1] + (radiusM * Math.sin(angle)) / my,
        ]);
    }
    return ring;
}

/**
 * 方位角（度）：0° 为正北，顺时针增大，范围 [0, 360)。
 * @param from 起点 [lon, lat]
 * @param to 终点 [lon, lat]
 */
export function bearingDegrees(from: LonLat, to: LonLat): number {
    const { mx, my } = metersPerDegree(from[1]);
    const dx = (to[0] - from[0]) * mx;
    const dy = (to[1] - from[1]) * my;
    const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
    return (deg + 360) % 360;
}

/**
 * 多边形面积重心（鞋带公式）。
 * 自相交或退化时返回 null，调用方应回退到顶点平均值。
 * @param lonLats 顶点序列
 */
export function polygonCentroid(lonLats: LonLat[]): LonLat | null {
    const n = lonLats.length;
    if (n < 3) return null;

    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
        const [x1, y1] = lonLats[i];
        const [x2, y2] = lonLats[(i + 1) % n];
        const cross = x1 * y2 - x2 * y1;
        a += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }
    if (Math.abs(a) < 1e-12) return null;
    return [cx / (3 * a), cy / (3 * a)];
}

/** 顶点算术平均（重心退化时的兜底锚点） */
export function averageLonLat(lonLats: LonLat[]): LonLat | null {
    const n = lonLats.length;
    if (!n) return null;
    let lon = 0;
    let lat = 0;
    for (const p of lonLats) {
        lon += p[0] / n;
        lat += p[1] / n;
    }
    return [lon, lat];
}

/** 数值是否可参与测量（有限且非负） */
export function isMeasurable(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
