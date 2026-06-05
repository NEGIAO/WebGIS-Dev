/**
 * tiffWorker.js
 * TIF/GeoTIFF 解码 Web Worker
 * 将 geotiff.js 的解析+解码从主线程移到 Worker，避免大文件阻塞 UI
 *
 * 输入：{ buffer: ArrayBuffer, fileName: string }
 * 输出：{ fileName, width, height, bandCount, dataType, data, nodata, stats }
 * data 通过 Transferable 零拷贝传递
 */
import GeoTIFF from 'geotiff';

/**
 * 计算波段统计信息
 * @param {TypedArray} data - 像素数据
 * @param {number} nodata - 无效值
 * @returns {{ min: number, max: number, mean: number }}
 */
function computeStats(data, nodata) {
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
self.onmessage = async (e) => {
  const { buffer, fileName } = e.data;
  const startTime = performance.now();

  try {
    // 解析 TIFF（纯内存操作，不涉及网络）
    const tiff = await GeoTIFF.fromArrayBuffer(buffer);
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const bandCount = image.getSamplesPerPixel();

    // 获取 nodata 值
    const nodata = image.getGDALNoData();

    // 判断是否是大文件，决定解码策略
    const isLarge = width * height * bandCount > 100 * 1024 * 1024; // >100M 像素

    let data;

    if (isLarge) {
      // 大文件：分块解码，每块发送进度
      const tileWidth = Math.min(256, width);
      const tileHeight = Math.min(256, height);
      const tilesX = Math.ceil(width / tileWidth);
      const tilesY = Math.ceil(height / tileHeight);
      const totalTiles = tilesX * tilesY;

      // 预分配输出 buffer
      const pixelCount = width * height;
      const buffers = [];
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
            const tileData = await image.readRasters({
              window: [x, y, x + w, y + h],
            });

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
            console.warn(`[tiffWorker] tile ${tx},${ty} failed:`, err.message);
          }

          processedTiles++;
          // 每 50 个 tile 发一次进度
          if (processedTiles % 50 === 0) {
            self.postMessage({
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
      const rasterData = await image.readRasters();
      data = [];
      for (let b = 0; b < bandCount; b++) {
        // 转为 Float32 以统一处理
        data.push(new Float32Array(rasterData[b]));
      }
    }

    // 计算统计信息
    const stats = [];
    for (let b = 0; b < bandCount; b++) {
      stats.push(computeStats(data[b], nodata));
    }

    const elapsed = Math.round(performance.now() - startTime);

    // 构建 transferable 数组（零拷贝传递）
    const transferables = data.map((arr) => arr.buffer);

    self.postMessage(
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
    self.postMessage({
      type: 'error',
      fileName,
      error: err.message || 'TIFF decode failed',
    });
  }
};
