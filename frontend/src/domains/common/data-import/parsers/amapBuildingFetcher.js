/**
 * 高德建筑白模矢量抓取（浏览器直跑版）
 *
 * 数据来源：高德 JS API 2.0 同款楼块矢量接口（lbs.amap.com 3D 演示页同款请求），
 * 返回建筑底面轮廓 + 楼高（米，另有部分楼栋带名称），输出 WGS-84 GeoJSON。
 *
 * 链路（与 Node 版一致）：web/init 取 tileVersion
 *   → POST web_map/get_tile 换 tile_urls（带新鲜 auth_key）
 *   → GET pbf（帧+gzip+protobuf，type=3 即楼层）→ polygon + mainBuildingHeight。
 *
 * - 纯前端 ESM，无 Node 依赖，可直接被 Vue 组件 import；
 * - 输入输出统一 WGS-84（数据瓦片按火星坐标编号，内部自动换算）；
 * - 坐标转换复用 ../crs/coordTransform；
 * - 高德格网注意：x 同标准 slippy，y 为等距纬度行（y = (90-lat)*2^z/180），不是墨卡托行号；
 * - 鉴权注意：必须传入自己申请的高德 key（白名单含本应用域名），
 *   或经同源后端 /proxy 中转（见 proxyBase）。原演示 key 已实测无数据并删除。
 *   某省瓦片偶发 OVERSEA_FORBIDDEN 时会自动切 access_oversea=1 重试。
 *
 * 逆向全过程见学习笔记：Pages/Note/md/tencent-building-reverse.md（第 12 节高德篇）
 * Node 版（同逻辑，带文件落盘）：Pages/Note/resources/amap-building-reverse/amap_building_to_geojson.mjs
 */

import { gcj02ToWgs84, wgs84ToGcj02 } from '../crs/coordTransform';

export const AMAP_TILE_SIZE = 256;

/* ---------------- 最小 protobuf reader（按高德 bundle 内 pbf 语义） ---------------- */

class PbfReader {
    constructor(buf) {
        this.b = buf;
        this.pos = 0;
        this.len = buf.length;
    }
    u32() {
        let s = 0;
        let sh = 0;
        while (true) {
            const c = this.b[this.pos++];
            s |= (c & 127) << sh;
            if (!(c & 128)) break;
            sh += 7;
        }
        return s >>> 0;
    }
    zig() {
        const t = this.u32();
        return t % 2 === 1 ? -(t + 1) / 2 : t / 2;
    }
    str() {
        const n = this.u32();
        const s = new TextDecoder().decode(this.b.slice(this.pos, this.pos + n));
        this.pos += n;
        return s;
    }
    bytes() {
        const n = this.u32();
        const s = this.b.slice(this.pos, this.pos + n);
        this.pos += n;
        return s;
    }
    skip(wt) {
        if (wt === 0) this.u32();
        else if (wt === 1) this.pos += 8;
        else if (wt === 2) this.pos += this.u32();
        else if (wt === 5) this.pos += 4;
        else throw new Error(`不支持的 wiretype ${wt}`);
    }
    msg(fn, end) {
        const stop = end === undefined ? this.len : end;
        while (this.pos < stop) {
            const tag = this.u32();
            const f = tag >>> 3;
            const wt = tag & 7;
            const mark = this.pos;
            fn(f, wt, this);
            if (this.pos === mark) this.skip(wt);
        }
    }
}

function readFields(buf, packedArrays, one) {
    const r = new PbfReader(buf);
    const o = {};
    r.msg((f, wt, rr) => {
        if (wt === 2 && packedArrays.includes(f)) {
            const n = rr.u32();
            const end = rr.pos + n;
            const arr = (o[f] = o[f] || []);
            while (rr.pos < end) arr.push(rr.zig());
        } else {
            one(f, wt, rr, o);
        }
    });
    return o;
}

function readLanguage(buf) {
    return readFields(buf, [], (f, wt, r, o) => {
        if (f === 1 && wt === 2) o.name = r.str();
        else if (f === 2 && wt === 2) o.lang = r.str();
    });
}

