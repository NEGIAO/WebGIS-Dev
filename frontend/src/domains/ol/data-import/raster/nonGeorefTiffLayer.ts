/**
 * 非地理参考 TIFF 兜底图层（从 useLayerDataImport 拆出）
 *
 * 无坐标参考的 TIF 无法落真实地理范围：按当前视图中心临时落图，
 * 支持单波段灰度渲染与 Worker 解码大文件；不属于受管 GeoTIFF 链路。
 */

import ImageLayer from 'ol/layer/Image';
import ImageStatic from 'ol/source/ImageStatic';
import { fromLonLat } from 'ol/proj';
import { loadTifInWorker, isLargeFile } from '@common/data-import/tifUtils';
import { getBandMinMax, detectDataRange } from '@common/data-import/rasterUtils';
import { renderBandsToCanvas } from '@common/data-import/webglRasterRenderer';
import { Z_BAND } from '@ol/layer/zIndexBands';

/** 地图 fit 动画时的边距（像素） */
const FIT_PADDING = [50, 50, 50, 50];

/** 地图 fit 动画最大缩放级别 */
const FIT_MAX_ZOOM = 18;

/** 短动画（非地理参考落图后 fit） */
const FIT_DURATION_SHORT = 700;

export interface NonGeorefTiffDeps {
    mapInstance: { value: any };
    reportImportProgress: (state?: any) => void;
    /** 图层树登记与标准化项 */
    addManagedLayerRecord: (record: any) => void;
    buildStandardLayerItem: (args: any) => any;
    /** rasterSamplers 提供的源/池获取器与采样工具 */
    getGeotiffFromBlob: (...args: any[]) => Promise<any>;
    getPool: () => Promise<any>;
    createExtentRasterSampler: (...args: any[]) => any;
    buildRgbaFromBands: (...args: any[]) => any;
    projectExtentToMapView: (...args: any[]) => any;
    initialView: any;
    message: any;
}

/**
 * 创建非地理参考 TIFF 图层构造函数
 * @param deps 依赖注入（见 NonGeorefTiffDeps）
 * @returns createNonGeorefTiffLayer
 */
export function createNonGeorefTiffLayerFactory({
    mapInstance,
    message,
    initialView,
    reportImportProgress,
    addManagedLayerRecord,
    buildStandardLayerItem,
    getGeotiffFromBlob,
    getPool,
    createExtentRasterSampler,
    buildRgbaFromBands,
    projectExtentToMapView,
}: NonGeorefTiffDeps) {
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
        /** 传入 File 对象时，大文件走 Worker 解码路径 */
        file = null,
    }: Record<string, any>) {
        if (!mapInstance.value) return null;

        let width, height, bands, workerNodata;

        // 大文件（>50MB）：用 Worker 解码，不阻塞主线程
        if (file && isLargeFile(file)) {
            reportImportProgress({
                phase: 'decoding',
                message: `正在后台解码大 TIF 文件：${name}（0%）`,
            });
            const decoded = await loadTifInWorker(file, (progress: number, phase?: string) => {
                reportImportProgress({
                    phase: phase || 'decoding',
                    message: `正在后台解码大 TIF 文件：${name}（${progress}%）`,
                });
            });
            width = (decoded as any).width;
            height = (decoded as any).height;
            bands = (decoded as any).data; // Float32Array[]
            workerNodata = (decoded as any).nodata;
            if (nodataValue === null && workerNodata !== null && workerNodata !== undefined) {
                nodataValue = workerNodata;
            }
            reportImportProgress({
                phase: 'decoding',
                message: `解码完成：${name}（${(decoded as any).elapsed}ms）`,
            });
        } else {
            // 小文件：主线程直接解码，使用 Worker Pool 并行解压
            const geotiffFromBlob = await getGeotiffFromBlob();
            const pool = await getPool();
            const tiff = await geotiffFromBlob(blob);
            const image = await tiff.getImage();
            width = image.getWidth();
            height = image.getHeight();

            const readOpts = pool ? { pool } : {};
            const rasters = await image.readRasters(readOpts);
            bands = Array.isArray(rasters) ? rasters : [rasters];
        }
        const bandStats = bands.slice(0, 3).map(getBandMinMax);
        const alphaStats = bands.length >= 4 ? getBandMinMax(bands[3]) : null;
        const isSingleBand = bands.length === 1;
        let singleBandStretch: any = null;
        if (stretchRange && Number.isFinite(stretchRange.min) && Number.isFinite(stretchRange.max)) {
            singleBandStretch = stretchRange;
        } else if (isSingleBand) {
            const r = detectDataRange(bands[0], { nodataValue });
            nodataValue = r.nodataValue;
            singleBandStretch = { min: r.min, max: r.max };
        }
        const stretchMin = Number.isFinite(singleBandStretch?.min) ? singleBandStretch.min : null;
        const stretchMax = Number.isFinite(singleBandStretch?.max) ? singleBandStretch.max : null;

        const pixelCount = width * height;

        // 渲染策略：
        // - 多波段（3/4 波段）：WebGL 着色器，原始数据直接上传 GPU，着色器做全部拉伸
        // - 单波段：CPU 循环已足够快（<100ms），WebGL 纹理上传开销反而更大
        let canvas: HTMLCanvasElement | null = null;
        let pngBlob: Blob;

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
            pngBlob = await new Promise<Blob>((resolve, reject) => {
                canvas!.toBlob((out: Blob | null) => {
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

            pngBlob = await new Promise<Blob>((resolve, reject) => {
                canvas!.toBlob((out: Blob | null) => {
                    if (out) resolve(out);
                    else reject(new Error('无法生成影像预览'));
                }, 'image/png');
            });

            ctx.clearRect(0, 0, width, height);
            canvas.width = 0;
            canvas.height = 0;
        }

        if (!pngBlob) {
            throw new Error('无法生成影像预览 Blob');
        }
        const pngUrl = URL.createObjectURL(pngBlob);

        const view = mapInstance.value.getView();
        const layerProjection = projection || view.getProjection();
        const center = view.getCenter() || fromLonLat(initialView.center);
        const resolution = view.getResolution() || 1;
        const extent =
            imageExtent && imageExtent.every((v: number) => Number.isFinite(v))
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
            zIndex: Z_BAND.DATA,
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
    return { createNonGeorefTiffLayer };
}
