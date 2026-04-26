<script setup>
/**
 * HomeView.vue - 主页面组件
 * 
 * 功能：
 * - 2D/3D 地图切换
 * - AI 助手集成
 * - 新闻侧边栏展示
 * - 鼠标特效
 */
import { ref, reactive, defineAsyncComponent, onMounted, onUnmounted, h } from 'vue';
import { useMessage } from '../composables/useMessage';
import { useAttrStore, useWeatherStore, useAppStore, useCompassStore } from '../stores';
import { showLoading, hideLoading } from '../utils/loading';
import { apiLogVisit } from '../api/backend';
const message = useMessage();
const attrStore = useAttrStore();
const weatherStore = useWeatherStore();
const compassStore = useCompassStore();

// 首屏地图初始化 Loading 已由路由守卫管理（Loading Relay）
// showLoading('正在初始化地图与核心环境...'); // 已由 router.beforeEach 接力处理

// ========== 1. 组件导入 ==========
// 同步导入：核心 2D 地图及 UI 组件 (保证首屏速度)
import TopBar from '../components/TopBar.vue';
import ControlsPanel from '@/components/ControlsPanel.vue';
import MapContainer from '../components/MapContainer.vue';
import MagicCursor from '../components/MagicCursor.vue';
import FloatingAccountPanel from '../components/UserCenter/FloatingAccountPanel.vue';
import PersistentAnnouncementBar from '../components/PersistentAnnouncementBar.vue';
import WeatherChartPanel from '../components/WeatherChartPanel.vue';

// Cesium 组件按点击事件懒加载：避免首屏产生 3D 相关请求
const CesiumContainer = ref(null);

const SidePanelLoading = {
    name: 'SidePanelLoading',
    render() {
        return h('div', { class: 'sidepanel-loading-state' }, [
            h('div', { class: 'sidepanel-loading-spinner' }),
            h('span', { class: 'sidepanel-loading-text' }, '侧边面板资源加载中...')
        ]);
    }
};

// 异步导入：SidePanel 组件 (优化：延迟加载图片资源)
const SidePanel = defineAsyncComponent({
    loader: () => import('../components/SidePanel.vue'),
    loadingComponent: SidePanelLoading,
    delay: 0,
    timeout: 15000,
    onError(error, retry, fail, attempts) {
        const text = String(error?.message || error || '');
        const isStaleOptimizeDep = text.includes('Outdated Optimize Dep') || text.includes('Failed to fetch dynamically imported module');
        if (isStaleOptimizeDep && attempts <= 1) {
            retry();
            return;
        }
        message.error('侧边面板加载失败，请刷新页面后重试。');
        fail(error);
    }
});

// 天气看板改为静态导入：规避生产环境动态分块偶发的加载与初始化顺序问题。

// ========== 2. 响应式状态 ==========
// 地图位置信息
const locationInfo = reactive({
    isInDihuan: false,
    lonLat: [0, 0]
});

// UI 状态
const selectedImage = ref('');
const currentNewsIndex = ref(0);
const is3DMode = ref(false);
const isCesiumLoaded = ref(false);
const isCesiumLoading = ref(false);
const isWeatherBoardMode = ref(false);
const shouldLoadWeatherChartPanel = ref(false);
const isMagicMode = ref(false);
const magicEffectData = ref('');
const isSidePanelCollapsed = ref(true);
const shouldLoadSidePanel = ref(false);
const sidePanelWarmupScheduled = ref(false);
const activeSidePanelTab = ref('toolbox'); // 'info' | 'chat' | 'toolbox' | 'bus' | 'drive' | 'compass'
const userLayers = ref([]);
const featureQueryResult = ref(null);
const showQueryPanel = ref(false);
const toolboxOverview = ref({ drawCount: 0, uploadCount: 0, layers: [] });
const baseLayers = ref([]);
const uploadProgress = ref({ phase: 'idle' });
const latestSearchPoi = ref({});
const activeFeature = ref({ key: 'info', label: '新闻' });
const isAccountPanelFullscreen = ref(false);

// 组件引用
const mapContainerRef = ref(null);
const mapCoreLoadingSettled = ref(false);
let sidePanelWarmupTimer = null;
let sidePanelWarmupIdleId = null;

// ========== 3. 事件处理函数 ==========

