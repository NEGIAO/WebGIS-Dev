import { computed, ref, watch } from 'vue';
import { applyCesiumIonToken } from './cesiumRuntime';
import {
    readStoredBoolean,
    readStoredString,
    writeStoredBoolean,
    writeStoredString,
} from './cesiumStorage';
import createGeoTerrainProvider from '../terrain/GeoTerrainProvider';

const TDT_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const TDT_SERVICE_ROOT = 'https://t{s}.tianditu.gov.cn/';
const CUSTOM_XYZ_BASEMAP_ID = 'custom-xyz';
const CUSTOM_XYZ_BASEMAP_URL_KEY = 'cesium_custom_xyz_basemap_url';
const TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY = 'cesium_tdt_label_layer_visible';
const TDT_BOUNDARY_LAYER_VISIBLE_KEY = 'cesium_tdt_boundary_layer_visible';
const TDT_TEXT_LABEL_LAYER_VISIBLE_KEY = 'cesium_tdt_text_label_layer_visible';

const projectBasemapOptions = [
    { value: 'tianditu', label: '天地图', description: '天地图影像与注记服务' },
    { value: 'google', label: 'Google', description: 'Google 卫星影像代理服务' },
    { value: CUSTOM_XYZ_BASEMAP_ID, label: '自定义 XYZ', description: '用户输入的 XYZ 瓦片 URL' },
];

