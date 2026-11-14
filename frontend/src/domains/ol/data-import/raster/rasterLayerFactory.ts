/**
 * 受管栅格图层工厂（从 useLayerDataImport 拆出）
 *
 * 只处理「有坐标参考的 GeoTIFF → WebGLTileLayer」：元数据探测、波段合成、
 * 单波段拉伸、图层树登记；无坐标参考的情况交给 nonGeorefTiffLayer 兜底。
 */

import { detectDataRange } from '@common/data-import/rasterUtils';
import { Z_BAND } from '@ol/layer/zIndexBands';

/** 地图 fit 动画持续时间（毫秒） */
const FIT_DURATION_LONG = 900;

/** 地图 fit 动画时的边距（像素） */
const FIT_PADDING = [50, 50, 50, 50];

/** 地图 fit 动画最大缩放级别 */
const FIT_MAX_ZOOM = 18;

export interface RasterLayerFactoryDeps {
    mapInstance: { value: any };
    addManagedLayerRecord: (record: any) => void;
    /** 非地理参考 TIFF 兜底构造（raster/nonGeorefTiffLayer） */
    createNonGeorefTiffLayer: (options: any) => any;
    /** 主入口的图层项构造与投影识别 */
    buildStandardLayerItem: (args: any) => any;
    resolveSupportedProjection: (...args: any[]) => Promise<any>;
    /** rasterSamplers 提供的 geotiff 源/池获取器与采样器 */
    getGeotiffFromBlob: (...args: any[]) => Promise<any>;
    getGeotiffFromUrl: (...args: any[]) => Promise<any>;
    getPool: () => Promise<any>;
    getGeoTIFFSourceCtor: () => Promise<any>;
    createGeoTiffSampler: (...args: any[]) => any;
    projectExtentToMapView: (...args: any[]) => any;
}

export interface CreateManagedRasterLayerParams {
    name: string;
    type: string;
    sourceType?: any;
    data?: any;
    url?: string | null;
    fitView?: boolean;
    packet?: any;
    file?: File | null;
}

/**
 * 创建受管栅格图层构造函数
 * @param deps 依赖注入（见 RasterLayerFactoryDeps）
 * @returns createManagedRasterLayer
 */
export function createRasterLayerFactory(deps: RasterLayerFactoryDeps) {
    const {
        mapInstance,
        addManagedLayerRecord,
        createNonGeorefTiffLayer,
        buildStandardLayerItem,
        resolveSupportedProjection,
        getGeotiffFromBlob,
        getGeotiffFromUrl,
        getPool,
        getGeoTIFFSourceCtor,
        createGeoTiffSampler,
        projectExtentToMapView,
    } = deps;
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
        /** 传入原始 File 对象，用于大文件 Worker 解码路径 */
        file = null,
    }: CreateManagedRasterLayerParams) {
        if (!mapInstance.value) return null;
        if (!url && !(data && data instanceof ArrayBuffer)) return null;

        const GeoTIFFSource = await getGeoTIFFSourceCtor();
        const pool = await getPool();

        // 阶段 1：读取元数据（波段数、NoData、单波段拉伸参数）
        // URL 模式使用 fromUrl（仅读元数据，不下载全部像素）
        // Blob 模式使用 fromBlob
        // 使用 Worker Pool 在后台线程解码，不阻塞 UI
        let sampleBandCount;
        let nodataValue;
        let singleBandStretch: any = null;
        let firstImageRef: any = null;
        let blob: any = null;
        try {
            let tiff;
            if (url) {
                const fromUrl = await getGeotiffFromUrl();
                tiff = await fromUrl(url);
            } else {
                blob = new Blob([data as ArrayBuffer], { type: 'image/tiff' });
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

            // 单波段：智能检测 nodata 并计算全有效范围的渲染拉伸参数
            if (sampleBandCount === 1) {
                const readOpts: any = { samples: [0], interleave: true };
                if (pool) readOpts.pool = pool;
                const singleBandData = await firstImage.readRasters(readOpts);
                const dataRange = detectDataRange(singleBandData, { nodataValue });
                nodataValue = dataRange.nodataValue;
                singleBandStretch = { min: dataRange.min, max: dataRange.max };
            }
        } catch (_e) {
            sampleBandCount = 0;
            nodataValue = null;
            singleBandStretch = null;
        }

        // 阶段 2：创建 GeoTIFFSource
        // URL 模式：直接传 URL，OL 通过 Range Requests 按需加载瓦片
        // Blob 模式：传 Blob，OL 在内存中按需读取
        const sourceOpts: Record<string, any> = {};
        if (sampleBandCount === 1 && nodataValue !== null) {
            sourceOpts.nodata = nodataValue;
        }
        if (url) {
            sourceOpts.url = url;
        } else {
            sourceOpts.blob = blob || new Blob([data as ArrayBuffer], { type: 'image/tiff' });
        }
        const source = new GeoTIFFSource({
            convertToRGB: 'auto',
            normalize: sampleBandCount === 1 ? false : undefined,
            sources: [sourceOpts],
            maximumConnections: 6,
        });

        let viewCfg: any = null;
        let hasGeorefExtent;
        try {
            viewCfg = await source.getView();
            hasGeorefExtent = !!(
                viewCfg?.extent && viewCfg.extent.every((v: any) => Number.isFinite(v))
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
                file,
            });
        }

        const sourceProjection = await resolveSupportedProjection(
            viewCfg?.projection,
            'EPSG:4326',
            'GeoTIFF',
        );

        const layerOptions: any = {
            source,
            zIndex: Z_BAND.DATA,
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

        const { default: WebGLTileLayer } = await import('ol/layer/WebGLTile.js');
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
    return { createManagedRasterLayer };
}
