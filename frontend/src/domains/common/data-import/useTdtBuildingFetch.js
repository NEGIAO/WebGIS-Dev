import { computed, ref } from 'vue';
import {
    downloadGeoJSON as saveGeoJSONFile,
    estimateTdtTiles,
    fetchTdtBuildings,
} from './parsers/tdtBuildingFetcher';
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
    let aborter = null;
    const isFetching = computed(() => status.value === 'fetching');

    function cancel() {
        aborter?.abort();
    }

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

export { estimateTdtTiles };
