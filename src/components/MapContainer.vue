<template>
    <div id="map-container" class="map-container" ref="mapContainerRef">
        <div id="map" ref="mapRef"></div>

        <MapEasterEgg
            :map-instance="mapInstance"
            :bounds="DIHUAN_BOUNDS"
            :images="IMAGES"
            @open-large-image="handleEasterEggImageOpen"
            @location-change="handleEasterEggLocationChange"
        />

        <LayerControlPanel
            :map-instance="mapInstance"
            :layer-list="layerList"
            :selected-layer="selectedLayer"
            :custom-map-url="customMapUrl"
            :active-graticule="showDynamicSplitLines"
            :amap-key="AMAP_WEB_SERVICE_KEY"
            :tianditu-tk="TIANDITU_TK"
            :is-domestic="isDomestic"
            @change-layer="handleLayerChange"
            @update-order="handleLayerOrderUpdate"
            @toggle-graticule="handleToggleGraticule"
            @search-jump="handleSearchJump"
            @layer-context-action="handleLayerContextAction"
        />

        <AttributeTable
            @focus-feature="handleAttributeTableFocusFeature"
            @highlight-feature="handleAttributeTableHighlightFeature"
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
import { useManagedLayerRegistry } from '../composables/useManagedLayerRegistry';
import { useUserLocation } from '../composables/useUserLocation';
import { useMessage } from '../composables/useMessage';
import { useMapState } from '../composables/useMapState';
import { createRightDragZoomController } from '../composables/map/features/useRightDragZoom';
import { useLayerContextMenuActions } from '../composables/map/features/useLayerContextMenuActions';
import { createBasemapResilience } from '../composables/map/features/useBasemapResilience';
import { createManagedLayerStyleFeature } from '../composables/map/features/useManagedLayerStyle';
import { createRouteStepStyles } from '../composables/map/features/useRouteStepStyles';
import { createRouteStepInteraction } from '../composables/map/features/useRouteStepInteraction';
import { createManagedFeatureSerializationFeature } from '../composables/map/features/useManagedFeatureSerialization';
import { createStartupTaskSchedulerFeature } from '../composables/map/features/useStartupTaskScheduler';
import { createBasemapUrlMappingFeature } from '../composables/map/features/useBasemapUrlMapping';
import { createCoordinateSystemConversionFeature } from '../composables/map/features/useCoordinateSystemConversion';
import { createMapSearchAndCoordinateInputFeature } from '../composables/map/features/useMapSearchAndCoordinateInput';
import { createManagedFeatureHighlightFeature } from '../composables/map/features/useManagedFeatureHighlight';
import { createDrawMeasureFeature } from '../composables/map/features/useDrawMeasure';
import { createRouteRenderingFeature } from '../composables/map/features/useRouteRendering';
import { createLayerMetadataNormalizationFeature } from '../composables/map/features/useLayerMetadataNormalization';
import { createUserLayerApiFacadeFeature } from '../composables/map/features/useUserLayerApiFacade';
import { createBasemapStateManagementFeature } from '../composables/map/features/useBasemapStateManagement';
import { createManagedFeatureOperationsFeature } from '../composables/map/features/useManagedFeatureOperations';
import { 
    URL_LAYER_OPTIONS,
    activeGoogleTileHost as globalActiveGoogleTileHost,
    resolvePreferredGoogleHost,
    createLayerConfigs,
    resolvePresetLayerIds,
    getBasemapOptionLabel,
    getLayerCategory as getLayerCategoryById,
    getLayerGroup as getLayerGroupById
} from '../constants/useBasemapManager';
import { createAutoTileSourceFromUrl } from '../composables/useTileSourceFactory';
import LayerControlPanel from './LayerControlPanel.vue';
import MapEasterEgg from './MapEasterEgg.vue';
import MapControlsBar from './MapControlsBar.vue';
import AttributeTable from './AttributeTable.vue';
import { useAttrStore } from '../stores/useAttrStore';

const message = useMessage();
const attrStore = useAttrStore();

// ========== 底图管理 Composable ==========
// 集中管理底图配置、底图选项列表、Google 主机选择等逻辑
// URL_LAYER_OPTIONS：用于 URL 参数中的图层索引映射（与 BASEMAP_OPTIONS 对应）
// createLayerConfigs：工厂函数，根据参数生成全部底图源配置
// 使用全局共享的 Google 主机 ref，支持主机切换后的动态更新
const activeGoogleTileHost = globalActiveGoogleTileHost;

