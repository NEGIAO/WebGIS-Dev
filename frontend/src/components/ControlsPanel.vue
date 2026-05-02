<template>
    <div class="sidebar-shell">
        <div class="sidebar-container">
            <div class="sidebar-item" v-for="item in menuItems" :key="item.id" :class="{ active: activeId === item.id }"
                @click="handleSelect(item.id)">

                <div class="icon-wrapper">
                    <component :is="item.icon" :size="20" />
                </div>

                <span class="label">{{ item.label }}</span>
            </div>
        </div>

        <AdministrativeDivisionPanel :visible="districtPanelVisible" @close="districtPanelVisible = false"
            @select="handleDistrictSelect" />

        <!-- Map Swipe 底图选择对话框 -->
        <div v-if="showSwipeDialog" class="swipe-dialog-overlay" @click.self="cancelSwipeDialog">
            <div class="swipe-dialog-box">
                <div class="dialog-header">
                    <h3>卷帘分析 - 选择对比底图</h3>
                    <button class="close-btn" @click="cancelSwipeDialog">×</button>
                </div>

                <div class="dialog-content">
                    <div class="form-group">
                        <label>左侧底图：</label>
                        <select v-model="leftBasemap" class="basemap-select">
                            <option v-for="option in SWIPE_SUPPORTED_BASEMAPS" :key="option.value"
                                :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>右侧底图：</label>
                        <select v-model="rightBasemap" class="basemap-select">
                            <option v-for="option in SWIPE_SUPPORTED_BASEMAPS" :key="option.value"
                                :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>滑动模式：</label>
                        <div class="mode-selector">
                            <button class="mode-btn" :class="{ active: swipeMode === 'horizontal' }"
                                @click="swipeMode = 'horizontal'">
                                ↔ 水平
                            </button>
                            <button class="mode-btn" :class="{ active: swipeMode === 'vertical' }"
                                @click="swipeMode = 'vertical'">
                                ↕ 竖直
                            </button>
                        </div>
                    </div>
                </div>

                <div class="dialog-footer">
                    <button class="cancel-btn" @click="cancelSwipeDialog">取消</button>
                    <button class="confirm-btn" @click="confirmSwipeConfig">启用对比</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useMessage } from '../composables/useMessage';
import { ref } from 'vue';
import AdministrativeDivisionPanel from './AdministrativeDivisionPanel.vue';
import {
    Map as MapIcon,
    Columns2,
    Layers,
    Pencil,
    Ruler,
    MapPin,
    Boxes,
    LayoutGrid
} from 'lucide-vue-next';
import { useLayerStore } from '../stores/useLayerStore';
import { BASEMAP_OPTIONS } from '../constants';

const message = useMessage();
const layerStore = useLayerStore();

// ========== 卷帘分析支持的底图 ==========
// 排除不支持的底图：'custom'（需要customUrl）和'local_tiles_preset'（本地瓦片）
const SWIPE_SUPPORTED_BASEMAPS = BASEMAP_OPTIONS.filter(
    option => option.value !== 'custom' && option.value !== 'local_tiles_preset'
);

// ========== Map Swipe 对话框状态 ==========
const showSwipeDialog = ref(false);
const leftBasemap = ref(SWIPE_SUPPORTED_BASEMAPS[0]?.value || '');
const rightBasemap = ref(SWIPE_SUPPORTED_BASEMAPS[1]?.value || '');
const swipeMode = ref('horizontal');

const emit = defineEmits([
    'open-tab',
    'map-interaction',
    'show-analysis',
    'district-select',
    'enable-basemap-swipe'
]);

const activeId = ref('map');
const districtPanelVisible = ref(false);

const menuItems = [
    { id: 'map', label: '地图', icon: MapIcon, action: 'toggleMap' },
    { id: 'layers', label: '图层', icon: Layers, action: 'toggleLayers' },
    { id: 'draw', label: '绘制', icon: Pencil, action: 'toggleDraw' },
    { id: 'measure', label: '测量', icon: Ruler, action: 'toggleMeasure' },
    { id: 'mark', label: '标注', icon: MapPin, action: 'toggleMark' },
    { id: 'more', label: '卷帘分析', icon: Columns2, action: 'toggleMore' },
    { id: 'analyze', label: '空间分析', icon: Boxes, action: 'toggleAnalyze' },
    { id: 'adcode', label: '行政区划', icon: LayoutGrid, action: 'toggleAdcode' },
];

const handleSelect = (id) => {
    // 1. 更新 UI 选中状态
    activeId.value = id;

    if (id !== 'adcode' && districtPanelVisible.value) {
        districtPanelVisible.value = false;
    }

    // 2. 找到当前点击的对象，以便获取 action
    const currentItem = menuItems.find(item => item.id === id);
    if (!currentItem) return;

    // 3. 执行对应业务逻辑（与现有 HomeView/MapContainer 能力打通）
    switch (currentItem.action) {
        case 'toggleMap':
            emit('open-tab', 'info');
            message.info('已切换到地图信息面板');
            break;

        case 'toggleLayers':
            emit('open-tab', 'toolbox');
            break;

        case 'toggleDraw':
            emit('open-tab', 'toolbox');
            emit('map-interaction', 'Polygon');
            message.info('已激活绘制工具（Polygon）');
            break;

        case 'toggleMeasure':
            emit('open-tab', 'toolbox');
            emit('map-interaction', 'MeasureDistance');
            message.info('已激活测距工具');
            break;

        case 'toggleMark':
            emit('open-tab', 'toolbox');
            emit('map-interaction', 'ReverseGeocodePick');
            message.info('请在地图单击进行标注与逆地理编码');
            break;

        case 'toggleAnalyze':
            emit('open-tab', 'toolbox');
            emit('show-analysis');
            message.info('分析入口已打开（可在工具箱中继续操作）');
            break;

        case 'toggleAdcode':
            districtPanelVisible.value = !districtPanelVisible.value;
            message.info(districtPanelVisible.value ? '行政区划面板已打开' : '行政区划面板已关闭');
            break;

        case 'toggleMore':
            // Map Swipe 双底图对比功能
            if (layerStore.swipeConfig.enabled) {
                // 已启用，关闭
                layerStore.disableSwipe();
                message.success('卷帘分析已关闭');
            } else {
                // 未启用，打开对话框让用户选择左右底图
                showSwipeDialog.value = true;
            }
            break;

        default:
            message.warn("未识别的 Action:", currentItem.action);
            break;
    }
};

