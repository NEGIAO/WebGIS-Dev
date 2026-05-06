import backendAPI from './backend';

/**
 * Create a new basemap download task.
 * @param {{ tile_url_template: string, bbox: number[], resolution_m: number }} payload
 * @returns {Promise<any>} Task payload returned by backend.
 */
export async function apiDownloadCreateTask(payload = {}) {
    return backendAPI.post('/api/download/tasks', payload);
}

/**
 * Fetch task status for polling.
 * @param {string} taskId
 * @returns {Promise<any>} Task status payload.
 */
export async function apiDownloadTaskStatus(taskId) {
    const safeId = encodeURIComponent(String(taskId || '').trim());
    return backendAPI.get(`/api/download/tasks/${safeId}`);
}

/**
 * Download request timeout: 5 minutes (300000ms)
 * Much longer than global 8s timeout since large GeoTIFF files take time to stream
 */
const DOWNLOAD_REQUEST_TIMEOUT = Number(import.meta.env.VITE_DOWNLOAD_REQUEST_TIMEOUT || 300000);

/**
 * Download the resulting GeoTIFF file.
 * @param {string} taskId
 * @returns {Promise<Blob>} GeoTIFF blob
 */
export async function apiDownloadTaskFile(taskId) {
    const safeId = encodeURIComponent(String(taskId || '').trim());
    return backendAPI.get(`/api/download/tasks/${safeId}/file`, {
        responseType: 'blob',
        timeout: DOWNLOAD_REQUEST_TIMEOUT  // Override global 8s timeout for file download
    });
}
