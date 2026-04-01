<template>
    <div class="map-container" ref="mapContainerRef">
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
import { ref, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { useManagedLayerRegistry } from '../composables/useManagedLayerRegistry';
import { useUserLocation } from '../composables/useUserLocation';
import { useMessage } from '../composables/useMessage';
import { useMapState } from '../composables/useMapState';
import { 
    URL_LAYER_OPTIONS,
    activeGoogleTileHost as globalActiveGoogleTileHost,
    resolvePreferredGoogleHost,
    buildGoogleTileUrl,
    buildTiandituUrl,
    createLayerConfigs
} from '../composables/useBasemapManager';
import LayerControlPanel from './LayerControlPanel.vue';
import MapEasterEgg from './MapEasterEgg.vue';
import MapControlsBar from './MapControlsBar.vue';

const message = useMessage();

// ========== 底图管理 Composable ==========
// 集中管理底图配置、底图选项列表、Google 主机选择等逻辑
// URL_LAYER_OPTIONS：用于 URL 参数中的图层索引映射（与 BASEMAP_OPTIONS 对应）
// createLayerConfigs：工厂函数，根据参数生成 27 种底图配置
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
import { createEmpty, extend as extendExtent, isEmpty as isExtentEmpty } from 'ol/extent';

// 图层与数据源
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';

// 几何与交互
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import { LineString, Polygon } from 'ol/geom';
import { Draw, Snap } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

// --- 配置常量 ---
const BASE_URL = import.meta.env.BASE_URL || '/';
const NORM_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const INITIAL_VIEW = { center: [114.302, 34.8146], zoom: 17 };
const AMAP_WEB_SERVICE_KEY = '3e6d96476b807126acbc59384aa13e51';
const CRITICAL_TILE_READY_TIMEOUT_MS = 3000; // 首屏关键瓦片加载超时时间（毫秒）

// 天地图 Token：优先使用环境变量，否则使用默认值
// 生产环境建议在 .env 文件中配置 VITE_TIANDITU_TK
const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';

const DIHUAN_BOUNDS = { minLon: 114.3020, maxLon: 114.3030, minLat: 34.8149, maxLat: 34.8154 };
const IMAGES = [
    '地理与环境学院标志牌.webp', '地理与环境学院入口.webp', '地学楼.webp',
    '教育部重点实验室.webp', '四楼逃生图.webp', '学院楼单侧.webp'
].map(img => `${NORM_BASE}images/${img}`);

// --- Refs ---
const mapRef = ref(null);
const mapContainerRef = ref(null);
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

// --- 全局变量 (非响应式) ---
let drawInteraction, snapInteraction;
let measureTooltipEl, measureTooltipOverlay;
let helpTooltipEl, helpTooltipOverlay;
let sketchFeature;
let componentUnmounted = false;
let pendingBusPick = null;
let busRouteLayerRef = null;
let busRouteManagedLayerId = null;
let busActiveStepIndex = -1;
let busHoverStepIndex = -1;
let driveActiveStepIndex = -1;
let driveHoverStepIndex = -1;

// 图层引用
let baseLayer, labelLayer;
const drawSource = new VectorSource();
const userLocationSource = new VectorSource();
const busPickSource = new VectorSource();
const busRouteSource = new VectorSource();
const busStepStyleCache = new globalThis.Map();

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

const isAttributeQueryEnabled = ref(true);
const userDataLayers = [];
let drawGraphicSeed = 1;
let drawLayerInstance = null;
let currentManagedFeatureHighlight = null;

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

// [隶属] 图层管理-样式系统
// [作用] 对样式配置做归一化，统一默认值和边界。
// [交互] 被 createStyleFromConfig / mergeStyleConfig 调用。
function normalizeStyleConfig(styleCfg = {}) {
    const base = { ...STYLE_TEMPLATES.classic, ...(styleCfg || {}) };
    return {
        fillColor: base.fillColor,
        fillOpacity: Math.min(1, Math.max(0, Number(base.fillOpacity ?? 0.2))),
        strokeColor: base.strokeColor,
        strokeWidth: Math.max(0.5, Number(base.strokeWidth ?? 2)),
        pointRadius: Math.max(3, Number(base.pointRadius ?? 6))
    };
}

// [隶属] 图层管理-样式系统
// [作用] 将样式配置转换为 OpenLayers Style 实例。
// [交互] 被绘图层、上传层、搜索层样式设置调用。
function createStyleFromConfig(styleCfg, options = {}) {
    const cfg = normalizeStyleConfig(styleCfg);
    const hex = cfg.fillColor?.replace('#', '') || '5fbf7a';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const labelText = String(options.labelText || '').trim();
    return new Style({
        stroke: new Stroke({ color: cfg.strokeColor, width: cfg.strokeWidth }),
        fill: new Fill({ color: `rgba(${r}, ${g}, ${b}, ${cfg.fillOpacity})` }),
        image: new CircleStyle({
            radius: cfg.pointRadius,
            fill: new Fill({ color: cfg.fillColor }),
            stroke: new Stroke({ color: cfg.strokeColor, width: Math.max(1, cfg.strokeWidth / 2) })
        }),
        text: labelText
            ? new Text({
                text: labelText.length > 48 ? `${labelText.slice(0, 48)}...` : labelText,
                font: '600 12px "Segoe UI", "Microsoft YaHei", sans-serif',
                fill: new Fill({ color: '#183a2a' }),
                stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 }),
                backgroundFill: new Fill({ color: 'rgba(255,255,255,0.82)' }),
                padding: [2, 6, 2, 6],
                offsetY: -14,
                textAlign: 'center'
            })
            : undefined
    });
}

// [隶属] 图层管理-样式系统
// [作用] 合并旧配置与新配置并输出标准化结果。
// [交互] 被 setDrawStyle 与图层样式编辑动作调用。
function mergeStyleConfig(prevCfg, newCfg) {
    return normalizeStyleConfig({ ...(prevCfg || {}), ...(newCfg || {}) });
}

// [隶属] 图层管理-样式系统
// [作用] 根据图层状态决定标签文本是否显示。
// [交互] 被 applyManagedLayerStyle 调用。
function getLayerLabelText(layerItem) {
    if (!layerItem?.autoLabel) return '';
    if (!layerItem?.labelVisible) return '';
    return String(layerItem.name || '').trim();
}

