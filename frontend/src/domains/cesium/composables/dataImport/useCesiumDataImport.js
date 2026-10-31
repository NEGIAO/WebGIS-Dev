/**
 * useCesiumDataImport.js
 * Cesium 3D 场景数据导入 composable（主入口）
 *
 * 管理数据源生命周期，按格式分发到对应 loader 模块。
 * 各格式的具体加载逻辑已拆分至 loaders/ 目录下。
 */

import { ref, shallowRef, toRaw, watch } from 'vue';
import { getExtension, flyToEntity, revokeBlobUrl, detachEntityFromScene } from './loaders/utils.js';
import {
    applyOnImport,
    reapplyAllOnTerrainChange,
} from '../terrain/groundPlacementService';
import {
    clearPendingGroundFits,
    dropPendingGroundFit,
} from '../terrain/terrainReadiness';
import { withImportMask } from '@common/data-import/yieldUi.js';
import { loadGeoJSON } from './loaders/geojsonLoader.js';
import { loadKML, loadKMZ } from './loaders/kmlLoader.js';
import { loadSHP } from './loaders/shpLoader.js';
import { loadGLTF, loadGltfWithCoords, loadGltfFromUrl } from './loaders/gltfLoader.js';
import { loadCZML } from './loaders/czmlLoader.js';
import { loadGeoTIFF } from './loaders/geotiffLoader.js';
import { loadTilesetJSON, loadTilesetFromZip, importTilesetFromDirectory, TILESET_JSON_INDICATOR, MATERIAL_MODES, applyTilesetMaterial, loadSampleTileset, loadSampleBaimoTileset, loadSampleIonTileset, loadSampleI3sTileset, loadSampleDiscreteLODTileset } from './loaders/tilesetLoader.js';

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
    // shallowRef：记录内持有 Cesium DataSource/tileset/entity 原生句柄，
    // 深代理会让同一对象在场景与 Vue 侧出现双身份（下游被迫处处 toRaw），
    // 且所有写入点均为整组替换（loaders/filter/同步），无深度响应依赖
    const loadedDataSources = shallowRef([]);
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

            /**
             * 统一门面接管「地形切换后的重贴」：
             * 3D Tiles 重配准、矢量补 clamp、glTF 相对地形，全在策略里分派，
             * 调用方不再按类型写分支（这正是过去「只重贴 3D Tiles、矢量漏掉」的根因）。
             */
            const summary = await reapplyAllOnTerrainChange({
                records: loadedDataSources.value,
                viewer: v,
                Cesium,
            });
            // 期间用户又切了一次地形：本轮作废，让最新一轮接管
            if (epoch !== refitEpoch) return;
            // 队列里的待补做请求已被本轮覆盖（记录都在 loadedDataSources 内），直接清空
            clearPendingGroundFits();

            if (summary.fitted > 0) {
                loadedDataSources.value = [...loadedDataSources.value];
                message?.info?.(`地形已切换，${summary.fitted} 个图层已重新贴合地形`);
            }
            if (summary.failed > 0) {
                message?.warning?.(`${summary.failed} 个图层贴合地形失败，可在图层目录右键「贴合地形」重试`);
            }
        });
        terrainWatcherInstalled = true;
    }

    /**
     * 导入即贴地：**唯一入口**。
     * 监听 loadedDataSources 的新增记录，交给门面按类型分派；
     * 地形未就绪时门面会自动入队，等地形就绪后由 terrainProviderChanged 统一补做。
     */
    const groundAppliedIds = new Set();
    watch(
        loadedDataSources,
        (list) => {
            const Cesium = getCesium();
            const viewer = getViewer();
            if (!Cesium || !viewer) return;

            const alive = new Set();
            for (const record of list || []) {
                alive.add(record.id);
                if (groundAppliedIds.has(record.id)) continue;
                groundAppliedIds.add(record.id);
                void applyOnImport({ record, viewer, Cesium });
            }
            // 记录被移除：清理去重表与待补做队列，避免持有已销毁句柄
            [...groundAppliedIds].forEach((id) => {
                if (alive.has(id)) return;
                groundAppliedIds.delete(id);
                dropPendingGroundFit(id);
            });
        },
        { flush: 'post' },
    );

    // ============================================================
    // GLTF UI 状态管理（坐标弹窗 + 位置调整）
    // ============================================================

    // GLTF 坐标弹窗状态：busy=坐标提交后的加载中；error=上次提交的失败信息（保留在弹窗内展示）
    const gltfLoading = ref(false);
    const gltfLoadError = ref('');

    /**
     * 使用用户输入的坐标加载 GLTF/GLB 模型
     * 失败时保留 pendingGltfFile 与用户输入：弹窗不关闭，可重试或显式取消
     * @param {{ lng: number, lat: number, height: number }} coords
     */
    async function loadGltfWithUserCoords(coords) {
        const Cesium = getCesium();
        const viewer = getViewer();
        if (!pendingGltfFile.value) throw new Error('没有等待确认的模型文件');

        const { blobUrl, name } = pendingGltfFile.value;
        gltfLoading.value = true;
        gltfLoadError.value = '';

        try {
            const model = await loadGltfWithCoords(Cesium, viewer, blobUrl, name, coords);
            const id = `gltf_${++nextId.current}`;

            // modelHeightOffset 保存用户输入的语义高度：贴地策略据此保持
            // 「相对地形的高度」，避免 applyOnImport 把语义高度抹成 0
            const record = {
                id,
                name,
                type: 'gltf',
                entity: model,
                blobUrl,
                modelHeightOffset: Number(coords?.height) || 0,
            };
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
            // 仅记录失败原因，不动 pendingGltfFile：弹窗保持打开、坐标保留可重试
            gltfLoadError.value = error?.message || String(error);
            throw error;
        } finally {
            gltfLoading.value = false;
        }
    }

    function cancelPendingGltf() {
        if (pendingGltfFile.value) {
            gltfLoadError.value = '';
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

        gltfLoading.value = true;
        gltfLoadError.value = '';

        const oldEntity = toRaw(record.entity);
        const oldHadModel = !!oldEntity?.model;
        // 新模型是否已成功替换（替换成功后失败不再回滚旧实体，防双份挂载）
        let swapped = false;

        try {
            // Entity 模型：从 viewer.entities 移除旧实体后按新坐标重建
            // 远程 GLB 无 blobUrl，用 sourceUrl；本地 File 用 blobUrl
            const uri = record.sourceUrl || record.blobUrl;
            if (!uri) {
                message.error('缺少模型地址，无法重定位');
                return;
            }
            if (oldHadModel) {
                viewer.entities.remove(oldEntity);
            } else {
                viewer.scene.primitives.remove(oldEntity);
            }
            const model = await loadGltfWithCoords(
                Cesium,
                viewer,
                uri,
                record.name,
                coords,
            );
            swapped = true;
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
            repositionTarget.value = null;
        } catch (error) {
            // 失败时保留 repositionTarget：弹窗不自动关闭；若新模型尚未成功替换，
            // 把已移除的旧实体/图元挂回场景，用户可修正坐标重试或显式取消
            if (!swapped && oldEntity) {
                try {
                    if (oldHadModel) {
                        viewer.entities.add(oldEntity);
                    } else {
                        viewer.scene.primitives.add(oldEntity);
                    }
                } catch { /* ignore */ }
            }
            gltfLoadError.value = error?.message || String(error);
            message.error(`位置调整失败: ${error.message || error}（弹窗保留，可重试或取消）`);
        } finally {
            gltfLoading.value = false;
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

    async function loadDataFile(file, options = {}) {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) {
            message.error('Cesium 3D 场景未就绪，请稍后重试');
            throw new Error('Cesium 未初始化');
        }

        const ext = getExtension(file.name);
        const baseCtx = loaderCtx();
        const overrideCrs = String(options?.overrideCrs || '').trim();

        try {
            switch (ext) {
                case 'geojson':
                case 'json': {
                    if (file.name.toLowerCase().includes(TILESET_JSON_INDICATOR)) {
                        return await loadTilesetJSON({ file, ...baseCtx });
                    }
                    return await loadGeoJSON({ file, overrideCrs, silent: !!options?.silent, ...baseCtx });
                }
                case 'kml':
                    return await loadKML({ file, overrideCrs, ...baseCtx });
                case 'kmz':
                    return await loadKMZ({ file, overrideCrs, ...baseCtx });
                case 'shp':
                    return await loadSHP({ file, overrideCrs, ...baseCtx });
                case 'glb':
                case 'gltf': {
                    const result = await loadGLTF({ file, ...baseCtx, heightSampler });
                    if (result.needsCoordInput) {
                        // 已有模型在等坐标确认：保留第一个（撤销第二个的无声丢失），
                        // 新文件仅提示，不进入弹窗
                        if (pendingGltfFile.value) {
                            revokeBlobUrl(result.blobUrl);
                            message.info(
                                `已有模型 "${pendingGltfFile.value.name}" 等待坐标确认，"${result.file.name}" 暂未导入；确认或取消后再试`,
                            );
                            return { skipped: true, file: result.file };
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
     * 外层统一挂 GlobalLoading 导入遮罩（showLoading + 双 rAF 握手后才开始重活，
     * 大文件解析期间界面有明确反馈且不冻结）
     */
    async function loadDataFiles(files, options = {}) {
        // silent：Agent 搜索结果落图这类「不该打断用户」的导入不挂遮罩，
        // 失败也由调用方以工具结果形式回传，而不是弹红色提示。
        if (options?.silent) {
            return importFilesInternal(files, options);
        }
        return withImportMask('正在导入数据，请稍候…', () => importFilesInternal(files, options));
    }

    async function importFilesInternal(files, options = {}) {
        // 人工指定的源坐标系，逐文件透传（空串=自动识别）
        const overrideCrs = String(options?.overrideCrs || '').trim();
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
                const result = await loadSHP({
                    file: group.shp,
                    sidecarFiles: group.sidecars,
                    overrideCrs,
                    ...baseCtx,
                });
                results.push(result);
            } catch { /* 内部已通过 message.error 提示 */ }
        }

        for (const file of standalone) {
            try {
                const result = await loadDataFile(file, { overrideCrs, silent: !!options?.silent });
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

            // ── 对象级宿主探测优先（V3.5.32 不同步修复）──
            // 以句柄的真实容器挂载关系分派卸载，消除注册方 type 错配
            // （如影像/地形被记成 '3dtiles'）造成的 primitives.remove 静默 no-op。
            // 未命中任何容器时才回退到按 type 的兼容分支（100% 向后兼容）。
            const detached = detachEntityFromScene({ viewer, Cesium, entity, type });

            if (!detached) {
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
                console.warn('[CesiumDataImport] 数据源句柄未命中场景宿主容器，已回退 type 分支处理', { id, type });
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

                // ── 对象级宿主探测优先（与 removeDataSource 同构）：──
                // 防注册方 type 错配时的 primitives.remove(ImageryLayer/TerrainProvider)
                // 静默 no-op 造成清空后场景残留
                const detached = detachEntityFromScene({ viewer, Cesium, entity, type });

                if (!detached) {
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
                    console.warn('[CesiumDataImport] 数据源句柄未命中场景宿主容器，已回退 type 分支处理', { id: record.id, type });
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

    /**
     * 远程 GLB/GLTF 直链加载（与本地 File 导入同一条数据源注册路径）。
     * @param {string} url - http(s) 直链
     * @param {string} [name] - 显示名
     */
    async function loadRemoteGlb(url, name) {
        return await loadGltfFromUrl({ url, name, ...loaderCtx() });
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
        /** 资源 id 计数器（loader / 远程 GLB 共用） */
        nextId,
        removeDataSource,
        clearAllDataSources,
        flyToDataSource,
        pendingGltfFile,
        /** GLTF 坐标弹窗状态：坐标提交加载中 / 上次提交失败信息 */
        gltfLoading,
        gltfLoadError,
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
        /** 远程 GLB/GLTF 直链（数据源注册与本地导入一致） */
        loadRemoteGlb,
        registerExternalDataSource,
    };
}
