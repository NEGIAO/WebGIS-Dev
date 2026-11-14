/**
 * 功能名称：建筑类叠加层（OSM Buildings + Google 倾斜摄影）
 * 日    期：2026/11/13
 *
 * 从 useCesiumLayers 拆出：两组 3D Tiles 叠加层的按需加载（loadId 竞态
 * 防护）、显隐同步与清理；OSM Buildings 自动切换 Cesium World 地形，
 * Google 图层接管 globe 显隐。加载态互不共享、显隐 ref 由宿主传入。
 */

import { applyCesiumIonToken } from '../core/cesiumRuntime';
import { createCesiumOsmBuildingsTileset, destroyPrimitive } from './layerUtils';

export interface OverlayTilesetCtx {
    /** 宿主 Viewer 获取器 */
    getViewer?: () => any;
    /** Cesium 命名空间获取器 */
    getCesium?: () => any;
    /** 消息系统 */
    message?: any;
    /** OSM Buildings 显隐 ref */
    osmBuildingsVisible: { value: boolean };
    /** Google 倾斜摄影显隐 ref */
    googlePhotorealistic3DTilesVisible: { value: boolean };
    /** 当前地形 ref（OSM Buildings 自动切换判定） */
    activeTerrain: { value: string };
    /** 地形切换（ensureCesiumWorldTerrainForOsmBuildings 依赖） */
    applyTerrain: (value: string) => Promise<boolean>;
    /** ion token 实时读取 */
    getCesiumIonToken: () => string;
}

/**
 * 创建建筑叠加层管理器
 * @param ctx 宿主依赖
 * @returns sync/ensure/clear 七个入口
 */
