const EXTENT = 4096;
const GEOM_EPS = 1e-7;
const TILE_SNAP = 1;
const SEAM_EPS = 2;

/** Compare two tile-coordinate points with the Union tolerance. */
function samePoint(a, b) {
    return Math.abs(a[0] - b[0]) <= GEOM_EPS && Math.abs(a[1] - b[1]) <= GEOM_EPS;
}

/** Convert a tile-local ring into snapped global tile coordinates. */
function globalRing(ring, tx, ty) {
    return ring.map(([x, y]) => [
        Math.round((tx * EXTENT + x) / TILE_SNAP) * TILE_SNAP,
        Math.round((ty * EXTENT + y) / TILE_SNAP) * TILE_SNAP,
    ]);
}

/** Convert global tile coordinates to WGS84 Web-Mercator tile longitude/latitude. */
function globalTileToLngLat(x, y, zoom) {
    const n = 2 ** zoom;
    const gx = x / EXTENT;
    const gy = y / EXTENT;
    return [
        (gx / n) * 360 - 180,
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / n))) * 180) / Math.PI,
    ];
}

/** 去重复相邻点。 */
function dedupeRing(ring) {
    const out = [];
    for (const point of ring) {
        if (!out.length || !samePoint(out[out.length - 1], point)) out.push(point);
    }
    return out;
}

/** 开环化：摘掉重合尾点，便于按 (i+1)%n 环形遍历。 */
function openRing(ring) {
    const out = ring.slice();
    if (out.length > 1 && samePoint(out[0], out[out.length - 1])) out.pop();
    return out;
}

/** 闭合环：首尾相同，且无重复相邻点。 */
function closeRing(ring) {
    const cleaned = dedupeRing(ring);
    if (cleaned.length && !samePoint(cleaned[0], cleaned[cleaned.length - 1])) cleaned.push(cleaned[0].slice());
    return cleaned;
}

/**
 * 单条裁剪线的半平面裁剪：**返回多个环**。
 *
 * 单环 Sutherland–Hodgman 的致命缺陷：当一个环被裁剪线切成 k>1 块时它只能输出 1 个环，
 * 于是用「沿裁剪线把各块首尾串起来」的退化桥连接——这条桥与各块自身的贴边段**重叠**，
 * 环沿同一条线被走了两遍，形成零宽走廊，GEOS 判 Self-intersection / Ring Self-intersection。
 * 实测：CE 层 1311 个建筑面里有 7 个由此产生非法几何，且权威 mjs 同源（同算法同缺陷）。
 *
 * 本实现分三步，是标准的「凸窗口 Weiler–Atherton」在矩形上的特化：
 *   1) 沿环遍历收集**内侧子链**（每条从入口交点到出口交点）；
 *   2) 把所有交点按「沿裁剪线的坐标」排序后**两两配对**——简单环与一条直线相交，其交点
 *      依序交替界定内/外区间，故相邻成对恰好就是内侧区间，也就是需要补上的那条弦；
 *   3) 从任一未消费的子链出发沿弦链式前进（落到某子链入口就正向走、落到出口就反向走），
 *      回到起点即闭合成环。被切开的 k 块自然得到 k 个合法环，U 形连通块也能正确串成一个环。
 *
 * @param {Array} ring 输入环（闭合或开环均可）
 * @param {number} axis 0=按 x 裁，1=按 y 裁
 * @param {number} bound 裁剪线在该轴上的坐标
 * @param {boolean} keepGreater true=保留 axis>=bound 一侧
 * @returns {Array<Array>} 闭合环数组（可能为空）
 */
