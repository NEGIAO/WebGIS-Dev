<template>
  <div class="map-swipe-controller" :class="{ 'is-active': isActive, [swipeMode]: true }">
    <!-- 滑块分割线 -->
    <div class="swipe-splitter" :style="splitterStyle" @mousedown="handleSplitterMouseDown"
      @touchstart="handleSplitterTouchStart" role="slider"
      :aria-label="`Map swipe ${swipeMode === 'horizontal' ? 'horizontal' : 'vertical'} slider`"
      :aria-valuenow="Math.round(swipePosition * 100)" aria-valuemin="0" aria-valuemax="100" tabindex="0"
      @keydown="handleSplitterKeyDown">
      <!-- 分割线句柄 -->
      <div class="swipe-handle">
        <svg class="handle-icon" viewBox="0 0 24 24" width="20" height="20">
          <path v-if="swipeMode === 'horizontal'" fill="currentColor" d="M9 3v18M15 3v18" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" />
          <path v-else fill="currentColor" d="M3 9h18M3 15h18" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" />
        </svg>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="swipe-controls">
      <!-- 模式切换按钮 -->
      <button class="control-btn mode-toggle-btn" @click="toggleMode" title="Toggle swipe mode (horizontal/vertical)"
        aria-label="Toggle swipe mode">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <!-- 旋转图标 -->
          <path fill="currentColor" d="M7 10h10v4H7z M16 7v3h3M8 17v-3H5" />
        </svg>
      </button>

      <!-- 关闭按钮 -->
      <button class="control-btn close-btn" @click="closeSwipe" title="Close swipe mode" aria-label="Close swipe mode">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <!-- 位置指示器 -->
    <div v-if="showPositionLabel" class="position-label">
      {{ positionPercentage }}%
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Props {
  swipePosition?: number
  swipeMode?: 'horizontal' | 'vertical'
  isActive?: boolean
  showPositionLabel?: boolean
  containerRect?: DOMRect | null
}

// emits are declared as string event names below (kebab-case for parent template bindings)

const props = withDefaults(defineProps<Props>(), {
  swipePosition: 0.5,
  swipeMode: 'horizontal',
  isActive: true,
  showPositionLabel: true,
  containerRect: null
})

const emit = defineEmits(["update:swipe-position", "update:swipe-mode", "close"])

// ========== 本地状态 ==========
const isDragging = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const swipePosition = ref(props.swipePosition)
const swipeMode = ref<'horizontal' | 'vertical'>(props.swipeMode)

// ========== 计算属性 ==========
const positionPercentage = computed(() => Math.round(swipePosition.value * 100))

const isActive = computed(() => props.isActive && swipePosition.value >= 0 && swipePosition.value <= 1)

const splitterStyle = computed(() => {
  const baseStyle: Record<string, any> = {
    position: 'absolute',
    zIndex: 2000,
    cursor: swipeMode.value === 'horizontal' ? 'col-resize' : 'row-resize',
    transition: isDragging.value ? 'none' : 'all 0.2s ease-out'
  }

  if (swipeMode.value === 'horizontal') {
    baseStyle.left = `${swipePosition.value * 100}%`
    baseStyle.top = 0
    baseStyle.width = '4px'
    baseStyle.height = '100%'
    baseStyle.transform = 'translateX(-50%)'
  } else {
    baseStyle.left = 0
    baseStyle.top = `${swipePosition.value * 100}%`
    baseStyle.width = '100%'
    baseStyle.height = '4px'
    baseStyle.transform = 'translateY(-50%)'
  }

  return baseStyle
})

// ========== 事件处理 ==========
function handleSplitterMouseDown(e: MouseEvent) {
  if (e.button !== 0) return // 仅左键
  isDragging.value = true
  dragStartPos.value = { x: e.clientX, y: e.clientY }
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  e.preventDefault()
}

function handleSplitterTouchStart(e: TouchEvent) {
  isDragging.value = true
  const touch = e.touches[0]
  dragStartPos.value = { x: touch.clientX, y: touch.clientY }
  document.addEventListener('touchmove', handleTouchMove)
  document.addEventListener('touchend', handleTouchEnd)
  e.preventDefault()
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value || !props.containerRect) return
  updateSwipePositionFromEvent(e.clientX, e.clientY)
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging.value || !props.containerRect) return
  const touch = e.touches[0]
  updateSwipePositionFromEvent(touch.clientX, touch.clientY)
}

function handleMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}

function handleTouchEnd() {
  isDragging.value = false
  document.removeEventListener('touchmove', handleTouchMove)
  document.removeEventListener('touchend', handleTouchEnd)
}

function handleSplitterKeyDown(e: KeyboardEvent) {
  const step = 0.02 // 2% per keystroke

  if (swipeMode.value === 'horizontal') {
    if (e.key === 'ArrowLeft') {
      swipePosition.value = Math.max(0.05, swipePosition.value - step)
      e.preventDefault()
    } else if (e.key === 'ArrowRight') {
      swipePosition.value = Math.min(0.95, swipePosition.value + step)
      e.preventDefault()
    }
  } else {
    if (e.key === 'ArrowUp') {
      swipePosition.value = Math.max(0.05, swipePosition.value - step)
      e.preventDefault()
    } else if (e.key === 'ArrowDown') {
      swipePosition.value = Math.min(0.95, swipePosition.value + step)
      e.preventDefault()
    }
  }

  if (e.key === 'Home') {
    swipePosition.value = 0.05
    e.preventDefault()
  } else if (e.key === 'End') {
    swipePosition.value = 0.95
    e.preventDefault()
  }

  emit('update:swipe-position', swipePosition.value)
}

