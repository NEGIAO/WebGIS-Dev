<template>
    <div class="home-container">
        <!-- 特效光标遮罩 -->
        <MagicCursor
            :active="isMagicMode"
            :effect-name="magicEffectData"
            @toggle-active="handleToggleMagicActive"
        />

        <!-- 顶部栏菜单栏 -->
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
                @open-buildings="openBuildingsPanel"
                @toggle-weather-board="toggleWeatherBoardMode"
                @activate-feature="handleActivateFeature"
                @jump-view="handleTopBarJumpView"
                @toggle-account-center="handleToggleAccountPanel"
            />
        </div>

        <!-- 系统公告栏 -->
        <PersistentAnnouncementBar />

        <div class="content-section">
            <!-- 侧边控制栏（左）-->
            <div class="Control-panel">
                <ControlsPanel
                    :user-layers="userLayers"
                    :custom-basemap-url="sharedCustomBasemapUrl"
                    :engine="is3DMode ? 'cesium' : 'ol'"
                    @open-tab="handleControlsOpenTab"
                    @toggle-tab="handleControlsToggleTab"
                    @open-toolbox-tab="handleControlsToggleToolboxTab"
                    @map-interaction="handleControlsMapInteraction"
                    @draw-style-change="handleControlsDrawStyleChange"
                    @draw-edit-action="handleControlsDrawEditAction"
                    @cesium-draw-action="handleCesiumDrawAction"
                    @show-analysis="handleControlsShowAnalysis"
                    @district-select="handleControlsDistrictSelect"
                    @enable-basemap-swipe="handleEnableBasemapSwipe"
                    @spatial-analysis="handleSpatialAnalysis"
                />
            </div>

            <!-- 地图2D、3D、天气面板容器 -->
            <div
                class="map-wrapper"
                :class="{
                    'weather-mode': isWeatherBoardMode,
                    'account-fullscreen': isAccountPanelFullscreen,
                }"
            >
                <!--
                    将用户中心面板移动到 MapContainer 内部/同级，并通过 CSS 设置其位于顶部，避免被底部控件遮挡
                -->
                <FloatingAccountPanel
                    v-model:open="isAccountPanelOpen"
                    class="home-account-panel"
                    :show-fab="false"
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
                            v-show="!is3DMode && !isAccountPanelFullscreen"
                            ref="mapContainerRef"
                            :url-sync-enabled="!is3DMode && !isEngineSwitching"
                            @map-core-ready="handleMapCoreReady"
                            @map-core-failed="handleMapCoreFailed"
                            @location-change="handleLocationChange"
                            @search-poi-selected="handleSearchPoiSelected"
                            @feature-selected="handleFeatureSelected"
                            @service-feature-query="handleServiceFeatureQuery"
                            @user-layers-change="handleUserLayersChange"
                            @graphics-overview="handleGraphicsOverview"
                            @upload-progress-change="handleUploadProgressChange"
                            @upload-data="handleUploadData"
                            @base-layers-change="handleBaseLayersChange"
                            @view-sync="handleViewSync"
                        />
                    </template>
                </Suspense>

                <transition name="query-panel-fade">
                    <div
                        v-if="
                            showQueryPanel &&
                            !is3DMode &&
                            !isAccountPanelFullscreen
                        "
                        class="eco-query-panel"
                    >
                        <!-- 头部：使用顶栏主题色 -->
                        <div class="eco-header">
                            <div class="header-content">
                                <i class="icon-leaf"><Leaf :size="16" /></i>
                                <span class="eco-title">{{ t('home.attrInfo') }}</span>
                            </div>
                            <button
                                class="eco-close"
                                @click="closeQueryPanel"
                            >
                                ×
                            </button>
                        </div>

                        <div class="eco-body">
                            <!-- 统计小标签：模仿用户面板的浅绿色调；来源标签 = 在线服务点查时展示 -->
                            <div class="eco-stats">
                                <span
                                    v-if="featureQueryMeta?.title"
                                    class="eco-tag eco-tag-source"
                                    :title="featureQueryMeta.title"
                                >{{ featureQueryMeta.title }}</span>
                                <span class="eco-tag">{{ t('home.drawTag', { n: toolboxOverview.drawCount }) }}</span>
                                <span class="eco-tag">{{ t('home.uploadTag', { n: toolboxOverview.uploadCount }) }}</span>
                            </div>

                            <div class="eco-list-container">
                                <div
                                    v-for="([key, value], idx) in Object.entries(
                                        featureQueryResult || {},
                                    )"
                                    :key="`${key}_${idx}`"
                                    class="eco-item"
                                >
                                    <div class="eco-key">{{ key }}</div>
                                    <div class="eco-val">{{ value }}</div>
                                </div>

                                <!-- 空状态 -->
                                <div
                                    v-if="Object.keys(featureQueryResult || {}).length === 0"
                                    class="eco-empty"
                                >
                                    {{ t('home.noAttrData') }}
                                </div>
                            </div>
                        </div>
                    </div>
                </transition>

                <!-- 点击后按需加载的 Cesium 组件；切回 OL 时卸载，确保相机 URL 监听同步清理。 -->
                <div
                    v-if="is3DMode && isCesiumLoaded && !isAccountPanelFullscreen"
                    class="cesium-wrapper"
                    style="position: absolute; width: 100%; height: 100%; inset: 0; z-index: 5"
                >
                    <component
                        :is="CesiumContainer"
                        ref="cesiumContainerRef"
                        @ready="handleCesiumReady"
                        @load-failed="handleCesiumLoadFailed"
                        @view-sync="handleViewSync"
                        @drop-ol-layer="handleImportOlLayerTo3D"
                    />
                </div>

                <!-- 属性表：引擎无关，唯一实例（数据来自 attrStore，2D/3D 共用同一套渲染）。
                     必须留在 .map-wrapper 内：该容器是 position:relative 的定位基准，
                     面板以它为坐标系铺「地图左半屏」。若上提到 content-section，
                     x/y 会以「侧栏 + 地图」整体为基准，表现为面板压住左侧图层栏、
                     宽度取到整体的一半而与地图不对齐。 -->
                <!-- readonly 跟随引擎：3D 的 entity.properties 无回写通道，禁改值/删要素，
                     避免表格乐观改值却写不回地图的假成功 -->
                <AttributeTable
                    :readonly="is3DMode"
                    @focus-feature="handleAttributeTableFocusFeature"
                    @highlight-feature="handleAttributeTableHighlightFeature"
                    @cell-edit="handleAttributeTableCellEdit"
                    @delete-feature="handleAttributeTableDeleteFeature"
                />
            </div>

            <!-- 日志监控面板 -->
            <LogMonitor
                v-show="logMonitorVisible"
            />

            <!-- 可拖拽分割条：仅在侧边面板展开时显示 -->
            <ResizeHandle
                v-if="!isSidePanelCollapsed"
                direction="horizontal"
                :min-size="MIN_SIDE_PANEL_RATIO"
                :max-size="MAX_SIDE_PANEL_RATIO"
                :initial-ratio="DEFAULT_SIDE_PANEL_RATIO"
                class="panel-resize-handle"
                @resize="handlePanelResize"
                @resize-end="handlePanelResizeEnd"
            />

            <!-- 侧边容器栏（右）-->
            <!-- 拖拽 -->
            <div
                class="side-panel-wrapper"
                :class="{
                    collapsed: isSidePanelCollapsed,
                    'weather-mode': isWeatherBoardMode,
                    'is-dragging': isPanelDragging
                }"
                :style="!isSidePanelCollapsed ? { width: sidePanelRatio + '%' } : {}"
            >
                <!-- 使用v-if延迟加载SidePanel，避免初始化时加载大量图片资源 -->
                <SidePanel
                    v-if="shouldLoadSidePanel"
                    :location-info="locationInfo"
                    :selected-image="selectedImage"
                    :is-collapsed="isSidePanelCollapsed"
                    :revealing="isPanelRevealing"
                    :active-tab="activeSidePanelTab"
                    :toolbox-tab="toolboxTab"
                    :active-engine="is3DMode ? 'cesium' : 'ol'"
                    :active-feature="activeFeature"
                    :user-layers="userLayers"
                    :custom-basemap-url="sharedCustomBasemapUrl"
                    :base-layers="baseLayers"
                    :toolbox-overview="toolboxOverview"
                    :upload-progress="uploadProgress"
                    :latest-search-poi="latestSearchPoi"
                    :should-load-weather="shouldLoadWeatherChartPanel"
                    :get-user-location="getMapUserLocation"
                    :get-cesium-viewer="getCesiumViewerForPicker"
                    :get-cesium-namespace="getCesiumNamespaceForPicker"
                    :start-bus-point-pick="startBusPointPick"
                    :draw-route-on-map="drawRouteOnMap"
                    :zoom-to-bus-route-step="zoomToBusRouteStep"
                    :preview-bus-route-step="previewBusRouteStep"
                    :clear-bus-route-step-preview="clearBusRouteStepPreview"
                    :draw-drive-route-on-map="drawDriveRouteOnMap"
                    :zoom-to-drive-route-step="zoomToDriveRouteStep"
                    :preview-drive-route-step="previewDriveRouteStep"
                    :clear-drive-route-step-preview="clearDriveRouteStepPreview"
                    @upload-data="handleUploadData"
                    @interaction="handleInteraction"
                    @toggle-layer-visibility="handleToggleLayerVisibility"
                    @change-layer-opacity="handleChangeLayerOpacity"
                    @rename-layer="handleRenameLayer"
                    @toggle-layer-label-visibility="handleToggleLayerLabelVisibility"
                    @zoom-layer="handleZoomLayer"
                    @view-layer="handleViewLayer"
                    @remove-layer="handleRemoveLayer"
                    @edit-layer="handleEditLayer"
                    @reorder-user-layers="handleReorderUserLayers"
                    @solo-layer="handleSoloLayer"
                    @apply-style-template="handleApplyStyleTemplate"
                    @update-draw-style="handleUpdateDrawStyle"
                    @update-layer-style="handleUpdateLayerStyle"
                    @update-cesium-layer-style="handleUpdateCesiumLayerStyle"
                    @highlight-attribute-feature="handleHighlightAttributeFeature"
                    @zoom-attribute-feature="handleZoomAttributeFeature"
                    @layer-selected="handleLayerSelected"
                    @draw-point-by-coordinates="handleDrawPointByCoordinates"
                    @draw-amap-aoi-from-json="handleDrawAmapAoiFromJson"
                    @toggle-layer-crs="handleToggleLayerCRS"
                    @reproject-layer="handleReprojectLayer"
                    @export-layer-data="handleExportLayerData"
                    @import-to-3d="handleImportOlLayerTo3D"
                    @switch-tab="handleSwitchSidePanelTab"
                    @toggle-panel="toggleSidePanel"
                    @close-chat="handleCloseChat"
                />
                <!-- 未加载时显示展开提示 -->
                <div
                    v-else
                    class="panel-placeholder"
                    @click="toggleSidePanel"
                >
                    <div class="placeholder-content">
                        <svg
                            class="placeholder-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                        <span class="placeholder-text">{{ t('common.expand') }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" src="./HomeView.ts"></script>
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
    background: rgba(var(--brand-primary-rgb), 0.62);
    background: color-mix(in srgb, var(--brand-primary) 62%, transparent);
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
    gap: 2px;
    padding: 0px 0;
    box-sizing: border-box;
    overflow: hidden;
}

