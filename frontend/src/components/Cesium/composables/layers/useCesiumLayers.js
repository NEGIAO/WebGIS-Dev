import { computed, ref, watch } from 'vue';
import { applyCesiumIonToken } from '../core/cesiumRuntime';
import {
    readStoredBoolean,
    readStoredString,
    writeStoredBoolean,
    writeStoredString,
} from '../core/cesiumStorage';
import createGeoTerrainProvider from '../../terrain/GeoTerrainProvider';
import createArcGISTerrainProvider from '../../terrain/ArcGISTerrainProvider';
import { resolvePresetLayerIds } from '../../../../constants/basemap/basemapResolver';
import { DEFAULT_BASEMAP_PRESET_ID } from '../../../../constants/basemap/basemapConfig';
import { buildCesiumImageryProvidersForPreset, abortAllDescriptorRequests } from '../../../../constants/basemap/cesiumProviderFactory';
import { useCesiumBasemapSwitcher } from './useCesiumBasemapSwitcher';
import {
    TDT_SUBDOMAINS,
    TDT_SERVICE_ROOT,
    ARCGIS_WORLD_TERRAIN_URL,
    CUSTOM_XYZ_BASEMAP_ID,
    CUSTOM_XYZ_BASEMAP_URL_KEY,
    TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY,
    TDT_BOUNDARY_LAYER_VISIBLE_KEY,
    TDT_TEXT_LABEL_LAYER_VISIBLE_KEY,
    CESIUM_OSM_BUILDINGS_VISIBLE_KEY,
    GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY,
    unifiedBasemapOptions,
    terrainOptions,
    getTerrainIconColor,
    getTerrainIconText,
    readRuntimeValue,
    destroyPrimitive,
    createCesiumOsmBuildingsTileset,
    getBasemapTooltip,
    getPresetPickerColor,
    getPresetPickerLabel,
    normalizeCustomXyzUrl,
    createOfficialBasemapId,
    createPickerIcon,
} from './layerUtils';

