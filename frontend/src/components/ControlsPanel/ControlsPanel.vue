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

        <!-- 绘制子面板 -->
        <DrawPanel
            v-if="drawPanelVisible"
            @draw-type="handleDrawType"
            @edit-action="handleDrawEditAction"
            @style-change="handleDrawStyleChange"
            @clear="handleClearDraw"
            @close="drawPanelVisible = false"
        />

        <!-- 测量子面板 -->
        <MeasurePanel
            v-if="measurePanelVisible"
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
                                v-for="option in SWIPE_SUPPORTED_BASEMAPS"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>{{ t('controls.rightBasemap') }}</label>
                        <select
                            v-model="rightBasemap"
                            class="basemap-select"
                        >
                            <option
                                v-for="option in SWIPE_SUPPORTED_BASEMAPS"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
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

<script setup>
import { computed, defineAsyncComponent, inject, ref } from 'vue';
import { useMessage } from '../../composables/useMessage';
import { useLocale } from '../../composables/useLocale';
import AdministrativeDivisionPanel from './AdministrativeDivisionPanel.vue';
const DrawPanel = defineAsyncComponent(() => import('./DrawPanel.vue'));
const MeasurePanel = defineAsyncComponent(() => import('./MeasurePanel.vue'));
const SpatialAnalysisPanel = defineAsyncComponent(() => import('./SpatialAnalysisPanel.vue'));
import {
    Activity,
    Newspaper,
    Columns2,
    Layers,
    Pencil,
    Ruler,
    MapPin,
    Boxes,
    LayoutGrid,
    Download,
} from 'lucide-vue-next';
import { useLayerStore } from '../../stores/useLayerStore';
import { useAppStore } from '../../stores/useAppStore';
import { storeToRefs } from 'pinia';
import { BASEMAP_OPTIONS } from '../../constants';

const { t } = useLocale();
const message = useMessage();
const layerStore = useLayerStore();
const appStore = useAppStore();
const { logMonitorVisible } = storeToRefs(appStore);

// 从 HomeView inject 标注模式状态（反映 MapContainer 的 isReverseGeocodePickMode）
const isMarkModeActive = inject('isMarkModeActive', computed(() => false));

// ========== Props ==========
defineProps({
    userLayers: {
        type: Array,
        default: () => [],
    },
});

// ========== 卷帘分析支持的底图 ==========
// 排除不支持的底图：'custom'（需要customUrl）和'local_tiles_preset'（本地瓦片）
const SWIPE_SUPPORTED_BASEMAPS = BASEMAP_OPTIONS.filter(
    (option) => option.value !== 'custom' && option.value !== 'local_tiles_preset',
);

// ========== Map Swipe 对话框状态 ==========
const showSwipeDialog = ref(false);
const leftBasemap = ref(SWIPE_SUPPORTED_BASEMAPS[0]?.value || '');
const rightBasemap = ref(SWIPE_SUPPORTED_BASEMAPS[1]?.value || '');
const swipeMode = ref('horizontal');

const emit = defineEmits([
    'open-tab',
    'open-toolbox-tab',
    'map-interaction',
    'draw-style-change',
    'draw-edit-action',
    'district-select',
    'enable-basemap-swipe',
    'spatial-analysis',
]);

const activeId = ref('layers');
const districtPanelVisible = ref(false);
const drawPanelVisible = ref(false);
const measurePanelVisible = ref(false);
const spatialPanelVisible = ref(false);

/** 侧栏菜单项：label 随语言切换 */
const menuItems = computed(() => [
    { id: 'layers', label: t('controls.layers'), icon: Layers, action: 'toggleLayers' },
    { id: 'news', label: t('controls.news'), icon: Newspaper, action: 'toggleNews' },
    { id: 'draw', label: t('controls.draw'), icon: Pencil, action: 'toggleDraw' },
    { id: 'measure', label: t('controls.measure'), icon: Ruler, action: 'toggleMeasure' },
    { id: 'mark', label: t('controls.mark'), icon: MapPin, action: 'toggleMark' },
    { id: 'more', label: t('controls.more'), icon: Columns2, action: 'toggleMore' },
    { id: 'adcode', label: t('controls.adcode'), icon: LayoutGrid, action: 'toggleAdcode' },
    { id: 'download', label: t('controls.download'), icon: Download, action: 'toggleDownload' },
    { id: 'analyze', label: t('controls.analyze'), icon: Boxes, action: 'toggleAnalyze' },
    { id: 'log', label: t('controls.log'), icon: Activity, action: 'toggleLog' },
]);

