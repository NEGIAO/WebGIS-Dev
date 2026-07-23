/**
 * useCesiumDataImport.js
 * Cesium 3D 场景数据导入 composable（主入口）
 *
 * 管理数据源生命周期，按格式分发到对应 loader 模块。
 * 各格式的具体加载逻辑已拆分至 loaders/ 目录下。
 */

import { ref, toRaw } from 'vue';
import { getExtension, flyToEntity, revokeBlobUrl } from './loaders/utils.js';
import { loadGeoJSON } from './loaders/geojsonLoader.js';
import { loadKML, loadKMZ } from './loaders/kmlLoader.js';
import { loadSHP } from './loaders/shpLoader.js';
import { loadGLTF, loadGltfWithCoords } from './loaders/gltfLoader.js';
import { loadCZML } from './loaders/czmlLoader.js';
import { loadGeoTIFF } from './loaders/geotiffLoader.js';
import { loadTilesetJSON, loadTilesetFromZip, importTilesetFromDirectory, TILESET_JSON_INDICATOR } from './loaders/tilesetLoader.js';

/** 最大高程网格尺寸（超过此尺寸自动降采样） */
const MAX_MESH_SIZE = 200;

/**
 * @param {Object} options
 * @param {Function} options.getViewer - 获取 Cesium Viewer 实例的闭包
 * @param {Function} options.getCesium - 获取 Cesium 命名空间的闭包
 * @param {Object}  options.message - useMessage() 返回的消息实例
 * @param {Object}  [options.heightSampler] - useCesiumHeightSampler 返回的采样器
 * @returns {{ loadDataFile, loadDataFiles, loadedDataSources, removeDataSource, clearAllDataSources,
 *    flyToDataSource, pendingGltfFile, repositionTarget, loadGltfWithUserCoords,
 *    cancelPendingGltf, startGltfReposition, confirmGltfReposition, cancelGltfReposition,
 *    stretchRasterToHeight, importTilesetFromDirectory }}
 */
