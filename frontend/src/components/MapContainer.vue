<template>
    <div id="map-container" class="map-container"
        :class="{ 'compass-placement-mode': compassStore.enabled && compassStore.mode === 'vector' && compassStore.placementMode }"
        ref="mapContainerRef">
        <div id="map" ref="mapRef"></div>

        <!-- <MapEasterEgg :map-instance="mapInstance" :bounds="DIHUAN_BOUNDS" :images="IMAGES" over -->
            @open-large-image="handleEasterEggImageOpen" @location-change="handleEasterEggLocationChange" />

        <LayerControlPanel :map-instance="mapInstance" :layer-list="layerList" :selected-layer="selectedLayer"
            :custom-map-url="customMapUrl" :active-graticule="showDynamicSplitLines"
            :basemap-circuit-open="basemapCircuitOpen" :tianditu-tk="TIANDITU_TK" :is-domestic="isDomestic"
            @change-layer="handleLayerChange" @update-order="handleLayerOrderUpdate"
            @toggle-graticule="handleToggleGraticule" @search-jump="handleSearchJump"
            @reset-basemap-chain="handleResetBasemapChain" @layer-context-action="handleLayerContextAction" />

        <AttributeTable @focus-feature="handleAttributeTableFocusFeature"
            @highlight-feature="handleAttributeTableHighlightFeature" />

        <div v-if="compassStore.hudVisible" class="compass-hud-wrapper" :style="{ opacity: compassStore.opacity }">
            <FengShuiCompassSvg :config="compassStore.hudRenderConfig" />
        </div>

        <!-- 风水宫位解释面板 -->
        <PalaceExplanationPanel 
            :selected-palace="selectedPalace" 
            :theme-config="compassStore.config"
            @close="handleCloseExplanation" />

        <!-- 底部控制栏 -->
        <MapControlsBar :coordinate="currentCoordinate" :current-zoom="currentZoom" @reset-view="resetView"
            @locate-me="zoomToUser" @jump-to="handleJumpToCoordinates" />
    </div>
</template>

<script setup>
/* 
   本文件将作为中转是函数执行层
   具体实现逻辑分散解耦到多个 Composable 中
   保持组件代码清晰，职责单一。

   只保留相关函数的调用
   当前逻辑层代码量过大
   具体实现禁止放到该组件内
   便于进行项目的维护和升级
   避免臃肿和职责混乱 
*/
import { computed, ref, onMounted, onUnmounted, shallowRef } from 'vue';
import { useManagedLayerRegistry } from '../composables/useManagedLayerRegistry';
import { useUserLocation } from '../composables/useUserLocation';
import { useMessage } from '../composables/useMessage';
import { useMapState } from '../composables/useMapState';
import { loadMapRuntimeDeps } from '../utils/gis/mapRuntimeDeps';
import {
    createBasemapLayerBootstrap,
    createBasemapResilience,
    createBasemapSelectionWatcher,
    createBasemapStateManagementFeature,
    createBasemapUrlMappingFeature,
    createCoordinateSystemConversionFeature,
    useCreateManagedVectorLayer,
    createDeferredUserLayerApis,
    createDrawMeasureFeature,
    useLayerContextMenuActions,
    createLayerControlHandlers,
    createLayerMetadataNormalizationFeature,
    createManagedFeatureHighlightFeature,
    createManagedFeatureOperationsFeature,
    createManagedFeatureSerializationFeature,
    createManagedLayerStyleFeature,
    createMapEventHandlers,
    createMapSearchAndCoordinateInputFeature,
    createMapUIEventHandlers,
    createRightDragZoomController,
    createRouteRenderingFeature,
    createRouteStepInteraction,
    createRouteStepStyles,
    createStartupTaskSchedulerFeature,
    createUserLayerApiFacadeFeature
} from '../composables/map';
import {
    DEFAULT_BASEMAP_PRESET_ID,
    URL_LAYER_OPTIONS,
    activeGoogleTileHost as globalActiveGoogleTileHost,
    resolvePreferredGoogleHost,
    createLayerConfigs,
    resolvePresetLayerIds,
    getBasemapOptionLabel,
    getLayerCategory as getLayerCategoryById,
    getLayerGroup as getLayerGroupById,
    STYLE_TEMPLATES,
    SEARCH_RESULT_STYLE,
    SEARCH_AOI_STYLE,
    AMAP_EXTRACT_AOI_STYLE,
    createMapStylesObject
} from '../constants';
import { createAutoTileSourceFromUrl } from '../composables/useTileSourceFactory';
import LayerControlPanel from './LayerControlPanel.vue';
// import MapEasterEgg from './MapEasterEgg.vue';
import MapControlsBar from './MapControlsBar.vue';
import AttributeTable from './AttributeTable.vue';
import FengShuiCompassSvg from './feng-shui-compass-svg/feng-shui-compass-svg.vue';
import PalaceExplanationPanel from './PalaceExplanationPanel.vue';
import { apiReverseGeocodeWithFallback } from '../api';
import { useAttrStore, useUrlParamStore, useCompassStore, useTOCStore } from '../stores';
import { CompassManager } from '../services/CompassManager';
import { DistrictManager } from '../services/DistrictManager';

const message = useMessage();
const attrStore = useAttrStore();
const urlParamStore = useUrlParamStore();
const compassStore = useCompassStore();
const tocStore = useTOCStore();


const store = useCompassStore();
const selectedPalace = computed(() => store.selectedPalace);

// 关闭宫位解释面板
const handleCloseExplanation = () => {
  store.setSelectedPalace(null);
};

// ========== 底图管理 Composable ==========
// 集中管理底图配置、底图选项列表、Google 主机选择等逻辑
// URL_LAYER_OPTIONS：用于 URL 参数中的图层索引映射（与 BASEMAP_OPTIONS 对应）
// createLayerConfigs：工厂函数，根据参数生成全部底图源配置
// 使用全局共享的 Google 主机 ref，支持主机切换后的动态更新
const activeGoogleTileHost = globalActiveGoogleTileHost;

// OpenLayers 运行时依赖按需动态加载，避免进入登录页首屏预加载图。
const {
    Map,
    View,
    fromLonLat,
    toLonLat,
    defaultControls,
    ScaleLine,
    OverviewMap,
    createEmpty,
    extendExtent,
    isExtentEmpty,
    TileLayer,
    VectorLayer,
    XYZ,
    VectorSource
} = await loadMapRuntimeDeps();

import { gcj02ToWgs84, wgs84ToGcj02 } from '../utils/geo';
import {
    createLayerExporter,
    isVectorManagedLayer
} from '../utils/layerExportService';

