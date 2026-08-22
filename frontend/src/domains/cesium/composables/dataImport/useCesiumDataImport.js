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
import { loadTilesetJSON, loadTilesetFromZip, importTilesetFromDirectory, TILESET_JSON_INDICATOR, MATERIAL_MODES, applyTilesetMaterial, loadSampleTileset, loadSampleBaimoTileset, loadSampleIonTileset, loadSampleI3sTileset, loadSampleDiscreteLODTileset, refitTilesetToTerrain } from './loaders/tilesetLoader.js';

/** 最大高程网格尺寸（超过此尺寸自动降采样） */
const MAX_MESH_SIZE = 200;

/**
 * @param {Object} options
 * @param {Function} options.getViewer - 获取 Cesium Viewer 实例的闭包
 * @param {Function} options.getCesium - 获取 Cesium 命名空间的闭包
 * @param {Object}  options.message - useMessage() 返回的消息实例
 * @param {Object}  [options.heightSampler] - useCesiumHeightSampler 返回的采样器
 * @returns {{ getViewer, loadDataFile, loadDataFiles, loadedDataSources, removeDataSource, clearAllDataSources,
 *    flyToDataSource, pendingGltfFile, repositionTarget, loadGltfWithUserCoords,
 *    cancelPendingGltf, startGltfReposition, confirmGltfReposition, cancelGltfReposition,
 *    stretchRasterToHeight, importTilesetFromDirectory, setTilesetHeight,
 *    MATERIAL_MODES, applyTilesetMaterial, loadSampleTileset }}
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

    const loaderCtx = () => {
        ensureTerrainRefitWatcher();
        return {
            getCesium,
            getViewer,
            message,
            loadedDataSources,
            nextId,
            heightSampler,
        };
    };

    // ============================================================
    // 地形切换 → 3D Tiles 自动重配准
    // 矢量数据（geojson/kml/kmz/shp/czml）的贴地由官方机制承担：
    // DataSource.load 期 clampToGround / heightReference 生成的 GroundPrimitive
    // 会随地形切换自动跟随，无需任何监听；3D Tiles 无该能力，仍需基底采样重新配准。
    // ============================================================

    let terrainWatcherInstalled = false;
    let refitEpoch = 0;

    /** 幂等挂载 terrainProviderChanged 监听；viewer 未就绪时静默，等下次加载再试 */
    function ensureTerrainRefitWatcher() {
        if (terrainWatcherInstalled) return;
        const viewer = getViewer();
        const changed = viewer?.scene?.terrainProviderChanged;
        if (!changed?.addEventListener) return;

        changed.addEventListener(async () => {
            const epoch = ++refitEpoch;
            const Cesium = getCesium();
            const v = getViewer();
            if (!Cesium || !v) return;

            // 仅 3D Tiles：用导入时留存的基底采样重新配准
            let refitted = 0;
            const tilesets = loadedDataSources.value.filter((r) => r.type === '3dtiles');
            for (const record of tilesets) {
                const ok = await refitTilesetToTerrain({
                    record, tileset: toRaw(record.entity), viewer: v, Cesium,
                });
                // 期间用户又切了一次地形：本轮作废，让最新一轮接管
                if (epoch !== refitEpoch) return;
                if (ok) refitted++;
            }

            if (refitted) {
                loadedDataSources.value = [...loadedDataSources.value];
                message?.info?.(`地形已切换，${refitted} 个 3D Tiles 已重新贴地`);
            }
        });
        terrainWatcherInstalled = true;
    }

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
            // Entity 模型：从 viewer.entities 移除旧实体后按新坐标重建
            const oldEntity = toRaw(record.entity);
            if (oldEntity?.model) {
                viewer.entities.remove(oldEntity);
            } else {
                viewer.scene.primitives.remove(oldEntity);
            }
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

            if (type === '3dtiles') {
                viewer.scene.primitives.remove(entity);
            } else if (type === 'gltf') {
                // Entity 模型：从 viewer.entities 移除（兼容历史 primitive 记录）
                if (entity?.model) {
                    viewer.entities.remove(entity);
                } else {
                    viewer.scene.primitives.remove(entity);
                }
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

                if (type === '3dtiles') {
                    viewer.scene.primitives.remove(entity);
                } else if (type === 'gltf') {
                    // Entity 模型：从 viewer.entities 移除（兼容历史 primitive 记录），
                    // 与 removeDataSource 同构——primitives.remove 对 Entity 是静默 no-op
                    if (entity?.model) {
                        viewer.entities.remove(entity);
                    } else {
                        viewer.scene.primitives.remove(entity);
                    }
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

    /**
     * 注册外部加载的数据源（如远程服务 Ion/I3S/3D Tiles）到统一数据源列表。
     * 使远程加载的数据能在数据 Tab 卡片中获得高度、材质、显隐等统一控制。
     * @param {Object} params
     * @param {string} params.name - 显示名称
     * @param {Object} params.entity - Cesium primitive（I3SDataProvider 或 Cesium3DTileset）
     * @param {Object} [params.tilesetGeo] - 贴地几何信息 { lng, lat, bottomH, initialBaseHeight }
     * @param {number} [params.currentBaseHeight] - 当前基座海拔
     * @param {Object} [params.terrainElevation] - 地形高程值域
     * @param {Array} [params.terrainFitSamples] - 基底采样（地形切换时 refit 复用）
     * @param {Object} [params.tilesetOverride] - 实际可操作的 tileset（I3S 等复合 primitive 需要）
     * @returns {string} 数据源 ID
     */
    function registerExternalDataSource({ name, entity, type: customType, tilesetGeo, currentBaseHeight, terrainElevation, terrainFitSamples, tilesetOverride }) {
        const id = `tileset_${++nextId.current}`;
        const record = {
            id,
            name,
            type: customType || '3dtiles',
            entity,
            materialMode: 'none',
            ...(tilesetOverride ? { tileset: tilesetOverride } : {}),
            ...(tilesetGeo ? { tilesetGeo } : {}),
            ...(currentBaseHeight !== undefined ? { currentBaseHeight } : {}),
            ...(terrainElevation ? { terrainElevation } : {}),
            ...(terrainFitSamples ? { terrainFitSamples } : {}),
        };
        loadedDataSources.value = [...loadedDataSources.value, record];
        return id;
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

    /**
     * 手动设置 3D Tiles 的贴地高度（垂直平移滑杆）
     * 将 tileset 底部放置到指定海拔高度
     * @param {string} id - 数据源 ID
     * @param {number} targetBaseHeight - 目标底部海拔（米）
     */
    function setTilesetHeight(id, targetBaseHeight) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) return;

        const record = loadedDataSources.value.find((ds) => ds.id === id);
        if (!record || record.type !== '3dtiles') {
            console.warn('[贴地] setTilesetHeight: 未找到 tileset 记录, id=', id);
            return;
        }

        const { tilesetGeo } = record;
        if (!tilesetGeo) {
            console.warn('[贴地] setTilesetHeight: 记录缺少 tilesetGeo');
            return;
        }

        const targetHeight = Number(targetBaseHeight);
        if (!Number.isFinite(targetHeight)) {
            console.warn('[贴地] setTilesetHeight: 高度值无效, height=', targetBaseHeight);
            return;
        }

        const { initialBaseHeight = tilesetGeo.bottomH } = tilesetGeo;
        const offset = targetHeight - initialBaseHeight;

        // I3S 等复合 primitive：优先使用内部 tileset 引用（entity 本身无 modelMatrix）
        const tileset = toRaw(record.tileset || record.entity);

        // 垂直平移向量：取模型中心点径向方向（地心→模型中心），乘以偏移量。
        // 不能用 fromRadians 两点相减——绕经纬度转换有精度损失，且对 Ion 等
        // 非标准投影数据方向不准；直接用模型中心点坐标归一化才是真·垂直方向。
        const modelCenter = tileset.boundingSphere.center;
        const up = Cesium.Cartesian3.normalize(modelCenter, new Cesium.Cartesian3());
        const translation = Cesium.Cartesian3.multiplyByScalar(up, offset, new Cesium.Cartesian3());
        const translationMatrix = Cesium.Matrix4.fromTranslation(translation);

        // 首次调整时缓存当前 matrix 作为基准（含加载时的地理参考位姿 + 贴地偏移），
        // 后续调整始终基于该基准复合，避免多次拖动累积偏移。
        // 左乘（世界坐标平移），不能右乘——右乘是在模型局部坐标系中平移，
        // 对 Cesium Ion 等 modelMatrix 含旋转的数据会偏向，导致模型斜移/随镜头漂移。
        if (!tileset._originMatrix) {
            tileset._originMatrix = Cesium.Matrix4.clone(tileset.modelMatrix);
        }
        tileset.modelMatrix = Cesium.Matrix4.multiply(
            translationMatrix,
            tileset._originMatrix,
            new Cesium.Matrix4(),
        );
        record.currentBaseHeight = targetHeight;
        loadedDataSources.value = [...loadedDataSources.value];

        console.warn('[贴地] 手动贴地: 底部高度=', targetHeight.toFixed(1),
            'm, ECEF偏移量级=', Cesium.Cartesian3.magnitude(translation).toFixed(1), 'm');
    }

    // ============================================================
    // 导出
    // ============================================================

    return {
        /** 透出 Viewer 访问器：供操作处理器（如材质模式切换）补 requestRender 用 */
        getViewer,
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
        setTilesetHeight,
        MATERIAL_MODES,
        applyTilesetMaterial,
        loadSampleTileset: () => loadSampleTileset(loaderCtx()),
        loadSampleBaimoTileset: () => loadSampleBaimoTileset(loaderCtx()),
        loadSampleIonTileset: () => loadSampleIonTileset(loaderCtx()),
        loadSampleI3sTileset: () => loadSampleI3sTileset(loaderCtx()),
        loadSampleDiscreteLODTileset: () => loadSampleDiscreteLODTileset(loaderCtx()),
        registerExternalDataSource,
    };
}
