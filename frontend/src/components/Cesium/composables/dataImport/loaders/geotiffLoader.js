/**
 * geotiffLoader.js
 * GeoTIFF 影像加载器
 *
 * 支持单波段（高程色带）和三波段 RGB 影像。
 * 处理 EPSG:4326 / EPSG:3857 投影坐标系。
 *
 * 工具函数（ensureGeoTIFF、extractGeoTiffBbox、isGeographicBbox、detectCRS 等）
 * 统一在 ../geoTiffUtils.js 中维护，本模块仅负责 Cesium 场景加载逻辑。
 */

import {
    ensureGeoTIFF,
    extractGeoTiffBbox,
    isGeographicBbox,
    detectCRS,
    transformMercatorTo4326,
    renderSingleBandToImageData,
    renderRGBToImageData,
} from '../geoTiffUtils.js';

// ---- 主加载函数 ----

/**
 * 加载 GeoTIFF 影像数据到 Cesium
 *
 * 通过 geotiff.js 解析文件，提取地理参考信息，
 * 渲染到 canvas 后使用 SingleTileImageryProvider 添加到场景。
 * 单波段数据额外缓存原始栅格，供后续 stretchRasterToHeight 使用。
 *
 * @param {Object} ctx
 * @param {File} ctx.file
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 * @param {Map<string, object>} ctx.rasterCache - 单波段栅格数据缓存
 */
export async function loadGeoTIFF({ file, getCesium, getViewer, message, loadedDataSources, nextId, rasterCache }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const { fromArrayBuffer } = await ensureGeoTIFF();
    const buffer = await file.arrayBuffer();
    const tiff = await fromArrayBuffer(buffer);
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();
    const samplesPerPixel = image.getSamplesPerPixel();
    const isMultiBand = samplesPerPixel >= 3;

    let canvasImageData;
    let pendingEntry = null;

    if (isMultiBand) {
        const rgb = await image.readRGB({ interleave: true });
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        renderRGBToImageData(rgb, width, height, imageData);
        ctx.putImageData(imageData, 0, 0);
        canvasImageData = canvas;
    } else {
        const rasters = await image.readRasters({ samples: [0] });
        const raster = rasters[0];
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        renderSingleBandToImageData(raster, width, height, imageData);
        ctx.putImageData(imageData, 0, 0);
        canvasImageData = canvas;

        const rasterLen = width * height;
        const rawData = new Float32Array(rasterLen);
        for (let i = 0; i < rasterLen; i++) rawData[i] = raster[i];
        pendingEntry = { id: null, data: rawData, width, height, canvas: canvasImageData };
    }

    // 提取地理包围盒
    let bbox;
    try {
        bbox = extractGeoTiffBbox(image);
    } catch {
        throw new Error(
            'GeoTIFF 缺少地理参考信息（ModelTiepoint/ModelPixelScale），无法确定影像在地图上的位置。请使用包含地理参考的 GeoTIFF。',
        );
    }

    const crs = detectCRS(image, bbox);
    if (crs === '3857') {
        bbox = await transformMercatorTo4326(bbox);
    } else if (crs !== '4326') {
        throw new Error(
            `GeoTIFF 使用未知投影坐标系（包围盒: ${bbox.west.toFixed(1)}, ${bbox.south.toFixed(1)}, ${bbox.east.toFixed(1)}, ${bbox.north.toFixed(1)}），目前仅支持 EPSG:4326 和 EPSG:3857（Web Mercator）。`,
        );
    }

    if (!isGeographicBbox(bbox)) {
        throw new Error('CRS 转换后包围盒不在地理范围内，可能为不支持的投影坐标系。');
    }

    const blob = await new Promise((resolve) => canvasImageData.toBlob(resolve));
    const blobUrl = URL.createObjectURL(blob);

    const rectangle = Cesium.Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north);

    const provider = new Cesium.SingleTileImageryProvider({ url: blobUrl, rectangle });
    const layer = viewer.imageryLayers.addImageryProvider(provider);

    const id = `tif_${++nextId.current}`;
    if (pendingEntry) {
        pendingEntry.id = id;
        pendingEntry.bbox = bbox;
        rasterCache.set(id, pendingEntry);
    }

    const record = {
        id,
        name: file.name,
        type: 'tif',
        entity: layer,
        blobUrl,
        rectangle,
        samplesPerPixel,
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    viewer.camera.flyTo({ destination: rectangle, duration: 2 });

    const bandInfo = isMultiBand ? `${samplesPerPixel}波段RGB` : '单波段（可拉伸到高程）';
    message.success(`GeoTIFF "${file.name}" 加载成功（${bandInfo}）`);

    return record;
}