// --- 配置常量 ---
const BASE_URL = import.meta.env.BASE_URL || '/';
const NORM_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const INITIAL_VIEW = { center: [114.302, 34.8146], zoom: 17 }; //初始位置
const CRITICAL_TILE_READY_TIMEOUT_MS = 3000; // 首屏关键瓦片加载超时时间（毫秒）

// 天地图 Token：优先使用环境变量，否则使用默认值
// 生产环境建议在 .env 文件中配置 VITE_TIANDITU_TK
const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK;

//彩蛋：判断鼠标是否进入地环院，弹出地环院的图片信息
// const DIHUAN_BOUNDS = { minLon: 114.3020, maxLon: 114.3030, minLat: 34.8149, maxLat: 34.8154 };
// const IMAGES = [
//     '地理与环境学院标志牌.webp', '地理与环境学院入口.webp', '地学楼.webp',
//     '教育部重点实验室.webp', '四楼逃生图.webp', '学院楼单侧.webp'
// ].map(img => `${NORM_BASE}images/${img}`);

// --- Refs ---
const mapContainerRef = ref(null);
const mapRef = ref(null);
const mapInstance = shallowRef(null); // 使用 shallowRef 优化性能

// ========== 默认底图配置 ==========
// 当前选中的底图 ID 统一由 DEFAULT_BASEMAP_PRESET_ID 控制。
// 与 useMapState 中的 parseUrlToState 默认值保持一致
const selectedLayer = ref(DEFAULT_BASEMAP_PRESET_ID);
const customMapUrl = ref('');
const showDynamicSplitLines = ref(false);
const basemapCircuitOpen = ref(false);
const currentZoom = ref(17); // 当前缩放级别
const currentCoordinate = ref(null);

const isDomestic = ref(true); // 是否为国内用户（基于 IP 判断）
let fitToLonLatExtentByMapState = () => false;

function normalizeBinaryFlag(value, fallback = '0') {
    const compact = String(value ?? '').trim().toLowerCase();
    if (compact === '1' || compact === 'true') return '1';
    if (compact === '0' || compact === 'false') return '0';
    return fallback === '1' ? '1' : '0';
}

function parseSharedEntryFlagFromUrl() {
    if (typeof window === 'undefined') return false;

    const hash = String(window.location.hash || '');
    const queryStart = hash.indexOf('?');
    const hashParams = queryStart >= 0
        ? new URLSearchParams(hash.slice(queryStart + 1))
        : new URLSearchParams();

    const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));
    const shareFlagRaw = hashParams.get('s') ?? searchParams.get('s');
    if (shareFlagRaw !== null && String(shareFlagRaw).trim() !== '') {
        return normalizeBinaryFlag(shareFlagRaw, '0') === '1';
    }

    // 兼容旧版分享链接。
    const legacyMarker = String(
        hashParams.get('from')
        || hashParams.get('shared')
        || searchParams.get('from')
        || searchParams.get('shared')
        || ''
    ).trim().toLowerCase();

    return legacyMarker === 'share' || legacyMarker === 'shared' || legacyMarker === '1' || legacyMarker === 'true';
}

// 启动问候地址解析：高德优先，天地图兜底。
async function resolveSharedAddressByLonLat(lng, lat) {
    const lon = Number(lng);
    const latitude = Number(lat);
    if (!Number.isFinite(lon) || !Number.isFinite(latitude)) return '';

    try {
        const geocodeResponse = await apiReverseGeocodeWithFallback(lon, latitude, {
            tiandituTk: TIANDITU_TK,
            tiandituTimeout: 3500,
            silent: true
        });
        const geocodeResult = geocodeResponse?.data || null;
        return String(geocodeResult?.formattedAddress || '').trim();
    } catch {
        // 逆地理编码失败不阻断启动流程，回退到通用欢迎语。
        return '';
    }
}

let searchSource, searchLayer;

// ========== 图层配置初始化 ==========
// 使用 composable 提供的工厂函数而不是直接定义 LAYER_CONFIGS
const LAYER_CONFIGS = createLayerConfigs(NORM_BASE, TIANDITU_TK);

// 初始化图层列表状态 (从配置生成)
const layerList = ref(LAYER_CONFIGS.map(cfg => ({
    id: cfg.id,
    name: cfg.name,
    visible: cfg.visible,
    opacity: 1 // 初始透明度为 100%
})));
const layerInstances = {}; // 存储所有 TileLayer 实例

const { handleLayerContextAction } = useLayerContextMenuActions({
    layerInstances,
    getLayerConfigs: () => LAYER_CONFIGS,
    customMapUrlRef: customMapUrl,
    message
});

const {
    validateBaseLayerSwitch,
    createBaseLayerFallbackManager,
    monitorLayerTimeout
} = createBasemapResilience({ message });

const {
    initializeBasemapLayers
} = createBasemapLayerBootstrap({
    layerListRef: layerList,
    layerConfigs: LAYER_CONFIGS,
    layerInstances,
    monitorLayerTimeout,
    selectedLayerRef: selectedLayer,
    message,
    defaultLayerId: DEFAULT_BASEMAP_PRESET_ID
});

// --- 全局变量 (非响应式) ---
const componentUnmountedRef = ref(false);
const pendingBusPickRef = ref(null);
const pendingReverseGeocodePickRef = ref(null);
let busRouteLayerRef = null;
const busRouteManagedLayerIdRef = ref(null);
let rightDragZoomController = null;
let compassManagerRef = null;
let districtManagerRef = null;

// 图层引用
let baseLayer, labelLayer;
const drawSource = new VectorSource();
const userLocationSource = new VectorSource();
const busPickSource = new VectorSource();
const busRouteSource = new VectorSource();

// 子组件向父组件回传事件接口定义
const emit = defineEmits([
    'location-change',
    'map-click',
    'search-poi-selected',
    'coordinate-jump',
    'update-news-image',
    'feature-selected',
    'user-layers-change',
    'graphics-overview',
    'base-layers-change',
    'upload-progress-change',
    'map-core-ready',
    'map-core-failed'
]);

const {
    detectIPLocale,
    getCurrentLocation,
    zoomToUser
} = useUserLocation({
    mapInstance,
    userLocationSource,
    isDomestic,
    fitToLonLatExtent: (...args) => fitToLonLatExtentByMapState(...args)
});

// 注：handleEasterEggImageOpen, handleEasterEggLocationChange, 等函数现在由 createMapUIEventHandlers 提供
// 此处保留注释以说明这些函数的来源

const isAttributeQueryEnabled = ref(true);
const userDataLayers = [];
let drawLayerInstance = null;
let tooltipRef = {
    helpTooltipEl: null,
    helpTooltipOverlay: null
};

