import { computed, ref } from 'vue';
import {
    downloadGeoJSON as saveGeoJSONFile,
    estimateTdtTiles,
    fetchTdtBuildings,
} from './parsers/tdtBuildingFetcher';
import {
    downloadVectorGeoJSON as saveVectorGeoJSONFile,
    estimateTdtVectorTiles,
    fetchTdtVectorLayers,
} from './parsers/tdtVectorFetcher';
import { normalizeTdtLayerSelection } from './parsers/tdtVectorLayers.js';
import { toSpecGeoJSON } from './useTencentBuildingFetch';
import { getRuntimeMapTokensSync, loadRuntimeMapTokens } from '@common/services/runtimeMapTokens';

export const TDT_ZOOM_OPTIONS = [15, 16, 17, 18];
export const TDT_DEFAULT_ZOOM = 16;
export const TDT_MAX_EDGE_DEG = 0.2;
const TDT_BATCH_DELAY = 400;

export function validateTdtBbox(bbox) {
    if (!bbox) return 'empty';
    const values = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat];
    if (values.some((value) => !Number.isFinite(value))) return 'nan';
    if (bbox.minLng >= bbox.maxLng || bbox.minLat >= bbox.maxLat) return 'order';
    if (Math.abs(bbox.minLng) > 180 || Math.abs(bbox.maxLng) > 180 || Math.abs(bbox.minLat) > 90 || Math.abs(bbox.maxLat) > 90) return 'range';
    if (bbox.maxLng - bbox.minLng > TDT_MAX_EDGE_DEG || bbox.maxLat - bbox.minLat > TDT_MAX_EDGE_DEG) return 'oversize';
    return null;
}