const handleDistrictSelect = (payload) => {
    emit('district-select', payload);
};

// ========== Map Swipe 对话框处理 ==========
/**
 * 确认并启用Map Swipe，传递选中的底图
 */
const confirmSwipeConfig = () => {
    if (!leftBasemap.value || !rightBasemap.value) {
        message.warn('请选择左右两个不同的底图');
        return;
    }

    if (leftBasemap.value === rightBasemap.value) {
        message.warn('左右底图不能相同');
        return;
    }

    // 向MapContainer emit事件，请求启用双底图swipe
    emit('enable-basemap-swipe', {
        leftBasemap: leftBasemap.value,
        rightBasemap: rightBasemap.value,
        mode: swipeMode.value
    });

    showSwipeDialog.value = false;
    message.success(`正在加载卷帘对比：${getBasemapLabel(leftBasemap.value)} ↔ ${getBasemapLabel(rightBasemap.value)}`);
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
    const option = BASEMAP_OPTIONS.find(opt => opt.value === id);
    return option?.label || id;
};

</script>

<style scoped>
.sidebar-shell {
    position: relative;
    height: 100%;
}

.sidebar-container {
    /* 定位 */
    height: 100%;
    position: relative;
    /* left: 5px; */
    /* top: 50%;
    transform: translateY(-50%); */

    /* 绿色系背景 - 玻璃拟态 */
    background: rgba(255, 255, 255, 0.85);
    /* 深绿色半透明 */
    backdrop-filter: blur(10px);
    border: 1px solid rgba(229, 236, 230, 0.048);

    /* 布局 */
    display: flex;
    flex-direction: column;
    padding-bottom: 12px;
    padding-top: 12px;
    padding-left: 0px;
    padding-right: 1px;
    /* 顺序：左上(0) 右上(10px) 右下(10px) 左下(0) */
    border-radius: 0 16px 16px 0;
    gap: 15px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    z-index: 1000;
}

.sidebar-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 60px;
    cursor: pointer;
    transition: all 0.3s ease;
    border-radius: 12px;
    color: #397d39
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
    background: rgba(14, 149, 41, 0.292);
    color: #d12f2f;
}

/* 激活状态 - 亮绿色渐变 */
.sidebar-item.active {
    background: linear-gradient(200deg, #6a9e98 0%, #57b861 100%);
    color: #fff;
    box-shadow: 0 4px 15px rgba(0, 191, 165, 0.4);
}

/* 激活状态下的图标微调 */
.sidebar-item.active .icon-wrapper {
    transform: scale(1.1);
}

/* ========== Map Swipe 对话框样式 ========== */
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
    z-index: 9999;
    backdrop-filter: blur(4px);
}

.swipe-dialog-box {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    min-width: 380px;
    overflow: hidden;
    animation: dialogSlideIn 0.3s ease-out;
}

@keyframes dialogSlideIn {
    from {
        opacity: 0;
        transform: scale(0.9) translateY(-20px);
    }

    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #f0f0f0;
    background: linear-gradient(135deg, #66ea87a6 0%, #0a6815a4 100%);
    color: white;
}

.dialog-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.close-btn {
    background: none;
    border: none;
    font-size: 28px;
    cursor: pointer;
    color: white;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
}

.close-btn:hover {
    transform: scale(1.2);
}

.dialog-content {
    padding: 24px;
}

.form-group {
    margin-bottom: 20px;
}

.form-group:last-child {
    margin-bottom: 0;
}

.form-group label {
    display: block;
    font-weight: 600;
    margin-bottom: 8px;
    color: #333;
    font-size: 14px;
}

.basemap-select {
    width: 100%;
    padding: 10px 12px;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    font-size: 14px;
    background: white;
    color: #333;
    cursor: pointer;
    transition: all 0.3s;
}

.basemap-select:hover {
    border-color: #108e23;
}

.basemap-select:focus {
    outline: none;
    border-color: #039c4b;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.mode-selector {
    display: flex;
    gap: 12px;
}

.mode-btn {
    flex: 1;
    padding: 10px 16px;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    background: white;
    color: #666;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
}

.mode-btn:hover {
    border-color: #1a944f;
    color: #049924;
}

.mode-btn.active {
    background: linear-gradient(135deg, #089414 0%, #18a83c 100%);
    border-color: #15a852;
    color: white;
}

.dialog-footer {
    display: flex;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #f0f0f0;
    background: #f9f9f9;
}

.cancel-btn,
.confirm-btn {
    flex: 1;
    padding: 12px 20px;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
}

.cancel-btn {
    background: white;
    color: #666;
}

.cancel-btn:hover {
    border-color: #999;
    background: #f5f5f5;
}

.confirm-btn {
    background: linear-gradient(135deg, #139647 0%, #0f995b 100%);
    border-color: #1b963c;
    color: white;
}

.confirm-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(102, 234, 157, 0.3);
}

.confirm-btn:active {
    transform: translateY(0);
}
</style>