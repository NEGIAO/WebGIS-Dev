import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { apiDownloadCreateTask, apiDownloadTaskStatus, apiDownloadCancelTask, apiDownloadListMyTasks, apiEstimateTileCount } from '@/api/download';

type DownloadMode = 'native' | 'progressive'; // native: browser native download, progressive: front-end visualization

type DownloadStatus =
    | 'idle'
    | 'pending'
    | 'downloading'
    | 'stitching'
    | 'success'
    | 'failed'
    | 'expired';

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
    basemap_name?: string;
    tile_count?: number;
    tiles_downloaded?: number;
};

const DEFAULT_TEMPLATE = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
const DEFAULT_RESOLUTION = 10;
const DEFAULT_POLL_INTERVAL = 500;
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
            maxLat: clamp(bbox.maxLat, -MAX_MERCATOR, MAX_MERCATOR),
        });
    }

    return normalizeBBox({
        minLon: clamp(bbox.minLon, -180, 180),
        minLat: clamp(bbox.minLat, -MAX_LATITUDE, MAX_LATITUDE),
        maxLon: clamp(bbox.maxLon, -180, 180),
        maxLat: clamp(bbox.maxLat, -MAX_LATITUDE, MAX_LATITUDE),
    });
}

/** Store 侧统一抛 i18n path（mapDownload.*），UI 再 t()；避免 EN 界面露中文硬编码。 */
function buildTaskPayload(
    tileUrlTemplate: string,
    bbox: BBoxInput,
    resolutionM: number,
    bboxCrs: string,
    clipToExtent: boolean = false,
    basemapName: string = '',
): { tile_url_template: string; bbox: number[]; resolution_m: number; bbox_crs: string; clip_to_extent: boolean; basemap_name: string } {
    // Validate inputs and build the backend payload.
    const template = String(tileUrlTemplate || '').trim();
    if (!template) {
        throw new Error('mapDownload.errTemplateRequired');
    }

    // 验证瓦片模板包含必要的占位符
    if (!template.includes('{z}') || !template.includes('{x}') || !template.includes('{y}')) {
        throw new Error('mapDownload.errTemplatePlaceholders');
    }

    const normalizedResolution = Number(resolutionM);
    if (!Number.isFinite(normalizedResolution) || normalizedResolution <= 0) {
        throw new Error('mapDownload.errResolutionPositive');
    }

    // 限制分辨率范围（0.5m 到 1000m）
    if (normalizedResolution < 0.5) {
        throw new Error('mapDownload.errResolutionTooHigh');
    }
    if (normalizedResolution > 1000) {
        throw new Error('mapDownload.errResolutionTooLow');
    }

    const parsedBBox: BBoxInput = {
        minLon: Number(bbox.minLon),
        minLat: Number(bbox.minLat),
        maxLon: Number(bbox.maxLon),
        maxLat: Number(bbox.maxLat),
    };

    if (
        !Number.isFinite(parsedBBox.minLon) ||
        !Number.isFinite(parsedBBox.minLat) ||
        !Number.isFinite(parsedBBox.maxLon) ||
        !Number.isFinite(parsedBBox.maxLat)
    ) {
        throw new Error('mapDownload.errBboxNumbers');
    }

    const normalizedBBox = clampBboxByCrs(parsedBBox, bboxCrs);

    // 验证 BBox 有效性（检查是否为有效矩形）
    if (
        normalizedBBox.minLon === normalizedBBox.maxLon ||
        normalizedBBox.minLat === normalizedBBox.maxLat
    ) {
        throw new Error('mapDownload.errBboxZeroArea');
    }

    return {
        tile_url_template: template,
        bbox: [
            normalizedBBox.minLon,
            normalizedBBox.minLat,
            normalizedBBox.maxLon,
            normalizedBBox.maxLat,
        ],
        resolution_m: normalizedResolution,
        bbox_crs: String(bboxCrs || 'EPSG:4326').trim() || 'EPSG:4326',
        clip_to_extent: clipToExtent,
        basemap_name: String(basemapName || '').trim(),
    };
}

