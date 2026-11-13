/**
 * 栅格采样与波段合成（从 useLayerDataImport 拆出）
 *
 * 覆盖：GeoTIFF 源/Worker 池的懒加载缓存、投影等价判断、栅格采样器构造、
 * 主视图范围投影、多波段合成 RGBA 画布。均为纯数据加工，不触碰图层树与 UI。
 */

import { toLonLat, transform, transformExtent, get as getProjection, equivalent } from 'ol/proj';
import { stretchToByte, isNoDataValue, isRasterUploadLayer } from '@common/data-import/rasterUtils';
import { normalizeProjectionCode } from '@common/map-view/geo/index';

/** GeoTIFF 库与 Worker 池缓存（模块级：解码器本身无状态，跨实例复用无副作用） */
let cachedGeotiffFromBlob = null;
let cachedGeoTIFFSourceCtor = null;
let cachedPool = null;

/** 大尺寸 TIF 分块处理的像素阈值（超过此值启用分块模式） */
const TIF_CHUNK_THRESHOLD = 4000000;

/** 每帧处理的像素数（分块模式下控制单帧耗时） */
const TIF_CHUNK_PIXELS_PER_FRAME = 500000;

export interface RasterSamplerDeps {
    /** 当前 OL 地图实例（ref，可能尚未就绪） */
    mapInstance: { value: any };
    /** 消息提示实例 */
    message: any;
    /** 已导入的用户图层数组 */
    userDataLayers: any[];
    /** 导入进度上报（由主入口透传，写入 GlobalLoading 文案） */
    reportImportProgress: (state?: any) => void;
}

/**
 * 创建栅格采样工具集
 * @param deps 依赖注入（见 RasterSamplerDeps）
 * @returns 采样器构造、投影换算、波段合成等函数
 */
