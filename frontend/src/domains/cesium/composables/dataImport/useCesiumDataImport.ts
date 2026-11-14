/**
 * useCesiumDataImport.js
 * Cesium 3D 场景数据导入 composable（主入口）
 *
 * 管理数据源生命周期，按格式分发到对应 loader 模块。
 * 各格式的具体加载逻辑已拆分至 loaders/ 目录下。
 */

import { ref, shallowRef, watch } from 'vue';
import { getExtension, revokeBlobUrl } from './loaders/utils';
import {
    applyOnImport,
    reapplyAllOnTerrainChange,
} from '../terrain/groundPlacementService';
import {
    clearPendingGroundFits,
    dropPendingGroundFit,
} from '../terrain/terrainReadiness';
import { withImportMask } from '@common/data-import/yieldUi';
import { loadGeoJSON } from './loaders/geojsonLoader';
import { parseCsvToGeoJSON, parseWktToGeoJSON } from '@common/data-import/parsers/tabularParser';
import { loadKML, loadKMZ } from './loaders/kmlLoader';
import { loadSHP } from './loaders/shpLoader';
import { loadGLTF } from './loaders/gltfLoader';
import { loadCZML } from './loaders/czmlLoader';
import { loadGeoTIFF } from './loaders/geotiffLoader';
import { loadTilesetJSON, loadTilesetFromZip, importTilesetFromDirectory, TILESET_JSON_INDICATOR, MATERIAL_MODES, applyTilesetMaterial, loadSampleTileset, loadSampleBaimoTileset, loadSampleIonTileset, loadSampleI3sTileset, loadSampleDiscreteLODTileset } from './loaders/tilesetLoader';
import { createGltfRepositionTools } from './gltfReposition';
import { createRasterHeightMeshBuilder } from './rasterHeightMesh';
import { createDataSourceLifecycle } from './dataSourceLifecycle';
import { createDataSourceOps } from './dataSourceOps';
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
export function useCesiumDataImport({
    getViewer,
    getCesium,
    message,
    heightSampler,
}: {
    getViewer: any;
    getCesium: any;
    message: any;
    heightSampler?: any;
}) {
    /** @type {import('vue').Ref<Array>} */
    // shallowRef：记录内持有 Cesium DataSource/tileset/entity 原生句柄，
    // 深代理会让同一对象在场景与 Vue 侧出现双身份（下游被迫处处 toRaw），
    // 且所有写入点均为整组替换（loaders/filter/同步），无深度响应依赖
    const loadedDataSources = shallowRef<any[]>([]);
    const pendingGltfFile = ref<any>(null);
    const repositionTarget = ref<any>(null);

    const nextId: { current: number } = { current: 0 };
    /** @type {Map<string, { data: Float32Array, width: number, height: number, bbox: object, heightMesh?: any, canvas?: HTMLCanvasElement }>} */
    const rasterCache = new Map();

    // GLTF 坐标弹窗状态：busy=坐标提交后的加载中；error=上次提交的失败信息（保留在弹窗内展示）
    const gltfLoading = ref(false);
    const gltfLoadError = ref('');

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
    // 子模块装配（依赖注入，闭包状态仍由本 composable 唯一持有）
    // ============================================================

    const {
        loadGltfWithUserCoords,
        cancelPendingGltf,
        startGltfReposition,
        confirmGltfReposition,
        cancelGltfReposition,
    } = createGltfRepositionTools({
        getCesium,
        getViewer,
        message,
        loadedDataSources,
        nextId,
        pendingGltfFile,
        repositionTarget,
        gltfLoading,
        gltfLoadError,
    });

    const { stretchRasterToHeight } = createRasterHeightMeshBuilder({
        getCesium,
        getViewer,
        message,
        loadedDataSources,
        rasterCache,
    });

    const { registerExternalDataSource, loadRemoteGlb, flyToDataSource, setTilesetHeight } =
        createDataSourceOps({ getCesium, getViewer, message, loadedDataSources, nextId, loaderCtx });

    const { removeDataSource, clearAllDataSources } = createDataSourceLifecycle({
        getCesium,
        getViewer,
        message,
        loadedDataSources,
        rasterCache,
        cancelPendingGltf,
    });

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
    const groundAppliedIds = new Set<string>();
    watch(
        loadedDataSources,
        (list) => {
            const Cesium = getCesium();
            const viewer = getViewer();
            if (!Cesium || !viewer) return;

            const alive = new Set<string>();
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
    // 主入口：按扩展名分发
    // ============================================================

    async function loadDataFile(
        file: File,
        options: { overrideCrs?: string; silent?: boolean } = {},
    ) {
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
                // 本系统导出的 CSV / WKT：先转成 GeoJSON，再复用 loadGeoJSON
                // （沿用同一套重投影、白模配色、贴地与 TOC 登记）
                case 'csv':
                case 'txt':
                case 'wkt': {
                    const text = await file.text();
                    const geojsonData = file.name.toLowerCase().endsWith('.csv')
                        ? parseCsvToGeoJSON(text)
                        : parseWktToGeoJSON(text);
                    if (!geojsonData?.features?.length) {
                        throw new Error(
                            file.name.toLowerCase().endsWith('.csv')
                                ? 'CSV 中没有可识别的坐标数据（需包含 lng/lat 或 经度/纬度 列）'
                                : 'TXT 中没有可识别的 WKT 几何（应为 POINT / LINESTRING / POLYGON 等）',
                        );
                    }
                    const geojsonFile = new File(
                        [JSON.stringify(geojsonData)],
                        `${file.name.replace(/\.[^.]+$/, '')}.geojson`,
                        { type: 'application/geo+json' },
                    );
                    return await loadGeoJSON({ file: geojsonFile, ...baseCtx });
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
        } catch (error: any) {
            message.error(`加载 "${file.name}" 失败: ${error?.message || error}`);
            throw error;
        }
    }

    /**
     * 批量导入多文件：自动按 basename 分组，SHP 配套文件合并处理
     * 外层统一挂 GlobalLoading 导入遮罩（showLoading + 双 rAF 握手后才开始重活，
     * 大文件解析期间界面有明确反馈且不冻结）
     */
    async function loadDataFiles(files: File[], options: { overrideCrs?: string; silent?: boolean } = {}) {
        // silent：Agent 搜索结果落图这类「不该打断用户」的导入不挂遮罩，
        // 失败也由调用方以工具结果形式回传，而不是弹红色提示。
        if (options?.silent) {
            return importFilesInternal(files, options);
        }
        return withImportMask('正在导入数据，请稍候…', () => importFilesInternal(files, options));
    }

    async function importFilesInternal(files: File[], options: { overrideCrs?: string; silent?: boolean } = {}) {
        // 人工指定的源坐标系，逐文件透传（空串=自动识别）
        const overrideCrs = String(options?.overrideCrs || '').trim();
        const shpGroups = new Map<string, { shp: File | null; sidecars: File[] }>();
        const standalone: File[] = [];

        for (const file of files) {
            const ext = getExtension(file.name);
            if (['shp', 'dbf', 'shx', 'prj', 'cpg'].includes(ext)) {
                const baseName = file.name.replace(/\.[^.]+$/, '');
                if (!shpGroups.has(baseName)) {
                    shpGroups.set(baseName, { shp: null, sidecars: [] });
                }
                const group = shpGroups.get(baseName);
                if (!group) continue;
                if (ext === 'shp') group.shp = file;
                else group.sidecars.push(file);
            } else {
                standalone.push(file);
            }
        }

        const results: any[] = [];
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
