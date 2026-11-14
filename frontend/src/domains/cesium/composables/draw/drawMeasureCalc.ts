/**
 * 功能名称：绘制测量读数计算层（测地线/面积/载荷组装）
 * 日    期：2026/11/13
 *
 * 从 useCesiumDrawMeasure 拆出：几何量测与读数载荷的纯计算；
 * Cesium 命名空间与测量开关经工厂注入（开关为 getter，实时读取）。
 */
import { formatDistanceMeasure, formatAreaMeasure } from '@common/map-view/units';
import { bearingDegrees, circleRingLonLats, polygonAreaPerimeter, rectangleCorners, rectangleMetrics } from '../../utils/drawGeometry';
import { TYPE_META } from './drawMeasureSpec';

/** 计算层注入依赖 */
export interface DrawMeasureCalcOptions {
    /** Cesium 命名空间 getter */
    getCesium: () => any;
    /** 测量开关实时读取（buildSummary 用） */
    getMeasureOptions: () => { measure: boolean; showArea: boolean; showPerimeter: boolean };
    /** 读数前缀解析（转发 drawEntityFactory.labelOf，保持 i18n 单点） */
    labelOf: (key: string) => string;
}

/**
 * 创建读数计算器。
 * 返回成员与 useCesiumDrawMeasure 内同名函数语义一致。
 */
