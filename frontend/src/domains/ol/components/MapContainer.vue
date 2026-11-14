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
            'gis-upload-dragging': isMapUploadDragging,
        }"
        @dragenter.prevent="handleMapUploadDragEnter"
        @dragover.prevent="handleMapUploadDragOver"
        @dragleave.prevent="handleMapUploadDragLeave"
        @drop.prevent="handleMapUploadDrop"
    >
        <div
            id="map"
            ref="mapRef"
        ></div>
        <!-- 2D map GIS drag-and-drop import overlay -->
        <div
            v-if="isMapUploadDragging"
            class="gis-upload-overlay"
            aria-hidden="true"
        >
            <div class="gis-upload-shell">
                <!-- 科幻 HUD 交互圈/图标区 -->
                <div class="hud-loader">
                    <svg
                        class="sci-fi-ring"
                        viewBox="0 0 100 100"
                    >
                        <circle
                            class="ring-outer"
                            cx="50"
                            cy="50"
                            r="45"
                        ></circle>
                        <circle
                            class="ring-middle"
                            cx="50"
                            cy="50"
                            r="36"
                        ></circle>
                    </svg>

                    <!-- 雷达扫光与核心发光 -->
                    <div class="radar-sweep"></div>
                    <div class="core-glow"></div>

                    <!-- 上传箭头 Icon -->
                    <svg
                        class="gis-upload-overlay-icon"
                        viewBox="0 0 24 24"
                        width="30"
                        height="30"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M12 16V4"></path>
                        <path d="m7 9 5-5 5 5"></path>
                        <path d="M20 16.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5"></path>
                    </svg>
                </div>

                <!-- HUD 切角文字卡片容器 -->
                <div class="hud-text-container">
                    <div class="loading-title">
                        <span class="glitch">{{ t('layer.dropToMap') }}</span>
                    </div>
                    <div class="loading-subtitle">
                        <span class="hud-tag">FORMATS</span>
                        <span>{{ t('layer.dataFormats') }}</span>
                    </div>
                </div>
            </div>
        </div>
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

<script lang="ts" src="./MapContainer.ts"></script>

<style scoped lang="scss" src="./styles/MapContainer.scss"></style>
