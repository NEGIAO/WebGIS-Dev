import { normalizeTdtLayerSelection } from '../tdtVectorLayers';
import { topoTdtVectorLayers } from '../tdtVectorTopology';
import { decodeTdtVectorTile } from './decode';
import { TILE_HOSTS, lngLatToXyz, pkEncode, sleep } from './tileMath';

/* ================= 抓取主流程 ================= */

/** 单瓦片抓取（对齐 mjs fetchTile：JSON 错误码识别 + 3 次重试；tdt_* 服务错误不重试直接抛出）。 */
export async function fetchTileBuffer(url: string, signal?: AbortSignal) {
    let lastErr: any = null;
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
                } catch (e: unknown) {
                    if (String((e as { message?: string })?.message || '').startsWith('tdt_')) throw e;
                }
            }
            if (!resp.ok) throw new Error(`tdt_http_${resp.status}`);
            return buf;
        } catch (e: unknown) {
            const err = e as { name?: string; message?: string };
            if (signal?.aborted || err?.name === 'AbortError') throw e;
            if (String(err?.message || '').startsWith('tdt_')) throw e;
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
export interface FetchTdtVectorOptions {
    /** 抓取范围 [minLng, minLat, maxLng, maxLat] */
    bbox: number[];
    zoom?: number;
    /** 天地图 token */
    tk?: string;
    /** 层选择：'all' 或层码列表 */
    layers?: any;
    /** 批次间隔（毫秒，限速） */
    batchDelay?: number;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number, collected: number) => void;
}

export async function fetchTdtVectorLayers({
    bbox,
    zoom = 16,
    tk,
    layers = 'all',
    batchDelay = 400,
    signal,
    onProgress,
}: FetchTdtVectorOptions) {
    const wanted = normalizeTdtLayerSelection(layers);
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const [x0, y1] = lngLatToXyz(minLng, minLat, zoom);
    const [x1, y0] = lngLatToXyz(maxLng, maxLat, zoom);
    const tiles: Array<[number, number]> = [];
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) tiles.push([x, y]);
    }
    const perLayer: Map<string, any[]> = new Map(wanted.map((l) : [string, any[]] => [l, []]));
    const failures: any[] = [];
    let collected = 0;
    for (let i = 0; i < tiles.length; i++) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        const [x, y] = tiles[i];
        const host = TILE_HOSTS[(x + y) % 3];
        const url = `https://${host}/vts?t=vt&pk=${encodeURIComponent(pkEncode(x, y, zoom))}&tk=${encodeURIComponent(tk || '')}&v=1.0`;
        try {
            const buf = await fetchTileBuffer(url, signal);
            for (const r of decodeTdtVectorTile(buf, x, y, zoom)) {
                if (!perLayer.has(r.layer)) continue;
                perLayer.get(r.layer)?.push(r);
                collected++;
            }
        } catch (e: unknown) {
            const err = e as { name?: string; message?: string };
            if (signal?.aborted || err?.name === 'AbortError') throw e;
            if (String(err?.message || '').startsWith('tdt_')) throw e;
            failures.push({ tag: `${zoom}_${x}_${y}`, reason: String(err?.message || e) });
        }
        onProgress?.(i + 1, tiles.length, collected);
        if (i + 1 < tiles.length) await sleep(batchDelay);
    }
    const { layers: built, stats } = topoTdtVectorLayers(perLayer, zoom);
    return { layers: built, stats, tiles: tiles.length, failures };
}

export function downloadVectorGeoJSON(featureCollection: any, filename = 'tianditu_vector.geojson') {
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
