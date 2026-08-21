import backendAPI from './client';

/** 获取后端缓存的 ESRI Wayback 历史影像目录。 */
export function apiGetHistoricalImageryLayers() {
    return backendAPI.get('/api/historical-imagery/esri-wayback/layers');
}
