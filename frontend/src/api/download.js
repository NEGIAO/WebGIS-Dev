import backendAPI from './backend';
import { DOWNLOAD_REQUEST_TIMEOUT_MS } from '../config/publicRuntime';

/**
 * 创建新的底图下载任务
 * @param {{ tile_url_template: string, bbox: number[], resolution_m: number }} payload
 * @returns {Promise<any>} 后端返回的任务信息
 */
export async function apiDownloadCreateTask(payload = {}) {
    return backendAPI.post('/api/download/tasks', payload);
}

/**
 * 获取任务状态（用于轮询）
 * @param {string} taskId
 * @returns {Promise<any>} 任务状态信息
 */
export async function apiDownloadTaskStatus(taskId) {
    const safeId = encodeURIComponent(String(taskId || '').trim());
    return backendAPI.get(`/api/download/tasks/${safeId}`);
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
    return backendAPI.get(`/api/download/tasks/${safeId}/file`, {
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
    return backendAPI.post(`/api/download/tasks/${safeId}/cancel`);
}

/**
 * 根据 bbox + 分辨率估算瓦片总数（与后端 _estimate_tile_count 使用相同算法）
 * @param {number[]} bbox [minLon, minLat, maxLon, maxLat]
 * @param {number} resolutionM 分辨率（米/像素）
 * @returns {Promise<{ status: string, tile_count: number }>}
 */
export async function apiEstimateTileCount(bbox, resolutionM) {
    const bboxStr = Array.isArray(bbox) ? bbox.join(',') : String(bbox || '');
    return backendAPI.get('/api/download/estimate-tiles', { params: { bbox: bboxStr, resolution_m: resolutionM } });
}

/**
 * 获取当前用户的任务列表（我的任务）
 * @returns {Promise<any>} 任务列表
 */
export async function apiDownloadListMyTasks() {
    return backendAPI.get('/api/download/tasks');
}
