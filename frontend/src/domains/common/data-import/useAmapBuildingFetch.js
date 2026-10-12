/**
 * 高德建筑白模抓取编排（composable，与 useTencentBuildingFetch 同 API 形状，供面板二选一）。
 *
 * 功能：范围校验 → 量估算 → fetchAmapBuildings → 包 File 入库。
 * 参数：startFetch(bbox, zoom)。
 * 返回：状态（status/progress/error/result）+ startFetch/cancel/buildImportFile/downloadResult。
 * 核心逻辑：key 取管理端 L2 配置（amap_key，经 runtimeMapTokens，与地质/天气等模块同通道）；
 *   演示 key 实测无数据（oversea=0 报 11000、oversea=1 报域名白名单 10006），故不设兜底；
 *   打包同样剥离非标准顶层 crs（复用 useTencentBuildingFetch.toSpecGeoJSON，同为 WGS-84）。
 */
import { computed, ref } from 'vue';
import {
    amapLngLatToXyz,
    downloadGeoJSON as saveGeoJSONFile,
    fetchAmapBuildings,
} from './parsers/amapBuildingFetcher';
import { toSpecGeoJSON } from './useTencentBuildingFetch';
import { wgs84ToGcj02 } from './crs/coordTransform';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';

/** 抓取级别：固定 14（实测该接口仅 z14 瓦片含楼栋层，z13/z15 下发的 pbf 为空包） */
export const AMAP_DEFAULT_ZOOM = 14;
/** 范围边长上限（度）：z14 瓦片大，0.2° 约 190 块/24 批可接受；腾讯 z18 仍须 0.05 */
export const AMAP_MAX_EDGE_DEG = 0.2;
/** 批间隔毫秒：与抓取器建议一致，禁止调小 */
const AMAP_BATCH_DELAY = 400;
/** 单瓦片抓取间隔（抓取器内部 sleep 300，估算用） */
const AMAP_PER_TILE_MS = 500;
/** 每批 auth 瓦片数（与抓取器 batchSize 默认一致） */
const AMAP_BATCH_SIZE = 8;

/**
 * 估算瓦片数/批次数/耗时（高德格网：x 同 slippy，y 为等距纬度行）。
 * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}} bbox WGS-84
 * @param {number} zoom 抓取级别
 * @returns {{tiles:number,batches:number,seconds:number}}
 */
export function estimateAmapTiles(bbox, zoom) {
    const corners = [
        [bbox.minLng, bbox.minLat],
        [bbox.minLng, bbox.maxLat],
        [bbox.maxLng, bbox.minLat],
        [bbox.maxLng, bbox.maxLat],
    ].map(([lo, la]) => wgs84ToGcj02(lo, la));
    const xs = corners.map(([lo, la]) => amapLngLatToXyz(lo, la, zoom)[0]);
    const ys = corners.map(([lo, la]) => amapLngLatToXyz(lo, la, zoom)[1]);
    const tiles = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    const batches = Math.ceil(tiles / AMAP_BATCH_SIZE);
    return {
        tiles,
        batches,
        seconds: Math.round(batches * (AMAP_BATCH_DELAY / 1000) + tiles * (AMAP_PER_TILE_MS / 1000)),
    };
}

/**
 * 按请求框选裁剪要素（整瓦片外扩导致框外楼混入，z14 瓦片大尤其明显）。
 * 保留环上任一顶点落框内的要素（跨边楼保留），框外整体丢弃。
 * @param {Array} features GeoJSON features
 * @param {{minLng,minLat,maxLng,maxLat}} bbox 请求框选
 * @returns {Array} 框内要素
 */
export function clipFeaturesToBbox(features, bbox, eps = 1e-9) {
    if (!Array.isArray(features) || !bbox) return [];
    return features.filter((f) => {
        const ring = f?.geometry?.coordinates?.[0];
        if (!Array.isArray(ring)) return false;
        return ring.some(
            (p) =>
                Array.isArray(p) &&
                p[0] >= bbox.minLng - eps &&
                p[0] <= bbox.maxLng + eps &&
                p[1] >= bbox.minLat - eps &&
                p[1] <= bbox.maxLat + eps,
        );
    });
}

/**
 * 校验范围输入（与腾讯侧同规则）。
 * @returns {string|null} 错误原因，无错误返回 null
 */
