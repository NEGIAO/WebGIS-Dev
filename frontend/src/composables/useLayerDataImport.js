import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import {
    equivalent,
    fromLonLat,
    get as getProjection,
    toLonLat,
    transform,
    transformExtent,
} from 'ol/proj';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import ImageLayer from 'ol/layer/Image';
import ImageStatic from 'ol/source/ImageStatic';
import {
    detectGeoJSONProjection,
    detectProjectionFromKmlText,
    ensureProjectionAvailable,
    isUnsupportedProjectedCrsError,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
    normalizeProjectionCode,
} from '../utils/geo';
import { parseShpPartsToGeoJSON } from '../utils/io';
import { applyKmlStylesToFeatures } from '../utils/gis/parsers/kmlStyleParser';
import { createStandardItem } from './map/toc/factory';
import { useGisLoader } from './useGisLoader';
import { useMessage } from './useMessage';
import {
    getBandMinMax,
    stretchToByte,
    isNoDataValue,
    computePercentileStretch,
    inferFallbackNoDataValue,
    isRasterUploadLayer,
    isTiffType,
    decodeTextContent,
    getNormalizedUploadType,
    getLayerNameFromEntry,
    pickFeatureLabelField,
    renderBandsToCanvas,
} from './dataImport';

/** 栅格图层默认 z-index，确保栅格在矢量之下 */
const RASTER_LAYER_Z_INDEX = 120;

/** 地图 fit 动画时的边距（像素） */
const FIT_PADDING = [50, 50, 50, 50];

/** 地图 fit 动画最大缩放级别 */
const FIT_MAX_ZOOM = 18;

/** 地图 fit 动画持续时间（毫秒） */
const FIT_DURATION_LONG = 900;
const FIT_DURATION_SHORT = 700;

/** 大尺寸 TIF 分块处理的像素阈值（超过此值启用分块模式） */
const TIF_CHUNK_THRESHOLD = 4000000;

/** 每帧处理的像素数（分块模式下控制单帧耗时） */
const TIF_CHUNK_PIXELS_PER_FRAME = 500000;