function readShapeFeature(buf) {
    const o = readFields(
        buf,
        [3],
        (f, wt, r, o) => {
            if (f === 1 && wt === 2) (o.nameLoc = o.nameLoc || []).push(readLanguage(r.bytes()));
            else if (f === 2 && wt === 0) o.rank = r.u32();
            else if (f === 4 && wt === 0) o.uid = r.u32();
            else if (f === 5 && wt === 0) o.mainBuildingHeight = r.u32();
            else if (f === 6 && wt === 2) o.bz = r.str();
            else if ((f === 7 || f === 8 || f === 9) && wt === 2) {
                const k = f === 9 ? 'nameZh' : f === 7 ? 'nameEng' : 'nameMulti';
                (o[k] = o[k] || []).push(readLanguage(r.bytes()));
            }
        },
    );
    o.polygon = o[3] || [];
    return o;
}

const readShapeFeatureMulti = (buf) =>
    readFields(buf, [], (f, wt, r, o) => {
        if (f === 1) o.minZoom = r.u32();
        else if (f === 2) o.maxZoom = r.u32();
        else if (f === 3) o.drawOrder = r.u32();
        else if (f === 4 && wt === 2)
            (o.shapeFeatures = o.shapeFeatures || []).push(readShapeFeature(r.bytes()));
    });

const readBuildingSameStyle = (buf) =>
    readFields(buf, [], (f, wt, r, o) => {
        if (f === 1) o.mainKey = r.u32();
        else if (f === 2) o.subKey = r.u32();
        else if (f === 3) o.resolution = r.u32();
        else if (f === 4 && wt === 2)
            (o.items = o.items || []).push(readShapeFeatureMulti(r.bytes()));
    });

const readBuildingLayer = (buf) =>
    readFields(buf, [], (f, wt, r, o) => {
        if (f === 1 && wt === 2)
            (o.buildings = o.buildings || []).push(readBuildingSameStyle(r.bytes()));
        else if (f === 2 && wt === 2) o.Pii = r.str();
        else if (f === 3 && wt === 2) o.tile_region = r.str();
    });

const readLayer = (buf) =>
    readFields(buf, [], (f, wt, r, o) => {
        if (f === 1) o.z = r.u32();
        else if (f === 2) o.x = r.u32();
        else if (f === 3) o.y = r.u32();
        else if (f === 4) o.type = r.u32();
        else if (f === 5 && wt === 2) o.d = r.bytes();
    });

const readTile = (buf) =>
    readFields(buf, [], (f, wt, r, o) => {
        if (f === 1) o.z = r.u32();
        else if (f === 2) o.x = r.u32();
        else if (f === 3) o.y = r.u32();
        else if (f === 4 && wt === 2) (o.layers = o.layers || []).push(readLayer(r.bytes()));
    });

const readResult = (buf) =>
    readFields(buf, [], (f, wt, r, o) => {
        if (f === 1 && wt === 2) (o.tiles = o.tiles || []).push(readTile(r.bytes()));
        else if (f === 2 && wt === 2) o.version = r.str();
    });

/* ---------------- 坐标（bundle 内 tileInnerCoord2LngLat 原样移植） ---------------- */

const NDS_COORD = 2147483648;
const DEG_MAX = 180;
const degree2Coord = (d) => Math.floor((d * NDS_COORD) / DEG_MAX + 0.5);
const coord2Degree = (c) => (c * DEG_MAX) / NDS_COORD;

function wgsGridSize(t) {
    const r = 33 - t;
    let e = degree2Coord(180) / (1 << r);
    let q = degree2Coord(90) / (1 << r);
    e = e > 0 ? Math.floor(0.5 + e) : Math.floor(e - 0.5);
    q = q > 0 ? Math.floor(0.5 + q) : Math.floor(q - 0.5);
    return [2 * e, 2 * q];
}

function tileSWCoord(x, y, z, res) {
    const [wx, wh] = wgsGridSize(z + res);
    const n = 1 << z;
    return [-wx / 2 + (x * wx) / n, wh / 2 - ((y + 1) * wh) / n];
}

/**
 * 瓦片内坐标转经纬度（GCJ-02）。
 * @param {number} x/y/z - 数据瓦片号（x 同 slippy，y 为等距纬度行）
 * @param {number} ix/iy - 瓦片内整数坐标
 * @param {number} res - 该组数据的 resolution（tile 内自带，缺省 12）
 */
export function amapInnerToLngLat(x, y, z, ix, iy, res = 12) {
    const sw = tileSWCoord(x, y, z, res);
    const shift = 33 - res - z;
    const R = (ix + sw[0]) * 2 ** shift;
    const N = (iy + sw[1]) * 2 ** shift;
    return [coord2Degree(sw[0] > 0 && R < 0 ? NDS_COORD - 1 : R), coord2Degree(N)];
}