const {
    createManagedLayerId,
    emitUserLayersChange,
    emitGraphicsOverview,
    refreshUserLayerZIndex,
    addManagedLayerRecord
} = useManagedLayerRegistry({
    emit,
    userDataLayers,
    drawSource,
    styleTemplates: STYLE_TEMPLATES
});

const drawStyleConfig = ref({ ...STYLE_TEMPLATES.classic });

// 托管图层样式系统已下沉到 feature 库，MapContainer 仅负责注入与调用。
const {
    normalizeStyleConfig,
    createStyleFromConfig,
    mergeStyleConfig,
    buildManagedLayerStyle,
    applyManagedLayerStyle
} = createManagedLayerStyleFeature({
    styleTemplates: STYLE_TEMPLATES
});

const {
    getBusStepStyle,
    getBusStepPointStyle,
    getDriveStepStyle,
    clearRouteStepStyleCache
} = createRouteStepStyles();

const {
    getCurrentBusStepIndex,
    getCurrentDriveStepIndex,
    resetRouteStepStates,
    zoomToDriveRouteStep,
    zoomToBusRouteStep,
    previewBusRouteStep,
    clearBusRouteStepPreview,
    previewDriveRouteStep,
    clearDriveRouteStepPreview
} = createRouteStepInteraction({
    mapInstanceRef: mapInstance,
    routeSource: busRouteSource,
    getRouteLayer: () => busRouteLayerRef,
    ensureRouteBuilderApi
});

const {
    ensureFeatureId,
    serializeManagedFeature,
    serializeManagedFeatures
} = createManagedFeatureSerializationFeature();

// 图层元数据规范化（必须在使用前定义）
const {
    getFeatureRepresentativeLonLat,
    inferLayerRepresentativeLonLat,
    normalizeLayerMetadata
} = createLayerMetadataNormalizationFeature();

const {
    scheduleLowPriorityTask,
    waitForCriticalTileReady
} = createStartupTaskSchedulerFeature({
    componentUnmountedRef,
    criticalTileReadyTimeoutMs: CRITICAL_TILE_READY_TIMEOUT_MS,
    mapInstanceRef: mapInstance
});

const {
    getLayerIdByIndex,
    getLayerIndexById,
    getLayerCategory,
    getLayerGroup
} = createBasemapUrlMappingFeature({
    urlLayerOptions: URL_LAYER_OPTIONS,
    getLayerCategoryById,
    getLayerGroupById
});

const {
    applyCrsConversionToFeature,
    toggleLayerCRS,
    toggleSearchLayerCRS
} = createCoordinateSystemConversionFeature({
    userDataLayers,
    message,
    wgs84ToGcj02,
    gcj02ToWgs84,
    isVectorManagedLayer,
    serializeManagedFeatures,
    normalizeLayerMetadata,
    getFeatureRepresentativeLonLat,
    emitUserLayersChange
});

// [Phase 19] 初始化托管图层创建器（必须在 createMapSearchAndCoordinateInputFeature 之前）
const { createManagedVectorLayer } = useCreateManagedVectorLayer({
    mapInstanceRef: mapInstance,
    userDataLayers,
    styleHelpers: {
        normalizeStyleConfig,
        buildManagedLayerStyle
    },
    featureHelpers: {
        serializeManagedFeatures,
        ensureFeatureId
    },
    metadataHelpers: {
        normalizeLayerMetadata
    },
    registryHelpers: {
        createManagedLayerId,
        emitUserLayersChange,
        emitGraphicsOverview,
        refreshUserLayerZIndex
    },
    styleTemplates: STYLE_TEMPLATES
});

const {
    handleSearchJump,
    drawPointByCoordinatesInput,
    drawAmapAoiByDetailJsonInput
} = createMapSearchAndCoordinateInputFeature({
    message,
    mapInstanceRef: mapInstance,
    createManagedVectorLayer,
    gcj02ToWgs84,
    searchResultStyle: SEARCH_RESULT_STYLE,
    searchAoiStyle: SEARCH_AOI_STYLE,
    amapExtractAoiStyle: AMAP_EXTRACT_AOI_STYLE,
    userDataLayers,
    ensureFeatureId,
    serializeManagedFeatures,
    emitUserLayersChange,
    emitGraphicsOverview,
    onSearchPoiResolved: (payload) => emit('search-poi-selected', payload)
});

const {
    createManagedFeatureHighlightStyle,
    clearManagedFeatureHighlight,
    highlightManagedFeature,
    getCurrentHighlightedFeature,
    setCurrentHighlightedFeature
} = createManagedFeatureHighlightFeature({
    findManagedFeature: (layerId, featureId) => {
        // 从 userDataLayers 中查找对应的图层
        const layerRecord = userDataLayers.find(item => item.id === layerId);
        if (!layerRecord || !layerRecord.layer || !layerRecord.layer.getSource) return null;
        const source = layerRecord.layer.getSource();
        return source.getFeatureById(featureId);
    }
});

// 托管要素操作
const {
    findManagedFeature,
    zoomToManagedFeature
} = createManagedFeatureOperationsFeature({
    mapInstanceRef: mapInstance,
    userDataLayers,
    getCurrentHighlightedFeature,
    setCurrentHighlightedFeature,
    clearManagedFeatureHighlight,
    createManagedFeatureHighlightStyle
});

// 绘图与测量交互
let drawGraphicSeedRef = { value: 1 };
const {
    activateInteraction: activateDrawMeasure,
    clearInteractions: clearDrawMeasureInteractions,
    clearAllGraphics,
    getDrawInteraction,
    getSketchFeature
} = createDrawMeasureFeature({
    mapInstanceRef: mapInstance,
    drawSource,
    createStyleFromConfig,
    createManagedVectorLayer,
    emitGraphicsOverview,
    refreshUserLayerZIndex,
    emitUserLayersChange,
    drawStyleConfig,
    drawGraphicSeedRef,
    userDataLayers,
    tooltipRef
});

// 路线绘制交互
const {
    drawRouteOnMap,
    drawDriveRouteOnMap,
    syncRouteManagedLayer
} = createRouteRenderingFeature({
    mapInstanceRef: mapInstance,
    busRouteLayerRef,
    busRouteSource,
    resetRouteStepStates,
    ensureRouteBuilderApi,
    userDataLayers,
    addManagedLayerRecord,
    busRouteManagedLayerIdRef,
    emitUserLayersChange,
    emitGraphicsOverview
});

// 底图状态管理
const {
    emitBaseLayersChange,
    emitBaseLayersChangeBatched,
    refreshGoogleLayerSources
} = createBasemapStateManagementFeature({
    layerList,
    selectedLayer,
    getLayerCategory: getLayerCategoryById,
    getLayerGroup: getLayerGroupById,
    emit,
    LAYER_CONFIGS,
    layerInstances
});

