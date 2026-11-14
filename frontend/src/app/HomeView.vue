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
<style scoped lang="scss" src="./styles/HomeView.scss"></style>
