/**
 * tifUtils.js
 * TIF/GeoTIFF 工具函数
 * 封装 TIF 文件的 Worker 解码、图层创建、样式生成等逻辑
 */
import { fromBlob, Pool } from 'geotiff';
import DataTileSource from 'ol/source/DataTile.js';
import WebGLTileLayer from 'ol/layer/WebGLTile.js';
import GeoTIFF from 'ol/source/GeoTIFF.js';

/** 文件大小阈值：50MB，超过此大小走 Worker 路径 */
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

/**
 * 判断是否为大文件
 * @param {File} file - 文件对象
 * @param {number} [threshold] - 自定义阈值（字节）
 * @returns {boolean}
 */
export function isLargeFile(file, threshold = LARGE_FILE_THRESHOLD) {
  return file.size > threshold;
}

/**
 * 用 Worker 解码 TIF 文件（大文件路径）
 * @param {File} file - TIF 文件对象
 * @param {function} onProgress - 进度回调 (progress: number, phase: string) => void
 * @returns {Promise<{ width, height, bandCount, data, nodata, stats }>}
 */
export function loadTifInWorker(file, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/tiffWorker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.progress, msg.phase);
      } else if (msg.type === 'complete') {
        worker.terminate();
        resolve({
          width: msg.width,
          height: msg.height,
          bandCount: msg.bandCount,
          data: msg.data,
          nodata: msg.nodata,
          stats: msg.stats,
          elapsed: msg.elapsed,
        });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'TIF Worker error'));
    };

    // 读取文件为 ArrayBuffer 后发送给 Worker（Transferable 零拷贝）
    file
      .arrayBuffer()
      .then((buffer) => {
        worker.postMessage({ buffer, fileName: file.name }, [buffer]);
      })
      .catch(reject);
  });
}

/**
 * 直接在主线程用 geotiff.js 解码（小文件路径）
 * @param {File} file - TIF 文件对象
 * @returns {Promise<{ width, height, bandCount, data, nodata, stats }>}
 */
export async function loadTifDirect(file) {
  const tiff = await fromBlob(file);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const bandCount = image.getSamplesPerPixel();
  const nodata = image.getGDALNoData();

  // 使用 Pool 并行解码
  const pool = new Pool(navigator.hardwareConcurrency || 4);
  const rasterData = await image.readRasters({ pool });
  pool.destroy?.();

  const data = [];
  for (let b = 0; b < bandCount; b++) {
    data.push(new Float32Array(rasterData[b]));
  }

  // 统计信息
  const stats = data.map((band) => {
    let min = Infinity, max = -Infinity, sum = 0, count = 0;
    for (let i = 0; i < band.length; i++) {
      const v = band[i];
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
  });

  return { width, height, bandCount, data, nodata, stats };
}

/**
 * 根据波段数生成默认 TIF 渲染样式
 * @param {number} bandCount - 波段数
 * @param {Array} stats - 各波段统计 [{ min, max, mean }]
 * @returns {object|null} OL WebGLTile 样式对象，null 表示使用默认样式
 */
export function getDefaultTifStyle(bandCount, stats) {
  if (!stats || stats.length === 0) return null;

  if (bandCount >= 3) {
    // RGB 三波段
    return {
      color: [
        'array',
        ['band', 1],
        ['band', 2],
        ['band', 3],
        ['band', 1],
      ],
      exposure: ['array', 1, 1, 1, 1],
    };
  } else if (bandCount === 1) {
    // 单波段灰度
    const min = stats[0]?.min ?? 0;
    const max = stats[0]?.max ?? 255;
    if (max > min) {
      return {
        color: [
          'interpolate',
          ['linear'],
          ['band', 1],
          min, [0, 0, 0, 1],
          max, [255, 255, 255, 1],
        ],
      };
    }
  }

  return null;
}

/**
 * 根据解码数据创建 DataTileSource + WebGLTileLayer
 * @param {object} decoded - { width, height, bandCount, data, nodata, stats }
 * @param {string} layerId - 图层 ID
 * @param {string} fileName - 文件名
 * @param {object} [customStyle] - 自定义样式
 * @returns {{ source: DataTileSource, layer: WebGLTileLayer }}
 */
export function createTIFWebGLLayer(decoded, layerId, fileName, customStyle) {
  const { width, height, bandCount, data } = decoded;

  // 将多波段数据交织为单个 TypedArray（行优先，像素交织）
  const pixelCount = width * height;
  const interleaved = new Float32Array(pixelCount * bandCount);
  for (let b = 0; b < bandCount; b++) {
    for (let i = 0; i < pixelCount; i++) {
      interleaved[i * bandCount + b] = data[b][i];
    }
  }

  // DataTileSource loader：按瓦片坐标返回数据
  const source = new DataTileSource({
    loader: (_z, _x, _y) => {
      // 简化：将整幅影像作为一个大瓦片返回
      // 对于 DataTileSource，我们直接返回交织数据
      return interleaved;
    },
    interpolate: bandCount >= 3,
    transition: 0,
  });

  const style = customStyle || getDefaultTifStyle(bandCount, decoded.stats);

  const layerConfig = {
    source,
    id: layerId,
    title: fileName,
  };
  if (style) {
    layerConfig.style = style;
  }

  const layer = new WebGLTileLayer(layerConfig);
  return { source, layer };
}

/**
 * 用 OL 原生 GeoTIFF source 创建图层（适用于 COG/远程 URL）
 * @param {string} url - GeoTIFF URL
 * @param {string} layerId - 图层 ID
 * @param {string} layerName - 图层名称
 * @returns {{ source: GeoTIFF, layer: WebGLTileLayer }}
 */
export function createRemoteGeoTIFFLayer(url, layerId, layerName) {
  const source = new GeoTIFF({
    sources: [{ url }],
    transition: 0,
    convertToRGB: true,
  });

  const layer = new WebGLTileLayer({
    source,
    id: layerId,
    title: layerName || 'Remote GeoTIFF',
  });

  return { source, layer };
}