/** 关闭与当前激活项不相关的子面板 */
function closeIrrelevantPanels(activePanelId) {
    const panelMap = {
        adcode: districtPanelVisible,
        draw: drawPanelVisible,
        measure: measurePanelVisible,
        analyze: spatialPanelVisible,
    };
    for (const [panelId, visRef] of Object.entries(panelMap)) {
        if (panelId !== activePanelId && visRef.value) {
            visRef.value = false;
        }
    }
}

const handleSelect = (id) => {
    const currentItem = menuItems.value.find((item) => item.id === id);
    if (!currentItem) return;

    if (currentItem.action === 'toggleLog') {
        appStore.toggleLogMonitor();
        if (appStore.logMonitorVisible) {
            activeId.value = 'log';
        } else if (activeId.value === 'log') {
            activeId.value = 'layers';
        }
        message.info(
            appStore.logMonitorVisible
                ? t('controls.logMonitorOpened')
                : t('controls.logMonitorClosed'),
        );
        return;
    }

    // 1. 更新 UI 选中状态
    activeId.value = id;

    // 关闭不相关的子面板
    closeIrrelevantPanels(id);

    // 2. 执行对应业务逻辑（与现有 HomeView/MapContainer 能力打通）
    switch (currentItem.action) {
        case 'toggleNews':
            emit('open-tab', 'info');
            message.info(t('controls.newsPanelSwitched'));
            break;

        case 'toggleLayers':
            emit('open-tab', 'toolbox');
            break;

        case 'toggleDraw':
            // 切换绘制子面板显示状态
            drawPanelVisible.value = !drawPanelVisible.value;
            if (drawPanelVisible.value) {
                emit('open-tab', 'toolbox');
            }
            break;

        case 'toggleMeasure':
            // 切换测量子面板显示状态
            measurePanelVisible.value = !measurePanelVisible.value;
            if (measurePanelVisible.value) {
                emit('open-tab', 'toolbox');
            }
            break;

        case 'toggleMark':
            emit('map-interaction', 'ReverseGeocodePick');
            if (!isMarkModeActive.value) {
                // 进入标注模式
                emit('open-tab', 'toolbox');
                activeId.value = 'mark';
            } else {
                // 退出标注模式
                if (activeId.value === 'mark') {
                    activeId.value = 'layers';
                }
            }
            break;

        case 'toggleAnalyze':
            // 切换空间分析子面板显示状态
            spatialPanelVisible.value = !spatialPanelVisible.value;
            if (spatialPanelVisible.value) {
                emit('open-tab', 'toolbox');
            }
            break;

        case 'toggleAdcode':
            districtPanelVisible.value = !districtPanelVisible.value;
            message.info(
                districtPanelVisible.value
                    ? t('controls.districtPanelOpened')
                    : t('controls.districtPanelClosed'),
            );
            break;

        case 'toggleMore':
            // Map Swipe 双底图对比功能
            if (layerStore.swipeConfig.enabled) {
                // 已启用，关闭
                layerStore.disableSwipe();
                activeId.value = 'layers';
                message.success(t('controls.swipeClosed'));
            } else {
                // 未启用，打开对话框让用户选择左右底图
                showSwipeDialog.value = true;
            }
            break;

        case 'toggleDownload':
            emit('open-tab', 'toolbox');
            emit('open-toolbox-tab', 'download');
            message.info(t('controls.downloadPanelOpened'));
            break;

        default:
            // 注意：useMessage 的第二参是 options 对象，不能把 action 当参数传（会被吞掉）
            message.warning(t('controls.unknownAction', { action: currentItem.action }));
            break;
    }
};

const handleDistrictSelect = (payload) => {
    emit('district-select', payload);
};

/**
 * 处理绘制类型选择
 * @param {string} type - 绘制/编辑类型
 */
