/**
 * 功能名称：地形切换管理器
 * 日    期：2026/11/13
 *
 * 从 useCesiumLayers 拆出：椭球/天地图/Cesium World/ArcGIS World 四类
 * 地形的应用、场景标志（depthTest/SSE 动态调优）与竞态防护
 * （switchId/queueTerrainFallback）；ProviderViewModel 索引由宿主传入。
 */

import { applyCesiumIonToken } from '../core/cesiumRuntime';
import createGeoTerrainProvider from '../../providers/terrain/GeoTerrainProvider';
import createArcGISTerrainProvider from '../../providers/terrain/ArcGISTerrainProvider';
import { ARCGIS_WORLD_TERRAIN_URL, TDT_SERVICE_ROOT, TDT_SUBDOMAINS } from './layerUtils';

export interface TerrainManagerCtx {
    /** 宿主 Viewer 获取器 */
    getViewer?: () => any;
    /** Cesium 命名空间获取器 */
    getCesium?: () => any;
    /** 消息系统 */
    message?: any;
    /** 当前地形 ref */
    activeTerrain: { value: string };
    /** 地形 ProviderViewModel 索引（宿主 BaseLayerPicker 联动） */
    terrainProviderViewModelById: Map<string, any>;
    /** 天地图 token 实时读取 */
    getTiandituToken: () => string;
    /** ion token 实时读取 */
    getCesiumIonToken: () => string;
}

/**
 * 创建地形切换管理器
 * @param ctx 宿主依赖
 * @returns apply/init/provider 构造七入口
 */
