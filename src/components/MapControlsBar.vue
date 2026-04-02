<template>
    <div class="map-controls-group modern-glass">
        <div
            class="coordinate-display"
            :class="{ editing: isCoordinateEditing, invalid: isInputInvalid }"
            @mouseenter="isCoordinateHover = true"
            @mouseleave="isCoordinateHover = false"
            @click="startCoordinateInput"
            title="单击输入经纬度并回车跳转"
        >
            <template v-if="!isCoordinateEditing">
                <span class="coordinate-text">{{ displayCoordinateText }}</span>
                <button
                    v-if="isCoordinateHover && canCopyCoordinate"
                    class="copy-coordinate-btn"
                    type="button"
                    title="复制坐标"
                    @click.stop="copyCurrentCoordinate"
                >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="11" height="11" rx="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span class="copy-tooltip">{{ copyTooltipText }}</span>
                </button>
            </template>
            <input
                v-else
                ref="coordinateInputRef"
                v-model="coordinateInputValue"
                class="coordinate-input"
                type="text"
                placeholder="114.302000, 34.814600"
                @click.stop
                @input="isInputInvalid = false"
                @keydown.enter.prevent="submitCoordinateInput"
                @keydown.esc.prevent="cancelCoordinateInput"
                @blur="cancelCoordinateInput"
            />
        </div>

        <div class="zoom-level-display" title="当前缩放级别">{{ currentZoom }}</div>
        <div class="divider"></div>
        <button
            class="home-btn"
            :class="{ rippling: homeButtonRippling }"
            @click="handleHomeInteract"
            title="单击复位 / 双击定位"
            type="button"
        >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 10.5 12 3l9 7.5"></path>
                <path d="M5 9.8V20h14V9.8"></path>
                <path d="M10 20v-6h4v6"></path>
            </svg>
        </button>
    </div>
</template>

<script setup>
/**
 * MapControlsBar 组件
 * 地图底部右侧控制条，显示实时坐标、缩放级别、复制/编辑坐标、主页按钮
 * 功能：
 * - 实时坐标显示和编辑
 * - 坐标复制到剪贴板
 * - 缩放级别显示
 * - 主页按钮（单击重置、双击定位用户）
 * - 完整的生命周期管理和计时器清理
 */

import { computed, nextTick, onUnmounted, ref } from 'vue';

// ========== 常量定义 ==========
/** 坐标占位符，用于显示无效坐标时的默认文本 */
const COORDINATE_PLACEHOLDER = 'Lon, Lat';

// ========== 组件 Props 定义 ==========
/**
 * @prop {String} coordinateText - 当前坐标文本（格式："lng, lat"）
 * @prop {Object|null} coordinate - 原始坐标对象 { lng, lat }，组件内部负责格式化
 * @prop {Number|String} currentZoom - 当前地图缩放级别（0-22）
 */
const props = defineProps({
    coordinate: {
        type: Object,
        default: null
    },
    coordinateText: {
        type: String,
        default: COORDINATE_PLACEHOLDER
    },
    currentZoom: {
        type: [Number, String],
        default: '--'
    }
});

// ========== 组件 Emits 定义 ==========
/**
 * @emit reset-view - 重置地图视图（单击主页按钮）
 * @emit locate-me - 定位到用户位置（双击主页按钮）
 * @emit jump-to - 跳转到指定坐标 { lng, lat }
 */
const emit = defineEmits([
    'reset-view',
    'locate-me',
    'jump-to'
]);

// ========== 状态变量 ==========
const coordinateInputRef = ref(null);                  // 坐标输入框 ref
const coordinateInputValue = ref('');                  // 坐标输入框当前值
const isCoordinateHover = ref(false);                  // 坐标区是否 hover
const isCoordinateEditing = ref(false);                // 是否处于坐标编辑模式
const isInputInvalid = ref(false);                     // 坐标输入是否有效
const copyTooltipText = ref('Copy');                   // 复制按钮提示文本
const homeButtonRippling = ref(false);                 // 主页按钮是否显示涟漪效果

// ========== 计时器变量 ==========
let homeClickTimer = null;        // 主页按钮点击检测计时器（用于双击检测）
let homeRippleTimer = null;       // 主页按钮涟漪效果计时器
let copyTooltipTimer = null;      // 复制提示文本重置计时器

// ========== 计算属性 ==========
/** 显示的坐标文本（无效时显示占位符） */
const displayCoordinateText = computed(() => {
    const lng = Number(props.coordinate?.lng);
    const lat = Number(props.coordinate?.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return `${lng.toFixed(6)}, ${lat.toFixed(6)}`;
    }

    const text = String(props.coordinateText || '').trim();
    return text || COORDINATE_PLACEHOLDER;
});

/** 是否可以复制坐标（坐标有效时） */
const canCopyCoordinate = computed(() => displayCoordinateText.value !== COORDINATE_PLACEHOLDER);