export function validateAmapBbox(bbox) {
    if (!bbox) return 'empty';
    const { minLng, minLat, maxLng, maxLat } = bbox;
    const vals = [minLng, minLat, maxLng, maxLat];
    if (vals.some((v) => !Number.isFinite(v))) return 'nan';
    if (minLng >= maxLng || minLat >= maxLat) return 'order';
    if (Math.abs(minLng) > 180 || Math.abs(maxLng) > 180) return 'range';
    if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) return 'range';
    if (maxLng - minLng > AMAP_MAX_EDGE_DEG || maxLat - minLat > AMAP_MAX_EDGE_DEG) return 'oversize';
    return null;
}

export function useAmapBuildingFetch() {
    /** idle | fetching | done | error */
    const status = ref('idle');
    const progress = ref({ done: 0, total: 0, count: 0 });
    const error = ref('');
    const result = ref(null);
    const featureCollection = ref(null);
    const fileName = ref('');
    let aborter = null;

    const isFetching = computed(() => status.value === 'fetching');

    /** 取消抓取 */
    function cancel() {
        aborter?.abort();
    }

    /**
     * 开始抓取（key 取管理端 L2 配置的 amap_key，无需面板传入）。
     * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}} bbox WGS-84 范围
     * @param {number} zoom 抓取级别
     * @returns {Promise<object|null>} GeoJSON，取消/失败返回 null
     */
    async function startFetch(bbox, zoom = AMAP_DEFAULT_ZOOM) {
        const bad = validateAmapBbox(bbox);
        if (bad) {
            status.value = 'error';
            error.value = bad;
            return null;
        }
        // 管理端 L2 密钥（API 密钥管理 → amap_key），与地质/天气等模块同通道
        await loadRuntimeMapTokens().catch(() => {});
        const managedKey = String(getRuntimeMapTokensSync().amapKey || '').trim();
        if (!managedKey) {
            status.value = 'error';
            error.value = 'key_required';
            return null;
        }
        aborter?.abort();
        aborter = new AbortController();
        status.value = 'fetching';
        error.value = '';
        result.value = null;
        featureCollection.value = null;
        progress.value = { done: 0, total: 0, count: 0 };
        const t0 = Date.now();
        try {
            const fc = await fetchAmapBuildings(
                { bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat] },
                {
                    zoom,
                    key: managedKey,
                    batchDelay: AMAP_BATCH_DELAY,
                    signal: aborter.signal,
                    onProgress: (done, total, count) => {
                        progress.value = { done, total, count };
                    },
                },
            );
            const centerLng = ((bbox.minLng + bbox.maxLng) / 2).toFixed(4);
            const centerLat = ((bbox.minLat + bbox.maxLat) / 2).toFixed(4);
            fileName.value = `高德建筑白模_z${zoom}_${centerLng}_${centerLat}.geojson`;
            // 按框选裁剪：整瓦片外扩会带入框外楼（z14 下可达 85%），此处滤掉；
            // 返回裁剪后包（入库/统计/判空三方一致，跨边楼已保留）
            const clipped = clipFeaturesToBbox(fc.features, bbox);
            const clippedFc = { ...fc, features: clipped };
            featureCollection.value = clippedFc;
            result.value = {
                featureCount: clipped.length,
                elapsedMs: Date.now() - t0,
            };
            status.value = 'done';
            return clippedFc;
        } catch (err) {
            if (aborter?.signal?.aborted || err?.name === 'AbortError') {
                status.value = 'idle';
                error.value = '';
                return null;
            }
            status.value = 'error';
            error.value = String(err?.message || err);
            return null;
        }
    }

    /**
     * 把本次结果包成 File（供 upload-data 通道入库，两引擎通用；同剥离 crs）。
     * @returns {File|null}
     */
    function buildImportFile() {
        if (!featureCollection.value) return null;
        const spec = toSpecGeoJSON(featureCollection.value);
        return new File([JSON.stringify(spec)], fileName.value || '高德建筑白模.geojson', {
            type: 'application/geo+json',
        });
    }

    /** 下载本次结果到本地（同剥离 crs） */
    function downloadResult() {
        if (!featureCollection.value) return;
        saveGeoJSONFile(toSpecGeoJSON(featureCollection.value), fileName.value || 'buildings_amap.geojson');
    }

    return {
        status,
        isFetching,
        progress,
        error,
        result,
        fileName,
        startFetch,
        cancel,
        buildImportFile,
        downloadResult,
    };
}