// 图层控制面板事件（切换/排序/自定义 URL）
const {
    loadCustomMap,
    handleLayerChange,
    handleLayerOrderUpdate
} = createLayerControlHandlers({
    selectedLayerRef: selectedLayer,
    customMapUrlRef: customMapUrl,
    layerListRef: layerList,
    layerInstances,
    refreshLayersState,
    createAutoTileSourceFromUrl,
    message
});

// 栅格值查询函数的 ref 包装（用于延迟初始化）
const queryRasterValueAtCoordinateRef = ref(null);

// 属性表范围同步函数桥接（用于解决 setup 初始化顺序依赖）
let syncAttributeTableMapExtentImpl = () => { };

function syncAttributeTableMapExtent() {
    syncAttributeTableMapExtentImpl?.();
}

// 地图事件处理
const {
    bindMapEvents
} = createMapEventHandlers({
    mapInstanceRef: mapInstance,
    currentCoordinateRef: currentCoordinate,
    currentZoomRef: currentZoom,
    emit,
    getDrawInteraction,
    getSketchFeature,
    queryRasterValueAtCoordinateRef,
    rightDragZoomControllerRef: { value: rightDragZoomController },
    isAttributeQueryEnabledRef: isAttributeQueryEnabled,
    tooltipRef,
    syncAttributeTableMapExtent,
    pendingBusPickRef,
    pendingReverseGeocodePickRef,
    busPickSource
});

// UI 事件处理器（简单转发 + 属性表同步）
const {
    handleEasterEggImageOpen,
    handleEasterEggLocationChange,
    syncAttributeTableMapExtent: syncAttributeTableMapExtentFromUI,
    handleAttributeTableFocusFeature,
    handleAttributeTableHighlightFeature,
    handleToggleGraticule,
    updateViewByParams,
    handleJumpToCoordinates,
    resetView
} = createMapUIEventHandlers({
    mapInstanceRef: mapInstance,
    attrStoreRef: attrStore,
    emit,
    highlightManagedFeature,
    zoomToManagedFeature,
    toggleGraticule: (...args) => toggleGraticule(...args),
    showDynamicSplitLinesRef: showDynamicSplitLines,
    selectedLayerRef: selectedLayer,
    INITIAL_VIEW,
    flyToView: (...args) => flyToView(...args),
    getLayerIndexById
});

syncAttributeTableMapExtentImpl = syncAttributeTableMapExtentFromUI;

// --- 样式定义 ---
const styles = createMapStylesObject();

// [隶属] 底图状态管理
// [作用] 提供与 URL 同步、图层切换、图层实例管理等相关的核心逻辑。
// 通过 useMapState Composable 集中管理地图状态相关逻辑，保持组件代码整洁。
const {
    parseUrlToState,
    flyToView,
    locateAddress,
    fitToLonLatExtent,
    syncUrlFromMap,
    bindMapViewSync,
    stopMapViewSync,
    refreshLayerInstances,
    switchLayerById,
    setGraticuleActive,
    toggleGraticule,
    stopGraticule
} = useMapState(mapInstance, {
    defaultZoom: INITIAL_VIEW.zoom,
    layerListRef: layerList,
    layerInstances,
    layerConfigs: LAYER_CONFIGS,
    resolveVisibleLayerIds: (layerId) => resolvePresetLayerIds(layerId),
    getLayerIndex: () => getLayerIndexById(selectedLayer.value),
    onLayerIndexChange: (layerIndex) => {
        const layerId = getLayerIdByIndex(layerIndex);
        if (!layerId || selectedLayer.value === layerId) return;
        selectedLayer.value = layerId;
    }
});

fitToLonLatExtentByMapState = (...args) => fitToLonLatExtent(...args);

const {
    bindBasemapSelectionWatcher,
    resetBasemapChain
} = createBasemapSelectionWatcher({
    selectedLayerRef: selectedLayer,
    switchLayerById,
    resolvePresetLayerIds,
    emitBaseLayersChange: emitBaseLayersChangeBatched,
    mapInstanceRef: mapInstance,
    layerInstances,
    syncUrlFromMap,
    validateBaseLayerSwitch,
    createBaseLayerFallbackManager,
    getBasemapOptionLabel,
    message,
    defaultLayerId: DEFAULT_BASEMAP_PRESET_ID,
    validationTimeoutMs: 3000,
    switchDebounceMs: 300,
    circuitBreakThreshold: 3,
    onCircuitBreak: () => {
        basemapCircuitOpen.value = true;
    },
    onCircuitReset: () => {
        basemapCircuitOpen.value = false;
    }
});

function handleResetBasemapChain() {
    resetBasemapChain?.({ targetLayerId: selectedLayer.value });
}

// --- URL 参数初始化 ---
const initialUrlState = parseUrlToState();
const initialLayerId = getLayerIdByIndex(initialUrlState?.layerIndex);
if (initialLayerId) {
    selectedLayer.value = initialLayerId;
}

// ========== URL 参数延迟应用 ==========
// [隶属] 地图初始化-延迟参数应用
// [作用] 在地图 GIS 核心初始化完成后，应用之前在路由阶段提取的 URL 参数
//       这确保了分享链接中的坐标、缩放级别、图层选择能够被正确应用
// [流程] 
//   1. 在路由守卫中提取参数到 urlParamStore
//   2. MapContainer 挂载并初始化 GIS 引擎
//   3. GIS 初始化完成后调用此函数应用参数
//   4. 标记为已应用，防止重复应用
function applyDeferredUrlParams() {
    if (!mapInstance?.value) {
        console.warn('[MapContainer] Cannot apply deferred params: mapInstance not ready');
        return;
    }

    const validParams = urlParamStore.getValidCoordinateParams();
    if (!validParams) {
        // 没有有效的地理坐标参数，直接标记已应用
        urlParamStore.markParamsAsApplied();
        return;
    }

    try {
        console.info('[MapContainer] Applying deferred URL params:', validParams);

        // 应用坐标、缩放、图层索引
        flyToView({
            lng: validParams.lng,
            lat: validParams.lat,
            z: validParams.z,
            l: validParams.l,
            duration: 500 // 应用参数时的动画持续时间
        });

        // 标记为已应用
        urlParamStore.markParamsAsApplied();
        console.info('[MapContainer] Deferred URL params applied successfully');
    } catch (error) {
        console.error('[MapContainer] Failed to apply deferred URL params:', error);
        urlParamStore.markParamsAsApplied(); // 即使失败也标记已应用，防止重复尝试
    }
}

