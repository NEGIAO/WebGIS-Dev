import {
    ensureProjectionAvailable,
    isUnsupportedProjectedCrsError,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
    normalizeProjectionCode,
} from '@common/map-view/geo/index';
import { rememberSourceSnapshot } from '@common/data-import/crs/sourceSnapshot';
import { createStandardItem } from '@common/layer-tree/factory';
import { useGisLoader } from '@common/data-import/useGisLoader';
import { useMessage } from '@common/shell/useMessage';
import { isTiffType } from '@common/data-import/rasterUtils';
import { withImportMask } from '@common/data-import/yieldUi';
import {
    getNormalizedUploadType,
    pickFeatureLabelField,
} from '@common/data-import/vectorUtils';
import { createRasterSamplers } from '../raster/rasterSamplers';
import { createNonGeorefTiffLayerFactory } from '../raster/nonGeorefTiffLayer';
import { createRasterLayerFactory } from '../raster/rasterLayerFactory';
import { createKmlTextHelpers } from '../vector/kmlTextHelpers';
import { createVectorImportPipeline } from '../vector/vectorImportPipeline';


export function useLayerDataImport({
    mapInstance,
    initialView,
    userDataLayers,
    addManagedLayerRecord,
    createManagedVectorLayer,
    styleTemplates,
    onImportProgress = null,
}) {
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
     */    /**
     * 本次导入人工指定的源坐标系（上传区下拉）。
     * 放在 composable 作用域而非逐层透传：2D 解析链有 7 处调用 resolveSupportedProjection，
     * 逐层加参会把签名污染到每个解析分支。
     *
     * ⚠️ 该变量只在「同一时刻仅有一次导入在跑」时成立，因此由 importInFlight 强制串行：
     * 旧实现只靠注释假设调用方不会并发，两个导入重叠时后者会覆盖该值、先结束者的
     * finally 又会把它清空，导致数据被按错的 CRS 解释。
     */
    let activeOverrideCrs = '';
    /** 导入串行闸门：true 表示有导入在跑，此时拒绝新导入而不是让两者共享 activeOverrideCrs */
    let importInFlight = false;

    async function resolveSupportedProjection(
        rawProjection,
        fallbackProjection = 'EPSG:4326',
        label = '数据',
    ) {
        // 人工指定优先级最高：直接尝试解析，失败则明确报错而不是回落
        const forced = normalizeProjectionCode(activeOverrideCrs || '');
        if (forced) {
            const supported = await ensureProjectionAvailable(forced);
            if (supported) return supported;
            throw new Error(
                `${label}指定的坐标系 ${forced} 无法解析，请核对 EPSG 编号（如 4547）或改回自动识别。`,
            );
        }

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

    // ============================================================
    // 子模块装配（依赖注入；activeOverrideCrs / importInFlight 仍由本入口独占）
    // ============================================================

    const samplers = createRasterSamplers({
        mapInstance,
        message,
        userDataLayers,
        reportImportProgress,
    });

    const { createNonGeorefTiffLayer } = createNonGeorefTiffLayerFactory({
        mapInstance,
        message,
        initialView,
        reportImportProgress,
        addManagedLayerRecord,
        buildStandardLayerItem,
        getGeotiffFromBlob: samplers.getGeotiffFromBlob,
        getPool: samplers.getPool,
        createExtentRasterSampler: samplers.createExtentRasterSampler,
        buildRgbaFromBands: samplers.buildRgbaFromBands,
        projectExtentToMapView: samplers.projectExtentToMapView,
    });

    const { createManagedRasterLayer } = createRasterLayerFactory({
        mapInstance,
        addManagedLayerRecord,
        createNonGeorefTiffLayer,
        buildStandardLayerItem,
        resolveSupportedProjection,
        getGeotiffFromBlob: samplers.getGeotiffFromBlob,
        getGeotiffFromUrl: samplers.getGeotiffFromUrl,
        getPool: samplers.getPool,
        getGeoTIFFSourceCtor: samplers.getGeoTIFFSourceCtor,
        createGeoTiffSampler: samplers.createGeoTiffSampler,
        projectExtentToMapView: samplers.projectExtentToMapView,
    });

    const { parseKmlTextToFeatures } = createKmlTextHelpers({
        message,
        resolveSupportedProjection,
    });

    const { parseUploadedVector, importDispatchedPackets } = createVectorImportPipeline({
        message,
        createManagedVectorLayer,
        buildStandardLayerItem,
        resolveSupportedProjection,
        reportImportProgress,
        parseKmlTextToFeatures,
        createManagedRasterLayer,
        gisInlet,
        getActiveOverrideCrs: () => activeOverrideCrs,
        getRandomStyle,
    });

    const { queryRasterValueAtCoordinate, projectExtentToMapView } = samplers;

    /**
     * 用户数据导入主入口
     * 根据文件类型自动分发到对应的处理管线：
     * - 文件夹/ZIP/KMZ → gisInlet.dispatch 解析后批量导入
     * - TIF/TIFF → createManagedRasterLayer 栅格处理
     * - GeoJSON/KML/SHP → parseUploadedVector 矢量处理
     *
     * @param {Object} params
     * @param {string|ArrayBuffer|Object} params.content - 文件内容
     * @param {string} params.type - 文件类型/MIME
     * @param {string} params.name - 文件名
     * @param {Array|null} [params.resources=null] - 文件夹导入时的资源列表
     */
    async function addUserDataLayer({ content, type, name, resources, file = null, overrideCrs = '' }) {
        if (!mapInstance.value) return;
        // 串行闸门：activeOverrideCrs 是本次导入的作用域值，并发导入会互相覆盖，
        // 因此显式拒绝第二次进入（而不是依赖调用方自觉），保证「赋值 → 使用 → 清空」独占。
        if (importInFlight) {
            message.warning('上一次导入尚未完成，请稍候再试');
            return;
        }
        importInFlight = true;
        // 本次导入的源坐标系覆盖值（空串=自动识别）；finally 中清空，避免影响后续导入
        activeOverrideCrs = String(overrideCrs || '').trim();
        try {
            // 遮罩握手：先让 GlobalLoading 真正上屏（showLoading + 双 rAF），
            // 再进入重活；同步解析/解码阶段面板也能给出可见反馈，不再"卡死无任何提示"
            await withImportMask('正在导入数据，请稍候…', () =>
                importUploadInternal({ content, type, name, resources, file }));
        } catch (e) {
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
        } finally {
            activeOverrideCrs = '';
            importInFlight = false;
        }
    }

    async function importUploadInternal({ content, type, name, resources, file = null }) {
        const isFolderImport = Array.isArray(resources) && resources.length > 0;
        const normalizedType = isFolderImport
            ? 'directory'
            : getNormalizedUploadType(type, name);

        // 从 resources 中提取 TIF File 对象，用于大文件 Worker 解码路径
        let tifFile = file;

        if (!tifFile && isFolderImport && resources.length === 1) {
            const rName = resources[0]?.name || '';
            if (/\.(tiff?|tif)$/i.test(rName)) {
                tifFile = resources[0];
            }
        }

        try {
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
                    tifFile,
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
                    file,
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

            const { features, snapshot } = await parseUploadedVector({
                content,
                type: normalizedType,
                name,
            });
            if (!features.length) throw new Error('无有效数据');
            const labelField = pickFeatureLabelField(features);
            const standardTocItem = buildStandardLayerItem({
                name,
                layerType: normalizedType,
                sourceType: 'upload',
                featureCount: features.length,
                metadata: {
                    labelField,
                    // 直传路径同样要写 sourceCrs：属性面板据此显示「判成了什么」
                    sourceCrs: snapshot?.sourceCrs || '',
                },
            });

            const vectorLayerId = await createManagedVectorLayer({
                name,
                type: normalizedType,
                sourceType: 'upload',
                features,
                styleConfig: getRandomStyle(),
                autoLabel: true,
                metadata: {
                    labelField,
                    sourceCrs: snapshot?.sourceCrs || '',
                    standardTocItem,
                },
                fitView: true,
            });

            if (vectorLayerId && snapshot?.geojson) {
                rememberSourceSnapshot(vectorLayerId, {
                    geojson: snapshot.geojson,
                    sourceCrs: snapshot.sourceCrs || 'EPSG:4326',
                    targetCrs: 'EPSG:4326',
                    featureCount: features.length,
                });
            }
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
            // 用户提示统一由 withImportMask 外层的 addUserDataLayer 收口，
            // 这里只负责面板进度条的错误反馈，并向上抛出便于识别不支持投影
            reportImportProgress({
                phase: 'error',
                message: `导入失败：${e.message}`,
            });
            throw e;
        }
    }

    return {
        createManagedRasterLayer,
        queryRasterValueAtCoordinate,
        projectExtentToMapView,
        addUserDataLayer,
        parseUploadedVector,
        isTiffType,
    };
}
