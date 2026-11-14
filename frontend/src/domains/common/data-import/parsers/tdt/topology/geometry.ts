export const EXTENT = 4096;
/** CE/AP 入围裁剪盒（对齐 mjs：buffer 盒替代整要素丢弃，bbox 边缘不断楼）。 */
export const CLIP_LO = -82;
export const CLIP_HI = 4178;
export const GEOM_EPS = 1e-7;
export const SEAM_EPS = 2;

export const samePoint = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) <= GEOM_EPS && Math.abs(a[1] - b[1]) <= GEOM_EPS;
export const samePt9 = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
export const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export function globalRing(ring: number[][], tx: number, ty: number) {
    return ring.map(([x, y]: number[]) => [Math.round(tx * EXTENT + x), Math.round(ty * EXTENT + y)]);
}

export function globalTileToLngLat(x: number, y: number, zoom: number) {
    const n = 2 ** zoom;
    const gx = x / EXTENT;
    const gy = y / EXTENT;
    return [(gx / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / n))) * 180) / Math.PI];
}

/** 瓦片内局部坐标 → 经纬度。 */
export function tilePointToLngLat(x: number, y: number, tx: number, ty: number, zoom: number) {
    return globalTileToLngLat(Math.round(tx * EXTENT + x), Math.round(ty * EXTENT + y), zoom);
}

export function fc(features: any[]) {
    return { type: 'FeatureCollection', features };
}

export function ringArea(ring: number[][]) {
    let a = 0;
    for (let i = 0; i + 1 < ring.length; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return Math.abs(a / 2);
}

export const ringsArea = (rings: number[][][]) => rings.reduce((s: number, r: number[][]) => s + ringArea(r), 0);

export function pointInRing(ring: number[][], pt: number[]) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

/** 环是否跨瓦接缝带（对齐 mjs touchesTileSeam）。 */
export function touchesTileSeam(ring: number[][]) {
    return ring.some(([x, y]: number[]) => x <= SEAM_EPS || x >= EXTENT - SEAM_EPS || y <= SEAM_EPS || y >= EXTENT - SEAM_EPS);
}

/** 线段对瓦片核心裁剪（对齐 mjs clipSegToTile：Cohen–Sutherland）。 */
export function clipSegToTile(a: number[], b: number[]) {
    const X0 = 0;
    const Y0 = 0;
    const X1 = EXTENT;
    const Y1 = EXTENT;
    if (samePt9(a, b)) {
        const [x, y] = a;
        return (x >= X0 && x <= X1 && y >= Y0 && y <= Y1) ? [[a.slice(), b.slice()], true] : null;
    }
    const code = (x: number, y: number) => (x < X0 ? 8 : 0) | (x > X1 ? 4 : 0) | (y < Y0 ? 2 : 0) | (y > Y1 ? 1 : 0);
    let x0 = a[0];
    let y0 = a[1];
    let x1 = b[0];
    let y1 = b[1];
    let c0 = code(x0, y0);
    let c1 = code(x1, y1);
    for (let i = 0; i < 8; i++) {
        if (!(c0 | c1)) return [[[x0, y0], [x1, y1]], true];
        if (c0 & c1) return null;
        const c = c0 ? c0 : c1;
        let x: number;
        let y: number;
        if (c & 1) {
            if (Math.abs(y1 - y0) < GEOM_EPS) return null;
            x = x0 + ((x1 - x0) * (Y1 - y0)) / (y1 - y0);
            y = Y1;
        } else if (c & 2) {
            if (Math.abs(y1 - y0) < GEOM_EPS) return null;
            x = x0 + ((x1 - x0) * (Y0 - y0)) / (y1 - y0);
            y = Y0;
        } else if (c & 4) {
            if (Math.abs(x1 - x0) < GEOM_EPS) return null;
            y = y0 + ((y1 - y0) * (X1 - x0)) / (x1 - x0);
            x = X1;
        } else {
            if (Math.abs(x1 - x0) < GEOM_EPS) return null;
            y = y0 + ((y1 - y0) * (X0 - x0)) / (x1 - x0);
            x = X0;
        }
        if (c === c0) {
            x0 = x;
            y0 = y;
            c0 = code(x0, y0);
        } else {
            x1 = x;
            y1 = y;
            c1 = code(x1, y1);
        }
    }
    return null;
}

/** 线逐段裁剪并串链（对齐 mjs clipPolylineToTile；返回每段 ≥2 点的 pieces）。 */
export function clipPolylineToTile(points: number[][]) {
    const pieces: number[][][] = [];
    let cur: any = null;
    const flush = () => {
        if (cur && cur.length >= 2) pieces.push(cur);
        cur = null;
    };
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (samePt9(a, b)) continue;
        const hit = clipSegToTile(a, b);
        if (!hit) {
            flush();
            continue;
        }
        const s = hit[0] as number[][];
        const fullA = samePt9(s[0], a);
        const fullB = samePt9(s[1], b);
        if (cur && fullA && samePt9(cur[cur.length - 1], a)) cur.push(s[1]);
        else {
            flush();
            cur = [s[0], s[1]];
        }
        if (!fullB) {
            if (cur.length >= 2) pieces.push(cur);
            cur = null;
        }
    }
    flush();
    return pieces.filter((p) => p.length >= 2);
}

/** 面洞嵌套（对齐 mjs nestRings：面积降序 + 包含关系建 owner，不依赖绕向）。 */