// [隶属] 地图初始化-视图状态
// [作用] 根据 URL 参数或默认值设置初始视图状态，支持直接
// 定位到分享链接中的地点。
function getInitialViewState() {
    const routeState = parseUrlToState();
    if (
        Number.isFinite(routeState?.lng)
        && Number.isFinite(routeState?.lat)
    ) {
        return {
            center: [routeState.lng, routeState.lat],
            zoom: Number.isFinite(routeState.zoom) ? routeState.zoom : INITIAL_VIEW.zoom
        };
    }
    return INITIAL_VIEW;
}

// --- 组件挂载后 ---
// [隶属] 地图初始化-启动流程
// [作用] 初始化地图、绑定视图同步、设置格网状态、同步 URL 状态，并在首屏关键瓦片加载后执行非关键任务（主机测速、位置相关逻辑）。
onMounted(async () => {
    componentUnmountedRef.value = false;
    try {
        initMap();
        bindMapViewSync();
        setGraticuleActive(showDynamicSplitLines.value);
        syncUrlFromMap();

        // 首屏优先：先让关键瓦片尽快加载，非关键任务延后到首次渲染后再执行。
        try {
            await waitForCriticalTileReady();
        } catch {
            // 超时或异常时也继续后续流程，避免阻塞页面可交互性。
        }

        // 通知父组件：主地图关键内容已就绪，可在空闲时预加载非关键资源。
        if (!componentUnmountedRef.value) {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => {
                    if (!componentUnmountedRef.value) {
                        emit('map-core-ready');
                    }
                });
            } else {
                emit('map-core-ready');
            }
        }

        // ========== Step 2: Apply Deferred URL Parameters ==========
        // [优先级] 地图核心就绪后，应用之前在路由守卫中提取的 URL 参数
        // [目的] 确保地图引擎已准备好，然后应用坐标、缩放、图层等参数
        // [注意] 仅在首次进入 home 路由时应用，后续参数变化由 URL 同步处理
        if (!componentUnmountedRef.value && !urlParamStore.isParamApplied) {
            applyDeferredUrlParams();
        }

        scheduleLowPriorityTask(() => {
            runDeferredStartupTasks().catch(() => { });
        });
    } catch (error) {
        const detail = String(error?.message || error || '地图核心初始化异常').trim();
        message.error(`地图核心初始化失败：${detail}`);
        if (!componentUnmountedRef.value) {
            emit('map-core-failed', { message: detail });
        }
    }
});

// [隶属] 启动流程-首屏优化
// [作用] 在首屏完成后执行非关键任务（主机测速、定位兜底）。
// [交互] 调用 resolvePreferredGoogleHost / zoomToUser / detectIPLocale。
async function runDeferredStartupTasks() {
    if (componentUnmountedRef.value) return;


    const routeViewState = parseUrlToState();


    const isSharedEntry = parseSharedEntryFlagFromUrl();

    if (isSharedEntry) {
        const shareAddress = await resolveSharedAddressByLonLat(routeViewState?.lng, routeViewState?.lat);
        message.success(`分享地点：${shareAddress || '地址解析失败，请稍后重试'}`, { duration: 3000 });
        message.soup();//鸡汤问候
    } else {
        message.success('欢迎使用NEGIAO的WebGIS!(V3.0.5)', { duration: 3000 });
    }

    // 1) Google 主机测速切换（非关键，延后执行）。
    resolvePreferredGoogleHost().then((host) => {
        if (componentUnmountedRef.value) return;
        if (!host || host === activeGoogleTileHost.value) return;
        activeGoogleTileHost.value = host;
        refreshGoogleLayerSources();
    }).catch(() => { });

    // 2) 首屏定位：分享进入时静默定位且不跳转视图，仅用于更新定位上下文与 URL 参数。
    const locatedResult = isSharedEntry
        ? await zoomToUser({ animate: false, silent: true })
        : await zoomToUser();
    if (componentUnmountedRef.value) return;

    // 若主动定位完全失败，则仅补一次国内外判定，避免状态缺失。
    if (!locatedResult) {
        if (isSharedEntry) {
            await detectIPLocale({ silent: true });
        } else {
            await detectIPLocale();
        }
    }
}


// [隶属] 组件卸载-资源清理
// [作用] 组件卸载时清理地图实例、事件监听、异步
// 任务等，避免内存泄漏和潜在错误。
onUnmounted(() => {
    componentUnmountedRef.value = true;
    stopMapViewSync();
    stopGraticule();
    districtManagerRef?.dispose?.();
    districtManagerRef = null;
    compassManagerRef?.dispose?.();
    compassManagerRef = null;
    rightDragZoomController?.dispose?.();
    clearRouteStepStyleCache?.();
    rightDragZoomController = null;
    attrStore.setMapExtent(null);
    if (pendingBusPickRef.value?.reject) {
        pendingBusPickRef.value.reject(new Error('地图已卸载'));
        pendingBusPickRef.value = null;
    }
    if (pendingReverseGeocodePickRef.value?.reject) {
        pendingReverseGeocodePickRef.value.reject(new Error('地图已卸载'));
        pendingReverseGeocodePickRef.value = null;
    }
    if (mapInstance.value) mapInstance.value.setTarget(null);
});

// [隶属] 外部数据导入-动作集接入
// [作用] 从 useLayerDataImport 注入上传入口与解析动作。
// [交互] addUserDataLayer 由 defineExpose 对外提供给父组件调用。
let routeBuilderApiPromise = null;

const {
    ensureLayerDataImportApi,
    ensureUserLayerActionsApi,
    setBaseLayerActive,
    setLayerVisibility,
    zoomToUserLayer,
    viewUserLayer
} = createDeferredUserLayerApis({
    mapInstanceRef: mapInstance,
    initialView: INITIAL_VIEW,
    userDataLayers,
    addManagedLayerRecord,
    createManagedVectorLayer,
    styleTemplates: STYLE_TEMPLATES,
    onImportProgress: (payload) => emit('upload-progress-change', payload),
    refreshUserLayerZIndex,
    emitUserLayersChange,
    emitGraphicsOverview,
    mergeStyleConfig,
    applyManagedLayerStyle,
    setDrawStyle,
    layerListRef: layerList,
    selectedLayerRef: selectedLayer,
    getLayerCategory,
    refreshLayersState,
    emitFeatureSelected: (payload) => emit('feature-selected', payload),
    isRouteManagedLayer: ({ layerId, removed }) => (
        layerId === busRouteManagedLayerIdRef.value
        || removed?.metadata?.category === 'bus-route'
        || removed?.metadata?.category === 'drive-route'
        || removed?.metadata?.category === 'route'
    ),
    onRouteManagedLayerRemoved: () => {
        busRouteManagedLayerIdRef.value = null;
        resetRouteStepStates();
        busRouteSource.clear();
    }
});
// 确保 transitRouteBuilder API 已加载并可用，支持动态导入和按需加载。
async function ensureRouteBuilderApi() {
    if (!routeBuilderApiPromise) {
        routeBuilderApiPromise = import('../utils/transitRouteBuilder');
    }
    return routeBuilderApiPromise;
}

