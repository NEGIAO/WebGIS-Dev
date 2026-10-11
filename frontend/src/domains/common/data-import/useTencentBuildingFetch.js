/**
 * 腾讯建筑白模抓取编排（composable）。
 *
 * 功能：把“选范围 → 抓取 → GeoJSON → 包 File 入库”编成可复用状态机，供面板组件调用。
 * 参数：无（调用 startFetch 时传入 bbox/zoom）。
 * 返回：状态（status/progress/error/result）+ startFetch/cancel/buildImportFile/downloadResult/estimateTiles。
 * 核心逻辑：复用 parsers/tencentBuildingFetcher 的 fetchTxBuildings（WGS-84 进出）；
 *   入库走既有 upload-data 通道（File 载荷），OL/Cesium 两引擎自动进 TOC 对应分组，
 *   不新增数据源 type，不碰配置与后端。
 */
import { computed, ref } from 'vue';
import {
    downloadGeoJSON as saveGeoJSONFile,
    fetchTxBuildings,
    lngLatToXyz,
} from './parsers/tencentBuildingFetcher';
import { wgs84ToGcj02 } from './crs/coordTransform';

/** 可选抓取级别（越高越细、请求越多） */
export const TXB_ZOOM_OPTIONS = [16, 17, 18];
/** 默认级别：建筑轮廓需要 z18 才完整 */
export const TXB_DEFAULT_ZOOM = 18;
/** 范围边长上限（度）：防手滑拉全城打爆请求量 */
export const TXB_MAX_EDGE_DEG = 0.05;
/** 批间隔毫秒：与抓取器建议一致，禁止调小 */
const TXB_BATCH_DELAY = 400;

/**
 * 估算瓦片数/批次数/耗时（与抓取器同算法：WGS-84 转 GCJ-02 再编号）。
 * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}} bbox WGS-84
 * @param {number} zoom 抓取级别
 * @returns {{tiles:number,batches:number,seconds:number}}
 */
export function estimateTxbTiles(bbox, zoom) {
    const corners = [
        [bbox.minLng, bbox.minLat],
        [bbox.minLng, bbox.maxLat],
        [bbox.maxLng, bbox.minLat],
        [bbox.maxLng, bbox.maxLat],
    ].map(([lo, la]) => wgs84ToGcj02(lo, la));
    const xs = corners.map(([lo, la]) => lngLatToXyz(lo, la, zoom)[0]);
    const ys = corners.map(([lo, la]) => lngLatToXyz(lo, la, zoom)[1]);
    const tiles = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    const batches = Math.ceil(tiles / 4);
    return { tiles, batches, seconds: Math.round(batches * (TXB_BATCH_DELAY / 1000 + 0.6)) };
}

/**
 * 转规范 GeoJSON（RFC 7946 无 crs 成员；裸字符串 crs 会使 Cesium
 * GeoJsonDataSource.load 以 "crs.properties is undefined" 抛错，OL 则忽略——
 * 两引擎行为差的根因。坐标本就是 WGS-84，两引擎默认即按此解析）。
 * @param {object} fc 抓取器输出的 FeatureCollection
 * @returns {object} 去掉非标准顶层 crs 的新对象（不改抓取器，其与 Node 脚本共用）
 */
export function toSpecGeoJSON(fc) {
    if (!fc || typeof fc !== 'object') return fc;
    if (fc.crs !== undefined && (typeof fc.crs !== 'object' || fc.crs === null)) {
        const { crs: _dropped, ...rest } = fc;
        return rest;
    }
    return fc;
}

/**
 * 校验范围输入。
 * @returns {string|null} 错误原因，无错误返回 null
 */
export function validateTxbBbox(bbox) {
    if (!bbox) return 'empty';
    const { minLng, minLat, maxLng, maxLat } = bbox;
    const vals = [minLng, minLat, maxLng, maxLat];
    if (vals.some((v) => !Number.isFinite(v))) return 'nan';
    if (minLng >= maxLng || minLat >= maxLat) return 'order';
    if (Math.abs(minLng) > 180 || Math.abs(maxLng) > 180) return 'range';
    if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) return 'range';
    if (maxLng - minLng > TXB_MAX_EDGE_DEG || maxLat - minLat > TXB_MAX_EDGE_DEG) return 'oversize';
    return null;
}

export function useTencentBuildingFetch() {
    /** idle | fetching | done | error */
    const status = ref('idle');
    const progress = ref({ done: 0, total: 0, count: 0 });
    const error = ref('');
    const result = ref(null);
    const featureCollection = ref(null);
    const fileName = ref('');
    let aborter = null;

    const isFetching = computed(() => status.value === 'fetching');

    /** 取消抓取（AbortController，抓取器每批检查 signal） */
    function cancel() {
        aborter?.abort();
    }

    /**
     * 开始抓取。
     * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}} bbox WGS-84 范围
     * @param {number} zoom 抓取级别
     * @returns {Promise<object|null>} GeoJSON，取消/失败返回 null
     */
    async function startFetch(bbox, zoom = TXB_DEFAULT_ZOOM) {
        const bad = validateTxbBbox(bbox);
        if (bad) {
            status.value = 'error';
            error.value = bad;
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
            const fc = await fetchTxBuildings(
                { bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat] },
                {
                    zoom,
                    batchDelay: TXB_BATCH_DELAY,
                    signal: aborter.signal,
                    onProgress: (done, total, count) => {
                        progress.value = { done, total, count };
                    },
                },
            );
            const centerLng = ((bbox.minLng + bbox.maxLng) / 2).toFixed(4);
            const centerLat = ((bbox.minLat + bbox.maxLat) / 2).toFixed(4);
            fileName.value = `腾讯建筑白模_z${zoom}_${centerLng}_${centerLat}.geojson`;
            featureCollection.value = fc;
            result.value = {
                featureCount: fc.features.length,
                elapsedMs: Date.now() - t0,
            };
            status.value = 'done';
            return fc;
        } catch (err) {
            // 主动取消视为回到 idle，不报红
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
     * 把本次结果包成 File（供 upload-data 通道入库，两引擎通用）。
     * 打包前剥离非标准顶层 crs（见 toSpecGeoJSON）。
     * @returns {File|null}
     */
    function buildImportFile() {
        if (!featureCollection.value) return null;
        const spec = toSpecGeoJSON(featureCollection.value);
        return new File([JSON.stringify(spec)], fileName.value || '腾讯建筑白模.geojson', {
            type: 'application/geo+json',
        });
    }

    /** 下载本次结果到本地（同剥离 crs，保证二次导入两引擎通用） */
    function downloadResult() {
        if (!featureCollection.value) return;
        saveGeoJSONFile(toSpecGeoJSON(featureCollection.value), fileName.value || 'buildings.geojson');
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