function clipRingHalfPlane(ring, axis, bound, keepGreater) {
    const open = openRing(ring);
    const n = open.length;
    if (n < 3) return [];
    const inside = keepGreater ? (point) => point[axis] >= bound : (point) => point[axis] <= bound;
    // 从环外顶点起遍历：这样每条内侧子链都必然先「入口」后「出口」，收尾不会残留悬挂子链。
    let start = -1;
    for (let index = 0; index < n; index += 1) {
        if (!inside(open[index])) {
            start = index;
            break;
        }
    }
    if (start < 0) return [closeRing(open)];

    const subpaths = [];
    const crossings = [];
    const pushCrossing = (point, subpathIndex, end) => {
        crossings.push({ point, along: point[1 - axis], subpathIndex, end });
        return crossings.length - 1;
    };
    let run = null;
    let runEntry = -1;
    for (let step = 0; step < n; step += 1) {
        const a = open[(start + step) % n];
        const b = open[(start + step + 1) % n];
        const insideA = inside(a);
        const insideB = inside(b);
        if (insideA && insideB) {
            if (!run) {
                run = [a.slice()];
                runEntry = -1;
            }
            run.push(b.slice());
            continue;
        }
        if (!insideA && !insideB) continue;
        const denominator = b[axis] - a[axis];
        if (Math.abs(denominator) <= GEOM_EPS) continue;
        const t = (bound - a[axis]) / denominator;
        const cross = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (insideB) {
            run = [cross, b.slice()];
            runEntry = pushCrossing(cross, subpaths.length, 'entry');
        } else {
            if (!run) {
                run = [a.slice()];
                runEntry = pushCrossing(a, subpaths.length, 'entry');
            }
            run.push(cross);
            const exitKey = pushCrossing(cross, subpaths.length, 'exit');
            subpaths.push({ points: run, entryKey: runEntry, exitKey });
            run = null;
            runEntry = -1;
        }
    }
    if (run) {
        const exitKey = pushCrossing(run[0], subpaths.length, 'exit');
        subpaths.push({ points: run, entryKey: runEntry, exitKey });
    }
    if (!subpaths.length) return [];

    // 交点按沿裁剪线坐标排序 → 相邻两两配对即「内侧区间」。
    const order = crossings.map((_, index) => index)
        .sort((i, j) => crossings[i].along - crossings[j].along || i - j);
    const partner = new Array(crossings.length).fill(-1);
    for (let index = 0; index + 1 < order.length; index += 2) {
        partner[order[index]] = order[index + 1];
        partner[order[index + 1]] = order[index];
    }

    const rings = [];
    const used = new Array(subpaths.length).fill(false);
    for (let seed = 0; seed < subpaths.length; seed += 1) {
        if (used[seed]) continue;
        const startKey = subpaths[seed].entryKey;
        const points = [];
        let cursor = seed;
        let forward = true;
        for (let guard = 0; guard <= subpaths.length; guard += 1) {
            used[cursor] = true;
            const source = subpaths[cursor].points;
            const sequence = forward ? source : source.slice().reverse();
            for (let index = points.length ? 1 : 0; index < sequence.length; index += 1) {
                points.push(sequence[index].slice());
            }
            const endKey = forward ? subpaths[cursor].exitKey : subpaths[cursor].entryKey;
            const next = partner[endKey];
            if (next < 0) break;
            points.push(crossings[next].point.slice());
            if (next === startKey) break;
            cursor = crossings[next].subpathIndex;
            forward = crossings[next].end === 'entry';
        }
        const closed = closeRing(points);
        if (closed.length >= 4) rings.push(closed);
    }
    return rings;
}

/**
 * 面裁剪到任意矩形：**返回多个环**（替代旧单环 Sutherland–Hodgman）。
 * 4 条边依次做半平面裁剪，每一条边都可能把 1 个环拆成多个。
 */
function clipRingToRectMulti(ring, x0, y0, x1, y1) {
    let rings = [closeRing(ring)];
    const planes = [[0, x0, true], [0, x1, false], [1, y0, true], [1, y1, false]];
    for (const [axis, bound, keepGreater] of planes) {
        const next = [];
        for (const current of rings) {
            if (current.length < 3) continue;
            for (const out of clipRingHalfPlane(current, axis, bound, keepGreater)) next.push(out);
        }
        rings = next;
        if (!rings.length) return [];
    }
    return rings.filter((current) => current.length >= 4);
}

/** 面裁剪到任意矩形（返回多个环）。clipRingToTile 为其 [0,4096] 特例。 */
function clipRingToRect(ring, x0, y0, x1, y1) {
    return clipRingToRectMulti(ring, x0, y0, x1, y1);
}

/** 面裁剪到瓦片核心 [0,4096]（去 buffer；返回多个环）。 */
function clipRingToTile(ring) {
    return clipRingToRectMulti(ring, 0, 0, EXTENT, EXTENT);
}

/** Determine whether a ring participates in the narrow cross-tile seam band. */
function touchesTileSeam(ring) {
    return ring.some(([x, y]) =>
        x <= SEAM_EPS || x >= EXTENT - SEAM_EPS ||
        y <= SEAM_EPS || y >= EXTENT - SEAM_EPS);
}

/** Test whether a point is inside an even-odd collection of rings. */
function pointInRings(rings, point) {
    let inside = false;
    for (const ring of rings) {
        for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
            const a = ring[index];
            const b = ring[previous];
            if ((a[1] > point[1]) !== (b[1] > point[1]) &&
                point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) {
                inside = !inside;
            }
        }
    }
    return inside;
}

