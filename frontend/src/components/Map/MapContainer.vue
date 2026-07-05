<template>
    <div
        id="map-container"
        ref="mapContainerRef"
        class="map-container"
        :class="{
            'compass-placement-mode':
                compassStore.enabled &&
                compassStore.mode === 'vector' &&
                compassStore.placementMode,
            'reverse-geocode-pick-mode': isReverseGeocodePickMode,
        }"
    >
        <div
            id="map"
            ref="mapRef"
        ></div>

        <!-- Map Swipe Controller -->
        <MapSwipeController
            v-if="layerStore.swipeConfig.enabled"
            :swipe-position="layerStore.swipeConfig.position"
            :swipe-mode="layerStore.swipeConfig.mode"
            :is-active="layerStore.swipeConfig.enabled"
            :container-rect="mapContainerRect"
            @update:swipe-position="handleSwipePositionUpdate"
            @update:swipe-mode="handleSwipeModeUpdate"
            @close="handleSwipeClose"
        />

        <LayerControlPanel
            :map-instance="mapInstance"
            :layer-list="layerList"
            :selected-layer="selectedLayer"
            :custom-map-url="customMapUrl"
            :active-graticule="showDynamicSplitLines"
            :basemap-circuit-open="basemapCircuitOpen"
            :tianditu-tk="tiandituTk"
            :is-domestic="isDomestic"
            @change-layer="handleLayerChange"
            @update-order="handleLayerOrderUpdate"
            @toggle-graticule="handleToggleGraticule"
            @search-jump="handleSearchJump"
            @reset-basemap-chain="handleResetBasemapChain"
            @layer-context-action="handleLayerContextAction"
        />

        <AttributeTable
            @focus-feature="handleAttributeTableFocusFeature"
            @highlight-feature="handleAttributeTableHighlightFeature"
        />

        <div
            v-if="compassStore.hudVisible"
            class="compass-hud-wrapper"
            :style="{
                opacity: compassStore.opacity,
                ...compassBgVars(compassStore.bgColor),
            }"
        >
            <FengShuiCompassSvg
                :key="compassStore.renderCacheToken"
                :config="compassStore.hudRenderConfig"
            />
        </div>

        <!-- 风水宫位解释面板 -->
        <PalaceExplanationPanel
            :selected-palace="selectedPalace"
            :theme-config="compassStore.config"
            @close="handleCloseExplanation"
        />

        <!-- 底部控制栏 -->
        <MapControlsBar
            :coordinate="currentCoordinate"
            :current-zoom="currentZoom"
            @reset-view="resetView"
            @locate-me="zoomToUser"
            @jump-to="handleJumpToCoordinates"
        />
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
import { ref, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { storeToRefs } from 'pinia';

// --- OpenLayers 核心 ---
import Map from 'ol/Map';
import View from 'ol/View';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';
import ScaleLine from 'ol/control/ScaleLine';
import OverviewMap from 'ol/control/OverviewMap';
import { createEmpty, extend as extendExtent, isEmpty as isExtentEmpty } from 'ol/extent';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';

// --- Composables ---
import { useManagedLayerRegistry } from '../../composables/useManagedLayerRegistry';
import { useUserLocation } from '../../composables/useUserLocation';
import { useMessage } from '../../composables/useMessage';
import { useMapState } from '../../composables/useMapState';
import {
    createBasemapLayerBootstrap,
    createBasemapResilience,
    createBasemapSelectionWatcher,
    createBasemapStateManagementFeature,
    createBasemapSwipe,
    createBasemapUrlMappingFeature,
    tileHDRendering,
    createCoordinateSystemConversionFeature,
    useCreateManagedVectorLayer,
    createDeferredUserLayerApis,
    createDistrictManagerFeature,
    createDrawMeasureFeature,
    useLayerContextMenuActions,
    createLayerControlHandlers,
    createLayerMetadataNormalizationFeature,
    createManagedFeatureHighlightFeature,
    createManagedFeatureOperationsFeature,
    createManagedFeatureSerializationFeature,
    createManagedLayerStyleFeature,
    createMapEventHandlers,
    createMapInteractionPickers,
    createMapSearchAndCoordinateInputFeature,
    createMapUIEventHandlers,
    createRightDragZoomController,
    createRouteRenderingFeature,
    createRouteStepInteraction,
    createRouteStepStyles,
    createSpatialAnalysisFeature,
    createStartupTaskSchedulerFeature,
    createUserLayerApiFacadeFeature,
} from '../../composables/map';
import {
    abortTileSourceRequests,
    prioritizeTileSourceRequest,
    createAutoTileSourceFromUrl,
} from '../../composables/useTileSourceFactory';
import { createBasemapLayerFromSource } from '../../composables/map/features/basemapLayerFactory';
import { createStartupUrlRestoreGuard } from '../../composables/map/features/useStartupUrlRestoreGuard';

// --- 常量 / 配置 ---
import {
    DEFAULT_BASEMAP_PRESET_ID,
    URL_LAYER_OPTIONS,
    createLayerConfigs,
    resolvePresetLayerIds,
    getBasemapOptionLabel,
    getLayerCategory as getLayerCategoryById,
    getLayerGroup as getLayerGroupById,
    STYLE_TEMPLATES,
    SEARCH_RESULT_STYLE,
    SEARCH_AOI_STYLE,
    AMAP_EXTRACT_AOI_STYLE,
    createMapStylesObject,
} from '../../constants';

// --- Stores / Services / API ---
import {
    useAttrStore,
    useUrlParamStore,
    useCompassStore,
    useTOCStore,
    useLayerStore,
} from '../../stores';
import { CompassManager } from '../../services/CompassManager';
import {
    getRuntimeMapTokensSync,
    loadRuntimeMapTokens,
    markRuntimeMapTokenFailed,
} from '../../services/runtimeMapTokens';
import { apiReverseGeocodeWithFallback } from '../../api';
import { apiGetRuntimeDefaults } from '../../api/backend';

// --- 工具函数 ---
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../utils/coordTransform';
import { createLayerExporter, isVectorManagedLayer } from '../../utils/layerExportService';

// --- 子组件 ---
import LayerControlPanel from '../Layer/LayerControlPanel.vue';
import MapSwipeController from './MapSwipeController.vue';
import MapControlsBar from './MapControlsBar.vue';
import AttributeTable from '../Layer/AttributeTable.vue';
import FengShuiCompassSvg from '../feng-shui-compass-svg/feng-shui-compass-svg.vue';
import PalaceExplanationPanel from '../Compass/PalaceExplanationPanel.vue';

const message = useMessage();
const attrStore = useAttrStore();
const urlParamStore = useUrlParamStore();
const compassStore = useCompassStore();
const tocStore = useTOCStore();

/**
 * 将 hex 颜色转换为 CSS 渐变所需的 CSS 变量对象
 * 避免使用 color-mix()（兼容性差），直接计算 rgba 值
 * @param {string} hex - 十六进制颜色值
 * @returns {Object} 包含 --compass-bg-g1/g2/g3 的样式对象
 */
function compassBgVars(hex) {
    const h = String(hex || '#000000').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return {
        '--compass-bg-g1': `rgba(${r},${g},${b},0.45)`,
        '--compass-bg-g2': `rgba(${r},${g},${b},0.25)`,
        '--compass-bg-g3': `rgba(${r},${g},${b},0.10)`,
    };
}
const layerStore = useLayerStore();

// 从 compassStore 解构响应式 ref（替代 computed 包装）
const { selectedPalace } = storeToRefs(compassStore);

// 关闭宫位解释面板
const handleCloseExplanation = () => {
    compassStore.setSelectedPalace(null);
};

// ========== 底图管理 Composable ==========
// 集中管理底图配置、底图选项列表、Google 主机选择等逻辑
// URL_LAYER_OPTIONS：用于 URL 参数中的图层索引映射（与 BASEMAP_OPTIONS 对应）
// createLayerConfigs：工厂函数，根据参数生成全部底图源配置

// --- 配置常量 ---
const BASE_URL = import.meta.env.BASE_URL || '/';
const NORM_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const INITIAL_VIEW = { center: [114.302, 34.8146], zoom: 4 }; // 初始视图位置
const CRITICAL_TILE_READY_TIMEOUT_MS = 3000; // 首屏关键瓦片加载超时时间（毫秒）
const APP_DISPLAY_VERSION = 'V3.3.15'; // 应用显示版本号（与 package.json 独立维护）

// 图层 z-index 分层方案（值越大越在上层）
const Z_INDEX = {
    DRAW: 999,        // 绘图图层
    USER_LOCATION: 1000, // 用户定位图层
    BUS_ROUTE: 1080,  // 公交/驾车路线图层
    BUS_PICK: 1085,   // 公交选点图层
    SEARCH: 1100,     // 搜索结果图层
};

let TIANDITU_TK = getRuntimeMapTokensSync().tiandituTk;
const tiandituTk = ref(TIANDITU_TK);

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

/**
 * 将任意值归一化为二进制标志字符串 '0' 或 '1'
 * @param {*} value - 待归一化的值（支持 '1'/'true'/'0'/'false'/其他）
 * @param {string} fallback - 无法识别时的默认值，默认 '0'
 * @returns {'0' | '1'}
 */
function normalizeBinaryFlag(value, fallback = '0') {
    const compact = String(value ?? '')
        .trim()
        .toLowerCase();
    if (compact === '1' || compact === 'true') return '1';
    if (compact === '0' || compact === 'false') return '0';
    return fallback; // 直接返回 fallback，不再硬编码 '0'
}

function parseSharedEntryFlagFromUrl() {
    if (typeof window === 'undefined') return false;

    const hash = String(window.location.hash || '');
    const queryStart = hash.indexOf('?');
    const hashParams =
        queryStart >= 0 ? new URLSearchParams(hash.slice(queryStart + 1)) : new URLSearchParams();

    const searchParams = new URLSearchParams(
        String(window.location.search || '').replace(/^\?/, ''),
    );
    const shareFlagRaw = hashParams.get('s') ?? searchParams.get('s');
    if (shareFlagRaw !== null && String(shareFlagRaw).trim() !== '') {
        return normalizeBinaryFlag(shareFlagRaw, '0') === '1';
    }

    // 兼容旧版分享链接。
    const legacyMarker = String(
        hashParams.get('from') ||
        hashParams.get('shared') ||
        searchParams.get('from') ||
        searchParams.get('shared') ||
        '',
    )
        .trim()
        .toLowerCase();

    return (
        legacyMarker === 'share' ||
        legacyMarker === 'shared' ||
        legacyMarker === '1' ||
        legacyMarker === 'true'
    );
}

// 启动问候地址解析：高德优先，天地图兜底。
async function resolveSharedAddressByLonLat(lng, lat) {
    const lon = Number(lng);
    const latitude = Number(lat);
    if (!Number.isFinite(lon) || !Number.isFinite(latitude)) return '';

    try {
        const geocodeResponse = await apiReverseGeocodeWithFallback(lon, latitude, {
            tiandituTk: tiandituTk.value, // 读取响应式 ref，确保 token 轮换后使用最新值
            tiandituTimeout: 3500,
            silent: true,
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
const layerList = ref(
    LAYER_CONFIGS.map((cfg) => ({
        id: cfg.id,
        name: cfg.name,
        visible: cfg.visible,
        opacity: 1, // 初始透明度为 100%
    })),
);
const layerInstances = {}; // ⚠️ 非响应式共享可变状态：存储所有底图层实例 (TileLayer/VectorTileLayer)
                           // 被 30+ composable 直接读写，通过 emit 手动同步外部状态，刻意不使用 reactive 以避免深层响应式追踪的性能开销

function applyRuntimeMapTokens(tokens = {}) {
    const nextTiandituTk = String(tokens.tiandituTk || '').trim();
    if (!nextTiandituTk || nextTiandituTk === TIANDITU_TK) return;

    const previousLayerState = new globalThis.Map(
        (Array.isArray(layerList.value) ? layerList.value : []).map((item) => [
            item.id,
            {
                visible: !!item.visible,
                opacity: typeof item.opacity === 'number' ? item.opacity : 1,
            },
        ]),
    );

    TIANDITU_TK = nextTiandituTk;
    tiandituTk.value = nextTiandituTk;

    const nextLayerConfigs = createLayerConfigs(NORM_BASE, TIANDITU_TK, customMapUrl.value);
    LAYER_CONFIGS.splice(0, LAYER_CONFIGS.length, ...nextLayerConfigs);
    layerList.value = LAYER_CONFIGS.map((cfg) => ({
        id: cfg.id,
        name: cfg.name,
        visible: previousLayerState.has(cfg.id)
            ? previousLayerState.get(cfg.id).visible
            : cfg.visible,
        opacity: previousLayerState.get(cfg.id)?.opacity ?? 1,
    }));
}

async function hydrateRuntimeMapTokens() {
    const tokens = await loadRuntimeMapTokens({ silent: false });
    applyRuntimeMapTokens(tokens);
}

function isTiandituLayerId(layerId) {
    return String(layerId || '')
        .trim()
        .toLowerCase()
        .includes('tianditu');
}

function resolveRuntimeTiandituLayerIds(layerId) {
    const selectedStack = resolvePresetLayerIds(selectedLayer.value);
    const failedLayerId = String(layerId || '').trim();
    const failedStack = resolvePresetLayerIds(failedLayerId);
    const sourceIds =
        selectedStack.includes(failedLayerId) || !failedStack.length
            ? selectedStack
            : failedStack;
    const candidates = sourceIds.length ? sourceIds : [failedLayerId];
    const result = [];
    const seen = new Set();

    candidates.forEach((id) => {
        const normalized = String(id || '').trim();
        if (!normalized || seen.has(normalized) || !isTiandituLayerId(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });

    return result;
}

function resetLayerSourceForRuntimeToken(layerId) {
    const layer = layerInstances[layerId];
    if (!layer || typeof layer.setSource !== 'function') return;

    const source = layer.getSource?.();
    if (source) {
        abortTileSourceRequests(source);
    }

    layer.set?.(`_isTimeoutMonitored_${layerId}`, false);
    layer.setSource(null);
}

function attachRuntimeTokenMonitor(layerId) {
    const layer = layerInstances[layerId];
    const item = Array.isArray(layerList.value)
        ? layerList.value.find((entry) => entry.id === layerId)
        : null;
    if (!layer || !item?.visible) return;

    layer.set?.(`_isTimeoutMonitored_${layerId}`, false);
    monitorLayerTimeout?.(layer, layerId, selectedLayer.value === DEFAULT_BASEMAP_PRESET_ID);
}

function retryTiandituLayersWithNextToken({ layerId, reason, releaseMonitor } = {}) {
    const affectedLayerIds = resolveRuntimeTiandituLayerIds(layerId);
    if (!affectedLayerIds.length) return false;

    const tokenSwitch = markRuntimeMapTokenFailed('tianditu_tk');
    if (!tokenSwitch.switched) return false;

    releaseMonitor?.();
    applyRuntimeMapTokens(tokenSwitch.tokens);
    affectedLayerIds.forEach(resetLayerSourceForRuntimeToken);

    switchLayerById?.(selectedLayer.value, {
        onUpdated: () => {
            emitBaseLayersChangeBatched?.();
            mapInstance.value?.updateSize?.();
        },
    });
    affectedLayerIds.forEach(attachRuntimeTokenMonitor);

    message?.warning?.(
        `天地图 token 已切换到备用项，正在重试 ${affectedLayerIds.join(' + ')}${reason ? `：${reason}` : ''
        }`,
    );
    return true;
}

// ========== Map Swipe Setup (via composable) ==========
const {
    mapContainerRect,
    enableBasemapSwipe,
    restoreSwipe,
    clearSwipeCompareLayers,
    detachSwipeFromLayers,
    handleSwipePositionUpdate,
    handleSwipeModeUpdate,
    handleSwipeClose,
    dispose: disposeSwipe,
} = createBasemapSwipe({
    mapInstance,
    layerStore,
    resolvePresetLayerIds,
    createBasemapLayerFromSource,
    LAYER_CONFIGS,
    NORM_BASE,
    TIANDITU_TK: tiandituTk,
    customMapUrl,
    layerInstances,
    switchLayerById: (id, opts) => switchLayerById?.(id, opts),
    emitBaseLayersChangeBatched: () => emitBaseLayersChangeBatched?.(),
    selectedLayer,
    message,
});

const { handleLayerContextAction } = useLayerContextMenuActions({
    layerInstances,
    getLayerConfigs: () => LAYER_CONFIGS,
    customMapUrlRef: customMapUrl,
    message,
});

const { validateBaseLayerSwitch, getFallbackManager, monitorLayerTimeout, disposeAllMonitors } =
    createBasemapResilience({
        message,
        onRuntimeTokenFailure: retryTiandituLayersWithNextToken,
    });

const { initializeBasemapLayers } = createBasemapLayerBootstrap({
    layerListRef: layerList,
    layerConfigs: LAYER_CONFIGS,
    layerInstances,
    monitorLayerTimeout,
    selectedLayerRef: selectedLayer,
    message,
    defaultLayerId: DEFAULT_BASEMAP_PRESET_ID,
});

// --- 全局变量 (非响应式) ---
const componentUnmountedRef = ref(false);

// ========== 交互选点功能 (via composable) ==========
const {
    pendingBusPickRef,
    pendingReverseGeocodePickRef,
    startBusPointPick,
    startReverseGeocodePick,
    disposeAll: disposeInteractionPickers,
} = createMapInteractionPickers({ mapInstance });

let busRouteLayerRef = null;
const busRouteManagedLayerIdRef = ref(null);
let rightDragZoomController = null;
const rightDragZoomControllerRef = shallowRef(null);
let compassManagerRef = null;

// 图层引用
const drawSource = new VectorSource();
const userLocationSource = new VectorSource();
const busPickSource = new VectorSource();
const busRouteSource = new VectorSource();

// 子组件入参：父组件控制当前引擎可见性，避免隐藏的 OL 面板覆盖 Cesium URL 状态。
const props = defineProps({
    urlSyncEnabled: {
        type: Boolean,
        default: true,
    },
});

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
    'map-core-failed',
    'view-sync',
]);

const { detectIPLocale, getCurrentLocation, zoomToUser } = useUserLocation({
    mapInstance,
    userLocationSource,
    isDomestic,
    fitToLonLatExtent: (...args) => fitToLonLatExtentByMapState(...args),
});

// 注：handleEasterEggImageOpen, handleEasterEggLocationChange, 等函数现在由 createMapUIEventHandlers 提供
// 此处保留注释以说明这些函数的来源

const isAttributeQueryEnabled = ref(true);
const isReverseGeocodePickMode = ref(false);
const userDataLayers = []; // ⚠️ 非响应式共享可变状态：用户上传/绘制的图层记录数组
                           // 被多个 composable 直接修改（push/splice/filter），通过 emitUserLayersChange() 手动同步
let drawLayerInstance = null;
const tooltipRef = {
    helpTooltipEl: null,
    helpTooltipOverlay: null,
};

const {
    createManagedLayerId,
    emitUserLayersChange,
    emitGraphicsOverview,
    refreshUserLayerZIndex,
    addManagedLayerRecord,
} = useManagedLayerRegistry({
    emit,
    userDataLayers,
    drawSource,
    styleTemplates: STYLE_TEMPLATES,
});

const drawStyleConfig = ref({ ...STYLE_TEMPLATES.classic });

// 托管图层样式系统已下沉到 feature 库，MapContainer 仅负责注入与调用。
const {
    normalizeStyleConfig,
    createStyleFromConfig,
    mergeStyleConfig,
    buildManagedLayerStyle,
    applyManagedLayerStyle,
} = createManagedLayerStyleFeature({
    styleTemplates: STYLE_TEMPLATES,
});

const { getBusStepStyle, getBusStepPointStyle, getDriveStepStyle, clearRouteStepStyleCache } =
    createRouteStepStyles();

const {
    getCurrentBusStepIndex,
    getCurrentDriveStepIndex,
    resetRouteStepStates,
    zoomToDriveRouteStep,
    zoomToBusRouteStep,
    previewBusRouteStep,
    clearBusRouteStepPreview,
    previewDriveRouteStep,
    clearDriveRouteStepPreview,
} = createRouteStepInteraction({
    mapInstanceRef: mapInstance,
    routeSource: busRouteSource,
    getRouteLayer: () => busRouteLayerRef,
    ensureRouteBuilderApi,
});

const { ensureFeatureId, serializeManagedFeatures } =
    createManagedFeatureSerializationFeature();

// 图层元数据规范化（必须在使用前定义）
const { getFeatureRepresentativeLonLat, normalizeLayerMetadata } =
    createLayerMetadataNormalizationFeature();

const { scheduleLowPriorityTask, waitForCriticalTileReady, cancelScheduledTasks } = createStartupTaskSchedulerFeature({
    componentUnmountedRef,
    criticalTileReadyTimeoutMs: CRITICAL_TILE_READY_TIMEOUT_MS,
    mapInstanceRef: mapInstance,
});

const { getLayerIdByIndex, getLayerIndexById, getLayerCategory } =
    createBasemapUrlMappingFeature({
        urlLayerOptions: URL_LAYER_OPTIONS,
        getLayerCategoryById,
        getLayerGroupById,
    });

const { toggleLayerCRS, toggleSearchLayerCRS } =
    createCoordinateSystemConversionFeature({
        userDataLayers,
        message,
        wgs84ToGcj02,
        gcj02ToWgs84,
        isVectorManagedLayer,
        serializeManagedFeatures,
        normalizeLayerMetadata,
        getFeatureRepresentativeLonLat,
        emitUserLayersChange,
    });

// [Phase 19] 初始化托管图层创建器（必须在 createMapSearchAndCoordinateInputFeature 之前）
const { createManagedVectorLayer } = useCreateManagedVectorLayer({
    mapInstanceRef: mapInstance,
    userDataLayers,
    styleHelpers: {
        normalizeStyleConfig,
        buildManagedLayerStyle,
    },
    featureHelpers: {
        serializeManagedFeatures,
        ensureFeatureId,
    },
    metadataHelpers: {
        normalizeLayerMetadata,
    },
    registryHelpers: {
        createManagedLayerId,
        emitUserLayersChange,
        emitGraphicsOverview,
        refreshUserLayerZIndex,
    },
    styleTemplates: STYLE_TEMPLATES,
});

const { handleSearchJump, drawPointByCoordinatesInput, drawAmapAoiByDetailJsonInput } =
    createMapSearchAndCoordinateInputFeature({
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
        onSearchPoiResolved: (payload) => emit('search-poi-selected', payload),
    });

const {
    createManagedFeatureHighlightStyle,
    clearManagedFeatureHighlight,
    highlightManagedFeature,
    getCurrentHighlightedFeature,
    setCurrentHighlightedFeature,
} = createManagedFeatureHighlightFeature({
    findManagedFeature: (layerId, featureId) => {
        // 从 userDataLayers 中查找对应的图层
        const layerRecord = userDataLayers.find((item) => item.id === layerId);
        if (!layerRecord || !layerRecord.layer || !layerRecord.layer.getSource) return null;
        const source = layerRecord.layer.getSource();
        return source.getFeatureById(featureId);
    },
});

// 托管要素操作
const { zoomToManagedFeature } = createManagedFeatureOperationsFeature({
    mapInstanceRef: mapInstance,
    userDataLayers,
    getCurrentHighlightedFeature,
    setCurrentHighlightedFeature,
    clearManagedFeatureHighlight,
    createManagedFeatureHighlightStyle,
    highlightManagedFeature,
});

// 绘图与测量交互
const drawGraphicSeedRef = { value: 1 };
let removeManagedLayerById = () => undefined;

// 空间分析交互
const { runSpatialAnalysis } = createSpatialAnalysisFeature({
    mapInstanceRef: mapInstance,
    createManagedVectorLayer,
    emitGraphicsOverview,
    emitUserLayersChange,
    refreshUserLayerZIndex,
    userDataLayers,
    message,
});

const {
    activateInteraction: activateDrawMeasure,
    clearInteractions: clearDrawMeasureInteractions,
    clearAllGraphics,
    getDrawInteraction,
    getSketchFeature,
} = createDrawMeasureFeature({
    mapInstanceRef: mapInstance,
    drawSource,
    createStyleFromConfig,
    createManagedVectorLayer,
    emitGraphicsOverview,
    refreshUserLayerZIndex,
    emitUserLayersChange,
    removeManagedLayerById: (...args) => removeManagedLayerById(...args),
    drawStyleConfig,
    drawGraphicSeedRef,
    userDataLayers,
    tooltipRef,
});

// 路线绘制交互
const { drawRouteOnMap, drawDriveRouteOnMap } = createRouteRenderingFeature({
    mapInstanceRef: mapInstance,
    getBusRouteLayer: () => busRouteLayerRef,
    busRouteSource,
    resetRouteStepStates,
    ensureRouteBuilderApi,
    userDataLayers,
    addManagedLayerRecord,
    busRouteManagedLayerIdRef,
    emitUserLayersChange,
    emitGraphicsOverview,
});

// 底图状态管理
const { emitBaseLayersChangeBatched, refreshAllBasemapSourcesForHD } =
    createBasemapStateManagementFeature({
        layerList,
        selectedLayer,
        getLayerCategory: getLayerCategoryById,
        getLayerGroup: getLayerGroupById,
        emit,
        LAYER_CONFIGS,
        layerInstances,
    });

// 图层控制面板事件（切换/排序/自定义 URL）
const { handleLayerChange, handleLayerOrderUpdate } = createLayerControlHandlers({
    selectedLayerRef: selectedLayer,
    customMapUrlRef: customMapUrl,
    layerListRef: layerList,
    layerInstances,
    refreshLayersState,
    createAutoTileSourceFromUrl,
    message,
    mapInstanceRef: mapInstance,
    emitBaseLayersChange: emitBaseLayersChangeBatched,
});

// 栅格值查询函数的 ref 包装（用于延迟初始化）
const queryRasterValueAtCoordinateRef = ref(null);

/**
 * 通过 XYZ URL 切换到自定义底图
 *
 * 复用现有的 custom 底图机制（l=1）：
 * 1. 设置自定义 URL 到 customMapUrl
 * 2. 触发 handleLayerChange 切换到 custom 图层
 * 3. loadCustomMap 自动识别 URL 类型并创建瓦片源
 *
 * @param {string} url - XYZ 瓦片 URL（含 {x},{y},{z} 占位符）
 * @returns {Promise<{success: boolean, message: string, layerId?: string, layerIndex?: number, url?: string}>}
 */
async function setCustomBasemapByUrl(url) {
    const normalizedUrl = String(url || '').trim();
    const customLayerIndex = getLayerIndexById('custom');

    if (!normalizedUrl) {
        return {
            success: false,
            message: '自定义 XYZ 底图 URL 不能为空',
            layerId: 'custom',
            layerIndex: customLayerIndex,
        };
    }

    if (customLayerIndex !== 1) {
        return {
            success: false,
            message: `自定义底图索引配置异常：期望 l=1，当前为 l=${customLayerIndex}`,
            layerId: 'custom',
            layerIndex: customLayerIndex,
            url: normalizedUrl,
        };
    }

    try {
        const switchResult = await handleLayerChange({
            layerId: 'custom',
            source: 'custom-url',
            customUrl: normalizedUrl,
        });

        if (switchResult?.success === false) {
            return {
                ...switchResult,
                layerId: 'custom',
                layerIndex: customLayerIndex,
                url: normalizedUrl,
            };
        }

        if (selectedLayer.value !== 'custom') {
            return {
                success: false,
                message: '自定义底图图源已加载，但当前底图未切换到 custom',
                layerId: selectedLayer.value,
                layerIndex: getLayerIndexById(selectedLayer.value),
                url: normalizedUrl,
            };
        }

        // Agent 切换自定义底图时必须落到 URL 索引 l=1，便于分享链接和状态恢复。
        syncUrlFromActiveMap();
        mapInstance.value?.updateSize?.();

        return {
            success: true,
            message: `已切换到自定义 XYZ 底图（URL 图层索引 l=${customLayerIndex}）`,
            layerId: 'custom',
            layerIndex: customLayerIndex,
            url: normalizedUrl,
            customLoadResult: switchResult?.customLoadResult || null,
        };
    } catch (error) {
        return {
            success: false,
            message: `切换自定义 XYZ 底图失败：${error?.message || '未知错误'}`,
            layerId: 'custom',
            layerIndex: customLayerIndex,
            url: normalizedUrl,
        };
    }
}

// 属性表范围同步函数桥接（用于解决 setup 初始化顺序依赖）
let syncAttributeTableMapExtentImpl = () => { };

function syncAttributeTableMapExtent() {
    syncAttributeTableMapExtentImpl?.();
}

// 地图事件处理
let _cleanupMapEventHandlers = null;
const { bindMapEvents } = createMapEventHandlers({
    mapInstanceRef: mapInstance,
    currentCoordinateRef: currentCoordinate,
    currentZoomRef: currentZoom,
    emit,
    getDrawInteraction,
    getSketchFeature,
    queryRasterValueAtCoordinateRef,
    rightDragZoomControllerRef,
    isAttributeQueryEnabledRef: isAttributeQueryEnabled,
    tooltipRef,
    syncAttributeTableMapExtent,
    pendingBusPickRef,
    pendingReverseGeocodePickRef,
    busPickSource,
    highlightManagedFeature,
});

// UI 事件处理器（简单转发 + 属性表同步）
const {
    syncAttributeTableMapExtent: syncAttributeTableMapExtentFromUI,
    handleAttributeTableFocusFeature,
    handleAttributeTableHighlightFeature,
    handleToggleGraticule,
    updateViewByParams,
    handleJumpToCoordinates,
    resetView,
} = createMapUIEventHandlers({
    mapInstanceRef: mapInstance,
    attrStoreRef: attrStore,
    emit,
    highlightManagedFeature,
    clearManagedFeatureHighlight,
    getCurrentHighlightedFeature,
    setCurrentHighlightedFeature,
    zoomToManagedFeature,
    toggleGraticule: (...args) => toggleGraticule(...args),
    showDynamicSplitLinesRef: showDynamicSplitLines,
    selectedLayerRef: selectedLayer,
    INITIAL_VIEW,
    flyToView: (...args) => flyToView(...args),
    getLayerIndexById,
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
    getCurrentViewState,
    syncViewFromCesium,
    getMapSize,
    getOlView,
    refreshLayerInstances,
    switchLayerById,
    setGraticuleActive,
    toggleGraticule,
    stopGraticule,
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
    },
});

const startupUrlRestoreGuard = createStartupUrlRestoreGuard({
    parseUrlToState,
    getPendingParams: () => urlParamStore.getPendingParams(),
    isUrlSyncEnabled: () => props.urlSyncEnabled,
});

/**
 * 仅在 OL 面板处于当前视图且启动 URL 已恢复后写回 URL，避免覆盖分享链接或 Cesium 相机状态。
 */
function syncUrlFromActiveMap() {
    if (!startupUrlRestoreGuard.canSyncNow()) return;
    syncUrlFromMap();
    emit('view-sync', { view: 'ol' });
}

function bindActiveMapViewSync() {
    if (!props.urlSyncEnabled || startupUrlRestoreGuard.hasPendingRestore()) return;
    bindMapViewSync();
}

watch(
    () => props.urlSyncEnabled,
    (enabled) => {
        if (enabled) {
            bindMapViewSync();
            if (startupUrlRestoreGuard.canSyncNow()) {
                syncUrlFromMap();
                emit('view-sync', { view: 'ol' });
            }
        } else {
            stopMapViewSync();
        }
    },
);

fitToLonLatExtentByMapState = (...args) => fitToLonLatExtent(...args);

const { bindBasemapSelectionWatcher, resetBasemapChain, dispose: disposeSelectionWatcher } = createBasemapSelectionWatcher({
    selectedLayerRef: selectedLayer,
    switchLayerById,
    resolvePresetLayerIds,
    isBasemapLayerId: (layerId) => {
        const category = getLayerCategoryById?.(String(layerId || '').trim());
        return (
            category === 'label' ||
            category === 'imagery' ||
            category === 'vector' ||
            category === 'terrain' ||
            category === 'theme' ||
            category === 'custom'
        );
    },
    emitBaseLayersChange: emitBaseLayersChangeBatched,
    mapInstanceRef: mapInstance,
    layerInstances,
    syncUrlFromMap: syncUrlFromActiveMap,
    validateBaseLayerSwitch,
    getFallbackManager,
    onRuntimeTokenFailure: retryTiandituLayersWithNextToken,
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
    },
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
    const finishInitialRestore = () => {
        startupUrlRestoreGuard.markInitialRestoreApplied();
        bindActiveMapViewSync();
    };

    if (!mapInstance?.value) {
        console.warn('[MapContainer] Cannot apply deferred params: mapInstance not ready');
        finishInitialRestore();
        return;
    }

    // Cesium 模式下 OL 面板被隐藏，参数恢复由 CesiumContainer.restoreCameraFromUrl 处理。
    // 此处显式跳过避免隐式依赖 getValidCoordinateParams 返回 null。
    if (urlParamStore.getPendingParams().view === 'cesium') {
        urlParamStore.markParamsAsApplied();
        finishInitialRestore();
        return;
    }

    const validParams = urlParamStore.getValidCoordinateParams();
    if (!validParams) {
        // 没有有效的地理坐标参数，直接标记已应用
        urlParamStore.markParamsAsApplied();
        finishInitialRestore();
        return;
    }

    try {
        // 应用坐标、缩放、图层索引
        flyToView({
            lng: validParams.lng,
            lat: validParams.lat,
            z: validParams.z,
            l: validParams.l,
            duration: 500, // 应用参数时的动画持续时间
        });

        // 释放启动守卫后再绑定 moveend，避免 flyToView 动画产生的首次 moveend 覆盖分享链接。
        urlParamStore.markParamsAsApplied();
        finishInitialRestore();
    } catch (error) {
        console.error('[MapContainer] Failed to apply deferred URL params:', error);
        urlParamStore.markParamsAsApplied(); // 即使失败也标记已应用，防止重复尝试
        finishInitialRestore();
    }
}

// [隶属] 地图初始化-视图状态
// [作用] 根据 URL 参数或默认值设置初始视图状态，支持直接
// 定位到分享链接中的地点。
function getInitialViewState() {
    const routeState = parseUrlToState();
    if (Number.isFinite(routeState?.lng) && Number.isFinite(routeState?.lat)) {
        return {
            center: [routeState.lng, routeState.lat],
            zoom: Number.isFinite(routeState.zoom) ? routeState.zoom : INITIAL_VIEW.zoom,
        };
    }
    return INITIAL_VIEW;
}

// --- 组件挂载后 ---
// [隶属] 地图初始化-启动流程
// [作用] 初始化地图、绑定视图同步、设置格网状态。
//        底图加载拥有绝对优先级，所有非关键初始化任务都延后到底图加载完成。
// [优先级链]
//   1. initMap() + bindMapViewSync() + setGraticuleActive() + syncUrlFromMap() - 同步初始化，不阻塞
//   2. 底图瓦片请求在后台自由发送，拥有绝对网络优先级（由 prioritizeTileSourceRequest 保证）
//   3. waitForCriticalTileReady() - 等待底图 rendercomplete 或 3s 超时
//   4. emit('map-core-ready') - 通知父组件地图核心就绪
//   5. applyDeferredUrlParams() - 延后到底图加载稳定后，避免打断瓦片加载
//   6. runDeferredStartupTasks() - 所有非关键任务（Google 测速、定位等）在最后执行
onMounted(async () => {
    componentUnmountedRef.value = false;

    // 重置模块级变量，防止组件重新挂载时残留旧引用（如路由切换场景）
    searchSource = null;
    searchLayer = null;
    busRouteLayerRef = null;
    drawLayerInstance = null;
    rightDragZoomController = null;
    rightDragZoomControllerRef.value = null;
    compassManagerRef = null;
    _cleanupMapEventHandlers = null;
    removeManagedLayerById = () => undefined;
    routeBuilderApiPromise = null;

    try {
        // 并行加载运行时 token 和管理员默认底图配置
        const [, defaultsRes] = await Promise.all([
            hydrateRuntimeMapTokens(),
            apiGetRuntimeDefaults().catch(() => null),
        ]);

        // ★ 读取管理员配置的全局默认底图索引
        // 仅在 URL 未显式指定 l= 参数时生效
        // 注意：parseUrlToState() 会用硬编码默认值填充 layerIndex，所以不能用它判断
        const urlParams = new URLSearchParams(window.location.search);
        const hasExplicitLayerParam = urlParams.has('l') || urlParams.has('layer');
        if (!hasExplicitLayerParam) {
            const serverIndex = defaultsRes?.data?.default_basemap_index;
            if (serverIndex != null) {
                const serverLayerId = getLayerIdByIndex(serverIndex);
                if (serverLayerId) selectedLayer.value = serverLayerId;
            }
        }

        // ========== Phase 1: 同步初始化 - 快速返回，让底图加载开始 ==========
        initMap(); // 创建地图实例，底图图层已添加
        bindActiveMapViewSync(); // 绑定视图同步（启动恢复期间会暂停 moveend 写回）
        setGraticuleActive(showDynamicSplitLines.value); // 设置格网（不阻塞）
        syncUrlFromActiveMap(); // 安全写回当前地图状态，避免覆盖待恢复的分享链接

        // ========== Phase 2: 等待底图渲染完成 ==========
        // 注意：此时底图瓦片请求已在后台发送，拥有高优先级（由 prioritizeTileSourceRequest 保证）
        // waitForCriticalTileReady() 是非阻塞的 - 等待 map rendercomplete 事件或 3s 超时
        try {
            await waitForCriticalTileReady();
        } catch {
            // 超时或异常时也继续后续流程，避免阻塞页面可交互性。
        }

        // ========== Phase 3: 通知父组件地图核心就绪 ==========
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

        // ========== Phase 3.1: 恢复持久化的卷帘状态 ==========
        // 如果 localStorage 中 swipeConfig.enabled 为 true，重新附加裁剪效果
        if (!componentUnmountedRef.value) {
            restoreSwipe();
        }

        // ========== Phase 4: 立即应用 URL 参数（移除人为延迟） ==========
        // 之前有短暂延迟以确保瓦片请求到达网络层，但为了保证底图请求
        // 立即触发，这里移除任意人为延迟，改为依赖 prioritizeTileSourceRequest
        // 来保证浏览器优先级。

        // ========== Phase 5: 应用延迟 URL 参数 ==========
        // [优先级] 底图加载完成后才应用 URL 参数
        // [目的] 确保 URL 参数应用不会与底图加载竞争网络资源
        // [注意] 仅在首次进入 home 路由时应用，后续参数变化由 URL 同步处理
        if (!componentUnmountedRef.value && !urlParamStore.isParamApplied) {
            applyDeferredUrlParams();
        }

        // ========== Phase 6: 执行所有非关键初始化任务 ==========
        // Google 主机测速、用户定位、IP 定位等都延后到这里
        // 使用 scheduleLowPriorityTask 确保在浏览器空闲时执行
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

// [隶属] 启动流程-后期初始化
// [作用] 在底图加载完成、URL 参数已应用后执行所有非关键任务。
//        这包括：Google 主机测速、用户定位、IP 定位等。
// [优先级] 这些任务不影响首屏交互性，可在浏览器空闲时执行。
// [并行策略] Google 主机测速与用户定位可并行执行（不相互依赖）
async function runDeferredStartupTasks() {
    if (componentUnmountedRef.value) return;

    const routeViewState = parseUrlToState();
    const isSharedEntry = parseSharedEntryFlagFromUrl();

    // ========== 分享或欢迎消息 ==========
    if (isSharedEntry) {
        const shareAddress = await resolveSharedAddressByLonLat(
            routeViewState?.lng,
            routeViewState?.lat,
        );
        message.success(`分享地点：${shareAddress || '地址解析失败，请稍后重试'}`, {
            duration: 3000,
        });
        message.soup(); //鸡汤问候
    } else {
        message.success(`欢迎使用NEGIAO的WebGIS!(${APP_DISPLAY_VERSION})`, { duration: 3000 });
    }

    // ========== 用户定位 ==========
    // 分享进入时静默定位且不跳转视图，仅用于更新定位上下文与 URL 参数。
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

// ========== Map Swipe Watcher ==========
// 监听swipeConfig变化：仅负责关闭时清理。
// 开启卷帘的绑定逻辑统一在 enableBasemapSwipe 中执行，避免与 watcher 互相覆盖。
watch(
    () => layerStore.swipeConfig.enabled,
    (enabled) => {
        if (enabled) {
            return;
        }

        detachSwipeFromLayers();
        clearSwipeCompareLayers();
        if (mapInstance.value) {
            mapInstance.value.render();
        }
    },
    { immediate: false },
);

// ========== 高清渲染开关联动 ==========
// 开关翻转后，已建 raster 底图 source 需重建以套用/解除 zDirection 设置。
// layerInstances 在地图初始化后才有内容，immediate:false 避免空重建。
watch(
    tileHDRendering,
    () => {
        if (!mapInstance.value) return;
        refreshAllBasemapSourcesForHD();
        mapInstance.value.render();
    },
    { immediate: false },
);

// ========== Update Map Container Rect ==========
// 使用 ResizeObserver 自动检测容器尺寸变化（包括侧边面板折叠/展开引起的 flex 布局变化）
let _resizeObserver = null;
watch(
    () => mapContainerRef.value,
    (el) => {
        // 清理旧的 observer
        if (_resizeObserver) {
            _resizeObserver.disconnect();
            _resizeObserver = null;
        }
        if (el) {
            mapContainerRect.value = el.getBoundingClientRect();
            _resizeObserver = new ResizeObserver(() => {
                // 必须用 getBoundingClientRect() 获取视口相对坐标（contentRect 的 top/left 是相对于元素自身，会导致句柄偏移）
                mapContainerRect.value = el.getBoundingClientRect();
                // 同步 OL 地图 canvas 尺寸，确保卷帘裁剪区域计算正确
                mapInstance.value?.updateSize?.();
            });
            _resizeObserver.observe(el);
        }
    },
    { immediate: true },
);

// [隶属] 组件卸载-资源清理
// [作用] 组件卸载时清理地图实例、事件监听、异步
// 任务等，避免内存泄漏和潜在错误。
onUnmounted(() => {
    componentUnmountedRef.value = true;
    // 清理 ResizeObserver
    if (_resizeObserver) {
        _resizeObserver.disconnect();
        _resizeObserver = null;
    }
    stopMapViewSync();
    stopGraticule();
    disposeSwipe();
    disposeDistrictManager();
    disposeInteractionPickers();
    compassManagerRef?.dispose?.();
    compassManagerRef = null;
    rightDragZoomController?.dispose?.();
    clearRouteStepStyleCache?.();
    rightDragZoomController = null;
    rightDragZoomControllerRef.value = null;
    // 清理 composable 暴露的资源句柄
    disposeAllMonitors?.();
    disposeSelectionWatcher?.();
    emitBaseLayersChangeBatched.cancel?.();
    cancelScheduledTasks?.();
    _cleanupMapEventHandlers?.();
    _cleanupMapEventHandlers = null;
    attrStore.setMapExtent(null);
    if (mapInstance.value) mapInstance.value.setTarget(null);
});

// [隶属] 外部数据导入-动作集接入
// [作用] 从 useLayerDataImport 注入上传入口与解析动作。
// [交互] addUserDataLayer 由 defineExpose 对外提供给父组件调用。
let routeBuilderApiPromise = null;

const {
    ensureLayerDataImportApi,
    ensureUserLayerActionsApi,
    setBaseLayerActive: setBaseLayerActiveDeferred,
    setLayerVisibility,
    zoomToUserLayer,
    viewUserLayer,
} = createDeferredUserLayerApis({
    mapInstanceRef: mapInstance,
    initialView: INITIAL_VIEW,
    drawSource,
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
    isRouteManagedLayer: ({ layerId, removed }) =>
        layerId === busRouteManagedLayerIdRef.value ||
        removed?.metadata?.category === 'bus-route' ||
        removed?.metadata?.category === 'drive-route' ||
        removed?.metadata?.category === 'route',
    onRouteManagedLayerRemoved: () => {
        busRouteManagedLayerIdRef.value = null;
        resetRouteStepStates();
        busRouteSource.clear();
    },
});
// 确保 transitRouteBuilder API 已加载并可用，支持动态导入和按需加载。
async function ensureRouteBuilderApi() {
    if (!routeBuilderApiPromise) {
        routeBuilderApiPromise = import('../../utils/transitRouteBuilder');
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
    applyStyleTemplate,
} = createUserLayerApiFacadeFeature({
    ensureLayerDataImportApi,
    ensureUserLayerActionsApi,
});

// 更新栅格值查询函数 ref（解决初始化顺序问题）
removeManagedLayerById = removeUserLayer;
queryRasterValueAtCoordinateRef.value = queryRasterValueAtCoordinate;

/**
 * 设置底图激活状态并立即触发实际图层切换。
 *
 * 包装 useUserLayerActions.setBaseLayerActive：先通过懒加载 API 设置 selectedLayer（预设 ID），
 * 再直接调用 switchLayerById 让 OL 立即切换瓦片图层，绕过 useBasemapSelectionWatcher 的
 * 300ms 防抖与熔断校验链路，确保 Cesium→OL 引擎切换时底图立即同步。
 * @param {string} layerId - 底图预设 ID（如 'imagery_google_preset'）
 * @returns {Promise<void>}
 */
async function setBaseLayerActive(layerId) {
    if (!layerId) return;
    await setBaseLayerActiveDeferred(layerId);
    if (selectedLayer.value !== layerId) {
        selectedLayer.value = layerId;
    }
    switchLayerById?.(layerId, {
        onUpdated: () => {
            emitBaseLayersChangeBatched?.();
            mapInstance.value?.updateSize?.();
        },
    });
}

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
        zIndex: Z_INDEX.DRAW,
    });
    const userLayer = new VectorLayer({
        source: userLocationSource,
        zIndex: Z_INDEX.USER_LOCATION,
        style: (feature) =>
            feature.get('type') === 'accuracy' ? styles.userAccuracy : styles.userPoint,
    });
    const busPickLayer = new VectorLayer({
        source: busPickSource,
        zIndex: Z_INDEX.BUS_PICK,
        style: (feature) =>
            feature.get('busPickType') === 'end' ? styles.busEnd : styles.busStart,
    });
    const busRouteLayer = new VectorLayer({
        source: busRouteSource,
        zIndex: Z_INDEX.BUS_ROUTE,
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
                const isActive =
                    activeBusStep >= 0 &&
                    (Array.isArray(stepIndices)
                        ? stepIndices.map((v) => Number(v)).includes(activeBusStep)
                        : activeBusStep === stepIndex);
                return getBusStepPointStyle(stepIndex, markerRole, isActive, stationName);
            }
            const segmentType = Number(feature.get('segmentType') ?? 0);
            const stepIndex = Number(feature.get('stepIndex') ?? 0);
            const activeBusStep = getCurrentBusStepIndex();
            const isActive = activeBusStep >= 0 && activeBusStep === stepIndex;
            return getBusStepStyle(stepIndex, segmentType === 1, isActive);
        },
    });
    busRouteLayerRef = busRouteLayer;

    // 搜索结果图层（点）
    searchSource = new VectorSource();
    searchLayer = new VectorLayer({
        source: searchSource,
        zIndex: Z_INDEX.SEARCH,
        style: createStyleFromConfig(SEARCH_RESULT_STYLE),
    });

    // 1.3 控件
    const controls = defaultControls({ zoom: false }).extend([
        // 鹰眼视图控件 - 使用天地图卫星影像作为底图（Google 不稳定已弃用）
        new OverviewMap({
            className: 'ol-overviewmap ol-custom-overviewmap',
            layers: [
                new TileLayer({
                    source: prioritizeTileSourceRequest(
                        new XYZ({
                            url: `https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`,
                            maxZoom: 20,
                        }),
                    ),
                }),
            ],
            collapseLabel: '«',
            label: '»',
            collapsed: false,
        }),
    ]);

    // 1.4 实例化地图（先清理旧实例防止泄漏）
    if (mapInstance.value) {
        try { mapInstance.value.setTarget(null); } catch { /* ignore */ }
    }
    const initialViewState = getInitialViewState();
    mapInstance.value = new Map({
        target: mapRef.value,
        layers: [
            ...layersToAdd,
            drawLayerInstance,
            userLayer,
            busRouteLayer,
            busPickLayer,
            searchLayer,
        ],
        view: new View({
            center: fromLonLat(initialViewState.center),
            zoom: initialViewState.zoom,
            minZoom: 0, // 允许缩放到最低级别
            maxZoom: 22,
        }),
        controls,
    });
    // 创建比例尺控件（通过 addControl 添加，避免与 defaultControls 冲突）
    const scaleline = new ScaleLine({
        units: 'metric',
        bar: true,
        minWidth: 100,
    });
    mapInstance.value.addControl(scaleline);

    currentZoom.value = Number(mapInstance.value.getView()?.getZoom?.() ?? initialViewState.zoom);

    compassManagerRef?.dispose?.();
    compassManagerRef = new CompassManager({
        map: mapInstance.value,
        store: compassStore,
        mapContainerElement: mapContainerRef.value,
    });
    void compassManagerRef.init();

    // 1.4.5 初始化坐标显示 - 从视图中心获取坐标，处理移动端初始化
    const initialCenter = mapInstance.value.getView().getCenter();
    const initialLonLat = toLonLat(initialCenter);
    currentCoordinate.value = { lng: initialLonLat[0], lat: initialLonLat[1] };

    // 1.5 初始化右拖缩放控制器
    rightDragZoomController?.dispose?.();
    rightDragZoomController = createRightDragZoomController(mapInstance.value);
    rightDragZoomControllerRef.value = rightDragZoomController;

    // 1.6 事件监听（返回清理函数用于卸载时移除 viewport 监听器）
    _cleanupMapEventHandlers = bindMapEvents();
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

// ========== 交互选点功能已移至 createMapInteractionPickers composable ==========

async function startReverseGeocodePickAndDraw() {
    const picked = await startReverseGeocodePick();
    if (!picked || !Number.isFinite(picked.lng) || !Number.isFinite(picked.lat)) {
        throw new Error('逆地理编码选点失败，请重试');
    }

    // 长时间等待用户点击后，地图可能已卸载
    if (!mapInstance.value) {
        throw new Error('地图已卸载');
    }

    let reverseResult = null;
    try {
        const reverseResponse = await apiReverseGeocodeWithFallback(picked.lng, picked.lat, {
            tiandituTk: tiandituTk.value, // 读取响应式 ref，确保 token 轮换后使用最新值
            silent: true,
        });
        reverseResult = reverseResponse?.data || null;
    } catch {
        reverseResult = null;
    }

    const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
    const layerName =
        formattedAddress || `逆编码点_${picked.lng.toFixed(6)}_${picked.lat.toFixed(6)}`;
    const businessAreaText = Array.isArray(reverseResult?.businessAreas)
        ? reverseResult.businessAreas
            .map((item) => String(item?.name || '').trim())
            .filter(Boolean)
            .join('、')
        : '';

    // 高德 API 需要 GCJ-02 坐标，将地图拾取的 WGS-84 转为 GCJ-02 再存储
    const [gcjLng, gcjLat] = wgs84ToGcj02(picked.lng, picked.lat);
    drawPointByCoordinatesInput({
        lng: gcjLng,
        lat: gcjLat,
        crsType: 'gcj02',
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
            逆地理编码服务: String(reverseResult?.provider || '').trim() || 'unknown',
        },
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
        .filter((item) => item.sourceType === 'draw')
        .forEach((item) => {
            item.styleConfig = mergeStyleConfig(item.styleConfig, styleCfg);
            // 样式配置变化时清空标签缓存
            item.labelStyleCache = new globalThis.Map();
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
    if (drawExtent && drawExtent.every((v) => Number.isFinite(v))) {
        extendExtent(unionExtent, drawExtent);
    }

    userDataLayers.forEach((item) => {
        const ext = item.layer.getSource()?.getExtent();
        if (ext && ext.every((v) => Number.isFinite(v))) {
            extendExtent(unionExtent, ext);
        }
    });

    if (isExtentEmpty(unionExtent)) return;

    mapInstance.value.getView().fit(unionExtent, {
        padding: [80, 80, 80, 80],
        duration: 900,
        maxZoom: 18,
    });
}

// --- 交互工具 (Draw/Measure) ---
// [隶属] 组件交互-绘图与测量
// [作用] 根据工具类型激活绘图、测量、清理、属性查询等交互。
// [交互] 对外 emit(feature-selected/graphics-overview) 并被父组件工具箱调用。
function activateInteraction(type) {
    clearDrawMeasureInteractions();
    if (!mapInstance.value) return;

    // 切换到非选点交互时，退出选点模式
    if (type !== 'ReverseGeocodePick') {
        isReverseGeocodePickMode.value = false;
    }

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
        // Toggle：已在选点模式 → 取消当前选点并退出
        if (isReverseGeocodePickMode.value) {
            isReverseGeocodePickMode.value = false;
            if (pendingReverseGeocodePickRef.value?.reject) {
                pendingReverseGeocodePickRef.value.reject(new Error('逆地理编码选点已取消'));
                pendingReverseGeocodePickRef.value = null;
            }
            message.info('已退出标注模式');
            return;
        }

        isReverseGeocodePickMode.value = true;
        try {
            message.info('请在地图上单击一个点，系统将自动逆地理编码并绘制。', {
                closable: true,
                duration: 4500,
            });
            startReverseGeocodePickAndDraw()
                .catch((error) => {
                    const detail = error instanceof Error ? error.message : '未知错误';
                    // 静默忽略：用户主动取消、地图已卸载、地图未初始化
                    if (/(取消|cancel|地图已卸载|地图尚未初始化)/i.test(detail)) return;
                    message.warning(`逆地理编码选点未完成：${detail}`);
                })
                .finally(() => {
                    isReverseGeocodePickMode.value = false;
                });
        } catch {
            isReverseGeocodePickMode.value = false;
        }
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
            上传图层名称: userDataLayers.map((item) => item.name).join('、') || '无',
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

// ========== 行政区划管理 (via composable) ==========
const {
    focusDistrictByAdcode,
    setDistrictLayerVisibility,
    removeDistrictLayer,
    disposeDistrictManager,
} = createDistrictManagerFeature({
    mapInstance,
    tocStore,
    userDataLayers,
    emitUserLayersChange,
    emitGraphicsOverview,
    serializeManagedFeatures,
});

// [隶属] 组件交互-绘图与测量
// [作用] 清理当前激活的绘图/捕捉交互和提示覆盖物。
// [交互] 被 activateInteraction 与外部调用复用。
function clearInteractions() {
    clearDrawMeasureInteractions();
}

// 初始化图层导出服务并包装为适配本组件的调用方式
const exporterFn = createLayerExporter({ message, gcj02ToWgs84, wgs84ToGcj02 });
const exportLayerCoordinates = (payload) => {
    exporterFn(payload, { userDataLayers });
};

// [隶属] 组件交互-对外能力暴露
// [作用] 向父组件公开地图核心动作（导入、绘制、路线、图层管理等）。
// [交互] HomeView 等父组件通过 ref 调用这些方法。
/**
 * 获取当前地图视图的可视范围（BBox）
 * @returns {{ minLon: number, minLat: number, maxLon: number, maxLat: number } | null}
 */
function getMapExtent() {
    if (!mapInstance.value) return null;
    const view = mapInstance.value.getView();
    const extent = view.calculateExtent(mapInstance.value.getSize());
    if (!extent || extent.length < 4) return null;
    const [minLon, minLat] = toLonLat([extent[0], extent[1]]);
    const [maxLon, maxLat] = toLonLat([extent[2], extent[3]]);
    return {
        minLon: Math.min(minLon, maxLon),
        minLat: Math.min(minLat, maxLat),
        maxLon: Math.max(minLon, maxLon),
        maxLat: Math.max(minLat, maxLat),
    };
}

defineExpose({
    mapInstance,
    isReverseGeocodePickMode,
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
    exportLayerCoordinates,
    enableBasemapSwipe,
    runSpatialAnalysis,
    getMapExtent,
    getCurrentViewState,
    syncViewFromCesium,
    getMapSize,
    getOlView,
    setCustomBasemapByUrl,
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
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1210;
    pointer-events: none;
    display: grid;
    place-items: center;
    width: max-content;
    height: max-content;
    padding: clamp(6px, 1.2vw, 12px);
    border-radius: 999px;
    /* 渐变背景由 --compass-bg 变量驱动，fallback 为黑色 */
    background:
        radial-gradient(circle at 50% 50%,
            var(--compass-bg-g1, rgba(0, 0, 0, 0.45)),
            var(--compass-bg-g2, rgba(0, 0, 0, 0.25)) 30%,
            var(--compass-bg-g3, rgba(0, 0, 0, 0.10)) 60%,
            transparent 100%);
    filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.26));
    overflow: visible;
    will-change: transform;
}

.compass-hud-wrapper :deep(.feng-shui-compass-svg),
.compass-hud-wrapper :deep(.feng-shui-compass-svg svg) {
    display: block;
    flex: 0 0 auto;
    overflow: visible;
}

.map-container.compass-placement-mode :deep(#map),
.map-container.compass-placement-mode #map {
    cursor: crosshair;
}

.map-container.reverse-geocode-pick-mode :deep(#map),
.map-container.reverse-geocode-pick-mode #map {
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

/* 鹰眼视图样式 */
:deep(.ol-custom-overviewmap) {
    position: absolute;
    left: 5px;
    top: 5px;
    right: auto;
    bottom: auto;
}

:deep(.ol-custom-overviewmap:not(.ol-collapsed)) {
    border: 2px solid rgba(var(--brand-primary-rgb), 0.729);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.9);
}

:deep(.ol-custom-overviewmap .ol-overviewmap-map) {
    border: none;
    width: 200px;
    height: 200px;
}

:deep(.ol-custom-overviewmap .ol-overviewmap-box) {
    border: 2px solid var(--brand-accent);
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
    .compass-hud-wrapper {
        padding: 6px;
    }

    :deep(.ol-custom-overviewmap .ol-overviewmap-map) {
        width: 120px;
        height: 120px;
    }

    :deep(.ol-custom-overviewmap) {
        left: 5px;
        top: 5px;
    }
}
</style>
