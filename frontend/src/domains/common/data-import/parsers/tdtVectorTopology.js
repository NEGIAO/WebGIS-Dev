/**
 * 天地图全量矢量分层拓扑（逐规则对齐 mjs tdt_vector_fetch.mjs §通用拓扑）。
 *
 * 输入：perLayer Map（层码 → records[{type,paths,props,partial,tx,ty,zoom,geomKind}]）。
 * 输出：每层独立 FeatureCollection + stats（in/out/union/fallback/fused/dedup/review…）。
 *
 * 与 mjs 的分层规则逐条对齐（零第三方依赖，复用 tdtBuildingTopology.js 的 Union 引擎）：
 *   1) BV 原样直出：不裁剪、不去重、不嵌套、不审计（补 _tile/_geom_partial 标记）。
 *   2) 有稳定 id 的面（CE 按 elemid / AP 按 objectid）：环先裁到 buffer 盒 [-82,4178]
 *      （替代整要素丢弃，bbox 边缘不断楼），再由 mergeIdPolygons 裁到瓦片【核心】[0,4096]
 *      （对齐 mjs 两段裁剪；缺核心裁剪会让跨瓦片段永不 Union 并留下重叠重复片段）→
 *      同 id 跨瓦接缝（多瓦 + touchesTileSeam）才 Union →
 *      面积守恒校验（<99% 回退 union_fallback）→ 洞按包含嵌套；CE 高度/楼层只取数禁做键；
 *      respt 同 elemid 挂名互补。
 *   3) 无 id 覆盖面（CK/BM）：核心裁剪 → 按 S8 分组（跨 S8 禁合）→ 完全一致去重 →
 *      连通（共享顶点/重叠）并查集分组 → 连通 Union（≤20000 边）→ 洞嵌套。
 *   4) 有稳定 id 的点（respt 按 elemid / BI 按 F5 / AD 按 Z5+H7+L1+A6）：buffer 亦保留，
 *      同 id 去重；无 id 时按 1e-7 度坐标兜底；MultiPoint 输出。
 *   5) 无 id 的线（AA/AB/AM/BK）：核心裁剪（逐段）+ 完全一致去重（坐标 + 属性键）；
 *      接缝断开不断言拼接。
 *   6) 残余严格重叠审计（洞感知、边界接触排除、同要素内多面片参与；BV 除外）：
 *      标 _topo_review=1，不改几何。AP=区级行政区划面（分层）：跨要素“纯包含”属正常
 *      层级（区含乡/功能区残留）不打标，只报“部分重叠”；CE/CK/BM 保持原严格语义。
 *   7) 裁剪环洁净：Sutherland 以环形取模遍历，闭合环会让首点被再计入一次；
 *      旧版 clipRingToRect/clipRingToTile 给每个输出环插入 1 个零长边（凹环沿裁剪边
 *      留下退化桥→自相交）。现先开环化、输出前再去零长边，环内不再有重复相邻点。
 */
import { clipRingToTile, unionRings } from './tdtBuildingTopology.js';

const EXTENT = 4096;
/** CE/AP 入围裁剪盒（对齐 mjs：buffer 盒替代整要素丢弃，bbox 边缘不断楼）。 */
const CLIP_LO = -82;
const CLIP_HI = 4178;
const GEOM_EPS = 1e-7;
const SEAM_EPS = 2;

const samePoint = (a, b) => Math.abs(a[0] - b[0]) <= GEOM_EPS && Math.abs(a[1] - b[1]) <= GEOM_EPS;
const samePt9 = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
const round7 = (v) => Math.round(v * 1e7) / 1e7;

function globalRing(ring, tx, ty) {
    return ring.map(([x, y]) => [Math.round(tx * EXTENT + x), Math.round(ty * EXTENT + y)]);
}

function globalTileToLngLat(x, y, zoom) {
    const n = 2 ** zoom;
    const gx = x / EXTENT;
    const gy = y / EXTENT;
    return [(gx / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / n))) * 180) / Math.PI];
}