/** 地图位置变化处理 */
function handleLocationChange(locationData) {
    Object.assign(locationInfo, locationData);

    const lon = Number(locationData?.lon);
    const lat = Number(locationData?.lat);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
        weatherStore.setMapPointTrigger({
            lon,
            lat,
            source: String(locationData?.source || 'location-change')
        });
    }
}

function handleMapClick(locationData) {
    const lon = Number(locationData?.lon);
    const lat = Number(locationData?.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

    weatherStore.setMapPointTrigger({
        lon,
        lat,
        source: String(locationData?.source || 'map-click')
    });
}

/** 更新新闻图片 */
function handleUpdateNewsImage(imageSrc) {
    selectedImage.value = imageSrc;
}

/** 新闻切换处理 */
function handleNewsChanged(newsIndex) {
    currentNewsIndex.value = newsIndex;
}

/** 切换侧边栏展开/收起 */
function toggleSidePanel() {
    // 首次展开时才加载SidePanel组件及其资源
    if (isSidePanelCollapsed.value && !shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = !isSidePanelCollapsed.value;
    if (isSidePanelCollapsed.value) {
        compassStore.setPlacementMode(false);
    }
    message.soup();
}

function stopCompassTransientInteractions() {
    compassStore.setPlacementMode(false);
}

/** 打开 AI 聊天面板 */
function openChat() {
    stopCompassTransientInteractions();
    activeSidePanelTab.value = 'chat';
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
}

function openToolbox() {
    stopCompassTransientInteractions();
    activeSidePanelTab.value = 'toolbox';
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
}

async function openCompassPanel() {
    activeSidePanelTab.value = 'compass';
    compassStore.setEnabled(true);
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
    await compassStore.ensureConfigLoaded();
}

function openBusPlanner() {
    stopCompassTransientInteractions();
    activeSidePanelTab.value = 'bus';
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
}

function openDrivePlanner() {
    stopCompassTransientInteractions();
    activeSidePanelTab.value = 'drive';
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
}

function getMapUserLocation(enableHighAccuracy = true) {
    return mapContainerRef.value?.getCurrentLocation?.(enableHighAccuracy);
}

function startBusPointPick(type) {
    return mapContainerRef.value?.startBusPointPick?.(type);
}

function drawRouteOnMap(route) {
    return mapContainerRef.value?.drawRouteOnMap?.(route);
}

function zoomToBusRouteStep(stepIndex) {
    return mapContainerRef.value?.zoomToBusRouteStep?.(stepIndex);
}

function previewBusRouteStep(stepIndex) {
    return mapContainerRef.value?.previewBusRouteStep?.(stepIndex);
}

function clearBusRouteStepPreview() {
    return mapContainerRef.value?.clearBusRouteStepPreview?.();
}

function drawDriveRouteOnMap(routeLatLonStr) {
    return mapContainerRef.value?.drawDriveRouteOnMap?.(routeLatLonStr);
}

function zoomToDriveRouteStep(stepIndex) {
    return mapContainerRef.value?.zoomToDriveRouteStep?.(stepIndex);
}

function previewDriveRouteStep(stepIndex) {
    return mapContainerRef.value?.previewDriveRouteStep?.(stepIndex);
}

function clearDriveRouteStepPreview() {
    return mapContainerRef.value?.clearDriveRouteStepPreview?.();
}

function handleActivateFeature(feature) {
    activeFeature.value = feature || { key: 'info', label: '新闻' };
}

function handleSwitchSidePanelTab(tab) {
    if (tab !== 'compass') {
        stopCompassTransientInteractions();
    }
    activeSidePanelTab.value = tab;
}

function handleAccountPanelFullscreenChange(fullscreen) {
    isAccountPanelFullscreen.value = Boolean(fullscreen);
}

/** 主地图关键内容就绪后，消除加载状态并在空闲时预加载侧边面板资源。 */
function settleMapCoreLoading(payload = {}) {
    if (mapCoreLoadingSettled.value) return;
    mapCoreLoadingSettled.value = true;
    
    const appStore = useAppStore();
    appStore.markGisInitComplete();
    
    hideLoading();

    if (payload?.isError) {
        const detail = String(payload?.message || '').trim();
        message.error(detail || '地图资源加载失败，请刷新页面后重试。');
    }
}

/** 主地图关键内容就绪后，消除加载状态并在空闲时预加载侧边面板资源。 */
function handleMapCoreReady() {
    settleMapCoreLoading();
    if (sidePanelWarmupScheduled.value || shouldLoadSidePanel.value) return;
    sidePanelWarmupScheduled.value = true;

    const preloadSidePanel = () => {
        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
    };

    const queuePreload = () => {
        if (typeof window === 'undefined') return;
        sidePanelWarmupTimer = window.setTimeout(preloadSidePanel, 900);
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        sidePanelWarmupIdleId = window.requestIdleCallback(queuePreload, { timeout: 2200 });
    } else {
        queuePreload();
    }
}

function handleMapCoreFailed(payload = {}) {
    settleMapCoreLoading({
        isError: true,
        message: String(payload?.message || '').trim() || '地图初始化失败，请检查网络后重试。'
    });
}

/** 关闭 AI 聊天，切换回新闻模式 */
function handleCloseChat() {
    activeSidePanelTab.value = 'info';
    activeFeature.value = { key: 'info', label: '新闻' };
}

function toggleWeatherBoardMode() {
    const openingWeather = !isWeatherBoardMode.value;

    if (openingWeather && !shouldLoadWeatherChartPanel.value) {
        shouldLoadWeatherChartPanel.value = true;
    }

    isWeatherBoardMode.value = openingWeather;

    if (openingWeather) {
        is3DMode.value = false;
        activeFeature.value = { key: 'weather-board', label: '天气看板' };
    } else {
        activeFeature.value = { key: 'map', label: '地图视图' };
    }
}

/** 切换 2D/3D 视图 */
async function toggle3D() {
    if (isWeatherBoardMode.value) {
        isWeatherBoardMode.value = false;
    }

    if (is3DMode.value) {
        is3DMode.value = false;
        return;
    }

    if (!isCesiumLoaded.value && !isCesiumLoading.value) {
        isCesiumLoading.value = true;
        showLoading('正在加载 3D 引擎资源...');
        try {
            // const module = await import('../components/Cesium/CesiumContainer.vue');
            const module = await import('../components/Cesium/CesiumContainer.vue');
            CesiumContainer.value = module.default;
            isCesiumLoaded.value = true;
        } catch (error) {
            message.error('Cesium 组件加载失败', error);
            return;
        } finally {
            isCesiumLoading.value = false;
            hideLoading();
        }
    }

    if (isCesiumLoaded.value) {
        is3DMode.value = true;
    }
}

/** 开启特定魔法特效 */
function handleActivateMagic(effectName) {
    if (effectName === 'off') {
        isMagicMode.value = false;
        magicEffectData.value = '';
    } else {
        isMagicMode.value = true;
        magicEffectData.value = effectName;
    }
}

/** 处理文件上传 */
async function handleUploadData(data) {
    showLoading('正在导入 GIS 数据资源...');
    try {
        await Promise.resolve(mapContainerRef.value?.addUserDataLayer(data));
    } finally {
        hideLoading();
    }
}

/** 处理地图交互工具 */
function handleInteraction(type) {
    mapContainerRef.value?.activateInteraction(type);
}

function handleToggleLayerVisibility({ layerId, visible }) {
    mapContainerRef.value?.setUserLayerVisibility(layerId, visible);
}

function handleChangeLayerOpacity({ layerId, opacity }) {
    mapContainerRef.value?.setUserLayerOpacity(layerId, opacity);
}

function handleSetBaseLayer(layerId) {
    mapContainerRef.value?.setBaseLayerActive(layerId);
}

function handleToggleBaseLayerVisibility({ layerId, visible }) {
    mapContainerRef.value?.setLayerVisibility(layerId, visible);
}

function handleZoomLayer(layerId) {
    mapContainerRef.value?.zoomToUserLayer(layerId);
}

function handleViewLayer(layerId) {
    mapContainerRef.value?.viewUserLayer(layerId);
}

function handleRemoveLayer(layerId) {
    mapContainerRef.value?.removeUserLayer(layerId);
}

function handleReorderUserLayers(payload) {
    mapContainerRef.value?.reorderUserLayers(payload);
}

function handleSoloLayer(layerId) {
    mapContainerRef.value?.soloUserLayer(layerId);
}

function handleApplyStyleTemplate(payload) {
    mapContainerRef.value?.applyStyleTemplate(payload);
}

function handleUpdateDrawStyle(styleConfig) {
    mapContainerRef.value?.setDrawStyle(styleConfig);
}

function handleUpdateLayerStyle(payload) {
    mapContainerRef.value?.setUserLayerStyle(payload);
}

function handleHighlightAttributeFeature(payload) {
    mapContainerRef.value?.highlightManagedFeature?.(payload);
}

function handleZoomAttributeFeature(payload) {
    mapContainerRef.value?.zoomToManagedFeature?.(payload);
}

function handleToggleLayerLabelVisibility(payload) {
    mapContainerRef.value?.setUserLayerLabelVisibility(payload);
}

/**
 * 处理用户输入坐标绘制点位
 */
function handleDrawPointByCoordinates(payload) {
    mapContainerRef.value?.drawPointByCoordinatesInput(payload);
}

/**
 * 处理用户手动粘贴高德详情 JSON 并绘制 AOI
 */
function handleDrawAmapAoiFromJson(payload) {
    try {
        mapContainerRef.value?.drawAmapAoiByDetailJsonInput?.(payload);
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'AOI 解析失败';
        message.warning(`AOI 解析失败：${detail}`);
    }
}

/**
 * 处理搜索结果图层的坐标系切换
 */
function handleToggleLayerCRS(payload) {
    mapContainerRef.value?.toggleLayerCRS?.(payload);
}

/**
 * 导出图层坐标数据（CSV/TXT）
 */
function handleExportLayerData(payload) {
    mapContainerRef.value?.exportLayerCoordinates?.(payload);
}

function handleUserLayersChange(layers) {
    userLayers.value = layers || [];
    attrStore.syncLayers(userLayers.value);
}

function handleGraphicsOverview(data) {
    toolboxOverview.value = data || { drawCount: 0, uploadCount: 0, layers: [] };
}

function handleBaseLayersChange(layers) {
    baseLayers.value = layers || [];
}

function handleTopBarJumpView(lng, lat, z, layer) {
    mapContainerRef.value?.updateViewByParams?.(lng, lat, z, layer);
}

function handleUploadProgressChange(progress) {
    uploadProgress.value = progress || { phase: 'idle' };
}

function handleSearchPoiSelected(poiPayload) {
    const service = String(poiPayload?.service || '').trim().toLowerCase();
    if (service && service !== 'amap') return;
    const poiid = String(poiPayload?.poiid || '').trim();

    latestSearchPoi.value = {
        ...poiPayload,
        poiid,
        _syncAt: Date.now()
    };
}

function closeQueryPanel() {
    showQueryPanel.value = false;
}

/** 处理图层被选中事件 */
function handleLayerSelected(layerId) {
    mapContainerRef.value?.highlightUserLayer?.(layerId);
}

/** 处理要素选中事件 */
function handleFeatureSelected(properties) {
    if (!properties) return;
    featureQueryResult.value = properties;
    showQueryPanel.value = true;
}

async function buildVisitLogPayload() {
    const payload = {
        geo_permission: 'unknown',
        gps_lng: null,
        gps_lat: null,
        gps_accuracy: null,
        gps_timestamp: '',
        gps_error: ''
    };

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return payload;
    }

    if (!navigator.geolocation) {
        payload.geo_permission = 'unsupported';
        payload.gps_error = 'geolocation-not-supported';
        return payload;
    }

    try {
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
            payload.geo_permission = String(permissionStatus?.state || 'unknown');
        }
    } catch {
        // ignore permission API read errors
    }

    const shouldTryGps = (
        payload.geo_permission === 'granted'
        || payload.geo_permission === 'prompt'
        || payload.geo_permission === 'unknown'
    );

    if (!shouldTryGps) {
        return payload;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 3500,
                maximumAge: 60000
            });
        });

        payload.geo_permission = 'granted';
        payload.gps_lng = Number(position?.coords?.longitude);
        payload.gps_lat = Number(position?.coords?.latitude);
        payload.gps_accuracy = Number(position?.coords?.accuracy);
        payload.gps_timestamp = new Date(position?.timestamp || Date.now()).toISOString();
    } catch (error) {
        const code = Number(error?.code || 0);
        if (code === 1) {
            payload.geo_permission = 'denied';
        }
        payload.gps_error = String(error?.message || `geolocation-error-${code}`).slice(0, 250);
    }

    return payload;
}

