import { computed, ref, watch } from 'vue';
import { createArcgisIdentify } from './arcgisIdentify';
import { createCustomIonLayerManager } from './customIonLayer';
import { createOverlayTilesetManager } from './overlayTilesets';
import { createTdtOverlayManager } from './tdtOverlays';
import { createTerrainManager } from './terrainManager';
import { createImageryProviderBuilderSuite } from './imageryProviderBuilders';
import { useSharedCustomBasemapUrl } from '@common/basemap/useSharedCustomBasemapUrl';
import {
    looksLikeWmsSourceUrl,
    ensureWmsServiceInfo,
} from '@common/basemap/wmsService';
import { registerRemoteService } from '@common/basemap/remoteServices';
import { createCesiumRemoteServiceAdapter } from '../../services/cesiumRemoteServiceAdapter';
import { setCapabilitiesProxyBuilder } from '@common/basemap/capabilitiesProxy';
import { tileProxyUrl } from '@/config/publicRuntime';
import {
    readStoredBoolean,
    readStoredString,
    writeStoredBoolean,
    writeStoredString,
} from '../core/cesiumStorage';
import { resolvePresetLayerIds } from '@common/basemap/catalogProjection';
import { DEFAULT_BASEMAP_PRESET_ID } from '@common/basemap/basemapPresets';
import { abortAllDescriptorRequests } from '@cesium-domain/constants/basemapProviderFactory';
import { useCesiumBasemapSwitcher } from './useCesiumBasemapSwitcher';
import {
    CUSTOM_XYZ_BASEMAP_ID,
    TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY,
    TDT_BOUNDARY_LAYER_VISIBLE_KEY,
    TDT_TEXT_LABEL_LAYER_VISIBLE_KEY,
    CESIUM_OSM_BUILDINGS_VISIBLE_KEY,
    GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY,
    getUnifiedBasemapOptions,
    terrainOptions,
    readRuntimeValue,
    normalizeCustomXyzUrl,
} from './layerUtils';

/** useCesiumLayers 宿主装配选项 */
export interface UseCesiumLayersOptions {
    /** 宿主 Viewer 获取器 */
    getViewer?: () => any;
    /** Cesium 命名空间获取器 */
    getCesium?: () => any;
    /** 消息系统 */
    message?: any;
    /** 兼容参数：当前实现未消费 */
    backendBaseUrl?: string;
    /** 天地图 token */
    tiandituToken?: any;
    /** ovital tdtkey token */
    ovitalTdtkeyToken?: any;
    /** Cesium ion token */
    cesiumIonToken?: any;
    /** 数据导入模块句柄 */
    dataImport?: any;
}

