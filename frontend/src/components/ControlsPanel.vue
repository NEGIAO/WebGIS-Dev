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

        <AdministrativeDivisionPanel
            :visible="districtPanelVisible"
            @close="districtPanelVisible = false"
            @select="handleDistrictSelect"
        />
    </div>
</template>

<script setup>
import { useMessage } from '../composables/useMessage';
import { ref } from 'vue';
import AdministrativeDivisionPanel from './AdministrativeDivisionPanel.vue';
import {
    Map as MapIcon,
    Layers,
    Pencil,
    Ruler,
    MapPin,
    Boxes,
    LayoutGrid
} from 'lucide-vue-next';

const message = useMessage();

const emit = defineEmits([
    'open-tab',
    'map-interaction',
    'show-analysis',
    'district-select'
]);

const activeId = ref('map');
const districtPanelVisible = ref(false);

const menuItems = [
    { id: 'map', label: '地图', icon: MapIcon, action: 'toggleMap' },
    { id: 'layers', label: '图层', icon: Layers, action: 'toggleLayers' },
    { id: 'draw', label: '绘制', icon: Pencil, action: 'toggleDraw' },
    { id: 'measure', label: '测量', icon: Ruler, action: 'toggleMeasure' },
    { id: 'mark', label: '标注', icon: MapPin, action: 'toggleMark' },
    { id: 'analyze', label: '分析', icon: Boxes, action: 'toggleAnalyze' },
    { id: 'adcode', label: '行政区划', icon: LayoutGrid, action: 'toggleAdcode' },
    { id: 'more', label: '卷帘分析', icon: LayoutGrid, action: 'toggleMore' },
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
            // TODO: 更多功能待定，先放一个提示，后续可以考虑接入一些第三方工具或者扩展功能
            message.info(`功能待定，敬请期待...`);
            break;

        default:
            message.warn("未识别的 Action:", currentItem.action);
            break;
    }
};

const handleDistrictSelect = (payload) => {
    emit('district-select', payload);
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
</style>