function getFeatureLabelText(feature, layerItem) {
    if (!layerItem?.autoLabel || !layerItem?.labelVisible) return '';

    const props = typeof feature?.getProperties === 'function' ? feature.getProperties() : null;
    if (!props) return getLayerLabelText(layerItem);

    const preferredField = String(layerItem?.metadata?.labelField || '').trim();
    if (preferredField) {
        const preferredValue = props[preferredField];
        if (preferredValue !== null && preferredValue !== undefined && String(preferredValue).trim()) {
            return String(preferredValue).trim();
        }
    }

    const candidateKeys = ['name', 'Name', 'NAME', '名称', 'title', 'Title', 'TITLE', 'label', 'Label'];
    for (const key of candidateKeys) {
        const value = props[key];
        if (value !== null && value !== undefined && String(value).trim()) {
            return String(value).trim();
        }
    }

    const firstUsableEntry = Object.entries(props).find(([key, value]) => (
        key !== 'geometry'
        && key !== 'style'
        && !String(key).startsWith('_')
        && value !== null
        && value !== undefined
        && String(value).trim()
    ));
    if (firstUsableEntry) {
        return String(firstUsableEntry[1]).trim();
    }

    return getLayerLabelText(layerItem);
}

function buildManagedLayerStyle(layerItem) {
    const baseStyleConfig = layerItem?.styleConfig || STYLE_TEMPLATES.classic;
    if (!layerItem?.autoLabel || !layerItem?.labelVisible) {
        return createStyleFromConfig(baseStyleConfig, {
            labelText: ''
        });
    }

    layerItem.labelStyleCache = layerItem.labelStyleCache || new globalThis.Map();
    return (feature) => {
        const rawLabel = getFeatureLabelText(feature, layerItem);
        const labelText = String(rawLabel || '').trim();
        const cacheKey = labelText || '__empty__';
        if (layerItem.labelStyleCache.has(cacheKey)) {
            return layerItem.labelStyleCache.get(cacheKey);
        }
        const style = createStyleFromConfig(baseStyleConfig, { labelText });
        layerItem.labelStyleCache.set(cacheKey, style);
        return style;
    };
}

// [隶属] 图层管理-样式系统
// [作用] 将当前样式配置应用到目标托管图层。
// [交互] 被 setDrawStyle / setUserLayerStyle / setUserLayerLabelVisibility 间接调用。
function applyManagedLayerStyle(layerItem) {
    if (!layerItem || typeof layerItem.layer?.setStyle !== 'function') return;
    layerItem.labelStyleCache = new globalThis.Map();
    layerItem.layer.setStyle(buildManagedLayerStyle(layerItem));
}

// --- 样式定义 ---
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

const BUS_STEP_COLOR_PALETTE = [
    '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'
];
const DRIVE_STEP_COLOR_PALETTE = [
    '#10B981', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'
];

// [隶属] 线路渲染-样式系统
// [作用] 十六进制颜色转 rgba 字符串。
// [交互] 被公交/驾车步骤样式函数复用。
function hexToRgba(hexColor, alpha = 1) {
    const hex = String(hexColor || '').replace('#', '').trim();
    if (hex.length !== 6) return `rgba(59, 130, 246, ${alpha})`;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// [隶属] 线路渲染-公交样式
// [作用] 获取公交步骤主色。
// [交互] 被 getBusStepStyle / getBusStepPointStyle 调用。
function getBusStepColor(stepIndex) {
    const idx = Math.abs(Number(stepIndex || 0)) % BUS_STEP_COLOR_PALETTE.length;
    return BUS_STEP_COLOR_PALETTE[idx];
}

// [隶属] 线路渲染-驾车样式
// [作用] 获取驾车步骤主色。
// [交互] 被 getDriveStepStyle 调用。
function getDriveStepColor(stepIndex) {
    const idx = Math.abs(Number(stepIndex || 0)) % DRIVE_STEP_COLOR_PALETTE.length;
    return DRIVE_STEP_COLOR_PALETTE[idx];
}

// [隶属] 线路渲染-公交样式
// [作用] 生成公交线段样式并做缓存。
// [交互] 被公交路线图层 style 回调调用。
function getBusStepStyle(stepIndex, isWalk = false, isActive = false) {
    const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
    const key = `${normalizedStep}_${isWalk ? 'walk' : 'transit'}_${isActive ? 'active' : 'normal'}`;
    if (busStepStyleCache.has(key)) return busStepStyleCache.get(key);

    const baseColor = getBusStepColor(normalizedStep);
    const color = isWalk
        ? hexToRgba(baseColor, isActive ? 0.9 : 0.6)
        : hexToRgba(baseColor, isActive ? 1 : 0.88);

    const style = new Style({
        stroke: new Stroke({
            color,
            width: isActive ? (isWalk ? 6 : 7) : (isWalk ? 4 : 5),
            lineDash: isWalk ? [8, 6] : undefined,
            lineCap: 'round',
            lineJoin: 'round'
        })
    });
    busStepStyleCache.set(key, style);
    return style;
}

// [隶属] 线路渲染-公交样式
// [作用] 生成公交站点样式（含站名文本）。
// [交互] 被公交路线图层 style 回调调用。
function getBusStepPointStyle(stepIndex, markerRole = 'segment-start', isActive = false, stationName = '') {
    const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
    const role = markerRole === 'segment-end' ? 'segment-end' : 'segment-start';

    const baseColor = getBusStepColor(normalizedStep);
    const fillColor = role === 'segment-end'
        ? hexToRgba(baseColor, isActive ? 1 : 0.88)
        : hexToRgba(baseColor, isActive ? 0.9 : 0.72);

    const labelText = String(stationName || '').trim();

    const style = new Style({
        image: new CircleStyle({
            radius: isActive ? 7 : 5,
            fill: new Fill({ color: fillColor }),
            stroke: new Stroke({ color: '#ffffff', width: 2 })
        }),
        text: labelText
            ? new Text({
                text: labelText,
                offsetY: role === 'segment-end' ? -14 : 14,
                font: isActive ? '600 12px "Microsoft YaHei", sans-serif' : '500 11px "Microsoft YaHei", sans-serif',
                fill: new Fill({ color: '#111827' }),
                stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 })
            })
            : undefined
    });
    return style;
}

// [隶属] 线路渲染-驾车样式
// [作用] 生成驾车总览线或步骤线样式并缓存。
// [交互] 被驾车路线图层 style 回调调用。
function getDriveStepStyle(stepIndex = 0, isActive = false, isStepSegment = false) {
    if (!isStepSegment) {
        const key = 'drive_overview';
        if (busStepStyleCache.has(key)) return busStepStyleCache.get(key);
        const style = new Style({
            stroke: new Stroke({
                color: 'rgba(5, 150, 105, 0.35)',
                width: 4,
                lineCap: 'round',
                lineJoin: 'round'
            })
        });
        busStepStyleCache.set(key, style);
        return style;
    }

    const normalizedStep = Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : 0;
    const key = `drive_step_${normalizedStep}_${isActive ? 'active' : 'normal'}`;
    if (busStepStyleCache.has(key)) return busStepStyleCache.get(key);

    const color = hexToRgba(getDriveStepColor(normalizedStep), isActive ? 0.98 : 0.9);

    const style = new Style({
        stroke: new Stroke({
            color,
            width: isActive ? 8 : 6,
            lineCap: 'round',
            lineJoin: 'round'
        })
    });
    busStepStyleCache.set(key, style);
    return style;
}

