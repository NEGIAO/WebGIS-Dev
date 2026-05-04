import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
    apiDownloadCreateTask,
    apiDownloadTaskFile,
    apiDownloadTaskStatus
} from '../api/download';

type DownloadStatus = 'idle' | 'pending' | 'downloading' | 'stitching' | 'success' | 'failed' | 'expired';

type BBoxInput = {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
};

type DownloadTaskResponse = {
    task_id?: string;
    status?: string;
    progress?: number;
    message?: string | null;
    file_ready?: boolean;
    expires_at?: string;
    expires_in_seconds?: number;
    is_expired?: boolean;
};

const DEFAULT_TEMPLATE = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
const DEFAULT_RESOLUTION = 10;
const DEFAULT_POLL_INTERVAL = 1500;
const MAX_MERCATOR = 20037508.342789244;
const MAX_LATITUDE = 85.05112878;

function clamp(value: number, minValue: number, maxValue: number): number {
    // Clamp values to avoid invalid bbox inputs.
    return Math.max(minValue, Math.min(value, maxValue));
}

function normalizeBBox(bbox: BBoxInput): BBoxInput {
    // Ensure bbox ordering is always min <= max for each axis.
    const minLon = Math.min(bbox.minLon, bbox.maxLon);
    const maxLon = Math.max(bbox.minLon, bbox.maxLon);
    const minLat = Math.min(bbox.minLat, bbox.maxLat);
    const maxLat = Math.max(bbox.minLat, bbox.maxLat);
    return { minLon, minLat, maxLon, maxLat };
}

function clampBboxByCrs(bbox: BBoxInput, crs: string): BBoxInput {
    if (String(crs || '').toUpperCase() === 'EPSG:3857') {
        return normalizeBBox({
            minLon: clamp(bbox.minLon, -MAX_MERCATOR, MAX_MERCATOR),
            minLat: clamp(bbox.minLat, -MAX_MERCATOR, MAX_MERCATOR),
            maxLon: clamp(bbox.maxLon, -MAX_MERCATOR, MAX_MERCATOR),
            maxLat: clamp(bbox.maxLat, -MAX_MERCATOR, MAX_MERCATOR)
        });
    }

    return normalizeBBox({
        minLon: clamp(bbox.minLon, -180, 180),
        minLat: clamp(bbox.minLat, -MAX_LATITUDE, MAX_LATITUDE),
        maxLon: clamp(bbox.maxLon, -180, 180),
        maxLat: clamp(bbox.maxLat, -MAX_LATITUDE, MAX_LATITUDE)
    });
}

