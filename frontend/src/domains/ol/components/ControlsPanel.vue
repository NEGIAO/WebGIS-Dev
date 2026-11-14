<template>
    <div class="sidebar-shell">
        <div class="sidebar-container">
            <div
                v-for="item in menuItems"
                :key="item.id"
                class="sidebar-item"
                :class="{
                    active: activeId === item.id || (item.id === 'log' && logMonitorVisible) || (item.id === 'mark' && isMarkModeActive),
                }"
                @click="handleSelect(item.id)"
            >
                <div class="icon-wrapper">
                    <component
                        :is="item.icon"
                        :size="20"
                    />
                </div>

                <span class="label">{{ item.label }}</span>
            </div>
        </div>

        <AdministrativeDivisionPanel
            :visible="districtPanelVisible"
            @close="districtPanelVisible = false"
            @select="handleDistrictSelect"
        />

        <!-- 绘制子面板：3D 走 Cesium 引擎感知面板（支持类型子集不同），2D 走 OL DrawPanel -->
        <CesiumDrawMeasurePanel
            v-if="drawPanelVisible && isCesium"
            variant="draw"
            @activate="handleCesiumActivate"
            @action="handleCesiumDrawAction"
            @close="drawPanelVisible = false"
        />
        <DrawPanel
            v-else-if="drawPanelVisible"
            @draw-type="handleDrawType"
            @edit-action="handleDrawEditAction"
            @style-change="handleDrawStyleChange"
            @clear="handleClearDraw"
            @close="drawPanelVisible = false"
        />

        <!-- 测量子面板：3D 走 Cesium 引擎感知面板（测距/测面/测高距/方位角），2D 走 OL MeasurePanel -->
        <CesiumDrawMeasurePanel
            v-if="measurePanelVisible && isCesium"
            variant="measure"
            @activate="handleCesiumActivate"
            @action="handleCesiumDrawAction"
            @close="measurePanelVisible = false"
        />
        <MeasurePanel
            v-else-if="measurePanelVisible"
            @measure-type="handleMeasureType"
            @clear="handleClearMeasure"
            @close="measurePanelVisible = false"
        />

        <!-- 空间分析子面板 -->
        <SpatialAnalysisPanel
            v-if="spatialPanelVisible"
            :available-layers="userLayers"
            @analysis="handleSpatialAnalysis"
            @close="spatialPanelVisible = false"
        />

        <!-- Map Swipe 底图选择对话框 -->
        <div
            v-if="showSwipeDialog"
            class="swipe-dialog-overlay"
            @click.self="cancelSwipeDialog"
        >
            <div class="swipe-dialog-box">
                <div class="dialog-header">
                    <h3>{{ t('controls.swipeDialogTitle') }}</h3>
                    <button
                        class="close-btn"
                        @click="cancelSwipeDialog"
                    >
                        ×
                    </button>
                </div>

                <div class="dialog-content">
                    <div class="form-group">
                        <label>{{ t('controls.leftBasemap') }}</label>
                        <select
                            v-model="leftBasemap"
                            class="basemap-select"
                        >
                            <option
                                v-for="option in swipeSupportedBasemaps"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                        <input
                            v-if="leftBasemap === 'custom'"
                            v-model="leftCustomUrl"
                            class="basemap-url-input"
                            type="url"
                            placeholder="XYZ / WMTS URL"
                            autocomplete="off"
                        >
                    </div>

                    <div class="form-group">
                        <label>{{ t('controls.rightBasemap') }}</label>
                        <select
                            v-model="rightBasemap"
                            class="basemap-select"
                        >
                            <option
                                v-for="option in swipeSupportedBasemaps"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                        <input
                            v-if="rightBasemap === 'custom'"
                            v-model="rightCustomUrl"
                            class="basemap-url-input"
                            type="url"
                            placeholder="XYZ / WMTS URL"
                            autocomplete="off"
                        >
                    </div>

                    <div class="form-group">
                        <label>{{ t('controls.swipeMode') }}</label>
                        <div class="mode-selector">
                            <button
                                class="mode-btn"
                                :class="{ active: swipeMode === 'horizontal' }"
                                @click="swipeMode = 'horizontal'"
                            >
                                ↔ {{ t('controls.horizontal') }}
                            </button>
                            <button
                                class="mode-btn"
                                :class="{ active: swipeMode === 'vertical' }"
                                @click="swipeMode = 'vertical'"
                            >
                                ↕ {{ t('controls.vertical') }}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="dialog-footer">
                    <button
                        class="cancel-btn"
                        @click="cancelSwipeDialog"
                    >
                        {{ t('common.cancel') }}
                    </button>
                    <button
                        class="confirm-btn"
                        @click="confirmSwipeConfig"
                    >
                        {{ t('controls.enableCompare') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" src="./ControlsPanel.ts"></script>

<style scoped>
.sidebar-shell {
    position: relative;
    /* 确保 shell 占满了父级高度，或者直接给个视口高度 */
    height: 100vh;
}

/* 子面板定位：悬浮在侧边栏右侧 */
.sidebar-shell :deep(.draw-panel),
.sidebar-shell :deep(.measure-panel),
.sidebar-shell :deep(.cesium-dm-panel),
.sidebar-shell :deep(.spatial-panel) {
    position: absolute;
    left: 68px;
    top: 80px;
    z-index: 1001;
}

.sidebar-container {
    /* 1. 核心尺寸：假设的顶部绿色导航栏高度是 60px，这里减去它 */
    /* 如果导航栏高度不同，请相应调整这个 60px */
    height: calc(100vh - 60px);
    position: relative;
    box-sizing: border-box;

    /* 2. 布局与滚动 */
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-wrap: nowrap;
    overflow-y: auto;
    overflow-x: hidden;
    /* 防止出现横向滚动条 */

    /* 3. 间距：底部 padding 给大一点，确保最后一个按钮滚动后离边缘有距离 */
    padding-top: 15px;
    padding-bottom: 30px;
    gap: 12px;

    /* 4. 隐藏滚动条 */
    scrollbar-width: none;
    -ms-overflow-style: none;

    /* 5. 视觉样式保持 */
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(229, 236, 230, 0.5);
    border-radius: 0 16px 16px 0;
    box-shadow: var(--panel-shadow);
    z-index: var(--z-panel);
}

/* Chrome/Safari 隐藏滚动条 */
.sidebar-container::-webkit-scrollbar {
    display: none;
}

.sidebar-item {
    flex-shrink: 0;
    /* 强制不被压缩 */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 56px;
    min-height: 60px;
    /* 使用 min-height 确保高度 */
    cursor: pointer;
    transition: all 0.3s ease;
    border-radius: var(--panel-radius);
    color: var(--brand-accent-muted);
}

.icon-wrapper {
    margin-bottom: 4px;
}

.label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1px;
}

/* 悬停效果 */
.sidebar-item:hover {
    background: rgba(var(--brand-primary-rgb), 0.15);
    color: var(--danger);
}

/* 激活状态 - 亮绿色渐变 */
.sidebar-item.active {
    background: linear-gradient(200deg, #6a9e98 0%, var(--brand-accent) 100%);
    color: var(--text-on-brand);
    box-shadow: 0 4px 15px rgba(0, 191, 165, 0.4);
}

/* 激活状态下的图标微调 */
.sidebar-item.active .icon-wrapper {
    transform: scale(1.1);
}

/* ========== Map Swipe 对话框样式：DrawPanel 标准 ========== */
.swipe-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-toast);
    backdrop-filter: blur(4px);
}