// ========== 坐标编辑函数 ==========

/**
 * 开始坐标编辑模式 - 显示输入框，自动选中现有坐标
 */
function startCoordinateInput() {
    if (isCoordinateEditing.value) return;
    isInputInvalid.value = false;
    isCoordinateEditing.value = true;
    coordinateInputValue.value = canCopyCoordinate.value ? displayCoordinateText.value : '';
    nextTick(() => {
        coordinateInputRef.value?.focus?.();
        coordinateInputRef.value?.select?.();
    });
}

/**
 * 取消坐标编辑 - 退出编辑模式，清除错误提示
 */
function cancelCoordinateInput() {
    isCoordinateEditing.value = false;
    isInputInvalid.value = false;
}

/**
 * 解析用户输入的坐标字符串
 * 支持格式：114.302, 34.814 / 114.302,34.814（支持中文逗号）
 * @param {String} rawText - 原始输入文本
 * @returns {Object|null} { lng, lat } 或 null（解析失败）
 */
function parseCoordinateInput(rawText) {
    const matches = String(rawText || '')
        .replace(/，/g, ',')
        .match(/[-+]?\d*\.?\d+/g);

    if (!matches || matches.length < 2) return null;

    const lng = Number(matches[0]);
    const lat = Number(matches[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;

    return { lng, lat };
}

/**
 * 提交坐标输入 - 解析坐标并触发跳转事件
 */
function submitCoordinateInput() {
    const parsed = parseCoordinateInput(coordinateInputValue.value);
    if (!parsed) {
        isInputInvalid.value = true;
        return;
    }

    isCoordinateEditing.value = false;
    isInputInvalid.value = false;
    emit('jump-to', parsed);
}

/**
 * 复制当前坐标到剪贴板
 * 优先使用 Clipboard API，回退到 execCommand（兼容老式浏览器或非 HTTPS 环境）
 */
const copyCurrentCoordinate = async () => {
    // 1. 检查是否允许复制以及文本是否存在
    if (!canCopyCoordinate.value || !displayCoordinateText.value) return;
    
    const textToCopy = displayCoordinateText.value;

    try {
        // 只有在支持 navigator.clipboard 且处于安全上下文(HTTPS/Localhost)时才可用
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(textToCopy);
        } else {
            // 如果不支持 API，手动抛错进入 catch 执行回退逻辑
            throw new Error('Clipboard API unavailable');
        }
    } catch (error) {
        // ========== 回退逻辑 (Fallback) ==========
        const fallbackInput = document.createElement('textarea');
        fallbackInput.value = textToCopy;
        
        // 确保 textarea 在页面上不可见但可操作
        fallbackInput.style.position = 'fixed';
        fallbackInput.style.left = '-9999px';
        fallbackInput.style.top = '0';
        fallbackInput.style.opacity = '0';
        
        document.body.appendChild(fallbackInput);
        fallbackInput.focus();
        fallbackInput.select();
        
        try {
            document.execCommand('copy');
        } catch (err) {
            message.error('无法执行复制命令:', err);
        }
        
        document.body.removeChild(fallbackInput);
    }

    // ========== UI 反馈逻辑 (Tooltip) ==========
    copyTooltipText.value = 'Copied';

    // 清除已有的定时器，防止快速多次点击导致的显示冲突
    if (copyTooltipTimer) {
        clearTimeout(copyTooltipTimer);
    }

    copyTooltipTimer = setTimeout(() => {
        copyTooltipText.value = 'Copy';
        copyTooltipTimer = null;
    }, 900);
};

/**
 * 触发主页按钮涟漪效果 - 根据点击位置动态显示
 */
function triggerHomeRipple(event) {
    const target = event?.currentTarget;
    if (target?.style) {
        const rect = target.getBoundingClientRect();
        const x = (event.clientX ?? rect.width / 2) - rect.left;
        const y = (event.clientY ?? rect.height / 2) - rect.top;
        target.style.setProperty('--ripple-x', `${x}px`);
        target.style.setProperty('--ripple-y', `${y}px`);
    }

    homeButtonRippling.value = false;
    if (homeRippleTimer) {
        clearTimeout(homeRippleTimer);
    }

    homeRippleTimer = setTimeout(() => {
        homeButtonRippling.value = true;
        homeRippleTimer = setTimeout(() => {
            homeButtonRippling.value = false;
            homeRippleTimer = null;
        }, 420);
    }, 0);
}

/**
 * 主页按钮交互处理 - 单击/双击检测
 * 单击（280ms）：重置地图视图
 * 双击（280ms内两次）：定位到用户位置
 */
function handleHomeInteract(event) {
    triggerHomeRipple(event);

    if (homeClickTimer) {
        clearTimeout(homeClickTimer);
        homeClickTimer = null;
        emit('locate-me');
        return;
    }

    homeClickTimer = setTimeout(() => {
        emit('reset-view');
        homeClickTimer = null;
    }, 280);
}

/**
 * 组件卸载时清理所有计时器 - 防止内存泄漏
 */
onUnmounted(() => {
    if (homeClickTimer) {
        clearTimeout(homeClickTimer);
        homeClickTimer = null;
    }
    if (homeRippleTimer) {
        clearTimeout(homeRippleTimer);
        homeRippleTimer = null;
    }
    if (copyTooltipTimer) {
        clearTimeout(copyTooltipTimer);
        copyTooltipTimer = null;
    }
});
</script>

<style scoped>
.map-controls-group {
    --brand-color: #309441;
    --brand-color-rgb: 48, 148, 65;
    --glass-bg: linear-gradient(135deg, rgba(var(--brand-color-rgb), 0.85), rgba(var(--brand-color-rgb), 0.85));
    --glass-border: rgba(255, 255, 255, 0.2);
    --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    --glass-text: #ffffff;
    --glass-chip-bg: rgba(255, 255, 255, 0.15);
    --recessed-bg: rgba(0, 0, 0, 0.1);
    --glass-divider: rgba(255, 255, 255, 0.2);
    --trans-curve: cubic-bezier(0.4, 0, 0.2, 1);
    
    position: absolute;
    right: 18px;
    bottom: 24px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 10px;
    /* padding: 8px 10px; */
    border-radius: 9999px;
    color: var(--glass-text);
    white-space: nowrap;
    transition: all 0.3s var(--trans-curve);
    
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}

.modern-glass {
    /* Kept for compatibility if still conditionally used, but merged above */
}

.coordinate-display {
    min-width: 260px;
    height: 38px;
    padding: 0 10px 0 14px;
    border-radius: 9999px;
    border: 1px solid transparent;
    background: var(--recessed-bg);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: text;
    transition: all 0.3s var(--trans-curve);
}

.coordinate-display:hover {
    background: rgba(0, 0, 0, 0.15);
}

.coordinate-display.editing {
    background: #ffffff;
    border: 1px solid var(--brand-color);
    box-shadow: inset 0 0 0 1px var(--brand-color);
}

.coordinate-display.invalid {
    box-shadow: inset 0 0 0 1px rgba(254, 202, 202, 0.85);
    border-color: rgba(254, 202, 202, 0.85);
}

.coordinate-text {
    /* 使用专门为显示数据设计的等宽字体 */
    font-family: 'JetBrains Mono', 'Fira Code', 'Roboto Mono', monospace;
    font-size: 16px;
    font-weight: 600; /* 加粗一点，让它在绿色背景上更有力量感 */
    color: #ffffff;
    letter-spacing: 0.05em; /* 稍微拉开字间距，更有呼吸感 */
    text-shadow: 0 1px 2px rgba(194, 178, 178, 0.2); /* 给文字加一点微弱阴影，防止在亮色图层上看不清 */
}

.coordinate-display.editing .coordinate-input {
    color: #706969;
}

.copy-coordinate-btn {
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.15);
    color: var(--glass-text);
    border-radius: 9999px;
    padding: 0 8px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.3s var(--trans-curve);
}