// [隶属] 线路交互-步骤状态
// [作用] 获取当前公交高亮步骤（悬停优先）。
// [交互] 被公交图层样式判定调用。
function getCurrentBusStepIndex() {
    return busHoverStepIndex >= 0 ? busHoverStepIndex : busActiveStepIndex;
}

// [隶属] 线路交互-步骤状态
// [作用] 获取当前驾车高亮步骤（悬停优先）。
// [交互] 被驾车图层样式判定调用。
function getCurrentDriveStepIndex() {
    return driveHoverStepIndex >= 0 ? driveHoverStepIndex : driveActiveStepIndex;
}

function getLayerIdByIndex(index) {
    const normalizedIndex = Number(index);
    if (!Number.isInteger(normalizedIndex)) return null;
    if (normalizedIndex < 0 || normalizedIndex >= URL_LAYER_OPTIONS.length) return null;
    return URL_LAYER_OPTIONS[normalizedIndex] || null;
}

function getLayerIndexById(layerId) {
    const idx = URL_LAYER_OPTIONS.indexOf(String(layerId || ''));
    return idx >= 0 ? idx : null;
}

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
    getLayerIndex: () => getLayerIndexById(selectedLayer.value),
    onLayerIndexChange: (layerIndex) => {
        const layerId = getLayerIdByIndex(layerIndex);
        if (!layerId || selectedLayer.value === layerId) return;
        selectedLayer.value = layerId;
    }
});

const initialUrlState = parseUrlToState();
const initialLayerId = getLayerIdByIndex(initialUrlState?.layerIndex);
if (initialLayerId) {
    selectedLayer.value = initialLayerId;
}

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

// --- 初始化 ---
onMounted(async () => {
    componentUnmounted = false;
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

function scheduleLowPriorityTask(task) {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => {
            if (!componentUnmounted) task();
        }, { timeout: 1500 });
        return;
    }
    setTimeout(() => {
        if (!componentUnmounted) task();
    }, 0);
}

// [隶属] 启动流程-首屏优先
// [作用] 等待关键瓦片完成首次渲染，避免阻塞后续非关键任务。
// [交互] 被 onMounted 启动流程调用。
function waitForCriticalTileReady(timeoutMs = CRITICAL_TILE_READY_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const map = mapInstance.value;
        if (!map) {
            resolve();
            return;
        }
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            if (renderCompleteKey) unByKey(renderCompleteKey);
            clearTimeout(timer);
            resolve();
        };

        const renderCompleteKey = map.on('rendercomplete', finish);
        const timer = setTimeout(finish, timeoutMs);
    });
}

