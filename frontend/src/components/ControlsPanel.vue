<template>
    <div class="sidebar-container">
        <div class="sidebar-item" v-for="item in menuItems" :key="item.id" :class="{ active: activeId === item.id }"
            @click="handleSelect(item.id)">

            <div class="icon-wrapper">
                <component :is="item.icon" :size="20" />
            </div>

            <span class="label">{{ item.label }}</span>
        </div>
    </div>
</template>

<script setup>
import { useMessage } from '../composables/useMessage';
const message = useMessage();
import { ref } from 'vue';
import {
    Map as MapIcon,
    Layers,
    Pencil,
    Ruler,
    MapPin,
    Boxes,
    LayoutGrid
} from 'lucide-vue-next';

const activeId = ref('map');

const menuItems = [
    { id: 'map', label: '地图', icon: MapIcon, action: 'toggleMap' },
    { id: 'layers', label: '图层', icon: Layers, action: 'toggleLayers' },
    { id: 'draw', label: '绘制', icon: Pencil, action: 'toggleDraw' },
    { id: 'measure', label: '测量', icon: Ruler, action: 'toggleMeasure' },
    { id: 'mark', label: '标注', icon: MapPin, action: 'toggleMark' },
    { id: 'analyze', label: '分析', icon: Boxes, action: 'toggleAnalyze' },
    { id: 'more', label: '更多', icon: LayoutGrid, action: 'toggleMore' },
];

const handleSelect = (id) => {
    // 1. 更新 UI 选中状态
    activeId.value = id;

    // 2. 找到当前点击的对象，以便获取 action
    const currentItem = menuItems.find(item => item.id === id);
    if (!currentItem) return;

    // 3. 执行对应的业务逻辑
    // 这里暂时统一使用提示，后续需要接入Pina,对接组件功能
    switch (currentItem.action) {
        case 'toggleMap':
            message.info(`呃，还没想好做什么呢...`);
            break;
            
        case 'toggleLayers':
            // TODO: 打通sidepanel中的图层目录面板功能
            message.info(`【${currentItem.label}】功能：图层目录面板待打通...`);
            break;

        case 'toggleDraw':
            // TODO: 打通sidepanel中的矢量绘制工具功能
            message.info(`【${currentItem.label}】功能：矢量绘制工具待打通...`);
            break;

        case 'toggleMeasure':
            // TODO: 打通sidepanel中的距离与面积测量功能
            message.info(`【${currentItem.label}】功能：距离与面积测量待打通...`);
            break;

        case 'toggleMark':
            // TODO: 打通sidepanel中的地图点位绘制功能，实现地图标注信息编辑功能
            message.info(`【${currentItem.label}】功能：地图标注与注记待打通...`);
            break;

        case 'toggleAnalyze':
            // TODO: 点击后弹出分析工具列表，展示先做一个缓冲区，最短路径的UI，具体的功能还未确定
            message.info(`【${currentItem.label}】功能：空间分析与缓冲区计算待打通...`);
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

</script>

<style scoped>
.sidebar-container {
    /* 定位 */
    position: relative;
    left: 25px;
    top: 50%;
    transform: translateY(-50%);

    /* 绿色系背景 - 玻璃拟态 */
    background: rgba(14, 113, 34, 0.85);
    /* 深绿色半透明 */
    backdrop-filter: blur(10px);
    border: 1px solid rgba(229, 236, 230, 0.048);

    /* 布局 */
    display: flex;
    flex-direction: column;
    padding-bottom: 12px;
    padding-top: 12px;
    padding-left: 8px;
    padding-right: 1px;
    border-radius: 16px;
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
    color: rgba(255, 255, 255, 0.7);
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
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

/* 激活状态 - 亮绿色渐变 */
.sidebar-item.active {
    background: linear-gradient(135deg, #00bfa5 0%, #009688 100%);
    color: #fff;
    box-shadow: 0 4px 15px rgba(0, 191, 165, 0.4);
}

/* 激活状态下的图标微调 */
.sidebar-item.active .icon-wrapper {
    transform: scale(1.1);
}
</style>