export function createRasterSamplers({
    mapInstance,
    message,
    userDataLayers,
    reportImportProgress,
}: RasterSamplerDeps) {
    async function getGeotiffFromBlob() {
        if (!cachedGeotiffFromBlob) {
            const mod = await import('geotiff');
            cachedGeotiffFromBlob = mod.fromBlob;
        }
        return cachedGeotiffFromBlob;
    }

    /**
     * 懒加载 geotiff.js 的 fromUrl 函数（用于 URL 直传 GeoTIFFSource）
     * @returns {Function} geotiff.fromUrl
     */
    async function getGeotiffFromUrl() {
        const mod = await import('geotiff');
        return mod.fromUrl;
    }

    /**
     * 获取或创建 geotiff.js Worker Pool（多线程 TIF 解码）
     * Worker Pool 让 TIF 解压（LZW/Deflate）在后台线程执行，不阻塞 UI
     * @returns {Promise<Object|null>} Pool 实例
     */
    async function getPool() {
        if (cachedPool === null) {
            try {
                const mod = await import('geotiff');
                if (typeof mod.Pool === 'function') {
                    cachedPool = new mod.Pool();
                } else {
                    cachedPool = false; // 不支持 Pool，标记为不可用
                }
            } catch {
                cachedPool = false;
            }
        }
        return cachedPool || null;
    }

    /**
     * 懒加载 OL GeoTIFFSource 构造函数（模块级缓存）
     * @returns {Function} GeoTIFFSource constructor
     */
    async function getGeoTIFFSourceCtor() {
        if (!cachedGeoTIFFSourceCtor) {
            const mod = await import('ol/source/GeoTIFF');
            cachedGeoTIFFSourceCtor = mod.default;
        }
        return cachedGeoTIFFSourceCtor;
    }

    /**
     * 将投影输入转换为 OL Projection 对象
     * @param {string|Object|null} input - 投影代码字符串或 Projection 对象
     * @returns {Object|null} OL Projection 对象，无法解析时返回 null
     */
    function toProjectionObject(input) {
        if (!input) return null;
        if (typeof input?.getUnits === 'function') return input;
        if (typeof input === 'string') return getProjection(input);
        const normalized = normalizeProjectionCode(input);
        return normalized ? getProjection(normalized) : null;
    }

    /**
     * 判断两个投影是否等价
     * @param {string|Object} a - 投影 A
     * @param {string|Object} b - 投影 B
     * @returns {boolean} 是否等价
     */
    function isEquivalentProjection(a, b) {
        const pa = toProjectionObject(a);
        const pb = toProjectionObject(b);
        if (!pa || !pb) return false;
        return equivalent(pa, pb);
    }

    /**
     * 判断采样值是否全部为 NoData 或超出拉伸范围
     * @param {number[]} values - 各波段采样值
     * @param {number|null} nodataValue - NoData 标记值
     * @param {Object|null} stretchRange - 拉伸范围 { min, max }
     * @returns {boolean} 是否应跳过该像素
     */
    function isAllNoDataOrOutOfRange(values, nodataValue, stretchRange) {
        const stretchMin = Number.isFinite(stretchRange?.min) ? stretchRange.min : null;
        const stretchMax = Number.isFinite(stretchRange?.max) ? stretchRange.max : null;
        const outOfStretch =
            values.length === 1 &&
            Number.isFinite(stretchMin) &&
            Number.isFinite(stretchMax) &&
            Number.isFinite(values[0]) &&
            (values[0] < stretchMin || values[0] > stretchMax);
        return (
            (nodataValue !== null && values.every((v) => isNoDataValue(v, nodataValue))) ||
            outOfStretch
        );
    }

    /**
     * 通用栅格采样器工厂
     * 将坐标变换、边界检查、像素索引、NoData 判断等公共逻辑统一，
     * 通过 readPixelValues 回调抽象不同的数据源（GeoTIFF image / 预读 bands 数组）
     *
     * @param {Object} options
     * @param {number} options.width - 栅格宽度（像素）
     * @param {number} options.height - 栅格高度（像素）
     * @param {number[]} options.extent - 地理范围 [minX, minY, maxX, maxY]
     * @param {string|null} options.projection - 数据投影
     * @param {number|null} options.nodataValue - NoData 标记值
     * @param {Object|null} options.stretchRange - 拉伸范围 { min, max }
     * @param {Function} options.readPixelValues - 异步回调 (px, py) => number[]，读取指定像素的各波段值
     * @returns {Function|null} 采样函数 (mapCoordinate, mapProjection) => { values, pixel, nodataValue, allNoData }
     */
    function createRasterSampler({
        width,
        height,
        extent,
        projection,
        nodataValue = null,
        stretchRange = null,
        readPixelValues,
    }) {
        if (!width || !height || !extent || typeof readPixelValues !== 'function') return null;
        const [minX, minY, maxX, maxY] = extent;

        return async (mapCoordinate, mapProjection) => {
            let coord = mapCoordinate;
            if (projection && mapProjection && !isEquivalentProjection(projection, mapProjection)) {
                coord = transform(mapCoordinate, mapProjection, projection);
            }

            if (coord[0] < minX || coord[0] > maxX || coord[1] < minY || coord[1] > maxY) {
                return null;
            }

            const xNorm = (coord[0] - minX) / Math.max(1e-12, maxX - minX);
            const yNorm = (maxY - coord[1]) / Math.max(1e-12, maxY - minY);
            const px = Math.min(width - 1, Math.max(0, Math.floor(xNorm * width)));
            const py = Math.min(height - 1, Math.max(0, Math.floor(yNorm * height)));

            const values = await readPixelValues(px, py);
            const allNoData = isAllNoDataOrOutOfRange(values, nodataValue, stretchRange);

            return {
                values,
                pixel: [px, py],
                nodataValue,
                allNoData,
            };
        };
    }

    /**
     * 基于 GeoTIFF image 对象的采样器
     * 每次查询通过 readRasters(window) 按需读取单像素，适合大文件
     */
    function createGeoTiffSampler({ image, projection, nodataValue = null, stretchRange = null }) {
        if (!image) return null;
        const width = image.getWidth();
        const height = image.getHeight();
        const bbox = image.getBoundingBox();
        if (!bbox || bbox.length < 4) return null;

        return createRasterSampler({
            width,
            height,
            extent: bbox,
            projection,
            nodataValue,
            stretchRange,
            readPixelValues: async (px, py) => {
                const raster = await image.readRasters({ window: [px, py, px + 1, py + 1] });
                const bands = Array.isArray(raster) ? raster : [raster];
                return bands.map((band) => band?.[0]);
            },
        });
    }

    /**
     * 基于预读 bands 数组的采样器
     * 直接从内存数组索引读取，适合非地理配准 TIF 等已全量加载的场景
     */
    function createExtentRasterSampler({
        bands,
        width,
        height,
        extent,
        projection,
        nodataValue = null,
        stretchRange = null,
    }) {
        if (!bands?.length) return null;

        return createRasterSampler({
            width,
            height,
            extent,
            projection,
            nodataValue,
            stretchRange,
            readPixelValues: (px, py) => {
                const idx = py * width + px;
                return bands.map((band) => band?.[idx]);
            },
        });
    }

    /**
     * 在指定地图坐标处查询所有可见栅格图层的像元值
     * 按图层 order 倒序遍历，返回第一个有效采样结果
     * @param {number[]} mapCoordinate - 地图坐标 [x, y]
     * @returns {Promise<Object|null>} 包含图层名称、波段值等信息的对象，无结果时返回 null
     */
    async function queryRasterValueAtCoordinate(mapCoordinate) {
        if (!mapInstance.value) return null;
        const mapProjection = mapInstance.value.getView().getProjection();
        const rasterLayers = [...userDataLayers]
            .filter(
                (item) =>
                    item.visible &&
                    isRasterUploadLayer(item) &&
                    typeof item.metadata?.rasterSampler === 'function',
            )
            .sort((a, b) => (b.order ?? 0) - (a.order ?? 0));

        for (const item of rasterLayers) {
            try {
                const sampled = await item.metadata.rasterSampler(mapCoordinate, mapProjection);
                if (!sampled) continue;
                if (sampled.allNoData) continue;

                const lonlat = toLonLat(mapCoordinate);
                const payload = {
                    图层名称: item.name,
                    图层类型: '栅格',
                    像元列行: `${sampled.pixel[0]}, ${sampled.pixel[1]}`,
                    点击经度: Number(lonlat[0].toFixed(6)),
                    点击纬度: Number(lonlat[1].toFixed(6)),
                };

                sampled.values.forEach((v, idx) => {
                    const key = `波段${idx + 1}`;
                    payload[key] =
                        sampled.nodataValue !== null && isNoDataValue(v, sampled.nodataValue)
                            ? 'NoData'
                            : Number.isFinite(v)
                              ? Number(v.toFixed(6))
                              : String(v);
                });

                return payload;
            } catch (err) {
                message.warning(`Raster sample failed: ${err?.message || err}`, { duration: 3200 });
            }
        }

        return null;
    }

    /**
     * 将数据范围从源投影转换到当前地图视图投影
     * @param {number[]} extent - 源投影下的范围 [minX, minY, maxX, maxY]
     * @param {string} sourceProjection - 源投影代码
     * @returns {number[]|null} 视图投影下的范围，转换失败时返回原始范围
     */
    function projectExtentToMapView(extent, sourceProjection) {
        if (!mapInstance.value || !extent || extent.some((v) => !Number.isFinite(v))) return null;
        const viewProjection = mapInstance.value.getView().getProjection();
        if (!sourceProjection || isEquivalentProjection(sourceProjection, viewProjection)) {
            return extent;
        }
        try {
            return transformExtent(extent, sourceProjection, viewProjection);
        } catch (err) {
            message.warning(
                `Extent projection transform failed, fallback to original extent: ${err?.message || err}`,
                { duration: 3200 },
            );
            return extent;
        }
    }

    /**
     * 将波段数据转换为 RGBA 像素数组
     * 小图同步执行，大图（超过 TIF_CHUNK_THRESHOLD）分块处理以避免阻塞 UI
     *
     * @param {Object} params
     * @param {Array} params.bands - 波段数据数组
     * @param {number} params.pixelCount - 总像素数
     * @param {boolean} params.isSingleBand - 是否为单波段
     * @param {Object|null} params.singleBandStretch - 单波段拉伸参数 { min, max }
     * @param {number|null} params.stretchMin - 拉伸最小值
     * @param {number|null} params.stretchMax - 拉伸最大值
     * @param {number|null} params.nodataValue - NoData 标记值
     * @param {Array} params.bandStats - 多波段统计信息
     * @param {Object|null} params.alphaStats - Alpha 波段统计信息
     * @returns {Uint8ClampedArray} RGBA 像素数据
     */
    async function buildRgbaFromBands({
        bands,
        pixelCount,
        isSingleBand,
        singleBandStretch,
        stretchMin,
        stretchMax,
        nodataValue,
        bandStats,
        alphaStats,
    }) {
        const rgba = new Uint8ClampedArray(pixelCount * 4);
        const hasRgb = bands.length >= 3;
        const hasAlpha = bands.length >= 4;
        const useChunked = pixelCount > TIF_CHUNK_THRESHOLD;

        const processPixelRange = (start, end) => {
            for (let i = start; i < end; i++) {
                const rSrc = hasRgb ? bands[0][i] : bands[0]?.[i];
                const gSrc = hasRgb ? bands[1][i] : bands[0]?.[i];
                const bSrc = hasRgb ? bands[2][i] : bands[0]?.[i];

                let r, g, b;
                if (isSingleBand) {
                    const outsideStretch =
                        Number.isFinite(stretchMin) &&
                        Number.isFinite(stretchMax) &&
                        (rSrc < stretchMin || rSrc > stretchMax);
                    if (!Number.isFinite(rSrc) || isNoDataValue(rSrc, nodataValue) || outsideStretch) {
                        const p = i * 4;
                        rgba[p] = 0;
                        rgba[p + 1] = 0;
                        rgba[p + 2] = 0;
                        rgba[p + 3] = 0;
                        continue;
                    }
                    const v = stretchToByte(
                        rSrc,
                        singleBandStretch?.min ?? 0,
                        singleBandStretch?.max ?? 1,
                    );
                    r = v;
                    g = 255 - v;
                    b = 0;
                } else {
                    r = stretchToByte(rSrc, bandStats[0]?.min ?? 0, bandStats[0]?.max ?? 1);
                    g = stretchToByte(
                        gSrc,
                        bandStats[Math.min(1, bandStats.length - 1)]?.min ?? 0,
                        bandStats[Math.min(1, bandStats.length - 1)]?.max ?? 1,
                    );
                    b = stretchToByte(
                        bSrc,
                        bandStats[Math.min(2, bandStats.length - 1)]?.min ?? 0,
                        bandStats[Math.min(2, bandStats.length - 1)]?.max ?? 1,
                    );
                }
                const a = hasAlpha
                    ? stretchToByte(bands[3][i], alphaStats.min, alphaStats.max)
                    : 255;

                const p = i * 4;
                rgba[p] = r;
                rgba[p + 1] = g;
                rgba[p + 2] = b;
                rgba[p + 3] = a;
            }
        };

        if (!useChunked) {
            // 小图：同步处理，避免额外的异步开销
            processPixelRange(0, pixelCount);
        } else {
            // 大图：分块处理，每帧处理 TIF_CHUNK_PIXELS_PER_FRAME 个像素
            // 通过 requestAnimationFrame 让出主线程，保持 UI 响应
            let processed = 0;
            reportImportProgress({
                phase: 'rendering',
                message: `正在渲染栅格：${name}（0%）`,
            });

            while (processed < pixelCount) {
                const chunkEnd = Math.min(processed + TIF_CHUNK_PIXELS_PER_FRAME, pixelCount);
                processPixelRange(processed, chunkEnd);
                processed = chunkEnd;

                if (processed < pixelCount) {
                    // 让出主线程，允许浏览器处理 UI 更新和用户交互
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                    const pct = Math.round((processed / pixelCount) * 100);
                    reportImportProgress({
                        phase: 'rendering',
                        message: `正在渲染栅格：${name}（${pct}%）`,
                    });
                }
            }
        }

        return rgba;
    }
    return {
        getGeotiffFromBlob,
        getGeotiffFromUrl,
        getPool,
        getGeoTIFFSourceCtor,
        toProjectionObject,
        isEquivalentProjection,
        isAllNoDataOrOutOfRange,
        createRasterSampler,
        createGeoTiffSampler,
        createExtentRasterSampler,
        queryRasterValueAtCoordinate,
        projectExtentToMapView,
        buildRgbaFromBands,
    };
}