/** 高德数据瓦片号：x 同标准 slippy，y 为等距纬度行。 */
export function amapLngLatToXyz(lng, lat, z) {
    const n = Math.pow(2, z);
    return [Math.floor(((lng + 180) / 360) * n), Math.floor(((90 - lat) * n) / 180)];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeBboxInput(input = {}) {
    if (input.bbox) {
        const [minLng, minLat, maxLng, maxLat] = input.bbox;
        return { minLng, minLat, maxLng, maxLat };
    }
    if (input.center) {
        const [cLng, cLat] = input.center;
        const delta = input.delta || 0.008;
        return { minLng: cLng - delta, minLat: cLat - delta, maxLng: cLng + delta, maxLat: cLat + delta };
    }
    throw new Error('请传入 bbox [左,下,右,上] 或 center [经,纬]（均为 WGS-84）');
}

/**
 * 按 WGS-84 范围抓取高德建筑，返回 WGS-84 GeoJSON。
 *
 * key 说明：必须传入自己申请的高德 key（白名单含调用方域名），演示 key 已删除；
 * Node/代理环境同样需要自备 key。
 *
 * @param {object} input - { bbox } 或 { center, delta }（WGS-84）
 * @param {object} [options]
 * @param {number} [options.zoom=14] - 数据瓦片级别（非显示级别；实测仅 14 含楼栋层）
 * @param {string} options.key - 高德 key（必填）
 * @param {string} [options.proxyBase=''] - 同源中转基址前缀，默认 '' 走直连；
 *   非空时须以 '/' 结尾（如 '/proxy/'），与 URL 直接拼接（`${proxyBase}https://…`）
 * @param {number} [options.batchSize=8] - 每次 auth 的瓦片数
 * @param {number} [options.batchDelay=400]
 * @param {AbortSignal} [options.signal]
 * @param {(done: number, total: number, count: number) => void} [options.onProgress]
 */
export async function fetchAmapBuildings(input, options = {}) {
    const {
        zoom = 14,
        key = '',
        proxyBase = '',
        batchSize = 8,
        batchDelay = 400,
        signal,
        onProgress,
    } = options;
    if (!String(key || '').trim()) throw new Error('请传入高德 key（演示 key 已删除，不可用）');
    const wgs = normalizeBboxInput(input);
    const corners = [
        [wgs.minLng, wgs.minLat],
        [wgs.minLng, wgs.maxLat],
        [wgs.maxLng, wgs.minLat],
        [wgs.maxLng, wgs.maxLat],
    ].map(([lo, la]) => wgs84ToGcj02(lo, la));
    const minLng = Math.min(...corners.map((c) => c[0]));
    const maxLng = Math.max(...corners.map((c) => c[0]));
    const minLat = Math.min(...corners.map((c) => c[1]));
    const maxLat = Math.max(...corners.map((c) => c[1]));
    const [x0, y1] = amapLngLatToXyz(minLng, minLat, zoom);
    const [x1, y0] = amapLngLatToXyz(maxLng, maxLat, zoom);
    const tiles = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push([x, y]);

    const initResp = await fetch(`${proxyBase}https://jsapi.amap.com/web/init?key=${key}`, { signal });
    if (!initResp.ok) throw new Error(`web/init 失败 HTTP ${initResp.status}`);
    const tileVersion = JSON.parse((await initResp.json()).tile).v;

    const authOneBatch = async (group, oversea) => {
        const resp = await fetch(`${proxyBase}https://jsapi.amap.com/web_map/get_tile?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                version: tileVersion,
                pbf_version: 'v2',
                access_oversea: oversea,
                data_source: '1',
                multi_lang: '0',
                tiles: JSON.stringify(group.map(([x, y]) => ({ id: `${x}_${y}_${zoom}`, type: 1, contain_range: 2 }))),
            }).toString(),
            signal,
        });
        if (!resp.ok) throw new Error(`get_tile 失败 HTTP ${resp.status}`);
        return resp.json();
    };

    const gunzipPacket = async (packet) => {
        const s = new DecompressionStream('gzip');
        const w = s.writable.getWriter();
        w.write(packet);
        w.close();
        return new Uint8Array(await new Response(s.readable).arrayBuffer());
    };

    const decodePbfTile = async (arrayBuffer) => {
        const buf = new Uint8Array(arrayBuffer);
        const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
        const out = [];
        let off = 0;
        while (off < buf.length) {
            const len = view.getUint32(off, false);
            off += 4;
            if (len <= 0 || len > buf.length - off) break;
            const raw = await gunzipPacket(buf.slice(off, off + len));
            off += len;
            const res = readResult(raw);
            for (const t of res.tiles || []) {
                for (const l of t.layers || []) {
                    if (l.type !== 3 || !l.d) continue;
                    const bl = readBuildingLayer(l.d);
                    for (const g of bl.buildings || []) {
                        const res2 = g.resolution || 12;
                        for (const it of g.items || []) {
                            for (const sf of it.shapeFeatures || []) {
                                if (!sf.polygon || sf.polygon.length < 6) continue;
                                const b = sf.polygon;
                                const pts = [];
                                let T = b[0];
                                let S = b[1];
                                for (let m = 0; m < b.length / 2; m++) {
                                    let I = b[2 * m];
                                    let P = b[2 * m + 1];
                                    if (m !== 0) {
                                        I += T;
                                        P += S;
                                    }
                                    T = I;
                                    S = P;
                                    pts.push(
                                        amapInnerToLngLat(l.x ?? t.x, l.y ?? t.y, l.z ?? t.z, I, P, res2),
                                    );
                                }
                                pts.push(pts[0]);
                                const name =
                                    (sf.nameZh && sf.nameZh[0] && sf.nameZh[0].name) || '';
                                out.push({
                                    ring: pts,
                                    height: sf.mainBuildingHeight ?? 6,
                                    name,
                                });
                            }
                        }
                    }
                }
            }
        }
        return out;
    };

    const raw = [];
    let oversea = '0';
    for (let i = 0; i < tiles.length; i += batchSize) {
        const group = tiles.slice(i, i + batchSize);
        let urls = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            if (signal && signal.aborted) throw new DOMException('已取消', 'AbortError');
            try {
                const js = await authOneBatch(group, oversea);
                if (js.status !== '1' || !js.tile_urls) {
                    if ((js.infocode == 11000 || js.info === 'TILE_ACCESS_OVERSEA_FORBIDDEN') && oversea === '0') {
                        oversea = '1';
                        continue;
                    }
                    throw new Error(js.info || 'auth 失败');
                }
                urls = js.tile_urls;
                break;
            } catch (err) {
                if (signal && signal.aborted) throw err;
                if (attempt === 3) break;
                await sleep(1500);
            }
        }
        if (!urls) continue;
        for (const u of urls) {
            const r = await fetch(`${proxyBase}${u}`, { signal });
            if (!r.ok) continue;
            try {
                // 从 URL 取瓦片号(x_y_z)，与返回顺序无关
                const m = /\/pbf\/\d+\/(\d+)_(\d+)_(\d+)/.exec(u);
                const tileTag = m ? `${m[3]}_${m[1]}_${m[2]}` : `${zoom}_?_?`;
                for (const b of await decodePbfTile(await r.arrayBuffer())) {
                    const ring = b.ring.map(([lo, la]) => gcj02ToWgs84(lo, la));
                    ring.push(ring[0]);
                    raw.push({
                        type: 'Feature',
                        properties: { height_m: b.height, tile: tileTag, ...(b.name ? { name: b.name } : {}) },
                        geometry: { type: 'Polygon', coordinates: [ring] },
                    });
                }
            } catch {
                // 单块失败跳过
            }
            await sleep(300);
        }
        if (onProgress) onProgress(Math.min(i + batchSize, tiles.length), tiles.length, raw.length);
        await sleep(batchDelay);
    }

    const seen = new Set();
    const features = [];
    for (const f of raw) {
        const ring = f.geometry.coordinates[0];
        const k =
            ring.map((p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`).join(';') +
            `|${f.properties.height_m}`;
        if (seen.has(k)) continue;
        seen.add(k);
        features.push(f);
    }
    return { type: 'FeatureCollection', crs: 'WGS84', features };
}

/**
 * 把 GeoJSON 存成文件（浏览器下载）。
 */
export function downloadGeoJSON(featureCollection, filename = 'buildings_amap.geojson') {
    const blob = new Blob([JSON.stringify(featureCollection, null, 1)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