.Control-panel {
    width: 60px;
    /* Fixed width for left control panel */
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0px 0;
    background: #ffffff00;
    border-radius: 10px;
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
    /* 展示使用0边距 */
    margin: 0px;
    /* margin-right: 0px; */
    z-index: 1;
    /* Important for flex items to shrink */
}

/* 用户中心面板 (由 HomeView 配置覆盖位置) */
:deep(.home-account-panel) {
    position: absolute !important;
    top: 5px !important;
    left: 215px !important;
    /* 位于鹰眼(左侧, 宽200px)的右侧 */
    bottom: auto !important;
    z-index: var(--z-modal-high) !important;
    /* 高于地图和其他组件 */
    display: flex !important;
    /* 激活下行 flex-direction，并让内部 .account-panel 参与弹性收缩（V3.4.53） */
    flex-direction: column !important;
    /* 调整流向为向下展开 */
    max-height: calc(100% - 10px) !important;
    /* 以 .map-wrapper 为基准封顶（top:5px + 底部留 5px），替代组件内的 vh 计算：
       面板总高不再超出 overflow:hidden 的容器，小窗口下页脚退出按钮始终可见（V3.4.53） */
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
    max-height: none !important;
    /* 豁免非全屏态的 calc(100% - 10px) 上界，否则全屏会矮 10px（V3.4.53） */
    z-index: 5000 !important;
    /* 在 map-wrapper 内封顶 */
    gap: 0 !important;
}