function syncVisitPosCodeToUrl(encodedPos) {
    if (typeof window === 'undefined') return;

    const normalizedCode = String(encodedPos || '').trim() || '0';

    try {
        const hash = String(window.location.hash || '#/home');
        const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
        const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
        const hashPath = hashPathRaw || '/home';
        const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
        const params = new URLSearchParams(hashQueryRaw);

        params.set('p', normalizedCode);

        if (normalizedCode !== '0' && String(params.get('loc') || '').trim() === '') {
            params.set('loc', '1');
        }

        const nextHashQuery = params.toString();
        const nextHash = nextHashQuery
            ? `#${normalizedHashPath}?${nextHashQuery}`
            : `#${normalizedHashPath}`;

        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
        // URL 写入失败时不阻断主流程
    }
}

onUnmounted(() => {
    settleMapCoreLoading();

    if (typeof window === 'undefined') return;

    if (sidePanelWarmupIdleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(sidePanelWarmupIdleId);
        sidePanelWarmupIdleId = null;
    }

    if (sidePanelWarmupTimer !== null) {
        window.clearTimeout(sidePanelWarmupTimer);
        sidePanelWarmupTimer = null;
    }
});

onMounted(async () => {
    try {
        const visitPayload = await buildVisitLogPayload();
        const visitResponse = await apiLogVisit(visitPayload);
        const encodedPos = String(visitResponse?.data?.encoded_pos || '0');
        syncVisitPosCodeToUrl(encodedPos);
    } catch {
        // 访问记录失败不影响主页面使用
    }
});
</script>

