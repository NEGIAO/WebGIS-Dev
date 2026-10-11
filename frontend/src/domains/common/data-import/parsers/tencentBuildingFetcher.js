/**
 * 腾讯建筑白模矢量抓取（浏览器直跑版）
 *
 * 数据来源：腾讯 WebGL 地图批量矢量接口（与 lbs.qq.com/getPoint 同款请求），
 * 返回建筑底面轮廓 + 楼高，输出 WGS-84 GeoJSON，可直接叠加到 Cesium/OL 底图。
 *
 * - 纯前端 ESM，无 Node 依赖，可直接被 Vue 组件 import；
 * - 输入输出统一 WGS-84（瓦片按火星坐标编号，内部自动换算）；
 * - 坐标转换复用 ../crs/coordTransform（与 wandergis/coordtransform 同算法）；
 * - 跨域：该接口实测返回 `Access-Control-Allow-Origin: *`，浏览器可直连；
 *   若某环境被拦，改走项目同源后端 `/proxy` 中转即可（见 fetchTxBatch 的 proxyBase 参数）。
 *
 * 逆向全过程见学习笔记：Pages/Note/md/tencent-building-reverse.md
 * Node 版（同逻辑，带文件落盘）：Pages/Note/resources/tencent-building-reverse/qq_building_to_geojson.mjs
 */

import { gcj02ToWgs84, wgs84ToGcj02 } from '../crs/coordTransform';

/** 接口当前版本号（过期时重查 https://confinfo.map.qq.com/confinfo） */
export const TX_TILE_VERSION = 2268;
/** gljs 写死的楼块图层 id（et） */
export const TX_BUILDING_ID = 196619;
export const TX_TILE_SIZE = 256;
/** 四个子域轮询，和浏览器行为一致 */
const TX_HOSTS = ['rt0', 'rt1', 'rt2', 'rt3'];

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function stripBase64Pad(text) {
    return BASE64_ALPHABET.indexOf(text.charAt(text.length - 1)) === 64
        ? text.substring(0, text.length - 1)
        : text;
}

/** gljs 55722 模块的 rotate 混淆原语 */
function rotByte(value, bits) {
    return ((value >> (8 - bits)) & 255) | ((value << bits) & 255);
}

/**
 * 解开单个 tile 的 data 字段（base64 + rotate/xor 混淆 + UTF-8）。
 * @param {string} data - 接口返回的 datas[i].data
 * @returns {string} 解出的 JSON 文本（截到最后一个 }）
 */
export function txDecode(data) {
    const text = stripBase64Pad(stripBase64Pad(String(data || '')));
    const outLen = parseInt((text.length / 4) * 3, 10);
    const clean = text.replace(/[^A-Za-z0-9+/=]/g, '');
    const raw = [];
    let cursor = 0;
    for (let done = 0; done < outLen; done += 3) {
        const a = BASE64_ALPHABET.indexOf(clean.charAt(cursor++));
        const b = BASE64_ALPHABET.indexOf(clean.charAt(cursor++));
        const c = BASE64_ALPHABET.indexOf(clean.charAt(cursor++));
        const d = BASE64_ALPHABET.indexOf(clean.charAt(cursor++));
        raw.push((a << 2) | (b >> 4));
        if (c !== 64) raw.push(((15 & b) << 4) | (c >> 2));
        if (d !== 64) raw.push(((3 & c) << 6) | d);
    }
    const mixed = [];
    for (let n = 0; n < raw.length; n += 2) {
        let o = raw[n];
        let r = n + 1 < raw.length ? raw[n + 1] : 0;
        for (let round = 0; round < 3; round++) {
            const f = rotByte(r, 2) ^ (rotByte(r, 1) & rotByte(r, 3));
            const nextO = r;
            const nextR = (o ^ f) & 255;
            o = nextO;
            r = nextR;
        }
        mixed.push(o, r);
    }
    let str = '';
    for (let i = 0; i < mixed.length; ) {
        const byte = mixed[i];
        if (byte < 128) {
            str += String.fromCharCode(byte);
            i += 1;
        } else if (byte > 191 && byte < 224) {
            str += String.fromCharCode(((31 & byte) << 6) | (63 & mixed[i + 1]));
            i += 2;
        } else {
            str += String.fromCharCode(((15 & byte) << 12) | ((63 & mixed[i + 1]) << 6) | (63 & mixed[i + 2]));
            i += 3;
        }
    }
    return str.substring(0, str.lastIndexOf('}') + 1);
}