export function useLayerDataImport({
    mapInstance,
    initialView,
    userDataLayers,
    addManagedLayerRecord,
    createManagedVectorLayer,
    styleTemplates,
    onImportProgress = null,
}) {
    let cachedGeotiffFromBlob = null;
    let cachedGeoTIFFSourceCtor = null;
    let cachedPool = null; // geotiff.js Worker Pool（多线程解码）
    const gisInlet = useGisLoader();
    const message = useMessage();

    /**
     * 从样式库中随机选择一个样式，用于增强多个导入数据的视觉区分度
     * @returns {Object} 随机选择的样式配置对象
     */
    function getRandomStyle() {
        const styleKeys = Object.keys(styleTemplates);
        if (styleKeys.length === 0) return styleTemplates.classic;
        const randomKey = styleKeys[Math.floor(Math.random() * styleKeys.length)];
        return styleTemplates[randomKey];
    }

    /**
     * 构建标准化的图层 TOC 条目
     * @param {Object} params
     * @param {string} params.id - 图层 ID
     * @param {string} params.name - 图层名称
     * @param {string} params.layerType - 图层类型（geojson/kml/shp/tif 等）
     * @param {string} params.sourceType - 数据来源（upload/shared 等）
     * @param {number} params.featureCount - 要素数量
     * @param {Object|null} params.packet - 原始数据包
     * @param {Object|null} params.metadata - 附加元数据
     * @param {Object|null} params.capabilities - 图层能力描述
     * @returns {Object} 标准化 TOC 条目对象
     */
    function buildStandardLayerItem({
        id = '',
        name = '',
        layerType = 'geojson',
        sourceType = 'upload',
        featureCount = 0,
        packet = null,
        metadata = null,
        capabilities = null,
    }) {
        return createStandardItem({
            id,
            name,
            layerType,
            sourceType,
            featureCount,
            parsedData: packet,
            metadata,
            capabilities,
        });
    }

    /**
     * 懒加载 geotiff 库的 fromBlob 函数（模块级缓存）
     * @returns {Function} geotiff.fromBlob
     */
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

    async function createNonGeorefTiffLayer({
        blob,
        name,
        type,
        sourceType,
        fitView = false,
        imageExtent = null,
        projection = null,
        alertMessage = '该 TIF 未检测到坐标参考，已按当前视图中心临时加载。',
        metadata = { noGeorefFallback: true },
        nodataValue = null,
        stretchRange = null,
        packet = null,
    }) {
        if (!mapInstance.value) return null;

        const geotiffFromBlob = await getGeotiffFromBlob();
        const pool = await getPool();
        const tiff = await geotiffFromBlob(blob);
        const image = await tiff.getImage();
        const width = image.getWidth();
        const height = image.getHeight();

        // 使用 Worker Pool 多线程解码 TIF（LZW/Deflate 解压在后台线程执行）
        const readOpts = pool ? { pool } : {};
        const rasters = await image.readRasters(readOpts);

        const bands = Array.isArray(rasters) ? rasters : [rasters];
        const bandStats = bands.slice(0, 3).map(getBandMinMax);
        const alphaStats = bands.length >= 4 ? getBandMinMax(bands[3]) : null;
        const isSingleBand = bands.length === 1;
        const singleBandStretch =
            stretchRange && Number.isFinite(stretchRange.min) && Number.isFinite(stretchRange.max)
                ? stretchRange
                : isSingleBand
                  ? computePercentileStretch(bands[0], nodataValue)
                  : null;
        const stretchMin = Number.isFinite(singleBandStretch?.min) ? singleBandStretch.min : null;
        const stretchMax = Number.isFinite(singleBandStretch?.max) ? singleBandStretch.max : null;

        const pixelCount = width * height;

        // 渲染策略：
        // - 多波段（3/4 波段）：WebGL 着色器，原始数据直接上传 GPU，着色器做全部拉伸
        // - 单波段：CPU 循环已足够快（<100ms），WebGL 纹理上传开销反而更大
        let canvas;
        let pngBlob;

        if (!isSingleBand && bands.length >= 3) {
            canvas = renderBandsToCanvas({
                bands,
                width,
                height,
                bandStats,
                alphaStats,
            });
        }

        if (canvas) {
            pngBlob = await new Promise((resolve, reject) => {
                canvas.toBlob((out) => {
                    if (out) resolve(out);
                    else reject(new Error('无法生成影像预览'));
                }, 'image/png');
            });
            canvas.width = 0;
            canvas.height = 0;
        } else {
            // CPU 回退路径（单波段 或 WebGL 不可用）
            const rgba = await buildRgbaFromBands({
                bands,
                pixelCount,
                isSingleBand,
                singleBandStretch,
                stretchMin,
                stretchMax,
                nodataValue,
                bandStats,
                alphaStats,
            });

            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建画布渲染上下文');
            ctx.putImageData(new ImageData(rgba, width, height), 0, 0);

            pngBlob = await new Promise((resolve, reject) => {
                canvas.toBlob((out) => {
                    if (out) resolve(out);
                    else reject(new Error('无法生成影像预览'));
                }, 'image/png');
            });

            ctx.clearRect(0, 0, width, height);
            canvas.width = 0;
            canvas.height = 0;
        }

        const pngUrl = URL.createObjectURL(pngBlob);

        const view = mapInstance.value.getView();
        const layerProjection = projection || view.getProjection();
        const center = view.getCenter() || fromLonLat(initialView.center);
        const resolution = view.getResolution() || 1;
        const extent =
            imageExtent && imageExtent.every((v) => Number.isFinite(v))
                ? imageExtent
                : [
                      center[0] - (width * resolution) / 2,
                      center[1] - (height * resolution) / 2,
                      center[0] + (width * resolution) / 2,
                      center[1] + (height * resolution) / 2,
                  ];

        const imageSource = new ImageStatic({
            url: pngUrl,
            imageExtent: extent,
            projection: layerProjection,
        });
        // Revoke the Blob URL once the image has been loaded to free memory
        imageSource.once('imageloadend', () => {
            URL.revokeObjectURL(pngUrl);
        });
        imageSource.once('imageloaderror', () => {
            URL.revokeObjectURL(pngUrl);
        });

        const layer = new ImageLayer({
            source: imageSource,
            zIndex: RASTER_LAYER_Z_INDEX,
            properties: { name },
        });

        mapInstance.value.addLayer(layer);
        const rasterSampler = createExtentRasterSampler({
            bands,
            width,
            height,
            extent,
            projection: layerProjection,
            nodataValue,
            stretchRange: isSingleBand ? singleBandStretch : null,
        });
        const standardTocItem = buildStandardLayerItem({
            name,
            layerType: type || 'tif',
            sourceType,
            featureCount: 1,
            packet,
            metadata: {
                sourceProjection: layerProjection,
                sourceExtent: extent,
            },
        });
        const id = addManagedLayerRecord({
            name,
            type,
            sourceType,
            featureCount: 1,
            styleConfig: null,
            metadata: {
                ...(metadata || {}),
                standardTocItem,
                rasterSampler,
                rasterBandCount: bands.length,
                stretchRange: isSingleBand ? singleBandStretch : null,
                sourceProjection: layerProjection,
                sourceExtent: extent,
            },
            layer,
        });

        if (fitView) {
            const fitExtent = projectExtentToMapView(extent, layerProjection) || extent;
            mapInstance.value.getView().fit(fitExtent, {
                padding: FIT_PADDING,
                duration: FIT_DURATION_SHORT,
                maxZoom: FIT_MAX_ZOOM,
            });
        }

        if (alertMessage) {
            message.warning(alertMessage, { duration: 5200 });
        }
        return id;
    }

    /**
     * 创建受管理的栅格图层
     *
     * 两种加载模式：
     * - URL 模式：GeoTIFFSource 直接从 URL 按需加载瓦片，支持 Range Requests
     * - Blob 模式（上传）：将 ArrayBuffer 转为 Blob 传给 GeoTIFFSource
     *
     * 自动检测地理配准：有坐标参考使用 WebGLTileLayer（GPU 加速），
     * 无坐标参考降级为 ImageLayer（WebGL 着色器渲染）
     *
     * @param {Object} params
     * @param {string} params.name - 图层名称
     * @param {string} params.type - 数据类型（tif/tiff）
     * @param {string} params.sourceType - 数据来源（upload/shared）
     * @param {ArrayBuffer|null} [params.data=null] - TIFF ArrayBuffer（上传模式）
     * @param {string|null} [params.url=null] - TIFF URL（URL 模式，支持 Range Requests）
     * @param {boolean} [params.fitView=false] - 是否自动缩放到图层范围
     * @param {Object|null} [params.packet=null] - 原始数据包
     * @returns {Promise<string|null>} 图层 ID，失败时返回 null
     */
    async function createManagedRasterLayer({
        name,
        type,
        sourceType,
        data = null,
        url = null,
        fitView = false,
        packet = null,
    }) {
        if (!mapInstance.value) return null;
        if (!url && !(data instanceof ArrayBuffer)) return null;

        const GeoTIFFSource = await getGeoTIFFSourceCtor();
        const pool = await getPool();

        // 阶段 1：读取元数据（波段数、NoData、单波段拉伸参数）
        // URL 模式使用 fromUrl（仅读元数据，不下载全部像素）
        // Blob 模式使用 fromBlob
        // 使用 Worker Pool 在后台线程解码，不阻塞 UI
        let sampleBandCount = 0;
        let nodataValue = null;
        let singleBandStretch = null;
        let firstImageRef = null;
        let blob = null;
        try {
            let tiff;
            if (url) {
                const fromUrl = await getGeotiffFromUrl();
                tiff = await fromUrl(url);
            } else {
                blob = new Blob([data], { type: 'image/tiff' });
                const fromBlob = await getGeotiffFromBlob();
                tiff = await fromBlob(blob);
            }
            const firstImage = await tiff.getImage();
            firstImageRef = firstImage;
            sampleBandCount = Number(
                firstImage?.getSamplesPerPixel?.() ??
                    firstImage?.fileDirectory?.SamplesPerPixel ??
                    0,
            );
            const nd = firstImage?.getGDALNoData?.();
            nodataValue = Number.isFinite(nd) ? nd : null;

            // 单波段：仅读取第一个波段的采样数据计算拉伸参数
            if (sampleBandCount === 1) {
                const readOpts = { samples: [0], interleave: true };
                if (pool) readOpts.pool = pool;
                const singleBandData = await firstImage.readRasters(readOpts);
                nodataValue = inferFallbackNoDataValue(singleBandData, nodataValue);
                singleBandStretch = computePercentileStretch(singleBandData, nodataValue, 2, 98);
            }
        } catch (_e) {
            sampleBandCount = 0;
            nodataValue = null;
            singleBandStretch = null;
        }

        // 阶段 2：创建 GeoTIFFSource
        // URL 模式：直接传 URL，OL 通过 Range Requests 按需加载瓦片
        // Blob 模式：传 Blob，OL 在内存中按需读取
        const sourceOpts = {};
        if (sampleBandCount === 1 && nodataValue !== null) {
            sourceOpts.nodata = nodataValue;
        }
        if (url) {
            sourceOpts.url = url;
        } else {
            sourceOpts.blob = blob || new Blob([data], { type: 'image/tiff' });
        }
        const source = new GeoTIFFSource({
            convertToRGB: 'auto',
            normalize: sampleBandCount === 1 ? false : undefined,
            sources: [sourceOpts],
            maximumConnections: 6,
        });

        let viewCfg = null;
        let hasGeorefExtent = false;
        try {
            viewCfg = await source.getView();
            hasGeorefExtent = !!(
                viewCfg?.extent && viewCfg.extent.every((v) => Number.isFinite(v))
            );
        } catch (_e) {
            hasGeorefExtent = false;
        }

        if (!hasGeorefExtent) {
            return createNonGeorefTiffLayer({
                blob,
                name,
                type,
                sourceType,
                fitView,
                alertMessage:
                    sampleBandCount === 1
                        ? '该 TIF 为单波段且未检测到坐标参考，已按当前视图中心临时加载。'
                        : '该 TIF 未检测到坐标参考，已按当前视图中心临时加载。',
                metadata: {
                    noGeorefFallback: true,
                    singleBandRendered: sampleBandCount === 1,
                },
                nodataValue,
                stretchRange: singleBandStretch,
                packet,
            });
        }

        const sourceProjection = await resolveSupportedProjection(
            viewCfg?.projection,
            'EPSG:4326',
            'GeoTIFF',
        );

        const layerOptions = {
            source,
            zIndex: RASTER_LAYER_Z_INDEX,
            properties: { name },
        };
        if (sampleBandCount === 1) {
            const minVal = Number.isFinite(singleBandStretch?.min) ? singleBandStretch.min : 0;
            const maxVal = Number.isFinite(singleBandStretch?.max) ? singleBandStretch.max : 1;
            const midVal = (minVal + maxVal) / 2;
            const baseColorExpr = [
                'interpolate',
                ['linear'],
                ['band', 1],
                minVal,
                ['color', 32, 164, 72, 1],
                midVal,
                ['color', 254, 224, 139, 1],
                maxVal,
                ['color', 215, 25, 28, 1],
            ];
            const transparentExpr = ['color', 0, 0, 0, 0];
            const maskedConditions = [
                ['<', ['band', 1], minVal],
                ['>', ['band', 1], maxVal],
            ];
            if (nodataValue !== null) {
                maskedConditions.unshift(['==', ['band', 1], nodataValue]);
            }
            layerOptions.style = {
                color: ['case', ['any', ...maskedConditions], transparentExpr, baseColorExpr],
            };
        }

        const layer = new WebGLTileLayer(layerOptions);

        mapInstance.value.addLayer(layer);
        const rasterSampler = createGeoTiffSampler({
            image: firstImageRef,
            projection: sourceProjection,
            nodataValue,
            stretchRange: sampleBandCount === 1 ? singleBandStretch : null,
        });
        const standardTocItem = buildStandardLayerItem({
            name,
            layerType: type || 'tif',
            sourceType,
            featureCount: 1,
            packet,
            metadata: {
                sourceProjection,
                sourceExtent: viewCfg?.extent,
            },
        });
        const id = addManagedLayerRecord({
            name,
            type,
            sourceType,
            featureCount: 1,
            styleConfig: null,
            metadata: {
                standardTocItem,
                rasterSampler,
                rasterBandCount: sampleBandCount,
                nodataValue,
                stretchRange: sampleBandCount === 1 ? singleBandStretch : null,
                sourceProjection,
                sourceExtent: viewCfg?.extent,
            },
            layer,
        });

        if (fitView && mapInstance.value) {
            const fitExtent =
                projectExtentToMapView(viewCfg.extent, sourceProjection) || viewCfg.extent;
            mapInstance.value.getView().fit(fitExtent, {
                padding: FIT_PADDING,
                duration: FIT_DURATION_LONG,
                maxZoom: FIT_MAX_ZOOM,
            });
        }

        return id;
    }

    async function resolveSupportedProjection(
        rawProjection,
        fallbackProjection = 'EPSG:4326',
        label = '数据',
    ) {
        const normalized = normalizeProjectionCode(rawProjection);
        if (!normalized) return fallbackProjection;

        const supported = await ensureProjectionAvailable(normalized);
        if (supported) return supported;

        throw new Error(
            `${label}坐标系 ${normalized} 当前不支持，请提供可识别 EPSG 定义或先转换为 EPSG:4326 / EPSG:3857。`,
        );
    }

    function reportImportProgress(state = {}) {
        if (typeof onImportProgress !== 'function') return;
        onImportProgress({
            phase: 'idle',
            total: 0,
            current: 0,
            success: 0,
            failed: 0,
            message: '',
            warnings: 0,
            errors: 0,
            timestamp: Date.now(),
            ...state,
        });
    }


    /**
     * 归一化 KML 文本中的 kml: 前缀命名空间
     * 某些 KML 文件使用 <kml:Placemark> 等带前缀的标签，需移除前缀以确保样式解析器正确匹配
     * @param {string} kmlText - 原始 KML 文本
     * @returns {string} 归一化后的 KML 文本
     */
    function normalizeKmlNamespace(kmlText) {
        if (/<\s*\/?\s*kml:/i.test(kmlText)) {
            return String(kmlText)
                .replace(/<(\/?)(\s*)kml:/gi, '<$1$2')
                .replace(/\s+xmlns:kml\s*=\s*(['"]).*?\1/gi, '');
        }
        return kmlText;
    }

    /**
     * 对已解析的 features 应用 KML 样式（PolyStyle、LineStyle、IconStyle）
     * 并清除 extractStyles:false 产生的无效样式（空数组、undefined 等）
     * @param {Array} features - OL Feature 数组
     * @param {string} kmlTextForStyle - 用于样式解析的 KML 文本
     * @param {string} label - 日志标签
     */
    function applyKmlStylesAndCleanup(features, kmlTextForStyle, label = 'KML') {
        if (!features || features.length === 0) return;

        try {
            const styleResult = applyKmlStylesToFeatures(features, kmlTextForStyle);
            if (styleResult.successCount > 0) {
                console.warn(
                    `[${label}样式] 成功应用 ${styleResult.successCount}/${features.length} 个特征的样式`
                );
            }
            if (styleResult.errors.length > 0) {
                console.warn(`[${label}样式] 部分样式应用失败:`, styleResult.errors);
            }
        } catch (err) {
            console.error(`[${label}样式] 样式应用异常:`, err);
        }

        // 兜底：清除 extractStyles:false 产生的无效样式，确保图层样式函数能正确接管渲染
        for (const feature of features) {
            const s = feature.getStyle();
            if (!s || (Array.isArray(s) && s.length === 0)) {
                feature.setStyle(null);
            }
        }
    }

    /**
     * 解析 KML 文本为 features，并应用 KML 中定义的样式
     * 支持 PolyStyle、LineStyle、IconStyle 等样式元素
     *
     * @param {string} kmlText - KML 文本内容
     * @param {string} label - 日志标签（默认 'KML'）
     * @param {string|null} explicitProjection - 显式指定的数据投影，null 则自动检测
     * @returns {Promise<Array>} OL Feature 数组
     */
    async function parseKmlTextToFeatures(kmlText, label = 'KML', explicitProjection = null) {
        const rawProjection = explicitProjection || detectProjectionFromKmlText(kmlText);
        const dataProjection = await resolveSupportedProjection(
            rawProjection,
            'EPSG:4326',
            label,
        );
        const kmlFormat = new KML({ extractStyles: false });
        let features = kmlFormat.readFeatures(kmlText, {
            dataProjection,
            featureProjection: 'EPSG:3857',
        });

        // 归一化 kml: 前缀，仅在首次解析失败时用归一化文本重试
        let kmlTextForStyle = kmlText;
        if (/<\s*\/?\s*kml:/i.test(kmlText)) {
            kmlTextForStyle = normalizeKmlNamespace(kmlText);
            if (!features || !features.length) {
                features = kmlFormat.readFeatures(kmlTextForStyle, {
                    dataProjection,
                    featureProjection: 'EPSG:3857',
                });
            }
        }

        applyKmlStylesAndCleanup(features, kmlTextForStyle, label);
        return features;
    }

    async function parseUploadedFeatures({ content, type, name = '' }) {
        const normalizedType = getNormalizedUploadType(type, name);

        if (normalizedType === 'kml') {
            const kmlText = decodeTextContent(content);
            return parseKmlTextToFeatures(kmlText, 'KML');
        }

        if (normalizedType === 'kmz' || normalizedType === 'zip') {
            const dispatched = await gisInlet.dispatch({ content, type: normalizedType, name });
            const vectorPacket = (dispatched.packets || []).find(
                (item) => item.kind === 'kml' || item.kind === 'geojson' || item.kind === 'shp',
            );

            if (!vectorPacket) {
                throw new Error('压缩包中未找到可用矢量数据');
            }

            if (vectorPacket.kind === 'kml') {
                return parseKmlTextToFeatures(
                    vectorPacket.kmlString,
                    normalizedType === 'kmz' ? 'KMZ/KML' : 'ZIP/KML',
                    vectorPacket.dataProjection || 'EPSG:4326',
                );
            }

            if (vectorPacket.kind === 'shp') {
                const geojson = await parseShpPartsToGeoJSON(vectorPacket.shpParts);
                const gjFormat = new GeoJSON();
                const featureCollection = Array.isArray(geojson)
                    ? {
                          type: 'FeatureCollection',
                          features: geojson.flatMap((item) => item.features || []),
                      }
                    : geojson;
                return gjFormat.readFeatures(featureCollection, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857',
                });
            }

            if (vectorPacket.kind === 'geojson') {
                const geojsonData = vectorPacket.geojsonData;
                const dataProjection = await resolveSupportedProjection(
                    vectorPacket.dataProjection || 'EPSG:4326',
                    'EPSG:4326',
                    'GeoJSON',
                );
                const gjFormat = new GeoJSON();
                return gjFormat.readFeatures(geojsonData, {
                    dataProjection,
                    featureProjection: 'EPSG:3857',
                });
            }

            throw new Error('不支持的文件格式：压缩包中未找到可用矢量数据');
        }

        if (normalizedType === 'geojson' || normalizedType === 'json') {
            const geojsonData = typeof content === 'string' ? JSON.parse(content) : content;
            const detectedProjection = detectGeoJSONProjection(geojsonData);
            const dataProjection = await resolveSupportedProjection(
                detectedProjection,
                'EPSG:4326',
                'GeoJSON',
            );
            const gjFormat = new GeoJSON();
            return gjFormat.readFeatures(geojsonData, {
                dataProjection,
                featureProjection: 'EPSG:3857',
            });
        }

        if (normalizedType === 'shp') {
            console.warn(
                '[SHP] 检测到单个 .shp 文件上传，属性信息可能不完整。\n' +
                '建议：请将 .shp, .dbf, .shx, .prj, .cpg 等同名文件一起上传或打包成 ZIP。'
            );
            const geojson = await parseShpPartsToGeoJSON({ shp: content });
            const gjFormat = new GeoJSON();
            const detectedProjection = detectGeoJSONProjection(geojson);
            const dataProjection = await resolveSupportedProjection(
                detectedProjection,
                'EPSG:4326',
                'SHP',
            );
            return gjFormat.readFeatures(geojson, {
                dataProjection,
                featureProjection: 'EPSG:3857',
            });
        }

        throw new Error(`不支持的文件类型: ${normalizedType || type}`);
    }

    async function importDispatchedPackets(dispatched, normalizedType, name, batchLabel) {
        const packets = Array.isArray(dispatched.packets)
            ? dispatched.packets
            : dispatched.packet
              ? [dispatched.packet]
              : [];

        const detectedCount = Number(dispatched?.summary?.detectedDatasets ?? packets.length);
        message.info(`已识别到 ${detectedCount} 个数据集，正在同步导入...`);

        if (!packets.length) {
            throw new Error('未找到可用 GIS 数据');
        }

        const importErrors = [];
        let importedCount = 0;
        const total = packets.length;
        let unsupportedProjectionDetected = false;

        reportImportProgress({
            phase: 'importing',
            total,
            current: 0,
            success: 0,
            failed: 0,
            warnings: Array.isArray(dispatched.warnings) ? dispatched.warnings.length : 0,
            errors: Array.isArray(dispatched.errors) ? dispatched.errors.length : 0,
            message: `准备导入 ${total} 个数据集...`,
        });

        for (const packet of packets) {
            try {
                const layerName = getLayerNameFromEntry(packet.entryName, name || '上传图层');

                if (packet.kind === 'tiff') {
                    await createManagedRasterLayer({
                        name: layerName,
                        type: 'tiff',
                        sourceType: 'upload',
                        data: packet.arrayBuffer,
                        fitView: importedCount === 0,
                        packet,
                    });
                    importedCount += 1;
                    continue;
                }

                let features = [];
                let layerType = packet.kind;

                if (packet.kind === 'kml') {
                    features = await parseKmlTextToFeatures(
                        packet.kmlString,
                        normalizedType === 'kmz' ? 'KMZ/KML' : 'ZIP/KML',
                        packet.dataProjection || 'EPSG:4326',
                    );
                    layerType = normalizedType === 'kmz' ? 'kmz' : 'kml';
                } else if (packet.kind === 'geojson') {
                    const dataProjection = await resolveSupportedProjection(
                        packet.dataProjection || 'EPSG:4326',
                        'EPSG:4326',
                        'GeoJSON',
                    );
                    const gjFormat = new GeoJSON();
                    features = gjFormat.readFeatures(packet.geojsonData, {
                        dataProjection,
                        featureProjection: 'EPSG:3857',
                    });
                    layerType = 'geojson';
                } else if (packet.kind === 'shp') {
                    const geojson = await parseShpPartsToGeoJSON(packet.shpParts);
                    const gjFormat = new GeoJSON();
                    const featureCollection = Array.isArray(geojson)
                        ? {
                              type: 'FeatureCollection',
                              features: geojson.flatMap((item) => item.features || []),
                          }
                        : geojson;
                    features = gjFormat.readFeatures(featureCollection, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: 'EPSG:3857',
                    });
                    layerType = 'shp';
                } else {
                    throw new Error(`不支持的 packet 类型: ${packet.kind}`);
                }

                if (!features.length) throw new Error('无有效要素');

                const labelField = pickFeatureLabelField(features);
                const standardTocItem = buildStandardLayerItem({
                    name: layerName,
                    layerType,
                    sourceType: 'upload',
                    featureCount: features.length,
                    packet,
                    metadata: {
                        labelField,
                        dispatchEntry: packet.entryName || '',
                    },
                });
                await createManagedVectorLayer({
                    name: layerName,
                    type: layerType,
                    sourceType: 'upload',
                    features,
                    styleConfig: getRandomStyle(),
                    autoLabel: true,
                    metadata: {
                        labelField,
                        dispatchEntry: packet.entryName || '',
                        standardTocItem,
                    },
                    fitView: importedCount === 0,
                });

                importedCount += 1;
                reportImportProgress({
                    phase: 'importing',
                    total,
                    current: importedCount + importErrors.length,
                    success: importedCount,
                    failed: importErrors.length,
                    warnings: Array.isArray(dispatched.warnings) ? dispatched.warnings.length : 0,
                    errors:
                        (Array.isArray(dispatched.errors) ? dispatched.errors.length : 0) +
                        importErrors.length,
                    message: `已导入：${layerName}`,
                });
            } catch (err) {
                if (isUnsupportedProjectedCrsError(err) && !unsupportedProjectionDetected) {
                    unsupportedProjectionDetected = true;
                    if (!err?.notified) {
                        message.error(UNSUPPORTED_PROJECTED_CRS_MESSAGE, {
                            closable: true,
                            duration: 0,
                        });
                    }
                }
                importErrors.push(`${packet.entryName || packet.kind}: ${err.message}`);
                reportImportProgress({
                    phase: 'importing',
                    total,
                    current: importedCount + importErrors.length,
                    success: importedCount,
                    failed: importErrors.length,
                    warnings: Array.isArray(dispatched.warnings) ? dispatched.warnings.length : 0,
                    errors:
                        (Array.isArray(dispatched.errors) ? dispatched.errors.length : 0) +
                        importErrors.length,
                    message: `导入失败：${packet.entryName || packet.kind}`,
                });
            }
        }

        const dispatcherErrors = Array.isArray(dispatched.errors)
            ? dispatched.errors.map((item) => `${item.entryName || item.kind}: ${item.message}`)
            : [];

        const mergedErrors = [...dispatcherErrors, ...importErrors];
        const warningCount = gisInlet.warnings.value?.length || 0;

        const feedbackLines = [];
        if (gisInlet.warnings.value?.length) {
            feedbackLines.push('警告信息:');
            feedbackLines.push(...gisInlet.warnings.value);
        }
        if (mergedErrors.length) {
            feedbackLines.push(`失败 ${mergedErrors.length} 项（已跳过并继续处理其余数据）:`);
            feedbackLines.push(...mergedErrors);
        }

        if (feedbackLines.length) {
            message.warning(feedbackLines.slice(0, 6).join('\n'), {
                closable: true,
                duration: 6500,
            });
        }

        message.notifyBatch({
            label: batchLabel,
            success: importedCount,
            failed: mergedErrors.length,
            warnings: warningCount,
        });

        if (!importedCount) {
            throw new Error('所有数据集导入失败');
        }

        reportImportProgress({
            phase: 'done',
            total,
            current: total,
            success: importedCount,
            failed: mergedErrors.length,
            warnings: warningCount,
            errors: mergedErrors.length,
            message: `导入完成：成功 ${importedCount}，失败 ${mergedErrors.length}`,
        });
    }

    /**
     * 用户数据导入主入口
     * 根据文件类型自动分发到对应的处理管线：
     * - 文件夹/ZIP/KMZ → gisInlet.dispatch 解析后批量导入
     * - TIF/TIFF → createManagedRasterLayer 栅格处理
     * - GeoJSON/KML/SHP → parseUploadedFeatures 矢量处理
     *
     * @param {Object} params
     * @param {string|ArrayBuffer|Object} params.content - 文件内容
     * @param {string} params.type - 文件类型/MIME
     * @param {string} params.name - 文件名
     * @param {Array|null} [params.resources=null] - 文件夹导入时的资源列表
     */
    async function addUserDataLayer({ content, type, name, resources }) {
        if (!mapInstance.value) return;
        try {
            const isFolderImport = Array.isArray(resources) && resources.length > 0;
            const normalizedType = isFolderImport
                ? 'directory'
                : getNormalizedUploadType(type, name);
            reportImportProgress({
                phase: 'validating',
                message: `正在校验文件：${name || (isFolderImport ? '文件夹导入' : '未命名文件')}`,
            });

            if (isFolderImport || normalizedType === 'zip' || normalizedType === 'kmz') {
                reportImportProgress({
                    phase: 'dispatching',
                    message: isFolderImport
                        ? '正在递归扫描文件夹并识别数据集...'
                        : '正在解析压缩包并识别数据集...',
                });

                const dispatched = await gisInlet.dispatch(
                    isFolderImport
                        ? { resources, type: normalizedType, name }
                        : { content, type: normalizedType, name },
                );

                await importDispatchedPackets(
                    dispatched,
                    normalizedType,
                    name,
                    isFolderImport
                        ? '文件夹批量导入'
                        : normalizedType === 'kmz'
                          ? 'KMZ 批量导入'
                          : 'ZIP 批量导入',
                );

                return;
            }

            if (isTiffType(normalizedType)) {
                const tifName = name || `栅格_${Date.now()}.tif`;
                const buffer = content instanceof ArrayBuffer ? content : null;
                if (!buffer) throw new Error('TIF 数据读取失败');

                await createManagedRasterLayer({
                    name: tifName,
                    type: normalizedType,
                    sourceType: 'upload',
                    data: buffer,
                    fitView: true,
                });
                reportImportProgress({
                    phase: 'done',
                    total: 1,
                    current: 1,
                    success: 1,
                    failed: 0,
                    message: `导入完成：${tifName}`,
                });
                message.success(`导入完成：${tifName}`);
                return;
            }

            const features = await parseUploadedFeatures({ content, type: normalizedType, name });
            if (!features.length) throw new Error('无有效数据');
            const labelField = pickFeatureLabelField(features);
            const standardTocItem = buildStandardLayerItem({
                name,
                layerType: normalizedType,
                sourceType: 'upload',
                featureCount: features.length,
                metadata: {
                    labelField,
                },
            });

            await createManagedVectorLayer({
                name,
                type: normalizedType,
                sourceType: 'upload',
                features,
                styleConfig: getRandomStyle(),
                autoLabel: true,
                metadata: {
                    labelField,
                    standardTocItem,
                },
                fitView: true,
            });
            reportImportProgress({
                phase: 'done',
                total: 1,
                current: 1,
                success: 1,
                failed: 0,
                message: `导入完成：${name || '上传图层'}`,
            });
            message.success(`导入完成：${name || '上传图层'}`);
        } catch (e) {
            reportImportProgress({
                phase: 'error',
                message: `导入失败：${e.message}`,
            });
            if (isUnsupportedProjectedCrsError(e)) {
                if (!e?.notified) {
                    message.error(UNSUPPORTED_PROJECTED_CRS_MESSAGE, {
                        closable: true,
                        duration: 0,
                    });
                }
                return;
            }
            message.error('文件解析失败: ' + e.message, { closable: true, duration: 0 });
        }
    }

    return {
        createManagedRasterLayer,
        queryRasterValueAtCoordinate,
        projectExtentToMapView,
        addUserDataLayer,
        parseUploadedFeatures,
        isTiffType,
    };
}