<template>
    <div class="home-container">
        <!-- 特效光标遮罩 -->
        <MagicCursor :active="isMagicMode" :effect-name="magicEffectData" @toggle-active="(val) => isMagicMode = val" />

        <!-- 顶部控制栏 -->
        <div class="top-section">
            <TopBar
                :is-weather-board-mode="isWeatherBoardMode"
                @activate-magic="handleActivateMagic"
                @toggle-3d="toggle3D"
                @open-chat="openChat"
                @open-toolbox="openToolbox"
                @open-compass="openCompassPanel"
                @open-bus="openBusPlanner"
                @open-drive="openDrivePlanner"
                @toggle-weather-board="toggleWeatherBoardMode"
                @activate-feature="handleActivateFeature"
                @jump-view="handleTopBarJumpView"
            />
        </div>

        <!-- 持续公告栏 -->
        <PersistentAnnouncementBar />

        <div class="content-section">
            <!-- 侧边控制栏（左）-->
            <div class="Control-panel">
                <ControlsPanel  />
            </div>

            <!-- 地图2D、3D、天气面板容器 -->
            <div class="map-wrapper" :class="{ 'weather-mode': isWeatherBoardMode, 'account-fullscreen': isAccountPanelFullscreen }">
                <!-- 
                  将用户中心面板移动到 MapContainer 内部/同级，并通过 CSS 设置其位于顶部，避免被底部控件遮挡
                -->
                <FloatingAccountPanel
                    class="home-account-panel"
                    @fullscreen-change="handleAccountPanelFullscreenChange"
                />

                <!-- 
                  优化点：
                  1. MapContainer 使用 v-show。2D地图是核心，需优先加载且切换3D时不销毁(保持状态)。
                  2. CesiumContainer 使用 v-if。3D地图很重，只有需要时才渲染 DOM。
                -->
                <Suspense>
                    <template #default>
                        <MapContainer
                            ref="mapContainerRef"
                            v-show="!is3DMode && !isWeatherBoardMode && !isAccountPanelFullscreen"
                            @map-core-ready="handleMapCoreReady"
                            @map-core-failed="handleMapCoreFailed"
                            @location-change="handleLocationChange"
                            @search-poi-selected="handleSearchPoiSelected"
                            @map-click="handleMapClick"
                            @update-news-image="handleUpdateNewsImage"
                            @feature-selected="handleFeatureSelected"
                            @user-layers-change="handleUserLayersChange"
                            @graphics-overview="handleGraphicsOverview"
                            @upload-progress-change="handleUploadProgressChange"
                            @base-layers-change="handleBaseLayersChange"
                        />
                    </template>
                    <template #fallback>
                        <div
                            v-show="!is3DMode && !isWeatherBoardMode && !isAccountPanelFullscreen"
                            class="map-runtime-loading"
                        >
                            地图核心资源加载中...
                        </div>
                    </template>
                </Suspense>

                <component
                    :is="WeatherChartPanel"
                    v-if="isWeatherBoardMode && shouldLoadWeatherChartPanel && !isAccountPanelFullscreen"
                    class="weather-board-surface"
                />

                <transition name="query-panel-fade">
                    <div v-if="showQueryPanel && !is3DMode && !isWeatherBoardMode && !isAccountPanelFullscreen" class="query-panel">
                        <div class="query-panel-header">
                            <div>
                                <div class="query-title">属性查询结果</div>
                                <div class="query-subtitle">
                                    绘制 {{ toolboxOverview.drawCount }} | 上传 {{ toolboxOverview.uploadCount }}
                                </div>
                            </div>
                            <button class="query-close" @click="closeQueryPanel">×</button>
                        </div>
                        <div class="query-panel-body">
                            <div
                                v-for="([key, value], idx) in Object.entries(featureQueryResult || {})"
                                :key="`${key}_${idx}`"
                                class="query-row"
                            >
                                <span class="query-key">{{ key }}</span>
                                <span class="query-val">{{ value }}</span>
                            </div>
                            <div v-if="Object.keys(featureQueryResult || {}).length === 0" class="query-empty">
                                当前要素没有可展示属性
                            </div>
                        </div>
                    </div>
                </transition>

                <!-- 点击后按需加载的 Cesium 组件（外层包裹 div 解决 Vue 3 Fragment 的 v-show 穿透失效问题） -->
                <div v-show="is3DMode && !isAccountPanelFullscreen" class="cesium-wrapper" style="position: absolute; width: 100%; height: 100%; inset: 0; z-index: 5;">
                    <component :is="CesiumContainer" v-if="isCesiumLoaded" />
                </div>
                <div v-if="isCesiumLoading && !isAccountPanelFullscreen" class="cesium-loading">
                    正在加载 3D 引擎...
                </div>
            </div>

            <!-- 侧边容器栏（右）-->
            <div class="side-panel-wrapper" :class="{ 'collapsed': isSidePanelCollapsed, 'weather-mode': isWeatherBoardMode }">
                <!-- 使用v-if延迟加载SidePanel，避免初始化时加载大量图片资源 -->
                <SidePanel v-if="shouldLoadSidePanel" :locationInfo="locationInfo" :selectedImage="selectedImage"
                    :isCollapsed="isSidePanelCollapsed" :activeTab="activeSidePanelTab"
                    :activeFeature="activeFeature" :userLayers="userLayers" :baseLayers="baseLayers"
                    :toolboxOverview="toolboxOverview" :uploadProgress="uploadProgress" :latest-search-poi="latestSearchPoi" :get-user-location="getMapUserLocation"
                    :start-bus-point-pick="startBusPointPick"
                    :draw-route-on-map="drawRouteOnMap"
                    :zoom-to-bus-route-step="zoomToBusRouteStep"
                    :preview-bus-route-step="previewBusRouteStep"
                    :clear-bus-route-step-preview="clearBusRouteStepPreview"
                    :draw-drive-route-on-map="drawDriveRouteOnMap"
                    :zoom-to-drive-route-step="zoomToDriveRouteStep"
                    :preview-drive-route-step="previewDriveRouteStep"
                    :clear-drive-route-step-preview="clearDriveRouteStepPreview"
                    @upload-data="handleUploadData" @interaction="handleInteraction"
                    @toggle-layer-visibility="handleToggleLayerVisibility"
                    @change-layer-opacity="handleChangeLayerOpacity" @set-base-layer="handleSetBaseLayer"
                    @toggle-base-layer-visibility="handleToggleBaseLayerVisibility"
                    @toggle-layer-label-visibility="handleToggleLayerLabelVisibility"
                    @zoom-layer="handleZoomLayer" @view-layer="handleViewLayer"
                    @remove-layer="handleRemoveLayer" @reorder-user-layers="handleReorderUserLayers"
                    @solo-layer="handleSoloLayer" @apply-style-template="handleApplyStyleTemplate"
                    @update-draw-style="handleUpdateDrawStyle" @update-layer-style="handleUpdateLayerStyle"
                    @highlight-attribute-feature="handleHighlightAttributeFeature"
                    @zoom-attribute-feature="handleZoomAttributeFeature"
                    @layer-selected="handleLayerSelected"
                    @draw-point-by-coordinates="handleDrawPointByCoordinates"
                    @draw-amap-aoi-from-json="handleDrawAmapAoiFromJson"
                    @toggle-layer-crs="handleToggleLayerCRS"
                    @export-layer-data="handleExportLayerData"
                    @switch-tab="handleSwitchSidePanelTab"
                    @news-changed="handleNewsChanged" @toggle-panel="toggleSidePanel"
                    @close-chat="handleCloseChat">
                    <template v-slot:extra-content>
                        <div class="extra-info">
                            <h3>提示</h3>
                            <p>缩放地图以查看更多细节</p>
                        </div>
                    </template>
                </SidePanel>
                <!-- 未加载时显示展开提示 -->
                <div v-else class="panel-placeholder" @click="toggleSidePanel">
                    <div class="placeholder-content">
                        <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                        <span class="placeholder-text">展开</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 
   CSS 样式 
