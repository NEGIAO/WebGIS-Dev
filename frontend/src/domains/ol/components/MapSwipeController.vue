<template>
    <div
        class="map-swipe-controller"
        :class="{ 'is-active': isActive, [swipeMode]: true }"
    >
        <!-- 滑块分割线 -->
        <div
            class="swipe-splitter"
            :class="{ 'long-press-active': longPressActive, 'long-pressing': isLongPressing }"
            :style="splitterStyle"
            role="slider"
            :aria-label="`Map swipe ${swipeMode === 'horizontal' ? 'horizontal' : 'vertical'} slider`"
            :aria-valuenow="Math.round(swipePosition * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
            tabindex="0"
            @mousedown="handleSplitterMouseDown"
            @touchstart="handleSplitterTouchStart"
            @touchmove="handleSplitterTouchMove"
            @touchend="handleSplitterTouchEnd"
            @touchcancel="handleSplitterTouchCancel"
            @keydown="handleSplitterKeyDown"
        >
            <!-- 分割线句柄 -->
            <div class="swipe-handle">
                <svg
                    class="handle-icon"
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                >
                    <path
                        v-if="swipeMode === 'horizontal'"
                        fill="currentColor"
                        d="M9 3v18M15 3v18"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                    />
                    <path
                        v-else
                        fill="currentColor"
                        d="M3 9h18M3 15h18"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                    />
                </svg>
            </div>
        </div>

        <!-- 控制按钮 -->
        <div class="swipe-controls">
            <!-- 模式切换按钮 -->
            <button
                class="control-btn mode-toggle-btn"
                title="模式切换（水平/垂直）"
                aria-label="Toggle swipe mode"
                @click="toggleMode"
            >
                <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                >
                    <!-- 旋转图标 -->
                    <path
                        fill="currentColor"
                        d="M7 10h10v4H7z M16 7v3h3M8 17v-3H5"
                    />
                </svg>
            </button>

            <!-- 关闭按钮 -->
            <button
                class="control-btn close-btn"
                title="关闭卷帘模式"
                aria-label="关闭卷帘模式"
                @click="closeSwipe"
            >
                <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                >
                    <path
                        fill="currentColor"
                        d="M18 6L6 18M6 6l12 12"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                    />
                </svg>
            </button>
        </div>

        <!-- 移动端快速控制面板 -->
        <div class="mobile-controls">
            <!-- 预设位置按钮 -->
            <div class="preset-buttons">
                <button
                    v-for="preset in presetPositions"
                    :key="preset.value"
                    class="preset-btn"
                    :class="{ active: Math.abs(swipePosition - preset.value) < 0.02 }"
                    @click="setPresetPosition(preset.value)"
                >
                    {{ preset.label }}
                </button>
            </div>

            <!-- 滑块控件 -->
            <div class="slider-control">
                <span class="slider-label">0%</span>
                <input
                    type="range"
                    class="position-slider"
                    :value="positionPercentage"
                    min="5"
                    max="95"
                    step="1"
                    @input="handleSliderInput"
                />
                <span class="slider-label">100%</span>
            </div>

            <!-- 当前位置显示 -->
            <div class="position-display">
                <span class="position-value">{{ positionPercentage }}%</span>
            </div>
        </div>

        <!-- 长按激活提示（移动端） -->
        <div
            v-if="showLongPressHint"
            class="long-press-hint"
        >
            <span class="hint-icon"><Hand :size="16" /></span>
            <span class="hint-text">已激活拖拽</span>
        </div>

        <!-- 位置指示器 -->
        <div
            v-if="showPositionLabel"
            class="position-label"
        >
            {{ positionPercentage }}%
        </div>
    </div>
</template>

<script lang="ts" src="./MapSwipeController.ts"></script>

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
    background: linear-gradient(90deg, rgba(var(--brand-accent-light-rgb), 0.1), rgba(var(--brand-accent-light-rgb), 0.3));
    backdrop-filter: blur(4px);
    border-left: 1px solid rgba(var(--brand-accent-light-rgb), 0.5);
    border-right: 1px solid rgba(var(--brand-accent-light-rgb), 0.3);
    pointer-events: auto;
    box-shadow: 0 0 8px rgba(var(--brand-accent-light-rgb), 0.2);
    transition: box-shadow 0.2s ease-out;
    touch-action: none;
}

/* 移动端触摸热区扩展：通过伪元素增加可触摸区域 */
.swipe-splitter::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 100%;
    z-index: -1;
}

.swipe-splitter.vertical::before {
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    width: 100%;
    height: 24px;
}

.swipe-splitter:hover,
.swipe-splitter:focus {
    box-shadow: 0 0 16px rgba(var(--brand-accent-light-rgb), 0.4);
    outline: none;
}

/* ========== 长按状态视觉反馈 ========== */
/* 长按等待中：呼吸发光动画提示用户可以长按 */
.swipe-splitter.long-pressing {
    animation: longPressPulse 0.6s ease-in-out infinite alternate;
}

.swipe-splitter.long-pressing .swipe-handle {
    background: rgba(var(--brand-accent-light-rgb), 1);
    box-shadow: 0 0 20px rgba(var(--brand-accent-light-rgb), 0.5);
}

/* 长按已激活：持续高亮状态 */
.swipe-splitter.long-press-active {
    box-shadow: 0 0 24px rgba(var(--brand-accent-light-rgb), 0.6);
}

.swipe-splitter.long-press-active .swipe-handle {
    background: rgba(var(--brand-accent-light-rgb), 1);
    box-shadow: 0 4px 20px rgba(var(--brand-accent-light-rgb), 0.5);
    transform: scale(1.1);
}

