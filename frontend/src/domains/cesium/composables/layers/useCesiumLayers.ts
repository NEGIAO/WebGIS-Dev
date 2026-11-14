import { computed, ref, watch } from 'vue';
import { createArcgisIdentify } from './arcgisIdentify';
import { createCustomIonLayerManager } from './customIonLayer';
import { createOverlayTilesetManager } from './overlayTilesets';
import { createTdtOverlayManager } from './tdtOverlays';
import { createTerrainManager } from './terrainManager';
import { useSharedCustomBasemapUrl } from '@common/basemap/useSharedCustomBasemapUrl';
import {
    looksLikeWmsSourceUrl,
    ensureWmsServiceInfo,
    getCachedWmsInfo,
    buildArcgisExportTemplate,
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
import {
    buildCesiumImageryProvidersForPreset,
    abortAllDescriptorRequests,
} from '@cesium-domain/constants/basemapProviderFactory';
import { useCesiumBasemapSwitcher } from './useCesiumBasemapSwitcher';
import { arcgisBboxParts } from './i3sWebMercator';
import {
    TDT_SERVICE_ROOT,
    TDT_SUBDOMAINS,
    CUSTOM_XYZ_BASEMAP_ID,
    TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY,
    TDT_BOUNDARY_LAYER_VISIBLE_KEY,
    TDT_TEXT_LABEL_LAYER_VISIBLE_KEY,
    CESIUM_OSM_BUILDINGS_VISIBLE_KEY,
    GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY,
    getUnifiedBasemapOptions,
    terrainOptions,
    getTerrainIconColor,
    getTerrainIconText,
    readRuntimeValue,
    getBasemapTooltip,
    getPresetPickerColor,
    getPresetPickerLabel,
    normalizeCustomXyzUrl,
    createOfficialBasemapId,
    createPickerIcon,
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
    // 参数保留（调用方仍传 backendBaseUrl 键），当前实现未消费，加 _ 前缀声明有意未用
    backendBaseUrl: _backendBaseUrl,
    tiandituToken,
    ovitalTdtkeyToken,
    cesiumIonToken,
    dataImport,
} = {} as UseCesiumLayersOptions) {
    // 能力文档代理兜底：内网自签/CORS 服务直连失败时经 VPS /proxy 重试（与 OL 引擎同语义）。
    // 按 owner 注册：3D 容器卸载时注销 'cesium' 键，自动回落常驻 OL 构造器
    setCapabilitiesProxyBuilder(
        (url) => (url ? tileProxyUrl(url) : null),
        'cesium',
    );

    // 在线服务注册表 → Cesium ImageryLayer 渲染适配器（TOC「在线服务」分组的 3D 渲染端）
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
    // 本地与部署环境统一默认天地图世界地形（原 DEV 强制平面地形逻辑已移除）
    const activeTerrain = ref('tianditu');
    const { customBasemapUrl: customXyzBasemapUrl } = useSharedCustomBasemapUrl();
    // 叠加层默认全部关闭：国界线 + 文字注记 + Cesium OSM Buildings + Google 倾斜摄影
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

    // ========== 熔断/降级切换器 ==========
    const basemapSwitcher = useCesiumBasemapSwitcher({
        getViewer,
        getCesium: () => getCesium?.(),
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

    // ── 在线服务：注册表变化时自动同步 Cesium 图层 + 绑定点击查询 ──
    // 无论用户从哪个入口加载服务（面板/TOC/Agent），都走同一条渲染和查询链路
    watch(customXyzBasemapUrl, () => {
        ensureRemoteServiceAdapter();
        bindCesiumArcgisIdentify();
    });

    // ── 在线服务：无论从哪个入口加载，引擎就绪后自动挂载渲染适配器和点击查询 ──
    // 轮询等待 viewer 就绪（Cesium viewer 创建是异步的），避免依赖特定操作路径触发
    const rsvcInitTimer = setInterval(() => {
        if (getViewer?.() && getCesium?.()) {
            clearInterval(rsvcInitTimer);
            ensureRemoteServiceAdapter();
            bindCesiumArcgisIdentify();
        }
    }, 500);
    setTimeout(() => clearInterval(rsvcInitTimer), 15000); // 15s 超时防泄漏

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


    function createImageryProviderViewModels() {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        imageryProviderViewModelById.clear();
        imageryProviderIdByViewModel.clear();

        // 从统一预设构建 ProviderViewModel 列表
        const projectProviderViewModels = getUnifiedBasemapOptions().map((option: any) => {
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
        officialBasemapOptions.value = officialProviderViewModels.map((viewModel: any, index: number) => {
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

        return [...projectProviderViewModels, ...officialProviderViewModels];
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

    function getSelectedImageryProviderViewModel(fallbackViewModels: any = []) {
        return imageryProviderViewModelById.get(activeBasemap.value) || fallbackViewModels[0];
    }

    function getSelectedTerrainProviderViewModel(fallbackViewModels: any = []) {
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

    function createImageryProvidersById(value: string) {
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
    function createImageryProvidersFromPreset(presetId: string) {
        const Cesium = getCesium?.();
        if (!Cesium) return [];

        const stackIds = resolvePresetLayerIds(presetId);
        if (!stackIds.length) {
            console.warn(`[useCesiumLayers] 预设 "${presetId}" 没有有效的图层栈`);
            return createTiandituImageryProviders();
        }

        // 获取运行时 token
        const tiandituTk = getTiandituToken();
        const ovitalTdtkey = getOvitalTdtkey();
        const customUrl = customXyzBasemapUrl.value;

        const ctx = {
            tiandituTk,
            ovitalTdtkey,
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
                url: tileProxyUrl('mt{s}.google.com/vt?lyrs=s&x={x}&y={y}&z={z}'),
                subdomains: ['0', '1', '2', '3'],
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 20,
            }),
        ];
    }

    /**
     * ArcGIS 原生协议：动态 export 出图
     * customTags 按瓦片坐标计算 EPSG:3857 米制 BBOX（与 OL 侧共用模板构建器）
     */
    function createCustomArcgisImageryProviders(Cesium: any, info: any, selectedLayer: any) {
        const template = buildArcgisExportTemplate(info, selectedLayer);
        return [
            new Cesium.UrlTemplateImageryProvider({
                url: template,
                customTags: {
                    minx: (_: any, x: number, y: number, z: number) => arcgisBboxParts(z, x, y).minx,
                    miny: (_: any, x: number, y: number, z: number) => arcgisBboxParts(z, x, y).miny,
                    maxx: (_: any, x: number, y: number, z: number) => arcgisBboxParts(z, x, y).maxx,
                    maxy: (_: any, x: number, y: number, z: number) => arcgisBboxParts(z, x, y).maxy,
                    w: () => 256,
                    h: () => 256,
                },
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 24,
                enablePickFeatures: false,
            }),
        ];
    }

    /**
     * 根据解析好的 WMS 元信息创建 ImageryProvider
     * 服务仅支持经纬度坐标系时切换 GeographicTilingScheme，保证 BBOX 与 SRS 一致
     * 用户已选择图层时优先生效（customWmsSelectedLayer）
     */
    function createCustomWmsImageryProviders(Cesium: any, info: any) {
        if (!Cesium || typeof Cesium.WebMapServiceImageryProvider !== 'function') {
            console.warn('[useCesiumLayers] 当前 Cesium 运行时不支持 WebMapServiceImageryProvider');
            return [];
        }
        // ArcGIS 原生协议
        if (info.arcgis) {
            // 切片缓存：直连 /tile/{z}/{y}/{x}（缺失瓦片 404 按透明处理）
            if (info.tileMode === 'tiles') {
                return [
                    new Cesium.UrlTemplateImageryProvider({
                        url: `${String(info.endpoint).replace(/\/+$/, '')}/tile/{z}/{y}/{x}`,
                        tilingScheme: new Cesium.WebMercatorTilingScheme(),
                        maximumLevel: Number.isFinite(info.maxLevel) ? Number(info.maxLevel) : 24,
                        enablePickFeatures: false,
                    }),
                ];
            }
            // 动态出图（export）
            const selected = (info.layerOptions?.length && customWmsSelectedLayer) || '';
            return createCustomArcgisImageryProviders(Cesium, info, selected);
        }
        const layers =
            (info.layerOptions?.length && customWmsSelectedLayer) || info.layers;
        const tilingScheme = info.mercator
            ? new Cesium.WebMercatorTilingScheme()
            : new Cesium.GeographicTilingScheme();
        const crsParamName = String(info.version || '').startsWith('1.3') ? 'crs' : 'srs';
        return [
            new Cesium.WebMapServiceImageryProvider({
                url: info.endpoint,
                layers,
                parameters: {
                    service: 'WMS',
                    version: info.version || '1.1.1',
                    request: 'GetMap',
                    styles: '',
                    format: info.format || 'image/png',
                    transparent: true,
                    [crsParamName]: info.srs,
                },
                tilingScheme,
                enablePickFeatures: false,
            }),
        ];
    }

    // 用户在工具面板选择的 WMS 图层名；URL 变化时重置
    let customWmsSelectedLayer = '';
    let customWmsLayerForUrl = '';


    let wmsResolvingNotifiedUrl = '';
    let wmsFailureNotifiedUrl = '';

    function createCustomXyzImageryProviders() {
        const Cesium = getCesium?.();
        const rawUrl = customXyzBasemapUrl.value;

        // 自定义 WMS 图源分支：capabilities 异步解析，未就绪前先回落天地图并等待重载
        if (rawUrl && looksLikeWmsSourceUrl(rawUrl)) {
            const cachedInfo = getCachedWmsInfo(rawUrl);
            if (cachedInfo) {
                return createCustomWmsImageryProviders(Cesium, cachedInfo);
            }
            if (wmsResolvingNotifiedUrl !== rawUrl) {
                wmsResolvingNotifiedUrl = rawUrl;
                message.info('正在解析 WMS 服务元数据，完成后自动加载', { duration: 3000 });
            }
            void ensureWmsServiceInfo(rawUrl).then((info) => {
                if (info && activeBasemap.value === CUSTOM_XYZ_BASEMAP_ID) {
                    applyBasemap(CUSTOM_XYZ_BASEMAP_ID, { forceReload: true });
                } else if (!info && wmsFailureNotifiedUrl !== rawUrl) {
                    wmsFailureNotifiedUrl = rawUrl;
                    message.warning('WMS 图源元数据解析失败，请检查服务地址是否可访问', { closable: true });
                }
            });
            return createTiandituImageryProviders();
        }

        const config = normalizeCustomXyzUrl(rawUrl);
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
        // 引擎初始化路径挂载在线服务适配器（applyBasemap 未必在初始加载时被调用）
        ensureRemoteServiceAdapter();
        // 同步叠加层（国界线 / 文字注记）
        syncTdtOverlayLayers();
        // 同步 Cesium OSM Buildings 与 Google 倾斜摄影
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


    /**
     * 远程服务提交处理器（数据 Tab 新卡片发出）。
     * - Ion 类型 → 复用现有自动识别逻辑（3D Tiles → 地形 → 影像）
     * - I3S / 3D Tiles 类型 → 走 loadCustomUrl3DTiles 新路径
     * - GLB/GLTF → 直链 Entity 模型，自动放相机视野中心
     */
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

        // 首次可用时机挂载在线服务渲染适配器（viewer 就绪后自动 reconcile 注册表）
        ensureRemoteServiceAdapter();

        // 先中断所有旧请求，实现快速切换
        abortAllDescriptorRequests();
        clearBaseImageryLayers();

        const pickerViewModel = viewer.baseLayerPicker?.viewModel;
        const providerViewModel = imageryProviderViewModelById.get(value);

        // 如果有对应的 ProviderViewModel，通过 baseLayerPicker 切换
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

        // 自定义 WMS/ArcGIS 图源：先解析服务元数据校验可达性，再落库切换
        if (normalizedUrl && looksLikeWmsSourceUrl(normalizedUrl)) {
            const info = await ensureWmsServiceInfo(normalizedUrl);
            if (!info || !info.layerOptions?.length) {
                message.warning('无法解析该地图服务（REST 与 WMS 均不可达或无可用图层）', { closable: true });
                return;
            }

            // 记录用户选择的图层；URL 变化时丢弃旧选择
            if (customWmsLayerForUrl !== normalizedUrl) {
                customWmsSelectedLayer = '';
                customWmsLayerForUrl = normalizedUrl;
            }
            if (wmsLayer && info.layerOptions?.some((option) => option.name === wmsLayer)) {
                customWmsSelectedLayer = wmsLayer;
            }

            const activeLayers =
                customWmsSelectedLayer || (info.arcgis ? '全部可见图层' : info.layers);

            customXyzBasemapUrl.value = normalizedUrl;
            if (activeBasemap.value === CUSTOM_XYZ_BASEMAP_ID) {
                applyBasemap(CUSTOM_XYZ_BASEMAP_ID, { forceReload: true });
            } else {
                activeBasemap.value = CUSTOM_XYZ_BASEMAP_ID;
            }

            // 小范围服务：相机自动飞到数据范围
            flyCameraToServiceExtent(info);

            // 开放 Query 能力的服务：启用点击查属性
            if (info.arcgis && info.queryable) {
                bindCesiumArcgisIdentify(info);
            } else {
                setIdentifyInfo(null);
            }

            // 同步注册到「在线服务」注册表（TOC 统一管理；同 url+同图层去重更新）
            const rsvcSelected = customWmsSelectedLayer || '';
            registerRemoteService({
                kind: info.arcgis ? 'arcgis' : 'wms',
                url: normalizedUrl,
                endpoint: info.endpoint || normalizedUrl,
                title: info.title || normalizedUrl,
                selectedLayerId: rsvcSelected,
                layerLabel:
                    info.layerOptions?.find((option) => option.name === rsvcSelected)?.title || '',
                sublayers: (info.layerOptions || [])
                    .filter((option) => option.name && !option.name.includes(','))
                    .map((option) => ({ name: option.name, title: option.title, label: option.label })),
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
            // URL 变化由共享 ref watcher 统一重载；重复提交同一 URL 时才主动强制刷新。
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
        // 注销 3D 侧代理构造器：能力文档拉取回落常驻 OL 构造器（含 TILE_PROXY_MODE 门控）
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
        /** 在线服务定位：委托 cesiumRemoteAdapter.flyTo（未挂载返回 false） */
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
        // 熔断/降级切换器
        basemapSwitcher,
        basemapCircuitOpen,
        resetCircuitBreaker: basemapSwitcher.resetCircuitBreaker,
    };
}