*/
.home-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    background: #368a3a9e;
    overflow: hidden;
}

.top-section {
    height: 60px;
    /* Fixed height for top bar */
    flex-shrink: 0;
    width: 100%;
    background: #f5f5f5;
    z-index: 50;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.content-section {
    display: flex;
    flex: 1;
    width: 100%;
    min-height: 0;
    /* gap: 5px;
    padding: 5px; */
    box-sizing: border-box;
    overflow: hidden;
}
.Control-panel {
    width: 0px;
    /* Fixed width for left control panel */
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0px 0;
    background: #ffffffcc;
    /* border-radius: 10px; */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.map-wrapper {
    flex: 1;
    background: #e6f7ff;
    border-radius: 10px;
    position: relative;
    isolation: isolate;
    overflow: hidden;
    display: flex;
    min-width: 0;
    margin: 5px;
    /* Important for flex items to shrink */
}

.map-runtime-loading {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, rgba(236, 248, 238, 0.9), rgba(216, 239, 220, 0.88));
    color: #1f5e2a;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.3px;
}

.weather-board-surface {
    width: 100%;
    height: 100%;
}

/* 用户中心面板 (由 HomeView 配置覆盖位置) */
:deep(.home-account-panel) {
    position: absolute !important;
    top: 10px !important;
    left: 265px !important; /* 位于鹰眼(左侧, 宽200px)的右侧 */
    bottom: auto !important;
    z-index: 2200 !important; /* 高于地图和其他组件 */
    flex-direction: column !important; /* 调整流向为向下展开 */
}

/* 设置向下展开的动画源点及过渡方向 */
:deep(.home-account-panel .account-panel) {
    transform-origin: top left !important;
}

:deep(.home-account-panel .account-panel-transition-enter-from),
:deep(.home-account-panel .account-panel-transition-leave-to) {
    transform: translateY(-20px) scale(0.96) !important;
}

:deep(.home-account-panel.is-fullscreen) {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    z-index: 5000 !important; /* 在 map-wrapper 内封顶 */
    gap: 0 !important;
}

:deep(.home-account-panel.is-fullscreen .account-panel) {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    z-index: 5001 !important;
    border-radius: 12px !important;
    clip-path: none !important;
}

@media (max-width: 768px) {
    :deep(.home-account-panel) {
        top: 140px !important;
        left: 5px !important;
        /* Mobile adapts tightly and relies on map padding */
    }
    /* 隐藏控制面板 */
    .Control-panel {
        display: none;
    }
}

/* 如果覆盖地图默认放大缩小控件，将其推开 */
:deep(.ol-zoom) {
    top: 100px !important;
    left: 20px !important;
}
:deep(.cesium-viewer-toolbar) {
    top: 80px !important;
}

.cesium-loading {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    color: #fff;
    font-size: 16px;
    font-weight: 600;
}

.weather-loading-state {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    background: rgba(31, 109, 56, 0.15);
    color: #1f5a37;
    z-index: 22;
}

.weather-loading-spinner {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 3px solid rgba(44, 133, 76, 0.22);
    border-top-color: #2d8a4f;
    animation: weather-spin 0.9s linear infinite;
}

.weather-loading-text {
    font-size: 13px;
    font-weight: 600;
    color: #2d6a46;
}

@keyframes weather-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.query-panel {
    position: absolute;
    left: 16px;
    bottom: 16px;
    width: 320px;
    max-height: 42vh;
    background: rgba(30, 120, 56, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    color: #fff;
    z-index: 1200;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
}

.query-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.query-title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
}

.query-subtitle {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.85);
    margin-top: 2px;
}

