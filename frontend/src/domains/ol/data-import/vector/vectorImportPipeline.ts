/**
 * 矢量导入管线（从 useLayerDataImport 拆出）
 *
 * 负责「已上传文件 → 解析 → 重投影 → 组装图层记录」与「dispatch 结果 → 逐包入库」
 * 两个阶段；图层树登记与栅格链路通过依赖注入复用主入口实现。
 */

import GeoJSON from 'ol/format/GeoJSON';
import { parseShpPartsToGeoJSON } from '@common/data-import/parsers/shpParser';
import { parseCsvToGeoJSON, parseWktToGeoJSON } from '@common/data-import/parsers/tabularParser';
import { rememberSourceSnapshot } from '@common/data-import/crs/sourceSnapshot';
import { decodeTextContent } from '@common/data-import/archiveProcessor';
import {
    getNormalizedUploadType,
    getLayerNameFromEntry,
    pickFeatureLabelField,
} from '@common/data-import/vectorUtils';
import {
    detectGeoJSONProjection,
    isUnsupportedProjectedCrsError,
    UNSUPPORTED_PROJECTED_CRS_MESSAGE,
} from '@common/map-view/geo/index';

export interface VectorImportPipelineDeps {
    message: any;
    createManagedVectorLayer: (...args: any[]) => any;
    /** 主入口的图层项构造与投影识别 */
    buildStandardLayerItem: (args: any) => any;
    resolveSupportedProjection: (...args: any[]) => Promise<any>;
    reportImportProgress: (state?: any) => void;
    /** KML 文本工具（vector/kmlTextHelpers） */
    parseKmlTextToFeatures: (...args: any[]) => Promise<any>;
    /** 栅格图层工厂 */
    createManagedRasterLayer: (...args: any[]) => Promise<any>;
    /** GIS 加载器（shp/geojson 解析包装） */
    gisInlet: any;
    /** 本次导入人工声明的源坐标系（空串=自动识别），由主入口串行闸门持有 */
    getActiveOverrideCrs: () => string;
    /** 随机样式（导入数据视觉区分） */
    getRandomStyle: () => any;
}

/**
 * 创建矢量导入管线
 * @param deps 依赖注入（见 VectorImportPipelineDeps）
 * @returns 单文件解析入库 / dispatch 逐包入库
 */
