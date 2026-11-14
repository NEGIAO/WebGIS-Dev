import { clipRingToTile, unionRings } from '../../tdtBuildingTopology';
import { globalRing, globalTileToLngLat, pointInRing, ringArea, ringsArea, samePoint, touchesTileSeam } from './geometry';

export function nestRings(coords: any[]) {
    if (coords.length <= 1) return coords.map((r: any) => [r]);
    const order = coords.map((_: any, i: number) => i).sort((a: number, b: number) => ringArea(coords[b]) - ringArea(coords[a]));
    const owners = new Array(coords.length).fill(-1);
    for (const i of order) {
        let best = -1;
        let bestArea = Infinity;
        for (const j of order) {
            if (i === j || owners[j] !== -1) continue;
            if (ringArea(coords[j]) <= ringArea(coords[i])) continue;
            if (pointInRing(coords[j], coords[i][0])) {
                const a = ringArea(coords[j]);
                if (a < bestArea) {
                    bestArea = a;
                    best = j;
                }
            }
        }
        owners[i] = best;
    }
    const polys: any[] = [];
    for (const i of order) {
        if (owners[i] === -1) polys.push([coords[i]]);
        else polys.find((p: any) => p[0] === coords[owners[i]])?.push(coords[i]);
    }
    return polys;
}

/** 同 id 面合并（对齐 mjs mergeIdPolygons：buffer 盒裁剪 → 接缝候选 Union → 守恒回退 → 洞嵌套）。 */
export function mergeIdPolygons(records: any[], opt: any) {
    const groups = new Map();
    for (const r of records) {
        if (!groups.has(r.id)) groups.set(r.id, { parts: [], tileKeys: new Set(), seam: false, partial: false });
        const g = groups.get(r.id);
        if (r.partial) g.partial = true;
        for (const ring of r.rings || []) {
            // 必须裁到瓦片【核心】[0,4096]（对齐 mjs mergeIdPolygons 的 clipRingToTile），
            // 不能用 buffer 盒 [-82,4178]：只有核心裁剪才会在跨瓦处生成 x=0/4096 的接缝顶点，
            // touchesTileSeam 才成立、needsUnion 才会触发、同 id 跨瓦片段才会真正 Union。
            // 用 buffer 盒会留下彼此重叠的重复片段 → 非法 MultiPolygon + 自相交 + 重叠审计误报。
            const closed = ring.length >= 3 && !samePoint(ring[0], ring[ring.length - 1]) ? [...ring, ring[0]] : ring.slice();
            // 核心裁剪可能把 1 个环拆成多个（贴瓦片边被切开），逐个收编为独立片段。
            for (const clipped of clipRingToTile(closed)) {
                if (clipped.length < 4) continue;
                g.parts.push({ ring: clipped, tx: r.tx, ty: r.ty, zoom: r.zoom });
                g.tileKeys.add(`${r.tx},${r.ty},${r.zoom}`);
                if (touchesTileSeam(clipped)) g.seam = true;
            }
        }
        if (!g.filled) {
            g.extra = { ...(r.extra || {}) };
            g.filled = true;
        } else if (opt.fillExtra) opt.fillExtra(g.extra, r.extra || {});
    }
    const features: any[] = [];
    let unionCount = 0;
    let fallbackCount = 0;
    for (const [id, group] of groups) {
        if (!group.parts.length) continue;
        const zoom = group.parts[0].zoom;
        const globalRings = group.parts.map((part: any) => globalRing(part.ring, part.tx, part.ty));
        const needsUnion = group.parts.length > 1 && group.tileKeys.size > 1 && group.seam;
        let merged = globalRings;
        let mergedFlag = false;
        if (needsUnion) {
            try {
                const u = unionRings(globalRings);
                if (u.length && ringsArea(u) >= ringsArea(globalRings) * 0.99 - 1) {
                    merged = u;
                    mergedFlag = true;
                    unionCount++;
                } else fallbackCount++;
            } catch {
                fallbackCount++;
            }
            if (!merged.length) merged = globalRings;
        }
        const polys = merged.map((ring: any) => [ring.map(([x, y]: number[]) => globalTileToLngLat(x, y, zoom))]);
        if (!polys.length) continue;
        const nested: any[] = [];
        for (const poly of polys) {
            for (const ring of poly) {
                let host = -1;
                for (let i = 0; i < nested.length; i++) {
                    if (pointInRing(nested[i][0], ring[0]) && ringArea(nested[i][0]) > ringArea(ring)) {
                        host = i;
                        break;
                    }
                }
                if (host >= 0) nested[host].push(ring);
                else nested.push([ring]);
            }
        }
        const properties = { [opt.idProp]: id, ...opt.props(group.extra || {}) };
        if (mergedFlag) properties._seam_merged = 1;
        if (group.partial) properties._geom_partial = 1;
        features.push({
            type: 'Feature',
            properties,
            geometry: nested.length > 1
                ? { type: 'MultiPolygon', coordinates: nested }
                : { type: 'Polygon', coordinates: nested[0] },
        });
    }
    return { features, unionCount, fallbackCount };
}