/**
 * WGS-84 经纬度转标准 XYZ 瓦片号（注意：发给腾讯前 y 还要翻成 TMS）。
 */
export function lngLatToXyz(lng, lat, z) {
    const n = Math.pow(2, z);
    const x = Math.floor(((lng + 180) / 360) * n);
    const rad = (lat * Math.PI) / 180;
    const y = Math.floor((((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n));
    return [x, y];
}

/** 全局像素转经纬度（GCJ-02，腾讯系）。 */
export function xyzToLngLatPx(globalPx, globalPy, z) {
    const n = Math.pow(2, z) * TX_TILE_SIZE;
    const lng = (globalPx / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * globalPy) / n))) * 180) / Math.PI;
    return [lng, lat];
}

/** 差分坐标累加：首对绝对，之后逐对累加。 */
export function deltaDecode(arr) {
    const pts = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < arr.length; i += 2) {
        if (i === 0) {
            x = arr[0];
            y = arr[1];
        } else {
            x += arr[i];
            y += arr[i + 1];
        }
        pts.push([x, y]);
    }
    return pts;
}

/**
 * 解析单个 tile 的 payload，抽出楼块（GCJ-02 环 + 米制高度）。
 * @param {object} payload - datas[i] 或 {data}（JSON 已 parse 或原始 txDecode 文本）
 * @param {number} tileX - 该块 XYZ x
 * @param {number} tileY - 该块 XYZ y
 * @param {number} z - 级别
 * @returns {Array<{ring: number[][], height: number, tile: string}>}
 */
export function parseTxTileBuildings(payload, tileX, tileY, z) {
    const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!obj || obj.ret !== 0 || !Array.isArray(obj.features)) return [];
    const out = [];
    for (const feature of obj.features) {
        const id = Array.isArray(feature[0]) ? feature[0][0] : feature[0];
        if (id !== TX_BUILDING_ID) continue;
        const height = feature[2];
        if (!Array.isArray(feature[1]) || feature[1].length < 6) continue;
        const ring = deltaDecode(feature[1]).map(([lx, ly]) =>
            xyzToLngLatPx(tileX * TX_TILE_SIZE + lx, tileY * TX_TILE_SIZE + ly, z),
        );
        ring.push(ring[0]);
        out.push({ ring, height, tile: `${z}_${tileX}_${tileY}` });
    }
    return out;
}

/**
 * 请求一批（最多 4 块，2×2）矢量瓦片。
 * @param {Array<[number, number]>} tmsTiles - TMS 坐标 [[x, yTms], ...]
 * @param {object} [options]
 * @param {number} [options.z=18]
 * @param {AbortSignal} [options.signal]
 * @param {string} [options.proxyBase=''] - 如 '/proxy'，拼到 URL 前走同源中转
 */
