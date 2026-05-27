<template>
    <div class="draw-panel">
        <div class="panel-header">
            <span class="panel-title">绘制工具</span>
            <button class="close-btn" @click="$emit('close')">
                <X :size="14" />
            </button>
        </div>

        <div class="tool-grid">
            <button
                v-for="tool in drawTools"
                :key="tool.type"
                class="tool-btn"
                :class="{ active: activeType === tool.type }"
                @click="selectTool(tool.type)"
            >
                <component :is="tool.icon" :size="18" />
                <span class="tool-label">{{ tool.label }}</span>
            </button>
        </div>

        <div class="panel-actions">
            <button class="action-btn clear-btn" @click="handleClear">
                <Trash2 :size="14" />
                <span>清除所有</span>
            </button>
        </div>

        <div class="panel-hint">
            <Info :size="12" />
            <span>{{ hint }}</span>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { X, Info, Trash2, CircleDot, PenLine, Pentagon } from 'lucide-vue-next';

const emit = defineEmits(['draw-type', 'clear', 'close']);

const activeType = ref('');

const drawTools = [
    { type: 'Point', label: '点', icon: CircleDot },
    { type: 'LineString', label: '线', icon: PenLine },
    { type: 'Polygon', label: '面', icon: Pentagon },
];

const hint = computed(() => {
    switch (activeType.value) {
        case 'Point':
            return '单击地图放置点标记';
        case 'LineString':
            return '单击地图绘制折线，双击结束';
        case 'Polygon':
            return '单击地图绘制多边形，双击结束';
        default:
            return '选择绘制类型后在地图上操作';
    }
});

function selectTool(type) {
    activeType.value = type;
    emit('draw-type', type);
}

function handleClear() {
    activeType.value = '';
    emit('clear');
}
</script>

<style scoped>
.draw-panel {
    width: 200px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(229, 236, 230, 0.6);
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-8px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: linear-gradient(135deg, #0d972fc8 0%, #0a6815c1 100%);
    color: white;
}

.panel-title {
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
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.4);
}

.tool-grid {
    display: flex;
    gap: 8px;
    padding: 12px;
}

.tool-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    border: 2px solid #e8f0e8;
    border-radius: 8px;
    background: white;
    color: #397d39;
    cursor: pointer;
    transition: all 0.2s;
}

.tool-btn:hover {
    border-color: #57b861;
    background: rgba(87, 184, 97, 0.08);
}

.tool-btn.active {
    border-color: #57b861;
    background: linear-gradient(135deg, rgba(13, 151, 47, 0.1) 0%, rgba(87, 184, 97, 0.15) 100%);
    color: #0a6815;
    box-shadow: 0 2px 8px rgba(87, 184, 97, 0.25);
}

.tool-label {
    font-size: 11px;
    font-weight: 500;
}

.panel-actions {
    padding: 0 12px 10px;
}

.action-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.clear-btn {
    background: #fff0f0;
    border: 1px solid #ffd0d0;
    color: #d44;
}

.clear-btn:hover {
    background: #ffe0e0;
    border-color: #ffb0b0;
}

.panel-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #f6faf6;
    color: #6b8c6b;
    font-size: 11px;
    border-top: 1px solid #e8f0e8;
}
</style>
