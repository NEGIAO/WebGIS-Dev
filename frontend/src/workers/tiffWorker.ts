/**
 * tiffWorker.ts
 * TIF/GeoTIFF 解码 Web Worker
 * 将 geotiff.js 的解析+解码从主线程移到 Worker，避免大文件阻塞 UI
 *
 * 输入：{ buffer: ArrayBuffer, fileName: string }
 * 输出：{ fileName, width, height, bandCount, dataType, data, nodata, stats }
 * data 通过 Transferable 零拷贝传递
 */
// geotiff 的 ESM 默认导出是 GeoTIFF 类（仅有静态 fromSource），fromArrayBuffer 是具名导出；
// 原先 `GeoTIFF.fromArrayBuffer(buffer)` 在 ESM 解析下为 undefined，改用官方具名 API。
import { fromArrayBuffer } from 'geotiff';

/** 主线程 → Worker 的请求载荷 */
type TiffWorkerRequest = {
  buffer: ArrayBuffer;
  fileName: string;
};

/** 单波段统计结果 */
type BandStats = { min: number; max: number; mean: number };

/** Worker → 主线程的消息判别联合 */
type TiffWorkerResponse =
  | { type: 'progress'; fileName: string; progress: number; phase: 'decoding' }
  | {
      type: 'complete';
      fileName: string;
      width: number;
      height: number;
      bandCount: number;
      dataType: 'Float32';
      data: Float32Array[];
      nodata: number | null;
      stats: BandStats[];
      elapsed: number;
    }
  | { type: 'error'; fileName: string; error: string };

/**
 * Worker 全局作用域最小契约。
 * 工程 tsconfig 只启用 DOM lib（未启用 lib.webworker），直接把 self 声明为
 * DedicatedWorkerGlobalScope 会与 DOM 的 self 声明冲突；此处仅建模实际使用的两个成员。
 */
type TiffWorkerScope = {
  onmessage: ((event: MessageEvent<TiffWorkerRequest>) => void | Promise<void>) | null;
  postMessage(message: TiffWorkerResponse, transfer?: Transferable[]): void;
};

/**
 * readRasters() 返回的波段数组最小结构契约。
 * geotiff 自带 d.ts 的 ReadRasterResult 是自动生成的联合类型（单数组 / 数组套数组），
 * 逐波段 subarray 时无法直接调用；此处按本 Worker 实际使用的成员建模，运行时零影响。
 */
type RasterBand = ArrayLike<number> & {
  subarray(start: number, end: number): ArrayLike<number>;
};

const workerScope = self as unknown as TiffWorkerScope;

/** 兼容 Error 与带 message 字段的普通对象，等价于原 `err.message || fallback` */
function toErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return message ? String(message) : fallback;
}

/**
 * 计算波段统计信息
 * @param data - 像素数据
 * @param nodata - 无效值（null / undefined 表示未定义）
 * @returns {{ min: number, max: number, mean: number }}
 */
function computeStats(data: ArrayLike<number>, nodata: number | null | undefined): BandStats {
  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (nodata !== null && nodata !== undefined && v === nodata) continue;
    if (Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
  }
  return {
    min: count > 0 ? min : 0,
    max: count > 0 ? max : 0,
    mean: count > 0 ? sum / count : 0,
  };
}

/**
 * 主消息处理
 */
workerScope.onmessage = async (e) => {
  const { buffer, fileName } = e.data;
  const startTime = performance.now();

  try {
    // 解析 TIFF（纯内存操作，不涉及网络）
    const tiff = await fromArrayBuffer(buffer);
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const bandCount = image.getSamplesPerPixel();

    // 获取 nodata 值
    const nodata = image.getGDALNoData();

    // 判断是否是大文件，决定解码策略
    const isLarge = width * height * bandCount > 100 * 1024 * 1024; // >100M 像素

    let data: Float32Array[];

    if (isLarge) {
      // 大文件：分块解码，每块发送进度
      const tileWidth = Math.min(256, width);
      const tileHeight = Math.min(256, height);
      const tilesX = Math.ceil(width / tileWidth);
      const tilesY = Math.ceil(height / tileHeight);
      const totalTiles = tilesX * tilesY;

      // 预分配输出 buffer
      const pixelCount = width * height;
      const buffers: Float32Array[] = [];
      for (let b = 0; b < bandCount; b++) {
        buffers.push(new Float32Array(pixelCount));
      }

      let processedTiles = 0;

      // 逐块解码
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const x = tx * tileWidth;
          const y = ty * tileHeight;
          const w = Math.min(tileWidth, width - x);
          const h = Math.min(tileHeight, height - y);

          try {
            const tileData = (await image.readRasters({
              window: [x, y, x + w, y + h],
            })) as unknown as RasterBand[];

            // 将 tile 数据写入对应 band 的 buffer
            for (let b = 0; b < bandCount; b++) {
              const tileArr = tileData[b];
              for (let row = 0; row < h; row++) {
                const srcOffset = row * w;
                const dstOffset = (y + row) * width + x;
                buffers[b].set(tileArr.subarray(srcOffset, srcOffset + w), dstOffset);
              }
            }
          } catch (err) {
            // 某些 tile 可能读取失败，跳过
            console.warn(`[tiffWorker] tile ${tx},${ty} failed:`, toErrorMessage(err, 'unknown error'));
          }

          processedTiles++;
          // 每 50 个 tile 发一次进度
          if (processedTiles % 50 === 0) {
            workerScope.postMessage({
              type: 'progress',
              fileName,
              progress: Math.round((processedTiles / totalTiles) * 100),
              phase: 'decoding',
            });
          }
        }
      }

      data = buffers;
    } else {
      // 小文件：一次性解码
      const rasterData = (await image.readRasters()) as unknown as RasterBand[];
      data = [];
      for (let b = 0; b < bandCount; b++) {
        // 转为 Float32 以统一处理
        data.push(new Float32Array(rasterData[b]));
      }
    }

    // 计算统计信息
    const stats: BandStats[] = [];
    for (let b = 0; b < bandCount; b++) {
      stats.push(computeStats(data[b], nodata));
    }

    const elapsed = Math.round(performance.now() - startTime);

    // 构建 transferable 数组（零拷贝传递）
    const transferables: Transferable[] = data.map((arr) => arr.buffer as ArrayBuffer);

    workerScope.postMessage(
      {
        type: 'complete',
        fileName,
        width,
        height,
        bandCount,
        dataType: 'Float32',
        data,
        nodata,
        stats,
        elapsed,
      },
      transferables
    );
  } catch (err) {
    workerScope.postMessage({
      type: 'error',
      fileName,
      error: toErrorMessage(err, 'TIFF decode failed'),
    });
  }
};
