/**
 * 功能名称：自定义 Ion 资源 / 远程 3D 数据管理器
 * 日    期：2026/11/13
 *
 * 从 useCesiumLayers 拆出：Ion Asset（影像/地形/3D Tiles 自动识别）与
 * 远程 URL（I3S/3D Tiles 直链，含 Web-Mercator 投影适配）两类加载路径。
 * 共享一套 primitive 状态与 loadId 竞态防护；贴地 2.0 与高度偏移基准
 * （originMatrix）随 tileset 生命周期管理。
 */

import { watch } from 'vue';
import { applyCesiumIonToken } from '../core/cesiumRuntime';
import { fitTilesetToTerrain } from '../dataImport/loaders/tilesetLoader';
import { WEB_MERCATOR_WKIDS, registerI3SProjectionAdapter } from './i3sWebMercator';
import { destroyPrimitive } from './layerUtils';

export interface CustomIonLayerCtx {
    /** 宿主 Viewer 获取器 */
    getViewer?: () => any;
    /** Cesium 命名空间获取器 */
    getCesium?: () => any;
    /** 消息系统 */
    message?: any;
    /** 数据导入模块（外部数据源注册） */
    dataImport?: any;
    /** Ion Asset ID ref */
    customIonAssetId: { value: string };
    /** 已识别资产类型 ref */
    loadedAssetType: { value: string | null };
    /** 高度偏移 ref（watch 在本工厂内接线） */
    customIonHeightOffset: { value: number };
    /** 自定义 Ion 显隐 ref */
    customIon3DTilesVisible: { value: boolean };
    /** Ion tileset 就绪 ref */
    customIonTilesetReady: { value: boolean };
    /** OSM Buildings 显隐 ref（globe 恢复判定） */
    osmBuildingsVisible: { value: boolean };
    /** Google 倾斜摄影显隐 ref（globe 恢复判定） */
    googlePhotorealistic3DTilesVisible: { value: boolean };
    /** 当前地形 ref（清理解除时恢复） */
    activeTerrain: { value: string };
    /** 地形 Provider 构造（清理解除时恢复） */
    createTerrainProviderById: (value: string) => any;
    /** ion token 实时读取 */
    getCesiumIonToken: () => string;
}

/**
 * 创建自定义 Ion / 远程 3D 数据管理器
 * @param ctx 宿主依赖
 * @returns sync/ensure/load/clear/submit 八个入口
 */
