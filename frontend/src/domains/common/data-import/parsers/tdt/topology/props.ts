import { clipRingToRectMulti } from '../../tdtBuildingTopology';
import { CLIP_HI, CLIP_LO, samePoint } from './geometry';

export function validLabel(value: any) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('\ufffd')) return null;
    return trimmed;
}

/** respt 挂名（对齐 mjs labelFromProps：lzh/name/label/title/Z5 优先级）。 */
export function labelFromProps(props: any) {
    for (const k of ['lzh', 'name', 'label', 'title', 'Z5']) {
        const v = validLabel(props[k]);
        if (v) return v;
    }
    return null;
}

/** 属性稳定键（对齐 mjs stableProps：key 排序 + 对象序列化）。 */
export function stableProps(props: any) {
    const o: Record<string, any> = {};
    for (const k of Object.keys(props || {}).sort()) {
        const v = props[k];
        o[k] = (v && typeof v === 'object') ? JSON.stringify(v) : v;
    }
    return JSON.stringify(o);
}

/** record.paths → 闭合环组（≥3 点自动闭合；对齐 mjs CE/AP 环预处理）。 */
export function closedRingsOf(record: any) {
    const rings: any[] = [];
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
export function bufferClippedRingsOf(record: any) {
    const rings: any[] = [];
    for (const ring of closedRingsOf(record)) {
        for (const c of clipRingToRectMulti(ring, CLIP_LO, CLIP_LO, CLIP_HI, CLIP_HI)) {
            if (c.length >= 4) rings.push(c);
        }
    }
    return rings;
}

/** 点层：buffer 亦保留 + 同 id 去重（对齐 mjs 点拓扑；无 id 按 1e-7 度坐标兜底）。 */
