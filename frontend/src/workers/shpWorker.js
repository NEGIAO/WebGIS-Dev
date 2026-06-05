/**
 * shpWorker.js
 * Shapefile 解析 Web Worker
 * 将 shpjs 的解析从主线程移到 Worker，避免大 Shapefile 阻塞 UI
 *
 * 输入：{ buffer: ArrayBuffer, fileName: string, sourceCrs?: string }
 * 输出：{ type: 'complete', fileName, geojson: object }
 *        geojson 为标准 GeoJSON FeatureCollection
 */
import shp from 'shpjs';

/**
 * 主消息处理
 */
self.onmessage = async (e) => {
  const { buffer, fileName, sourceCrs } = e.data;
  const startTime = performance.now();

  try {
    self.postMessage({ type: 'progress', fileName, progress: 10, phase: 'parsing' });

    // shpjs 解析 Shapefile buffer → GeoJSON
    const geojson = await shp(buffer);

    self.postMessage({ type: 'progress', fileName, progress: 80, phase: 'parsed' });

    // 统计 feature 数量
    let featureCount = 0;
    if (geojson.type === 'FeatureCollection') {
      featureCount = geojson.features?.length || 0;
    } else if (geojson.type === 'Feature') {
      featureCount = 1;
    }

    const elapsed = Math.round(performance.now() - startTime);

    self.postMessage({
      type: 'complete',
      fileName,
      geojson,
      featureCount,
      elapsed,
      sourceCrs: sourceCrs || null,
    });
  } catch (err) {
    self.postMessage({
      type: 'error',
      fileName,
      error: err.message || 'Shapefile parse failed',
    });
  }
};