export const useDownloadStore = defineStore('downloadStore', () => {
    const tileUrlTemplate = ref(DEFAULT_TEMPLATE);
    const bbox = ref<BBoxInput>({
        minLon: 116.2,
        minLat: 39.8,
        maxLon: 116.3,
        maxLat: 39.9,
    });
    const bboxCrs = ref<'EPSG:4326' | 'EPSG:3857'>('EPSG:4326');
    const extentSet = ref(false); // 用户是否已框选过范围
    const resolutionM = ref(DEFAULT_RESOLUTION);
    const clipToExtent = ref(false);
    const basemapName = ref('');

    // Download mode: 'native' (default) or 'progressive'
    const downloadMode = ref<DownloadMode>('native');
    
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

    // 估算瓦片数（通过后端 API 计算，与提交时使用相同算法）
    const estimatedTileCount = ref(0);
    const estimatingTiles = ref(false);
    let estimateTileTimer: ReturnType<typeof setTimeout> | null = null;

    // 任务实际瓦片进度（从轮询响应中获取）
    const tileCount = ref(0);
    const tilesDownloaded = ref(0);

    /** 防抖调用后端 API 更新估算瓦片数 */
    function updateEstimatedTileCount(delay: number = 500): void {
        if (estimateTileTimer !== null) {
            clearTimeout(estimateTileTimer);
        }
        estimateTileTimer = setTimeout(async () => {
            const bboxArr = [bbox.value.minLon, bbox.value.minLat, bbox.value.maxLon, bbox.value.maxLat];
            if (!bboxArr.every(v => typeof v === 'number' && isFinite(v)) || !resolutionM.value) {
                estimatedTileCount.value = 0;
                return;
            }
            estimatingTiles.value = true;
            try {
                const res = await apiEstimateTileCount(bboxArr, resolutionM.value);
                if (res?.status === 'success') {
                    estimatedTileCount.value = Number(res.tile_count || 0);
                }
            } catch {
                estimatedTileCount.value = 0;
            } finally {
                estimatingTiles.value = false;
            }
        }, delay);
    }

    let pollTimer: number | null = null;
    let pollInFlight = false;

    function dispose(): void {
        stopPolling();
        if (estimateTileTimer !== null) {
            clearTimeout(estimateTileTimer);
            estimateTileTimer = null;
        }
        // 通知后端取消任务，避免无意义执行
        if (taskId.value) {
            apiDownloadCancelTask(taskId.value).catch(() => {});
        }
    }

    const hasActiveTask = computed(() => Boolean(taskId.value));
    const isRunning = computed(() =>
        ['pending', 'downloading', 'stitching'].includes(status.value),
    );

    function applyTaskResponse(payload: DownloadTaskResponse): void {
        // Normalize backend payload into store fields.
        // 防御性编程：验证 payload 是否为有效的对象
        if (!payload || typeof payload !== 'object') {
            // 防御性校验失败,直接静默返回(非用户可操作项);不输出 console.error
            // console.error('[DownloadStore] Invalid task response:', payload);
            return;
        }

        taskId.value = String(payload?.task_id || taskId.value || '').trim();
        status.value = (payload?.status as DownloadStatus) || status.value;
        progress.value = Number(payload?.progress ?? progress.value ?? 0);
        message.value = String(payload?.message || '').trim();
        fileReady.value = payload?.file_ready === true;
        expiresAt.value = String(payload?.expires_at || '').trim();
        expiresInSeconds.value = Number(payload?.expires_in_seconds ?? 0);
        isExpired.value = payload?.is_expired === true || status.value === 'expired';
        tileCount.value = Number(payload?.tile_count ?? 0);
        tilesDownloaded.value = Number(payload?.tiles_downloaded ?? 0);
        basemapName.value = String(payload?.basemap_name || '').trim();
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
        // 通知后端取消任务，避免无意义执行
        if (taskId.value) {
            apiDownloadCancelTask(taskId.value).catch(() => {});
        }
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
        tileCount.value = 0;
        tilesDownloaded.value = 0;
    }

    async function submitTask(): Promise<boolean> {
        if (isSubmitting.value) return false;
        isSubmitting.value = true;
        lastError.value = '';
        try {
            const payload = buildTaskPayload(
                tileUrlTemplate.value,
                bbox.value,
                resolutionM.value,
                bboxCrs.value,
                clipToExtent.value,
                basemapName.value,
            );
            const response = await apiDownloadCreateTask(payload);

            // 验证响应有效性
            if (!response || typeof response !== 'object') {
                throw new Error('mapDownload.errInvalidResponse');
            }

            applyTaskResponse(response);
            status.value = (response?.status as DownloadStatus) || 'pending';
            progress.value = Number(response?.progress ?? 0);
            // 后端 message 可能是中文运营文案；无则用 i18n key，UI 侧 resolve 展示
            message.value = String(response?.message || 'mapDownload.msgTaskSubmitted').trim();

            // 验证任务ID是否有效
            if (!taskId.value) {
                throw new Error('mapDownload.errNoTaskId');
            }

            startPolling();
            return true;
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'mapDownload.errCreateTask';
            lastError.value = detail;
            status.value = 'failed';
            // 额度不足时刷新余额显示
            if (error?.isQuotaInsufficient) {
                lastError.value = 'mapDownload.quotaInsufficient';
            }
            // 调用方 MapDownloader 依据 lastError 展示 message.error,此处不重复 console.error
            // console.error('[DownloadStore] submitTask failed:', detail, error);
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

            // 验证响应有效性
            if (!response || typeof response !== 'object') {
                throw new Error('mapDownload.errInvalidPollResponse');
            }

            applyTaskResponse(response);

            if (status.value === 'success' || fileReady.value || progress.value >= 100) {
                stopPolling();
            } else if (status.value === 'failed' || isExpired.value) {
                stopPolling();
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'mapDownload.errPollFailed';
            lastError.value = errorMsg;
            // 轮询瞬态失败写入 lastError,由 UI 展示;不弹 toast 避免高频打扰,此处不输出 console.error
            // console.error('[DownloadStore] pollOnce failed:', errorMsg, error);
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

    async function fetchTaskById(inputId: string, autoPoll: boolean = true): Promise<boolean> {
        const safeId = String(inputId || '').trim();
        if (!safeId) {
            lastError.value = 'mapDownload.errTaskIdRequired';
            return false;
        }

        try {
            const response = await apiDownloadTaskStatus(safeId);

            // 验证响应有效性
            if (!response || typeof response !== 'object') {
                throw new Error('mapDownload.errInvalidStatusResponse');
            }

            applyTaskResponse(response);
            taskId.value = safeId;

            if (autoPoll && !['success', 'failed', 'expired'].includes(status.value)) {
                startPolling();
            }
            return true;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'mapDownload.errLookupFailed';
            lastError.value = errorMsg;
            // 调用方 MapDownloader 依据 lastError 展示 message.error,此处不重复 console.error
            // console.error('[DownloadStore] fetchTaskById failed:', errorMsg, error);
            return false;
        }
    }

    function applyBboxFromExtent(
        extent: number[],
        crs: 'EPSG:4326' | 'EPSG:3857' = 'EPSG:3857',
    ): boolean {
        if (!Array.isArray(extent) || extent.length < 4) return false;
        const [minX, minY, maxX, maxY] = extent;
        if (![minX, minY, maxX, maxY].every((value) => Number.isFinite(value))) return false;
        bboxCrs.value = crs;
        bbox.value = {
            minLon: minX,
            minLat: minY,
            maxLon: maxX,
            maxLat: maxY,
        };
        extentSet.value = true;
        return true;
    }

    /** 设置瓦片 URL 模板（供 MapDownloader 选择底图 preset 后写入） */
    function setTileUrlTemplate(template: string): void {
        tileUrlTemplate.value = String(template || '').trim();
    }

    /** 切换到外部任务（从任务列表选中） */
    function setExternalTask(targetTaskId: string): void {
        stopPolling();
        taskId.value = String(targetTaskId || '').trim();
        status.value = 'idle';
        progress.value = 0;
        message.value = '';
        fileReady.value = false;
        expiresAt.value = '';
        expiresInSeconds.value = 0;
        isExpired.value = false;
        lastError.value = '';
    }

    // 我的任务列表（账号绑定）
    const myTasks = ref<DownloadTaskResponse[]>([]);
    const loadingMyTasks = ref(false);

    /** 从后端拉取当前用户的任务列表 */
    async function fetchMyTasks(): Promise<void> {
        loadingMyTasks.value = true;
        try {
            const response = await apiDownloadListMyTasks();
            const tasks = response?.tasks;
            if (Array.isArray(tasks)) {
                myTasks.value = tasks;
            } else {
                myTasks.value = [];
            }
        } catch (_error) {
            // 权限不足(游客)已由拦截器提示;此处不重复弹窗,也不输出 console.error
            // console.error('[DownloadStore] fetchMyTasks failed:', error);
            myTasks.value = [];
            // 权限不足（游客）已由拦截器提示；此处无需重复弹窗
        } finally {
            loadingMyTasks.value = false;
        }
    }

    /** 刷新单个任务进度（从列表中更新） */
    async function refreshTaskStatus(taskId: string): Promise<void> {
        const safeId = String(taskId || '').trim();
        if (!safeId) return;
        try {
            const response = await apiDownloadTaskStatus(safeId);
            if (response && typeof response === 'object') {
                const idx = myTasks.value.findIndex(t => t.task_id === safeId);
                if (idx !== -1) {
                    myTasks.value[idx] = response;
                }
            }
        } catch (_error) {
            // 后台任务状态刷新失败,静默降级(由轮询/状态显示兜底);不输出 console.error
            // console.error('[DownloadStore] refreshTaskStatus failed:', error);
        }
    }

    return {
        tileUrlTemplate,
        bbox,
        bboxCrs,
        resolutionM,
        downloadMode,
        clipToExtent,
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
        estimatedTileCount,
        estimatingTiles,
        tileCount,
        tilesDownloaded,
        basemapName,
        updateEstimatedTileCount,
        hasActiveTask,
        isRunning,
        submitTask,
        pollOnce,
        startPolling,
        stopPolling,
        resetTask,
        fetchTaskById,
        applyBboxFromExtent,
        setTileUrlTemplate,
        setExternalTask,
        extentSet,
        myTasks,
        loadingMyTasks,
        fetchMyTasks,
        refreshTaskStatus,
        clearExtent() {
            extentSet.value = false;
            bbox.value = { minLon: 116.2, minLat: 39.8, maxLon: 116.3, maxLat: 39.9 };
            bboxCrs.value = 'EPSG:4326';
        },
        dispose,
    };
});
