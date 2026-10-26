import axios from 'axios';
import backendAPI from './backend';
import {
    BACKEND_BASE_URL,
    BACKEND_REQUEST_TIMEOUT_MS,
    DOWNLOAD_REQUEST_TIMEOUT_MS,
    DOWNLOAD_SERVICE_BASE_URL,
} from '../config/publicRuntime';

// ────────────────────────────────────────────────────────────────
// 瓦片下载服务（独立节点 gis.negiao.cn）
//
// V3.6.5 起后端删除了 domains/tiles/download/ 与 /proxy/*（HF Space 政策）。
// 下载能力由独立节点承担，本应用只调接口：
//   - 瓦片抓取、GeoTIFF 拼装、磁盘存储、缓存与过期清理，全部在节点完成；
//   - 本应用不参与计算与存储，也不转发文件流。
//
// 基址由 VITE_DOWNLOAD_SERVICE_URL 指定（见 src/config/publicRuntime.ts）：
//   已配置 → 直连节点（节点侧已按来源放行，并暴露 Content-Disposition）
//   未配置 → 回落本机后端同源 /api/download/*（开发期 / 节点未就绪的降级路径）
//
// 两条路径的方法、路径、请求体与返回结构完全一致，调用方无需感知差异。
// ────────────────────────────────────────────────────────────────

/** 是否使用远端下载节点（已配置且与主后端基址不同） */
const USE_REMOTE_SERVICE =
    Boolean(DOWNLOAD_SERVICE_BASE_URL) && DOWNLOAD_SERVICE_BASE_URL !== BACKEND_BASE_URL;

/**
 * 下载请求客户端。
 *
 * 节点与主后端不是同一套用户体系，故不复用 backendAPI 的拦截器
 * （那套会注入主站 token / 设备头，并在失败时弹全局 toast）。
 * 这里只做「解包响应 + 归一化错误」，提示仍由调用方（MapDownloader）负责，
 * 避免与主站错误提示重复。
 */
const downloadAPI = USE_REMOTE_SERVICE
    ? axios.create({
          baseURL: DOWNLOAD_SERVICE_BASE_URL,
          timeout: BACKEND_REQUEST_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
      })
    : backendAPI;

if (USE_REMOTE_SERVICE) {
    downloadAPI.interceptors.response.use(
        (response) => {
            // 文件流保留完整响应：调用方要读 headers 里的文件名
            if (response?.config?.responseType === 'blob' || response?.config?.responseType === 'arraybuffer') {
                return response;
            }
            return response.data;
        },
        (error) => {
            const resp = error?.response;
            const status = Number(resp?.status || 0);
            const detail = resp?.data?.detail;
            const detailMsg =
                typeof detail === 'string' ? detail : String(detail?.message || detail?.detail || '').trim();
            const detailCode =
                detail && typeof detail === 'object' ? String(detail?.code || '').trim() : '';

            const apiError = new Error(detailMsg || error?.message || '瓦片下载服务请求失败');
            apiError.status = status;
            apiError.detailCode = detailCode;
            apiError.isQuotaExceeded = status === 429;
            apiError.isQuotaInsufficient = detailCode === 'DOWNLOAD_QUOTA_INSUFFICIENT' || status === 429;
            apiError.originalError = error;
            return Promise.reject(apiError);
        },
    );
}

/**
 * 创建新的底图下载任务
 * @param {{ tile_url_template: string, bbox: number[], resolution_m: number }} payload
 * @returns {Promise<any>} 后端返回的任务信息
 */
export async function apiDownloadCreateTask(payload = {}) {
    return downloadAPI.post('/api/download/tasks', payload);
}

/**
 * 获取任务状态（用于轮询）
 * @param {string} taskId
 * @returns {Promise<any>} 任务状态信息
 */
export async function apiDownloadTaskStatus(taskId) {
    const safeId = encodeURIComponent(String(taskId || '').trim());
    return downloadAPI.get(`/api/download/tasks/${safeId}`);
}

/**
 * 下载请求超时时间：统一由 src/config/publicRuntime 派生（VITE_DOWNLOAD_REQUEST_TIMEOUT）
 */
const DOWNLOAD_REQUEST_TIMEOUT = DOWNLOAD_REQUEST_TIMEOUT_MS;

/**
 * 下载生成的 GeoTIFF 文件（使用流式响应，用于前端进度可视化）
 * @param {string} taskId
 * @param {(progress: number, meta?: { loaded: number, total: number }) => void} onProgress
 * @param {{ signal?: AbortSignal }} options
 * @returns {Promise<import('axios').AxiosResponse<Blob>>} 完整响应对象（含 headers）
 */
export async function apiDownloadTaskFile(taskId, onProgress, options = {}) {
    const safeId = encodeURIComponent(String(taskId || '').trim());
    return downloadAPI.get(`/api/download/tasks/${safeId}/file`, {
        responseType: 'blob',
        timeout: DOWNLOAD_REQUEST_TIMEOUT,
        signal: options.signal,
        onDownloadProgress: (progressEvent) => {
            const loaded = Number(progressEvent?.loaded || 0);
            const total = Number(progressEvent?.total || 0);
            const progress =
                total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : 0;
            if (typeof onProgress === 'function') {
                onProgress(progress, { loaded, total });
            }
        },
    });
}

/**
 * 取消下载任务（通知后端中止执行，避免无意义消耗）
 * @param {string} taskId
 */
export async function apiDownloadCancelTask(taskId) {
    const safeId = encodeURIComponent(String(taskId || '').trim());
    return downloadAPI.post(`/api/download/tasks/${safeId}/cancel`);
}

/**
 * 根据 bbox + 分辨率估算瓦片总数（与后端 _estimate_tile_count 使用相同算法）
 * @param {number[]} bbox [minLon, minLat, maxLon, maxLat]
 * @param {number} resolutionM 分辨率（米/像素）
 * @returns {Promise<{ status: string, tile_count: number }>}
 */
export async function apiEstimateTileCount(bbox, resolutionM) {
    const bboxStr = Array.isArray(bbox) ? bbox.join(',') : String(bbox || '');
    return downloadAPI.get('/api/download/estimate-tiles', { params: { bbox: bboxStr, resolution_m: resolutionM } });
}

/**
 * 获取当前用户的任务列表（我的任务）
 * @returns {Promise<any>} 任务列表
 */
export async function apiDownloadListMyTasks() {
    return downloadAPI.get('/api/download/tasks');
}