export function createTerrainManager(ctx: TerrainManagerCtx) {
    const {
        getViewer, getCesium, message, activeTerrain, terrainProviderViewModelById,
        getTiandituToken, getCesiumIonToken,
    } = ctx;
    let terrainSwitchId = 0;
    /** @type {Array<() => void>} 地形相关相机事件清理回调 */
    let terrainCameraCleanups: Array<() => void> = [];

    function initCustomTerrain() {
        return applyTerrain(activeTerrain.value);
    }

    async function applyTerrain(value: any) {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) return false;

        const pickerViewModel = viewer.baseLayerPicker?.viewModel;
        const providerViewModel = terrainProviderViewModelById.get(value);
        if (pickerViewModel && providerViewModel) {
            if (pickerViewModel.selectedTerrain !== providerViewModel) {
                pickerViewModel.selectedTerrain = providerViewModel;
            }
            applyTerrainSceneFlags(value);
            viewer.scene.requestRender?.();
            return true;
        }

        const switchId = ++terrainSwitchId;

        if (value === 'ellipsoid') {
            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            applyTerrainSceneFlags(value);
            viewer.scene.requestRender?.();
            return true;
        }

        if (value === 'cesiumWorld') {
            try {
                const worldTerrain = await createCesiumWorldTerrainProvider();
                if (switchId !== terrainSwitchId) return false;

                viewer.terrainProvider = worldTerrain;
                applyTerrainSceneFlags(value);
                viewer.scene.requestRender?.();
                return true;
            } catch (error) {
                if (switchId !== terrainSwitchId) return false;

                viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                applyTerrainSceneFlags('ellipsoid');
                message.warning('Cesium 世界地形加载失败，已降级为平面地形。', { closable: true });
                message.error('Cesium 世界地形初始化失败', error);
                return false;
            }
        }

        if (value === 'arcgisWorld') {
            try {
                const arcgisTerrain = await createArcgisWorldTerrainProvider();
                if (switchId !== terrainSwitchId) return false;

                viewer.terrainProvider = arcgisTerrain;
                applyTerrainSceneFlags(value);
                viewer.scene.requestRender?.();
                return true;
            } catch (error) {
                if (switchId !== terrainSwitchId) return false;

                viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                applyTerrainSceneFlags('ellipsoid');
                message.warning('ArcGIS 世界地形加载失败，已降级为平面地形。', { closable: true });
                message.error('ArcGIS 世界地形初始化失败', error);
                return false;
            }
        }

        const GeoTerrainProvider = createGeoTerrainProvider(Cesium);
        try {
            viewer.terrainProvider = new GeoTerrainProvider({
                url: `${TDT_SERVICE_ROOT}mapservice/swdx?T=elv_c&tk={token}&x={x}&y={y}&l={z}`,
                subdomains: TDT_SUBDOMAINS,
                token: getTiandituToken(),
            });
            applyTerrainSceneFlags(value);
            viewer.scene.requestRender?.();
            return true;
        } catch (error) {
            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            applyTerrainSceneFlags('ellipsoid');
            message.warning('官方地形服务加载失败，已降级为椭球地形。', { closable: true });
            message.error('官方地形初始化失败', error);
            return false;
        }
    }

    function applyTerrainSceneFlags(value: any) {
        const viewer = getViewer?.();
        if (!viewer?.scene?.globe) return;
        const globe = viewer.scene.globe;

        // 清理上一次地形的相机事件监听
        for (const cleanup of terrainCameraCleanups) cleanup();
        terrainCameraCleanups = [];

        globe.depthTestAgainstTerrain = value !== 'ellipsoid';

        if (value === 'arcgisWorld') {
            // ArcGIS 地形性能调优（LERC 解码已下放 Worker，主线程不再被解码占用；
            // 二次下探：SSE 4/8 → 3/6，层级硬顶同步放宽至 12——地形更细，
            // 移动期仍保留抑制细分风暴的保守性）
            globe.maximumScreenSpaceError = 3;
            globe.tileCacheSize = 1000;

            // 动态 SSE：相机移动时适度保守，停下后恢复细节
            const camera = viewer.scene.camera;
            const onMoveStart = () => {
                globe.maximumScreenSpaceError = 6;
            };
            const onMoveEnd = () => {
                globe.maximumScreenSpaceError = 3;
            };
            camera.moveStart.addEventListener(onMoveStart);
            camera.moveEnd.addEventListener(onMoveEnd);
            terrainCameraCleanups.push(() => {
                camera.moveStart.removeEventListener(onMoveStart);
                camera.moveEnd.removeEventListener(onMoveEnd);
            });
        } else {
            // 天地图 / Cesium World / 椭球：恢复默认
            globe.maximumScreenSpaceError = 2;
            globe.tileCacheSize = 100;
        }
    }

    function createTerrainProviderById(value: any) {
        const Cesium = getCesium?.();
        if (value === 'ellipsoid') {
            return new Cesium.EllipsoidTerrainProvider();
        }

        if (value === 'cesiumWorld') {
            return createCesiumWorldTerrainProvider().catch((error) => {
                message.warning('Cesium 世界地形加载失败，已降级为平面地形。', { closable: true });
                message.error('Cesium 世界地形初始化失败', error);
                queueTerrainFallback(value, 'ellipsoid');
                return new Cesium.EllipsoidTerrainProvider();
            });
        }

        if (value === 'arcgisWorld') {
            return createArcgisWorldTerrainProvider().catch((error) => {
                message.warning('ArcGIS 世界地形加载失败，已降级为平面地形。', { closable: true });
                message.error('ArcGIS 世界地形初始化失败', error);
                queueTerrainFallback(value, 'ellipsoid');
                return new Cesium.EllipsoidTerrainProvider();
            });
        }

        const GeoTerrainProvider = createGeoTerrainProvider(Cesium);
        try {
            return new GeoTerrainProvider({
                url: `${TDT_SERVICE_ROOT}mapservice/swdx?T=elv_c&tk={token}&x={x}&y={y}&l={z}`,
                subdomains: TDT_SUBDOMAINS,
                token: getTiandituToken(),
            });
        } catch (error) {
            message.warning('官方地形服务加载失败，已降级为椭球地形。', { closable: true });
            message.error('官方地形初始化失败', error);
            return new Cesium.EllipsoidTerrainProvider();
        }
    }

    async function createCesiumWorldTerrainProvider() {
        const Cesium = getCesium?.();
        applyCesiumIonToken(Cesium, getCesiumIonToken());

        const options = {
            requestWaterMask: false,
            requestVertexNormals: true,
        };

        if (typeof Cesium.createWorldTerrainAsync === 'function') {
            return Cesium.createWorldTerrainAsync(options);
        }

        if (typeof Cesium.createWorldTerrain === 'function') {
            return Cesium.createWorldTerrain(options);
        }

        if (typeof Cesium.CesiumTerrainProvider?.fromIonAssetId === 'function') {
            return Cesium.CesiumTerrainProvider.fromIonAssetId(1, options);
        }

        if (Cesium.IonResource?.fromAssetId && Cesium.CesiumTerrainProvider) {
            const ionResource = await Cesium.IonResource.fromAssetId(1);
            return new Cesium.CesiumTerrainProvider({
                url: ionResource,
                ...options,
            });
        }

        throw new Error('当前 Cesium 运行时不支持在线世界地形。');
    }

    async function createArcgisWorldTerrainProvider() {
        const Cesium = getCesium?.();
        if (typeof Cesium?.ArcGISTiledElevationTerrainProvider?.fromUrl !== 'function') {
            throw new Error('当前 Cesium 运行时不支持 ArcGIS 高程地形。');
        }

        // 使用增强包装器：补充 availability + getTileDataAvailable
        // 使 sampleTerrainMostDetailed 能正确查询最高精度层级（与天地图/Cesium 行为一致）
        const ArcGISTerrainProvider = createArcGISTerrainProvider(Cesium);
        return ArcGISTerrainProvider.fromUrl(ARCGIS_WORLD_TERRAIN_URL);
    }

    function queueTerrainFallback(failedValue: any, fallbackValue: any) {
        const schedule = typeof window !== 'undefined' ? window.setTimeout : setTimeout;
        schedule(() => {
            if (activeTerrain.value !== failedValue) return;
            activeTerrain.value = fallbackValue;
        }, 0);
    }

    return {
        initCustomTerrain,
        applyTerrain,
        applyTerrainSceneFlags,
        createTerrainProviderById,
        createCesiumWorldTerrainProvider,
        createArcgisWorldTerrainProvider,
        queueTerrainFallback,
    };
}