// OpenLayers 核心库
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Overlay from 'ol/Overlay';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls, ScaleLine, OverviewMap } from 'ol/control';
import { unByKey } from 'ol/Observable';
import { getArea, getLength } from 'ol/sphere';
import { createEmpty, extend as extendExtent, isEmpty as isExtentEmpty, getCenter as getExtentCenter } from 'ol/extent';

// 图层与数据源
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';

// 几何与交互
import Point from 'ol/geom/Point';
import { Polygon } from 'ol/geom';
import { Draw, Snap } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../utils/coordTransform';
import { 
    createLayerExporter,
    isVectorManagedLayer 
} from '../utils/layerExportService';

// --- 配置常量 ---
const BASE_URL = import.meta.env.BASE_URL || '/';
const NORM_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const INITIAL_VIEW = { center: [114.302, 34.8146], zoom: 17 }; //初始位置
const AMAP_WEB_SERVICE_KEY = '3e6d96476b807126acbc59384aa13e51'; //高德 Web 服务 Key
const CRITICAL_TILE_READY_TIMEOUT_MS = 3000; // 首屏关键瓦片加载超时时间（毫秒）

// 天地图 Token：优先使用环境变量，否则使用默认值
// 生产环境建议在 .env 文件中配置 VITE_TIANDITU_TK
const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';

//彩蛋：判断鼠标是否进入地环院，弹出地环院的图片信息
const DIHUAN_BOUNDS = { minLon: 114.3020, maxLon: 114.3030, minLat: 34.8149, maxLat: 34.8154 };
const IMAGES = [
    '地理与环境学院标志牌.webp', '地理与环境学院入口.webp', '地学楼.webp',
    '教育部重点实验室.webp', '四楼逃生图.webp', '学院楼单侧.webp'
].map(img => `${NORM_BASE}images/${img}`);

// --- Refs ---
const mapRef = ref(null);
const mapInstance = shallowRef(null); // 使用 shallowRef 优化性能

// ========== 默认底图配置 ==========
// 当前选中的底图 ID，默认为 'google'（对应图层索引 l=3）
// 与 useMapState 中的 parseUrlToState 默认值保持一致
const selectedLayer = ref('google');
const customMapUrl = ref('');
const showDynamicSplitLines = ref(false);
const currentZoom = ref(17); // 当前缩放级别
const currentCoordinate = ref(null);

// 底图切换状态标志（用于防止自动切换时重复验证）
let isAutoSwitchingLayer = false;

const isDomestic = ref(true); // 是否为国内用户（基于 IP 判断）

let searchSource, searchLayer;
let customSource = null;
const SEARCH_RESULT_STYLE = {
    fillColor: '#ef4444',
    fillOpacity: 0.9,
    strokeColor: '#ffffff',
    strokeWidth: 2,
    pointRadius: 8
};

// ========== 图层配置初始化 ==========
// 使用 composable 提供的工厂函数而不是直接定义 LAYER_CONFIGS
const LAYER_CONFIGS = createLayerConfigs(NORM_BASE, TIANDITU_TK);