export function createOverlayTilesetManager(ctx: OverlayTilesetCtx) {
    const {
        getViewer, getCesium, message, osmBuildingsVisible, googlePhotorealistic3DTilesVisible,
        activeTerrain, applyTerrain, getCesiumIonToken,
    } = ctx;
    let osmBuildingsTileset: any = null;
    let osmBuildingsLoadPromise: any = null;
    let osmBuildingsLoadId = 0;
    let googlePhotorealistic3DTileset: any = null;
    let googlePhotorealistic3DTilesetLoadPromise: any = null;
    let googlePhotorealistic3DTilesetLoadId = 0;

    async function syncOsmBuildingsLayer() {
        const viewer = getViewer?.();
        if (!viewer?.scene?.primitives || !getCesium?.()) return;

        if (osmBuildingsVisible.value) {
            await ensureOsmBuildingsLayer();
        } else {
            clearOsmBuildingsLayer();
        }

        viewer.scene.requestRender?.();
    }

    async function syncGooglePhotorealistic3DTilesLayer() {
        const viewer = getViewer?.();
        if (!viewer?.scene?.primitives || !getCesium?.()) return;

        if (googlePhotorealistic3DTilesVisible.value) {
            await ensureGooglePhotorealistic3DTilesLayer();
        } else {
            clearGooglePhotorealistic3DTilesLayer();
        }

        viewer.scene.requestRender?.();
    }

    async function ensureGooglePhotorealistic3DTilesLayer() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene?.primitives) return null;
        if (googlePhotorealistic3DTileset) {
            return googlePhotorealistic3DTileset;
        }

        if (googlePhotorealistic3DTilesetLoadPromise)
            return googlePhotorealistic3DTilesetLoadPromise;

        if (typeof Cesium?.createGooglePhotorealistic3DTileset !== 'function') {
            message.warning('当前 Cesium 运行时不支持 Google Photorealistic 3D Tiles。', {
                closable: true,
            });
            googlePhotorealistic3DTilesVisible.value = false;
            return null;
        }

        const loadId = ++googlePhotorealistic3DTilesetLoadId;
        applyCesiumIonToken(Cesium, getCesiumIonToken());
        // Cesium 1.122 keeps the ion route when the legacy first argument is undefined.
        googlePhotorealistic3DTilesetLoadPromise = Cesium.createGooglePhotorealistic3DTileset(
            undefined,
            {
                maximumScreenSpaceError: 4,
                cacheBytes: 1536 * 1024 * 1024,
                enableCollision: true,
                // 显式声明使用 Google geocoder，抑制 Cesium 启动时的警告弹窗：
                // "Only the Google geocoder can be used with Google Photorealistic 3D Tiles."
                // 配置项来源：Cesium.GooglePhotorealistic3DTileset.additionalOptions
                onlyUsingWithGoogleGeocoder: true,
            },
        );

        try {
            const tileset = await googlePhotorealistic3DTilesetLoadPromise;
            if (
                loadId !== googlePhotorealistic3DTilesetLoadId ||
                !googlePhotorealistic3DTilesVisible.value
            ) {
                destroyPrimitive(tileset);
                return null;
            }

            googlePhotorealistic3DTileset = viewer.scene.primitives.add(tileset);
            viewer.scene.globe.show = false;
            viewer.scene.skyAtmosphere.show = true;
            viewer.scene.requestRender?.();
            return googlePhotorealistic3DTileset;
        } catch (error) {
            if (loadId !== googlePhotorealistic3DTilesetLoadId) return null;

            googlePhotorealistic3DTilesVisible.value = false;
            message.warning('Google 真实 3D 模型加载失败，已关闭该叠加层。', { closable: true });
            message.error('Google Photorealistic 3D Tiles 初始化失败', error);
            return null;
        } finally {
            if (loadId === googlePhotorealistic3DTilesetLoadId) {
                googlePhotorealistic3DTilesetLoadPromise = null;
            }
        }
    }

    function clearGooglePhotorealistic3DTilesLayer() {
        const viewer = getViewer?.();
        googlePhotorealistic3DTilesetLoadId += 1;
        googlePhotorealistic3DTilesetLoadPromise = null;
        if (!googlePhotorealistic3DTileset || !viewer?.scene?.primitives) {
            return;
        }

        try {
            viewer.scene.primitives.remove(googlePhotorealistic3DTileset);
        } catch (error) {
            console.warn('Google Photorealistic 3D Tiles layer remove warning:', error);
        }

        googlePhotorealistic3DTileset = null;
        // 仅在 OSM Buildings 也未激活时恢复 globe，避免多 Ion 图层并存时渲染闪烁
        if (viewer?.scene?.globe && !osmBuildingsVisible.value) {
            viewer.scene.globe.show = true;
        }
    }

    async function ensureOsmBuildingsLayer() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.scene?.primitives || osmBuildingsTileset) return osmBuildingsTileset;
        if (osmBuildingsLoadPromise) return osmBuildingsLoadPromise;

        if (
            typeof Cesium?.Cesium3DTileset?.fromIonAssetId !== 'function' &&
            typeof Cesium?.createOsmBuildingsAsync !== 'function'
        ) {
            message.warning('当前 Cesium 运行时不支持 Cesium OSM Buildings。', { closable: true });
            osmBuildingsVisible.value = false;
            return null;
        }

        const loadId = ++osmBuildingsLoadId;
        applyCesiumIonToken(Cesium, getCesiumIonToken());
        await ensureCesiumWorldTerrainForOsmBuildings();
        osmBuildingsLoadPromise = createCesiumOsmBuildingsTileset(Cesium, {
            maximumScreenSpaceError: 8,
        });
        try {
            const tileset = await osmBuildingsLoadPromise;
            if (loadId !== osmBuildingsLoadId || !osmBuildingsVisible.value) {
                destroyPrimitive(tileset);
                return null;
            }

            osmBuildingsTileset = viewer.scene.primitives.add(tileset);
            viewer.scene.requestRender?.();
            return osmBuildingsTileset;
        } catch (error) {
            if (loadId !== osmBuildingsLoadId) return null;
            osmBuildingsVisible.value = false;
            message.warning('Cesium OSM 建筑图层加载失败，已关闭该叠加层。', { closable: true });
            message.error('Cesium OSM 建筑图层初始化失败', error);
            return null;
        } finally {
            if (loadId === osmBuildingsLoadId) {
                osmBuildingsLoadPromise = null;
            }
        }
    }

    function clearOsmBuildingsLayer() {
        const viewer = getViewer?.();
        osmBuildingsLoadId += 1;
        osmBuildingsLoadPromise = null;
        if (!osmBuildingsTileset || !viewer?.scene?.primitives) return;

        try {
            viewer.scene.primitives.remove(osmBuildingsTileset);
        } catch (error) {
            console.warn('Cesium OSM buildings layer remove warning:', error);
        }
        osmBuildingsTileset = null;
        viewer.scene.requestRender?.();
    }

    async function ensureCesiumWorldTerrainForOsmBuildings() {
        if (activeTerrain.value === 'cesiumWorld') return true;

        // OSM Buildings 需要 Cesium World 地形才能正确显示高度，自动切换
        activeTerrain.value = 'cesiumWorld';
        const switched = await applyTerrain('cesiumWorld');
        if (!switched) {
            message.warning(
                'Cesium OSM Buildings 建议配合 Cesium 世界地形使用，当前地形可能导致建筑遮挡或高度偏移。',
                { closable: true },
            );
        }
        return switched;
    }

    return {
        syncOsmBuildingsLayer,
        ensureOsmBuildingsLayer,
        clearOsmBuildingsLayer,
        syncGooglePhotorealistic3DTilesLayer,
        ensureGooglePhotorealistic3DTilesLayer,
        clearGooglePhotorealistic3DTilesLayer,
        ensureCesiumWorldTerrainForOsmBuildings,
    };
}