.query-close {
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 18px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
}

.query-close:hover {
    background: rgba(255, 255, 255, 0.24);
}

.query-panel-body {
    padding: 10px 12px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.query-row {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 8px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 7px 8px;
}

.query-key {
    color: rgba(255, 255, 255, 0.84);
    font-size: 12px;
    font-weight: 600;
}

.query-val {
    color: #fff;
    font-size: 12px;
    word-break: break-word;
}

.query-empty {
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
    padding: 8px 0;
}

.query-panel-fade-enter-active,
.query-panel-fade-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.query-panel-fade-enter-from,
.query-panel-fade-leave-to {
    opacity: 0;
    transform: translateY(10px);
}

.side-panel-wrapper {
    width: 350px;
    flex-shrink: 0;
    background: #f5f5f5;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: width 0.3s ease, height 0.3s ease;
}

.side-panel-wrapper.collapsed {
    width: 20px;
}

/* 侧边栏占位符样式 */
.panel-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: linear-gradient(135deg, rgba(24, 144, 255, 0.05) 0%, rgba(24, 144, 255, 0.15) 100%);
    border-left: 3px solid rgba(24, 144, 255, 0.3);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

.panel-placeholder::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: left 0.6s ease;
}

.panel-placeholder:hover {
    background: linear-gradient(135deg, rgba(24, 144, 255, 0.1) 0%, rgba(24, 144, 255, 0.25) 100%);
    border-left-color: rgba(24, 144, 255, 0.6);
    box-shadow: inset 0 0 20px rgba(24, 144, 255, 0.1);
}