:deep(.home-account-panel.is-fullscreen .account-panel) {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    z-index: 5001 !important;
    /* 与面板自身 20px 大容器圆角档对齐（原 12px 是第三档，与 16/20 混排） */
    border-radius: 20px !important;
    clip-path: none !important;
}

@media (max-width: 768px) {
    :deep(.home-account-panel) {
        top: 8px !important;
        left: 8px !important;
        right: 8px !important;
        width: auto !important;
        max-width: none !important;
        max-height: calc(100% - 16px) !important;
        /* 移动端 top:8px，上下各留 8px 对称（V3.4.53） */
        /* Mobile follows the map area width and sits just under the top bar */
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

/* 面板主体：DrawPanel 标准风格 */
.eco-query-panel {
    position: absolute;
    left: 20px;
    bottom: 20px;
    width: 300px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    border: 1px solid rgba(229, 236, 230, 0.6);
    z-index: var(--z-modal);
    display: flex;
    flex-direction: column;
    max-height: 400px;
}

/* 头部：DrawPanel 标准渐变顶栏 */
.eco-header {
    background: var(--brand-gradient-header);
    padding: 10px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: white;
    flex-shrink: 0;
}

.eco-title {
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.5px;
}

.header-content {
    display: flex;
    align-items: center;
    gap: 8px;
}

.eco-close {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

.eco-close:hover {
    background: rgba(255, 255, 255, 0.4);
}

/* 内容区：可滚动 */
.eco-body {
    padding: 12px;
    overflow-y: auto;
    flex: 1;
}

.eco-body::-webkit-scrollbar {
    width: 4px;
}

.eco-body::-webkit-scrollbar-thumb {
    background: var(--border-brand-light);
    border-radius: 4px;
}

/* 统计标签：DrawPanel 白卡片风格 */
.eco-stats {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
}

.eco-tag {
    background: white;
    color: var(--brand-accent-muted);
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    border: 2px solid #e8f0e8;
}

/* 来源标签（在线服务点查）：长标题截断 */
.eco-tag-source {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 属性列表 */
.eco-list-container {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/* 属性单项：DrawPanel 白卡片风格 */
.eco-item {
    padding: 8px 10px;
    border: 2px solid #e8f0e8;
    border-radius: 8px;
    background: white;
    display: flex;
    flex-direction: column;
    gap: 2px;
    transition: border-color 0.2s;
}

.eco-item:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
}

.eco-key {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    font-weight: 600;
}

.eco-val {
    font-size: 13px;
    color: var(--brand-accent-muted);
    font-weight: 500;
    word-break: break-all;
}

/* 空状态 */
.eco-empty {
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
    padding: 20px 0;
}

/* 动画 */
.query-panel-fade-enter-active,
.query-panel-fade-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.query-panel-fade-enter-from,
.query-panel-fade-leave-to {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
}

.side-panel-wrapper {
    width: 30%;
    flex-shrink: 0;
    background: #f5f5f5;
    border-radius: 10px;
    overflow: visible !important;
    position: relative;
    display: flex;
    flex-direction: column;
    transition:
        width 0.3s ease,
        height 0.3s ease;
    z-index: 2;
    min-width: 200px;
}

.side-panel-wrapper.collapsed {
    width: 0px;
    min-width: 0;
    transition: width 0.3s ease, min-width 0.3s ease;
}

/* 拖拽过程中禁用过渡动画，避免延迟 */
.side-panel-wrapper.is-dragging {
    transition: none;
}

/* 可拖拽分割条样式 */
.panel-resize-handle {
    height: 100%;
    flex-shrink: 0;
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
    color: var(--info);
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
    color: var(--info);
    letter-spacing: 2px;
    text-shadow: 0 1px 2px rgba(24, 144, 255, 0.1);
    transition: all 0.3s ease;
}

.panel-placeholder:hover .placeholder-text {
    color: #096dd9;
    text-shadow: 0 2px 4px rgba(24, 144, 255, 0.2);
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
        padding: 0px;
        gap: 0px;
    }

    .map-wrapper {
        flex: 1;
        /* Map takes available space */
        min-height: 50vh;
        /* Ensure map has height */
        margin: 2px;
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
        height: 0px;
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
</style>
