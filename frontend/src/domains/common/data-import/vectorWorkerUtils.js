/**
 * vectorWorkerUtils.js
 * 矢量数据 Worker 解析工具
 * 封装 Shapefile/GeoJSON 的 Worker 解析逻辑，避免主线程阻塞
 */

/**
 * 用 Worker 解析 Shapefile buffer
 * @param {ArrayBuffer} buffer - Shapefile 的 ArrayBuffer
 * @param {string} fileName - 文件名（用于日志）
 * @param {string} [sourceCrs] - 源坐标系（可选）
 * @param {function} [onProgress] - 进度回调 (progress, phase) => void
 * @returns {Promise<{ geojson: object, featureCount: number, elapsed: number, sourceCrs?: string }>}
 */
export function parseShapefileInWorker(buffer, fileName, sourceCrs, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/shpWorker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.progress, msg.phase);
      } else if (msg.type === 'complete') {
        worker.terminate();
        resolve({
          geojson: msg.geojson,
          featureCount: msg.featureCount,
          elapsed: msg.elapsed,
          sourceCrs: msg.sourceCrs,
        });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Shapefile Worker error'));
    };

    // 发送 buffer 给 Worker（Transferable 零拷贝）
    worker.postMessage({ buffer, fileName, sourceCrs }, [buffer]);
  });
}

/**
 * 用 requestIdleCallback 分片处理 GeoJSON features
 * 每帧只处理若干 feature，保证 UI 不卡顿
 *
 * @param {object} geojson - GeoJSON FeatureCollection
 * @param {function} processFeature - 单个 feature 处理函数 (feature, index) => Promise<void>
 * @param {function} [onProgress] - 进度回调 (processed, total) => void
 * @returns {Promise<number>} 处理的 feature 数量
 */
export function processGeoJsonIdle(geojson, processFeature, onProgress) {
  return new Promise((resolve, _reject) => {
    const features = geojson?.features || [];
    const total = features.length;
    if (total === 0) {
      resolve(0);
      return;
    }

    let processed = 0;

    // 使用 requestIdleCallback 在浏览器空闲时处理
    const processChunk = (deadline) => {
      // 每个空闲期处理尽可能多的 feature，但保证剩余时间 > 2ms
      while ((deadline.timeRemaining() > 2 || deadline.didTimeout) && processed < total) {
        const feature = features[processed];
        const idx = processed;
        processed++;

        try {
          // 同步处理 feature（不 await，避免在 idle callback 中使用 async）
          processFeature(feature, idx);
        } catch (err) {
          console.warn(`[vectorWorker] Feature ${idx} failed:`, err.message);
        }
      }

      // 报告进度
      onProgress?.(processed, total);

      if (processed < total) {
        // 还有剩余，继续下一个空闲期
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(processChunk, { timeout: 100 });
        } else {
          // fallback：requestIdleCallback 不可用时用 setTimeout
          setTimeout(() => {
            processChunk({
              timeRemaining: () => 10,
              didTimeout: false,
            });
          }, 0);
        }
      } else {
        resolve(processed);
      }
    };

    // 启动第一个空闲回调
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(processChunk, { timeout: 100 });
    } else {
      setTimeout(() => {
        processChunk({
          timeRemaining: () => 10,
          didTimeout: false,
        });
      }, 0);
    }
  });
}

/**
 * 判断是否应该使用 Worker 路径
 * @param {number} fileSize - 文件大小（字节）
 * @param {number} [threshold] - 阈值，默认 1MB
 * @returns {boolean}
 */
export function shouldUseWorker(fileSize, threshold = 1024 * 1024) {
  return fileSize > threshold;
}
