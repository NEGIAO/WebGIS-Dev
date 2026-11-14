export const lenientDecoder = new TextDecoder('utf-8', { fatal: false });
export const strictDecoder = new TextDecoder('utf-8', { fatal: true });

/** varint 读取（≤6 字节，对齐 mjs R_.u32 容忍度；越界/畸形返回 null）。 */
export function vint(buf: Uint8Array, pos: number) {
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

export function toHex(bytes: any) {
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return hex;
}

/** 通用字段切分（对齐 mjs splitFields）：wt0 存 num/start，wt2 存 L/start。 */
export function splitFields(buf: Uint8Array) {
    const out: any[] = [];
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
export function parseTop(buf: Uint8Array) {
    const fields: any[] = [];
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

export const zig = (t: any) => (t % 2 === 1 ? -(t + 1) / 2 : t / 2);

/** 命令流 → 路径（对齐 mjs parseCommands：首命令必须 MoveTo2；ClosePath7 补首点闭合；
 * 坐标界 [-1000,5100]；尾渣优雅降级 partial）。 */
export function parseCommands(buf: any) {
    let pos = 0;
    let x = 0;
    let y = 0;
    let cur: any = null;
    let left = 0;
    const paths: any[] = [];
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
export function findCommands(buf: any, depth = 0) : any {
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
export function readVarint64(buf: Uint8Array, pos: number) {
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
export function parseValue(buf: any) {
    let value: any = null;
    let kind = 'empty';
    for (const f of splitFields(buf)) {
        if (f.fl === 1 && f.wt === 2) {
            const s = buf.slice(f.start, f.start + f.L);
            let st;
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
export function parseTags(buf: Uint8Array) {
    const arr: any[] = [];
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
export function parseFeature(fbuf: Uint8Array) {
    const fields = splitFields(fbuf);
    const pathGroups: any[] = [];
    let type: any = null;
    let tagsRaw: any = null;
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
export function parseLayer(layer: any) {
    const c = layer.content;
    const fields = splitFields(c);
    let name = '';
    let extent = 4096;
    let version = 2;
    const keys: any[] = [];
    const values: any[] = [];
    const features: any[] = [];
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
export function featureProperties(layer: any, feature: any) {
    const props: Record<string, any> = {};
    for (let i = 0; i + 1 < feature.tags.length; i += 2) {
        const k = feature.tags[i];
        const v = feature.tags[i + 1];
        if (k < layer.keys.length && v < layer.values.length) props[layer.keys[k]] = layer.values[v];
    }
    return props;
}

/* ================= 前导层 / 裸层（对齐 mjs readTagXor / readLenXor / parseFeatureContainerXor / parsePreambleLayer / parseBareBlock） ================= */

/** XOR tag 感知（明文或 ^0xff 均视为合法 tag）。 */
export function readTagXor(buf: Uint8Array, pos: number) {
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
export function readLenXor(buf: Uint8Array, pos: number, remain: number) {
    const b = buf[pos];
    if (!(b & 0x80) && b <= remain) return { v: b, n: 1 };
    const rb = b ^ 0xff;
    if (!(rb & 0x80) && rb <= remain) return { v: rb, n: 1 };
    const r = vint(buf, pos);
    if (r && r.v >= 0 && r.v <= remain) return { v: r.v, n: r.pos - pos };
    return { v: -1, n: 0 };
}

/** 前导层要素容器（XOR 感知；f1 几何直读命令流，失败递归容器；对齐 mjs parseFeatureContainerXor）。 */
export function parseFeatureContainerXor(buf: any) : any {
    let pos = 0;
    let geom: any = null;
    let type: any = null;
    let tags: any[] = [];
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