function updateSwipePositionFromEvent(clientX: number, clientY: number) {
  if (!props.containerRect) return

  let newPosition: number

  if (swipeMode.value === 'horizontal') {
    const relativeX = clientX - props.containerRect.left
    newPosition = Math.max(0, Math.min(1, relativeX / props.containerRect.width))
  } else {
    const relativeY = clientY - props.containerRect.top
    newPosition = Math.max(0, Math.min(1, relativeY / props.containerRect.height))
  }

  // clamp to safe bounds to avoid auto-jump/extreme values
  const clamped = Math.max(0.05, Math.min(0.95, newPosition))
  swipePosition.value = clamped
  emit('update:swipe-position', clamped)
}

function toggleMode() {
  swipeMode.value = swipeMode.value === 'horizontal' ? 'vertical' : 'horizontal'
  emit('update:swipe-mode', swipeMode.value)
}

function closeSwipe() {
  emit('close')
}

// ========== 生命周期 ==========
onMounted(() => {
  // 初始化时更新本地状态
  swipePosition.value = props.swipePosition
  swipeMode.value = props.swipeMode
})

onUnmounted(() => {
  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('touchmove', handleTouchMove)
  document.removeEventListener('touchend', handleTouchEnd)
})
</script>

<style scoped lang="css">
.map-swipe-controller {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1999;
  user-select: none;
}

.map-swipe-controller.is-active {
  pointer-events: none;
}

/* ========== 分割线样式 ========== */
.swipe-splitter {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(90deg, rgba(91, 207, 137, 0.1), rgba(91, 207, 137, 0.3));
  backdrop-filter: blur(4px);
  border-left: 1px solid rgba(91, 207, 137, 0.5);
  border-right: 1px solid rgba(91, 207, 137, 0.3);
  pointer-events: auto;
  box-shadow: 0 0 8px rgba(91, 207, 137, 0.2);
  transition: box-shadow 0.2s ease-out;
}

.swipe-splitter:hover,
.swipe-splitter:focus {
  box-shadow: 0 0 16px rgba(91, 207, 137, 0.4);
  outline: none;
}

.swipe-splitter.vertical {
  border-left: none;
  border-right: none;
  border-top: 1px solid rgba(91, 207, 137, 0.5);
  border-bottom: 1px solid rgba(91, 207, 137, 0.3);
}

/* ========== 句柄样式 ========== */
.swipe-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(91, 207, 137, 0.8);
  border-radius: 4px;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease-out;
  color: white;
}

.swipe-splitter:hover .swipe-handle {
  background: rgba(91, 207, 137, 1);
  box-shadow: 0 4px 16px rgba(91, 207, 137, 0.3);
}

.handle-icon {
  width: 20px;
  height: 20px;
  color: white;
  opacity: 0.9;
}

/* ========== 控制按钮 ========== */
.swipe-controls {
  position: absolute;
  bottom: 20px;
  left: 20px;
  display: flex;
  gap: 8px;
  z-index: 2001;
  pointer-events: auto;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  width: 36px;
  height: 36px;
  padding: 0;
  background: rgba(91, 207, 137, 0.85);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease-out;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.control-btn:hover {
  background: rgba(91, 207, 137, 1);
  box-shadow: 0 4px 12px rgba(91, 207, 137, 0.3);
  transform: translateY(-2px);
}

.control-btn:active {
  transform: translateY(0);
}

.control-btn svg {
  width: 16px;
  height: 16px;
}

/* ========== 位置标签 ========== */
.position-label {
  position: absolute;
  top: 20px;
  left: 20px;
  padding: 6px 12px;
  background: rgba(91, 207, 137, 0.85);
  color: white;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 2001;
}

/* ========== 响应式设计 ========== */
@media (max-width: 576px) {
  .swipe-handle {
    width: 32px;
    height: 32px;
  }

  .handle-icon {
    width: 16px;
    height: 16px;
  }

  .swipe-controls {
    bottom: 12px;
    left: 12px;
    gap: 6px;
  }

  .control-btn {
    width: 32px;
    height: 32px;
  }

  .position-label {
    top: 12px;
    left: 12px;
    padding: 4px 8px;
    font-size: 11px;
  }
}

/* ========== 暗黑模式适配 ========== */
@media (prefers-color-scheme: dark) {
  .swipe-splitter {
    background: linear-gradient(90deg, rgba(91, 207, 137, 0.15), rgba(91, 207, 137, 0.25));
    border-left-color: rgba(91, 207, 137, 0.6);
    border-right-color: rgba(91, 207, 137, 0.4);
  }

  .swipe-splitter.vertical {
    border-top-color: rgba(91, 207, 137, 0.6);
    border-bottom-color: rgba(91, 207, 137, 0.4);
  }
}
</style>