export function createDrawMeasureCalc({ getCesium, getMeasureOptions, labelOf }: DrawMeasureCalcOptions) {
    function getC() {
        return getCesium?.();
    }

    function toDeg(rad: number): number {
        return (rad * 180) / Math.PI;
    }

    /** Cartesian3 → [lon, lat]（度） */
    function toLonLat(position: any): [number, number] {
        const C = getC();
        const carto = C.Cartographic.fromCartesian(position);
        return [toDeg(carto.longitude), toDeg(carto.latitude)];
    }

    /** 椭球测地线表面距离（米）；退化时弦长兜底 */
    function surfaceDistanceMeters(a: any, b: any): number {
        const C = getC();
        try {
            const geo = new C.EllipsoidGeodesic(
                C.Cartographic.fromCartesian(a),
                C.Cartographic.fromCartesian(b),
            );
            const d = Number(geo?.surfaceDistance);
            if (Number.isFinite(d) && d >= 0) return d;
        } catch {
            /* 共点等异常退化为弦长 */
        }
        return C.Cartesian3.distance(a, b);
    }

    /** 折线表面距离累计（测距口径，与 OL 一致） */
    function surfacePolylineLength(positions: any[]): number {
        let total = 0;
        for (let i = 1; i < positions.length; i++) {
            total += surfaceDistanceMeters(positions[i - 1], positions[i]);
        }
        return total;
    }

    /** Cartesian3 集合的重心（预览标注锚点用） */
    function centroidOf(positions: Array<{ x: number; y: number; z: number }>) {
        const C = getC();
        const sum = { x: 0, y: 0, z: 0 };
        positions.forEach((p) => {
            sum.x += p.x;
            sum.y += p.y;
            sum.z += p.z;
        });
        const n = positions.length || 1;
        return new C.Cartesian3(sum.x / n, sum.y / n, sum.z / n);
    }

    /** 坐标有限性校验：杜绝 NaN 进入渲染（会触发 Cesium 内部 RangeError） */
    function isFiniteCartesian(p: any): boolean {
        return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    }

    function rectangleFromPoints(start: any, end: any) {
        const a = toLonLat(start);
        const b = toLonLat(end);
        return {
            west: Math.min(a[0], b[0]),
            south: Math.min(a[1], b[1]),
            east: Math.max(a[0], b[0]),
            north: Math.max(a[1], b[1]),
        };
    }

    /** 两点地面距离（局部平面近似，与测量口径一致） */
    function groundDistanceOf(a: any, b: any): number {
        const ca = toLonLat(a);
        const cb = toLonLat(b);
        const mid = (ca[1] + cb[1]) / 2;
        const mx = 111320 * Math.cos((mid * Math.PI) / 180);
        const my = 110540;
        return Math.hypot((cb[0] - ca[0]) * mx, (cb[1] - ca[1]) * my);
    }

    /**
     * 测高距三角形。约定（与 Demo 一致）：
     * 垂线立在**较低**点的水平位置、向上到较高点高程；水平线取最高处高程。
     * 标注锚点用「精确中点」而非 Cartesian3.midpoint（后者取 ECEF 弦中点，会略低于真实高度）。
     */
    function buildHeightTriangle(a: any, b: any) {
        const C = getC();
        const ca = C.Cartographic.fromCartesian(a);
        const cb = C.Cartographic.fromCartesian(b);
        if (!ca || !cb) return null;

        const ha = ca.height;
        const hb = cb.height;
        const lowIsA = ha <= hb;
        const lowCarto = lowIsA ? ca : cb;
        const hLow = lowIsA ? ha : hb;
        const hHigh = lowIsA ? hb : ha;
        const high = lowIsA ? b : a;
        const highCarto = C.Cartographic.fromCartesian(high);

        const low = C.Cartesian3.fromRadians(lowCarto.longitude, lowCarto.latitude, hLow);
        const up = C.Cartesian3.fromRadians(lowCarto.longitude, lowCarto.latitude, hHigh);
        const verticalMid = C.Cartesian3.fromRadians(
            lowCarto.longitude,
            lowCarto.latitude,
            (hLow + hHigh) / 2,
        );
        const horizontalMid = C.Cartesian3.fromRadians(
            (lowCarto.longitude + highCarto.longitude) / 2,
            (lowCarto.latitude + highCarto.latitude) / 2,
            hHigh,
        );

        return {
            a,
            b,
            low,
            up,
            high,
            heights: [ha, hb],
            vertical: hHigh - hLow,
            horizontal: groundDistanceOf(a, b),
            slope: C.Cartesian3.distance(a, b),
            verticalMid,
            horizontalMid,
        };
    }

    /** 方位角锚点：正北参考线沿同一经线，长度 = 两点水平距离 */
    function buildAzimuthAnchor(a: any, b: any) {
        const C = getC();
        const ca = C.Cartographic.fromCartesian(a);
        if (!ca) return null;
        const lonLats = [toLonLat(a), toLonLat(b)];
        const horizontal = groundDistanceOf(a, b);
        // 111320 是「每度纬度的米数」，除出来是**度**，Cartographic.latitude 要**弧度**
        const dLat = ((horizontal / 111320) * Math.PI) / 180;
        const north = C.Cartesian3.fromRadians(ca.longitude, ca.latitude + dLat, ca.height);
        return {
            a,
            b,
            north,
            azimuth: bearingDegrees(lonLats[0], lonLats[1]),
            horizontal,
        };
    }

    /** 组装绘制载荷（含全部测量值；面板与 TOC 消费） */
    function buildPayload(state: any) {
        const C = getC();
        const type = state.type;
        const clicks = state.clicks;

        if (type === 'Point') {
            return { type, positions: [clicks[0]], lonLats: [toLonLat(clicks[0])] };
        }

        if (type === 'LineString' || type === 'MeasureDistance') {
            const lonLats = clicks.map(toLonLat);
            return {
                type,
                positions: clicks.slice(),
                lonLats,
                // 测距用测地线口径；绘制线沿用同一口径，避免同一图形两套读数
                length: surfacePolylineLength(clicks),
            };
        }

        if (type === 'Polygon' || type === 'MeasureArea') {
            const lonLats = clicks.map(toLonLat);
            const { area, perimeter } = polygonAreaPerimeter(lonLats);
            return { type, positions: clicks.slice(), lonLats, area, perimeter };
        }

        if (type === 'Rectangle') {
            const bounds = state.previewRect;
            if (!bounds) return null;
            const corners = rectangleCorners(bounds);
            const metrics = rectangleMetrics(bounds);
            return {
                type,
                rectangle: bounds,
                lonLats: corners,
                positions: corners.map(([lon, lat]) => C.Cartesian3.fromDegrees(lon, lat)),
                area: metrics.area,
                perimeter: metrics.perimeter,
                width: metrics.width,
                height: metrics.height,
            };
        }

        if (type === 'Circle') {
            if (!state.anchor || !state.previewRadius) return null;
            const center = toLonLat(state.anchor);
            const radius = state.previewRadius;
            const ring = circleRingLonLats(center, radius);
            return {
                type,
                center: { lonLats: center },
                radius,
                lonLats: ring,
                positions: ring.map(([lon, lat]) => C.Cartesian3.fromDegrees(lon, lat)),
                area: Math.PI * radius * radius,
                perimeter: 2 * Math.PI * radius,
            };
        }

        if (type === 'MeasureHeight') {
            const triangle = buildHeightTriangle(clicks[0], clicks[1]);
            if (!triangle) return null;
            return {
                type,
                positions: [triangle.a, triangle.b],
                lonLats: [toLonLat(triangle.a), toLonLat(triangle.b)],
                heights: triangle.heights,
                verticalDistance: triangle.vertical,
                horizontalDistance: triangle.horizontal,
                slopeDistance: triangle.slope,
                triangle,
            };
        }

        if (type === 'MeasureAzimuth') {
            const anchor = buildAzimuthAnchor(clicks[0], clicks[1]);
            if (!anchor) return null;
            return {
                type,
                positions: [anchor.a, anchor.b],
                lonLats: [toLonLat(anchor.a), toLonLat(anchor.b)],
                azimuth: anchor.azimuth,
                distance: anchor.horizontal,
                azimuthAnchor: anchor,
            };
        }

        return null;
    }

    /**
     * 生成记录用的紧凑摘要（与场景标注同口径，受测量开关约束）。
     * 纯绘制（总开关关闭或该类型测量项全关）时返回空串，调用方据此不记档。
     */
    function buildSummary(payload: any) {
        const opt = getMeasureOptions();
        if (!opt.measure) return '';
        const kind = TYPE_META[payload.type]?.kind;
        const parts: string[] = [];
        const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

        if (kind === 'area') {
            if (opt.showArea && num(payload.area)) {
                parts.push(`${labelOf('area')} ${formatAreaMeasure(payload.area)}`);
            }
            if (opt.showPerimeter && num(payload.perimeter)) {
                parts.push(`${labelOf('perimeter')} ${formatDistanceMeasure(payload.perimeter)}`);
            }
        } else if (kind === 'line') {
            if (opt.showPerimeter && num(payload.length)) {
                parts.push(`${labelOf('length')} ${formatDistanceMeasure(payload.length)}`);
            }
        } else if (kind === 'height') {
            if (opt.showPerimeter) {
                if (num(payload.verticalDistance)) {
                    parts.push(`${labelOf('vertical')} ${formatDistanceMeasure(payload.verticalDistance)}`);
                }
                if (num(payload.horizontalDistance)) {
                    parts.push(`${labelOf('horizontal')} ${formatDistanceMeasure(payload.horizontalDistance)}`);
                }
            }
        } else if (kind === 'azimuth') {
            if (opt.showPerimeter && num(payload.azimuth)) {
                parts.push(`${labelOf('azimuth')} ${payload.azimuth.toFixed(2)}°`);
            }
        }

        return parts.join(' · ');
    }

    /** 载荷 → 面板可消费的纯数据（禁止把 Cartesian3 / Entity 写进 store） */
    function toPlainResult(handle: any) {
        const p = handle.payload;
        return {
            id: handle.id,
            name: handle.name,
            type: p.type,
            lonLats: p.lonLats || [],
            area: p.area ?? null,
            perimeter: p.perimeter ?? null,
            length: p.length ?? null,
            radius: p.radius ?? null,
            width: p.width ?? null,
            height: p.height ?? null,
            azimuth: p.azimuth ?? null,
            distance: p.distance ?? null,
            verticalDistance: p.verticalDistance ?? null,
            horizontalDistance: p.horizontalDistance ?? null,
            slopeDistance: p.slopeDistance ?? null,
            heights: p.heights ?? null,
            rectangle: p.rectangle ?? null,
            center: p.center?.lonLats ?? null,
            vertexCount: (p.lonLats || []).length,
            summary: buildSummary(p),
        };
    }

    // ────────────────────────── 成品 ──────────────────────────

    /** 建成品句柄：实体 + 顶点 + 标注 + 建档 + 回调 */


    return {
        toDeg,
        toLonLat,
        surfaceDistanceMeters,
        surfacePolylineLength,
        centroidOf,
        isFiniteCartesian,
        rectangleFromPoints,
        groundDistanceOf,
        buildHeightTriangle,
        buildAzimuthAnchor,
        buildPayload,
        buildSummary,
        toPlainResult,
    };
}
