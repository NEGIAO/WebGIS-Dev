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
import { ref, reactive, defineAsyncComponent } from 'vue';

// ========== 1. 组件导入 ==========
// 同步导入：核心 2D 地图及 UI 组件 (保证首屏速度)
import TopBar from '../components/TopBar.vue';
import MapContainer from '../components/MapContainer.vue';
import MagicCursor from '../components/MagicCursor.vue';

// Cesium 组件按点击事件懒加载：避免首屏产生 3D 相关请求
const CesiumContainer = ref(null);

// 异步导入：SidePanel 组件 (优化：延迟加载图片资源)
const SidePanel = defineAsyncComponent(() =>
    import('../components/SidePanel.vue')
);

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
const isMagicMode = ref(false);
const isSidePanelCollapsed = ref(true);
const shouldLoadSidePanel = ref(false);
const activeSidePanelTab = ref('toolbox'); // 'info' | 'chat' | 'toolbox' | 'bus' | 'drive'
const userLayers = ref([]);
const featureQueryResult = ref(null);
const showQueryPanel = ref(false);
const toolboxOverview = ref({ drawCount: 0, uploadCount: 0, layers: [] });
const baseLayers = ref([]);
const uploadProgress = ref({ phase: 'idle' });
const activeFeature = ref({ key: 'info', label: '新闻' });

// 组件引用
const mapContainerRef = ref(null);

// ========== 3. 事件处理函数 ==========

/** 地图位置变化处理 */
function handleLocationChange(locationData) {
    Object.assign(locationInfo, locationData);
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

/** 关闭 AI 聊天，切换回新闻模式 */
function handleCloseChat() {
    activeSidePanelTab.value = 'info';
    activeFeature.value = { key: 'info', label: '新闻' };
}

/** 切换 2D/3D 视图 */
async function toggle3D() {
    if (is3DMode.value) {
        is3DMode.value = false;
        return;
    }

    if (!isCesiumLoaded.value && !isCesiumLoading.value) {
        isCesiumLoading.value = true;
        try {
            const module = await import('../components/CesiumContainer.vue');
            CesiumContainer.value = module.default;
            isCesiumLoaded.value = true;
        } catch (error) {
            console.error('Cesium 组件加载失败', error);
            return;
        } finally {
            isCesiumLoading.value = false;
        }
    }

    if (isCesiumLoaded.value) {
        is3DMode.value = true;
    }
}

/** 切换鼠标特效 */
function toggleMagic() {
    isMagicMode.value = !isMagicMode.value;
}

/** 处理文件上传 */
function handleUploadData(data) {
    mapContainerRef.value?.addUserDataLayer(data);
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

function handleUserLayersChange(layers) {
    userLayers.value = layers || [];
}

function handleGraphicsOverview(data) {
    toolboxOverview.value = data || { drawCount: 0, uploadCount: 0, layers: [] };
}

function handleBaseLayersChange(layers) {
    baseLayers.value = layers || [];
}

function handleUploadProgressChange(progress) {
    uploadProgress.value = progress || { phase: 'idle' };
}

function closeQueryPanel() {
    showQueryPanel.value = false;
}

/** 处理要素选中事件 */
function handleFeatureSelected(properties) {
    if (!properties) return;
    featureQueryResult.value = properties;
    showQueryPanel.value = true;
}
</script>

<template>
    <div class="home-container">
        <!-- 特效光标 -->
        <MagicCursor :active="isMagicMode" />

        <!-- 顶部控制栏 -->
        <div class="top-section">
            <TopBar
                @toggle-magic="toggleMagic"
                @toggle-3d="toggle3D"
                @open-chat="openChat"
                @open-toolbox="openToolbox"
                @open-bus="openBusPlanner"
                @open-drive="openDrivePlanner"
                @activate-feature="handleActivateFeature"
            />
        </div>

        <div class="content-section">
            <div class="map-wrapper">
                <!-- 
                  优化点：
                  1. MapContainer 使用 v-show。2D地图是核心，需优先加载且切换3D时不销毁(保持状态)。
                  2. CesiumContainer 使用 v-if。3D地图很重，只有需要时才渲染 DOM。
                -->
                <MapContainer
                    ref="mapContainerRef"
                    v-show="!is3DMode"
                    @location-change="handleLocationChange"
                    @update-news-image="handleUpdateNewsImage"
                    @feature-selected="handleFeatureSelected"
                    @user-layers-change="handleUserLayersChange"
                    @graphics-overview="handleGraphicsOverview"
                    @upload-progress-change="handleUploadProgressChange"
                    @base-layers-change="handleBaseLayersChange"
                />

                <transition name="query-panel-fade">
                    <div v-if="showQueryPanel && !is3DMode" class="query-panel">
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

                <!-- 点击后按需加载的 Cesium 组件 -->
                <component :is="CesiumContainer" v-if="is3DMode && isCesiumLoaded" />
                <div v-if="isCesiumLoading" class="cesium-loading">
                    正在加载 3D 引擎...
                </div>
            </div>

            <div class="side-panel-wrapper" :class="{ 'collapsed': isSidePanelCollapsed }">
                <!-- 使用v-if延迟加载SidePanel，避免初始化时加载大量图片资源 -->
                <SidePanel v-if="shouldLoadSidePanel" :locationInfo="locationInfo" :selectedImage="selectedImage"
                    :isCollapsed="isSidePanelCollapsed" :activeTab="activeSidePanelTab"
                    :activeFeature="activeFeature" :userLayers="userLayers" :baseLayers="baseLayers"
                    :toolboxOverview="toolboxOverview" :uploadProgress="uploadProgress" :get-user-location="getMapUserLocation"
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
    height: calc(100vh - 60px);
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