/** Add an interior segment parameter if it is numerically meaningful. */
function addSplitParameter(parameters, value) {
    if (value > GEOM_EPS && value < 1 - GEOM_EPS) parameters.push(value);
}

/** Find proper and collinear intersections between two segments. */
function splitIntersection(a, b, c, d) {
    const rx = b[0] - a[0];
    const ry = b[1] - a[1];
    const sx = d[0] - c[0];
    const sy = d[1] - c[1];
    const qx = c[0] - a[0];
    const qy = c[1] - a[1];
    const denominator = rx * sy - ry * sx;
    const result = [[], []];
    if (Math.abs(denominator) > GEOM_EPS) {
        addSplitParameter(result[0], (qx * sy - qy * sx) / denominator);
        addSplitParameter(result[1], (qx * ry - qy * rx) / denominator);
        return result;
    }
    if (Math.abs(qx * ry - qy * rx) > GEOM_EPS) return result;
    const rr = rx * rx + ry * ry;
    const ss = sx * sx + sy * sy;
    if (rr > GEOM_EPS) {
        addSplitParameter(result[0], ((c[0] - a[0]) * rx + (c[1] - a[1]) * ry) / rr);
        addSplitParameter(result[0], ((d[0] - a[0]) * rx + (d[1] - a[1]) * ry) / rr);
    }
    if (ss > GEOM_EPS) {
        addSplitParameter(result[1], ((a[0] - c[0]) * sx + (a[1] - c[1]) * sy) / ss);
        addSplitParameter(result[1], ((b[0] - c[0]) * sx + (b[1] - c[1]) * sy) / ss);
    }
    return result;
}

/** Build the exterior boundary of overlapping rings without third-party geometry packages. */
function unionRings(inputRings) {
    const rings = inputRings.map((ring) => {
        const output = [];
        for (const point of ring) {
            const snapped = [
                Math.round(point[0] / TILE_SNAP) * TILE_SNAP,
                Math.round(point[1] / TILE_SNAP) * TILE_SNAP,
            ];
            if (!output.length || !samePoint(output[output.length - 1], snapped)) output.push(snapped);
        }
        if (output.length > 1 && samePoint(output[0], output[output.length - 1])) output.pop();
        return output;
    }).filter((ring) => ring.length >= 3);
    const source = [];
    for (const ring of rings) {
        for (let index = 0; index < ring.length; index += 1) {
            source.push({ a: ring[index], b: ring[(index + 1) % ring.length], cuts: [0, 1] });
        }
    }
    for (let left = 0; left < source.length; left += 1) {
        for (let right = left + 1; right < source.length; right += 1) {
            const [a, b] = splitIntersection(
                source[left].a,
                source[left].b,
                source[right].a,
                source[right].b,
            );
            source[left].cuts.push(...a);
            source[right].cuts.push(...b);
        }
    }
    const pointKey = (point) =>
        `${Math.round(point[0] / TILE_SNAP)},${Math.round(point[1] / TILE_SNAP)}`;
    const boundary = [];
    for (const edge of source) {
        const cuts = [...new Set(edge.cuts.sort((a, b) => a - b))];
        for (let index = 0; index + 1 < cuts.length; index += 1) {
            const t0 = cuts[index];
            const t1 = cuts[index + 1];
            const a = [
                edge.a[0] + (edge.b[0] - edge.a[0]) * t0,
                edge.a[1] + (edge.b[1] - edge.a[1]) * t0,
            ];
            const b = [
                edge.a[0] + (edge.b[0] - edge.a[0]) * t1,
                edge.a[1] + (edge.b[1] - edge.a[1]) * t1,
            ];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const length = Math.hypot(dx, dy);
            if (length <= GEOM_EPS) continue;
            const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const delta = Math.min(0.01, length / 100);
            const left = [midpoint[0] - (dy / length) * delta, midpoint[1] + (dx / length) * delta];
            const right = [midpoint[0] + (dy / length) * delta, midpoint[1] - (dx / length) * delta];
            const leftInside = pointInRings(rings, left);
            const rightInside = pointInRings(rings, right);
            if (leftInside === rightInside) continue;
            const start = leftInside ? a : b;
            const end = leftInside ? b : a;
            boundary.push({ a: start, b: end, ak: pointKey(start), bk: pointKey(end) });
        }
    }
    const unique = new Map();
    for (const edge of boundary) {
        const forward = `${edge.ak}>${edge.bk}`;
        const reverse = `${edge.bk}>${edge.ak}`;
        if (unique.has(reverse)) unique.delete(reverse);
        else if (!unique.has(forward)) unique.set(forward, edge);
    }
    const edges = [...unique.values()];
    const outgoing = new Map();
    for (const edge of edges) {
        if (!outgoing.has(edge.ak)) outgoing.set(edge.ak, []);
        outgoing.get(edge.ak).push(edge);
    }
    const output = [];
    for (const first of edges) {
        if (first.used) continue;
        first.used = true;
        const ring = [first.a, first.b];
        let previous = first.a;
        let current = first.b;
        while (!samePoint(current, ring[0])) {
            const candidates = (outgoing.get(pointKey(current)) || []).filter((edge) => !edge.used);
            if (!candidates.length) break;
            const incoming = Math.atan2(current[1] - previous[1], current[0] - previous[0]);
            candidates.sort((left, right) => {
                const turn = (edge) => {
                    const angle = Math.atan2(edge.b[1] - edge.a[1], edge.b[0] - edge.a[0]);
                    return (angle - incoming + Math.PI * 2) % (Math.PI * 2);
                };
                return turn(left) - turn(right);
            });
            const next = candidates[0];
            next.used = true;
            previous = current;
            current = next.b;
            ring.push(current);
            if (ring.length > edges.length + 1) break;
        }
        if (samePoint(current, ring[0]) && ring.length >= 4) {
            const cleaned = [];
            for (const point of ring) {
                if (!cleaned.length || !samePoint(cleaned[cleaned.length - 1], point)) cleaned.push(point);
            }
            if (!samePoint(cleaned[0], cleaned[cleaned.length - 1])) cleaned.push(cleaned[0]);
            if (cleaned.length >= 4) output.push(cleaned);
        }
    }
    return output;
}

