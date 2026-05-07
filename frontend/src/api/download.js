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
 * @returns {Promise<Blob>} GeoTIFF 文件二进制对象
 */
export async function apiDownloadTaskFile(taskId) {
    const safeId = encodeURIComponent(String(taskId || '').trim());
    return backendAPI.get(`/api/download/tasks/${safeId}/file`, {
        responseType: 'blob',
        timeout: DOWNLOAD_REQUEST_TIMEOUT, // 覆盖全局 8s 超时，确保大文件下载不中断
    });
}