export async function fetchTxBatch(tmsTiles, options = {}) {
    const { z = 18, signal, proxyBase = '' } = options;
    const tilesParam = tmsTiles.map(([x, y]) => `${z}_${x}_${y}`).join(',');
    const host = TX_HOSTS[Math.floor(Math.random() * TX_HOSTS.length)];
    const url =
        `${proxyBase}https://${host}.map.gtimg.com/tile` +
        `?styleid=0&tiles=${tilesParam}&version=${TX_TILE_VERSION}&building=1&style=100&compress=1&mapType=hybrid`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error(`腾讯瓦片请求失败 HTTP ${resp.status}`);
    return resp.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeBboxInput(input = {}) {
    if (input.bbox) {
        const [minLng, minLat, maxLng, maxLat] = input.bbox;
        return { minLng, minLat, maxLng, maxLat };
    }
    if (input.center) {
        const [cLng, cLat] = input.center;
        const delta = input.delta || 0.009;
        return { minLng: cLng - delta, minLat: cLat - delta, maxLng: cLng + delta, maxLat: cLat + delta };
    }
    throw new Error('请传入 bbox [左,下,右,上] 或 center [经,纬]（均为 WGS-84）');
}

/**
 * 按 WGS-84 范围抓取建筑，返回 WGS-84 GeoJSON。
 *
 * @param {object} input - { bbox: [minLng,minLat,maxLng,maxLat] } 或 { center: [lng,lat], delta }
 * @param {object} [options]
 * @param {number} [options.zoom=18]
 * @param {number} [options.batchDelay=400] - 批间隔毫秒，别改小
 * @param {number} [options.retries=3]
 * @param {string} [options.proxyBase='']
 * @param {AbortSignal} [options.signal]
 * @param {(done: number, total: number, count: number) => void} [options.onProgress]
 * @returns {Promise<object>} GeoJSON FeatureCollection（属性 height_m + tile，顶层 crs: WGS84）
 */
export async function fetchTxBuildings(input, options = {}) {
    const {
        zoom = 18,
        batchDelay = 400,
        retries = 3,
        proxyBase = '',
        signal,
        onProgress,
    } = options;
    // 输入是 WGS-84，先转回 GCJ-02 再算瓦片（瓦片按火星坐标编号）
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

    const n = Math.pow(2, zoom);
    const [x0, y0] = lngLatToXyz(minLng, maxLat, zoom);
    const [x1, y1] = lngLatToXyz(maxLng, minLat, zoom);
    const jobs = [];
    for (let y = y0; y <= y1; y += 2) {
        for (let x = x0; x <= x1; x += 2) {
            const group = [];
            for (let dy = 0; dy < 2; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const xx = x + dx;
                    const yy = y + dy;
                    if (xx > x1 || yy > y1) continue;
                    group.push({ xyz: [xx, yy], tms: [xx, n - 1 - yy] });
                }
            }
            jobs.push(group);
        }
    }

    const raw = [];
    let batchIndex = 0;
    for (const group of jobs) {
        batchIndex += 1;
        let json = null;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                json = await fetchTxBatch(group.map((g) => g.tms), { z: zoom, signal, proxyBase });
                break;
            } catch (err) {
                if (signal && signal.aborted) throw err;
                if (attempt === retries - 1) break;
                await sleep(1500);
            }
        }
        if (json && Array.isArray(json.datas)) {
            json.datas.forEach((d, di) => {
                if (!d || !d.data || di >= group.length) return;
                try {
                    const { xyz: [tx, ty] } = group[di];
                    for (const b of parseTxTileBuildings(txDecode(d.data), tx, ty, zoom)) {
                        // 输出统一 WGS-84
                        const ring = b.ring.map(([lo, la]) => gcj02ToWgs84(lo, la));
                        ring.push(ring[0]);
                        raw.push({
                            type: 'Feature',
                            properties: { height_m: b.height, tile: b.tile },
                            geometry: { type: 'Polygon', coordinates: [ring] },
                        });
                    }
                } catch {
                    // 单块解析失败就跳过，不影响整批
                }
            });
        }
        if (onProgress) onProgress(batchIndex, jobs.length, raw.length);
        await sleep(batchDelay);
    }

    // 去重：腾讯不对楼块做瓦片裁剪，跨缝的楼会逐字重复出现在相邻块
    const seen = new Set();
    const features = [];
    for (const f of raw) {
        const ring = f.geometry.coordinates[0];
        const key =
            ring.map((p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`).join(';') +
            `|${f.properties.height_m}`;
        if (seen.has(key)) continue;
        seen.add(key);
        features.push(f);
    }
    return { type: 'FeatureCollection', crs: 'WGS84', features };
}

/**
 * 把 GeoJSON 存成文件（浏览器下载）。
 * @param {object} featureCollection
 * @param {string} [filename='buildings.geojson']
 */
export function downloadGeoJSON(featureCollection, filename = 'buildings.geojson') {
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