.copy-coordinate-btn:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.25);
}

.copy-tooltip {
    line-height: 1;
}

.coordinate-input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--glass-text);
    font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
    font-size: 13px;
}

.coordinate-input::placeholder {
    color: rgba(0, 0, 0, 0.4);
}

.zoom-level-display {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--glass-chip-bg);
    color: #ffffff;
    font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
    font-size: 18px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--trans-curve);
}

.divider {
    width: 1px;
    height: 20px;
    background-color: var(--glass-divider);
    flex-shrink: 0;
}

.home-btn {
    --ripple-x: 50%;
    --ripple-y: 50%;
    width: 38px;
    height: 38px;
    position: relative;
    overflow: hidden;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s var(--trans-curve);
}

.home-btn::after {
    content: '';
    position: absolute;
    left: var(--ripple-x);
    top: var(--ripple-y);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    background: rgba(255, 255, 255, 0.3);
    opacity: 0;
    pointer-events: none;
}

.home-btn.rippling::after {
    animation: home-button-ripple 0.45s ease-out;
}

.home-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.1);
    filter: brightness(1.2);
}

.home-btn:active {
    transform: scale(0.95);
}

@keyframes home-button-ripple {
    0% {
        opacity: 0.5;
        transform: translate(-50%, -50%) scale(0);
    }
    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(10);
    }
}

@media (max-width: 768px) {
    .map-controls-group {
        left: 12px;
        right: 12px;
        bottom: 16px;
        padding: 8px;
        gap: 8px;
    }

    .coordinate-display {
        min-width: 0;
        flex: 1;
    }

    .copy-tooltip {
        display: none;
    }
}
</style>
