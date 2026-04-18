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
import { useAttrStore, useWeatherStore } from '../stores';
import { showLoading, hideLoading } from '../utils/loading';
import { apiLogVisit } from '../api/backend';
const message = useMessage();
const attrStore = useAttrStore();
const weatherStore = useWeatherStore();

// 首屏地图初始化 Loading 拦截
showLoading('正在初始化地图与核心环境...');

// ========== 1. 组件导入 ==========
// 同步导入：核心 2D 地图及 UI 组件 (保证首屏速度)
import TopBar from '../components/TopBar.vue';
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
const activeSidePanelTab = ref('toolbox'); // 'info' | 'chat' | 'toolbox' | 'bus' | 'drive'
const userLayers = ref([]);
const featureQueryResult = ref(null);
const showQueryPanel = ref(false);
const toolboxOverview = ref({ drawCount: 0, uploadCount: 0, layers: [] });
const baseLayers = ref([]);
const uploadProgress = ref({ phase: 'idle' });
const latestSearchPoi = ref({});
const activeFeature = ref({ key: 'info', label: '新闻' });

// 组件引用
const mapContainerRef = ref(null);
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
    message.soup();
}

/** 打开 AI 聊天面板 */
function openChat() {
    activeSidePanelTab.value = 'chat';
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
}

function openToolbox() {
    activeSidePanelTab.value = 'toolbox';
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
}

function openBusPlanner() {
    activeSidePanelTab.value = 'bus';
    if (!shouldLoadSidePanel.value) {
        shouldLoadSidePanel.value = true;
    }
    isSidePanelCollapsed.value = false;
}

function openDrivePlanner() {
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
    activeSidePanelTab.value = tab;
}

/** 主地图关键内容就绪后，消除加载状态并在空闲时预加载侧边面板资源。 */
function handleMapCoreReady() {
    hideLoading();
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
            const module = await import('../components/CesiumContainer.vue');
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

onUnmounted(() => {
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
        await apiLogVisit();
    } catch {
        // 访问记录失败不影响主页面使用
    }
});
</script>

<template>
    <div class="home-container">
        <!-- 特效光标 -->
        <MagicCursor :active="isMagicMode" :effect-name="magicEffectData" @toggle-active="(val) => isMagicMode = val" />

        <!-- 顶部控制栏 -->
        <div class="top-section">
            <TopBar
                :is-weather-board-mode="isWeatherBoardMode"
                @activate-magic="handleActivateMagic"
                @toggle-3d="toggle3D"
                @open-chat="openChat"
                @open-toolbox="openToolbox"
                @open-bus="openBusPlanner"
                @open-drive="openDrivePlanner"
                @toggle-weather-board="toggleWeatherBoardMode"
                @activate-feature="handleActivateFeature"
                @jump-view="handleTopBarJumpView"
            />
        </div>

        <PersistentAnnouncementBar />

        <div class="content-section">
            <div class="map-wrapper" :class="{ 'weather-mode': isWeatherBoardMode }">
                <!-- 
                  将用户中心面板移动到 MapContainer 内部/同级，并通过 CSS 设置其位于顶部，避免被底部控件遮挡
                -->
                <FloatingAccountPanel class="home-account-panel" />

                <!-- 
                  优化点：
                  1. MapContainer 使用 v-show。2D地图是核心，需优先加载且切换3D时不销毁(保持状态)。
                  2. CesiumContainer 使用 v-if。3D地图很重，只有需要时才渲染 DOM。
                -->
                <MapContainer
                    ref="mapContainerRef"
                    v-show="!is3DMode && !isWeatherBoardMode"
                    @map-core-ready="handleMapCoreReady"
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

                <component
                    :is="WeatherChartPanel"
                    v-if="isWeatherBoardMode && shouldLoadWeatherChartPanel"
                    class="weather-board-surface"
                />

                <transition name="query-panel-fade">
                    <div v-if="showQueryPanel && !is3DMode && !isWeatherBoardMode" class="query-panel">
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
                <div v-show="is3DMode" class="cesium-wrapper" style="position: absolute; width: 100%; height: 100%; inset: 0; z-index: 5;">
                    <component :is="CesiumContainer" v-if="isCesiumLoaded" />
                </div>
                <div v-if="isCesiumLoading" class="cesium-loading">
                    正在加载 3D 引擎...
                </div>
            </div>

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
    gap: 10px;
    padding: 10px;
    box-sizing: border-box;
    overflow: hidden;
}

.map-wrapper {
    flex: 1;
    background: #e6f7ff;
    border-radius: 12px;
    position: relative;
    overflow: hidden;
    display: flex;
    min-width: 0;
    /* Important for flex items to shrink */
}

.weather-board-surface {
    width: 100%;
    height: 100%;
}

/* 用户中心面板 (由 HomeView 配置覆盖位置) */
:deep(.home-account-panel) {
    position: absolute !important;
    top: 20px !important;
    left: 230px !important; /* 位于鹰眼(左侧, 宽200px)的右侧 */
    bottom: auto !important;
    z-index: 2000 !important; /* 高于地图和其他组件 */
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

:deep(.home-account-panel.is-fullscreen),
:deep(.home-account-panel.is-fullscreen .account-panel) {
    position: fixed !important; /* 改为 fixed 以便脱离 map-wrapper 容器覆盖全屏 */
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 9999 !important; /* 保证全屏时完全处于最高层, 覆盖 TopBar 等 */
    border-radius: 0 !important; /* 全屏不需要圆角 */
}

@media (max-width: 768px) {
    :deep(.home-account-panel) {
        top: 10px !important;
        left: 10px !important;
        /* Mobile adapts tightly and relies on map padding */
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
    border-radius: 12px;
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