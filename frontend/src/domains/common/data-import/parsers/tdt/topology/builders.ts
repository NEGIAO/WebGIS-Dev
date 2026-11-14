import { clipRingToTile, unionRings } from '../../tdtBuildingTopology';
import { clipPolylineToTile, fc, globalRing, globalTileToLngLat, pointInRing, ringsArea, round7, tilePointToLngLat } from './geometry';
import { bufferClippedRingsOf, closedRingsOf, labelFromProps, stableProps } from './props';
import { auditResidualOverlap, mergeIdPolygons, nestRings } from './rings';

export function topoPoints(records: any[], zoom: number, layer: string) {
    const stats = { in: records.length, out: 0, union: 0, fallback: 0, fused: 0, dedup: 0, review: 0 };
    const seen = new Set();
    const features: any[] = [];
    for (const record of records) {
        if (record.type !== 4) continue;
        const pts: any[] = [];
        for (const p of record.paths || []) {
            for (const [px, py] of p.points) pts.push(tilePointToLngLat(px, py, record.tx, record.ty, zoom));
        }
        if (!pts.length) continue;
        let key;
        if (layer === 'respt') key = `e:${String(record.props?.elemid ?? '?')}`;
        else if (layer === 'BI') key = `f:${String(record.props?.F5 ?? record.props?.f5 ?? '?')}`;
        else if (layer === 'CA') key = `c:${String(record.props?.F5 ?? record.props?.f5 ?? '?')}`;
        else if (layer === 'AF') key = `g:${[record.props?.B7, record.props?.O4].map((v) => String(v ?? '')).join('|')}`;
        else if (layer === 'BN') key = `b:${[record.props?.B7, record.props?.S8].map((v) => String(v ?? '')).join('|')}`;
        else if (layer === 'AX') key = `x:${[record.props?.Z5, record.props?.A6].map((v) => String(v ?? '')).join('|')}`;
        else key = `a:${['Z5', 'H7', 'L1', 'A6'].map((k) => String(record.props?.[k] ?? '')).join('|')}`;
        // 无稳定 id 的层（AF/BN/AX）名称可能重名，必须叠加坐标；AD/BI/respt/CA 按 id 或名称去重即可
        // （AD 不能叠加坐标：同一点在相邻瓦的量化坐标不等，会重复计数）
        if (['AF', 'BN', 'AX'].includes(layer) || key.endsWith('?') || key.includes('undefined')) {
            key += `@${pts.map((p: number[]) => p.map((v: number) => v.toFixed(7)).join(',')).join(';')}`;
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
export function topoLines(records: any[], zoom: number, layer: string) {
    const stats = { in: records.length, out: 0, union: 0, fallback: 0, fused: 0, dedup: 0, review: 0, clipped: 0 };
    const seen = new Set();
    const features: any[] = [];
    for (const record of records) {
        if (record.type !== 1) continue;
        for (const p of record.paths || []) {
            const pieces = clipPolylineToTile(p.points);
            for (const piece of pieces) {
                const ll = piece.map(([px, py]: number[]) => tilePointToLngLat(px, py, record.tx, record.ty, zoom));
                const key = ll.map((q: any) => q.map(round7).join(',')).join(';') + '|' + stableProps(record.props);
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
export function topoPassthrough(records: any[], zoom: number) {
    const features: any[] = [];
    for (const record of records) {
        if (record.type !== 2) continue;
        const ll: any[] = [];
        for (const p of record.paths || []) {
            if (p.points.length < 3) continue;
            const ring = p.points.map(([px, py]: number[]) => tilePointToLngLat(px, py, record.tx, record.ty, zoom));
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
export function fuseByS8(records: any[], zoom: number) {
    const stats = { in: records.length, out: 0, union: 0, fallback: 0, fused: 0, dedup: 0, review: 0, clipped: 0, fused_skip: 0 };
    const byS8 = new Map();
    for (const record of records) {
        if (record.type !== 2) continue;
        const s8 = String(record.props?.S8 ?? '__none__');
        if (!byS8.has(s8)) byS8.set(s8, []);
        for (const ring of closedRingsOf(record)) {
            const clippedRings = clipRingToTile(ring);
            if (!clippedRings.length) {
                stats.clipped += 1;
                continue;
            }
            for (const c of clippedRings) {
                byS8.get(s8).push({ ring: c, tx: record.tx, ty: record.ty, zoom, partial: !!record.partial, s8v: record.props?.S8 ?? null });
            }
        }
    }
    const features: any[] = [];
    for (const [, items] of byS8) {
        if (!items.length) continue;
        const z = items[0].zoom;
        const globals = items.map((it: any) => ({
            ring: globalRing(it.ring, it.tx, it.ty),
            s8v: it.s8v,
            tile: `${it.zoom}_${it.tx}_${it.ty}`,
            partial: it.partial,
        }));
        const seenR = new Set();
        const uniq: any[] = [];
        for (const g of globals) {
            const key = g.ring.map((q: any) => q.join(',')).join(';');
            if (seenR.has(key)) {
                stats.dedup += 1;
                continue;
            }
            seenR.add(key);
            uniq.push(g);
        }
        const n = uniq.length;
        const parent = uniq.map((_, i) => i);
        const find = (a: number) : number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
        const uni = (a: number, b: number) => {
            parent[find(a)] = find(b);
        };
        const keys = uniq.map((g) => new Set(g.ring.map((p: any) => `${Math.round(p[0])},${Math.round(p[1])}`)));
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
            let outRings: any = null;
            let fused = false;
            let partial = false;
            for (const mb of members) if (mb.partial) partial = true;
            if (members.length > 1) {
                const edgeCount = members.reduce((s: number, mb: any) => s + mb.ring.length, 0);
                if (edgeCount <= 20000) {
                    try {
                        const u = unionRings(members.map((mb: any) => mb.ring));
                        if (u.length && ringsArea(u) >= ringsArea(members.map((mb: any) => mb.ring)) * 0.99 - 1) {
                            outRings = u;
                            fused = true;
                            stats.fused += 1;
                        } else stats.fallback += 1;
                    } catch {
                        stats.fallback += 1;
                    }
                } else stats.fused_skip += 1;
            }
            if (!outRings) outRings = members.map((mb: any) => mb.ring);
            const ll = outRings.map((r: any) => r.map(([x, y]: number[]) => globalTileToLngLat(x, y, z)));
            const nested = nestRings(ll);
            const props: any = members[0].s8v == null ? {} : { S8: members[0].s8v };
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
export function topoTdtVectorLayers(perLayer: Map<string, any[]>, zoom: number): { layers: Record<string, any>; stats: Record<string, any> } {
    const layers: Record<string, any> = {};
    const stats: Record<string, any> = {};
    for (const [name, records] of perLayer) {
        let result;
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
                fillExtra: (dst: any, src: any) => {
                    if (dst.h == null && src.h != null) dst.h = src.h;
                    if (dst.floors == null && src.floors != null) dst.floors = src.floors;
                    if (dst.A6 == null && src.A6 != null) dst.A6 = src.A6;
                    if (!dst.name && src.name) dst.name = src.name;
                },
                props: (ex: any) => {
                    const p: any = { _layer: name };
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
        } else if (name === 'BV' || name === 'AR') {
            // BV 行政区划/国界面、AR 低 zoom 面状水体：原样直出，不裁剪不融合
            result = topoPassthrough(records, zoom);
        } else if (['BI', 'AD', 'respt', 'AF', 'CA', 'BN', 'AX'].includes(name)) {
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
