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

<script lang="ts" src="./ResizeHandle.ts"></script>

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
    z-index: var(--z-toast);
}
</style>