.panel-placeholder:hover::before {
    left: 100%;
}

.panel-placeholder:active {
    transform: scale(0.98);
}

.placeholder-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 6px;
}

.placeholder-icon {
    width: 28px;
    height: 28px;
    color: #1890ff;
    transition: all 0.3s ease;
    filter: drop-shadow(0 2px 4px rgba(24, 144, 255, 0.2));
}

.panel-placeholder:hover .placeholder-icon {
    color: #096dd9;
    transform: translateX(-3px);
    filter: drop-shadow(0 3px 6px rgba(24, 144, 255, 0.4));
}

.placeholder-text {
    writing-mode: vertical-rl;
    font-size: 13px;
    font-weight: 600;
    color: #1890ff;
    letter-spacing: 2px;
    text-shadow: 0 1px 2px rgba(24, 144, 255, 0.1);
    transition: all 0.3s ease;
}

.panel-placeholder:hover .placeholder-text {
    color: #096dd9;
    text-shadow: 0 2px 4px rgba(24, 144, 255, 0.2);
}

.sidepanel-loading-state {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: linear-gradient(135deg, rgba(24, 144, 255, 0.08) 0%, rgba(24, 144, 255, 0.18) 100%);
}

.sidepanel-loading-spinner {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(24, 144, 255, 0.25);
    border-top-color: #1890ff;
    animation: sidepanel-spin 0.8s linear infinite;
}