// 用户图层 API 委托门面
const {
    addUserDataLayer,
    queryRasterValueAtCoordinate,
    setUserLayerVisibility,
    setUserLayerOpacity,
    removeUserLayer,
    reorderUserLayers,
    soloUserLayer,
    setUserLayerStyle,
    setUserLayerLabelVisibility,
    applyStyleTemplate
} = createUserLayerApiFacadeFeature({
    ensureLayerDataImportApi,
    ensureUserLayerActionsApi
});

// 更新栅格值查询函数 ref（解决初始化顺序问题）
queryRasterValueAtCoordinateRef.value = queryRasterValueAtCoordinate;

// --- 1. 地图核心逻辑 ---
// [隶属] 图层切换-地图初始化
// [作用] 初始化地图实例、底图层、业务图层与控件。
// [交互] 触发 bindEvents，并在 watch(selectedLayer) 中联动底图切换。
function initMap() {
    // 1.1 源定义与图层初始化 (由 LAYER_CONFIGS 动态驱动，不再硬编码 sources 对象)
    const layersToAdd = initializeBasemapLayers();

    drawLayerInstance = new VectorLayer({
        source: drawSource,
        style: createStyleFromConfig(drawStyleConfig.value),
        zIndex: 999
    });
    const userLayer = new VectorLayer({
        source: userLocationSource,
        zIndex: 1000,
        style: (feature) => feature.get('type') === 'accuracy' ? styles.userAccuracy : styles.userPoint
    });
    const busPickLayer = new VectorLayer({
        source: busPickSource,
        zIndex: 1085,
        style: (feature) => feature.get('busPickType') === 'end' ? styles.busEnd : styles.busStart
    });
    const busRouteLayer = new VectorLayer({
        source: busRouteSource,
        zIndex: 1080,
        style: (feature) => {
            if (feature.get('routeMode') === 'drive') {
                const stepIndex = Number(feature.get('stepIndex'));
                const isStepSegment = Number.isFinite(stepIndex) && stepIndex >= 0;
                const activeDriveStep = getCurrentDriveStepIndex();
                const isActive = activeDriveStep >= 0 && stepIndex === activeDriveStep;
                return getDriveStepStyle(stepIndex, isActive, isStepSegment);
            }
            if (feature.getGeometry()?.getType?.() === 'Point') {
                const stepIndex = Number(feature.get('stepIndex') ?? 0);
                const stepIndices = feature.get('stepIndices');
                const markerRole = String(feature.get('markerRole') || 'segment-start');
                const stationName = String(feature.get('stationName') || '');
                const activeBusStep = getCurrentBusStepIndex();
                const isActive = activeBusStep >= 0 && (
                    Array.isArray(stepIndices)
                        ? stepIndices.map((v) => Number(v)).includes(activeBusStep)
                        : activeBusStep === stepIndex
                );
                return getBusStepPointStyle(stepIndex, markerRole, isActive, stationName);
            }
            const segmentType = Number(feature.get('segmentType') ?? 0);
            const stepIndex = Number(feature.get('stepIndex') ?? 0);
            const activeBusStep = getCurrentBusStepIndex();
            const isActive = activeBusStep >= 0 && activeBusStep === stepIndex;
            return getBusStepStyle(stepIndex, segmentType === 1, isActive);
        }
    });
    busRouteLayerRef = busRouteLayer;

    // 搜索结果图层（点）
    searchSource = new VectorSource();
    searchLayer = new VectorLayer({
        source: searchSource,
        zIndex: 1100,
        style: createStyleFromConfig(SEARCH_RESULT_STYLE)
    });

    // 1.3 控件
    // 从 LAYER_CONFIGS 中获取 Google 配置，使鹰眼视图与坐标系保持一致
    const controls = defaultControls({ zoom: false }).extend([
        // new ScaleLine({ 
        //     units: 'metric',
        //     bar: true, 
        //     minWidth: 100 ,
        //     // className: 'ol-scaleline'//绑定类名，控制css
        // }),

        // 鹰眼视图控件 - 使用 默认底图动态引用，保持 URL 一致
        //bug：待修复,临时使用
        new OverviewMap({
            className: 'ol-overviewmap ol-custom-overviewmap',
            //原始逻辑，直接使用Google，但是不稳定，容易崩
            //切换为稳定的天地图
            // layers: [
            //     new TileLayer({
            //         source: googleConfig ? googleConfig.createSource() : new XYZ({
            //             url: buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}'),
            //             maxZoom: 20
            //         })
            // })
            // ],
            layers: [
                new TileLayer({
                    source: new XYZ({
                        url: 'https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb',
                        maxZoom: 20
                    })
                })
            ],
            collapseLabel: '«',
            label: '»',
            collapsed: false
        })
    ]);

    // 1.4 实例化地图
    const initialViewState = getInitialViewState();
    mapInstance.value = new Map({
        target: mapRef.value,
        layers: [...layersToAdd, drawLayerInstance, userLayer, busRouteLayer, busPickLayer, searchLayer],
        view: new View({
            center: fromLonLat(initialViewState.center),
            zoom: initialViewState.zoom,
            minZoom: 0,  // 允许缩放到最低级别
            maxZoom: 22
        }),
        controls
    });
    // 创建比例尺
    const scaleline = new ScaleLine({
        units: 'metric',
        bar: true,
        minWidth: 100,
        // className: 'my-custom-scale'
    });
    mapInstance.value.addControl(scaleline);

    currentZoom.value = Number(mapInstance.value.getView()?.getZoom?.() ?? initialViewState.zoom);

    compassManagerRef?.dispose?.();
    compassManagerRef = new CompassManager({
        map: mapInstance.value,
        store: compassStore,
        mapContainerElement: mapContainerRef.value
    });
    void compassManagerRef.init();

    // 1.4.5 初始化坐标显示 - 从视图中心获取坐标，处理移动端初始化
    const initialCenter = mapInstance.value.getView().getCenter();
    const initialLonLat = toLonLat(initialCenter);
    currentCoordinate.value = { lng: initialLonLat[0], lat: initialLonLat[1] };

    // 1.5 初始化右拖缩放控制器
    rightDragZoomController?.dispose?.();
    rightDragZoomController = createRightDragZoomController(mapInstance.value);

    // 1.6 事件监听
    bindMapEvents();
    bindBasemapSelectionWatcher();

    // 1.7 初始化时也要刷新一次图层状态，确保初始配置正确应用
    refreshLayersState();
    emitUserLayersChange();
    syncAttributeTableMapExtent();
}

