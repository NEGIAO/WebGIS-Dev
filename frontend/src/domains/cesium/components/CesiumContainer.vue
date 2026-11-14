<template>
    <div
        id="cesiumContainer"
        class="cesium-container"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
    ></div>

    <component
        :is="CesiumAdvancedEffects"
        v-if="cesiumReady"
        headless
        :get-viewer="getViewer"
        :get-cesium="getCesium"
        :controls="advancedEffectControls"
    />

    <component
        :is="FluidSimulationPanel"
        v-if="cesiumReady"
        ref="fluidPanelRef"
        headless
        :get-viewer="getViewer"
        :get-cesium="getCesium"
        :params="fluidParams"
        @state-change="handleFluidStateChange"
    />

    <ShallowWaterOverlay
        v-if="cesiumReady && shallowWaterVisible"
        :visible="shallowWaterVisible"
        v-bind="shallowWaterParams"
    />

    <!-- 路线漫游状态 HUD（绘制/飞行期间悬浮显示） -->
    <div
        v-if="cesiumReady && (routeFlyState.isDrawing || routeFlyState.hasRoute || routeFlyState.isFlying)"
        class="route-fly-hud"
    >
        <span class="hud-tip">{{ routeFlyHudTip }}</span>
        <span>{{ t('cesium.module.routeFly.stats.points') }}: {{ routeFlyState.pointCount }}</span>
        <span
            v-if="routeFlyState.routeLengthText"
        >{{ t('cesium.module.routeFly.stats.length') }}: {{ routeFlyState.routeLengthText }}</span>
        <span
            v-if="routeFlyState.durationText"
        >{{ t('cesium.module.routeFly.stats.duration') }}: {{ routeFlyState.durationText }}</span>
        <span
            v-if="routeFlyState.isFlying"
        >{{ t('cesium.module.routeFly.control.speed') }}: {{ routeFlyState.multiplier }}x</span>
    </div>

    <CesiumToolPanel
        v-if="cesiumReady"
        v-model:open="cesiumToolPanelOpen"
        v-model:active-basemap="activeBasemap"
        v-model:active-terrain="activeTerrain"
        v-model:custom-ion-height-offset="customIonHeightOffset"
        :basemap-options="basemapOptions"
        :terrain-options="terrainOptions"
        :overlay-options="overlayOptions"
        :custom-basemap-url="customXyzBasemapUrl"
        :custom-ion-tileset-ready="customIonTilesetReady"
        :modules="toolModules"
        @module-action="handleToolAction"
        @control-change="handleToolControlChange"
        @overlay-toggle="handleOverlayToggle"
        @custom-basemap-submit="handleCustomBasemapSubmit"
        @remote-service-submit="handleRemoteServiceSubmit"
        @data-import="handleDataImport"
        @import-tileset-zip="handleImportTilesetZip"
        @import-tileset-folder="handleImportTilesetFolder"
        @import-tileset-sample="handleImportTilesetSample"
    />

    <!-- 人物漫游操作提示面板 -->
    <PlayerGuidePanel
        :visible="playerController.isActive.value && showPlayerGuide"
        :is-first-person="playerController.isFirstPerson.value"
        :is-flying="playerController.isFlying.value"
        @close="showPlayerGuide = false"
    />

    <!-- 漫游导航 HUD（科幻风格，有目标即显示） -->
    <NavGuideHUD
        v-if="playerController.navTarget.value"
        :nav-target="playerController.navTarget.value"
    />

    <!-- 导航目标选择弹窗（搜索/数据要素/地图点选） -->
    <NavTargetPicker
        :visible="navPickerVisible"
        @close="navPickerVisible = false"
        @select="handleNavTargetSelect"
    />

    <!-- GLTF/GLB 坐标输入/调整弹窗 -->
    <CesiumDataImportDialog
        :visible="!!pendingGltfFile || !!repositionTarget"
        :file-name="repositionTarget?.name || pendingGltfFile?.name || ''"
        :initial-coords="repositionTarget?.position || null"
        :mode="repositionTarget ? 'reposition' : 'import'"
        :busy="gltfLoading"
        :load-error="gltfLoadError"
        @confirm="handleGltfCoordConfirm"
        @cancel="handleGltfCoordCancel"
    />

    <!-- 拖拽上传提示覆盖层 -->
    <div
        v-if="isDragOver && cesiumReady"
        class="drag-overlay"
    >
        <Upload
            :size="48"
            stroke-width="1.5"
        />
        <span class="drag-overlay-text">释放文件以导入到 3D 场景</span>
        <span class="drag-overlay-hint">GeoJSON / KML / SHP / GLB / CZML</span>
    </div>

    <!-- 坐标控制条（固定右下角，圆角胶囊）：显隐开关 + 坐标数据 + 瓦片级别 + 分隔线 + 主页。
         与 OL MapControlsBar 逐项对齐；桌面默认展开坐标、触屏默认收起，两端口均可切换。 -->
    <div
        v-if="bootComplete"
        class="coordinate-display"
        :class="{ 'is-roaming': coordinateGroups.roaming, 'coord-open': hudVisible }"
    >
        <button
            class="coord-toggle-btn"
            type="button"
            :title="hudToggleTitle"
            :aria-label="hudToggleTitle"
            :aria-pressed="hudVisible"
            @click.stop="hudVisible = !hudVisible"
        >
            <Eye
                v-if="hudVisible"
                :size="isTouch ? 20 : 17"
                :stroke-width="2"
            />
            <EyeOff
                v-else
                :size="isTouch ? 20 : 17"
                :stroke-width="2"
            />
        </button>
        <div
            v-if="hudVisible"
            class="coordinate-section"
        >
            <button
                class="coordinate-copy-area"
                type="button"
                :title="t('cesium.copyCoordinateTitle')"
                :aria-label="t('cesium.copyCoordinateAria')"
                @click.stop="copyActiveCoordinateDisplay"
            >
                <span
                    v-if="coordinateGroups.roaming"
                    class="coordinate-display-badge"
                >漫游</span>
                <!-- 触屏只显示经纬度+海拔单行；桌面保留位置/姿态/相机海拔三组 -->
                <span
                    v-if="isTouch"
                    class="coordinate-mobile-text"
                >{{ mobileCoordinateText }}</span>
                <span
                    v-else
                    class="coordinate-display-groups"
                >
                    <span
                        v-for="group in coordinateGroups.groups"
                        :key="group.key"
                        class="coordinate-group"
                    >
                        <span class="coordinate-group-label">{{ group.label }}</span>
                        <span class="coordinate-group-value">{{ group.value }}</span>
                    </span>
                </span>
                <!-- 复制提示图标：与 OL 控制条右侧的复制按钮同位同形（悬停浮现 / 触屏常显） -->
                <Copy
                    class="coordinate-copy-icon"
                    :size="14"
                    :stroke-width="2"
                    aria-hidden="true"
                />
            </button>
        </div>
        <!-- 瓦片请求级别（与 OL 缩放级别同义、同取整规则） -->
        <div
            class="zoom-level-display"
            :title="t('mapControls.zoomLevel')"
        >
            {{ displayTileZoom }}
        </div>
        <div class="divider"></div>
        <button
            class="home-btn"
            :title="t('cesium.homeTip')"
            type="button"
            @click.stop="handleHomeClick"
        >
            <House
                :size="isTouch ? 22 : 18"
                :stroke-width="1.8"
            />
        </button>
    </div>
</template>

<script lang="ts" src="./CesiumContainer.ts"></script>

<style scoped lang="scss" src="./styles/CesiumContainer.scss"></style>