.sidepanel-loading-text {
    font-size: 12px;
    color: #096dd9;
    font-weight: 600;
}

@keyframes sidepanel-spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
    .content-section {
        flex-direction: column;
        padding: 5px;
        gap: 5px;
    }

    .map-wrapper {
        flex: 1;
        /* Map takes available space */
        min-height: 50vh;
        /* Ensure map has height */
    }

    .map-wrapper.weather-mode {
        min-height: 58vh;
    }

    .query-panel {
        width: calc(100% - 20px);
        left: 10px;
        bottom: 10px;
        max-height: 36vh;
    }

    .query-row {
        grid-template-columns: 90px 1fr;
    }

    .side-panel-wrapper {
        width: 100%;
        height: 40vh;
        /* Fixed height for bottom panel on mobile */
        flex: none;
    }

    .side-panel-wrapper.weather-mode {
        height: 32vh;
    }

    .side-panel-wrapper.collapsed {
        height: 20px;
        width: 100%;
    }

    /* 移动端占位符横向布局 */
    .placeholder-content {
        flex-direction: row;
        padding: 8px 16px;
        justify-content: center;
    }

    .placeholder-icon {
        width: 24px;
        height: 24px;
        transform: rotate(90deg);
    }

    .panel-placeholder:hover .placeholder-icon {
        transform: rotate(90deg) translateY(-3px);
    }

    .placeholder-text {
        writing-mode: horizontal-tb;
        font-size: 14px;
        letter-spacing: 1px;
    }
}

.extra-info {
    padding: 10px;
    background: #eee;
    border-radius: 4px;
    margin-top: 10px;
}
</style>