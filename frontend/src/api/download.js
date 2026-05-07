import backendAPI from './backend';

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
 * 下载请求超时时间：5 分钟 (300000ms)
 * 远长于全局 8s 超时设置，因为大型 GeoTIFF 文件流传输耗时较久
 */
const DOWNLOAD_REQUEST_TIMEOUT = Number(import.meta.env.VITE_DOWNLOAD_REQUEST_TIMEOUT || 300000);

/**
 * 下载生成的 GeoTIFF 文件
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
