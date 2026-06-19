/**
 * useCesiumDataImport.js
 * Cesium 3D 场景数据导入 composable
 *
 * 功能：接收用户上传的文件，根据扩展名分发到对应的 Cesium API 加载到场景中。
 * 支持格式：GeoJSON/JSON、KML/KMZ、SHP（通过 shpParser → GeoJSON）、GLB/GLTF、CZML、3D Tiles
 *
 * 输入：{ getViewer, getCesium, message } — 闭包访问 Cesium 实例
 * 输出：{ loadDataFile, loadedDataSources, removeDataSource, clearAllDataSources, pendingGltfFile }
 */

import { ref } from 'vue';
import { decodeTextContent } from '../../../composables/dataImport/vectorUtils.js';

/** @type {string[]} 3D Tiles / CZML 扩展名 */
const TILESET_JSON_INDICATOR = 'tileset.json';

let gisParserCache = null;

/**
 * 懒加载 GIS 解析器（shpjs + 自定义 dbfParser），避免非 SHP 场景下的额外开销
 * @returns {Promise<{decompressBuffer: Function, parseShpPartsToGeoJSON: Function}>}
 */
async function ensureGisParsers() {
    if (gisParserCache) return gisParserCache;

    const [{ decompressBuffer }, { parseShpPartsToGeoJSON }] = await Promise.all([
        import('../../../utils/gis/decompressFile.js'),
        import('../../../utils/gis/parsers/shpParser.ts'),
    ]);

    gisParserCache = { decompressBuffer, parseShpPartsToGeoJSON };
    return gisParserCache;
}

/**
 * 获取文件扩展名（小写）
 * @param {string} filename - 文件名
 * @returns {string} 小写扩展名（不含点）
 */
function getExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? '' : filename.slice(lastDot + 1).toLowerCase();
}

/**
 * 从 DataSource 或 Tileset 中计算相机定位目标
 * @param {Cesium.Viewer} viewer - Cesium 场景
 * @param {Cesium} Cesium - Cesium 命名空间
 * @param {Cesium.DataSource|Cesium.Cesium3DTileset} entity - 加载后的数据源
 * @param {string} format - 数据格式
 */
function flyToEntity(viewer, Cesium, entity, format) {
    if (!viewer || !Cesium || !entity) return;

    try {
        if (format === '3dtiles' && entity.boundingSphere) {
            // 3D Tiles：飞包围球
            viewer.flyTo(entity, {
                duration: 2,
                offset: new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(0),
                    Cesium.Math.toRadians(-30),
                    entity.boundingSphere.radius * 2.0,
                ),
            });
        } else if (entity.entities && entity.entities.values.length > 0) {
            // DataSource（GeoJSON/KML/CZML/SHP）：
            // 通过 DataSourceDisplay 获取默认的 EntityCluster 范围或计算所有实体的 extent
            viewer.flyTo(entity, { duration: 2 });
        }
    } catch (e) {
        // flyTo 失败时不影响已加载的数据，仅静默处理
        console.warn('[CesiumDataImport] flyTo 定位失败:', e);
    }
}

/**
 * 从文件创建 Object URL（用于 DataSource.load / Model.fromGltfAsync）
 * Cesium 的 DataSource.load() 和 Model.fromGltfAsync() 均可接受 URL 字符串，
 * 因此将用户上传的 Blob 转为 Blob URL 是最简洁的集成方式。
 *
 * @param {File|Blob} file - 文件对象
 * @returns {string} Blob URL
 */
function createBlobUrl(file) {
    return URL.createObjectURL(file);
}

/**
 * 回收 Blob URL，释放内存
 * @param {string} url - 要回收的 URL
 */