// [隶属] 图层切换-底图状态刷新
// [作用] 将 layerList 的可见性与顺序同步到真实图层。
// [交互] 调用 emitBaseLayersChangeBatched，与外部组件同步状态。
// [改进] 使用批量 emit 减少重绘次数
function refreshLayersState() {
    refreshLayerInstances();
    emitBaseLayersChangeBatched();
}

// [隶属] 组件交互-路径选点
// [作用] 启动地图点选 Promise，用于公交起终点拾取。
// [交互] 由外部组件通过 defineExpose 调用。
function startBusPointPick(type) {
    if (!mapInstance.value) {
        return Promise.reject(new Error('地图尚未初始化'));
    }

    if (pendingReverseGeocodePickRef.value?.reject) {
        pendingReverseGeocodePickRef.value.reject(new Error('逆地理编码选点已取消'));
        pendingReverseGeocodePickRef.value = null;
    }

    const pickType = type === 'end' ? 'end' : 'start';

    if (pendingBusPickRef.value?.reject) {
        pendingBusPickRef.value.reject(new Error('上一次选点已取消'));
    }

    return new Promise((resolve, reject) => {
        pendingBusPickRef.value = { type: pickType, resolve, reject };
    });
}

// [隶属] 组件交互-逆地理编码选点
// [作用] 启动地图点选 Promise，用于单击拾点后执行逆地理编码落图。
function startReverseGeocodePick() {
    if (!mapInstance.value) {
        return Promise.reject(new Error('地图尚未初始化'));
    }

    if (pendingReverseGeocodePickRef.value?.reject) {
        pendingReverseGeocodePickRef.value.reject(new Error('上一次逆地理编码选点已取消'));
    }

    return new Promise((resolve, reject) => {
        pendingReverseGeocodePickRef.value = { resolve, reject };
    });
}

async function startReverseGeocodePickAndDraw() {
    const picked = await startReverseGeocodePick();
    if (!picked || !Number.isFinite(picked.lng) || !Number.isFinite(picked.lat)) {
        throw new Error('逆地理编码选点失败，请重试');
    }

    let reverseResult = null;
    try {
        const reverseResponse = await apiReverseGeocodeWithFallback(picked.lng, picked.lat, {
            tiandituTk: TIANDITU_TK,
            silent: true
        });
        reverseResult = reverseResponse?.data || null;
    } catch {
        reverseResult = null;
    }

    const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
    const layerName = formattedAddress || `逆编码点_${picked.lng.toFixed(6)}_${picked.lat.toFixed(6)}`;
    const businessAreaText = Array.isArray(reverseResult?.businessAreas)
        ? reverseResult.businessAreas
            .map((item) => String(item?.name || '').trim())
            .filter(Boolean)
            .join('、')
        : '';

    drawPointByCoordinatesInput({
        lng: picked.lng,
        lat: picked.lat,
        crsType: 'wgs84',
        displayName: layerName,
        label: layerName,
        layerName,
        properties: {
            来源: '地图逆地理编码拾点',
            逆地理编码地址: formattedAddress || '未解析',
            逆地理编码省: String(reverseResult?.province || '').trim() || '未知',
            逆地理编码市: String(reverseResult?.city || '').trim() || '未知',
            逆地理编码区县: String(reverseResult?.district || '').trim() || '未知',
            逆地理编码乡镇: String(reverseResult?.township || '').trim() || '未知',
            逆地理编码商圈: businessAreaText || '无',
            逆地理编码服务: String(reverseResult?.provider || '').trim() || 'unknown'
        }
    });

    if (formattedAddress) {
        message.success(`逆地理编码成功：${formattedAddress}`);
    } else {
        message.warning('逆地理编码未返回地址，已按坐标绘制点位。');
    }
}

// [隶属] 组件交互-图层坐标导出
// [作用] 将当前图层按当前坐标系导出为 CSV/TXT/GeoJSON。
// [交互] 由外部组件调用，委托 layerExportService 处理。
let exportLayerCoordinates;

// --- 4. 外部接口 (文件导入/绘图) ---

// [隶属] 图层管理-绘图样式
// [作用] 更新绘图图层及历史绘制图层的样式。
// [交互] 影响绘图工具与图层管理面板样式显示。
function setDrawStyle(styleCfg) {
    drawStyleConfig.value = mergeStyleConfig(drawStyleConfig.value, styleCfg);
    if (drawLayerInstance) {
        drawLayerInstance.setStyle(createStyleFromConfig(drawStyleConfig.value));
    }
    userDataLayers
        .filter(item => item.sourceType === 'draw')
        .forEach(item => {
            item.styleConfig = mergeStyleConfig(item.styleConfig, styleCfg);
            applyManagedLayerStyle(item);
        });
    emitUserLayersChange();
}

// [隶属] 底部控制-图形视野
// [作用] 将视图缩放到所有绘制/上传图层的联合范围。
// [交互] 由工具栏 ZoomToGraphics 与外部调用触发。
function zoomToGraphics() {
    if (!mapInstance.value) return;
    const unionExtent = createEmpty();

    const drawExtent = drawSource.getExtent();
    if (drawExtent && drawExtent.every(v => Number.isFinite(v))) {
        extendExtent(unionExtent, drawExtent);
    }

    userDataLayers.forEach(item => {
        const ext = item.layer.getSource()?.getExtent();
        if (ext && ext.every(v => Number.isFinite(v))) {
            extendExtent(unionExtent, ext);
        }
    });

    if (isExtentEmpty(unionExtent)) return;

    mapInstance.value.getView().fit(unionExtent, {
        padding: [80, 80, 80, 80],
        duration: 900,
        maxZoom: 18
    });
}