/** 瓦片内局部坐标 → 经纬度。 */
function tilePointToLngLat(x, y, tx, ty, zoom) {
    return globalTileToLngLat(Math.round(tx * EXTENT + x), Math.round(ty * EXTENT + y), zoom);
}

function fc(features) {
    return { type: 'FeatureCollection', features };
}

function ringArea(ring) {
    let a = 0;
    for (let i = 0; i + 1 < ring.length; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return Math.abs(a / 2);
}

const ringsArea = (rings) => rings.reduce((s, r) => s + ringArea(r), 0);

function pointInRing(ring, pt) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

/** 面裁剪到任意矩形（对齐 mjs clipRingToRect：逐边 Sutherland；输出必闭合且无重复相邻点）。 */
function clipRingToRect(ring, x0, y0, x1, y1) {
    // 开环化：Sutherland 用 (i+1)%len 环形遍历，而闭合环（首==尾）会让首点被再计入一次，
    // 旧版因此给【每个】输出环插入 1 个零长边（凹环还会沿裁剪边留下退化桥→自相交）。
    // 入参已闭合，先摘掉重合尾点，遍历即回到标准 S-H。
    let output = ring.slice();
    if (output.length > 1 && samePoint(output[0], output[output.length - 1])) output.pop();
    const limits = [
        [0, (p) => p[0] >= x0],
        [0, (p) => p[0] <= x1],
        [1, (p) => p[1] >= y0],
        [1, (p) => p[1] <= y1],
    ];
    const bounds = [x0, x1, y0, y1];
    for (let side = 0; side < 4; side++) {
        if (!output.length) break;
        const axis = side < 2 ? 0 : 1;
        const bound = bounds[side];
        const inside = limits[side][1];
        const next = [];
        for (let i = 0; i < output.length; i++) {
            const a = output[i];
            const b = output[(i + 1) % output.length];
            const ia = inside(a);
            const ib = inside(b);
            if (ia !== ib) {
                const den = b[axis] - a[axis];
                if (Math.abs(den) > GEOM_EPS) {
                    const t = (bound - a[axis]) / den;
                    next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
                }
            }
            if (ib) next.push(b);
        }
        output = next;
    }
    // 去零长边后闭合：保证输出环无重复相邻点（旧版每环必多 1 点，见上方注释）
    const cleaned = [];
    for (const point of output) {
        if (!cleaned.length || !samePoint(cleaned[cleaned.length - 1], point)) cleaned.push(point);
    }
    if (cleaned.length > 1 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) cleaned.pop();
    if (cleaned.length && !samePoint(cleaned[0], cleaned[cleaned.length - 1])) cleaned.push(cleaned[0]);
    return cleaned;
}

/** 环是否跨瓦接缝带（对齐 mjs touchesTileSeam）。 */
function touchesTileSeam(ring) {
    return ring.some(([x, y]) => x <= SEAM_EPS || x >= EXTENT - SEAM_EPS || y <= SEAM_EPS || y >= EXTENT - SEAM_EPS);
}

/** 线段对瓦片核心裁剪（对齐 mjs clipSegToTile：Cohen–Sutherland）。 */
function clipSegToTile(a, b) {
    const X0 = 0;
    const Y0 = 0;
    const X1 = EXTENT;
    const Y1 = EXTENT;
    if (samePt9(a, b)) {
        const [x, y] = a;
        return (x >= X0 && x <= X1 && y >= Y0 && y <= Y1) ? [[a.slice(), b.slice()], true] : null;
    }
    const code = (x, y) => (x < X0 ? 8 : 0) | (x > X1 ? 4 : 0) | (y < Y0 ? 2 : 0) | (y > Y1 ? 1 : 0);
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
        let x;
        let y;
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
function clipPolylineToTile(points) {
    const pieces = [];
    let cur = null;
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
        const s = hit[0];
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
function nestRings(coords) {
    if (coords.length <= 1) return coords.map((r) => [r]);
    const order = coords.map((_, i) => i).sort((a, b) => ringArea(coords[b]) - ringArea(coords[a]));
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
    const polys = [];
    for (const i of order) {
        if (owners[i] === -1) polys.push([coords[i]]);
        else polys.find((p) => p[0] === coords[owners[i]]).push(coords[i]);
    }
    return polys;
}

/** 同 id 面合并（对齐 mjs mergeIdPolygons：buffer 盒裁剪 → 接缝候选 Union → 守恒回退 → 洞嵌套）。 */
function mergeIdPolygons(records, opt) {
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
            const clipped = clipRingToTile(closed);
            if (clipped.length >= 4) {
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
    const features = [];
    let unionCount = 0;
    let fallbackCount = 0;
    for (const [id, group] of groups) {
        if (!group.parts.length) continue;
        const zoom = group.parts[0].zoom;
        const globalRings = group.parts.map((part) => globalRing(part.ring, part.tx, part.ty));
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
        const polys = merged.map((ring) => [ring.map(([x, y]) => globalTileToLngLat(x, y, zoom))]);
        if (!polys.length) continue;
        const nested = [];
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

function distSeg(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function strictlyInsideRings(polyRings, pt) {
    if (!pointInRing(polyRings[0], pt)) return false;
    for (let k = 1; k < polyRings.length; k++) if (pointInRing(polyRings[k], pt)) return false;
    for (const r of polyRings) {
        for (let i = 0; i + 1 < r.length; i++) {
            if (distSeg(pt, r[i], r[i + 1]) < 1e-9) return false;
        }
    }
    return true;
}

function polyBbox(ring) {
    const a = [1e9, 1e9, -1e9, -1e9];
    for (const p of ring) {
        if (p[0] < a[0]) a[0] = p[0];
        if (p[1] < a[1]) a[1] = p[1];
        if (p[0] > a[2]) a[2] = p[0];
        if (p[1] > a[3]) a[3] = p[1];
    }
    return a;
}

function distToRings(ring, pt) {
    let d = Infinity;
    for (let i = 0; i + 1 < ring.length; i++) d = Math.min(d, distSeg(pt, ring[i], ring[i + 1]));
    return d;
}

/** 点是否在环组内（含贴边）：洞内不算，边界接触算在内。 */
function insideOrOnRings(polyRings, pt) {
    if (!pointInRing(polyRings[0], pt) && distToRings(polyRings[0], pt) >= 1e-9) return false;
    for (let k = 1; k < polyRings.length; k++) {
        if (pointInRing(polyRings[k], pt) && distToRings(polyRings[k], pt) >= 1e-9) return false;
    }
    return true;
}

/** src 环组是否整体落在 dst 环组内（允许贴边）：用于区分“父子嵌套”与“真·残余重叠”。 */
function allInsideOrOnRings(srcRings, dstRings) {
    for (const r of srcRings) for (const pt of r) if (!insideOrOnRings(dstRings, pt)) return false;
    return true;
}

/**
 * 残余严格重叠审计：两两严格互含才打标 _topo_review（不改几何）。返回被标要素数。
 * opt.allowContainment=true 时跳过“纯包含”对（一方整体落在另一方内）：分层数据（如 AP
 * 区级行政区划面里大区含小区/乡级残留）属正常层级关系，不是残余重叠；
 * 只有“部分重叠”（互相切进去又出来）才打标。CE 等平面铺满层保持原严格语义。
 */
function auditResidualOverlap(features, opt = {}) {
    const polys = [];
    features.forEach((f, idx) => {
        if (!f.geometry) return;
        const gs = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : null;
        if (!gs) return;
        for (const poly of gs) polys.push({ rings: poly, idx, bb: polyBbox(poly[0]) });
    });
    const flag = new Set();
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

function validLabel(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('\ufffd')) return null;
    return trimmed;
}

/** respt 挂名（对齐 mjs labelFromProps：lzh/name/label/title/Z5 优先级）。 */
function labelFromProps(props) {
    for (const k of ['lzh', 'name', 'label', 'title', 'Z5']) {
        const v = validLabel(props[k]);
        if (v) return v;
    }
    return null;
}

/** 属性稳定键（对齐 mjs stableProps：key 排序 + 对象序列化）。 */
function stableProps(props) {
    const o = {};
    for (const k of Object.keys(props || {}).sort()) {
        const v = props[k];
        o[k] = (v && typeof v === 'object') ? JSON.stringify(v) : v;
    }
    return JSON.stringify(o);
}

/** record.paths → 闭合环组（≥3 点自动闭合；对齐 mjs CE/AP 环预处理）。 */
function closedRingsOf(record) {
    const rings = [];
    for (const p of record.paths || []) {
        if (!p || p.points.length < 3) continue;
        const ring = p.points.slice();
        if (!samePoint(ring[0], ring[ring.length - 1])) ring.push(ring[0]);
        rings.push(ring);
    }
    return rings;
}

/**
 * CE/AP 入围裁剪：环先裁到 buffer 盒 [-82,4178]（对齐 mjs 分支预处理），
 * 全越界环才弃（替代整要素丢弃，bbox 边缘不断楼）；随后 mergeIdPolygons 再裁到瓦片核心。
 */
function bufferClippedRingsOf(record) {
    const rings = [];
    for (const ring of closedRingsOf(record)) {
        const c = clipRingToRect(ring, CLIP_LO, CLIP_LO, CLIP_HI, CLIP_HI);
        if (c.length >= 4) rings.push(c);
    }
    return rings;
}

/** 点层：buffer 亦保留 + 同 id 去重（对齐 mjs 点拓扑；无 id 按 1e-7 度坐标兜底）。 */
function topoPoints(records, zoom, layer) {
    const stats = { in: records.length, out: 0, union: 0, fallback: 0, fused: 0, dedup: 0, review: 0 };
    const seen = new Set();
    const features = [];
    for (const record of records) {
        if (record.type !== 4) continue;
        const pts = [];
        for (const p of record.paths || []) {
            for (const [px, py] of p.points) pts.push(tilePointToLngLat(px, py, record.tx, record.ty, zoom));
        }
        if (!pts.length) continue;
        let key;
        if (layer === 'respt') key = `e:${String(record.props?.elemid ?? '?')}`;
        else if (layer === 'BI') key = `f:${String(record.props?.F5 ?? record.props?.f5 ?? '?')}`;
        else key = `a:${['Z5', 'H7', 'L1', 'A6'].map((k) => String(record.props?.[k] ?? '')).join('|')}`;
        if (key.endsWith('?') || key.includes('undefined')) {
            key += `@${pts.map((p) => p.map((v) => v.toFixed(7)).join(',')).join(';')}`;
        }
        if (seen.has(key)) {
            stats.dedup += 1;
            continue;
        }
        seen.add(key);
        const props = { ...record.props, _tile: `${zoom}_${record.tx}_${record.ty}` };
        if (record.partial) props._geom_partial = 1;
        features.push({
            type: 'Feature',
            properties: props,
            geometry: pts.length > 1
                ? { type: 'MultiPoint', coordinates: pts }
                : { type: 'Point', coordinates: pts[0] },
        });
    }
    stats.out = features.length;
    return { features, stats };
}

/** 线层：核心裁剪（逐段）+ 完全一致去重（坐标 + 属性键）；接缝断开不断言拼接。 */
function topoLines(records, zoom, layer) {
    const stats = { in: records.length, out: 0, union: 0, fallback: 0, fused: 0, dedup: 0, review: 0, clipped: 0 };
    const seen = new Set();
    const features = [];
    for (const record of records) {
        if (record.type !== 1) continue;
        for (const p of record.paths || []) {
            const pieces = clipPolylineToTile(p.points);
            for (const piece of pieces) {
                const ll = piece.map(([px, py]) => tilePointToLngLat(px, py, record.tx, record.ty, zoom));
                const key = ll.map((q) => q.map(round7).join(',')).join(';') + '|' + stableProps(record.props);
                if (seen.has(key)) {
                    stats.dedup += 1;
                    continue;
                }
                seen.add(key);
                const props = { ...record.props, _layer: layer, _tile: `${zoom}_${record.tx}_${record.ty}` };
                if (record.partial) props._geom_partial = 1;
                features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: ll } });
            }
            if (!pieces.length) stats.clipped += 1;
        }
    }
    stats.out = features.length;
    return { features, stats };
}

/** BV 原样直出：不裁剪、不去重、不嵌套、不审计（补 _tile/_geom_partial）。 */
function topoPassthrough(records, zoom) {
    const features = [];
    for (const record of records) {
        if (record.type !== 2) continue;
        const ll = [];
        for (const p of record.paths || []) {
            if (p.points.length < 3) continue;
            const ring = p.points.map(([px, py]) => tilePointToLngLat(px, py, record.tx, record.ty, zoom));
            if (ring.length < 3) continue;
            const a = ring[0];
            const b = ring[ring.length - 1];
            if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
            ll.push(ring);
        }
        if (!ll.length) continue;
        const props = { ...record.props, _tile: `${zoom}_${record.tx}_${record.ty}` };
        if (record.partial) props._geom_partial = 1;
        features.push({
            type: 'Feature',
            properties: props,
            geometry: ll.length > 1
                ? { type: 'MultiPolygon', coordinates: ll.map((r) => [r]) }
                : { type: 'Polygon', coordinates: [ll[0]] },
        });
    }
    return { features, stats: { in: records.length, out: features.length, union: 0, fallback: 0, fused: 0, dedup: 0, review: 0 } };
}

/** CK/BM 覆盖面融合：核心裁剪 → S8 分组 → 一致去重 → 连通并查集 → Union → 洞嵌套（对齐 mjs）。 */
function fuseByS8(records, zoom) {
    const stats = { in: records.length, out: 0, union: 0, fallback: 0, fused: 0, dedup: 0, review: 0, clipped: 0, fused_skip: 0 };
    const byS8 = new Map();
    for (const record of records) {
        if (record.type !== 2) continue;
        const s8 = String(record.props?.S8 ?? '__none__');
        if (!byS8.has(s8)) byS8.set(s8, []);
        for (const ring of closedRingsOf(record)) {
            const c = clipRingToTile(ring);
            if (c.length < 4) {
                stats.clipped += 1;
                continue;
            }
            byS8.get(s8).push({ ring: c, tx: record.tx, ty: record.ty, zoom, partial: !!record.partial, s8v: record.props?.S8 ?? null });
        }
    }
    const features = [];
    for (const [, items] of byS8) {
        if (!items.length) continue;
        const z = items[0].zoom;
        const globals = items.map((it) => ({
            ring: globalRing(it.ring, it.tx, it.ty),
            s8v: it.s8v,
            tile: `${it.zoom}_${it.tx}_${it.ty}`,
            partial: it.partial,
        }));
        const seenR = new Set();
        const uniq = [];
        for (const g of globals) {
            const key = g.ring.map((q) => q.join(',')).join(';');
            if (seenR.has(key)) {
                stats.dedup += 1;
                continue;
            }
            seenR.add(key);
            uniq.push(g);
        }
        const n = uniq.length;
        const parent = uniq.map((_, i) => i);
        const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
        const uni = (a, b) => {
            parent[find(a)] = find(b);
        };
        const keys = uniq.map((g) => new Set(g.ring.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`)));
        const bbs = uniq.map((g) => {
            const a = [1e18, 1e18, -1e18, -1e18];
            for (const p of g.ring) {
                if (p[0] < a[0]) a[0] = p[0];
                if (p[1] < a[1]) a[1] = p[1];
                if (p[0] > a[2]) a[2] = p[0];
                if (p[1] > a[3]) a[3] = p[1];
            }
            return a;
        });
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const a = bbs[i];
                const b = bbs[j];
                if (!(a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1])) continue;
                let link = false;
                for (const k of keys[i]) {
                    if (keys[j].has(k)) {
                        link = true;
                        break;
                    }
                }
                if (!link) {
                    const ri = uniq[i].ring;
                    const rj = uniq[j].ring;
                    for (const pt of ri) {
                        if (pointInRing(rj, pt)) {
                            link = true;
                            break;
                        }
                    }
                    if (!link) for (const pt of rj) {
                        if (pointInRing(ri, pt)) {
                            link = true;
                            break;
                        }
                    }
                }
                if (link) uni(i, j);
            }
        }
        const comps = new Map();
        uniq.forEach((g, i) => {
            const r = find(i);
            if (!comps.has(r)) comps.set(r, []);
            comps.get(r).push(g);
        });
        for (const [, members] of comps) {
            let outRings = null;
            let fused = false;
            let partial = false;
            for (const mb of members) if (mb.partial) partial = true;
            if (members.length > 1) {
                const edgeCount = members.reduce((s, mb) => s + mb.ring.length, 0);
                if (edgeCount <= 20000) {
                    try {
                        const u = unionRings(members.map((mb) => mb.ring));
                        if (u.length && ringsArea(u) >= ringsArea(members.map((mb) => mb.ring)) * 0.99 - 1) {
                            outRings = u;
                            fused = true;
                            stats.fused += 1;
                        } else stats.fallback += 1;
                    } catch {
                        stats.fallback += 1;
                    }
                } else stats.fused_skip += 1;
            }
            if (!outRings) outRings = members.map((mb) => mb.ring);
            const ll = outRings.map((r) => r.map(([x, y]) => globalTileToLngLat(x, y, z)));
            const nested = nestRings(ll);
            const props = members[0].s8v == null ? {} : { S8: members[0].s8v };
            props._tile = members[0].tile;
            if (members.length > 1) props._fused_from = members.length;
            if (fused) props._seam_merged = 1;
            if (partial) props._geom_partial = 1;
            features.push({
                type: 'Feature',
                properties: props,
                geometry: nested.length > 1
                    ? { type: 'MultiPolygon', coordinates: nested }
                    : { type: 'Polygon', coordinates: nested[0] },
            });
        }
    }
    stats.out = features.length;
    return { features, stats };
}

/**
 * 分层拓扑主入口（对齐 mjs main 的分层设定）。
 * @param {Map<string, Array>} perLayer 层码 → records（tdtVectorFetcher.decodeTdtVectorTile 输出契约）
 * @param {number} zoom 瓦片级别
 * @returns {{layers: Record<string, object>, stats: Record<string, object>}}
 */
export function topoTdtVectorLayers(perLayer, zoom) {
    const layers = {};
    const stats = {};
    for (const [name, records] of perLayer) {
        let result = null;
        if (name === 'CE') {
            const recs = [];
            let noidSeq = 0;
            for (const r of records) {
                if (r.type !== 2) continue;
                // elemid 是唯一分组键，必须「有值就用、没值也不丢」：
                //  · 非空标量 → 直接 String 化作键（对齐 mjs：mjs 不做任何形状校验，elemid 两种编码并存）；
                //    旧版用 /^[0-9A-Za-z]{6,32}$/ 硬校验，elemid 一旦不是该形状（如 JSON 数字）就整栋丢弃。
                //  · 缺失/非标量 → 给唯一合成 id：既不与别的建筑错误合并（mjs 会把它们全归到同一个
                //    undefined 组、把互不相干的楼合成一个要素），也不静默丢数据。
                const eid = r.props?.elemid;
                const usable = (typeof eid === 'string' || typeof eid === 'number') && String(eid).trim() !== '';
                const id = usable ? String(eid).trim() : `__ce_noid_${r.zoom}_${r.tx}_${r.ty}_${noidSeq++}`;
                const rings = bufferClippedRingsOf(r);
                if (!rings.length) continue;
                recs.push({
                    id,
                    rings,
                    tx: r.tx,
                    ty: r.ty,
                    zoom: r.zoom,
                    extra: {
                        h: typeof r.props.h === 'number' ? r.props.h : null,
                        floors: r.props.floors ?? null,
                        A6: r.props.A6 ?? null,
                        name: r.props.name || null,
                    },
                    partial: !!r.partial,
                });
            }
            // respt 挂名（同瓦 elemid → label；跨瓦同 id 在 fillExtra 互补）
            const nameById = new Map();
            const respts = perLayer.get('respt') || [];
            for (const f of respts) {
                const id = f.props?.elemid;
                const label = labelFromProps(f.props || {});
                if (id != null && label && !nameById.has(String(id))) nameById.set(String(id), label);
            }
            for (const r of recs) {
                if (!r.extra.name && nameById.has(r.id)) r.extra.name = nameById.get(r.id);
            }
            const { features, unionCount, fallbackCount } = mergeIdPolygons(recs, {
                idProp: 'elemid',
                fillExtra: (dst, src) => {
                    if (dst.h == null && src.h != null) dst.h = src.h;
                    if (dst.floors == null && src.floors != null) dst.floors = src.floors;
                    if (dst.A6 == null && src.A6 != null) dst.A6 = src.A6;
                    if (!dst.name && src.name) dst.name = src.name;
                },
                props: (ex) => {
                    const p = { _layer: name };
                    if (ex.h != null && ex.h > 0) p.height_m = ex.h;
                    if (ex.floors != null) p.floors = Number(ex.floors);
                    if (ex.A6 != null) p.A6 = ex.A6;
                    if (ex.name) p.name = ex.name;
                    return p;
                },
            });
            result = { features, stats: { in: records.length, out: features.length, union: unionCount, fallback: fallbackCount, fused: 0, dedup: 0, review: 0 } };
        } else if (name === 'AP') {
            const recs = [];
            for (const r of records) {
                if (r.type !== 2) continue;
                const id = r.props?.objectid;
                if (id == null || (typeof id === 'object')) continue;
                const rings = bufferClippedRingsOf(r);
                if (!rings.length) continue;
                recs.push({ id: String(id), rings, tx: r.tx, ty: r.ty, zoom: r.zoom, extra: {}, partial: !!r.partial });
            }
            const { features, unionCount, fallbackCount } = mergeIdPolygons(recs, {
                idProp: 'objectid',
                props: () => ({ _layer: name }),
            });
            for (const ft of features) ft.properties.objectid = Number(ft.properties.objectid);
            result = { features, stats: { in: records.length, out: features.length, union: unionCount, fallback: fallbackCount, fused: 0, dedup: 0, review: 0 } };
        } else if (name === 'CK' || name === 'BM') {
            result = fuseByS8(records, zoom);
        } else if (name === 'BV') {
            result = topoPassthrough(records, zoom);
        } else if (name === 'BI' || name === 'AD' || name === 'respt') {
            result = topoPoints(records, zoom, name);
        } else {
            result = topoLines(records, zoom, name);
        }
        // 残余重叠只打标不改几何（BV 原样直出，不参与审计）
        // AP=区级行政区划面：跨要素“纯包含”是正常层级（区含乡/功能区），只报部分重叠
        if (name === 'CE' || name === 'AP' || name === 'CK' || name === 'BM') {
            result.stats.review = auditResidualOverlap(result.features, { allowContainment: name === 'AP' });
        }
        layers[name] = fc(result.features);
        stats[name] = result.stats;
    }
    return { layers, stats };
}