function revokeBlobUrl(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

/**
 * Cesium 数据导入 composable
 *
 * @param {Object} options
 * @param {Function} options.getViewer - 获取 Cesium Viewer 实例的闭包
 * @param {Function} options.getCesium - 获取 Cesium 命名空间的闭包
 * @param {Object}  options.message - useMessage() 返回的消息实例（success/error/warning）
 * @returns {{ loadDataFile, loadedDataSources, removeDataSource, clearAllDataSources, pendingGltfFile }}
 */
export function useCesiumDataImport({ getViewer, getCesium, message }) {
    /** @type {import('vue').Ref<Array<{id: string, name: string, type: string, entity: any, blobUrl?: string}>>} */
    const loadedDataSources = ref([]);

    /** 当前等待坐标确认的 GLTF 文件（用于弹窗） */
    const pendingGltfFile = ref(null);

    let idCounter = 0;

    // ============================================================
    // 格式加载函数
    // ============================================================

    /**
     * 加载 GeoJSON/JSON 文件到 Cesium
     * 使用 Cesium.GeoJsonDataSource.load() 解析并添加到 scene
     *
     * @param {File} file - .geojson 或 .json 文件
     * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.GeoJsonDataSource}>}
     */
    async function loadGeoJSON(file) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

        const blobUrl = createBlobUrl(file);
        try {
            const dataSource = await Cesium.GeoJsonDataSource.load(blobUrl, {
                stroke: Cesium.Color.fromCssColorString('#3ddc84'),
                fill: Cesium.Color.fromCssColorString('#3ddc84').withAlpha(0.3),
                markerColor: Cesium.Color.fromCssColorString('#3ddc84'),
                markerSize: 24,
            });

            // 为 DataSource 中的每个 entity 添加基本信息
            const id = `geojson_${++idCounter}`;
            dataSource.name = file.name;

            await viewer.dataSources.add(dataSource);
            flyToEntity(viewer, Cesium, dataSource, 'geojson');

            const record = { id, name: file.name, type: 'geojson', entity: dataSource, blobUrl };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(`GeoJSON "${file.name}" 加载成功`);
            return record;
        } catch (error) {
            revokeBlobUrl(blobUrl);
            throw error;
        }
    }

    /**
     * 加载 KML 文件到 Cesium
     * 由于 Cesium.KmlDataSource.load() 要求 CORS 可达的 URL，
     * 优先尝试直接传给 KmlDataSource.load(blobUrl)，
     * Cesium 1.122 内部使用 fetch() 加载，blob: URL 通常可行。
     * 如果失败，则回退到读取为文本并手动解析。
     *
     * @param {File} file - .kml 文件
     * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.KmlDataSource}>}
     */
    async function loadKML(file) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

        const blobUrl = createBlobUrl(file);
        try {
            const dataSource = await Cesium.KmlDataSource.load(blobUrl, {
                camera: viewer.scene.camera,
                canvas: viewer.scene.canvas,
            });

            const id = `kml_${++idCounter}`;
            dataSource.name = file.name;

            await viewer.dataSources.add(dataSource);
            flyToEntity(viewer, Cesium, dataSource, 'kml');

            const record = { id, name: file.name, type: 'kml', entity: dataSource, blobUrl };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(`KML "${file.name}" 加载成功`);
            return record;
        } catch (error) {
            revokeBlobUrl(blobUrl);
            throw error;
        }
    }

    /**
     * 加载 KMZ 文件到 Cesium
     * KMZ 本质是 ZIP 压缩包，内部包含一个 .kml 文件。
     * 尝试直接用 Cesium.KmlDataSource.load(blobUrl) 加载（Cesium 1.122 内部支持 KMZ），
     * 如果失败则手动解压后加载内部 KML。
     *
     * @param {File} file - .kmz 文件
     * @returns {Promise<{id: string, name: string, type: string, entity: any}>}
     */
    async function loadKMZ(file) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

        const blobUrl = createBlobUrl(file);
        try {
            // Cesium.KmlDataSource.load() 在 1.122 中内部支持 KMZ 解压
            const dataSource = await Cesium.KmlDataSource.load(blobUrl, {
                camera: viewer.scene.camera,
                canvas: viewer.scene.canvas,
            });

            const id = `kmz_${++idCounter}`;
            dataSource.name = file.name;

            await viewer.dataSources.add(dataSource);
            flyToEntity(viewer, Cesium, dataSource, 'kmz');

            const record = { id, name: file.name, type: 'kmz', entity: dataSource, blobUrl };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(`KMZ "${file.name}" 加载成功`);
            return record;
        } catch {
            revokeBlobUrl(blobUrl);

            // 回退：手动解压 KMZ
            return await loadKMZFallback(file);
        }
    }

    /**
     * KMZ 手动解压回退方案
     * 使用 JSZip 解压 KMZ 后提取内部 .kml 文件加载
     *
     * @param {File} file - .kmz 文件
     * @returns {Promise<{id: string, name: string, type: string, entity: any}>}
     */
    async function loadKMZFallback(file) {
        const Cesium = getCesium();
        const viewer = getViewer();

        const buffer = await file.arrayBuffer();
        const { decompressBuffer } = await ensureGisParsers();
        const entries = await decompressBuffer(buffer, file.name);

        // 查找内部 .kml 文件
        const kmlEntry = entries.find(
            (entry) => entry.ext === 'kml' || entry.name?.toLowerCase().endsWith('.kml'),
        );

        if (!kmlEntry) {
            throw new Error('KMZ 压缩包中未找到 KML 文件');
        }

        // 解码 KML 文本
        let kmlText;
        if (typeof kmlEntry.content === 'string') {
            kmlText = kmlEntry.content;
        } else if (kmlEntry.content instanceof ArrayBuffer || kmlEntry.content instanceof Uint8Array) {
            kmlText = decodeTextContent(kmlEntry.content);
        } else {
            kmlText = String(kmlEntry.content || '');
        }

        // 创建 Blob URL 给 Cesium.KmlDataSource 加载
        const kmlBlob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' });
        const kmlUrl = URL.createObjectURL(kmlBlob);

        try {
            const dataSource = await Cesium.KmlDataSource.load(kmlUrl, {
                camera: viewer.scene.camera,
                canvas: viewer.scene.canvas,
            });

            const id = `kmz_${++idCounter}`;
            dataSource.name = file.name;

            await viewer.dataSources.add(dataSource);
            flyToEntity(viewer, Cesium, dataSource, 'kmz');

            const record = { id, name: file.name, type: 'kmz', entity: dataSource };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(`KMZ "${file.name}" 加载成功（手动解压）`);
            return record;
        } finally {
            URL.revokeObjectURL(kmlUrl);
        }
    }

    /**
     * 加载 Shapefile 到 Cesium
     * 通过复用 SHP 解析管线（shpParser.ts）将 SHP 转换为 GeoJSON FeatureCollection，
     * 再通过 Cesium.GeoJsonDataSource 加载到场景。
     *
     * @param {File} file - .shp 文件（主文件，同级目录下的 .dbf/.shx/.prj/.cpg 由用户一并选择或多文件上传）
     * @param {File[]} [sidecarFiles] - 配套的 .dbf/.shx/.prj/.cpg 文件列表
     * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.GeoJsonDataSource}>}
     */
    async function loadSHP(file, sidecarFiles = []) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

        const { parseShpPartsToGeoJSON } = await ensureGisParsers();

        // 构建 parts 对象
        const parts = { shp: await file.arrayBuffer() };

        for (const sidecar of sidecarFiles) {
            const ext = getExtension(sidecar.name);
            if (ext === 'dbf') parts.dbf = await sidecar.arrayBuffer();
            if (ext === 'shx') parts.shx = await sidecar.arrayBuffer();
            if (ext === 'prj') parts.prj = await sidecar.arrayBuffer();
            if (ext === 'cpg') parts.cpg = await sidecar.arrayBuffer();
        }

        // 调用统一 SHP 解析器，返回 EPSG:4326 GeoJSON（可能是单个 FeatureCollection 或 FeatureCollection 数组）
        const geojson = await parseShpPartsToGeoJSON(parts);

        // 归一化为 FeatureCollection 数组，便于累加要素数
        const featureCollections = Array.isArray(geojson) ? geojson : [geojson];
        const totalFeatureCount = featureCollections.reduce(
            (sum, fc) => sum + (fc?.features?.length || 0),
            0,
        );

        // 通过 GeoJsonDataSource 加载
        // Cesium GeoJsonDataSource.load() 需要 URL，这里将 GeoJSON 序列化为 Blob URL
        const payload = featureCollections.length === 1 ? featureCollections[0] : {
            type: 'FeatureCollection',
            features: featureCollections.flatMap((fc) => fc?.features || []),
        };
        const geojsonBlob = new Blob([JSON.stringify(payload)], { type: 'application/geo+json' });
        const geojsonUrl = URL.createObjectURL(geojsonBlob);

        try {
            const dataSource = await Cesium.GeoJsonDataSource.load(geojsonUrl, {
                stroke: Cesium.Color.fromCssColorString('#ffcc00'),
                fill: Cesium.Color.fromCssColorString('#ffcc00').withAlpha(0.25),
                markerColor: Cesium.Color.fromCssColorString('#ffcc00'),
                markerSize: 20,
            });

            const id = `shp_${++idCounter}`;
            dataSource.name = file.name;

            await viewer.dataSources.add(dataSource);
            flyToEntity(viewer, Cesium, dataSource, 'shp');

            const record = { id, name: file.name, type: 'shp', entity: dataSource };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(`Shapefile "${file.name}" 加载成功 (${totalFeatureCount} 个要素)`);

            // 回收临时 URL
            URL.revokeObjectURL(geojsonUrl);

            return record;
        } catch (error) {
            URL.revokeObjectURL(geojsonUrl);
            throw error;
        }
    }

    /**
     * 加载 GLTF/GLB 三维模型到 Cesium
     *
     * 流程：
     * 1. 读取文件转为 Blob URL
     * 2. 尝试从模型中提取嵌入坐标（CESIUM_RTC 扩展或 asset.extras）
     * 3. 如无嵌入坐标 → 暂存到 pendingGltfFile，等待用户通过弹窗输入坐标
     * 4. 有坐标 → 直接加载
     *
     * @param {File} file - .glb 或 .gltf 文件
     * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.Model}|{needsCoordInput: true}>}
     */
    async function loadGLTF(file) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

        const blobUrl = createBlobUrl(file);

        // 尝试从模型元数据中提取嵌入坐标
        let embeddedCoords = null;
        try {
            embeddedCoords = await extractGlbEmbeddedCoords(file);
        } catch (e) {
            // 提取失败，视为无嵌入坐标
            console.warn('[CesiumDataImport] GLTF 坐标提取失败:', e);
        }

        if (embeddedCoords) {
            // 有嵌入坐标，直接加载
            try {
                const model = await loadGltfWithCoords(Cesium, viewer, blobUrl, file.name, embeddedCoords);
                const id = `gltf_${++idCounter}`;

                const record = { id, name: file.name, type: 'gltf', entity: model, blobUrl };
                loadedDataSources.value = [...loadedDataSources.value, record];

                message.success(
                    `3D 模型 "${file.name}" 加载成功 (${embeddedCoords.lng.toFixed(4)}, ${embeddedCoords.lat.toFixed(4)}, ${embeddedCoords.height.toFixed(1)}m)`,
                );
                return record;
            } catch (error) {
                revokeBlobUrl(blobUrl);
                throw error;
            }
        }

        // 无嵌入坐标 → 暂存等待用户输入
        // 若已有等待中的文件，先回收旧 BlobURL，避免泄漏
        if (pendingGltfFile.value) {
            revokeBlobUrl(pendingGltfFile.value.blobUrl);
        }
        pendingGltfFile.value = {
            file,
            blobUrl,
            name: file.name,
        };

        return { needsCoordInput: true, file };
    }

    /**
     * 使用指定坐标加载 GLTF/GLB 模型（由弹窗确认后调用）
     *
     * @param {{ lng: number, lat: number, height: number }} coords - 用户输入的坐标
     * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.Model}>}
     */
    async function loadGltfWithUserCoords(coords) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!pendingGltfFile.value) throw new Error('没有等待确认的模型文件');

        const { blobUrl, name } = pendingGltfFile.value;

        try {
            const model = await loadGltfWithCoords(Cesium, viewer, blobUrl, name, coords);
            const id = `gltf_${++idCounter}`;

            const record = { id, name, type: 'gltf', entity: model, blobUrl };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(
                `3D 模型 "${name}" 加载成功 (${coords.lng.toFixed(4)}, ${coords.lat.toFixed(4)}, ${coords.height.toFixed(1)}m)`,
            );

            // 定位到模型位置
            const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, coords.height + 500);
            viewer.camera.flyTo({
                destination: position,
                orientation: {
                    heading: Cesium.Math.toRadians(0),
                    pitch: Cesium.Math.toRadians(-30),
                    roll: 0,
                },
                duration: 2,
            });

            pendingGltfFile.value = null;
            return record;
        } catch (error) {
            revokeBlobUrl(blobUrl);
            pendingGltfFile.value = null;
            throw error;
        }
    }

    /**
     * 取消 GLTF 加载（用户点击取消按钮时调用）
     */
    function cancelPendingGltf() {
        if (pendingGltfFile.value) {
            revokeBlobUrl(pendingGltfFile.value.blobUrl);
            pendingGltfFile.value = null;
        }
    }

    /**
     * 加载 CZML 文件到 Cesium
     * CZML 是 Cesium 特有的时态数据格式，支持时间动态展示。
     *
     * @param {File} file - .czml 文件
     * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.CzmlDataSource}>}
     */
    async function loadCZML(file) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

        const blobUrl = createBlobUrl(file);
        try {
            const dataSource = await Cesium.CzmlDataSource.load(blobUrl);

            const id = `czml_${++idCounter}`;
            dataSource.name = file.name;

            await viewer.dataSources.add(dataSource);
            flyToEntity(viewer, Cesium, dataSource, 'czml');

            const record = { id, name: file.name, type: 'czml', entity: dataSource, blobUrl };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(`CZML "${file.name}" 加载成功`);
            return record;
        } catch (error) {
            revokeBlobUrl(blobUrl);
            throw error;
        }
    }

    /**
     * 加载 3D Tiles 数据集到 Cesium
     * 支持 tileset.json 文件和 .json（自动检测是否为 tileset.json）
     *
     * @param {File} file - tileset.json 文件
     * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.Cesium3DTileset}>}
     */
    async function loadTilesetJSON(file) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

        const blobUrl = createBlobUrl(file);
        try {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(blobUrl);

            const id = `tileset_${++idCounter}`;
            viewer.scene.primitives.add(tileset);

            const record = { id, name: file.name, type: '3dtiles', entity: tileset, blobUrl };
            loadedDataSources.value = [...loadedDataSources.value, record];

            flyToEntity(viewer, Cesium, tileset, '3dtiles');

            message.success(`3D Tiles "${file.name}" 加载成功`);
            return record;
        } catch (error) {
            revokeBlobUrl(blobUrl);
            throw error;
        }
    }

    // ============================================================
    // GLTF 坐标工具函数
    // ============================================================

    /**
     * 从 GLTF/GLB 文件中提取嵌入的地理坐标
     *
     * 支持的坐标来源（按优先级）：
     * 1. CESIUM_RTC 扩展 — 相对地心的偏移，可从 CesiumRtcCenter + 地球椭球体反算经纬度
     * 2. asset.extras.longitude/latitude/height — 自定扩展属性
     * 3. asset.extras.cesium_rtc_center（与 1 相同但格式不同）
     *
     * @param {File} file - GLTF/GLB 文件
     * @returns {Promise<{lng: number, lat: number, height: number}|null>} 坐标或 null
     */
    async function extractGlbEmbeddedCoords(file) {
        const ext = getExtension(file.name);
        let json;

        if (ext === 'gltf') {
            // .gltf 是纯 JSON
            const text = await file.text();
            json = JSON.parse(text);
        } else {
            // .glb 是二进制格式：12 字节头部 + JSON chunk
            const buffer = await file.arrayBuffer();
            json = parseGlbJsonChunk(buffer);
        }

        if (!json) return null;

        // 1) 检查 CESIUM_RTC 扩展
        if (json.extensionsUsed?.includes('CESIUM_RTC') && json.extensions?.CESIUM_RTC?.center) {
            const center = json.extensions.CESIUM_RTC.center;
            if (center.length >= 3) {
                // Cesium_RTC center 是相对于 WGS84 椭球体中心的地固坐标 (x, y, z)
                // 使用 Cesium 的 Cartesian3 → Cartographic 转换获取经纬度
                const Cesium = getCesium();
                if (Cesium) {
                    const cartesian = new Cesium.Cartesian3(center[0], center[1], center[2]);
                    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                    return {
                        lng: Cesium.Math.toDegrees(cartographic.longitude),
                        lat: Cesium.Math.toDegrees(cartographic.latitude),
                        height: cartographic.height,
                    };
                }
            }
        }

        // 2) 检查 asset.extras 中的自定义坐标
        const extras = json.asset?.extras;
        if (extras) {
            const lng = extras.longitude ?? extras.lng;
            const lat = extras.latitude ?? extras.lat;
            const height = extras.height ?? extras.altitude ?? extras.alt ?? 0;

            if (lng != null && lat != null) {
                return {
                    lng: Number(lng),
                    lat: Number(lat),
                    height: Number(height),
                };
            }
        }

        // 3) 检查顶层的 translation 或 matrix（node 层级）
        // 对于带 matrix 的 GLTF，可以在首个 node 的 matrix 中提取位置
        if (json.nodes?.length > 0 && json.nodes[0].matrix) {
            const matrix = json.nodes[0].matrix;
            if (matrix.length >= 16) {
                // 4x4 变换矩阵的最后一列前三行是平移分量
                const tx = matrix[12];
                const ty = matrix[13];
                const tz = matrix[14];

                // 仅当值看起来像地固坐标时（|x| > 100000 米）才可能是地理坐标
                // 否则视为模型自带坐标（无地理意义）
                if (Math.abs(tx) > 100000 || Math.abs(ty) > 100000) {
                    const Cesium = getCesium();
                    if (Cesium) {
                        try {
                            const cartesian = new Cesium.Cartesian3(tx, ty, tz);
                            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                            return {
                                lng: Cesium.Math.toDegrees(cartographic.longitude),
                                lat: Cesium.Math.toDegrees(cartographic.latitude),
                                height: cartographic.height,
                            };
                        } catch {
                            // 转换失败，忽略
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * 解析 GLB 二进制文件的 JSON chunk
     * GLB 格式：12 字节头 | JSON chunk（长度 + 类型 + 数据）| 可选 BIN chunk
     *
     * @param {ArrayBuffer} buffer - GLB 文件二进制数据
     * @returns {Object|null} 解析后的 JSON 对象
     */
    function parseGlbJsonChunk(buffer) {
        if (buffer.byteLength < 20) return null;

        const headerView = new DataView(buffer);
        const magic = headerView.getUint32(0, true); // 0x46546C67 = 'glTF'
        if (magic !== 0x46546c67) return null;

        const jsonChunkLength = headerView.getUint32(12, true);
        const jsonChunkType = headerView.getUint32(16, true);
        if (jsonChunkType !== 0x4e4f534a) return null; // 'JSON'

        const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLength);
        const jsonText = new TextDecoder().decode(jsonBytes);

        try {
            return JSON.parse(jsonText);
        } catch {
            return null;
        }
    }

    /**
     * 根据坐标创建 modelMatrix 并加载 GLTF 模型
     * @param {Cesium} Cesium
     * @param {Cesium.Viewer} viewer
     * @param {string} blobUrl - 模型的 Blob URL
     * @param {string} name - 文件名
     * @param {{lng: number, lat: number, height: number}} coords - 坐标
     * @returns {Promise<Cesium.Model>}
     */
    async function loadGltfWithCoords(Cesium, viewer, blobUrl, name, coords) {
        const { lng, lat, height } = coords;

        // 从经纬度 + 高度创建 ENU (East-North-Up) 固定参考系变换
        const center = Cesium.Cartesian3.fromDegrees(lng, lat, height);
        const headingPitchRoll = new Cesium.HeadingPitchRoll(0, 0, 0);
        const fixedFrameTransform = Cesium.Transforms.localFrameToFixedFrameGenerator('north', 'west');

        const model = await Cesium.Model.fromGltfAsync({
            url: blobUrl,
            modelMatrix: Cesium.Transforms.headingPitchRollToFixedFrame(
                center,
                headingPitchRoll,
                Cesium.Ellipsoid.WGS84,
                fixedFrameTransform,
            ),
            scale: 1.0,
            show: true,
        });

        model.name = name;
        viewer.scene.primitives.add(model);

        return model;
    }

    // ============================================================
    // 主入口 + 管理函数
    // ============================================================

    /**
     * 根据文件扩展名分发到对应的加载函数
     *
     * @param {File} file - 用户选择的文件
     * @returns {Promise<{id: string, name: string, type: string, entity: any}|{needsCoordInput: true}>}
     */
    async function loadDataFile(file) {
        const viewer = getViewer();
        const Cesium = getCesium();

        if (!viewer || !Cesium) {
            message.error('Cesium 3D 场景未就绪，请稍后重试');
            throw new Error('Cesium 未初始化');
        }

        const ext = getExtension(file.name);

        try {
            switch (ext) {
                case 'geojson':
                case 'json': {
                    // 判断是否为 tileset.json（3D Tiles）
                    if (file.name.toLowerCase().includes(TILESET_JSON_INDICATOR)) {
                        return await loadTilesetJSON(file);
                    }
                    return await loadGeoJSON(file);
                }
                case 'kml':
                    return await loadKML(file);
                case 'kmz':
                    return await loadKMZ(file);
                case 'shp':
                    return await loadSHP(file);
                case 'glb':
                case 'gltf':
                    return await loadGLTF(file);
                case 'czml':
                    return await loadCZML(file);
                default:
                    message.error(`不支持的文件格式: .${ext}。支持的格式: GeoJSON, KML/KMZ, SHP, GLB/GLTF, CZML, 3D Tiles`);
                    throw new Error(`不支持的格式: .${ext}`);
            }
        } catch (error) {
            message.error(`加载 "${file.name}" 失败: ${error.message || error}`);
            throw error;
        }
    }

    /**
     * 移除单个已加载的数据源
     * 从 scene 中移除（DataSource 或 Primitive）并回收 Blob URL
     *
     * @param {string} id - 数据源 ID
     */
    function removeDataSource(id) {
        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record) return;

        const viewer = getViewer();
        if (!viewer) return;

        try {
            if (record.type === '3dtiles') {
                viewer.scene.primitives.remove(record.entity);
            } else {
                viewer.dataSources.remove(record.entity, true); // true = 销毁 entity
            }
        } catch (e) {
            console.warn('[CesiumDataImport] 移除数据源失败:', e);
        }

        if (record.blobUrl) {
            revokeBlobUrl(record.blobUrl);
        }

        loadedDataSources.value = loadedDataSources.value.filter((ds) => ds.id !== id);
        message.info(`已移除 "${record.name}"`);
    }

    /**
     * 清除所有已加载的数据源
     * 同时清理 viewer 上可能遗漏的 DataSource（按 entity.name 兜底扫描），
     * 防止组件因任何异常路径没把 record 放进 loadedDataSources 时残留图层。
     */
    function clearAllDataSources() {
        const viewer = getViewer();
        if (!viewer) {
            loadedDataSources.value = [];
            return;
        }

        // 1) 优先按已知记录清理（精确路径）
        for (const record of loadedDataSources.value) {
            try {
                if (record.type === '3dtiles') {
                    viewer.scene.primitives.remove(record.entity);
                } else {
                    viewer.dataSources.remove(record.entity, true);
                }
            } catch (e) {
                console.warn('[CesiumDataImport] 清除数据源失败:', e);
            }

            if (record.blobUrl) {
                revokeBlobUrl(record.blobUrl);
            }
        }

        // 2) 兜底：清空当前 viewer 上所有由本模块加载过的 DataSource（防止被旁路绕过）
        //    限定只清理 DataSource（GeoJSON/KML/CZML/SHP），3D Tiles / Model 不会进入 dataSources。
        if (Array.isArray(viewer.dataSources?.dataSources)) {
            const dataSourceList = viewer.dataSources.dataSources.slice();
            for (const ds of dataSourceList) {
                if (!ds) continue;
                if (ds.isBaseLayerPickerDataSource) continue; // Cesium 内部 base layer
                try {
                    viewer.dataSources.remove(ds, true);
                } catch (e) {
                    console.warn('[CesiumDataImport] 兜底清理 DataSource 失败:', e);
                }
            }
        }

        // 3) 兜底：清除 scene.primitives 中的 3D Tiles / Model（按我们之前注入的元数据）
        const CesiumRuntime = getCesium();
        if (CesiumRuntime && Array.isArray(viewer.scene?.primitives?.primitives)) {
            const primList = viewer.scene.primitives.primitives.slice();
            for (const prim of primList) {
                if (!prim) continue;
                const isOur =
                    prim instanceof CesiumRuntime.Cesium3DTileset ||
                    prim instanceof CesiumRuntime.Model ||
                    (prim.name && /^(geojson_|kml_|kmz_|shp_|czml_|tileset_|gltf_)/.test(String(prim.name || '')));
                if (!isOur) continue;
                try {
                    viewer.scene.primitives.remove(prim);
                } catch (e) {
                    console.warn('[CesiumDataImport] 兜底清理 Primitive 失败:', e);
                }
            }
        }

        loadedDataSources.value = [];
        cancelPendingGltf();
        // 强制刷新一帧，确保所有 remove 生效
        try {
            viewer.scene.requestRender?.();
        } catch {
            // 忽略渲染调度异常
        }
        message.info('已清除所有导入数据');
    }

    return {
        loadDataFile,
        loadedDataSources,
        removeDataSource,
        clearAllDataSources,
        pendingGltfFile,
        loadGltfWithUserCoords,
        cancelPendingGltf,
    };
}