export function createVectorImportPipeline(deps: VectorImportPipelineDeps) {
    const {
        message,
        createManagedVectorLayer,
        buildStandardLayerItem,
        resolveSupportedProjection,
        reportImportProgress,
        parseKmlTextToFeatures,
        createManagedRasterLayer,
        gisInlet,
        getActiveOverrideCrs,
        getRandomStyle,
    } = deps;
    async function parseUploadedVector({ content, type, name = '' }) {
        const normalizedType = getNormalizedUploadType(type, name);

        if (normalizedType === 'kml') {
            const kmlText = decodeTextContent(content);
            const features = await parseKmlTextToFeatures(kmlText, 'KML', getActiveOverrideCrs() || null);
            return { features, snapshot: null };
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
                const features = await parseKmlTextToFeatures(
                    vectorPacket.kmlString,
                    normalizedType === 'kmz' ? 'KMZ/KML' : 'ZIP/KML',
                    getActiveOverrideCrs() || vectorPacket.dataProjection || 'EPSG:4326',
                );
                return { features, snapshot: null };
            }

            if (vectorPacket.kind === 'shp') {
                let sourceGeometry = null;
                let sourceCrs = '';
                const geojson = await parseShpPartsToGeoJSON(vectorPacket.shpParts, {
                    overrideCrs: getActiveOverrideCrs(),
                    onSourceGeometry: (rawGeoJSON, crs) => {
                        sourceGeometry = rawGeoJSON;
                        sourceCrs = crs;
                    },
                });
                const gjFormat = new GeoJSON();
                const featureCollection = Array.isArray(geojson)
                    ? {
                          type: 'FeatureCollection',
                          features: geojson.flatMap((item) => item.features || []),
                      }
                    : geojson;
                const features = gjFormat.readFeatures(featureCollection, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857',
                });
                return {
                    features,
                    snapshot: sourceGeometry ? { geojson: sourceGeometry, sourceCrs } : null,
                };
            }

            if (vectorPacket.kind === 'geojson') {
                const geojsonData = vectorPacket.geojsonData;
                const dataProjection = await resolveSupportedProjection(
                    vectorPacket.dataProjection || 'EPSG:4326',
                    'EPSG:4326',
                    'GeoJSON',
                );
                const gjFormat = new GeoJSON();
                const features = gjFormat.readFeatures(geojsonData, {
                    dataProjection,
                    featureProjection: 'EPSG:3857',
                });
                return { features, snapshot: { geojson: geojsonData, sourceCrs: dataProjection } };
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
            const features = gjFormat.readFeatures(geojsonData, {
                dataProjection,
                featureProjection: 'EPSG:3857',
            });
            return { features, snapshot: { geojson: geojsonData, sourceCrs: dataProjection } };
        }

        // 本系统导出的 CSV / WKT：解析成 GeoJSON 后复用同一条读入与快照链路，
        // 保证「导出 → 导入」能原样回读（含几何类型与全部属性）。
        if (normalizedType === 'csv' || normalizedType === 'wkt') {
            const text = decodeTextContent(content);
            let geojsonData;
            try {
                geojsonData =
                    normalizedType === 'csv' ? parseCsvToGeoJSON(text) : parseWktToGeoJSON(text);
            } catch (error) {
                throw new Error(`文件解析失败：${error?.message || error}`, { cause: error });
            }
            if (!geojsonData?.features?.length) {
                throw new Error(
                    normalizedType === 'csv'
                        ? 'CSV 中没有可识别的坐标数据（需包含 lng/lat 或 经度/纬度 列）'
                        : 'TXT 中没有可识别的 WKT 几何（应为 POINT / LINESTRING / POLYGON 等）',
                );
            }
            const gjFormat = new GeoJSON();
            const features = gjFormat.readFeatures(geojsonData, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
            });
            return {
                features,
                snapshot: { geojson: geojsonData, sourceCrs: 'EPSG:4326' },
            };
        }

        if (normalizedType === 'shp') {
            console.warn(
                '[SHP] 检测到单个 .shp 文件上传，属性信息可能不完整。\n' +
                '建议：请将 .shp, .dbf, .shx, .prj, .cpg 等同名文件一起上传或打包成 ZIP。'
            );
            let sourceGeometry = null;
            let sourceCrs = '';
            const geojson = await parseShpPartsToGeoJSON(
                { shp: content },
                {
                    overrideCrs: getActiveOverrideCrs(),
                    onSourceGeometry: (rawGeoJSON, crs) => {
                        sourceGeometry = rawGeoJSON;
                        sourceCrs = crs;
                    },
                },
            );
            const gjFormat = new GeoJSON();
            const detectedProjection = detectGeoJSONProjection(geojson);
            const dataProjection = await resolveSupportedProjection(
                detectedProjection,
                'EPSG:4326',
                'SHP',
            );
            const features = gjFormat.readFeatures(geojson, {
                dataProjection,
                featureProjection: 'EPSG:3857',
            });
            return {
                features,
                snapshot: sourceGeometry ? { geojson: sourceGeometry, sourceCrs } : null,
            };
        }

        throw new Error(`不支持的文件类型: ${normalizedType || type}`);
    }

    async function importDispatchedPackets(dispatched, normalizedType, name, batchLabel, tifFile = null) {
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

        // 叠放顺序（对标 QGIS 图层列表）：先创建的图层 zIndex 更高（见 refreshUserLayerZIndex），
        // 即先建=顶部；包内首个条目对应 QGIS 图层列表顶部。层内 Folder 压盖另由
        // applyKmlDrawOrder 分组定序 + 图层 renderOrder 处理，此处保持包原序创建。
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
                        file: tifFile,
                    });
                    importedCount += 1;
                    continue;
                }

                let features = [];
                let layerType = packet.kind;
                // 源几何快照：只在「原始数值尚未被变换」时非空
                let sourceGeometry = null;
                let sourceGeometryCrs = '';

                if (packet.kind === 'kml') {
                    features = await parseKmlTextToFeatures(
                        packet.kmlString,
                        normalizedType === 'kmz' ? 'KMZ/KML' : 'ZIP/KML',
                        // 人工指定优先于包内声明：KML 的 srsName 常与真实数值不符
                        getActiveOverrideCrs() || packet.dataProjection || 'EPSG:4326',
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
                    // GeoJSON 的原始数值可直接留作快照（dataProjection 即其真实归属）
                    sourceGeometry = packet.geojsonData;
                    sourceGeometryCrs = dataProjection;
                    layerType = 'geojson';
                } else if (packet.kind === 'shp') {
                    // 交出重投影前的几何，供「重设源坐标系」复用（见 crs/sourceSnapshot）
                    const geojson = await parseShpPartsToGeoJSON(packet.shpParts, {
                        overrideCrs: getActiveOverrideCrs(),
                        onSourceGeometry: (sourceGeoJSON, sourceCrs) => {
                            sourceGeometry = sourceGeoJSON;
                            sourceGeometryCrs = sourceCrs;
                        },
                    });
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
                        // 优先用引擎实际判定结果（可能是 WKT: 别名），packet 里的只是文件声明
                        sourceCrs:
                            sourceGeometryCrs || packet.sourceCrs || packet.dataProjection || '',
                    },
                });
                const newLayerId = await createManagedVectorLayer({
                    name: layerName,
                    type: layerType,
                    sourceType: 'upload',
                    features,
                    styleConfig: getRandomStyle(),
                    autoLabel: true,
                    metadata: {
                        labelField,
                        dispatchEntry: packet.entryName || '',
                        sourceCrs:
                            sourceGeometryCrs || packet.sourceCrs || packet.dataProjection || '',
                        standardTocItem,
                    },
                    fitView: importedCount === 0,
                });

                // 快照在图层 id 确定后才能登记；超限（要素过多）时静默跳过，
                // 属性面板的「重设源坐标系」入口自然不出现
                if (newLayerId && sourceGeometry) {
                    rememberSourceSnapshot(newLayerId, {
                        geojson: sourceGeometry,
                        sourceCrs: sourceGeometryCrs || packet.sourceCrs || 'EPSG:4326',
                        targetCrs: 'EPSG:4326',
                        featureCount: features.length,
                    });
                }

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
     * - GeoJSON/KML/SHP → parseUploadedVector 矢量处理
     *
     * @param {Object} params
     * @param {string|ArrayBuffer|Object} params.content - 文件内容
     * @param {string} params.type - 文件类型/MIME
     * @param {string} params.name - 文件名
     * @param {Array|null} [params.resources=null] - 文件夹导入时的资源列表
     */
    return { parseUploadedVector, importDispatchedPackets };
}