.swipe-dialog-box {
    background: var(--panel-bg);
    backdrop-filter: blur(12px);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.12);
    min-width: 340px;
    max-width: 90vw;
    overflow: hidden;
    animation: dialogSlideIn 0.2s ease-out;
}

@keyframes dialogSlideIn {
    from {
        opacity: 0;
        transform: translateY(-8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--brand-gradient-header);
    color: white;
}

.dialog-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
}

.close-btn {
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

.close-btn:hover {
    background: rgba(255, 255, 255, 0.4);
}

.dialog-content {
    padding: 12px;
}

.form-group {
    margin-bottom: 16px;
}

.form-group:last-child {
    margin-bottom: 0;
}

.form-group label {
    display: block;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--brand-accent-muted);
    font-size: 13px;
}

.basemap-select {
    width: 100%;
    padding: 8px 10px;
    border: 2px solid var(--bg-brand-light);
    border-radius: 8px;
    font-size: 13px;
    background: white;
    color: var(--brand-accent-muted);
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
}

.basemap-select:hover {
    border-color: var(--brand-accent);
}

.basemap-select:focus {
    outline: none;
    border-color: var(--brand-accent);
    box-shadow: 0 2px 8px rgba(var(--brand-accent-rgb), 0.25);
}

.basemap-url-input {
    width: 100%;
    box-sizing: border-box;
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--bg-brand-light);
    border-radius: 6px;
    font-size: 12px;
}

.basemap-url-input:focus {
    outline: none;
    border-color: var(--brand-accent);
}

.mode-selector {
    display: flex;
    gap: 8px;
}

.mode-btn {
    flex: 1;
    padding: 10px 16px;
    border: 2px solid var(--bg-brand-light);
    border-radius: 8px;
    background: white;
    color: var(--brand-accent-muted);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.mode-btn:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
}

.mode-btn.active {
    border-color: var(--brand-accent);
    background: linear-gradient(135deg, rgba(var(--brand-accent-rgb), 0.1) 0%, var(--bg-active) 100%);
    color: var(--brand-accent-dark);
    box-shadow: 0 2px 8px rgba(var(--brand-accent-rgb), 0.25);
}

.dialog-footer {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--bg-brand-light);
}

.cancel-btn,
.confirm-btn {
    flex: 1;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.cancel-btn {
    background: white;
    border: 2px solid var(--bg-brand-light);
    color: var(--brand-accent-muted);
}

.cancel-btn:hover {
    border-color: var(--brand-accent);
    background: var(--bg-hover);
}

.confirm-btn {
    background: var(--brand-gradient);
    border: 2px solid var(--brand-accent);
    color: var(--text-on-brand);
}

.confirm-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(var(--brand-accent-rgb), 0.25);
}

.confirm-btn:active {
    transform: translateY(0);
}
</style>