@keyframes longPressPulse {
    from {
        box-shadow: 0 0 8px rgba(var(--brand-accent-light-rgb), 0.3);
    }
    to {
        box-shadow: 0 0 20px rgba(var(--brand-accent-light-rgb), 0.6);
    }
}

/* ========== 长按激活提示 ========== */
.long-press-hint {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: rgba(var(--brand-accent-light-rgb), 0.9);
    color: var(--text-on-brand);
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    pointer-events: none;
    z-index: 2002;
    animation: hintFadeIn 0.2s ease-out, hintFadeOut 0.3s ease-in 0.5s forwards;
    white-space: nowrap;
}

.long-press-hint .hint-icon {
    font-size: 18px;
}

@keyframes hintFadeIn {
    from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.8);
    }
    to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }
}

@keyframes hintFadeOut {
    from {
        opacity: 1;
    }
    to {
        opacity: 0;
    }
}

.swipe-splitter.vertical {
    border-left: none;
    border-right: none;
    border-top: 1px solid rgba(var(--brand-accent-light-rgb), 0.5);
    border-bottom: 1px solid rgba(var(--brand-accent-light-rgb), 0.3);
}

/* ========== 句柄样式 ========== */
.swipe-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: rgba(var(--brand-accent-light-rgb), 0.8);
    border-radius: 4px;
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease-out;
    color: var(--text-on-brand);
}

.swipe-splitter:hover .swipe-handle {
    background: rgba(var(--brand-accent-light-rgb), 1);
    box-shadow: 0 4px 16px rgba(var(--brand-accent-light-rgb), 0.3);
}

.handle-icon {
    width: 20px;
    height: 20px;
    color: var(--text-on-brand);
    opacity: 0.9;
}

/* ========== 控制按钮 ========== */
.swipe-controls {
    position: absolute;
    bottom: 60px;
    left: 30px;
    display: flex;
    gap: 8px;
    z-index: calc(var(--z-modal) + 1);
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
    background: rgba(var(--brand-accent-light-rgb), 0.85);
    border: none;
    border-radius: 4px;
    color: var(--text-on-brand);
    cursor: pointer;
    transition: all 0.2s ease-out;
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}

.control-btn:hover {
    background: rgba(var(--brand-accent-light-rgb), 1);
    box-shadow: 0 4px 12px rgba(var(--brand-accent-light-rgb), 0.3);
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
    background: rgba(var(--brand-accent-light-rgb), 0.85);
    color: var(--text-on-brand);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    pointer-events: none;
    z-index: calc(var(--z-modal) + 1);
}

/* ========== 快速控制面板 ========== */
.mobile-controls {
    position: absolute;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    z-index: calc(var(--z-modal) + 1);
    pointer-events: auto;
    background: rgba(var(--brand-accent-light-rgb), 0.9);
    backdrop-filter: blur(12px);
    border-radius: 12px;
    padding: 12px 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    min-width: 280px;
    max-width: 90vw;
}

.preset-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}

.preset-btn {
    flex: 1;
    padding: 10px 8px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-on-brand);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease-out;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}

.preset-btn:hover,
.preset-btn:active {
    background: rgba(255, 255, 255, 0.3);
    border-color: rgba(255, 255, 255, 0.6);
}

.preset-btn.active {
    background: rgba(255, 255, 255, 0.4);
    border-color: white;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.3);
}

.slider-control {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}

.slider-label {
    font-size: 11px;
    color: var(--text-on-brand);
    opacity: 0.8;
    min-width: 30px;
    text-align: center;
}

.position-slider {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
}

.position-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: pointer;
}

.position-slider::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    border: none;
}

.position-display {
    text-align: center;
}

.position-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-on-brand);
}

/* ========== 响应式设计 ========== */
@media (max-width: 576px) {
    .swipe-handle {
        width: 40px;
        height: 40px;
    }

    .handle-icon {
        width: 18px;
        height: 18px;
    }

    /* 移动端触摸热区扩展至 36px */
    .swipe-splitter::before {
        width: 36px;
    }

    .swipe-splitter.vertical::before {
        width: 100%;
        height: 36px;
    }

    .swipe-controls {
        bottom: 12px;
        left: 12px;
        gap: 10px;
    }

    /* 移动端按钮保持符合触摸规范的尺寸 (>= 44px 含间距) */
    .control-btn {
        width: 40px;
        height: 40px;
        border-radius: 8px;
    }

    .control-btn svg {
        width: 20px;
        height: 20px;
    }

    .position-label {
        top: 12px;
        left: 12px;
        padding: 4px 8px;
        font-size: 11px;
    }
}

/* ========== 桌面端隐藏控制面板 ========== */
@media (min-width: 769px) {
    .mobile-controls {
        display: none;
    }
}

/* ========== 暗黑模式适配 ========== */
@media (prefers-color-scheme: dark) {
    .swipe-splitter {
        background: linear-gradient(90deg, rgba(var(--brand-accent-light-rgb), 0.15), rgba(var(--brand-accent-light-rgb), 0.25));
        border-left-color: rgba(var(--brand-accent-light-rgb), 0.6);
        border-right-color: rgba(var(--brand-accent-light-rgb), 0.4);
    }

    .swipe-splitter.vertical {
        border-top-color: rgba(var(--brand-accent-light-rgb), 0.6);
        border-bottom-color: rgba(var(--brand-accent-light-rgb), 0.4);
    }
}
</style>