export function useCesiumDataImport({ getViewer, getCesium, message, heightSampler }) {
    /** @type {import('vue').Ref<Array>} */
    const loadedDataSources = ref([]);
    const pendingGltfFile = ref(null);
    const repositionTarget = ref(null);

    const nextId = { current: 0 };
    /** @type {Map<string, { data: Float32Array, width: number, height: number, bbox: object, heightMesh?: any, canvas?: HTMLCanvasElement }>} */
    const rasterCache = new Map();

    // ============================================================
    // 构建各 loader 共享的上下文
    // ============================================================

    const loaderCtx = () => ({
        getCesium,
        getViewer,
        message,
        loadedDataSources,
        nextId,
    });

    // ============================================================
    // GLTF UI 状态管理（坐标弹窗 + 位置调整）
    // ============================================================

    /**
     * 使用用户输入的坐标加载 GLTF/GLB 模型
     * @param {{ lng: number, lat: number, height: number }} coords
     */
    async function loadGltfWithUserCoords(coords) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!pendingGltfFile.value) throw new Error('没有等待确认的模型文件');

        const { blobUrl, name } = pendingGltfFile.value;

        try {
            const model = await loadGltfWithCoords(Cesium, viewer, blobUrl, name, coords);
            const id = `gltf_${++nextId.current}`;

            const record = { id, name, type: 'gltf', entity: model, blobUrl };
            loadedDataSources.value = [...loadedDataSources.value, record];

            message.success(
                `3D 模型 "${name}" 加载成功 (${coords.lng.toFixed(4)}, ${coords.lat.toFixed(4)}, ${coords.height.toFixed(1)}m)`,
            );

            const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, coords.height + 500);
            viewer.camera.flyTo({
                destination: position,
                orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
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

    function cancelPendingGltf() {
        if (pendingGltfFile.value) {
            revokeBlobUrl(pendingGltfFile.value.blobUrl);
            pendingGltfFile.value = null;
        }
    }

    function startGltfReposition(id) {
        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record || record.type !== 'gltf') {
            message.warning('该数据源不支持位置调整');
            return;
        }
        repositionTarget.value = record;
    }

    async function confirmGltfReposition(coords) {
        const record = repositionTarget.value;
        if (!record) return;

        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) return;

        try {
            viewer.scene.primitives.remove(toRaw(record.entity));
            const model = await loadGltfWithCoords(Cesium, viewer, record.blobUrl, record.name, coords);

            record.entity = model;
            record.position = { ...coords };

            const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, coords.height + 500);
            viewer.camera.flyTo({
                destination: position,
                orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
                duration: 1.5,
            });

            message.success(`模型已移动到 (${coords.lng.toFixed(4)}, ${coords.lat.toFixed(4)}, ${coords.height.toFixed(1)}m)`);
            try { viewer.scene.requestRender?.(); } catch { /* ignore */ }
        } catch (error) {
            message.error(`位置调整失败: ${error.message || error}`);
        } finally {
            repositionTarget.value = null;
        }
    }

    function cancelGltfReposition() {
        repositionTarget.value = null;
    }

    // ============================================================
    // 单波段 GeoTIFF → 高程网格拉伸
    // ============================================================

    async function stretchRasterToHeight(id, options = {}) {
        const cache = rasterCache.get(id);
        if (!cache) {
            message.warning('该数据不是单波段 GeoTIFF，无法拉伸到高程');
            return false;
        }
        if (cache.heightMesh) {
            message.info('已拉伸到高程，如需调整请移除后重新拉伸');
            return false;
        }

        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) return false;

        const { data, width, height, bbox, canvas } = cache;
        const exaggeration = options.exaggeration ?? 1.0;
        const gridW = Math.min(width, MAX_MESH_SIZE);
        const gridH = Math.min(height, MAX_MESH_SIZE);
        const stepX = Math.max(1, Math.floor(width / gridW));
        const stepY = Math.max(1, Math.floor(height / gridH));
        const cols = Math.ceil(width / stepX);
        const rows = Math.ceil(height / stepY);

        let dataMin = Infinity, dataMax = -Infinity;
        for (let i = 0; i < data.length; i++) {
            if (Number.isFinite(data[i])) {
                if (data[i] < dataMin) dataMin = data[i];
                if (data[i] > dataMax) dataMax = data[i];
            }
        }

        const { west, south, east, north } = bbox;
        const lngStep = (east - west) / (cols - 1);
        const latStep = (north - south) / (rows - 1);

        const numVerts = rows * cols;
        const positions = new Float64Array(numVerts * 3);
        const indices = [];

        for (let row = 0; row < rows; row++) {
            const srcY = Math.min(row * stepY, height - 1);
            for (let col = 0; col < cols; col++) {
                const srcX = Math.min(col * stepX, width - 1);
                const rawVal = data[srcY * width + srcX];
                const h = Number.isFinite(rawVal) ? rawVal * exaggeration : 0;
                const lng = west + col * lngStep;
                const lat = south + row * latStep;
                const cartesian = Cesium.Cartesian3.fromDegrees(lng, lat, h);
                const vi = (row * cols + col) * 3;
                positions[vi] = cartesian.x;
                positions[vi + 1] = cartesian.y;
                positions[vi + 2] = cartesian.z;
            }
        }

        for (let row = 0; row < rows - 1; row++) {
            for (let col = 0; col < cols - 1; col++) {
                const i = row * cols + col;
                indices.push(i, i + 1, i + cols);
                indices.push(i + 1, i + cols + 1, i + cols);
            }
        }

        const uvs = new Float32Array(numVerts * 2);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const vi = (row * cols + col) * 2;
                uvs[vi] = col / (cols - 1);
                uvs[vi + 1] = row / (rows - 1);
            }
        }

        const geometry = new Cesium.Geometry({
            attributes: {
                position: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.DOUBLE,
                    componentsPerAttribute: 3,
                    values: positions,
                }),
                st: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 2,
                    values: uvs,
                }),
            },
            indices: new Uint16Array(indices),
            primitiveType: Cesium.PrimitiveType.TRIANGLES,
            boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
        });

        const appearance = canvas
            ? new Cesium.MaterialAppearance({
                material: Cesium.Material.fromType('Image', { image: canvas }),
                translucent: false,
                closed: false,
            })
            : new Cesium.MaterialAppearance({
                material: Cesium.Material.fromType('Color', {
                    color: new Cesium.Color(0.8, 0.85, 0.9, 0.85),
                }),
                translucent: true,
                closed: false,
            });

        const primitive = new Cesium.Primitive({
            geometryInstances: new Cesium.GeometryInstance({ geometry }),
            appearance,
            asynchronous: false,
        });

        viewer.scene.primitives.add(primitive);
        cache.heightMesh = primitive;

        // 移除平铺影像层，用纹理网格替代
        const record = loadedDataSources.value.find((r) => r.id === id);
        if (record) {
            const rawEntity = toRaw(record.entity);
            if (rawEntity instanceof Cesium.ImageryLayer) {
                viewer.imageryLayers.remove(rawEntity);
            }
            if (record.blobUrl) {
                revokeBlobUrl(record.blobUrl);
                record.blobUrl = null;
            }
            record.entity = primitive;
        }

        const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);
        viewer.camera.flyTo({ destination: rect, duration: 2 });

        message.success(
            `高程网格已生成（${cols}×${rows}，高度范围 ${(dataMin * exaggeration).toFixed(1)}m ~ ${(dataMax * exaggeration).toFixed(1)}m）`
            + (canvas ? '，影像已贴合网格' : ''),
        );
        return true;
    }

    // ============================================================
    // 主入口：按扩展名分发
    // ============================================================

    async function loadDataFile(file) {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) {
            message.error('Cesium 3D 场景未就绪，请稍后重试');
            throw new Error('Cesium 未初始化');
        }

        const ext = getExtension(file.name);
        const baseCtx = loaderCtx();

        try {
            switch (ext) {
                case 'geojson':
                case 'json': {
                    if (file.name.toLowerCase().includes(TILESET_JSON_INDICATOR)) {
                        return await loadTilesetJSON({ file, ...baseCtx });
                    }
                    return await loadGeoJSON({ file, ...baseCtx });
                }
                case 'kml':
                    return await loadKML({ file, ...baseCtx });
                case 'kmz':
                    return await loadKMZ({ file, ...baseCtx });
                case 'shp':
                    return await loadSHP({ file, ...baseCtx });
                case 'glb':
                case 'gltf': {
                    const result = await loadGLTF({ file, ...baseCtx, heightSampler });
                    if (result.needsCoordInput) {
                        if (pendingGltfFile.value) {
                            revokeBlobUrl(pendingGltfFile.value.blobUrl);
                        }
                        pendingGltfFile.value = { file: result.file, blobUrl: result.blobUrl, name: result.file.name };
                        return result;
                    }
                    return result;
                }
                case 'tif':
                case 'tiff':
                    return await loadGeoTIFF({ file, ...baseCtx, rasterCache });
                case 'czml':
                    return await loadCZML({ file, ...baseCtx });
                case 'zip':
                    return await loadTilesetFromZip({ zipFile: file, ...baseCtx });
                default:
                    message.error(`不支持的文件格式: .${ext}。支持的格式: GeoJSON, KML/KMZ, SHP, GLB/GLTF, CZML, 3D Tiles, GeoTIFF`);
                    throw new Error(`不支持的格式: .${ext}`);
            }
        } catch (error) {
            message.error(`加载 "${file.name}" 失败: ${error.message || error}`);
            throw error;
        }
    }

    /**
     * 批量导入多文件：自动按 basename 分组，SHP 配套文件合并处理
     */
    async function loadDataFiles(files) {
        const shpGroups = new Map();
        const standalone = [];

        for (const file of files) {
            const ext = getExtension(file.name);
            if (['shp', 'dbf', 'shx', 'prj', 'cpg'].includes(ext)) {
                const baseName = file.name.replace(/\.[^.]+$/, '');
                if (!shpGroups.has(baseName)) {
                    shpGroups.set(baseName, { shp: null, sidecars: [] });
                }
                const group = shpGroups.get(baseName);
                if (ext === 'shp') group.shp = file;
                else group.sidecars.push(file);
            } else {
                standalone.push(file);
            }
        }

        const results = [];
        const baseCtx = loaderCtx();

        for (const [, group] of shpGroups) {
            if (!group.shp) continue;
            try {
                const result = await loadSHP({ file: group.shp, sidecarFiles: group.sidecars, ...baseCtx });
                results.push(result);
            } catch { /* 内部已通过 message.error 提示 */ }
        }

        for (const file of standalone) {
            try {
                const result = await loadDataFile(file);
                if (result) results.push(result);
            } catch { /* 内部已提示 */ }
        }

        return results;
    }

    // ============================================================
    // 数据源管理：移除 / 清空 / 定位
    // ============================================================

    function removeDataSource(id) {
        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record) return;

        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) return;

        try {
            const entity = toRaw(record.entity);
            const type = record.type;

            if (type === '3dtiles' || type === 'gltf') {
                viewer.scene.primitives.remove(entity);
            } else if (type === 'tif') {
                if (entity instanceof Cesium.ImageryLayer) {
                    viewer.imageryLayers.remove(entity);
                } else {
                    viewer.scene.primitives.remove(entity);
                }
            } else {
                viewer.dataSources.remove(entity, true);
            }
        } catch (e) {
            console.warn('[CesiumDataImport] 移除数据源失败:', e);
        }

        if (record.blobUrl) revokeBlobUrl(record.blobUrl);
        if (record.blobUrls && Array.isArray(record.blobUrls)) {
            for (const url of record.blobUrls) revokeBlobUrl(url);
        }

        const rasterEntry = rasterCache.get(id);
        if (rasterEntry?.heightMesh) {
            try { viewer.scene.primitives.remove(rasterEntry.heightMesh); } catch { /* ignore */ }
        }
        rasterCache.delete(id);

        loadedDataSources.value = loadedDataSources.value.filter((ds) => ds.id !== id);
        message.info(`已移除 "${record.name}"`);
    }

    function clearAllDataSources() {
        const viewer = getViewer();
        if (!viewer) {
            loadedDataSources.value = [];
            return;
        }

        const Cesium = getCesium();

        for (const record of loadedDataSources.value) {
            try {
                const entity = toRaw(record.entity);
                const type = record.type;

                if (type === '3dtiles' || type === 'gltf') {
                    viewer.scene.primitives.remove(entity);
                } else if (type === 'tif') {
                    if (Cesium && entity instanceof Cesium.ImageryLayer) {
                        viewer.imageryLayers.remove(entity);
                    } else {
                        viewer.scene.primitives.remove(entity);
                    }
                } else {
                    viewer.dataSources.remove(entity, true);
                }
            } catch (e) {
                console.warn('[CesiumDataImport] 清除数据源失败:', e);
            }

            if (record.blobUrl) revokeBlobUrl(record.blobUrl);
            if (record.blobUrls && Array.isArray(record.blobUrls)) {
                for (const url of record.blobUrls) revokeBlobUrl(url);
            }
        }

        for (const [, entry] of rasterCache) {
            if (entry.heightMesh) {
                try { viewer.scene.primitives.remove(entry.heightMesh); } catch { /* ignore */ }
            }
        }
        rasterCache.clear();

        // 兜底：清空 DataSource
        if (Array.isArray(viewer.dataSources?.dataSources)) {
            const dataSourceList = viewer.dataSources.dataSources.slice();
            for (const ds of dataSourceList) {
                if (!ds || ds.isBaseLayerPickerDataSource) continue;
                try { viewer.dataSources.remove(ds, true); } catch (e) {
                    console.warn('[CesiumDataImport] 兜底清理 DataSource 失败:', e);
                }
            }
        }

        // 兜底：清除 scene.primitives 中的 3D Tiles / Model
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
                try { viewer.scene.primitives.remove(prim); } catch (e) {
                    console.warn('[CesiumDataImport] 兜底清理 Primitive 失败:', e);
                }
            }
        }

        loadedDataSources.value = [];
        cancelPendingGltf();
        try { viewer.scene.requestRender?.(); } catch { /* ignore */ }
        message.info('已清除所有导入数据');
    }

    function flyToDataSource(id) {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) return;

        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record || !record.entity) {
            message.warning('未找到对应的数据源');
            return;
        }

        flyToEntity(viewer, Cesium, toRaw(record.entity), record.type);
        message.info(`已定位到 "${record.name}"`);
    }

    // ============================================================
    // 导出
    // ============================================================

    return {
        loadDataFile,
        loadDataFiles,
        importTilesetFromDirectory: () => importTilesetFromDirectory(loaderCtx()),
        loadedDataSources,
        removeDataSource,
        clearAllDataSources,
        flyToDataSource,
        pendingGltfFile,
        repositionTarget,
        loadGltfWithUserCoords,
        cancelPendingGltf,
        startGltfReposition,
        confirmGltfReposition,
        cancelGltfReposition,
        stretchRasterToHeight,
    };
}