/* ---------- 残余重叠审计（对齐 mjs auditResidualOverlap：洞感知 + 严格内含） ---------- */

export function distSeg(p: number[], a: number[], b: number[]) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function strictlyInsideRings(polyRings: number[][][], pt: number[]) {
    if (!pointInRing(polyRings[0], pt)) return false;
    for (let k = 1; k < polyRings.length; k++) if (pointInRing(polyRings[k], pt)) return false;
    for (const r of polyRings) {
        for (let i = 0; i + 1 < r.length; i++) {
            if (distSeg(pt, r[i], r[i + 1]) < 1e-9) return false;
        }
    }
    return true;
}

export function polyBbox(ring: any) {
    const a = [1e9, 1e9, -1e9, -1e9];
    for (const p of ring) {
        if (p[0] < a[0]) a[0] = p[0];
        if (p[1] < a[1]) a[1] = p[1];
        if (p[0] > a[2]) a[2] = p[0];
        if (p[1] > a[3]) a[3] = p[1];
    }
    return a;
}

export function distToRings(ring: number[][], pt: number[]) {
    let d = Infinity;
    for (let i = 0; i + 1 < ring.length; i++) d = Math.min(d, distSeg(pt, ring[i], ring[i + 1]));
    return d;
}

/** 点是否在环组内（含贴边）：洞内不算，边界接触算在内。 */
export function insideOrOnRings(polyRings: number[][][], pt: number[]) {
    if (!pointInRing(polyRings[0], pt) && distToRings(polyRings[0], pt) >= 1e-9) return false;
    for (let k = 1; k < polyRings.length; k++) {
        if (pointInRing(polyRings[k], pt) && distToRings(polyRings[k], pt) >= 1e-9) return false;
    }
    return true;
}

/** src 环组是否整体落在 dst 环组内（允许贴边）：用于区分“父子嵌套”与“真·残余重叠”。 */
export function allInsideOrOnRings(srcRings: number[][][], dstRings: number[][][]) {
    for (const r of srcRings) for (const pt of r) if (!insideOrOnRings(dstRings, pt)) return false;
    return true;
}

/**
 * 残余严格重叠审计：两两严格互含才打标 _topo_review（不改几何）。返回被标要素数。
 * opt.allowContainment=true 时跳过“纯包含”对（一方整体落在另一方内）：分层数据（如 AP
 * 区级行政区划面里大区含小区/乡级残留）属正常层级关系，不是残余重叠；
 * 只有“部分重叠”（互相切进去又出来）才打标。CE 等平面铺满层保持原严格语义。
 */
export function auditResidualOverlap(features: any[], opt: any = {}) {
    const polys: any[] = [];
    features.forEach((f, idx) => {
        if (!f.geometry) return;
        const gs = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : null;
        if (!gs) return;
        for (const poly of gs) polys.push({ rings: poly, idx, bb: polyBbox(poly[0]) });
    });
    const flag = new Set<number>();
    for (let i = 0; i < polys.length; i++) {
        for (let j = i + 1; j < polys.length; j++) {
            const A = polys[i];
            const B = polys[j];
            const a = A.bb;
            const b = B.bb;
            if (!(a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1])) continue;
            let hit = false;
            for (const r of A.rings) {
                for (const pt of r) {
                    if (strictlyInsideRings(B.rings, pt)) {
                        hit = true;
                        break;
                    }
                }
                if (hit) break;
            }
            if (!hit) {
                for (const r of B.rings) {
                    for (const pt of r) {
                        if (strictlyInsideRings(A.rings, pt)) {
                            hit = true;
                            break;
                        }
                    }
                    if (hit) break;
                }
            }
            if (hit) {
                // 纯包含=父子嵌套（分层数据里大区含小区属正常层级），非残余重叠，跳过
                if (opt.allowContainment && (allInsideOrOnRings(A.rings, B.rings) || allInsideOrOnRings(B.rings, A.rings))) continue;
                flag.add(A.idx);
                flag.add(B.idx);
            }
        }
    }
    for (const idx of flag) features[idx].properties._topo_review = 1;
    return flag.size;
}

/* ---------- 分层拓扑 ---------- */

