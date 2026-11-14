import { featureProperties, findCommands, lenientDecoder, parseFeature, parseFeatureContainerXor, parseLayer, parseTags, parseTop, parseValue, readLenXor, readTagXor, splitFields, strictDecoder, toHex, vint } from './pbf';

export function parsePreambleLayer(raw: any) {
    if (raw[0] !== 0x1a || raw.length < 4) return null;
    const lb = raw[1];
    const len = (lb & 0x80) ? (lb ^ 0xff) : lb;
    if (len <= 0 || len > raw.length - 2) return null;
    const content = raw.slice(2, 2 + len);
    let pos = 0;
    let feature: any = null;
    let name = '';
    const keys: any[] = [];
    const values: any[] = [];
    while (pos < content.length) {
        const tag = readTagXor(content, pos);
        if (!tag) {
            pos += 1;
            continue;
        }
        pos += 1;
        if (tag.wt === 0) {
            const r = vint(content, pos);
            if (!r) break;
            pos = r.pos;
            continue;
        }
        if (tag.wt === 2) {
            const rl = readLenXor(content, pos, content.length - pos - 1);
            if (rl.v < 0) break;
            pos += rl.n;
            const data = content.slice(pos, pos + rl.v);
            if (tag.fl === 1) feature = parseFeatureContainerXor(data);
            else if (tag.fl === 2) name = lenientDecoder.decode(data);
            else if (tag.fl === 4) keys.push(lenientDecoder.decode(data));
            else if (tag.fl === 3) {
                let val: any = null;
                for (const vf of splitFields(data)) {
                    if (vf.fl === 1 && vf.wt === 2) {
                        const s = data.slice(vf.start, vf.start + vf.L);
                        let st;
                        try {
                            st = strictDecoder.decode(s);
                        } catch {
                            st = null;
                        }
                        val = (st !== null && !st.includes('\ufffd')) ? st : { __raw_hex: toHex(s) };
                    } else if (vf.fl === 3 && vf.wt === 5 && vf.start + 4 <= data.length) {
                        val = new DataView(data.buffer, data.byteOffset + vf.start, 4).getFloat32(0, true);
                    } else if (vf.fl === 3 && vf.wt === 1 && vf.start + 8 <= data.length) {
                        val = new DataView(data.buffer, data.byteOffset + vf.start, 8).getFloat64(0, true);
                    }
                }
                values.push(val);
            }
            pos += rl.v;
            continue;
        }
        break;
    }
    if (!name || !feature || !feature.geom) return null;
    const props: Record<string, any> = {};
    for (let i = 0; i + 1 < feature.tags.length; i += 2) {
        const k = feature.tags[i];
        const v = feature.tags[i + 1];
        if (k < keys.length && v < values.length) props[keys[k]] = values[v];
    }
    return {
        name,
        keys,
        values,
        features: [{
            type: feature.type,
            tags: feature.tags,
            props,
            paths: feature.geom.map((p: any) => ({ points: p.points, closed: p.closed })),
            partial: !!feature.partial,
        }],
    };
}

/** 裸层：首个标准层之前的头部块（严格 parseTop + 特性字段前置于层名字段；对齐 mjs parseBareBlock）。 */
export function parseBareBlock(buf: any) {
    const top = parseTop(buf);
    if (!top.ok) return null;
    const fields = top.fields;
    const nameIdx = fields.findIndex((f) => f.fl === 2 && f.wt === 2);
    if (nameIdx < 0) return null;
    const name = lenientDecoder.decode(buf.slice(fields[nameIdx].start, fields[nameIdx].start + fields[nameIdx].L));
    if (!/^[A-Za-z]{2,5}$/.test(name)) return null;
    const featFields = fields.slice(0, nameIdx);
    const layerFields = fields.slice(nameIdx + 1);
    const keys: any[] = [];
    const values: any[] = [];
    for (const f of layerFields) {
        if (f.fl === 4 && f.wt === 2) keys.push(lenientDecoder.decode(buf.slice(f.start, f.start + f.L)));
        else if (f.fl === 3 && f.wt === 2) values.push(parseValue(buf.slice(f.start, f.start + f.L)).value);
        else if (f.fl === 5 && f.wt === 0) { /* extent 可选，前端拓扑恒按 4096 */ }
        else if (f.fl === 15 && f.wt === 0) { /* version 可选 */ }
        else return null;
    }
    if (!keys.length) return null;
    const rawFeatures: any[] = [];
    let cur: any = null;
    const flush = () => {
        if (cur && cur.tags && cur.type != null && cur.geoms.length) rawFeatures.push(cur);
        cur = null;
    };
    for (const f of featFields) {
        if (f.fl === 1 && f.wt === 2) {
            const sub = buf.slice(f.start, f.start + f.L);
            const wrapped = parseFeature(sub);
            const wrappedComplete = wrapped.type != null && wrapped.tags.length && wrapped.pathGroups.flat().length;
            if (wrappedComplete) {
                flush();
                rawFeatures.push({ type: wrapped.type, tags: wrapped.tags, geoms: wrapped.pathGroups.flat(), partial: !!wrapped.partial });
                continue;
            }
            const res = findCommands(sub);
            if (!res || !res.paths.length) return null;
            if (!cur) cur = { geoms: [], type: null, tags: null, partial: false };
            cur.geoms.push(...res.paths);
            if (res.partial) cur.partial = true;
        } else if (f.fl === 2 && f.wt === 0) {
            if (cur && cur.tags) flush();
            if (!cur) cur = { geoms: [], type: null, tags: null, partial: false };
            cur.type = f.v;
        } else if (f.fl === 3 && f.wt === 2) {
            if (!cur || !cur.geoms.length || cur.type == null) return null;
            cur.tags = parseTags(buf.slice(f.start, f.start + f.L));
            flush();
        } else return null;
    }
    flush();
    if (!rawFeatures.length) return null;
    const features: any[] = [];
    for (const rf of rawFeatures) {
        if (![1, 2, 4].includes(rf.type)) continue;
        if (!rf.tags.length || rf.tags.length % 2) continue;
        const props: Record<string, any> = {};
        for (let i = 0; i + 1 < rf.tags.length; i += 2) {
            const k = rf.tags[i];
            const v = rf.tags[i + 1];
            if (k < keys.length && v < values.length) props[keys[k]] = values[v];
        }
        features.push({
            type: rf.type,
            tags: rf.tags,
            props,
            paths: rf.geoms.map((p: any) => ({ points: p.points, closed: p.closed })),
            partial: !!rf.partial,
        });
    }
    if (!features.length) return null;
    return { name, keys, values, features };
}