export function useTdtBuildingFetch() {
    const status = ref('idle');
    const progress = ref({ done: 0, total: 0, count: 0 });
    const error = ref('');
    const result = ref(null);
    const featureCollection = ref(null);
    const fileName = ref('');
    /** 全量分层结果：{ layers: Record<码, FC>, stats: Record<码, stats>, fileNames: Record<码, string> } */
    const vectorResult = ref(null);
    /** 用户多选层码（默认仅建筑 CE；面板勾选/全选切换写入，老建筑链路不受影响） */
    const selectedLayers = ref(['CE']);
    let aborter = null;
    const isFetching = computed(() => status.value === 'fetching');

    function cancel() {
        aborter?.abort();
    }

    /**
     * 建筑单层抓取（默认 tk 取管理端 L2 配置）。
     * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}} bbox WGS-84 范围
     * @param {number} zoom 抓取级别
     * @param {string} [inputTk] 面板临时 tk（优先，不保存；面板侧已做 24~64 位字母数字闸门）
     * @returns {Promise<object|null>} GeoJSON，取消/失败返回 null
     */
    async function startFetch(bbox, zoom = TDT_DEFAULT_ZOOM, inputTk = '') {
        const bad = validateTdtBbox(bbox);
        if (bad) {
            status.value = 'error';
            error.value = bad;
            return null;
        }
        await loadRuntimeMapTokens().catch(() => {});
        const tk = String(inputTk || getRuntimeMapTokensSync().tiandituTk || '').trim();
        if (!tk) {
            status.value = 'error';
            error.value = 'tdt_key_required';
            return null;
        }
        aborter?.abort();
        aborter = new AbortController();
        status.value = 'fetching';
        error.value = '';
        result.value = null;
        featureCollection.value = null;
        progress.value = { done: 0, total: 0, count: 0 };
        const started = Date.now();
        try {
            const fc = await fetchTdtBuildings({
                bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat],
                zoom,
                tk,
                batchDelay: TDT_BATCH_DELAY,
                signal: aborter.signal,
                onProgress: (done, total, count) => {
                    progress.value = { done, total, count };
                },
            });
            const lng = ((bbox.minLng + bbox.maxLng) / 2).toFixed(4);
            const lat = ((bbox.minLat + bbox.maxLat) / 2).toFixed(4);
            fileName.value = `天地图建筑白模_z${zoom}_${lng}_${lat}.geojson`;
            featureCollection.value = fc;
            result.value = { featureCount: fc.features.length, elapsedMs: Date.now() - started };
            status.value = 'done';
            return fc;
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

    function buildImportFile() {
        if (!featureCollection.value) return null;
        return new File(
            [JSON.stringify(toSpecGeoJSON(featureCollection.value))],
            fileName.value || '天地图建筑白模.geojson',
            { type: 'application/geo+json' },
        );
    }

    function downloadResult() {
        if (featureCollection.value) saveGeoJSONFile(toSpecGeoJSON(featureCollection.value), fileName.value || '天地图建筑白模.geojson');
    }

    /**
     * 全量矢量抓取（新增，不动老 startFetch）。
     * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}} bbox WGS-84 范围
     * @param {number} zoom 抓取级别
     * @param {string} [inputTk] 面板临时 tk（优先，不保存；面板侧已做 24~64 位字母数字闸门）
     * @param {string[]} layers 多选层码（缺省用 selectedLayers）
     * @returns {Promise<object|null>} { layers, stats }，取消/失败返回 null
     */
    async function startVectorFetch(bbox, zoom = TDT_DEFAULT_ZOOM, inputTk = '', layers = null) {
        const bad = validateTdtBbox(bbox);
        if (bad) {
            status.value = 'error';
            error.value = bad;
            return null;
        }
        await loadRuntimeMapTokens().catch(() => {});
        const tk = String(inputTk || getRuntimeMapTokensSync().tiandituTk || '').trim();
        if (!tk) {
            status.value = 'error';
            error.value = 'tdt_key_required';
            return null;
        }
        /** 空选集显式报错（不再回退全量，避免"全不选却抓全部"的误导） */
        const picked = layers || selectedLayers.value;
        if (!Array.isArray(picked) || !picked.length) {
            status.value = 'error';
            error.value = 'layers_required';
            return null;
        }
        const wanted = normalizeTdtLayerSelection(picked);
        selectedLayers.value = wanted;
        aborter?.abort();
        aborter = new AbortController();
        status.value = 'fetching';
        error.value = '';
        result.value = null;
        vectorResult.value = null;
        progress.value = { done: 0, total: 0, count: 0 };
        const started = Date.now();
        try {
            const out = await fetchTdtVectorLayers({
                bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat],
                zoom,
                tk,
                layers: wanted,
                batchDelay: TDT_BATCH_DELAY,
                signal: aborter.signal,
                onProgress: (done, total, count) => {
                    progress.value = { done, total, count };
                },
            });
            const lng = ((bbox.minLng + bbox.maxLng) / 2).toFixed(4);
            const lat = ((bbox.minLat + bbox.maxLat) / 2).toFixed(4);
            const fileNames = {};
            let total = 0;
            for (const code of Object.keys(out.layers)) {
                fileNames[code] = `天地图矢量_${code}_z${zoom}_${lng}_${lat}.geojson`;
                total += out.layers[code]?.features?.length || 0;
            }
            vectorResult.value = { ...out, fileNames };
            result.value = { featureCount: total, elapsedMs: Date.now() - started, vector: true, layerStats: out.stats };
            status.value = 'done';
            return vectorResult.value;
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

    /** 分层打包（每层独立 File，走既有 upload-data 多资源入库） */
    function buildVectorImportFiles() {
        if (!vectorResult.value) return [];
        return Object.entries(vectorResult.value.layers)
            .filter(([, fc]) => fc?.features?.length)
            .map(([code, fc]) => new File(
                [JSON.stringify(toSpecGeoJSON(fc))],
                vectorResult.value.fileNames[code] || `天地图矢量_${code}.geojson`,
                { type: 'application/geo+json' },
            ));
    }

    /** 分层下载（逐层触发浏览器下载） */
    function downloadVectorResult() {
        if (!vectorResult.value) return;
        for (const [code, fc] of Object.entries(vectorResult.value.layers)) {
            if (!fc?.features?.length) continue;
            saveVectorGeoJSONFile(toSpecGeoJSON(fc), vectorResult.value.fileNames[code] || `天地图矢量_${code}.geojson`);
        }
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
        selectedLayers,
        vectorResult,
        startVectorFetch,
        buildVectorImportFiles,
        downloadVectorResult,
    };
}

export { estimateTdtTiles, estimateTdtVectorTiles };
