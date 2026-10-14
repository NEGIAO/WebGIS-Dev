/**
 * 天地图全量矢量抓取（浏览器版，12 层）。
 *
 * 解码链逐函数对齐权威实现 tdt_vector_fetch.mjs（三编码 + Value 整数族 + ClosePath 修复）：
 *   - 修复①：几何链此前只做嵌套下降（pfind），从不直读命令流——真实瓦片 f1 几何即命令流
 *     （MoveTo2/LineTo3/ClosePath7 + zigzag 差分），导致所有标准层 0 要素；
 *     现对齐 mjs findCommands：先直读命令流，失败再按 f1 深嵌套递归（depth≤8）。
 *   - 修复②：前导层此前从 body（=raw.slice(5)）解析，实际前导层位于 raw[0..]（0x1a + XOR 长度
 *     + XOR 感知内容），导致前导层永远丢失；现对齐 mjs decodeTileFull 从 raw 解析。
 * 拓扑分层见 tdtVectorLayers.js 码表与 tdtVectorTopology.js。
 */
import { ALL_TDT_VECTOR_LAYERS, normalizeTdtLayerSelection } from './tdtVectorLayers.js';
import { topoTdtVectorLayers } from './tdtVectorTopology.js';

const TILE_HOSTS = ['tile0.tianditu.gov.cn', 'tile1.tianditu.gov.cn', 'tile2.tianditu.gov.cn'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function lngLatToXyz(lng, lat, zoom) {
    const n = 2 ** zoom;
    const x = Math.floor(((lng + 180) / 360) * n);
    const s = Math.sin((lat * Math.PI) / 180);
    const y = Math.floor(((1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2) * n);
    return [x, y];
}

export function pkEncode(x, y, z) {
    let n = '';
    for (let level = z; level >= 0; level -= 1) {
        const mask = 1 << level;
        let value = 0;
        if (x & mask) value |= 1;
        if (y & mask) value |= 2;
        n += value;
    }
    let encoded = n.split('').reverse().join('');
    const replaceAt = (value, index, replacement) => value.substring(0, index) + replacement + value.substring(index + 1);
    for (const index of [9, 8, 7, 6]) {
        if (index < encoded.length) encoded = replaceAt(encoded, index, 1 + Number(encoded[index]));
    }
    let result = '';
    let previous = '';
    let repeated = 0;
    for (let index = 0; index < encoded.length; index += 1) {
        const token = String.fromCharCode(97 + 3 * Number(encoded[index]));
        let insertion = result.length - 1;
        if (token === previous) {
            repeated += 1;
            if (repeated === 1) insertion += 1;
            else if (repeated > 10) insertion -= 1;
            result = result.slice(0, insertion) + repeated;
        } else {
            result += token;
            previous = token;
            repeated = 0;
        }
    }
    return result;
}

export function estimateTdtVectorTiles(bbox, zoom) {
    const corners = [
        lngLatToXyz(bbox.minLng, bbox.minLat, zoom),
        lngLatToXyz(bbox.minLng, bbox.maxLat, zoom),
        lngLatToXyz(bbox.maxLng, bbox.minLat, zoom),
        lngLatToXyz(bbox.maxLng, bbox.maxLat, zoom),
    ];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const tiles = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    return { tiles, batches: tiles, seconds: Math.round(tiles * 0.8) };
}

export { ALL_TDT_VECTOR_LAYERS, normalizeTdtLayerSelection, topoTdtVectorLayers, sleep, TILE_HOSTS };

/* ================= protobuf reader（对齐 mjs R_ / splitFields / parseTop） ================= */

const lenientDecoder = new TextDecoder('utf-8', { fatal: false });
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

/** varint 读取（≤6 字节，对齐 mjs R_.u32 容忍度；越界/畸形返回 null）。 */
function vint(buf, pos) {
    let v = 0;
    let sh = 0;
    for (let k = 0; k < 6; k += 1) {
        if (pos >= buf.length) return null;
        const b = buf[pos];
        pos += 1;
        v += (b & 0x7f) * 2 ** sh;
        if (!(b & 0x80)) return { v, pos };
        sh += 7;
    }
    return null;
}

function toHex(bytes) {
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return hex;
}

/** 通用字段切分（对齐 mjs splitFields）：wt0 存 num/start，wt2 存 L/start。 */
function splitFields(buf) {
    const out = [];
    let pos = 0;
    while (pos < buf.length) {
        const t = vint(buf, pos);
        if (!t) break;
        pos = t.pos;
        const fl = Math.floor(t.v / 8);
        const wt = t.v & 7;
        if (![0, 1, 2, 5].includes(wt)) break;
        if (wt === 0) {
            const n = vint(buf, pos);
            if (!n) break;
            out.push({ fl, wt, num: n.v, start: pos });
            pos = n.pos;
        } else if (wt === 1) {
            out.push({ fl, wt, start: pos });
            pos += 8;
        } else if (wt === 5) {
            out.push({ fl, wt, start: pos });
            pos += 4;
        } else {
            const l = vint(buf, pos);
            if (!l || l.v > buf.length - l.pos) break;
            out.push({ fl, wt, L: l.v, start: l.pos });
            pos = l.pos + l.v;
        }
    }
    return out;
}

/** 顶层严格解析（对齐 mjs parseTop）：完整消费才算 ok（标准层判定依据）。 */
function parseTop(buf) {
    const fields = [];
    let pos = 0;
    let guard = 0;
    while (pos < buf.length && guard < buf.length * 4 + 20) {
        guard += 1;
        const s0 = pos;
        const t = vint(buf, pos);
        if (!t || t.v === 0) return { fields, ok: false };
        pos = t.pos;
        const fl = Math.floor(t.v / 8);
        const wt = t.v & 7;
        if (![0, 1, 2, 5].includes(wt)) return { fields, ok: false };
        if (wt === 0) {
            const v = vint(buf, pos);
            if (!v) return { fields, ok: false };
            fields.push({ fl, wt, v: v.v, start: s0 });
            pos = v.pos;
        } else if (wt === 1) {
            if (pos + 8 > buf.length) return { fields, ok: false };
            fields.push({ fl, wt, start: pos });
            pos += 8;
        } else if (wt === 5) {
            if (pos + 4 > buf.length) return { fields, ok: false };
            fields.push({ fl, wt, start: pos });
            pos += 4;
        } else {
            const l = vint(buf, pos);
            if (!l || l.v > buf.length - l.pos) return { fields, ok: false };
            fields.push({ fl, wt, L: l.v, start: l.pos });
            pos = l.pos + l.v;
            if (pos <= s0) return { fields, ok: false };
        }
    }
    return { fields, ok: pos === buf.length };
}

/* ================= 几何（对齐 mjs parseCommands / findCommands） ================= */

const zig = (t) => (t % 2 === 1 ? -(t + 1) / 2 : t / 2);

/** 命令流 → 路径（对齐 mjs parseCommands：首命令必须 MoveTo2；ClosePath7 补首点闭合；
 * 坐标界 [-1000,5100]；尾渣优雅降级 partial）。 */
function parseCommands(buf) {
    let pos = 0;
    let x = 0;
    let y = 0;
    let cur = null;
    let left = 0;
    const paths = [];
    let seenCmd = false;
    let sawClose = false;
    let partial = false;
    const graceful = () => {
        if (sawClose && paths.length) {
            partial = true;
            return true;
        }
        return false;
    };
    const fail = () => (graceful() ? { paths, partial } : null);
    while (pos < buf.length) {
        if (left <= 0) {
            const c = vint(buf, pos);
            if (!c) return fail();
            pos = c.pos;
            const id = c.v & 7;
            left = c.v >>> 3;
            if (![2, 3, 7].includes(id) || left > 5000) return fail();
            if (!seenCmd && id !== 2) return fail();
            seenCmd = true;
            if (id === 2) {
                if (cur) paths.push(cur);
                cur = { points: [], closed: false };
            }
            if (id === 7) {
                if (!cur || cur.points.length < 2) return fail();
                cur.points.push(cur.points[0]);
                cur.closed = true;
                paths.push(cur);
                cur = null;
                sawClose = true;
                left = 0;
                continue;
            }
        }
        left -= 1;
        const a = vint(buf, pos);
        if (!a) return fail();
        const b = vint(buf, a.pos);
        if (!b) return fail();
        pos = b.pos;
        x += zig(a.v);
        y += zig(b.v);
        if (x < -1000 || x > 5100 || y < -1000 || y > 5100) {
            if (graceful()) return { paths, partial };
            return null;
        }
        if (!cur) return fail();
        cur.points.push([x, y]);
    }
    if (!seenCmd) return null;
    if (cur) paths.push(cur);
    return { paths, partial };
}

/** 几何容器解析（对齐 mjs findCommands，修复①核心）：先直读命令流，失败再按 f1 深嵌套递归。 */
function findCommands(buf, depth = 0) {
    const direct = parseCommands(buf);
    if (direct && direct.paths.length) return direct;
    if (depth >= 8) return null;
    for (const f of splitFields(buf)) {
        if (f.fl !== 1 || f.wt !== 2) continue;
        const nested = findCommands(buf.slice(f.start, f.start + f.L), depth + 1);
        if (nested && nested.paths.length) return nested;
    }
    return null;
}

/* ================= Value / tags / 要素 / 层（对齐 mjs） ================= */

/** varint64（BigInt，对齐 mjs readVarint64）。 */
function readVarint64(buf, pos) {
    let result = 0n;
    let shift = 0n;
    for (let k = 0; k < 10; k += 1) {
        if (pos >= buf.length) return null;
        const c = BigInt(buf[pos]);
        pos += 1;
        result |= (c & 0x7fn) << shift;
        if (!(c & 0x80n)) return { value: result, pos };
        shift += 7n;
    }
    return null;
}

/** Value 消息解析（对齐 mjs parseValue）：f1 字符串（严格 UTF-8，失败记 __raw_hex）/
 * f3 浮点 / 整数族 f4 int64、f5 uint64、f6 sint64、f7 bool。返回 { value, kind }。 */
function parseValue(buf) {
    let value = null;
    let kind = 'empty';
    for (const f of splitFields(buf)) {
        if (f.fl === 1 && f.wt === 2) {
            const s = buf.slice(f.start, f.start + f.L);
            let st = null;
            try {
                st = strictDecoder.decode(s);
            } catch {
                st = null;
            }
            if (st !== null && !st.includes('\ufffd')) {
                value = st;
                kind = 'string';
            } else {
                value = { __raw_hex: toHex(s) };
                kind = 'rawhex';
            }
        } else if (f.fl === 3 && f.wt === 5) {
            if (f.start + 4 <= buf.length) {
                value = new DataView(buf.buffer, buf.byteOffset + f.start, 4).getFloat32(0, true);
                kind = 'float32';
            }
        } else if (f.fl === 3 && f.wt === 1) {
            if (f.start + 8 <= buf.length) {
                value = new DataView(buf.buffer, buf.byteOffset + f.start, 8).getFloat64(0, true);
                kind = 'float64';
            }
        } else if (f.wt === 0 && (f.fl === 2 || f.fl === 4 || f.fl === 5 || f.fl === 6 || f.fl === 7)) {
            const r = readVarint64(buf, f.start);
            if (!r) continue;
            if (f.fl === 6) {
                const mag = r.value >> 1n;
                const v = (r.value & 1n) ? -(mag + 1n) : mag;
                value = v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : `bigint:${v.toString()}`;
                kind = 'sint64';
            } else if (f.fl === 7) {
                value = r.value !== 0n;
                kind = 'bool';
            } else {
                value = r.value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(r.value) : `bigint:${r.value.toString()}`;
                kind = f.fl === 5 ? 'uint64' : 'int64';
            }
        }
    }
    return { value, kind };
}

/** packed varint tags（对齐 mjs parseTags）。 */
function parseTags(buf) {
    const arr = [];
    let pos = 0;
    while (pos < buf.length) {
        const v = vint(buf, pos);
        if (!v) break;
        arr.push(v.v);
        pos = v.pos;
    }
    return arr;
}

/** 要素解析（对齐 mjs parseFeature）：f1 几何走 findCommands（直读优先）、f2 类型、f3 tags。 */
function parseFeature(fbuf) {
    const fields = splitFields(fbuf);
    const pathGroups = [];
    let type = null;
    let tagsRaw = null;
    let partial = false;
    for (const f of fields) {
        if (f.fl === 1 && f.wt === 2) {
            const sub = fbuf.slice(f.start, f.start + f.L);
            const res = findCommands(sub);
            if (res && res.paths.length) {
                pathGroups.push(res.paths);
                if (res.partial) partial = true;
            }
        } else if (f.fl === 2 && f.wt === 0) {
            type = f.num;
        } else if (f.fl === 3 && f.wt === 2) {
            tagsRaw = fbuf.slice(f.start, f.start + f.L);
        }
    }
    const tags = tagsRaw ? parseTags(tagsRaw) : [];
    return { pathGroups, type, tags, partial };
}

/** 标准层解析（对齐 mjs parseLayer）：f1 要素 / f2 层名 / f3 values / f4 keys / f5 extent / f15 version。 */
function parseLayer(layer) {
    const c = layer.content;
    const fields = splitFields(c);
    let name = '';
    let extent = 4096;
    let version = 2;
    const keys = [];
    const values = [];
    const features = [];
    for (const f of fields) {
        if (f.fl === 2 && f.wt === 2) name = lenientDecoder.decode(c.slice(f.start, f.start + f.L));
        else if (f.fl === 5 && f.wt === 0) extent = f.num;
        else if (f.fl === 15 && f.wt === 0) version = f.num;
        else if (f.fl === 4 && f.wt === 2) keys.push(lenientDecoder.decode(c.slice(f.start, f.start + f.L)));
        else if (f.fl === 3 && f.wt === 2) values.push(parseValue(c.slice(f.start, f.start + f.L)).value);
        else if (f.fl === 1 && f.wt === 2) features.push(parseFeature(c.slice(f.start, f.start + f.L)));
    }
    return { name, extent, version, keys, values, features };
}

/** 要素属性宽表（对齐 mjs featureProperties：tags 奇偶对 → keys/values 索引界内取值）。 */
function featureProperties(layer, feature) {
    const props = {};
    for (let i = 0; i + 1 < feature.tags.length; i += 2) {
        const k = feature.tags[i];
        const v = feature.tags[i + 1];
        if (k < layer.keys.length && v < layer.values.length) props[layer.keys[k]] = layer.values[v];
    }
    return props;
}

/* ================= 前导层 / 裸层（对齐 mjs readTagXor / readLenXor / parseFeatureContainerXor / parsePreambleLayer / parseBareBlock） ================= */

/** XOR tag 感知（明文或 ^0xff 均视为合法 tag）。 */
function readTagXor(buf, pos) {
    const b = buf[pos];
    const fl = b >>> 3;
    const wt = b & 7;
    if (fl >= 1 && fl <= 15 && [0, 1, 2, 5].includes(wt)) return { fl, wt };
    const rb = b ^ 0xff;
    const rfl = rb >>> 3;
    const rwt = rb & 7;
    if (rfl >= 1 && rfl <= 15 && [0, 1, 2, 5].includes(rwt)) return { fl: rfl, wt: rwt };
    return null;
}

/** XOR 长度感知（明文或 ^0xff 单字节，多字节 varint 兜底）。 */
function readLenXor(buf, pos, remain) {
    const b = buf[pos];
    if (!(b & 0x80) && b <= remain) return { v: b, n: 1 };
    const rb = b ^ 0xff;
    if (!(rb & 0x80) && rb <= remain) return { v: rb, n: 1 };
    const r = vint(buf, pos);
    if (r && r.v >= 0 && r.v <= remain) return { v: r.v, n: r.pos - pos };
    return { v: -1, n: 0 };
}

/** 前导层要素容器（XOR 感知；f1 几何直读命令流，失败递归容器；对齐 mjs parseFeatureContainerXor）。 */
function parseFeatureContainerXor(buf) {
    let pos = 0;
    let geom = null;
    let type = null;
    let tags = [];
    let partial = false;
    while (pos < buf.length) {
        const tag = readTagXor(buf, pos);
        if (!tag) {
            pos += 1;
            continue;
        }
        pos += 1;
        if (tag.wt === 0) {
            const r = vint(buf, pos);
            if (!r) break;
            if (tag.fl === 2) type = r.v;
            pos = r.pos;
            continue;
        }
        if (tag.wt === 2) {
            const rl = readLenXor(buf, pos, buf.length - pos - 1);
            if (rl.v < 0) break;
            pos += rl.n;
            const data = buf.slice(pos, pos + rl.v);
            if (tag.fl === 1) {
                const res = parseCommands(data);
                if (res) {
                    geom = res.paths;
                    if (res.partial) partial = true;
                } else {
                    const inner = parseFeatureContainerXor(data);
                    if (inner.geom) {
                        geom = inner.geom;
                        if (inner.type != null) type = inner.type;
                        if (inner.tags.length) tags = inner.tags;
                        if (inner.partial) partial = true;
                    }
                }
            } else if (tag.fl === 3) {
                tags = parseTags(data);
            }
            pos += rl.v;
            continue;
        }
        break;
    }
    return { geom, type, tags, partial };
}

/** 前导层：raw[0]=0x1a + XOR 长度 + XOR 感知单要素（对齐 mjs parsePreambleLayer，入参必须是整个 raw）。 */
function parsePreambleLayer(raw) {
    if (raw[0] !== 0x1a || raw.length < 4) return null;
    const lb = raw[1];
    const len = (lb & 0x80) ? (lb ^ 0xff) : lb;
    if (len <= 0 || len > raw.length - 2) return null;
    const content = raw.slice(2, 2 + len);
    let pos = 0;
    let feature = null;
    let name = '';
    const keys = [];
    const values = [];
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
                let val = null;
                for (const vf of splitFields(data)) {
                    if (vf.fl === 1 && vf.wt === 2) {
                        const s = data.slice(vf.start, vf.start + vf.L);
                        let st = null;
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
    const props = {};
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
            paths: feature.geom.map((p) => ({ points: p.points, closed: p.closed })),
            partial: !!feature.partial,
        }],
    };
}

/** 裸层：首个标准层之前的头部块（严格 parseTop + 特性字段前置于层名字段；对齐 mjs parseBareBlock）。 */
function parseBareBlock(buf) {
    const top = parseTop(buf);
    if (!top.ok) return null;
    const fields = top.fields;
    const nameIdx = fields.findIndex((f) => f.fl === 2 && f.wt === 2);
    if (nameIdx < 0) return null;
    const name = lenientDecoder.decode(buf.slice(fields[nameIdx].start, fields[nameIdx].start + fields[nameIdx].L));
    if (!/^[A-Za-z]{2,5}$/.test(name)) return null;
    const featFields = fields.slice(0, nameIdx);
    const layerFields = fields.slice(nameIdx + 1);
    const keys = [];
    const values = [];
    for (const f of layerFields) {
        if (f.fl === 4 && f.wt === 2) keys.push(lenientDecoder.decode(buf.slice(f.start, f.start + f.L)));
        else if (f.fl === 3 && f.wt === 2) values.push(parseValue(buf.slice(f.start, f.start + f.L)).value);
        else if (f.fl === 5 && f.wt === 0) { /* extent 可选，前端拓扑恒按 4096 */ }
        else if (f.fl === 15 && f.wt === 0) { /* version 可选 */ }
        else return null;
    }
    if (!keys.length) return null;
    const rawFeatures = [];
    let cur = null;
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
    const features = [];
    for (const rf of rawFeatures) {
        if (![1, 2, 4].includes(rf.type)) continue;
        if (!rf.tags.length || rf.tags.length % 2) continue;
        const props = {};
        for (let i = 0; i + 1 < rf.tags.length; i += 2) {
            const k = rf.tags[i];
            const v = rf.tags[i + 1];
            if (k < keys.length && v < values.length) props[keys[k]] = values[v];
        }
        features.push({
            type: rf.type,
            tags: rf.tags,
            props,
            paths: rf.geoms.map((p) => ({ points: p.points, closed: p.closed })),
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
function coerceCeProps(props) {
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
function detectLayers(body) {
    const layers = [];
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
export function decodeTdtVectorTile(buf, tx, ty, tz) {
    const raw = buf instanceof Uint8Array ? buf.slice() : new Uint8Array(buf);
    if (raw.length > 99) raw[99] ^= 0xff;
    const body = raw.slice(5);
    const layerRecs = detectLayers(body);
    const preamble = parsePreambleLayer(raw);
    const firstStd = layerRecs.length ? Math.min(...layerRecs.map((r) => r.bodyPos)) : body.length;
    let bare = null;
    if (firstStd > 0) bare = parseBareBlock(body.slice(0, firstStd));
    const out = [];
    const pushLayer = (L, source) => {
        for (const f of L.features) {
            const paths = (f.pathGroups ? f.pathGroups.flat() : f.paths)
                .map((p) => ({ points: p.points, closed: p.closed }));
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

/* ================= 抓取主流程 ================= */

/** 单瓦片抓取（对齐 mjs fetchTile：JSON 错误码识别 + 3 次重试；tdt_* 服务错误不重试直接抛出）。 */
async function fetchTileBuffer(url, signal) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const resp = await fetch(url, { signal, referrer: 'https://map.tianditu.gov.cn/' });
            const buf = await resp.arrayBuffer();
            const ct = resp.headers.get('content-type') || '';
            if (ct.includes('json') || new Uint8Array(buf)[0] === 0x7b) {
                try {
                    const body = JSON.parse(new TextDecoder().decode(buf));
                    if (String(body?.code) === '301010') throw new Error('tdt_permission');
                    if (body?.code != null || body?.msg) throw new Error(String(body.msg || `tdt_code_${body.code}`));
                } catch (e) {
                    if (String(e?.message || '').startsWith('tdt_')) throw e;
                }
            }
            if (!resp.ok) throw new Error(`tdt_http_${resp.status}`);
            return buf;
        } catch (e) {
            if (signal?.aborted || e?.name === 'AbortError') throw e;
            if (String(e?.message || '').startsWith('tdt_')) throw e;
            lastErr = e;
            await sleep(1500);
        }
    }
    throw lastErr;
}

/**
 * 全量抓取主入口（分层输出）。
 * @param {object} opts bbox[x4]/zoom/tk/layers/batchDelay/signal/onProgress
 * @returns {Promise<{layers:Record<string,object>,stats:Record<string,object>,tiles:number,failures:Array}>}
 */
export async function fetchTdtVectorLayers({ bbox, zoom = 16, tk, layers = 'all', batchDelay = 400, signal, onProgress } = {}) {
    const wanted = normalizeTdtLayerSelection(layers);
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const [x0, y1] = lngLatToXyz(minLng, minLat, zoom);
    const [x1, y0] = lngLatToXyz(maxLng, maxLat, zoom);
    const tiles = [];
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) tiles.push([x, y]);
    }
    const perLayer = new Map(wanted.map((l) => [l, []]));
    const failures = [];
    let collected = 0;
    for (let i = 0; i < tiles.length; i++) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        const [x, y] = tiles[i];
        const host = TILE_HOSTS[(x + y) % 3];
        const url = `https://${host}/vts?t=vt&pk=${encodeURIComponent(pkEncode(x, y, zoom))}&tk=${encodeURIComponent(tk)}&v=1.0`;
        try {
            const buf = await fetchTileBuffer(url, signal);
            for (const r of decodeTdtVectorTile(buf, x, y, zoom)) {
                if (!perLayer.has(r.layer)) continue;
                perLayer.get(r.layer).push(r);
                collected++;
            }
        } catch (e) {
            if (signal?.aborted || e?.name === 'AbortError') throw e;
            if (String(e?.message || '').startsWith('tdt_')) throw e;
            failures.push({ tag: `${zoom}_${x}_${y}`, reason: String(e?.message || e) });
        }
        onProgress?.(i + 1, tiles.length, collected);
        if (i + 1 < tiles.length) await sleep(batchDelay);
    }
    const { layers: built, stats } = topoTdtVectorLayers(perLayer, zoom);
    return { layers: built, stats, tiles: tiles.length, failures };
}

export function downloadVectorGeoJSON(featureCollection, filename = 'tianditu_vector.geojson') {
    const blob = new Blob([JSON.stringify(featureCollection, null, 1)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
