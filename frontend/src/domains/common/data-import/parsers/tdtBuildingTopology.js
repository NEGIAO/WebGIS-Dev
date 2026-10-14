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

/** Clip a decoded ring to the tile core so buffer geometry cannot leak into output. */
function clipRingToTile(ring) {
    // 开环化：Sutherland 用 (index+1)%len 环形遍历，而闭合环（首==尾）会让首点被再计入一次，
    // 旧版因此给【每个】输出环插入 1 个零长边（凹环还会沿裁剪边留下退化桥→自相交）。
    // 入参已闭合，先摘掉重合尾点，遍历即回到标准 S-H。
    let output = ring.slice();
    if (output.length > 1 && samePoint(output[0], output[output.length - 1])) output.pop();
    const limits = [
        [0, (point) => point[0] >= 0],
        [1, (point) => point[0] <= EXTENT],
        [2, (point) => point[1] >= 0],
        [3, (point) => point[1] <= EXTENT],
    ];
    for (const [side, inside] of limits) {
        if (!output.length) break;
        const next = [];
        for (let index = 0; index < output.length; index += 1) {
            const a = output[index];
            const b = output[(index + 1) % output.length];
            const insideA = inside(a);
            const insideB = inside(b);
            if (insideA !== insideB) {
                const axis = side < 2 ? 0 : 1;
                const bound = side === 0 || side === 2 ? 0 : EXTENT;
                const denominator = b[axis] - a[axis];
                if (Math.abs(denominator) > GEOM_EPS) {
                    const t = (bound - a[axis]) / denominator;
                    next.push([
                        a[0] + (b[0] - a[0]) * t,
                        a[1] + (b[1] - a[1]) * t,
                    ]);
                }
            }
            if (insideB) next.push(b);
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
            const clipped = clipRingToTile(ring);
            if (clipped.length >= 4) {
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

export { clipRingToTile, unionRings };