export function createCustomIonLayerManager(ctx: CustomIonLayerCtx) {
    const {
        getViewer, getCesium, message, dataImport, customIonAssetId, loadedAssetType,
        customIonHeightOffset, customIon3DTilesVisible, customIonTilesetReady,
        osmBuildingsVisible, googlePhotorealistic3DTilesVisible, activeTerrain,
        createTerrainProviderById, getCesiumIonToken,
    } = ctx;
    let customIonTileset: any = null;
    let customIonPrimitive: any = null;  // 实际加入 scene 的 primitive（I3SDataProvider 或 Cesium3DTileset）
    let isRemoteServiceLoad = false;  // 标记当前 primitive 是否来自远程服务加载（I3S/3D Tiles URL）
    let customI3SProjectionAdapterRelease: any = null;
    let customIonTilesetLoadPromise: any = null;
    let customIonTilesetLoadId = 0;
    let customIonImageryLayer: any = null;
    let customIonTerrainProvider: any = null;
    // 闭包变量：保存 tileset 原始 modelMatrix，作为高度偏移基准
    // 生命周期与 customIonTileset 绑定（load 时赋值，clear 时置 null）
    let originMatrix: any = null;

    // 高度偏移滑杆 → 基于原始矩阵复合平移
    watch(customIonHeightOffset, (offset: any) => {
        const Cesium = getCesium?.();
        if (!customIonTileset || !Cesium) return;

        try {
            const center = customIonTileset.boundingSphere.center;

            // 获取本地 ENU 坐标系下的”向上”法向量（Up Vector）
            const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
                center,
                new Cesium.Cartesian3(),
            );

            // 计算沿地表法线移动 offset 距离的平移向量
            const offsetVector = Cesium.Cartesian3.multiplyByScalar(
                up,
                offset,
                new Cesium.Cartesian3(),
            );

            // 基于原始矩阵复合平移变换：先还原原始位姿，再叠加偏移
            const translationMatrix = Cesium.Matrix4.fromTranslation(offsetVector);
            customIonTileset.modelMatrix = Cesium.Matrix4.multiply(
                originMatrix,
                translationMatrix,
                new Cesium.Matrix4(),
            );

            getViewer?.()?.scene?.requestRender?.();
        } catch (e) {
            console.warn('[CustomIon] 高度偏移应用失败:', e);
        }
    });

    /**
     * 通过 Cesium Ion API 查询资产类型。
     * @returns {Promise<'imagery'|'terrain'|'3dtiles'|null>}
     */
    async function syncCustomIonLayer() {
        const viewer = getViewer?.();
        if (!viewer?.scene || !getCesium?.()) return;

        // 远程服务加载的 primitive：直接切换 show 属性，避免销毁重建
        if (isRemoteServiceLoad && customIonPrimitive) {
            customIonPrimitive.show = customIon3DTilesVisible.value;
            viewer.scene.requestRender?.();
            return;
        }

        if (customIon3DTilesVisible.value) {
            await ensureCustomIonLayer();
        } else {
            clearCustomIonLayer();
        }

        viewer.scene.requestRender?.();
    }

    async function ensureCustomIonLayer() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene) return null;
        if (!customIonAssetId.value.trim()) {
            message.warning('请先输入 Cesium Ion Asset ID', { closable: true });
            customIon3DTilesVisible.value = false;
            return null;
        }

        const assetId = Number(customIonAssetId.value);

        // 已有缓存的资产类型 → 直接加载
        if (loadedAssetType.value) {
            applyCesiumIonToken(Cesium, getCesiumIonToken());
            if (loadedAssetType.value === 'imagery')
                return await loadCustomIonImagery(viewer, Cesium, assetId);
            if (loadedAssetType.value === 'terrain')
                return await loadCustomIonTerrain(viewer, Cesium, assetId);
            return await loadCustomIon3DTiles(viewer, Cesium, assetId);
        }

        // 无缓存 → 依次尝试三种加载器（不依赖 Ion API 预检）
        applyCesiumIonToken(Cesium, getCesiumIonToken());

        /** 收集各加载器错误，用于最终诊断提示 */
        const attemptErrors = [];

        // 优先尝试 3D Tiles（最常见）
        if (typeof Cesium?.Cesium3DTileset?.fromIonAssetId === 'function') {
            try {
                const result = await loadCustomIon3DTiles(viewer, Cesium, assetId);
                if (result) {
                    loadedAssetType.value = '3dtiles';
                    return result;
                }
            } catch (error: any) {
                attemptErrors.push(`3D Tiles: ${error?.message || error}`);
            }
        }

        // 尝试地形
        if (typeof Cesium?.CesiumTerrainProvider?.fromIonAssetId === 'function') {
            try {
                const result = await loadCustomIonTerrain(viewer, Cesium, assetId);
                if (result) {
                    loadedAssetType.value = 'terrain';
                    return result;
                }
            } catch (error: any) {
                attemptErrors.push(`地形: ${error?.message || error}`);
            }
        }

        // 尝试影像
        if (typeof Cesium?.IonImageryProvider?.fromIonAssetId === 'function') {
            try {
                const result = await loadCustomIonImagery(viewer, Cesium, assetId);
                if (result) {
                    loadedAssetType.value = 'imagery';
                    return result;
                }
            } catch (error: any) {
                attemptErrors.push(`影像: ${error?.message || error}`);
            }
        }

        // 所有加载器均失败 → 输出详细诊断
        const detail = attemptErrors.length
            ? `\n\n各加载器错误：\n${attemptErrors.map(e => `  • ${e}`).join('\n')}`
            : '';
        console.error(`[ensureCustomIonLayer] Asset ${assetId} 所有加载器均失败:`, attemptErrors);

        // 检测是否为 Ion external imagery 资产（Ion SDK 不支持，需直接用底层瓦片 URL）
        const isExternalImagery = attemptErrors.some(e => /external imagery/i.test(e));
        const hint = isExternalImagery
            ? `\n\n提示：Asset ${assetId} 是 Ion「外部影像」类型（actual=url），Ion SDK 不支持通过 Asset ID 加载。\n请在「自定义 XYZ 底图」中直接输入瓦片 URL（如 WMS/WMTS/XYZ 端点）。`
            : '';
        message.warning(
            `Asset ${assetId} 无法加载（不是有效的 3D Tiles / 地形 / 影像，或 Ion 账户未授权）。${detail}${hint}`,
            { closable: true },
        );
        customIon3DTilesVisible.value = false;
        return null;
    }

    async function loadCustomIonImagery(viewer: any, Cesium: any, assetId: any) {
        if (customIonImageryLayer) return customIonImageryLayer;
        if (customIonTilesetLoadPromise) await customIonTilesetLoadPromise;

        if (typeof Cesium?.IonImageryProvider?.fromIonAssetId !== 'function') {
            message.warning('当前 Cesium 运行时不支持 IonImageryProvider.fromIonAssetId', {
                closable: true,
            });
            customIon3DTilesVisible.value = false;
            return null;
        }

        const loadId = ++customIonTilesetLoadId;
        customIonTilesetLoadPromise = (async () => {
            const provider = await Cesium.IonImageryProvider.fromIonAssetId(assetId);
            if (loadId !== customIonTilesetLoadId || !customIon3DTilesVisible.value) return null;
            customIonImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
            // 设为半透明叠加，不完全遮挡底图
            customIonImageryLayer.alpha = 0.7;
            viewer.scene.requestRender?.();
            return customIonImageryLayer;
        })();

        try {
            const result = await customIonTilesetLoadPromise;
            if (!result) {
                if (loadId !== customIonTilesetLoadId) return null;
                customIon3DTilesVisible.value = false;
                message.warning(`Ion 影像 (Asset ${assetId}) 加载失败。`, { closable: true });
                return null;
            }
            message.success(`已加载自定义 Ion 影像 (Asset ${assetId})`);
            // 注册到统一数据源列表（获得显隐控制等 UI）
            // type 必须显式声明 'imagery'：句柄是 ImageryLayer，缺省会按 '3dtiles'
            // 建档，导致 TOC 移除时走 primitives.remove 静默 no-op（V3.5.32 不同步根因）
            if (dataImport?.registerExternalDataSource) {
                dataImport.registerExternalDataSource({
                    name: `Ion 影像 Asset ${assetId}`,
                    entity: customIonImageryLayer,
                    type: 'imagery',
                });
            }
            return result;
        } catch (error) {
            if (loadId !== customIonTilesetLoadId) return null;
            customIon3DTilesVisible.value = false;
            message.warning(`Ion 影像 (Asset ${assetId}) 加载失败，已关闭。`, { closable: true });
            message.error('自定义 Ion 影像初始化失败', error);
            console.error('[CustomIon] 影像初始化失败', error);
            throw error;
        } finally {
            if (loadId === customIonTilesetLoadId) {
                customIonTilesetLoadPromise = null;
            }
        }
    }

    async function loadCustomIonTerrain(viewer: any, Cesium: any, assetId: any) {
        if (customIonTerrainProvider) return customIonTerrainProvider;
        if (customIonTilesetLoadPromise) await customIonTilesetLoadPromise;

        if (typeof Cesium?.CesiumTerrainProvider?.fromIonAssetId !== 'function') {
            message.warning('当前 Cesium 运行时不支持 CesiumTerrainProvider.fromIonAssetId', {
                closable: true,
            });
            customIon3DTilesVisible.value = false;
            return null;
        }

        const loadId = ++customIonTilesetLoadId;
        customIonTilesetLoadPromise = (async () => {
            const provider = await Cesium.CesiumTerrainProvider.fromIonAssetId(assetId, {
                requestVertexNormals: true,
            });
            if (loadId !== customIonTilesetLoadId || !customIon3DTilesVisible.value) return null;
            viewer.scene.terrainProvider = provider;
            customIonTerrainProvider = provider;
            viewer.scene.requestRender?.();
            return provider;
        })();

        try {
            const result = await customIonTilesetLoadPromise;
            if (!result) {
                if (loadId !== customIonTilesetLoadId) return null;
                customIon3DTilesVisible.value = false;
                message.warning(`Ion 地形 (Asset ${assetId}) 加载失败。`, { closable: true });
                return null;
            }
            message.success(`已加载自定义 Ion 地形 (Asset ${assetId})`);
            // 注册到统一数据源列表（获得显隐控制等 UI）
            // type 必须显式声明 'terrain'：句柄是 TerrainProvider（非容器型对象），
            // 缺省建档会被按 '3dtiles' 走 primitives.remove 静默 no-op；删除时由
            // detachEntityFromScene 复位为椭球地形
            if (dataImport?.registerExternalDataSource) {
                dataImport.registerExternalDataSource({
                    name: `Ion 地形 Asset ${assetId}`,
                    entity: customIonTerrainProvider,
                    type: 'terrain',
                });
            }
            return result;
        } catch (error) {
            if (loadId !== customIonTilesetLoadId) return null;
            customIon3DTilesVisible.value = false;
            message.warning(`Ion 地形 (Asset ${assetId}) 加载失败，已关闭。`, { closable: true });
            message.error('自定义 Ion 地形初始化失败', error);
            console.error('[CustomIon] 地形初始化失败', error);
            throw error;
        } finally {
            if (loadId === customIonTilesetLoadId) {
                customIonTilesetLoadPromise = null;
            }
        }
    }

    async function loadCustomIon3DTiles(viewer: any, Cesium: any, assetId: any) {
        if (customIonTileset) return customIonTileset;
        if (customIonTilesetLoadPromise) return customIonTilesetLoadPromise;

        if (typeof Cesium?.Cesium3DTileset?.fromIonAssetId !== 'function') {
            message.warning('当前 Cesium 运行时不支持 Cesium3DTileset.fromIonAssetId', {
                closable: true,
            });
            customIon3DTilesVisible.value = false;
            return null;
        }

        const loadId = ++customIonTilesetLoadId;
        customIonTilesetLoadPromise = Cesium.Cesium3DTileset.fromIonAssetId(assetId, {
            maximumScreenSpaceError: 4,
            enableCollision: true,
        });

        try {
            const tileset = await customIonTilesetLoadPromise;
            if (loadId !== customIonTilesetLoadId || !customIon3DTilesVisible.value) {
                destroyPrimitive(tileset);
                return null;
            }

            customIonTileset = viewer.scene.primitives.add(tileset);
            customIonPrimitive = customIonTileset;
            isRemoteServiceLoad = false;
            // 保存原始 modelMatrix 作为高度偏移的基准（Ion tileset 可能自带定位矩阵）
            originMatrix = tileset.modelMatrix.clone();
            // 注册到统一数据源列表（获得高度滑杆、材质选择、显隐控制等 UI）
            if (dataImport?.registerExternalDataSource) {
                dataImport.registerExternalDataSource({
                    name: `Ion Asset ${assetId}`,
                    entity: customIonPrimitive,
                });
            }
            customIonTilesetReady.value = true;
            // 不隐藏 globe，让 3D Tiles 叠加在底图之上
            viewer.scene.requestRender?.();
            // 自动飞行定位：默认 Ion asset 5115505（河南大学摄影测量数据）飞到预设相机状态
            try {
                if (assetId === 5115505) {
                    viewer.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(114.302537, 34.813816, 158.50),
                        orientation: {
                            heading: Cesium.Math.toRadians(356.554),
                            pitch: Cesium.Math.toRadians(-28.061),
                            roll: 0,
                        },
                        duration: 1.5,
                    });
                } else {
                    // 其他 Ion 资产：用 boundingSphere 定位
                    const bs = tileset.boundingSphere;
                    viewer.flyTo(tileset, {
                        duration: 1.5,
                        offset: new Cesium.HeadingPitchRange(
                            0,
                            Cesium.Math.toRadians(-45),
                            bs.radius * 3.5,
                        ),
                    });
                }
            } catch {
                // flyTo 失败不影响瓦片正常显示，静默忽略
            }
            message.success(`已加载自定义 Ion 3D Tiles (Asset ${assetId})`);
            return customIonTileset;
        } catch (error) {
            if (loadId !== customIonTilesetLoadId) return null;
            customIon3DTilesVisible.value = false;
            message.warning(`Ion 3D Tiles (Asset ${assetId}) 加载失败，已关闭。`, {
                closable: true,
            });
            message.error('自定义 Ion 3D Tiles 初始化失败', error);
            console.error('[CustomIon] 3D Tiles 初始化失败', error);
            throw error;
        } finally {
            if (loadId === customIonTilesetLoadId) {
                customIonTilesetLoadPromise = null;
            }
        }
    }

    function clearCustomIonLayer() {
        if (customI3SProjectionAdapterRelease) {
            customI3SProjectionAdapterRelease();
            customI3SProjectionAdapterRelease = null;
        }

        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene || !Cesium) return;

        // 清理影像层
        if (customIonImageryLayer) {
            try {
                viewer.imageryLayers.remove(customIonImageryLayer, true);
            } catch {
                /* ignore */
            }
            customIonImageryLayer = null;
        }

        // 清理地形 → 恢复用户之前选择的 terrain
        if (customIonTerrainProvider) {
            try {
                const viewer = getViewer?.();
                if (viewer?.scene) {
                    // 恢复 activeTerrain 对应的 Provider，避免粗暴回退椭球
                    const terrainProvider = createTerrainProviderById(activeTerrain.value);
                    viewer.scene.terrainProvider = terrainProvider;
                }
            } catch {
                /* ignore */
            }
            customIonTerrainProvider = null;
        }

        // 清理 3D Tiles / I3S
        if (customIonPrimitive) {
            try {
                viewer.scene.primitives.remove(customIonPrimitive);
            } catch {
                /* ignore */
            }
            customIonPrimitive = null;
            customIonTileset = null;
            originMatrix = null;
            isRemoteServiceLoad = false;
            customIonTilesetReady.value = false;
            if (
                viewer?.scene?.globe &&
                !osmBuildingsVisible.value &&
                !googlePhotorealistic3DTilesVisible.value
            ) {
                viewer.scene.globe.show = true;
            }
        }

        // 终止进行中的加载
        customIonTilesetLoadId += 1;
        customIonTilesetLoadPromise = null;
        loadedAssetType.value = null;
    }

    function handleCustomIonAssetSubmit({ assetId }: any) {
        const normalized = String(assetId || '').trim();
        if (!normalized || !/^\d+$/.test(normalized)) {
            message.warning('请输入有效的 Cesium Ion Asset ID（纯数字）', { closable: true });
            return;
        }
        // 已开启时（无论 ID 是否变化）都先清理旧层，确保重复点击同一 ID 也能强制重载。
        // 注意：若 ID 未变，Vue watch(customIon3DTilesVisible) 不会 fire（值未变），
        // 所以必须显式调用 ensureCustomIonLayer()，否则只清不加载。
        if (customIon3DTilesVisible.value) {
            clearCustomIonLayer();
            if (customIonAssetId.value === normalized) {
                message.info(`正在重新加载 Cesium Ion 资产 (Asset ${normalized})...`, { closable: true });
            } else {
                message.info(`正在切换 Cesium Ion 资产 (Asset ${normalized})...`, { closable: true });
            }
        }
        customIonAssetId.value = normalized;
        customIon3DTilesVisible.value = true;
        // 仅在「已开启」场景下主动触发加载（ID 未变时 watch 不会 fire）
        if (customIon3DTilesVisible.value) {
            void ensureCustomIonLayer();
        }
    }

    /**
     * 加载远程 URL 类型的 3D 数据（I3S / 3D Tiles 直链）。
     * Ion 类型不走此函数，由 handleCustomIonAssetSubmit 复用现有自动识别逻辑。
     */
    async function loadCustomUrl3DTiles(type: any, url: any) {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene || !Cesium) return;

        // 已有远程 primitive 时先清理，避免覆盖引用后旧 primitive 变成"幽灵"残留 scene
        if (customIonPrimitive) {
            clearCustomIonLayer();
        }

        const loadId = ++customIonTilesetLoadId;
        let i3sProjectionAdapter: any = null;
        let ownsI3SProjectionAdapter = false;
        try {
            let tileset;
            if (type === 'i3s') {
                // Cesium I3SDataProvider accepts 4326 only. Adapt Web Mercator JSON
                // node centers, extents and OBB orientations before Cesium consumes them.
                i3sProjectionAdapter = registerI3SProjectionAdapter(Cesium, url);
                ownsI3SProjectionAdapter = true;
                const i3sProvider = await Cesium.I3SDataProvider.fromUrl(url, {
                    cesium3dTilesetOptions: {
                        maximumScreenSpaceError: 4,
                        enableCollision: true,
                    },
                });
                if (loadId !== customIonTilesetLoadId) {
                    destroyPrimitive(i3sProvider);
                    i3sProjectionAdapter.release();
                    ownsI3SProjectionAdapter = false;
                    return;
                }

                if (WEB_MERCATOR_WKIDS.has(i3sProjectionAdapter.wkid)) {
                    customI3SProjectionAdapterRelease = i3sProjectionAdapter.release;
                    ownsI3SProjectionAdapter = false;
                } else {
                    i3sProjectionAdapter.release();
                    ownsI3SProjectionAdapter = false;
                }

                customIonPrimitive = viewer.scene.primitives.add(i3sProvider);
                // Keep the first internal tileset for terrain fitting and UI controls.
                tileset = i3sProvider.layers?.[0]?._tileset;
                if (!tileset) {
                    throw new Error('I3S 数据加载成功但无法获取 tileset 引用');
                }
                isRemoteServiceLoad = true;
            } else {
                // 3dtiles
                tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
                    maximumScreenSpaceError: 4,
                    enableCollision: true,
                });
                if (loadId !== customIonTilesetLoadId) { destroyPrimitive(tileset); return; }

                customIonPrimitive = viewer.scene.primitives.add(tileset);
                isRemoteServiceLoad = true;
            }
            customIonTileset = tileset;
            // 初始贴地（与数据 Tab 卡片同一几何口径：叶子基底采样 × 地形逐点配对 + 死区判定）
            const fitResult = await fitTilesetToTerrain({ tileset, viewer, Cesium, message });
            // 贴地完成后保存原始 matrix 作为高程滑杆的偏移基准
            originMatrix = tileset.modelMatrix.clone();
            customIonTilesetReady.value = true;
            customIon3DTilesVisible.value = true;

            // 注册到统一数据源列表（获得高度滑杆、材质选择、显隐控制等 UI）
            if (dataImport?.registerExternalDataSource) {
                const displayName = type === 'i3s'
                    ? '远程 I3S 数据'
                    : type === 'ion'
                        ? `Ion Asset ${url}`
                        : '远程 3D Tiles';
                dataImport.registerExternalDataSource({
                    name: displayName,
                    entity: customIonPrimitive,
                    tilesetOverride: type === 'i3s' ? tileset : undefined,
                    tilesetGeo: fitResult?.tilesetGeo,
                    currentBaseHeight: fitResult?.currentBaseHeight,
                    terrainElevation: fitResult?.terrainElevation,
                    terrainFitSamples: fitResult?.baseSamples,
                });
            }

            // 飞行定位
            const bs = tileset.boundingSphere;
            await viewer.flyTo(tileset, {
                duration: 1.5,
                offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), bs.radius * 3.5),
            });
            message.success(`已加载远程 3D 数据（${type === 'i3s' ? 'I3S' : '3D Tiles'}）`);
        } catch (error) {
            if (ownsI3SProjectionAdapter) {
                i3sProjectionAdapter?.release();
            }
            if (loadId !== customIonTilesetLoadId) return;

            const detectedWkid = i3sProjectionAdapter?.wkid;
            const errorMessage =
                type === 'i3s' &&
                detectedWkid !== null &&
                detectedWkid !== 4326 &&
                !WEB_MERCATOR_WKIDS.has(detectedWkid)
                    ? `I3S 空间参考 EPSG:${detectedWkid} 暂不支持，目前支持 EPSG:4326 / EPSG:3857`
                    : (error as any)?.message || error;

            if (customIonPrimitive) {
                clearCustomIonLayer();
            } else if (customI3SProjectionAdapterRelease) {
                customI3SProjectionAdapterRelease();
                customI3SProjectionAdapterRelease = null;
            }
            console.error('[RemoteService] 远程 3D 数据加载失败:', error);
            message.error(`远程 3D 数据加载失败: ${errorMessage}`, { closable: true });
        }
    }

    return {
        syncCustomIonLayer,
        ensureCustomIonLayer,
        loadCustomIonImagery,
        loadCustomIonTerrain,
        loadCustomIon3DTiles,
        loadCustomUrl3DTiles,
        clearCustomIonLayer,
        handleCustomIonAssetSubmit,
    };
}