/* ================= 解码入口（对齐 mjs decodeTileFull） ================= */

/**
 * CE 属性数字化（前端拓扑契约：height_m / floors）。
 *
 * 只对「量」字段取数：楼高 H/h、层数 F/floor（源里 h 已是 number、floor 是 '5' 这类字符串）。
 * **A6 不在此列**——A6 是行政区划码（实测恒为 '310301' 这类字符串），与 elemid 同属标识符而非度量：
 * 一旦走 Number() 就会丢前导零、且与 mjs 权威（直接透传 f.props.A6 字符串）产生类型漂移。
 */
export function coerceCeProps(props: any) {
    for (const key of ['H', 'h']) {
        if (props[key] != null && props[key] !== '') {
            const m = String(props[key]).match(/-?\d+(\.\d+)?/);
            if (m) props.h = Number(m[0]);
            if (key === 'H') delete props.H;
        }
    }
    const fr = props.F ?? props.floor ?? props.FLOOR;
    if (fr != null && fr !== '') {
        const m = String(fr).match(/-?\d+(\.\d+)?/);
        if (m) props.floors = Number(m[0]);
    }
    delete props.F;
    delete props.floor;
    delete props.FLOOR;
    return props;
}

/** 标准层检测（对齐 mjs detectLayers：全字节扫描 + parseTop 完整消费 + f5/f15 双证）。 */
export function detectLayers(body: Uint8Array) {
    const layers: any[] = [];
    for (let i = 0; i < body.length; i += 1) {
        if (body[i] !== 0x1a) continue;
        const tag = vint(body, i);
        if (!tag || tag.v !== 0x1a) continue;
        const length = vint(body, tag.pos);
        if (!length || length.v <= 0 || length.v > body.length - length.pos) continue;
        const content = body.slice(length.pos, length.pos + length.v);
        const res = parseTop(content);
        if (!res.ok) continue;
        if (!res.fields.some((x) => x.fl === 5 && x.wt === 0)) continue;
        if (!res.fields.some((x) => x.fl === 15 && x.wt === 0)) continue;
        layers.push({ bodyPos: i, content, L: length.v, total: tag.pos + length.v });
    }
    return layers;
}

/**
 * 全量解码入口（对齐 mjs decodeTileFull：XOR 还原 raw[99] + slice(5) + 前导/裸层/标准层三编码）。
 * @param {ArrayBuffer|Uint8Array} buf 瓦片二进制
 * @param {number} tx 瓦片 x
 * @param {number} ty 瓦片 y
 * @param {number} tz 级别
 * @returns {Array<object>} records[{layer,type,paths,props,partial,tx,ty,zoom,geomKind}]（tdtVectorTopology 输入契约）
 */
export function decodeTdtVectorTile(buf: ArrayBuffer | Uint8Array, tx: number, ty: number, tz: number) {
    const raw = buf instanceof Uint8Array ? buf.slice() : new Uint8Array(buf);
    if (raw.length > 99) raw[99] ^= 0xff;
    const body = raw.slice(5);
    const layerRecs = detectLayers(body);
    const preamble = parsePreambleLayer(raw);
    const firstStd = layerRecs.length ? Math.min(...layerRecs.map((r) => r.bodyPos)) : body.length;
    let bare: any = null;
    if (firstStd > 0) bare = parseBareBlock(body.slice(0, firstStd));
    const out: any[] = [];
    const pushLayer = (L: any, source: string) => {
        for (const f of L.features) {
            const paths = (f.pathGroups ? f.pathGroups.flat() : f.paths)
                .map((p: any) => ({ points: p.points, closed: p.closed }));
            const props = source === 'standard'
                ? featureProperties({ keys: L.keys, values: L.values }, f)
                : { ...(f.props || {}) };
            if (L.name === 'CE') coerceCeProps(props);
            out.push({
                layer: L.name,
                type: f.type,
                paths,
                props,
                partial: !!f.partial,
                tx,
                ty,
                zoom: tz,
                geomKind: f.type === 4 ? 'point' : f.type === 1 ? 'line' : 'polygon',
            });
        }
    };
    if (bare && preamble && bare.name === preamble.name) pushLayer(bare, 'bare');
    else {
        if (preamble) pushLayer(preamble, 'preamble');
        if (bare) pushLayer(bare, 'bare');
    }
    for (const lr of layerRecs) pushLayer(parseLayer(lr), 'standard');
    return out;
}