// [隶属] 启动流程-首屏优化
// [作用] 在首屏完成后执行非关键任务（主机测速、定位兜底）。
// [交互] 调用 resolvePreferredGoogleHost / getCurrentLocation / detectIPLocale。
async function runDeferredStartupTasks() {
    if (componentUnmounted) return;

    const routeViewState = parseUrlToState();
    if (Number.isFinite(routeViewState?.lng) && Number.isFinite(routeViewState?.lat)) {
        message.success(`欢迎来到NEGIAO分享的地点${routeViewState.lng.toFixed(6)},${routeViewState.lat.toFixed(6)}，正在加载地图...`, { duration: 1000 });
        return;
    }

    // 1) Google 主机测速切换（非关键，延后执行）。
    resolvePreferredGoogleHost().then((host) => {
        if (componentUnmounted) return;
        if (!host || host === activeGoogleTileHost.value) return;
        activeGoogleTileHost.value = host;
        refreshGoogleLayerSources();
    }).catch(() => {});

    // 2) 位置相关逻辑（非关键，延后执行）。
    // 优先使用浏览器真实定位；IP 仅用于国内外判定兜底，不再用于地图中心定位。
    if (navigator.geolocation) {
        try {
            const pos = await getCurrentLocation(true);
            if (componentUnmounted) return;
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

onUnmounted(() => {
    componentUnmounted = true;
    stopMapViewSync();
    stopGraticule();
    if (pendingBusPick?.reject) {
        pendingBusPick.reject(new Error('地图已卸载'));
        pendingBusPick = null;
    }
    if (mapInstance.value) mapInstance.value.setTarget(null);
});

// [隶属] 图层切换-底图分类
// [作用] 判断图层属于底图还是覆盖层。
// [交互] 被 emitBaseLayersChange 与图层动作过滤逻辑调用。
function getLayerCategory(layerId) {
    if (['google', 'google_standard', 'google_clean', 'tianDiTu', 'tianDiTu_vec', 'esri', 'osm', 'amap', 'tengxun', 'esri_ocean', 'esri_terrain', 'esri_physical', 'esri_hillshade', 'esri_gray', 'yandex_sat', 'geoq_gray', 'geoq_hydro', 'local', 'custom'].includes(layerId)) {
        return 'base';
    }
    return 'overlay';
}

// [隶属] 图层切换-底图分组
// [作用] 为底图面板提供分组标签（影像/矢量/专题/注记）。
// [交互] 被 emitBaseLayersChange 调用。
function getLayerGroup(layerId) {
    if (['google', 'tianDiTu', 'esri', 'yandex_sat'].includes(layerId)) return '影像';
    if (['google_standard', 'google_clean', 'tianDiTu_vec', 'osm', 'amap', 'tengxun', 'geoq_gray', 'geoq_hydro'].includes(layerId)) return '矢量';
    if (['esri_ocean', 'esri_terrain', 'esri_physical', 'esri_hillshade', 'esri_gray', 'local', 'custom'].includes(layerId)) return '专题';
    return '注记';
}

// [隶属] 图层切换-对外状态同步
// [作用] 广播底图列表状态，供外部组件展示或联动。
// [交互] emit: base-layers-change。
function emitBaseLayersChange() {
    emit('base-layers-change', layerList.value.map(item => ({
        id: item.id,
        name: item.name,
        visible: item.visible,
        category: getLayerCategory(item.id),
        group: getLayerGroup(item.id),
        active: selectedLayer.value === item.id
    })));
}

// [隶属] 图层切换-底图源刷新
// [作用] 当 Google 主机切换后重建相关图层 source。
// [交互] 被 runDeferredStartupTasks 调用。
function refreshGoogleLayerSources() {
    const googleLayerIds = ['google', 'google_standard', 'google_clean'];
    googleLayerIds.forEach((id) => {
        const cfg = LAYER_CONFIGS.find(item => item.id === id);
        const layer = layerInstances[id];
        if (!cfg || !layer) return;
        layer.setSource(cfg.createSource());
    });
}

function ensureFeatureId(feature, layerName, index) {
    const existingId = feature?.getId?.() || feature?.get?.('_gid') || feature?.get?.('id');
    const featureId = String(existingId || `${layerName || 'layer'}_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    if (typeof feature?.setId === 'function') {
        feature.setId(featureId);
    }
    if (typeof feature?.set === 'function') {
        feature.set('_gid', featureId);
    }
    return featureId;
}

function serializeManagedFeature(feature, layerName, index) {
    const featureId = ensureFeatureId(feature, layerName, index);
    const geometry = feature?.getGeometry?.();
    const properties = { ...(feature?.getProperties?.() || {}) };
    delete properties.geometry;
    delete properties.style;

    const serializedGeometry = geometry
        ? {
            type: geometry.getType?.() || 'Geometry',
            coordinates: geometry.getCoordinates?.()
        }
        : null;

    properties._gid = featureId;

    return {
        type: 'Feature',
        id: featureId,
        _gid: featureId,
        properties,
        geometry: serializedGeometry
    };
}

function serializeManagedFeatures(features = [], layerName = '') {
    return (features || []).map((feature, index) => serializeManagedFeature(feature, layerName, index));
}

function findManagedFeature(layerId, featureId) {
    const target = userDataLayers.find(item => item.id === layerId);
    if (!target) return null;
    const source = target.layer?.getSource?.();
    const normalizedId = String(featureId || '');
    const sourceFeature = source?.getFeatureById?.(normalizedId)
        || source?.getFeatures?.()?.find((feature) => String(feature?.getId?.() || feature?.get?.('_gid') || '') === normalizedId);
    return sourceFeature || null;
}

function createManagedFeatureHighlightStyle(feature) {
    const geometryType = feature?.getGeometry?.()?.getType?.() || '';
    const isPointLike = /Point$/i.test(geometryType);

    if (isPointLike) {
        return new Style({
            image: new CircleStyle({
                radius: 8,
                fill: new Fill({ color: 'rgba(52, 211, 153, 0.95)' }),
                stroke: new Stroke({ color: '#ffffff', width: 2 })
            })
        });
    }

    return new Style({
        fill: new Fill({ color: 'rgba(48, 157, 88, 0.18)' }),
        stroke: new Stroke({ color: '#1f8a4c', width: 4 })
    });
}

function clearManagedFeatureHighlight(feature) {
    if (!feature) return;
    if (typeof feature.setStyle === 'function') {
        feature.setStyle(undefined);
    }
}

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
    const managedLayerState = {
        name,
        autoLabel: !!autoLabel,
        labelVisible,
        metadata: metadata || null,
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
        metadata: managedLayerState.metadata,
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

function zoomToManagedFeature({ layerId, featureId }) {
    if (!mapInstance.value) return;
    const feature = findManagedFeature(layerId, featureId);
    if (!feature) return;
    const geometry = feature.getGeometry?.();
    const extent = geometry?.getExtent?.();
    if (!extent || extent.some(v => !Number.isFinite(v))) return;
    mapInstance.value.getView().fit(extent, {
        padding: [80, 80, 80, 80],
        duration: 800,
        maxZoom: 18
    });
    clearManagedFeatureHighlight(currentManagedFeatureHighlight);
    currentManagedFeatureHighlight = feature;
    feature.setStyle(createManagedFeatureHighlightStyle(feature));
}

function highlightManagedFeature({ layerId, featureId }) {
    const feature = findManagedFeature(layerId, featureId);
    if (!feature) return;
    clearManagedFeatureHighlight(currentManagedFeatureHighlight);
    currentManagedFeatureHighlight = feature;
    feature.setStyle(createManagedFeatureHighlightStyle(feature));
}

// [隶属] 外部数据导入-动作集接入
// [作用] 从 useLayerDataImport 注入上传入口与解析动作。
// [交互] addUserDataLayer 由 defineExpose 对外提供给父组件调用。
let layerDataImportApiPromise = null;
let userLayerActionsApiPromise = null;
let routeBuilderApiPromise = null;

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
                layerId === busRouteManagedLayerId
                || removed?.metadata?.category === 'bus-route'
                || removed?.metadata?.category === 'drive-route'
                || removed?.metadata?.category === 'route'
            ),
            onRouteManagedLayerRemoved: () => {
                busRouteManagedLayerId = null;
                resetRouteStepStates();
                busRouteSource.clear();
            }
        }));
    }
    return userLayerActionsApiPromise;
}

async function ensureRouteBuilderApi() {
    if (!routeBuilderApiPromise) {
        routeBuilderApiPromise = import('../utils/transitRouteBuilder');
    }
    return routeBuilderApiPromise;
}

async function addUserDataLayer(payload) {
    const api = await ensureLayerDataImportApi();
    return api.addUserDataLayer(payload);
}

async function queryRasterValueAtCoordinate(coordinate) {
    const api = await ensureLayerDataImportApi();
    return api.queryRasterValueAtCoordinate(coordinate);
}

async function setUserLayerVisibility(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setUserLayerVisibility(...args);
}

async function setUserLayerOpacity(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setUserLayerOpacity(...args);
}

async function removeUserLayer(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.removeUserLayer(...args);
}

async function reorderUserLayers(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.reorderUserLayers(...args);
}

async function soloUserLayer(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.soloUserLayer(...args);
}

async function setUserLayerStyle(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setUserLayerStyle(...args);
}

async function setUserLayerLabelVisibility(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.setUserLayerLabelVisibility(...args);
}

async function applyStyleTemplate(...args) {
    const api = await ensureUserLayerActionsApi();
    return api.applyStyleTemplate(...args);
}

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

/**
 * 底图切换验证器：检测新切换底图的加载状态
 * 
 * @param {string} layerId - 切换到的底图ID
 * @param {TileLayer} layer - 底图对应的图层实例
 * @param {number} checkTimeoutMs - 检测时长（毫秒）
 * @returns {Promise<{success: boolean, reason: string}>}
 */
async function validateBaseLayerSwitch(layerId, layer, checkTimeoutMs = 3000) {
    return new Promise((resolve) => {
        if (!layer) {
            resolve({ success: false, reason: '底图图层实例不存在' });
            return;
        }

        const source = layer.getSource();
        if (!source) {
            resolve({ success: false, reason: '底图数据源不可用' });
            return;
        }

        let hasSuccessfulLoad = false;
        let hasError = false;
        let errorCount = 0;
        let checkTimer = null;

        const onTileLoadEnd = () => {
            hasSuccessfulLoad = true;
        };

        const onTileLoadError = () => {
            errorCount++;
            if (errorCount >= 3) {
                hasError = true;
            }
        };

        // 添加事件监听
        source.on('tileloadend', onTileLoadEnd);
        source.on('tileloaderror', onTileLoadError);

        // 设定检测时间
        checkTimer = setTimeout(() => {
            // 移除监听
            source.un('tileloadend', onTileLoadEnd);
            source.un('tileloaderror', onTileLoadError);

            if (hasSuccessfulLoad) {
                resolve({ success: true, reason: '切换成功' });
            } else if (hasError) {
                resolve({ success: false, reason: '底图服务异常，多个瓦片加载失败' });
            } else {
                resolve({ success: false, reason: '未能获取底图数据（网络无响应或超时）' });
            }
        }, checkTimeoutMs);
    });
}

//优化：支持多层次智能兜底的底图监测管理器
/**
 * 底图兜底管理器：支持多层次降级策略
 */
const createBaseLayerFallbackManager = (layerId, isDefaultBaseLayer) => {
    // 兜底候选选项按优先级排序：仅天地图和自定义（不使用OSM）
    const FALLBACK_OPTIONS = ['tianDiTu', 'local'];
    
    let fallbackAttempts = 0;
    const maxFallbackAttempts = FALLBACK_OPTIONS.length;
    let lastFallbackKey = null;
    
    return {
        // 获取下一个兜底选项（仅用于自动切换，默认底图适用）
        getNextFallbackOption: () => {
            if (fallbackAttempts >= maxFallbackAttempts) {
                message.warn(`[底图兜底] ${layerId} 已尝试所有兜底选项`);
                return null;
            }
            
            const nextOption = FALLBACK_OPTIONS[fallbackAttempts];
            lastFallbackKey = nextOption;
            fallbackAttempts++;
            return nextOption;
        },
        
        // 获取当前兜底选项
        getCurrentFallback: () => lastFallbackKey,
        
        // 是否仅限于提醒（非默认底图不自动切换）
        isNotifyOnly: () => !isDefaultBaseLayer,
        
        // 重置兜底计数器
        reset: () => {
            fallbackAttempts = 0;
            lastFallbackKey = null;
        }
    };
};

//BUG：本函数的作用主要是监测默认瓦片的状态，给出兜底行为，超时则切换底图
/**
 * 监测图层加载状态并自动降级（智能防抖抗网络波动版）
 * @param {TileLayer} layer - 需要监测的图层实例
 * @param {Object} callbacks - 回调函数对象 { onTimeout, onSuccess, onError }
 */
const monitorLayerTimeout = (layer, layerId, isDefaultBaseLayer, callbacks = {}) => {
    // 防重复初始化
    const monitorKey = `_isTimeoutMonitored_${layerId}`;
    if (layer.get(monitorKey)) return;
    layer.set(monitorKey, true);

    const source = layer.getSource();
    if (!source) return;

    // 核心配置参数（可根据需要调整）
    const MAX_ERRORS = 3;           // 容忍的最大连续报错瓦片数
    const ACTIVITY_TIMEOUT = 10000; // 绝对静默超时10秒
    const WARNING_THRESHOLD = 5;    // 累计错误数达到此值时发出警告

    let activityTimer = null;
    let loadingTilesCount = 0;
    let consecutiveErrors = 0;      // 连续错误计数
    let totalErrors = 0;            // 累计错误总数
    let isSwitched = false;
    let hasNotifiedSuccess = false;
    
    // 初始化兜底管理器
    const fallbackManager = createBaseLayerFallbackManager(layerId, isDefaultBaseLayer); 

    // 执行降级逻辑
    const switchToBackup = (reason, triggerCallback) => {
        if (isSwitched) return;
        isSwitched = true;

        message.warn(`[底图降级] ${layerId} - ${reason}`);
        
        // 如果仅限于提醒（非默认底图），则不切换，仅通知
        if (fallbackManager.isNotifyOnly()) {
            message.warn(`[底图监测] ${layerId} 非默认底图，仅提醒用户: ${reason}`);
            if (triggerCallback) triggerCallback();
            cleanUp();
            return;
        }
        
        // 仅默认底图才自动切换
        const nextOption = fallbackManager.getNextFallbackOption();
        if (!nextOption) {
            message.error(`[底图降级] ${layerId} 所有兜底选项已尝试`);
            if (triggerCallback) triggerCallback();
            cleanUp();
            return;
        }
        
        message.warn(`[底图降级] ${layerId} 已切换至 ${nextOption}`);
        
        // 通知调用方需要切换底图
        if (callbacks.onLayerSwitchRequired) {
            callbacks.onLayerSwitchRequired(nextOption, reason);
        }
        
        if (triggerCallback) triggerCallback();
        cleanUp();
    };

    // 重置“绝对静默”定时器
    const resetActivityTimer = () => {
        if (activityTimer) clearTimeout(activityTimer);
        if (loadingTilesCount > 0) {
            activityTimer = setTimeout(() => {
                switchToBackup(`服务无响应（${ACTIVITY_TIMEOUT/1000}秒无瓦片加载）`, callbacks.onTimeout);
            }, ACTIVITY_TIMEOUT);
        }
    };

    const onTileLoadStart = () => {
        if (isSwitched) return;
        loadingTilesCount++;
        resetActivityTimer();
    };

    const onTileLoadEnd = () => {
        if (isSwitched) return;
        loadingTilesCount--;
        consecutiveErrors = 0; // 只要有瓦片成功，清零连续错误计数

        if (loadingTilesCount <= 0) {
            loadingTilesCount = 0;
            if (activityTimer) { clearTimeout(activityTimer); activityTimer = null; }
            
            if (!hasNotifiedSuccess && totalErrors === 0) {
                hasNotifiedSuccess = true;
                if (callbacks.onSuccess) callbacks.onSuccess();
            }
        } else {
            resetActivityTimer();
        }
    };

    const onTileLoadError = () => {
        if (isSwitched) return;
        loadingTilesCount--;
        consecutiveErrors++;
        totalErrors++;

        // 策略1：连续错误达到阈值，判定服务不可用
        if (consecutiveErrors >= MAX_ERRORS) {
            switchToBackup(`服务异常（连续${consecutiveErrors}个瓦片失败）`, callbacks.onError);
            return;
        }
        
        // 策略2：累计错误过多时发出警告
        if (totalErrors === WARNING_THRESHOLD) {
            message.warn(`[底图监测] ${layerId} 累计错误${totalErrors}个，建议检查网络`);
        }

        if (loadingTilesCount <= 0) {
            loadingTilesCount = 0;
            if (activityTimer) { clearTimeout(activityTimer); activityTimer = null; }
        } else {
            resetActivityTimer();
        }
    };

    const cleanUp = () => {
        if (activityTimer) { clearTimeout(activityTimer); activityTimer = null; }
        source.un('tileloadstart', onTileLoadStart);
        source.un('tileloadend', onTileLoadEnd);
        source.un('tileloaderror', onTileLoadError);
    };

    source.on('tileloadstart', onTileLoadStart);
    source.on('tileloadend', onTileLoadEnd);
    source.on('tileloaderror', onTileLoadError);
};


// --- 1. 地图核心逻辑 ---
// [隶属] 图层切换-地图初始化
// [作用] 初始化地图实例、底图层、业务图层与控件。
// [交互] 触发 bindEvents，并在 watch(selectedLayer) 中联动底图切换。

// bug
// 初始化阶段被频繁调用，需优化避免重复加载和事件监听。
// 图层成功加载处被调用三次，导致多次重复加载和提示，需优化。

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
            onSuccess: () => message.success(`${item.id}加载成功。`),
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
        new ScaleLine({ units: 'metric', bar: true, minWidth: 100 }),
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
        switchLayerById(val, {
            onUpdated: () => emitBaseLayersChange()
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
                    message.success(`已成功切换到${val}底图`);
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
            loadCustomMap();
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

    // 统一处理鼠标移动：包括业务区域检测和工具提示
    map.on('pointermove', (evt) => {
        if (evt.dragging) return;

        const coordinate = evt.coordinate;
        const lonLat = toLonLat(coordinate);
        currentCoordinate.value = { lng: lonLat[0], lat: lonLat[1] };

        // A. 测量提示逻辑
        if (helpTooltipEl) {
            helpTooltipEl.innerHTML = sketchFeature ?
                (sketchFeature.getGeometry() instanceof Polygon ? '双击结束多边形' : '双击结束测距') :
                '单击开始绘制';
            helpTooltipOverlay.setPosition(coordinate);
            helpTooltipEl.classList.remove('hidden');
        }

    });

    map.getViewport().addEventListener('mouseout', () => {
        if (helpTooltipEl) helpTooltipEl.classList.add('hidden');
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

    map.getViewport().addEventListener('contextmenu', (e) => {
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
    });

    // 触摸事件处理 - 移动端支持
    map.getViewport().addEventListener('touchmove', () => {
        const center = map.getView().getCenter();
        if (center) {
            const lonLat = toLonLat(center);
            currentCoordinate.value = { lng: lonLat[0], lat: lonLat[1] };
        }
    }, false);
}

// --- 2. 业务逻辑 (区域图片) ---

// --- 3. 关键修复：复位与定位逻辑 ---
// 函数: updateViewByParams(lng, lat, z, layer)
// 职责: 统一执行视图飞行、图层索引切换、并通过现有 flyToView 逻辑 replace URL（不再分散在多个组件手动改 query）
// [隶属] 视图更新-统一入口
// [作用] 统一处理经纬度、缩放、图层参数，执行飞行并 replace URL。
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
// [作用] 加载用户输入的 XYZ 地址并激活 custom 图层。
// [交互] 更新 layerList 并调用 refreshLayersState。
function loadCustomMap() {
    if (!customMapUrl.value) return;
    try {
        customSource = new XYZ({
            url: customMapUrl.value
        });
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
    } catch (e) {
        message.error('URL格式错误或无法解析');
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

/**
 * 统一清理路线交互状态（选中步骤 + 悬停预览）。
 * 说明：公交与驾车共用一套路由图层，切换路线时必须同步复位状态，避免残留高亮。
 */
function resetRouteStepStates() {
    busActiveStepIndex = -1;
    busHoverStepIndex = -1;
    driveActiveStepIndex = -1;
    driveHoverStepIndex = -1;
}

/**
 * 按模式获取指定步骤对应要素。
 */
function getRouteStepFeatures(routeMode, stepIndex) {
    const targetStepIndex = Number(stepIndex);
    if (!Number.isFinite(targetStepIndex) || targetStepIndex < 0) return [];

    return busRouteSource.getFeatures().filter((feature) => (
        feature.get('routeMode') === routeMode && Number(feature.get('stepIndex')) === targetStepIndex
    ));
}

/**
 * 统一执行步骤缩放逻辑（公交/驾车复用）。
 */
async function zoomToRouteStep(routeMode, stepIndex, options = {}) {
    if (!mapInstance.value) {
        throw new Error('地图尚未初始化');
    }

    const { fitExtentToCoverage } = await ensureRouteBuilderApi();

    const targetStepIndex = Number(stepIndex);
    if (!Number.isFinite(targetStepIndex) || targetStepIndex < 0) {
        throw new Error('步骤索引无效');
    }

    const stepFeatures = getRouteStepFeatures(routeMode, targetStepIndex);
    if (!stepFeatures.length) {
        const routeLabel = routeMode === 'drive' ? '驾车' : '公交';
        throw new Error(`未找到${routeLabel}步骤 ${targetStepIndex + 1} 对应路段`);
    }

    if (routeMode === 'drive') {
        driveActiveStepIndex = targetStepIndex;
        driveHoverStepIndex = -1;
    } else {
        busActiveStepIndex = targetStepIndex;
        busHoverStepIndex = -1;
        driveActiveStepIndex = -1;
        driveHoverStepIndex = -1;
    }
    busRouteLayerRef?.changed?.();

    const stepExtent = createEmpty();
    stepFeatures.forEach((feature) => {
        const geometry = feature.getGeometry();
        if (!geometry) return;
        extendExtent(stepExtent, geometry.getExtent());
    });

    if (!isExtentEmpty(stepExtent)) {
        fitExtentToCoverage(mapInstance.value, stepExtent, {
            targetCoverage: options.targetCoverage ?? 0.84,
            bufferRatio: options.bufferRatio ?? 0.16,
            minBufferMeters: options.minBufferMeters ?? 120,
            maxBufferMeters: options.maxBufferMeters ?? 1200,
            padding: options.padding ?? [72, 72, 72, 72],
            duration: options.duration ?? 650,
            minZoom: options.minZoom ?? 10,
            maxZoom: options.maxZoom ?? 19
        });
    }
}

/**
 * 统一处理步骤悬停预览（公交/驾车复用）。
 */
function previewRouteStep(routeMode, stepIndex) {
    const targetStepIndex = Number(stepIndex);
    const normalized = Number.isFinite(targetStepIndex) && targetStepIndex >= 0 ? targetStepIndex : -1;

    if (routeMode === 'drive') {
        driveHoverStepIndex = normalized;
    } else {
        busHoverStepIndex = normalized;
    }
    busRouteLayerRef?.changed?.();
}

// [隶属] 路线规划-步骤预览
// [作用] 清空指定模式的悬停步骤高亮。
// [交互] 改变样式状态并触发 busRouteLayerRef.changed。
function clearRouteStepPreview(routeMode) {
    if (routeMode === 'drive') {
        driveHoverStepIndex = -1;
    } else {
        busHoverStepIndex = -1;
    }
    busRouteLayerRef?.changed?.();
}

// [隶属] 路线规划-公交渲染
// [作用] 将公交方案绘制到路线图层并自动缩放。
// [交互] 更新托管图层信息，影响外部图层管理面板。
async function drawRouteOnMap(route) {
    if (!mapInstance.value) {
        throw new Error('地图尚未初始化');
    }

    if (busRouteLayerRef && !mapInstance.value.getLayers().getArray().includes(busRouteLayerRef)) {
        mapInstance.value.addLayer(busRouteLayerRef);
    }

    // 只清理旧线路，保留起终点 marker。
    busRouteSource.clear();
    resetRouteStepStates();

    const { buildRouteRenderData, fitExtentToCoverage } = await ensureRouteBuilderApi();
    const { features, fitExtent, featureCount, hasGeometry } = buildRouteRenderData('bus', route);
    if (!featureCount) {
        throw new Error('公交方案中未找到分段信息（segments 为空）');
    }

    busRouteSource.addFeatures(features);

    const routeFeatureCount = busRouteSource.getFeatures().length;
    if (!routeFeatureCount || !hasGeometry || isExtentEmpty(fitExtent)) {
        throw new Error('公交方案存在，但未解析到可绘制的有效坐标点');
    }

    if (!isExtentEmpty(fitExtent)) {
        fitExtentToCoverage(mapInstance.value, fitExtent, {
            targetCoverage: 0.72,
            bufferRatio: 0.08,
            minBufferMeters: 120,
            maxBufferMeters: 1800,
            padding: [80, 80, 80, 80],
            duration: 700,
            minZoom: 6,
            maxZoom: 19
        });
    }

    busRouteLayerRef?.changed?.();

    syncRouteManagedLayer({
        name: '公交规划路线',
        type: 'bus_route',
        category: 'route',
        featureCount: routeFeatureCount
    });
}

// [隶属] 路线规划-驾车渲染
// [作用] 将驾车路径绘制到路线图层并自动缩放。
// [交互] 更新托管图层信息，影响外部图层管理面板。
async function drawDriveRouteOnMap(routeLatLonStr) {
    if (!mapInstance.value) {
        throw new Error('地图尚未初始化');
    }

    if (busRouteLayerRef && !mapInstance.value.getLayers().getArray().includes(busRouteLayerRef)) {
        mapInstance.value.addLayer(busRouteLayerRef);
    }

    // 清理旧路线，保留起终点 marker。
    busRouteSource.clear();
    resetRouteStepStates();

    const { buildRouteRenderData, fitExtentToCoverage } = await ensureRouteBuilderApi();
    const { features, fitExtent, hasGeometry } = buildRouteRenderData('drive', routeLatLonStr);
    if (!hasGeometry || !features.length) {
        throw new Error('驾车路线坐标不足，无法绘制');
    }

    busRouteSource.addFeatures(features);

    if (!isExtentEmpty(fitExtent)) {
        fitExtentToCoverage(mapInstance.value, fitExtent, {
            targetCoverage: 0.72,
            bufferRatio: 0.08,
            minBufferMeters: 120,
            maxBufferMeters: 1800,
            padding: [80, 80, 80, 80],
            duration: 700,
            minZoom: 6,
            maxZoom: 19
        });
    }

    busRouteLayerRef?.changed?.();

    syncRouteManagedLayer({
        name: '驾车规划路线',
        type: 'drive_route',
        category: 'route',
        featureCount: busRouteSource.getFeatures().length
    });
}

// [隶属] 路线规划-驾车步骤定位
// [作用] 聚焦到指定驾车步骤范围。
// [交互] 由外部步骤列表交互触发。
async function zoomToDriveRouteStep(stepIndex) {
    return zoomToRouteStep('drive', stepIndex, {
        targetCoverage: 0.84,
        bufferRatio: 0.16,
        minBufferMeters: 120,
        maxBufferMeters: 1200,
        padding: [72, 72, 72, 72],
        duration: 650,
        minZoom: 10,
        maxZoom: 19
    });
}

// [隶属] 路线规划-公交步骤定位
// [作用] 聚焦到指定公交步骤范围。
// [交互] 由外部步骤列表交互触发。
async function zoomToBusRouteStep(stepIndex) {
    return zoomToRouteStep('bus', stepIndex, {
        targetCoverage: 0.84,
        bufferRatio: 0.16,
        minBufferMeters: 120,
        maxBufferMeters: 1200,
        padding: [72, 72, 72, 72],
        duration: 650,
        minZoom: 10,
        maxZoom: 19
    });
}

// [隶属] 路线规划-托管图层同步
// [作用] 同步路线图层在 userDataLayers 中的记录。
// [交互] 调用 emitUserLayersChange / emitGraphicsOverview。
function syncRouteManagedLayer({ name, type, category, featureCount }) {
    const routeFeatureCount = Number(featureCount || 0);
    let managedItem = busRouteManagedLayerId
        ? userDataLayers.find(item => item.id === busRouteManagedLayerId)
        : null;

    if (!managedItem && busRouteLayerRef) {
        busRouteManagedLayerId = addManagedLayerRecord({
            name,
            type,
            sourceType: 'search',
            layer: busRouteLayerRef,
            featureCount: routeFeatureCount,
            styleConfig: null,
            metadata: { category }
        });
        managedItem = userDataLayers.find(item => item.id === busRouteManagedLayerId) || null;
    }

    if (managedItem) {
        managedItem.name = name;
        managedItem.type = type;
        managedItem.metadata = { ...(managedItem.metadata || {}), category };
        managedItem.featureCount = routeFeatureCount;
        managedItem.visible = true;
        managedItem.layer?.setVisible?.(true);
        emitUserLayersChange();
        emitGraphicsOverview();
    }
}

// [隶属] 路线规划-公交步骤预览
// [作用] 公交步骤 hover 预览入口。
// [交互] 由外部组件调用。
function previewBusRouteStep(stepIndex) {
    previewRouteStep('bus', stepIndex);
}

// [隶属] 路线规划-公交步骤预览
// [作用] 清除公交步骤 hover 预览。
// [交互] 由外部组件调用。
function clearBusRouteStepPreview() {
    clearRouteStepPreview('bus');
}

// [隶属] 路线规划-驾车步骤预览
// [作用] 驾车步骤 hover 预览入口。
// [交互] 由外部组件调用。
function previewDriveRouteStep(stepIndex) {
    previewRouteStep('drive', stepIndex);
}

// [隶属] 路线规划-驾车步骤预览
// [作用] 清除驾车步骤 hover 预览。
// [交互] 由外部组件调用。
function clearDriveRouteStepPreview() {
    clearRouteStepPreview('drive');
}

// --- 5. 地名搜索功能 (主逻辑) ---
// [隶属] 组件交互-地名搜索
// [作用] 接收 LayerControlPanel 解析后的定位载荷并渲染搜索结果图层。
// [交互] 由 LayerControlPanel 的 search-jump 事件触发。
function handleSearchJump(payload) {
    if (!mapInstance.value || !payload) return;

    const lon = Number(payload.lng);
    const lat = Number(payload.lat);
    if (Number.isNaN(lon) || Number.isNaN(lat)) {
        message.warning('无法解析该结果的坐标');
        return;
    }
    const coord = fromLonLat([lon, lat]);

    const layerName = (payload.name || `搜索结果_${lon.toFixed(5)}_${lat.toFixed(5)}`).trim();
    const f = new Feature({
        geometry: new Point(coord),
        type: 'search',
        名称: layerName,
        经度: Number(lon.toFixed(6)),
        纬度: Number(lat.toFixed(6))
    });
    createManagedVectorLayer({
        name: layerName,
        type: 'search',
        sourceType: 'search',
        features: [f],
        styleConfig: SEARCH_RESULT_STYLE,
        autoLabel: true,
        metadata: {
            longitude: Number(lon.toFixed(6)),
            latitude: Number(lat.toFixed(6))
        },
        fitView: false
    });

    // 动画缩放到位置
    mapInstance.value.getView().animate({
        center: coord,
        zoom: Number(payload.zoom) > 0 ? Number(payload.zoom) : 16,
        duration: 700
    });

}

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
    clearInteractions();
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
        drawSource.clear();
        for (let i = userDataLayers.length - 1; i >= 0; i--) {
            if (userDataLayers[i].sourceType === 'draw') {
                mapInstance.value.removeLayer(userDataLayers[i].layer);
                userDataLayers.splice(i, 1);
            }
        }
        refreshUserLayerZIndex();
        emitUserLayersChange();
        mapInstance.value.getOverlays().clear();
        emitGraphicsOverview();
        return;
    }

    const isMeasure = ['MeasureDistance', 'MeasureArea'].includes(type);
    const drawType = type === 'MeasureDistance' ? 'LineString' : (type === 'MeasureArea' ? 'Polygon' : type);

    drawInteraction = new Draw({
        source: drawSource,
        type: drawType,
        style: createStyleFromConfig(drawStyleConfig.value)
    });

    mapInstance.value.addInteraction(drawInteraction);
    snapInteraction = new Snap({ source: drawSource });
    mapInstance.value.addInteraction(snapInteraction);

    if (isMeasure) {
        createTooltips();
        drawInteraction.on('drawstart', (evt) => {
            sketchFeature = evt.feature;
            sketchFeature.getGeometry().on('change', (e) => {
                const geom = e.target;
                let output, tooltipCoord;
                if (geom instanceof Polygon) {
                    output = formatArea(geom);
                    tooltipCoord = geom.getInteriorPoint().getCoordinates();
                } else {
                    output = formatLength(geom);
                    tooltipCoord = geom.getLastCoordinate();
                }
                measureTooltipEl.innerHTML = output;
                measureTooltipOverlay.setPosition(tooltipCoord);
            });
        });
        drawInteraction.on('drawend', () => {
            measureTooltipEl.className = 'ol-tooltip ol-tooltip-static';
            measureTooltipOverlay.setOffset([0, -7]);
            sketchFeature = null;
            measureTooltipEl = null;
            createTooltips(); // 为下一次做准备
            emitGraphicsOverview();
        });
    } else {
        drawInteraction.on('drawend', (evt) => {
            const feature = evt.feature;
            const geom = feature.getGeometry();
            const geomType = geom?.getType?.() || drawType;
            drawSource.removeFeature(feature);

            createManagedVectorLayer({
                name: `绘制_${geomType}_${drawGraphicSeed++}`,
                type: geomType,
                sourceType: 'draw',
                features: [feature],
                styleConfig: drawStyleConfig.value,
                fitView: false
            });
            emitGraphicsOverview();
        });
    }
}

// [隶属] 组件交互-绘图与测量
// [作用] 清理当前激活的绘图/捕捉交互和提示覆盖物。
// [交互] 被 activateInteraction 与外部调用复用。
function clearInteractions() {
    if (!mapInstance.value) return;
    if (drawInteraction) mapInstance.value.removeInteraction(drawInteraction);
    if (snapInteraction) mapInstance.value.removeInteraction(snapInteraction);
    if (helpTooltipOverlay) mapInstance.value.removeOverlay(helpTooltipOverlay);
    drawInteraction = null;
    snapInteraction = null;
    helpTooltipEl = null;
}

// [隶属] 组件交互-绘图与测量
// [作用] 创建测量值提示和操作引导提示覆盖物。
// [交互] 被 activateInteraction(测量模式) 调用。
function createTooltips() {
    if (measureTooltipEl) measureTooltipEl.remove();
    if (helpTooltipEl) helpTooltipEl.remove();

    helpTooltipEl = document.createElement('div');
    helpTooltipEl.className = 'ol-tooltip hidden';
    helpTooltipOverlay = new Overlay({ element: helpTooltipEl, offset: [15, 0], positioning: 'center-left' });
    mapInstance.value.addOverlay(helpTooltipOverlay);

    measureTooltipEl = document.createElement('div');
    measureTooltipEl.className = 'ol-tooltip ol-tooltip-measure';
    measureTooltipOverlay = new Overlay({ element: measureTooltipEl, offset: [0, -15], positioning: 'bottom-center', stopEvent: false });
    mapInstance.value.addOverlay(measureTooltipOverlay);
}

// [隶属] 组件交互-绘图与测量
// [作用] 格式化线长度显示文本。
// [交互] 被测距绘制过程调用。
const formatLength = (line) => {
    const len = getLength(line);
    return len > 100 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(2)} m`;
};
// [隶属] 组件交互-绘图与测量
// [作用] 格式化面面积显示文本。
// [交互] 被测面绘制过程调用。
const formatArea = (poly) => {
    const area = getArea(poly);
    return area > 10000 ? `${(area / 1000000).toFixed(2)} km²` : `${area.toFixed(2)} m²`;
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
    highlightManagedFeature,
    removeUserLayer,
    reorderUserLayers,
    soloUserLayer,
    viewUserLayer,
    zoomToGraphics
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