// --- 交互工具 (Draw/Measure) ---
// [隶属] 组件交互-绘图与测量
// [作用] 根据工具类型激活绘图、测量、清理、属性查询等交互。
// [交互] 对外 emit(feature-selected/graphics-overview) 并被父组件工具箱调用。
function activateInteraction(type) {
    clearDrawMeasureInteractions();
    if (!mapInstance.value) return;

    if (type !== 'ReverseGeocodePick' && pendingReverseGeocodePickRef.value?.reject) {
        pendingReverseGeocodePickRef.value.reject(new Error('逆地理编码选点已取消'));
        pendingReverseGeocodePickRef.value = null;
    }

    if (type === 'AttributeQuery') {
        isAttributeQueryEnabled.value = true;
        return;
    }

    if (type === 'CloseTools') {
        isAttributeQueryEnabled.value = false;
        return;
    }

    if (type === 'ReverseGeocodePick') {
        message.info('请在地图上单击一个点，系统将自动逆地理编码并绘制。', {
            closable: true,
            duration: 4500
        });
        startReverseGeocodePickAndDraw().catch((error) => {
            const detail = error instanceof Error ? error.message : '未知错误';
            if (/(取消|cancel)/i.test(detail)) return;
            message.warning(`逆地理编码选点未完成：${detail}`);
        });
        return;
    }

    if (type === 'ZoomToGraphics') {
        zoomToGraphics();
        return;
    }

    if (type === 'ViewGraphics') {
        emitGraphicsOverview();
        emit('feature-selected', {
            绘制图形数量: drawSource.getFeatures().length,
            上传图层数量: userDataLayers.length,
            上传图层名称: userDataLayers.map(item => item.name).join('、') || '无'
        });
        return;
    }

    if (type === 'Clear') {
        clearAllGraphics();
        return;
    }

    // 其他类型则激活绘图/测量（Point/LineString/Polygon/MeasureDistance/MeasureArea）
    activateDrawMeasure(type, (props) => emit('feature-selected', props));
}

function ensureDistrictManager() {
    if (!mapInstance.value) return null;

    if (!districtManagerRef) {
        districtManagerRef = new DistrictManager({
            map: mapInstance.value,
            tocStore,
            userDataLayers,
            emitUserLayersChange,
            emitGraphicsOverview,
            serializeManagedFeatures
        });
    }

    return districtManagerRef;
}

// [隶属] 行政区划-边界加载
// [作用] 根据 adcode 加载边界 GeoJSON，执行 GCJ02->WGS84 纠偏并自动聚焦。
// [交互] 由 HomeView 接收 ControlsPanel 树节点事件后调用。
async function focusDistrictByAdcode(payload = {}) {
    const adcode = String(payload?.adcode || payload?.value || '').trim();
    if (!/^\d{6}$/.test(adcode)) {
        throw new Error('行政区 adcode 必须是 6 位数字');
    }

    const manager = ensureDistrictManager();
    if (!manager) {
        throw new Error('地图尚未初始化');
    }

    return manager.loadBoundary({
        adcode,
        name: String(payload?.name || payload?.label || '').trim(),
        fit: payload?.fit !== false
    });
}

function setDistrictLayerVisibility(adcode, visible) {
    const manager = ensureDistrictManager();
    if (manager) {
        manager.setDistrictLayerVisibility(adcode, visible);
    }
}

function removeDistrictLayer(adcode) {
    const manager = ensureDistrictManager();
    if (manager) {
        manager.removeDistrictLayer(adcode);
    }
}

// [隶属] 组件交互-绘图与测量
// [作用] 清理当前激活的绘图/捕捉交互和提示覆盖物。
// [交互] 被 activateInteraction 与外部调用复用。
function clearInteractions() {
    clearDrawMeasureInteractions();
}

// 初始化图层导出服务并包装为适配本组件的调用方式
const exporterFn = createLayerExporter({ message, gcj02ToWgs84, wgs84ToGcj02 });
exportLayerCoordinates = (payload) => {
    exporterFn(payload, { userDataLayers });
};

// [隶属] 组件交互-对外能力暴露
// [作用] 向父组件公开地图核心动作（导入、绘制、路线、图层管理等）。
// [交互] HomeView 等父组件通过 ref 调用这些方法。
defineExpose({
    updateViewByParams,
    locateAddress,
    addUserDataLayer,
    activateInteraction,
    clearInteractions,
    getCurrentLocation,
    startBusPointPick,
    drawRouteOnMap,
    zoomToBusRouteStep,
    previewBusRouteStep,
    clearBusRouteStepPreview,
    drawDriveRouteOnMap,
    zoomToDriveRouteStep,
    previewDriveRouteStep,
    clearDriveRouteStepPreview,
    setDrawStyle,
    setUserLayerStyle,
    applyStyleTemplate,
    setUserLayerVisibility,
    setUserLayerOpacity,
    setUserLayerLabelVisibility,
    setBaseLayerActive,
    setLayerVisibility,
    zoomToUserLayer,
    zoomToManagedFeature,
    removeUserLayer,
    reorderUserLayers,
    soloUserLayer,
    viewUserLayer,
    zoomToGraphics,
    focusDistrictByAdcode,
    setDistrictLayerVisibility,
    removeDistrictLayer,
    drawPointByCoordinatesInput,
    drawAmapAoiByDetailJsonInput,
    toggleLayerCRS,
    toggleSearchLayerCRS,
    exportLayerCoordinates
});
</script>

<style scoped>
.map-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: #f0f2f5;
}

#map {
    width: 100%;
    height: 100%;
}

.compass-hud-wrapper {
    position: absolute;
    right: 18px;
    bottom: 18px;
    z-index: 1210;
    pointer-events: none;
    transform: translateZ(0);
}

.map-container.compass-placement-mode :deep(#map),
.map-container.compass-placement-mode #map {
    cursor: crosshair;
}

/* OpenLayers Tooltips Override */
:deep(.ol-tooltip) {
    position: relative;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    color: white;
    padding: 4px 8px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
}

:deep(.ol-tooltip-measure) {
    opacity: 1;
    font-weight: bold;
}

:deep(.ol-tooltip-static) {
    background-color: #ffcc33;
    color: black;
    border: 1px solid white;
}

/* 比例尺 */


/* 鹰眼视图样式 */
:deep(.ol-custom-overviewmap) {
    position: absolute;
    left: 5px;
    top: 5px;
    right: auto;
    bottom: auto;
}

:deep(.ol-custom-overviewmap:not(.ol-collapsed)) {
    border: 2px solid rgba(20, 156, 49, 0.729);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.9);
}

:deep(.ol-custom-overviewmap .ol-overviewmap-map) {
    border: none;
    width: 200px;
    height: 200px;
}

:deep(.ol-custom-overviewmap .ol-overviewmap-box) {
    border: 2px solid #20cd2b;
    background: rgba(0, 170, 255, 0.2);
}

:deep(.ol-custom-overviewmap button) {
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 16px;
    font-weight: bold;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    padding: 2px 6px;
}

:deep(.ol-custom-overviewmap button:hover) {
    background-color: rgba(0, 0, 0, 0.8);
}

/* 移动端适配鹰眼视图 */
@media (max-width: 768px) {
    :deep(.ol-custom-overviewmap .ol-overviewmap-map) {
        width: 120px;
        height: 120px;
    }

    :deep(.ol-custom-overviewmap) {
        left: 5px;
        top: 5px;
    }

    /* :deep(ol-scale-line) {
        left: 5px;
        bottom: 5px;
    } */
}
</style>