function buildTaskPayload(
    tileUrlTemplate: string,
    bbox: BBoxInput,
    resolutionM: number,
    bboxCrs: string
): { tile_url_template: string; bbox: number[]; resolution_m: number; bbox_crs: string } {
    // Validate inputs and build the backend payload.
    const template = String(tileUrlTemplate || '').trim();
    if (!template) {
        throw new Error('请输入瓦片 URL 模板');
    }

    const normalizedResolution = Number(resolutionM);
    if (!Number.isFinite(normalizedResolution) || normalizedResolution <= 0) {
        throw new Error('分辨率必须是大于 0 的数字');
    }

    const parsedBBox: BBoxInput = {
        minLon: Number(bbox.minLon),
        minLat: Number(bbox.minLat),
        maxLon: Number(bbox.maxLon),
        maxLat: Number(bbox.maxLat)
    };

    if (!Number.isFinite(parsedBBox.minLon)
        || !Number.isFinite(parsedBBox.minLat)
        || !Number.isFinite(parsedBBox.maxLon)
        || !Number.isFinite(parsedBBox.maxLat)) {
        throw new Error('BBox 必须填写完整的数字坐标');
    }

    const normalizedBBox = clampBboxByCrs(parsedBBox, bboxCrs);

    return {
        tile_url_template: template,
        bbox: [
            normalizedBBox.minLon,
            normalizedBBox.minLat,
            normalizedBBox.maxLon,
            normalizedBBox.maxLat
        ],
        resolution_m: normalizedResolution,
        bbox_crs: String(bboxCrs || 'EPSG:4326').trim() || 'EPSG:4326'
    };
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
    // Create a temporary anchor to save the blob as a local file.
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const useDownloadStore = defineStore('downloadStore', () => {
    const tileUrlTemplate = ref(DEFAULT_TEMPLATE);
    const bbox = ref<BBoxInput>({
        minLon: 116.2,
        minLat: 39.8,
        maxLon: 116.6,
        maxLat: 40.1
    });
    const bboxCrs = ref<'EPSG:4326' | 'EPSG:3857'>('EPSG:4326');
    const resolutionM = ref(DEFAULT_RESOLUTION);

    const taskId = ref('');
    const status = ref<DownloadStatus>('idle');
    const progress = ref(0);
    const message = ref('');
    const fileReady = ref(false);
    const expiresAt = ref('');
    const expiresInSeconds = ref(0);
    const isExpired = ref(false);
    const lastError = ref('');
    const isSubmitting = ref(false);
    const isPolling = ref(false);
    const downloadedAt = ref<number | null>(null);

    let pollTimer: number | null = null;
    let pollInFlight = false;
    let downloadTriggered = false;

    const hasActiveTask = computed(() => Boolean(taskId.value));
    const isRunning = computed(() => ['pending', 'downloading', 'stitching'].includes(status.value));

    function applyTaskResponse(payload: DownloadTaskResponse): void {
        // Normalize backend payload into store fields.
        taskId.value = String(payload?.task_id || taskId.value || '').trim();
        status.value = (payload?.status as DownloadStatus) || status.value;
        progress.value = Number(payload?.progress ?? progress.value ?? 0);
        message.value = String(payload?.message || '').trim();
        fileReady.value = payload?.file_ready === true;
        expiresAt.value = String(payload?.expires_at || '').trim();
        expiresInSeconds.value = Number(payload?.expires_in_seconds ?? 0);
        isExpired.value = payload?.is_expired === true || status.value === 'expired';
    }

    function stopPolling(): void {
        // Stop polling loop and release the timer handle.
        if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
        }
        isPolling.value = false;
    }

    function resetTask(): void {
        // Reset task state for a fresh download run.
        stopPolling();
        taskId.value = '';
        status.value = 'idle';
        progress.value = 0;
        message.value = '';
        fileReady.value = false;
        expiresAt.value = '';
        expiresInSeconds.value = 0;
        isExpired.value = false;
        lastError.value = '';
        downloadedAt.value = null;
        downloadTriggered = false;
    }

    async function submitTask(): Promise<boolean> {
        if (isSubmitting.value) return false;
        isSubmitting.value = true;
        lastError.value = '';
        downloadTriggered = false;
        try {
            const payload = buildTaskPayload(
                tileUrlTemplate.value,
                bbox.value,
                resolutionM.value,
                bboxCrs.value
            );
            const response = await apiDownloadCreateTask(payload);
            applyTaskResponse(response || {});
            status.value = (response?.status as DownloadStatus) || 'pending';
            progress.value = Number(response?.progress ?? 0);
            message.value = String(response?.message || '任务已提交');
            startPolling();
            return true;
        } catch (error) {
            const detail = error instanceof Error ? error.message : '创建任务失败';
            lastError.value = detail;
            status.value = 'failed';
            return false;
        } finally {
            isSubmitting.value = false;
        }
    }

    async function pollOnce(): Promise<void> {
        if (!taskId.value || pollInFlight) return;
        pollInFlight = true;
        try {
            const response = await apiDownloadTaskStatus(taskId.value);
            applyTaskResponse(response || {});
            if (shouldTriggerDownload()) {
                await downloadResult();
                stopPolling();
            } else if (status.value === 'failed' || isExpired.value) {
                stopPolling();
            }
        } catch (error) {
            lastError.value = error instanceof Error ? error.message : '轮询失败';
        } finally {
            pollInFlight = false;
        }
    }

    function startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL): void {
        // Start a bounded polling loop for task progress.
        stopPolling();
        if (!taskId.value) return;
        isPolling.value = true;
        pollOnce();
        pollTimer = window.setInterval(pollOnce, intervalMs);
    }

    function shouldTriggerDownload(): boolean {
        // Auto-download when backend reports success or progress reaches 100%.
        if (downloadTriggered) return false;
        if (isExpired.value) return false;
        if (fileReady.value) return true;
        if (status.value === 'success') return true;
        return progress.value >= 100;
    }

    async function downloadResult(): Promise<void> {
        if (!taskId.value || downloadTriggered) return;
        if (isExpired.value) {
            lastError.value = '任务已过期，无法下载';
            status.value = 'failed';
            return;
        }
        downloadTriggered = true;
        try {
            const response = await apiDownloadTaskFile(taskId.value);
            const blob = response instanceof Blob ? response : new Blob([response], { type: 'image/tiff' });
            const filename = `basemap_${taskId.value}.tif`;
            triggerBrowserDownload(blob, filename);
            downloadedAt.value = Date.now();
            message.value = '文件已下载';
            status.value = 'success';
            progress.value = 100;
        } catch (error) {
            downloadTriggered = false;
            lastError.value = error instanceof Error ? error.message : '下载文件失败';
            status.value = 'failed';
        }
    }

    async function fetchTaskById(inputId: string, autoPoll: boolean = true): Promise<boolean> {
        const safeId = String(inputId || '').trim();
        if (!safeId) {
            lastError.value = '请输入任务 ID';
            return false;
        }

        try {
            const response = await apiDownloadTaskStatus(safeId);
            applyTaskResponse(response || {});
            taskId.value = safeId;
            if (autoPoll && !['success', 'failed', 'expired'].includes(status.value)) {
                startPolling();
            }
            return true;
        } catch (error) {
            lastError.value = error instanceof Error ? error.message : '任务查询失败';
            return false;
        }
    }

    function applyBboxFromExtent(extent: number[], crs: 'EPSG:4326' | 'EPSG:3857' = 'EPSG:3857'): boolean {
        if (!Array.isArray(extent) || extent.length < 4) return false;
        const [minX, minY, maxX, maxY] = extent;
        if (![minX, minY, maxX, maxY].every((value) => Number.isFinite(value))) return false;
        bboxCrs.value = crs;
        bbox.value = {
            minLon: minX,
            minLat: minY,
            maxLon: maxX,
            maxLat: maxY
        };
        return true;
    }

    return {
        tileUrlTemplate,
        bbox,
        bboxCrs,
        resolutionM,
        taskId,
        status,
        progress,
        message,
        fileReady,
        expiresAt,
        expiresInSeconds,
        isExpired,
        lastError,
        isSubmitting,
        isPolling,
        downloadedAt,
        hasActiveTask,
        isRunning,
        submitTask,
        pollOnce,
        startPolling,
        stopPolling,
        downloadResult,
        resetTask,
        fetchTaskById,
        applyBboxFromExtent
    };
});