export function useCesiumLayers({
    getViewer,
    getCesium,
    message,
    backendBaseUrl: _backendBaseUrl,
    tiandituToken,
    ovitalTdtkeyToken,
    cesiumIonToken,
    dataImport,
} = {} as UseCesiumLayersOptions) {
    setCapabilitiesProxyBuilder(
        (url) => (url ? tileProxyUrl(url) : null),
        'cesium',
    );

    let cesiumRemoteAdapter: any = null;
    function ensureRemoteServiceAdapter() {
        if (cesiumRemoteAdapter) return cesiumRemoteAdapter;
        if (!getViewer?.() || !getCesium?.()) return null;
        try {
            cesiumRemoteAdapter = createCesiumRemoteServiceAdapter({ getViewer, getCesium });
        } catch (error) {
            console.warn('[useCesiumLayers] 在线服务适配器创建失败:', error);
        }
        return cesiumRemoteAdapter;
    }

    const customIonAssetId = ref(readStoredString('cesium_custom_ion_asset_id', '5115505'));
    const loadedAssetType = ref<any>(null);
    const customIonHeightOffset = ref(0);
    let layerPickerSubscriptions: any[] = [];

    const getTiandituToken = () => readRuntimeValue(tiandituToken);
    const getOvitalTdtkey = () => readRuntimeValue(ovitalTdtkeyToken);
    const getCesiumIonToken = () => readRuntimeValue(cesiumIonToken);

    const imageryLayerHandles: any[] = [];
    const officialBasemapOptions = ref<any[]>([]);
    const imageryProviderViewModelById = new Map();
    const imageryProviderIdByViewModel = new Map();
    const terrainProviderViewModelById = new Map();
    const terrainProviderIdByViewModel = new Map();

    const activeBasemap = ref(DEFAULT_BASEMAP_PRESET_ID);
    const activeTerrain = ref('tianditu');
    const { customBasemapUrl: customXyzBasemapUrl } = useSharedCustomBasemapUrl();
    const legacyTdtLabelLayerVisible = readStoredBoolean(TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY, false);
    const tdtBoundaryLayerVisible = ref(
        readStoredBoolean(TDT_BOUNDARY_LAYER_VISIBLE_KEY, legacyTdtLabelLayerVisible ?? false),
    );
    const tdtTextLabelLayerVisible = ref(
        readStoredBoolean(TDT_TEXT_LABEL_LAYER_VISIBLE_KEY, legacyTdtLabelLayerVisible ?? false),
    );
    const osmBuildingsVisible = ref(readStoredBoolean(CESIUM_OSM_BUILDINGS_VISIBLE_KEY, false));
    const googlePhotorealistic3DTilesVisible = ref(
        readStoredBoolean(GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY, false),
    );
    const customIon3DTilesVisible = ref(false);
    const customIonTilesetReady = ref(false);

    // ========== 分层管理器（地形 / 天地图叠加 / 建筑叠加 / 自定义 Ion / 要素点查） ==========
    const {
        initCustomTerrain,
        applyTerrain,
        applyTerrainSceneFlags,
        createTerrainProviderById,
    } = createTerrainManager({
        getViewer,
        getCesium,
        message,
        activeTerrain,
        terrainProviderViewModelById,
        getTiandituToken,
        getCesiumIonToken,
    });

    const {
        syncTdtOverlayLayers,
        clearTdtBoundaryLayer,
        clearTdtTextLabelLayer,
    } = createTdtOverlayManager({
        getViewer,
        getCesium,
        message,
        getTiandituToken,
        tdtBoundaryLayerVisible,
        tdtTextLabelLayerVisible,
    });

    const {
        syncOsmBuildingsLayer,
        clearOsmBuildingsLayer,
        syncGooglePhotorealistic3DTilesLayer,
        clearGooglePhotorealistic3DTilesLayer,
    } = createOverlayTilesetManager({
        getViewer,
        getCesium,
        message,
        osmBuildingsVisible,
        googlePhotorealistic3DTilesVisible,
        activeTerrain,
        applyTerrain,
        getCesiumIonToken,
    });

    const {
        syncCustomIonLayer,
        clearCustomIonLayer,
        handleCustomIonAssetSubmit,
        loadCustomUrl3DTiles,
    } = createCustomIonLayerManager({
        getViewer,
        getCesium,
        message,
        dataImport,
        customIonAssetId,
        loadedAssetType,
        customIonHeightOffset,
        customIon3DTilesVisible,
        customIonTilesetReady,
        osmBuildingsVisible,
        googlePhotorealistic3DTilesVisible,
        activeTerrain,
        createTerrainProviderById,
        getCesiumIonToken,
    });

    const {
        setIdentifyInfo,
        bindCesiumArcgisIdentify,
        disposeCesiumArcgisIdentify,
        flyCameraToServiceExtent,
    } = createArcgisIdentify({ getViewer, getCesium, message });

    const {
        updateCustomWmsLayerSelection,
        createImageryProvidersById,
        createImageryProviderViewModels,
        createTerrainProviderViewModels,
    } = createImageryProviderBuilderSuite({
        getCesium,
        getTiandituToken,
        getOvitalTdtkey,
        customXyzBasemapUrl,
        activeBasemap,
        applyBasemap,
        message,
        imageryProviderViewModelById,
        imageryProviderIdByViewModel,
        terrainProviderViewModelById,
        terrainProviderIdByViewModel,
        officialBasemapOptions,
        createTerrainProviderById,
    });

    const basemapOptions = computed(() => [
        ...getUnifiedBasemapOptions().map((option: any) => {
            if (option.value !== 'custom') return option;
            return {
                ...option,
                description: customXyzBasemapUrl.value
                    ? customXyzBasemapUrl.value
                    : '输入 XYZ / WMS 图源 URL 后启用',
                source: 'custom',
                disabled: !customXyzBasemapUrl.value,
            };
        }),
        ...officialBasemapOptions.value,
    ]);

    const basemapSwitcher = useCesiumBasemapSwitcher({
        getViewer,
        getCesium: () => getCesium?.(),
        activeBasemap,
        applyBasemap,
        resolvePresetLayerIds,
        message,
    });

    const basemapCircuitOpen = computed(() => basemapSwitcher.isCircuitOpen.value);

    const overlayOptions = computed(() => [
        {
            value: 'tdt-boundaries',
            label: '国界线',
            description: '天地图国界、行政边界与边界注记栅格层',
            active: tdtBoundaryLayerVisible.value,
        },
        {
            value: 'tdt-text-labels',
            label: '文字标注',
            description: '天地图官方文字注记栅格层',
            active: tdtTextLabelLayerVisible.value,
        },
        {
            value: 'cesium-osm-buildings',
            label: 'Cesium OSM建筑',
            description: 'Cesium ion OpenStreetMap 3D Buildings 图层',
            active: osmBuildingsVisible.value,
        },
        {
            value: 'google-photorealistic-3d-tiles',
            label: 'Google真实3D模型',
            description: 'Google Photorealistic 3D Tiles 倾斜摄影模型',
            active: googlePhotorealistic3DTilesVisible.value,
        },
    ]);

    watch(activeBasemap, (value) => {
        if (!getViewer?.() || !getCesium?.()) return;
        applyBasemap(value);
    });

    watch(customXyzBasemapUrl, () => {
        ensureRemoteServiceAdapter();
        bindCesiumArcgisIdentify();
    });

    const rsvcInitTimer = setInterval(() => {
        if (getViewer?.() && getCesium?.()) {
            clearInterval(rsvcInitTimer);
            ensureRemoteServiceAdapter();
            bindCesiumArcgisIdentify();
        }
    }, 500);
    setTimeout(() => clearInterval(rsvcInitTimer), 15000);

    watch(activeTerrain, async (value) => {
        if (!getViewer?.() || !getCesium?.()) return;
        await applyTerrain(value);
    });

    watch(tdtBoundaryLayerVisible, (value) => {
        writeStoredBoolean(TDT_BOUNDARY_LAYER_VISIBLE_KEY, value);
        syncTdtOverlayLayers();
    });

    watch(tdtTextLabelLayerVisible, (value) => {
        writeStoredBoolean(TDT_TEXT_LABEL_LAYER_VISIBLE_KEY, value);
        syncTdtOverlayLayers();
    });

    watch(osmBuildingsVisible, (value) => {
        writeStoredBoolean(CESIUM_OSM_BUILDINGS_VISIBLE_KEY, value);
        void syncOsmBuildingsLayer();
    });

    watch(googlePhotorealistic3DTilesVisible, (value) => {
        writeStoredBoolean(GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY, value);
        void syncGooglePhotorealistic3DTilesLayer();
    });

    watch(customIon3DTilesVisible, () => {
        void syncCustomIonLayer();
    });

    watch(customIonAssetId, (value) => {
        writeStoredString('cesium_custom_ion_asset_id', value);
    });

    function getSelectedImageryProviderViewModel(fallbackViewModels: any = []) {
        return imageryProviderViewModelById.get(activeBasemap.value) || fallbackViewModels[0];
    }

    function getSelectedTerrainProviderViewModel(fallbackViewModels: any = []) {
        return terrainProviderViewModelById.get(activeTerrain.value) || fallbackViewModels[0];
    }

    function bindLayerPickerStateSync() {
        unbindLayerPickerStateSync();
        const Cesium = getCesium?.();
        const pickerViewModel = getViewer?.()?.baseLayerPicker?.viewModel;
        if (!pickerViewModel || !Cesium?.knockout?.getObservable) return;

        const imageryObservable = Cesium.knockout.getObservable(pickerViewModel, 'selectedImagery');
        const terrainObservable = Cesium.knockout.getObservable(pickerViewModel, 'selectedTerrain');
        const subscriptions = [];

        const imagerySubscription = imageryObservable?.subscribe?.((viewModel: any) => {
            const value = imageryProviderIdByViewModel.get(viewModel);
            if (!value) return;
            if (activeBasemap.value !== value) {
                activeBasemap.value = value;
            }
            syncBasemapSideEffects();
        });

        const terrainSubscription = terrainObservable?.subscribe?.((viewModel: any) => {
            const value = terrainProviderIdByViewModel.get(viewModel);
            if (!value) return;
            if (activeTerrain.value !== value) {
                activeTerrain.value = value;
            }
            applyTerrainSceneFlags(value);
        });

        if (imagerySubscription) subscriptions.push(imagerySubscription);
        if (terrainSubscription) subscriptions.push(terrainSubscription);
        layerPickerSubscriptions = subscriptions;
    }

    function unbindLayerPickerStateSync() {
        layerPickerSubscriptions.forEach((subscription) => subscription?.dispose?.());
        layerPickerSubscriptions = [];
    }

    function addBaseImageryLayers() {
        ensureRemoteServiceAdapter();
        syncTdtOverlayLayers();
        void syncOsmBuildingsLayer();
        void syncGooglePhotorealistic3DTilesLayer();
        void syncCustomIonLayer();
        return true;
    }

    function clearBaseImageryLayers() {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers) return;

        while (imageryLayerHandles.length) {
            const layer = imageryLayerHandles.pop();
            try {
                viewer.imageryLayers.remove(layer, true);
            } catch (error) {
                console.warn('Imagery layer remove warning:', error);
            }
        }
    }

    function syncBasemapSideEffects() {
        syncTdtOverlayLayers();
        void syncOsmBuildingsLayer();
        void syncGooglePhotorealistic3DTilesLayer();
        getViewer?.()?.scene?.requestRender?.();
    }

    function handleRemoteServiceSubmit({ type, url }: any) {
        const normalized = String(url || '').trim();
        if (!normalized) {
            message.warning('请输入有效的内容', { closable: true });
            return;
        }
        if (type === 'ion') {
            if (!/^\d+$/.test(normalized)) {
                message.warning('Ion Asset ID 必须为纯数字', { closable: true });
                return;
            }
            handleCustomIonAssetSubmit({ assetId: normalized });
            return;
        }
        if (type === 'glb') {
            if (!/^https?:\/\//i.test(normalized)) {
                message.warning('GLB 需要完整的 http(s) 直链', { closable: true });
                return;
            }
            if (typeof dataImport?.loadRemoteGlb !== 'function') {
                message.error('数据导入模块未就绪，无法加载 GLB', { closable: true });
                return;
            }
            message.info('正在加载远程 GLB…', { duration: 3000 });
            void dataImport.loadRemoteGlb(normalized).catch((error: any) => {
                console.error('[RemoteService] 远程 GLB 加载失败:', error);
                const msg = String(error?.message || error);
                message.error(
                    msg.includes('CORS') || msg.includes('Failed to fetch') || msg.includes('NetworkError')
                        ? '远程 GLB 加载失败：可能是跨域(CORS)或网络限制，请换可直连地址'
                        : `远程 GLB 加载失败: ${msg}`,
                    { closable: true },
                );
            });
            return;
        }
        void loadCustomUrl3DTiles(type, normalized);
    }

    function applyBasemap(value: string, options: any = {}) {
        const viewer = getViewer?.();
        if (!viewer || !getCesium?.()) return false;

        ensureRemoteServiceAdapter();
        abortAllDescriptorRequests();
        clearBaseImageryLayers();

        const pickerViewModel = viewer.baseLayerPicker?.viewModel;
        const providerViewModel = imageryProviderViewModelById.get(value);

        if (pickerViewModel && providerViewModel) {
            if (options.forceReload && pickerViewModel.selectedImagery === providerViewModel) {
                const fallbackViewModel =
                    imageryProviderViewModelById.get(DEFAULT_BASEMAP_PRESET_ID) ||
                    imageryProviderViewModelById.get('tianditu');
                if (fallbackViewModel && fallbackViewModel !== providerViewModel) {
                    pickerViewModel.selectedImagery = fallbackViewModel;
                }
            }
            if (pickerViewModel.selectedImagery !== providerViewModel) {
                pickerViewModel.selectedImagery = providerViewModel;
            }
            syncBasemapSideEffects();
            return true;
        }

        try {
            const providers = createImageryProvidersById(value);
            providers.forEach((provider: any) => {
                if (provider) {
                    imageryLayerHandles.push(viewer.imageryLayers.addImageryProvider(provider));
                }
            });

            syncTdtOverlayLayers();
            viewer.scene.requestRender?.();
            return true;
        } catch (error) {
            message.error('地图源切换失败', error);
            return false;
        }
    }

    function handleOverlayToggle({ overlayId, value }: any) {
        if (overlayId === 'tdt-boundaries') {
            tdtBoundaryLayerVisible.value = Boolean(value);
            return;
        }
        if (overlayId === 'tdt-text-labels') {
            tdtTextLabelLayerVisible.value = Boolean(value);
            return;
        }
        if (overlayId === 'cesium-osm-buildings') {
            osmBuildingsVisible.value = Boolean(value);
            return;
        }
        if (overlayId === 'google-photorealistic-3d-tiles') {
            googlePhotorealistic3DTilesVisible.value = Boolean(value);
            return;
        }
        if (overlayId === 'custom-ion-3d-tiles') {
            customIon3DTilesVisible.value = Boolean(value);
        }
    }

    async function handleCustomBasemapSubmit({ url, wmsLayer }: any) {
        const normalizedUrl = String(url || '').trim();

        if (normalizedUrl && looksLikeWmsSourceUrl(normalizedUrl)) {
            const info = await ensureWmsServiceInfo(normalizedUrl);
            if (!info || !info.layerOptions?.length) {
                message.warning('无法解析该地图服务（REST 与 WMS 均不可达或无可用图层）', { closable: true });
                return;
            }

            const selectedLayer = updateCustomWmsLayerSelection(normalizedUrl, wmsLayer, info);
            const activeLayers =
                selectedLayer || (info.arcgis ? '全部可见图层' : info.layers);

            customXyzBasemapUrl.value = normalizedUrl;
            if (activeBasemap.value === CUSTOM_XYZ_BASEMAP_ID) {
                applyBasemap(CUSTOM_XYZ_BASEMAP_ID, { forceReload: true });
            } else {
                activeBasemap.value = CUSTOM_XYZ_BASEMAP_ID;
            }

            flyCameraToServiceExtent(info);

            if (info.arcgis && info.queryable) {
                bindCesiumArcgisIdentify(info);
            } else {
                setIdentifyInfo(null);
            }

            const rsvcSelected = selectedLayer || '';
            registerRemoteService({
                kind: info.arcgis ? 'arcgis' : 'wms',
                url: normalizedUrl,
                endpoint: info.endpoint || normalizedUrl,
                title: info.title || normalizedUrl,
                selectedLayerId: rsvcSelected,
                layerLabel:
                    info.layerOptions?.find((option: any) => option.name === rsvcSelected)?.title || '',
                sublayers: (info.layerOptions || [])
                    .filter((option: any) => option.name && !option.name.includes(','))
                    .map((option: any) => ({ name: option.name, title: option.title, label: option.label })),
                selectedIds: rsvcSelected ? rsvcSelected.split(',') : [],
                layersParam: info.arcgis
                    ? rsvcSelected
                        ? `show:${rsvcSelected}`
                        : ''
                    : String(info.layers ?? ''),
                tileMode: info.tileMode,
                maxLevel: info.maxLevel,
                format: info.format,
                version: info.version,
                srs: info.srs,
                geographicBbox: info.geographicBbox as [number, number, number, number],
                queryable: info.queryable === true,
            });
            message.success(`已切换到自定义 WMS 图源（图层 ${activeLayers}）`);
            return;
        }

        const config = normalizeCustomXyzUrl(normalizedUrl);
        if (!config.valid) {
            message.warning(config.message, { closable: true });
            return;
        }

        const urlChanged = customXyzBasemapUrl.value !== normalizedUrl;
        customXyzBasemapUrl.value = normalizedUrl;

        if (activeBasemap.value === CUSTOM_XYZ_BASEMAP_ID) {
            if (!urlChanged) {
                applyBasemap(CUSTOM_XYZ_BASEMAP_ID, { forceReload: true });
            }
            message.success('已加载自定义 XYZ 图源');
            return;
        }

        activeBasemap.value = CUSTOM_XYZ_BASEMAP_ID;
        message.success('已切换到自定义 XYZ 图源');
    }

    function cleanupLayers() {
        clearBaseImageryLayers();
        clearTdtBoundaryLayer();
        clearTdtTextLabelLayer();
        clearOsmBuildingsLayer();
        clearGooglePhotorealistic3DTilesLayer();
        clearCustomIonLayer();
        unbindLayerPickerStateSync();
        disposeCesiumArcgisIdentify();
        cesiumRemoteAdapter?.dispose?.();
        cesiumRemoteAdapter = null;
        setCapabilitiesProxyBuilder(null, 'cesium');
    }

    return {
        activeBasemap,
        activeTerrain,
        customXyzBasemapUrl,
        customIonAssetId,
        customIonHeightOffset,
        customIonTilesetReady,
        basemapOptions,
        terrainOptions,
        overlayOptions,
        zoomToRemoteService: (serviceId: any) => cesiumRemoteAdapter?.flyTo?.(String(serviceId || '')) ?? false,
        createImageryProviderViewModels,
        createTerrainProviderViewModels,
        getSelectedImageryProviderViewModel,
        getSelectedTerrainProviderViewModel,
        bindLayerPickerStateSync,
        addBaseImageryLayers,
        initCustomTerrain,
        applyBasemap,
        applyTerrain,
        handleOverlayToggle,
        handleCustomBasemapSubmit,
        handleCustomIonAssetSubmit,
        handleRemoteServiceSubmit,
        cleanupLayers,
        basemapSwitcher,
        basemapCircuitOpen,
        resetCircuitBreaker: basemapSwitcher.resetCircuitBreaker,
    };
}