const terrainOptions = [
    { value: 'tianditu', label: '天地图地形', description: '天地图高程地形服务' },
    { value: 'cesiumWorld', label: 'Cesium世界地形', description: 'Cesium ion 全球地形服务' },
    { value: 'ellipsoid', label: '平面地形', description: '无高程的椭球地形' },
];

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
    let terrainSwitchId = 0;
    let layerPickerSubscriptions = [];

    const imageryLayerHandles = [];
    const officialBasemapOptions = ref([]);
    const imageryProviderViewModelById = new Map();
    const imageryProviderIdByViewModel = new Map();
    const terrainProviderViewModelById = new Map();
    const terrainProviderIdByViewModel = new Map();

    const activeBasemap = ref('tianditu');
    const activeTerrain = ref('tianditu');
    const customXyzBasemapUrl = ref(readStoredString(CUSTOM_XYZ_BASEMAP_URL_KEY, ''));
    const legacyTdtLabelLayerVisible = readStoredBoolean(TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY, true);
    const tdtBoundaryLayerVisible = ref(
        readStoredBoolean(TDT_BOUNDARY_LAYER_VISIBLE_KEY, legacyTdtLabelLayerVisible),
    );
    const tdtTextLabelLayerVisible = ref(
        readStoredBoolean(TDT_TEXT_LABEL_LAYER_VISIBLE_KEY, legacyTdtLabelLayerVisible),
    );

    const basemapOptions = computed(() => [
        ...projectBasemapOptions.map((option) => {
            if (option.value !== CUSTOM_XYZ_BASEMAP_ID) return option;
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

    function createImageryProviderViewModels() {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        imageryProviderViewModelById.clear();
        imageryProviderIdByViewModel.clear();

        const projectProviderViewModels = projectBasemapOptions.map((option) => {
            const viewModel = new Cesium.ProviderViewModel({
                name: option.label,
                tooltip: getBasemapTooltip(option),
                category: '项目底图',
                iconUrl: createPickerIcon(
                    option.value === 'google'
                        ? '#5ea1ff'
                        : option.value === CUSTOM_XYZ_BASEMAP_ID
                            ? '#f59e0b'
                            : '#37d67a',
                    option.value === 'google'
                        ? 'G'
                        : option.value === CUSTOM_XYZ_BASEMAP_ID
                            ? 'XY'
                            : 'TD',
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
                    option.value === 'ellipsoid' ? '#a3a3a3' : '#d0a449',
                    option.value === 'cesiumWorld' ? 'CW' : option.value === 'ellipsoid' ? 'EL' : 'TE',
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
        if (value === 'google') return createGoogleImageryProviders();
        if (value === CUSTOM_XYZ_BASEMAP_ID) return createCustomXyzImageryProviders();
        return createTiandituImageryProviders();
    }

    function createTiandituImageryProviders() {
        const Cesium = getCesium?.();
        return [
            new Cesium.UrlTemplateImageryProvider({
                url: `${TDT_SERVICE_ROOT}DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${tiandituToken}`,
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
            url: `${TDT_SERVICE_ROOT}DataServer?T=ibo_w&x={x}&y={y}&l={z}&tk=${tiandituToken}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 10,
        });
    }

    function createTdtTextLabelImageryProvider() {
        const Cesium = getCesium?.();
        return new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=cia_w&x={x}&y={y}&l={z}&tk=${tiandituToken}`,
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
        syncBasemapSideEffects();
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

    function applyBasemap(value, options = {}) {
        const viewer = getViewer?.();
        if (!viewer || !getCesium?.()) return false;

        const pickerViewModel = viewer.baseLayerPicker?.viewModel;
        const providerViewModel = imageryProviderViewModelById.get(value);
        if (pickerViewModel && providerViewModel) {
            clearBaseImageryLayers();
            if (options.forceReload && pickerViewModel.selectedImagery === providerViewModel) {
                const fallbackViewModel = imageryProviderViewModelById.get('tianditu');
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
            clearBaseImageryLayers();
            const providers = createImageryProvidersById(value);
            providers.forEach((provider) => {
                imageryLayerHandles.push(viewer.imageryLayers.addImageryProvider(provider));
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

        const GeoTerrainProvider = createGeoTerrainProvider(Cesium);
        try {
            viewer.terrainProvider = new GeoTerrainProvider({
                url: `${TDT_SERVICE_ROOT}mapservice/swdx?T=elv_c&tk={token}&x={x}&y={y}&l={z}`,
                subdomains: TDT_SUBDOMAINS,
                token: tiandituToken,
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

        const GeoTerrainProvider = createGeoTerrainProvider(Cesium);
        try {
            return new GeoTerrainProvider({
                url: `${TDT_SERVICE_ROOT}mapservice/swdx?T=elv_c&tk={token}&x={x}&y={y}&l={z}`,
                subdomains: TDT_SUBDOMAINS,
                token: tiandituToken,
            });
        } catch (error) {
            message.warning('官方地形服务加载失败，已降级为椭球地形。', { closable: true });
            message.error('官方地形初始化失败', error);
            return new Cesium.EllipsoidTerrainProvider();
        }
    }

    async function createCesiumWorldTerrainProvider() {
        const Cesium = getCesium?.();
        applyCesiumIonToken(Cesium, cesiumIonToken);

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
    };
}

function getBasemapTooltip(option) {
    if (option.value !== CUSTOM_XYZ_BASEMAP_ID) {
        return option.description || option.label;
    }
    return `${option.description || option.label}\n支持 https://server/{z}/{x}/{y}.png`;
}

function normalizeCustomXyzUrl(rawUrl) {
    const source = String(rawUrl || '').trim();
    if (!source) {
        return {
            valid: false,
            message: '自定义 XYZ URL 为空',
            url: '',
            subdomains: [],
        };
    }

    let url = source
        .replace(/\{z\}/gi, '{z}')
        .replace(/\{x\}/gi, '{x}')
        .replace(/\{y\}/gi, '{y}')
        .replace(/\{subdomains?\}/gi, '{s}')
        .replace(/\{switch:[^}]+\}/gi, '{s}')
        .replace(/\{s\}/gi, '{s}');

    const subdomainRange = url.match(/\{([a-z0-9])-([a-z0-9])\}/i);
    let subdomains = [];

    if (subdomainRange) {
        subdomains = expandSubdomainRange(subdomainRange[1], subdomainRange[2]);
        url = url.replace(subdomainRange[0], '{s}');
    } else if (/\{s\}/i.test(url)) {
        subdomains = ['a', 'b', 'c'];
    }

    if (!/\{z\}/.test(url) || !/\{x\}/.test(url) || !/\{y\}/.test(url)) {
        return {
            valid: false,
            message: 'URL 需要包含 {z}、{x}、{y} 占位符',
            url,
            subdomains,
        };
    }

    if (!isValidCustomTileUrl(url)) {
        return {
            valid: false,
            message: 'URL 格式不合法',
            url,
            subdomains,
        };
    }

    return {
        valid: true,
        message: '',
        url,
        subdomains,
    };
}

function expandSubdomainRange(start, end) {
    const startCode = String(start || '').charCodeAt(0);
    const endCode = String(end || '').charCodeAt(0);
    if (!Number.isFinite(startCode) || !Number.isFinite(endCode)) return [];

    const step = startCode <= endCode ? 1 : -1;
    const values = [];
    for (let code = startCode; step > 0 ? code <= endCode : code >= endCode; code += step) {
        values.push(String.fromCharCode(code));
    }
    return values;
}

function isValidCustomTileUrl(url) {
    if (/^(https?:)?\/\//i.test(url) || url.startsWith('/')) return true;

    try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const parsed = new URL(url, baseUrl);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function createOfficialBasemapId(label, index) {
    const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `official_${index}_${slug || 'basemap'}`;
}

function createPickerIcon(color, shortLabel) {
    const safeLabel = String(shortLabel || '').replace(/[<>&"']/g, '').slice(0, 2);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="10" fill="#0f2432"/>
            <circle cx="32" cy="30" r="18" fill="${color}" opacity="0.9"/>
            <text x="32" y="53" text-anchor="middle" fill="#ffffff" font-size="10" font-family="Arial">${safeLabel}</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
