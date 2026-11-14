/**
 * shpWorker.ts
 * Shapefile 解析 Web Worker
 * 将 shpjs 的解析从主线程移到 Worker，避免大 Shapefile 阻塞 UI
 *
 * 输入：{ buffer: ArrayBuffer, fileName: string, sourceCrs?: string }
 * 输出：{ type: 'complete', fileName, geojson: object }
 *        geojson 为标准 GeoJSON FeatureCollection
 */
import shp, { type ShpParseResult } from 'shpjs';

/** 主线程 → Worker 的请求载荷（与 tifUtils / dataDispatcher 的 postMessage 契约一致） */
type ShpWorkerRequest = {
  buffer: ArrayBuffer;
  fileName: string;
  sourceCrs?: string;
};

/** Worker → 主线程的消息判别联合，替代原先无约束的 e.data / postMessage(any) */
type ShpWorkerResponse =
  | { type: 'progress'; fileName: string; progress: number; phase: 'parsing' | 'parsed' }
  | {
      type: 'complete';
      fileName: string;
      geojson: ShpParseResult;
      featureCount: number;
      elapsed: number;
      sourceCrs: string | null;
    }
  | { type: 'error'; fileName: string; error: string };

/**
 * Worker 全局作用域最小契约。
 * 工程 tsconfig 只启用 DOM lib（未启用 lib.webworker），直接把 self 声明为
 * DedicatedWorkerGlobalScope 会与 DOM 的 self 声明冲突；此处仅建模实际使用的两个成员。
 */
type ShpWorkerScope = {
  onmessage: ((event: MessageEvent<ShpWorkerRequest>) => void | Promise<void>) | null;
  postMessage(message: ShpWorkerResponse): void;
};

const workerScope = self as unknown as ShpWorkerScope;

/** 兼容 Error 与带 message 字段的普通对象，等价于原 `err.message || fallback` */
function toErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return message ? String(message) : fallback;
}

/**
 * 主消息处理
 */
workerScope.onmessage = async (e) => {
  const { buffer, fileName, sourceCrs } = e.data;
  const startTime = performance.now();

  try {
    workerScope.postMessage({ type: 'progress', fileName, progress: 10, phase: 'parsing' });

    // shpjs 解析 Shapefile buffer → GeoJSON
    const geojson = await shp(buffer);

    workerScope.postMessage({ type: 'progress', fileName, progress: 80, phase: 'parsed' });

    // 统计 feature 数量
    // zip 内含多个 shapefile 时 shpjs 返回数组，沿用原有「非对象形态计 0」的语义
    let featureCount = 0;
    if (!Array.isArray(geojson)) {
      if (geojson.type === 'FeatureCollection') {
        featureCount = geojson.features?.length || 0;
      } else if (geojson.type === 'Feature') {
        featureCount = 1;
      }
    }

    const elapsed = Math.round(performance.now() - startTime);

    workerScope.postMessage({
      type: 'complete',
      fileName,
      geojson,
      featureCount,
      elapsed,
      sourceCrs: sourceCrs || null,
    });
  } catch (err) {
    workerScope.postMessage({
      type: 'error',
      fileName,
      error: toErrorMessage(err, 'Shapefile parse failed'),
    });
  }
};