export function useCesiumLayers({
    getViewer,
    getCesium,
    message,
    backendBaseUrl,
    tiandituToken,
    cesiumIonToken,
}) {
    let tdtBoundaryLayer = null;
    let tdtTextLabelLayer = null;
    let osmBuildingsTileset = null;
    let osmBuildingsLoadPromise = null;
    let osmBuildingsLoadId = 0;
    let googlePhotorealistic3DTileset = null;
    let googlePhotorealistic3DTilesetLoadPromise = null;
    let googlePhotorealistic3DTilesetLoadId = 0;
    let terrainSwitchId = 0;
    let layerPickerSubscriptions = [];

    const getTiandituToken = () => readRuntimeValue(tiandituToken);
    const getCesiumIonToken = () => readRuntimeValue(cesiumIonToken);

    const imageryLayerHandles = [];
    const officialBasemapOptions = ref([]);
    const imageryProviderViewModelById = new Map();
    const imageryProviderIdByViewModel = new Map();
    const terrainProviderViewModelById = new Map();
    const terrainProviderIdByViewModel = new Map();

    const LEGACY_CUSTOM_XYZ_BASEMAP_URL_KEY = 'cesium_custom_xyz_basemap_url';

    const activeBasemap = ref(DEFAULT_BASEMAP_PRESET_ID);
    const activeTerrain = ref('tianditu');
    // 读取自定义 URL：优先新 key，兼容旧 key
    const customXyzBasemapUrl = ref(readStoredString(CUSTOM_XYZ_BASEMAP_URL_KEY, '') ||
        readStoredString(LEGACY_CUSTOM_XYZ_BASEMAP_URL_KEY, ''));
    // 叠加层默认全部关闭：国界线 + 文字注记 + Cesium OSM Buildings + Google 倾斜摄影
    const legacyTdtLabelLayerVisible = readStoredBoolean(TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY, false);
    const tdtBoundaryLayerVisible = ref(
        readStoredBoolean(TDT_BOUNDARY_LAYER_VISIBLE_KEY, legacyTdtLabelLayerVisible ?? false),
    );
    const tdtTextLabelLayerVisible = ref(
        readStoredBoolean(TDT_TEXT_LABEL_LAYER_VISIBLE_KEY, legacyTdtLabelLayerVisible ?? false),
    );
    const osmBuildingsVisible = ref(
        readStoredBoolean(CESIUM_OSM_BUILDINGS_VISIBLE_KEY, false),
    );
    const googlePhotorealistic3DTilesVisible = ref(
        readStoredBoolean(GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY, false),
    );

    const basemapOptions = computed(() => [
        ...unifiedBasemapOptions.map((option) => {
            if (option.value !== 'custom') return option;
            return {
                ...option,
                description: customXyzBasemapUrl.value
                    ? customXyzBasemapUrl.value
                    : '输入 XYZ 瓦片 URL 后启用',
                source: 'custom',
                disabled: !customXyzBasemapUrl.value,
            };
        }),
        ...officialBasemapOptions.value,
    ]);

    // ========== 熔断/降级切换器 ==========
    const basemapSwitcher = useCesiumBasemapSwitcher({
        getViewer,
        getCesium,
        activeBasemap,
        applyBasemap,
        resolvePresetLayerIds,
        message,
    });

    /** 供 UI 绑定的熔断状态 */
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

    watch(customXyzBasemapUrl, (value) => {
        writeStoredString(CUSTOM_XYZ_BASEMAP_URL_KEY, value);
    });

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

    function createImageryProviderViewModels() {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        imageryProviderViewModelById.clear();
        imageryProviderIdByViewModel.clear();

        // 从统一预设构建 ProviderViewModel 列表
        const projectProviderViewModels = unifiedBasemapOptions.map((option) => {
            const viewModel = new Cesium.ProviderViewModel({
                name: option.label,
                tooltip: getBasemapTooltip(option),
                category: '项目底图',
                iconUrl: createPickerIcon(
                    getPresetPickerColor(option.value),
                    getPresetPickerLabel(option.value, option.label),
                ),
                creationFunction: () => createImageryProvidersById(option.value),
            });
            imageryProviderViewModelById.set(option.value, viewModel);
            imageryProviderIdByViewModel.set(viewModel, option.value);
            return viewModel;
        });

        const officialProviderViewModels = getDefaultImageryProviderViewModels();
        officialBasemapOptions.value = officialProviderViewModels.map((viewModel, index) => {
            const label = String(viewModel?.name || `官方底图 ${index + 1}`).trim();
            const value = createOfficialBasemapId(label, index);
            imageryProviderViewModelById.set(value, viewModel);
            imageryProviderIdByViewModel.set(viewModel, value);
            return {
                value,
                label: `官方 · ${label}`,
                description: String(viewModel?.tooltip || label),
                source: 'official',
            };
        });

        return [
            ...projectProviderViewModels,
            ...officialProviderViewModels,
        ];
    }

    function createTerrainProviderViewModels() {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        terrainProviderViewModelById.clear();
        terrainProviderIdByViewModel.clear();

        return terrainOptions.map((option) => {
            const viewModel = new Cesium.ProviderViewModel({
                name: option.label,
                tooltip: option.description || option.label,
                category: '项目地形',
                iconUrl: createPickerIcon(
                    getTerrainIconColor(option.value),
                    getTerrainIconText(option.value),
                ),
                creationFunction: () => createTerrainProviderById(option.value),
            });
            terrainProviderViewModelById.set(option.value, viewModel);
            terrainProviderIdByViewModel.set(viewModel, option.value);
            return viewModel;
        });
    }

    function getSelectedImageryProviderViewModel(fallbackViewModels = []) {
        return imageryProviderViewModelById.get(activeBasemap.value) || fallbackViewModels[0];
    }

    function getSelectedTerrainProviderViewModel(fallbackViewModels = []) {
        return terrainProviderViewModelById.get(activeTerrain.value) || fallbackViewModels[0];
    }

    function getDefaultImageryProviderViewModels() {
        const Cesium = getCesium?.();
        if (typeof Cesium?.createDefaultImageryProviderViewModels !== 'function') {
            return [];
        }

        try {
            return Cesium.createDefaultImageryProviderViewModels() || [];
        } catch (error) {
            console.warn('Cesium default imagery provider view models unavailable:', error);
            return [];
        }
    }

    function createImageryProvidersById(value) {
        // 先检查是否为统一预设 ID（如 'custom_China_Blender_preset_2'）
        const stackIds = resolvePresetLayerIds(value);
        if (stackIds.length > 0) {
            return createImageryProvidersFromPreset(value);
        }

        // 兼容旧的 Cesium 专用 ID
        if (value === 'google') return createGoogleImageryProviders();
        if (value === CUSTOM_XYZ_BASEMAP_ID) return createCustomXyzImageryProviders();
        if (value === 'tianditu') return createTiandituImageryProviders();

        // 默认 fallback
        return createTiandituImageryProviders();
    }

    /** 从统一预设创建 Cesium ImageryProvider 数组 */
    function createImageryProvidersFromPreset(presetId) {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        const stackIds = resolvePresetLayerIds(presetId);
        if (!stackIds.length) {
            console.warn(`[useCesiumLayers] 预设 "${presetId}" 没有有效的图层栈`);
            return createTiandituImageryProviders();
        }

        // 获取运行时 token
        const tiandituTk = getTiandituToken();
        const customUrl = customXyzBasemapUrl.value;

        const ctx = {
            tiandituTk,
            customUrl: customUrl,
            normBase: '',
        };

        return buildCesiumImageryProvidersForPreset(Cesium, stackIds, ctx);
    }

    function createTiandituImageryProviders() {
        const Cesium = getCesium?.();
        return [
            new Cesium.UrlTemplateImageryProvider({
                url: `${TDT_SERVICE_ROOT}DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${getTiandituToken()}`,
                subdomains: TDT_SUBDOMAINS,
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 18,
            }),
        ];
    }

    function createGoogleImageryProviders() {
        const Cesium = getCesium?.();
        return [
            new Cesium.UrlTemplateImageryProvider({
                url: `${backendBaseUrl}/proxy/mt{s}.google.com/vt?lyrs=s&x={x}&y={y}&z={z}`,
                subdomains: ['0', '1', '2', '3'],
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 20,
            }),
        ];
    }

    function createCustomXyzImageryProviders() {
        const Cesium = getCesium?.();
        const config = normalizeCustomXyzUrl(customXyzBasemapUrl.value);
        if (!config.valid) {
            message.warning(config.message, { closable: true });
            return createTiandituImageryProviders();
        }

        return [
            new Cesium.UrlTemplateImageryProvider({
                url: config.url,
                subdomains: config.subdomains,
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 20,
                enablePickFeatures: false,
            }),
        ];
    }

    function createTdtBoundaryImageryProvider() {
        const Cesium = getCesium?.();
        return new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=ibo_w&x={x}&y={y}&l={z}&tk=${getTiandituToken()}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 10,
        });
    }

    function createTdtTextLabelImageryProvider() {
        const Cesium = getCesium?.();
        return new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=cia_w&x={x}&y={y}&l={z}&tk=${getTiandituToken()}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 18,
        });
    }

    function bindLayerPickerStateSync() {
        unbindLayerPickerStateSync();
        const Cesium = getCesium?.();
        const pickerViewModel = getViewer?.()?.baseLayerPicker?.viewModel;
        if (!pickerViewModel || !Cesium?.knockout?.getObservable) return;

        const imageryObservable = Cesium.knockout.getObservable(pickerViewModel, 'selectedImagery');
        const terrainObservable = Cesium.knockout.getObservable(pickerViewModel, 'selectedTerrain');
        const subscriptions = [];

        const imagerySubscription = imageryObservable?.subscribe?.((viewModel) => {
            const value = imageryProviderIdByViewModel.get(viewModel);
            if (!value) return;
            if (activeBasemap.value !== value) {
                activeBasemap.value = value;
            }
            syncBasemapSideEffects();
        });

        const terrainSubscription = terrainObservable?.subscribe?.((viewModel) => {
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
        layerPickerSubscriptions.forEach(subscription => subscription?.dispose?.());
        layerPickerSubscriptions = [];
    }

    function addBaseImageryLayers() {
        // 同步叠加层（国界线 / 文字注记）
        syncTdtOverlayLayers();
        // 同步 Cesium OSM Buildings 与 Google 倾斜摄影
        void syncOsmBuildingsLayer();
        void syncGooglePhotorealistic3DTilesLayer();
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

    function syncTdtOverlayLayers() {
        const viewer = getViewer?.();
        if (!viewer || !getCesium?.()) return;

        if (tdtBoundaryLayerVisible.value) {
            ensureTdtBoundaryLayer();
        } else {
            clearTdtBoundaryLayer();
        }

        if (tdtTextLabelLayerVisible.value) {
            ensureTdtTextLabelLayer();
        } else {
            clearTdtTextLabelLayer();
        }

        viewer.scene.requestRender?.();
    }

    function ensureTdtBoundaryLayer() {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers || tdtBoundaryLayer) {
            if (tdtBoundaryLayer) {
                viewer?.imageryLayers?.raiseToTop?.(tdtBoundaryLayer);
            }
            return tdtBoundaryLayer;
        }

        try {
            tdtBoundaryLayer = viewer.imageryLayers.addImageryProvider(createTdtBoundaryImageryProvider());
            viewer.imageryLayers.raiseToTop?.(tdtBoundaryLayer);
            return tdtBoundaryLayer;
        } catch (error) {
            message.error('天地图国界线图层加载失败', error);
            return null;
        }
    }

    function ensureTdtTextLabelLayer() {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers || tdtTextLabelLayer) {
            if (tdtTextLabelLayer) {
                viewer?.imageryLayers?.raiseToTop?.(tdtTextLabelLayer);
            }
            return tdtTextLabelLayer;
        }

        try {
            tdtTextLabelLayer = viewer.imageryLayers.addImageryProvider(createTdtTextLabelImageryProvider());
            viewer.imageryLayers.raiseToTop?.(tdtTextLabelLayer);
            return tdtTextLabelLayer;
        } catch (error) {
            message.error('天地图文字标注图层加载失败', error);
            return null;
        }
    }

    function clearTdtBoundaryLayer() {
        const viewer = getViewer?.();
        if (!tdtBoundaryLayer || !viewer?.imageryLayers) return;

        try {
            viewer.imageryLayers.remove(tdtBoundaryLayer, true);
        } catch (error) {
            console.warn('TDT boundary layer remove warning:', error);
        }
        tdtBoundaryLayer = null;
    }

    function clearTdtTextLabelLayer() {
        const viewer = getViewer?.();
        if (!tdtTextLabelLayer || !viewer?.imageryLayers) return;

        try {
            viewer.imageryLayers.remove(tdtTextLabelLayer, true);
        } catch (error) {
            console.warn('TDT text label layer remove warning:', error);
        }
        tdtTextLabelLayer = null;
    }

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
            viewer.scene.globe.show = false;
            return googlePhotorealistic3DTileset;
        }

        if (googlePhotorealistic3DTilesetLoadPromise) return googlePhotorealistic3DTilesetLoadPromise;

        if (typeof Cesium?.createGooglePhotorealistic3DTileset !== 'function') {
            message.warning('当前 Cesium 运行时不支持 Google Photorealistic 3D Tiles。', { closable: true });
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
            },
        );

        try {
            const tileset = await googlePhotorealistic3DTilesetLoadPromise;
            if (loadId !== googlePhotorealistic3DTilesetLoadId || !googlePhotorealistic3DTilesVisible.value) {
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
            if (viewer?.scene?.globe) {
                viewer.scene.globe.show = true;
            }
            return;
        }

        try {
            viewer.scene.primitives.remove(googlePhotorealistic3DTileset);
        } catch (error) {
            console.warn('Google Photorealistic 3D Tiles layer remove warning:', error);
        }

        googlePhotorealistic3DTileset = null;
        if (viewer?.scene?.globe) {
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

        activeTerrain.value = 'cesiumWorld';
        const switched = await applyTerrain('cesiumWorld');
        if (!switched) {
            message.warning('Cesium OSM Buildings 建议配合 Cesium 世界地形使用，当前地形可能导致建筑遮挡或高度偏移。', { closable: true });
        }
        return switched;
    }

    function applyBasemap(value, options = {}) {
        const viewer = getViewer?.();
        if (!viewer || !getCesium?.()) return false;

        // 先中断所有旧请求，实现快速切换
        abortAllDescriptorRequests();
        clearBaseImageryLayers();

        const pickerViewModel = viewer.baseLayerPicker?.viewModel;
        const providerViewModel = imageryProviderViewModelById.get(value);

        // 如果有对应的 ProviderViewModel，通过 baseLayerPicker 切换
        if (pickerViewModel && providerViewModel) {
            if (options.forceReload && pickerViewModel.selectedImagery === providerViewModel) {
                const fallbackViewModel = imageryProviderViewModelById.get(
                    DEFAULT_BASEMAP_PRESET_ID
                ) || imageryProviderViewModelById.get('tianditu');
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

        // 降级路径：直接操作 imageryLayers
        try {
            const providers = createImageryProvidersById(value);
            providers.forEach((provider) => {
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

    function initCustomTerrain() {
        return applyTerrain(activeTerrain.value);
    }

    async function applyTerrain(value) {
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

    function applyTerrainSceneFlags(value) {
        const viewer = getViewer?.();
        if (!viewer?.scene?.globe) return;
        viewer.scene.globe.depthTestAgainstTerrain = value !== 'ellipsoid';
    }

    function createTerrainProviderById(value) {
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

    function queueTerrainFallback(failedValue, fallbackValue) {
        const schedule = typeof window !== 'undefined' ? window.setTimeout : setTimeout;
        schedule(() => {
            if (activeTerrain.value !== failedValue) return;
            activeTerrain.value = fallbackValue;
        }, 0);
    }

    function handleOverlayToggle({ overlayId, value }) {
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
        }
    }

    function handleCustomBasemapSubmit({ url }) {
        const normalizedUrl = String(url || '').trim();
        const config = normalizeCustomXyzUrl(normalizedUrl);
        if (!config.valid) {
            message.warning(config.message, { closable: true });
            return;
        }

        customXyzBasemapUrl.value = normalizedUrl;

        if (activeBasemap.value === CUSTOM_XYZ_BASEMAP_ID) {
            if (applyBasemap(CUSTOM_XYZ_BASEMAP_ID, { forceReload: true })) {
                message.success('已加载自定义 XYZ 图源');
            }
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
        unbindLayerPickerStateSync();
    }

    return {
        activeBasemap,
        activeTerrain,
        customXyzBasemapUrl,
        basemapOptions,
        terrainOptions,
        overlayOptions,
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
        cleanupLayers,
        // 熔断/降级切换器
        basemapSwitcher,
        basemapCircuitOpen,
    resetCircuitBreaker: basemapSwitcher.resetCircuitBreaker,
    };
}