const handleDrawType = (type) => {
    emit('map-interaction', type);
    const labelMap = {
        Point: t('draw.tools.Point'),
        LineString: t('draw.tools.LineString'),
        Polygon: t('draw.tools.Polygon'),
        Rectangle: t('draw.tools.Rectangle'),
        Ellipse: t('draw.tools.Ellipse'),
        CircleOutline: t('draw.tools.CircleOutline'),
        Arrow: t('draw.tools.Arrow'),
        WindArrow: t('controls.windArrow'),
        BattleArrow: t('controls.battleArrow'),
        SelectEdit: t('draw.tools.SelectEdit'),
    };
    message.info(t('controls.drawToolActivated', { type: labelMap[type] || type }));
};

/**
 * 处理绘制样式变更
 * @param {Object} stylePayload
 */
const handleDrawStyleChange = (stylePayload) => {
    emit('draw-style-change', stylePayload);
};

/**
 * 处理绘制编辑动作
 * @param {string} action
 */
const handleDrawEditAction = (action) => {
    emit('draw-edit-action', action);
    if (action === 'delete-selected') {
        message.info(t('controls.deleteSelectedRequested'));
    } else if (action === 'undo-last') {
        message.info(t('controls.undoLastRequested'));
    }
};

/**
 * 清除全部绘制图形（仅绘制图层；其他图层由图层目录统一管理）
 */
const handleClearDraw = () => {
    emit('map-interaction', 'Clear');
    message.success(t('controls.clearDrawSuccess'));
};

/**
 * 处理测量类型选择
 * @param {string} type - 测量类型：MeasureDistance/MeasureArea
 */
const handleMeasureType = (type) => {
    emit('map-interaction', type);
    message.info(
        type === 'MeasureDistance'
            ? t('controls.measureDistanceActivated')
            : t('controls.measureAreaActivated'),
    );
};

/**
 * 清除所有测量结果
 */
const handleClearMeasure = () => {
    emit('map-interaction', 'Clear');
    message.success(t('controls.clearMeasureSuccess'));
};

/**
 * 处理空间分析请求
 * @param {Object} payload - 分析参数，包含 type（buffer/overlay/convexHull）等
 */
const handleSpatialAnalysis = (payload) => {
    emit('spatial-analysis', payload);
};

// ========== Map Swipe 对话框处理 ==========
/**
 * 确认并启用Map Swipe，传递选中的底图
 */
const confirmSwipeConfig = () => {
    if (!leftBasemap.value || !rightBasemap.value) {
        message.warning(t('controls.swipeSelectDifferent'));
        return;
    }

    if (leftBasemap.value === rightBasemap.value) {
        message.warning(t('controls.swipeSameBasemap'));
        return;
    }

    // 向MapContainer emit事件，请求启用双底图swipe
    emit('enable-basemap-swipe', {
        leftBasemap: leftBasemap.value,
        rightBasemap: rightBasemap.value,
        mode: swipeMode.value,
    });

    showSwipeDialog.value = false;
    message.success(
        t('controls.swipeLoading', {
            left: getBasemapLabel(leftBasemap.value),
            right: getBasemapLabel(rightBasemap.value),
        }),
    );
};

/**
 * 取消对话框
 */
const cancelSwipeDialog = () => {
    showSwipeDialog.value = false;
    leftBasemap.value = SWIPE_SUPPORTED_BASEMAPS[0]?.value || '';
    rightBasemap.value = SWIPE_SUPPORTED_BASEMAPS[1]?.value || '';
    swipeMode.value = 'horizontal';
};

/**
 * 根据底图ID获取显示名称
 */
const getBasemapLabel = (id) => {
    const option = BASEMAP_OPTIONS.find((opt) => opt.value === id);
    return option?.label || id;
};
</script>

<style scoped>
.sidebar-shell {
    position: relative;
    /* 确保 shell 占满了父级高度，或者直接给个视口高度 */
    height: 100vh;
}

/* 子面板定位：悬浮在侧边栏右侧 */
.sidebar-shell :deep(.draw-panel),
.sidebar-shell :deep(.measure-panel),
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