// 初始化图层列表状态 (从配置生成)
const layerList = ref(LAYER_CONFIGS.map(cfg => ({ 
    id: cfg.id, 
    name: cfg.name, 
    visible: cfg.visible 
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

// --- 全局变量 (非响应式) ---
const componentUnmountedRef = ref(false);
let pendingBusPick = null;
let busRouteLayerRef = null;
const busRouteManagedLayerIdRef = ref(null);
let rightDragZoomController = null;

// 图层引用
let baseLayer, labelLayer;
const drawSource = new VectorSource();
const userLocationSource = new VectorSource();
const busPickSource = new VectorSource();
const busRouteSource = new VectorSource();

// 子组件向父组件回传事件接口定义
const emit = defineEmits([
    'location-change',
    'coordinate-jump',
    'update-news-image',
    'feature-selected',
    'user-layers-change',
    'graphics-overview',
    'base-layers-change',
    'upload-progress-change'
]);

const {
    isCoordinateInChina,
    detectIPLocale,
    getCurrentLocation,
    zoomToUser,
    updateUserPosition
} = useUserLocation({
    mapInstance,
    userLocationSource,
    isDomestic
});

function handleEasterEggImageOpen(src) {
    emit('update-news-image', src);
}

function handleEasterEggLocationChange(payload) {
    emit('location-change', payload);
}

function syncAttributeTableMapExtent() {
    const map = mapInstance.value;
    if (!map) return;

    const size = map.getSize?.();
    if (!Array.isArray(size) || size.length < 2) return;

    const extent = map.getView()?.calculateExtent?.(size);
    attrStore.setMapExtent(Array.isArray(extent) ? extent : null);
}

function handleAttributeTableFocusFeature(payload) {
    if (!payload?.layerId || !payload?.featureId) return;
    highlightManagedFeature(payload);
    zoomToManagedFeature(payload);
}

function handleAttributeTableHighlightFeature(payload) {
    if (!payload?.layerId || !payload?.featureId) return;
    highlightManagedFeature(payload);
}

const isAttributeQueryEnabled = ref(true);
const userDataLayers = [];
let drawLayerInstance = null;
let tooltipRef = {
    helpTooltipEl: null,
    helpTooltipOverlay: null
};

const STYLE_TEMPLATES = {
    classic: {
        fillColor: '#5fbf7a',
        fillOpacity: 0.24,
        strokeColor: '#2f7d3c',
        strokeWidth: 2,
        pointRadius: 6
    },
    warning: {
        fillColor: '#f59e0b',
        fillOpacity: 0.2,
        strokeColor: '#b45309',
        strokeWidth: 2.5,
        pointRadius: 6
    },
    water: {
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        strokeColor: '#1d4ed8',
        strokeWidth: 2,
        pointRadius: 6
    },
    magenta: {
        fillColor: '#ec4899',
        fillOpacity: 0.18,
        strokeColor: '#be185d',
        strokeWidth: 2,
        pointRadius: 6
    }
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

const {
    handleSearchJump,
    drawPointByCoordinatesInput
} = createMapSearchAndCoordinateInputFeature({
    message,
    mapInstanceRef: mapInstance,
    createManagedVectorLayer,
    gcj02ToWgs84,
    searchResultStyle: SEARCH_RESULT_STYLE
});

const {
    createManagedFeatureHighlightStyle,
    clearManagedFeatureHighlight,
    highlightManagedFeature,
    getCurrentHighlightedFeature,
    setCurrentHighlightedFeature
} = createManagedFeatureHighlightFeature({
    findManagedFeature: (layerId, featureId) => {
        const layer = layerMap.get(layerId);
        if (!layer || !layer.getSource) return null;
        const source = layer.getSource();
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

// --- 样式定义 ---
// 公交和驾车路线样式使用函数生成并缓存，支持基于步骤索引的颜色区分和高亮状态；其他样式使用固定实例。
const styles = {
    draw: new Style({
        fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
        stroke: new Stroke({ color: '#ffcc33', width: 2 }),
        image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#ffcc33' }) }),
    }),
    userPoint: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#1E90FF' }), stroke: new Stroke({ color: '#fff', width: 2 }) })
    }),
    userAccuracy: new Style({
        fill: new Fill({ color: 'rgba(30,144,255,0.12)' }),
        stroke: new Stroke({ color: 'rgba(30,144,255,0.3)', width: 1 })
    }),
    busStart: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#22c55e' }), stroke: new Stroke({ color: '#fff', width: 2 }) })
    }),
    busEnd: new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#ef4444' }), stroke: new Stroke({ color: '#fff', width: 2 }) })
    }),
    busRouteTransit: new Style({
        stroke: new Stroke({ color: '#2563eb', width: 4, lineCap: 'round', lineJoin: 'round' })
    }),
    busRouteWalk: new Style({
        stroke: new Stroke({ color: '#6b7280', width: 3, lineDash: [8, 6], lineCap: 'round', lineJoin: 'round' })
    }),
    driveRoute: new Style({
        stroke: new Stroke({ color: 'rgba(34, 197, 94, 0.8)', width: 6, lineCap: 'round', lineJoin: 'round' })
    })
};

// [隶属] 底图状态管理
// [作用] 提供与 URL 同步、图层切换、图层实例管理等相关的核心逻辑。
// 通过 useMapState Composable 集中管理地图状态相关逻辑，保持组件代码整洁。
const {
    parseUrlToState,
    flyToView,
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

// --- URL 参数初始化 ---
const initialUrlState = parseUrlToState();
const initialLayerId = getLayerIdByIndex(initialUrlState?.layerIndex);
if (initialLayerId) {
    selectedLayer.value = initialLayerId;
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
    initMap();
    bindMapViewSync();
    setGraticuleActive(showDynamicSplitLines.value);
    syncUrlFromMap();

    // 首屏优先：先让关键瓦片尽快加载，非关键任务延后到首次渲染后再执行。
    await waitForCriticalTileReady();
    scheduleLowPriorityTask(() => {
        runDeferredStartupTasks().catch(() => {});
    });

});

// [隶属] 启动流程-首屏优化
// [作用] 在首屏完成后执行非关键任务（主机测速、定位兜底）。
// [交互] 调用 resolvePreferredGoogleHost / getCurrentLocation / detectIPLocale。
async function runDeferredStartupTasks() {
    if (componentUnmountedRef.value) return;

    const routeViewState = parseUrlToState();
    if (Number.isFinite(routeViewState?.lng) && Number.isFinite(routeViewState?.lat)) {
        message.success(`欢迎来到NEGIAO分享的地点${routeViewState.lng.toFixed(6)},${routeViewState.lat.toFixed(6)}，正在加载地图...`, { duration: 2000 });
        message.soup();
        return;
    }

    // 1) Google 主机测速切换（非关键，延后执行）。
    resolvePreferredGoogleHost().then((host) => {
        if (componentUnmountedRef.value) return;
        if (!host || host === activeGoogleTileHost.value) return;
        activeGoogleTileHost.value = host;
        refreshGoogleLayerSources();
    }).catch(() => {});

    // 2) 位置相关逻辑（非关键，延后执行）。
    // 优先使用浏览器真实定位；IP 仅用于国内外判定兜底，不再用于地图中心定位。
    if (navigator.geolocation) {
        try {
            const pos = await getCurrentLocation(true);
            if (componentUnmountedRef.value) return;
            updateUserPosition(pos, true);

            // 有真实坐标时，可直接基于坐标更新国内外判定，避免依赖第三方 IP 误差。
            isDomestic.value = isCoordinateInChina(pos.lon, pos.lat);
            return;
        } catch (e) {
            // 定位失败后再使用 IP 做兜底判定。
        }
    }

    await detectIPLocale();
}


// [隶属] 组件卸载-资源清理
// [作用] 组件卸载时清理地图实例、事件监听、异步
// 任务等，避免内存泄漏和潜在错误。
onUnmounted(() => {
    componentUnmountedRef.value = true;
    stopMapViewSync();
    stopGraticule();
    rightDragZoomController?.dispose?.();
    clearRouteStepStyleCache?.();
    rightDragZoomController = null;
    attrStore.setMapExtent(null);
    if (pendingBusPick?.reject) {
        pendingBusPick.reject(new Error('地图已卸载'));
        pendingBusPick = null;
    }
    if (mapInstance.value) mapInstance.value.setTarget(null);
});

// [隶属] 图层管理-托管图层创建
// [作用] 将矢量要素创建为托管图层并登记到 userDataLayers。
// [交互] 调用 emitUserLayersChange / emitGraphicsOverview，与外部面板同步。
function createManagedVectorLayer({
    name,
    type,
    sourceType,
    features,
    styleConfig,
    autoLabel = false,
    metadata = null,
    fitView = false
}) {
    if (!mapInstance.value || !features?.length) return null;

    const normalizedStyle = normalizeStyleConfig(styleConfig || STYLE_TEMPLATES.classic);
    const labelVisible = !!autoLabel;
    const normalizedMetadata = normalizeLayerMetadata(metadata, features);
    const managedLayerState = {
        name,
        autoLabel: !!autoLabel,
        labelVisible,
        metadata: normalizedMetadata,
        styleConfig: normalizedStyle,
        labelStyleCache: new globalThis.Map()
    };
    const layer = new VectorLayer({
        source: new VectorSource({ features }),
        zIndex: 120,
        style: buildManagedLayerStyle(managedLayerState),
        properties: { name }
    });

    const serializedFeatures = serializeManagedFeatures(features, name);
    features.forEach((feature, index) => ensureFeatureId(feature, name, index));

    mapInstance.value.addLayer(layer);

    const id = createManagedLayerId();
    userDataLayers.push({
        id,
        name,
        type,
        sourceType,
        order: userDataLayers.length,
        visible: true,
        opacity: 1,
        featureCount: features.length,
        features: serializedFeatures,
        autoLabel: managedLayerState.autoLabel,
        labelVisible,
        metadata: normalizedMetadata,
        styleConfig: normalizedStyle,
        labelStyleCache: managedLayerState.labelStyleCache,
        layer
    });

    refreshUserLayerZIndex();
    emitUserLayersChange();
    emitGraphicsOverview();

    if (fitView) {
        mapInstance.value.getView().fit(layer.getSource().getExtent(), {
            padding: [50, 50, 50, 50],
            duration: 1000
        });
    }

    return id;
}

// [隶属] 外部数据导入-动作集接入
// [作用] 从 useLayerDataImport 注入上传入口与解析动作。
// [交互] addUserDataLayer 由 defineExpose 对外提供给父组件调用。
let layerDataImportApiPromise = null;
let userLayerActionsApiPromise = null;
let routeBuilderApiPromise = null;

// 确保 useLayerDataImport API 已加载并可用，支持动态导入和按需加载。
async function ensureLayerDataImportApi() {
    if (!layerDataImportApiPromise) {
        layerDataImportApiPromise = import('../composables/useLayerDataImport').then(({ useLayerDataImport }) => (
            useLayerDataImport({
                mapInstance,
                initialView: INITIAL_VIEW,
                userDataLayers,
                addManagedLayerRecord,
                createManagedVectorLayer,
                styleTemplates: STYLE_TEMPLATES,
                onImportProgress: (payload) => emit('upload-progress-change', payload)
            })
        ));
    }
    return layerDataImportApiPromise;
}

// 确保 useUserLayerActions API 已加载并可用，支持动态导入和按需加载。
async function ensureUserLayerActionsApi() {
    if (!userLayerActionsApiPromise) {
        userLayerActionsApiPromise = Promise.all([
            import('../composables/useUserLayerActions'),
            ensureLayerDataImportApi()
        ]).then(([actionsMod, dataImportApi]) => actionsMod.useUserLayerActions({
            mapInstance,
            userDataLayers,
            refreshUserLayerZIndex,
            emitUserLayersChange,
            emitGraphicsOverview,
            mergeStyleConfig,
            applyManagedLayerStyle,
            styleTemplates: STYLE_TEMPLATES,
            setDrawStyle,
            layerList,
            selectedLayer,
            getLayerCategory,
            refreshLayersState,
            projectExtentToMapView: dataImportApi.projectExtentToMapView,
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
        }));
    }
    return userLayerActionsApiPromise;
}
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

async function setBaseLayerActive(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setBaseLayerActive(...args);
}

async function setLayerVisibility(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setLayerVisibility(...args);
}

async function zoomToUserLayer(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.zoomToUserLayer(...args);
}

async function viewUserLayer(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.viewUserLayer(...args);
}

// --- 1. 地图核心逻辑 ---
// [隶属] 图层切换-地图初始化
// [作用] 初始化地图实例、底图层、业务图层与控件。
// [交互] 触发 bindEvents，并在 watch(selectedLayer) 中联动底图切换。
function initMap() {
    // 1.1 源定义与图层初始化 (由 LAYER_CONFIGS 动态驱动，不再硬编码 sources 对象)
    
    // 初始化所有底图层
    layerList.value.forEach((item, index) => {
        // 根据 id 查找配置并创建 source
        const config = LAYER_CONFIGS.find(cfg => cfg.id === item.id);
        // 首屏优先：仅为当前可见图层创建 source，其他图层按需懒创建。
        const source = (config && item.visible) ? config.createSource() : null;

        const layer = new TileLayer({
            source: source,
            visible: item.visible,
            zIndex: index // 初始层级通过列表顺序决定（0最底层）
        });

    // 为可见的图层启用智能兜底监控（仅默认底图自动切换，其他底图仅提醒）
    if (item.visible && source) {
        const isDefaultBaseLayer = item.id === 'google'; // 默认底图判断
        monitorLayerTimeout(layer, item.id, isDefaultBaseLayer, {
            onTimeout: () => {
                if (isDefaultBaseLayer) {
                    message.warning(`${item.id}响应过慢，正在切换备用底图...`);
                } else {
                    message.warning(`${item.id}响应过慢，建议手动切换底图。`);
                }
            },
            onError: () => {
                if (isDefaultBaseLayer) {
                    message.error(`${item.id}服务异常，正在切换备用底图...`);
                } else {
                    message.error(`${item.id}服务异常，建议手动切换底图。`);
                }
            },
            onSuccess: () => {
                    if (isDefaultBaseLayer) {
                        message.success(`${item.id}加载成功。`)
                    }
                },
            onLayerSwitchRequired: (nextOption, reason) => {
                // 仅默认底图会触发此回调
                selectedLayer.value = nextOption;
                message.info(`已切换至${nextOption}底图（${reason}）`);
            }
        });
    }

    layerInstances[item.id] = layer;
    });

    const layersToAdd = layerList.value.map(item => layerInstances[item.id]);

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
        new ScaleLine({ 
            units: 'metric',
            bar: true, 
            minWidth: 100 ,
            // className: 'ol-scaleline main-scale'//绑定类名，控制css
        }),

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

    currentZoom.value = Number(mapInstance.value.getView()?.getZoom?.() ?? initialViewState.zoom);

    // 1.4.5 初始化坐标显示 - 从视图中心获取坐标，处理移动端初始化
    const initialCenter = mapInstance.value.getView().getCenter();
    const initialLonLat = toLonLat(initialCenter);
    currentCoordinate.value = { lng: initialLonLat[0], lat: initialLonLat[1] };

    // 1.5 事件监听
    bindEvents();

    // 1.6 监听底图切换 并验证切换结果（默认底图异常时自动兜底）
    watch(selectedLayer, async (val, prevVal) => {
        const activeStack = resolvePresetLayerIds(val);

        switchLayerById(val, {
            onUpdated: () => {
                emitBaseLayersChange();
                // 当进行降级切换时，强制刷新地图以确保瓦片正确加载
                if (isAutoSwitchingLayer && mapInstance.value) {
                    // 清空前一个底图的瓦片缓存
                    if (prevVal && layerInstances[prevVal]) {
                        const source = layerInstances[prevVal].getSource?.();
                        if (source && typeof source.clear === 'function') {
                            source.clear();
                        }
                    }
                    // 给新图层一点时间初始化，然后刷新地图
                    setTimeout(() => {
                        if (mapInstance.value && typeof mapInstance.value.updateSize === 'function') {
                            mapInstance.value.updateSize();
                        }
                    }, 50);
                }
            }
        });
        
        // 仅在真正切换时（prevVal不为undefined）进行验证
        if (prevVal !== undefined) {
            syncUrlFromMap();
            
            // 如果正在自动切换，则跳过验证，直接完成切换
            if (isAutoSwitchingLayer) {
                isAutoSwitchingLayer = false;
                return;
            }
            
            // 获取切换后的底图图层实例
            const switchedLayer = layerInstances[val];
            if (switchedLayer) {
                // 验证新底图的加载状态
                const result = await validateBaseLayerSwitch(val, switchedLayer, 3000);
                
                if (result.success) {
                    const optionLabel = getBasemapOptionLabel(val);
                    if (activeStack.length > 1) {
                        message.success(`已切换到${optionLabel}组合（${activeStack.join(' + ')}）`);
                    } else {
                        message.success(`已成功切换到${optionLabel}底图`);
                    }
                } else {
                    // 检查是否为默认底图（google）
                    const isDefaultBaseLayer = val === 'google';
                    
                    if (isDefaultBaseLayer) {
                        // 默认底图异常时，自动切换到兜底选项
                        message.error(`${val}底图加载失败（${result.reason}），正在自动切换备用底图...`);
                        
                        // 创建兜底管理器获取下一个选项
                        const fallbackManager = createBaseLayerFallbackManager(val, true);
                        const nextFallbackOption = fallbackManager.getNextFallbackOption();
                        
                        if (nextFallbackOption) {
                            // 标记正在自动切换，防止无限递归
                            isAutoSwitchingLayer = true;
                            selectedLayer.value = nextFallbackOption;
                            message.info(`已自动切换至${nextFallbackOption}底图`);
                        } else {
                            message.error('所有兜底底图均不可用，请检查网络或重新选择底图');
                        }
                    } else {
                        // 非默认底图仅提示用户，不自动切换
                        message.warning(`切换到${val}底图失败：${result.reason}，请重新选择底图`);
                    }
                }
            }
        }
    }, { immediate: true });

    // 1.7 初始化时也要刷新一次图层状态，确保初始配置正确应用
    refreshLayersState();
    emitUserLayersChange();
    syncAttributeTableMapExtent();
}

// [隶属] 图层切换-底图状态刷新
// [作用] 将 layerList 的可见性与顺序同步到真实图层。
// [交互] 调用 emitBaseLayersChange，与外部组件同步状态。
function refreshLayersState() {
    refreshLayerInstances();
    emitBaseLayersChange();
}

// [隶属] 图层切换-控制面板事件
// [作用] 统一接收 LayerControlPanel 的图层切换与自定义 URL 加载。
// [交互] 触发 selectedLayer 更新、loadCustomMap 与 refreshLayersState。
function handleLayerChange(payload = {}) {
    const nextLayerId = String(payload.layerId || '').trim();
    if (nextLayerId) {
        selectedLayer.value = nextLayerId;
    }

    if (payload.source === 'custom-url') {
        customMapUrl.value = String(payload.customUrl || '').trim();
        if (customMapUrl.value) {
            void loadCustomMap();
        }
    }
}

// [隶属] 图层切换-控制面板事件
// [作用] 处理图层排序与可见性更新。
// [交互] 由 LayerControlPanel 的 update-order 事件触发。
function handleLayerOrderUpdate(payload = {}) {
    if (payload.type === 'reorder') {
        const dragIndex = Number(payload.dragIndex);
        const dropIndex = Number(payload.dropIndex);
        if (!Number.isInteger(dragIndex) || !Number.isInteger(dropIndex)) return;
        if (dragIndex < 0 || dropIndex < 0) return;
        if (dragIndex >= layerList.value.length || dropIndex >= layerList.value.length) return;
        if (dragIndex === dropIndex) return;

        const moved = layerList.value.splice(dragIndex, 1)[0];
        layerList.value.splice(dropIndex, 0, moved);
        refreshLayersState();
        return;
    }

    if (payload.type === 'visibility') {
        const target = layerList.value.find((item) => item.id === payload.layerId);
        if (!target) return;
        target.visible = !!payload.visible;
        refreshLayersState();
    }
}

// [隶属] 图片覆盖-经纬线控制
// [作用] 由 LayerControlPanel 触发经纬线开关。
// [交互] 委托 useMapState 的 graticule engine。
function handleToggleGraticule() {
    showDynamicSplitLines.value = toggleGraticule();
}

// [隶属] 组件交互-地图事件绑定
// [作用] 统一绑定 pointermove、singleclick、contextmenu、resolution 事件。
// [交互] 多处 emit：feature-selected、location-change。
function bindEvents() {
    const map = mapInstance.value;
    const viewport = map.getViewport();

    rightDragZoomController?.dispose?.();
    rightDragZoomController = createRightDragZoomController(map);

    // 统一处理鼠标移动：包括业务区域检测和工具提示
    // 注意：坐标显示改为视图中心，不再跟踪鼠标位置，在 moveend 和 touchmove 事件中更新
    map.on('pointermove', (evt) => {
        if (evt.dragging) return;

        const coordinate = evt.coordinate;

        // A. 测量提示逻辑
        if (tooltipRef.helpTooltipEl) {
            const sketchFeature = getSketchFeature();
            tooltipRef.helpTooltipEl.innerHTML = sketchFeature ?
                (sketchFeature.getGeometry() instanceof Polygon ? '双击结束多边形' : '双击结束测距') :
                '单击开始绘制';
            tooltipRef.helpTooltipOverlay.setPosition(coordinate);
            tooltipRef.helpTooltipEl.classList.remove('hidden');
        }

    });

    viewport.addEventListener('mouseout', () => {
        if (tooltipRef.helpTooltipEl) tooltipRef.helpTooltipEl.classList.add('hidden');
    });

    map.on('singleclick', async (evt) => {
        if (pendingBusPick) {
            const lonLat = toLonLat(evt.coordinate);
            const pickType = pendingBusPick.type;

            busPickSource.getFeatures().forEach((feature) => {
                if (feature.get('busPickType') === pickType) {
                    busPickSource.removeFeature(feature);
                }
            });

            busPickSource.addFeature(new Feature({
                geometry: new Point(evt.coordinate),
                busPickType: pickType
            }));

            pendingBusPick.resolve({
                lng: Number(lonLat[0].toFixed(6)),
                lat: Number(lonLat[1].toFixed(6))
            });
            pendingBusPick = null;
            return;
        }

        if (!isAttributeQueryEnabled.value) return;
        const drawInteraction = getDrawInteraction();
        if (drawInteraction && drawInteraction.getActive()) return;

        // 属性查询
        const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
        if (feature) {
            const { geometry, style, ...props } = feature.getProperties();
            emit('feature-selected', props);
            return;
        }

        const rasterInfo = await queryRasterValueAtCoordinate(evt.coordinate);
        if (rasterInfo) {
            emit('feature-selected', rasterInfo);
        }
    });

    viewport.addEventListener('contextmenu', (e) => {
        if (rightDragZoomController?.shouldSuppressContextMenu?.()) {
            e.preventDefault();
            return;
        }
        if (!isAttributeQueryEnabled.value) return;
        e.preventDefault();
        const pixel = map.getEventPixel(e);
        const feature = map.forEachFeatureAtPixel(pixel, f => f);
        if (!feature) return;
        const { geometry, style, ...props } = feature.getProperties();
        emit('feature-selected', {
            ...props,
            操作提示: '右键选择，可在工具箱中编辑样式'
        });
    });

    // 缩放监听 & 视图变化坐标更新
    map.getView().on('change:resolution', () => {
        // 更新缩放级别显示
        const zoom = map.getView().getZoom();
        if (zoom !== undefined) {
            currentZoom.value = Math.round(zoom);
        }
    });

    // 地图中心变化监听 - 用于移动端和平移/缩放时实时更新坐标
    map.getView().on('change:center', () => {
        const center = map.getView().getCenter();
        if (center) {
            const lonLat = toLonLat(center);
            currentCoordinate.value = { lng: lonLat[0], lat: lonLat[1] };
        }
    });

    // 移动完成事件 - 确保坐标为最终视图中心
    map.on('moveend', () => {
        const center = map.getView().getCenter();
        if (center) {
            const lonLat = toLonLat(center);
            currentCoordinate.value = { lng: lonLat[0], lat: lonLat[1] };
        }
        syncAttributeTableMapExtent();
    });

    // 触摸事件处理 - 移动端支持
    viewport.addEventListener('touchmove', () => {
        const center = map.getView().getCenter();
        if (center) {
            const lonLat = toLonLat(center);
            currentCoordinate.value = { lng: lonLat[0], lat: lonLat[1] };
        }
    }, false);
}

/**
 * 通过经纬度、缩放级别和图层索引更新地图视图。
 * @param lng 经度
 * @param lat 维度
 * @param z 缩放级别
 * @param layer 图层
 */
function updateViewByParams(lng, lat, z, layer) {
    const nextLng = Number(lng);
    const nextLat = Number(lat);
    if (!Number.isFinite(nextLng) || !Number.isFinite(nextLat)) return;

    const map = mapInstance.value;
    const currentMapZoom = Number(map?.getView?.()?.getZoom?.() ?? INITIAL_VIEW.zoom);
    const targetZoomRaw = Number(z);
    const targetZoom = Number.isFinite(targetZoomRaw) ? targetZoomRaw : currentMapZoom;

    const targetLayerRaw = Number(layer);
    const targetLayerIndex = Number.isInteger(targetLayerRaw)
        ? targetLayerRaw
        : getLayerIndexById(selectedLayer.value);

    flyToView({
        lng: nextLng,
        lat: nextLat,
        zoom: targetZoom,
        layerIndex: targetLayerIndex
    });

    currentCoordinate.value = { lng: nextLng, lat: nextLat };
    emit('location-change', { lon: nextLng, lat: nextLat, source: 'view-param-update' });
    emit('coordinate-jump', { lng: nextLng, lat: nextLat });
}

// [隶属] 底部控制-坐标跳转
// [作用] 接收 MapControlsBar 的 jump-to 事件，统一飞行并同步 URL。
// [交互] emit: location-change / coordinate-jump。
function handleJumpToCoordinates({ lng, lat }) {
    const map = mapInstance.value;
    const currentMapZoom = Number(map?.getView?.()?.getZoom?.() ?? INITIAL_VIEW.zoom);
    const nextZoom = Math.max(currentMapZoom, 12);

    updateViewByParams(lng, lat, nextZoom, getLayerIndexById(selectedLayer.value));
}

// [隶属] 底部控制-Home 单击
// [作用] 地图复位到初始中心和缩放。
// [交互] 由 MapControlsBar 的 reset-view 事件触发。
function resetView() {
    updateViewByParams(
        INITIAL_VIEW.center[0],
        INITIAL_VIEW.center[1],
        INITIAL_VIEW.zoom,
        getLayerIndexById(selectedLayer.value)
    );
}

// [隶属] 图层切换-自定义底图
// [作用] 加载用户输入的 URL，按 XYZ -> WMS -> WMTS 自动识别并激活 custom 图层。
// [交互] 更新 layerList 并调用 refreshLayersState。
async function loadCustomMap() {
    if (!customMapUrl.value) return;

    try {
        const detected = await createAutoTileSourceFromUrl(customMapUrl.value);
        customSource = detected.source;

        const kindTextMap = {
            xyz: '标准XYZ',
            'non-standard-xyz': '非标准XYZ',
            wms: 'WMS',
            wmts: 'WMTS'
        };

        message.success(`自动识别图源: ${kindTextMap[detected.kind]}（${detected.detail}）`);

        // 更新 custom 层的 source
        if (layerInstances['custom']) {
            layerInstances['custom'].setSource(customSource);
            // 自动开启
            const item = layerList.value.find(l => l.id === 'custom');
            if (item) {
                item.visible = true;
                refreshLayersState();
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error || 'URL格式错误或无法解析');
        message.error(`加载自定义图源失败: ${errorMessage}`);
    }
}

// [隶属] 组件交互-路径选点
// [作用] 启动地图点选 Promise，用于公交起终点拾取。
// [交互] 由外部组件通过 defineExpose 调用。
function startBusPointPick(type) {
    if (!mapInstance.value) {
        return Promise.reject(new Error('地图尚未初始化'));
    }

    const pickType = type === 'end' ? 'end' : 'start';

    if (pendingBusPick?.reject) {
        pendingBusPick.reject(new Error('上一次选点已取消'));
    }

    return new Promise((resolve, reject) => {
        pendingBusPick = { type: pickType, resolve, reject };
    });
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

    if (type === 'AttributeQuery') {
        isAttributeQueryEnabled.value = true;
        return;
    }

    if (type === 'CloseTools') {
        isAttributeQueryEnabled.value = false;
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
    drawPointByCoordinatesInput,
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
    left: 10px;
    top: 10px;
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
    border: 2px solid #00aaff;
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
}
</style>