/** Merge decoded CE fragments by elemid, Union only seam-crossing multi-tile groups. */
export function mergeTdtBuildings(records) {
    const groups = new Map();
    for (const record of records) {
        if (!groups.has(record.id)) {
            groups.set(record.id, {
                parts: [],
                tileKeys: new Set(),
                touchesSeam: false,
                height: record.h,
                floors: record.floors,
                A6: record.A6,
                name: record.name,
            });
        }
        const group = groups.get(record.id);
        for (const ring of record.rings || []) {
            // 核心裁剪可能把 1 个环拆成多个（贴瓦片边被切开），逐个收编。
            for (const clipped of clipRingToTile(ring)) {
                if (clipped.length < 4) continue;
                group.parts.push({ ring: clipped, tx: record.tx, ty: record.ty, zoom: record.zoom });
                group.tileKeys.add(`${record.tx},${record.ty},${record.zoom}`);
                group.touchesSeam = group.touchesSeam || touchesTileSeam(clipped);
            }
        }
        if (group.height == null && record.h != null) group.height = record.h;
        if (group.floors == null && record.floors != null) group.floors = record.floors;
        if (group.A6 == null && record.A6 != null) group.A6 = record.A6;
        if (!group.name && record.name) group.name = record.name;
    }
    const features = [];
    for (const [id, group] of groups) {
        if (!group.parts.length) continue;
        const globalRings = group.parts.map((part) => globalRing(part.ring, part.tx, part.ty));
        const needsUnion = group.parts.length > 1 && group.tileKeys.size > 1 && group.touchesSeam;
        let mergedRings = globalRings;
        if (needsUnion) {
            try {
                mergedRings = unionRings(globalRings);
            } catch (error) {
                console.error(`建筑 ${id} Union 失败: ${error.message}`);
            }
            if (!mergedRings.length) mergedRings = globalRings;
        }
        const polygons = mergedRings.map((ring) => [
            ring.map(([x, y]) => globalTileToLngLat(x, y, group.parts[0].zoom)),
        ]);
        if (!polygons.length) continue;
        const properties = { elemid: id };
        if (group.height != null && group.height > 0) properties.height_m = group.height;
        if (group.floors != null) properties.floors = Number(group.floors);
        if (group.A6 != null) properties.A6 = group.A6;
        if (group.name) properties.name = group.name;
        features.push({
            type: 'Feature',
            properties,
            geometry: {
                type: polygons.length > 1 ? 'MultiPolygon' : 'Polygon',
                coordinates: polygons.length > 1 ? polygons : polygons[0],
            },
        });
    }
    return {
        type: 'FeatureCollection',
        crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
        features,
    };
}

export { clipRingToTile, clipRingToRect, clipRingToRectMulti, unionRings };
