<script setup>
/**
 * ResizeHandle.vue - 可拖拽的分割条组件
 *
 * 功能：
 * - 在两个容器之间显示一个可拖拽的分割条
 * - 支持水平和垂直方向的拖拽
 * - 拖拽时实时更新容器比例
 * - 提供视觉反馈（hover和拖拽状态）
 *
 * Props:
 * - direction: 拖拽方向 'horizontal' | 'vertical' (默认: 'horizontal')
 * - minSize: 容器最小尺寸百分比 (默认: 20)
 * - maxSize: 容器最大尺寸百分比 (默认: 80)
 * - initialRatio: 初始比例 (默认: 50)
 *
 * Emits:
 * - resize: 拖拽时触发，返回新的比例值 (0-100)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
    direction: {
        type: String,
        default: 'horizontal',
        validator: (value) => ['horizontal', 'vertical'].includes(value)
    },
    minSize: {
        type: Number,
        default: 20,
        validator: (value) => value >= 0 && value <= 100
    },
    maxSize: {
        type: Number,
        default: 80,
        validator: (value) => value >= 0 && value <= 100
    },
    initialRatio: {
        type: Number,
        default: 50
    }
});

const emit = defineEmits(['resize', 'resize-end']);

const isDragging = ref(false);
const isHovered = ref(false);
const containerRef = ref(null);

// 计算分割条样式
const handleStyle = computed(() => ({
    cursor: props.direction === 'horizontal' ? 'col-resize' : 'row-resize',
    userSelect: isDragging.value ? 'none' : 'auto'
}));

// 鼠标进入
function onMouseEnter() {
    isHovered.value = true;
}

// 鼠标离开
function onMouseLeave() {
    if (!isDragging.value) {
        isHovered.value = false;
    }
}

// 鼠标按下 - 开始拖拽
function onMouseDown(event) {
    if (event.button !== 0) return; // 只响应左键
    
    isDragging.value = true;
    isHovered.value = true;
    
    // 阻止默认行为，避免文本选择
    event.preventDefault();
    
    // 添加全局事件监听
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // 添加拖拽状态样式到body
    document.body.style.cursor = props.direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
}

// 鼠标移动 - 处理拖拽
function onMouseMove(event) {
    if (!isDragging.value || !containerRef.value) return;
    
    // 获取父容器（content-section）
    const parent = containerRef.value.parentElement;
    if (!parent) return;
    
    const parentRect = parent.getBoundingClientRect();
    let newRatio;
    
    if (props.direction === 'horizontal') {
        // 水平拖拽：计算鼠标位置相对于父容器的比例
        const mouseX = event.clientX - parentRect.left;
        newRatio = (mouseX / parentRect.width) * 100;
    } else {
        // 垂直拖拽
        const mouseY = event.clientY - parentRect.top;
        newRatio = (mouseY / parentRect.height) * 100;
    }
    
    // 限制在最小和最大范围内
    newRatio = Math.max(props.minSize, Math.min(props.maxSize, newRatio));
    
    // 触发resize事件
    emit('resize', newRatio);
}

// 鼠标释放 - 结束拖拽
function onMouseUp() {
    isDragging.value = false;
    isHovered.value = false;
    
    // 移除全局事件监听
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    // 恢复body样式
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // 通知父组件拖拽结束
    emit('resize-end');
}

// 双击重置为初始比例
function onDoubleClick() {
    emit('resize', props.initialRatio);
}

// 组件挂载时的初始化
onMounted(() => {
    // 确保组件已正确挂载
});

// 组件卸载时清理事件监听
onUnmounted(() => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    // 确保body样式恢复
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
});
</script>

<template>
    <div
        ref="containerRef"
        class="resize-handle"
        :class="[
            `resize-handle--${direction}`,
            {
                'resize-handle--dragging': isDragging,
                'resize-handle--hovered': isHovered
            }
        ]"
        :style="handleStyle"
        @mouseenter="onMouseEnter"
        @mouseleave="onMouseLeave"
        @mousedown="onMouseDown"
        @dblclick="onDoubleClick"
    >
        <div class="resize-handle__indicator">
            <span class="resize-handle__dot"></span>
            <span class="resize-handle__dot"></span>
            <span class="resize-handle__dot"></span>
        </div>
    </div>
</template>

<style scoped>
.resize-handle {
    position: relative;
    flex-shrink: 0;
    z-index: 10;
    transition: background-color 0.2s ease;
}

/* 水平方向（左右拖拽） */
.resize-handle--horizontal {
    width: 1px;
    height: 100%;
    cursor: col-resize;
    background-color: transparent;
}

.resize-handle--horizontal:hover,
.resize-handle--horizontal.resize-handle--hovered {
    background-color: rgba(24, 144, 255, 0.15);
}

.resize-handle--horizontal.resize-handle--dragging {
    background-color: rgba(24, 144, 255, 0.25);
}

/* 垂直方向（上下拖拽） */
.resize-handle--vertical {
    width: 100%;
    height: 1px;
    cursor: row-resize;
    background-color: transparent;
}

.resize-handle--vertical:hover,
.resize-handle--vertical.resize-handle--hovered {
    background-color: rgba(24, 144, 255, 0.15);
}

.resize-handle--vertical.resize-handle--dragging {
    background-color: rgba(24, 144, 255, 0.25);
}

/* 拖拽指示器 */
.resize-handle__indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    gap: 3px;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.resize-handle--horizontal .resize-handle__indicator {
    flex-direction: column;
}

.resize-handle--vertical .resize-handle__indicator {
    flex-direction: row;
}

.resize-handle:hover .resize-handle__indicator,
.resize-handle--dragging .resize-handle__indicator {
    opacity: 1;
}

.resize-handle__dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background-color: rgba(24, 144, 255, 0.6);
}

/* 拖拽时的全局样式 */
.resize-handle--dragging {
    pointer-events: none;
}

/* 扩展热区，使分割条更容易点击 */
.resize-handle--horizontal::before {
    content: '';
    position: absolute;
    top: 0;
    left: -4px;
    right: -4px;
    bottom: 0;
}

.resize-handle--vertical::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -4px;
    bottom: -4px;
}

/* 拖拽时的视觉反馈 */
.resize-handle--dragging::after {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
}
</style>