<!-- eslint-disable vue/no-v-html -->
<template>
    <div
        class="message-host"
        :class="`message-host-${position}`"
        :style="cssVars"
        role="status"
        aria-live="polite"
    >
        <TransitionGroup
            name="toast"
            tag="div"
            class="toast-list"
            @mouseenter="pauseAllTimers"
            @mouseleave="resumeAllTimers"
        >
            <div
                v-for="(item, index) in messages"
                :key="item.id"
                class="toast-item"
                :style="{ '--i': index }"
                :class="[
                    `toast-${resolveVisualType(item.type)}`,
                    { 'toast-soup': item.type === 'soup' },
                    {
                        clickable: item.closable !== false,
                        'toast-item-collapsing': isCollapsing(item.id),
                    },
                ]"
                @click="handleItemClick(item)"
            >
                <div class="toast-icon-wrap">
                    <div class="toast-icon">{{ getTypeIcon(item.type) }}</div>
                    <span
                        v-if="(item._dedupCount || 0) > 1"
                        class="toast-count"
                    >×{{ item._dedupCount > 99 ? '99+' : item._dedupCount }}</span>
                </div>
                <div class="toast-content">
                    <div
                        v-if="shouldShowTitle(item)"
                        class="toast-title"
                    >
                        {{ getTypeTitle(item.type) }}
                    </div>
                    <div
                        class="toast-text"
                        v-html="formatTextWithFonts(item.text)"
                    ></div>
                </div>
                <button
                    v-if="item.closable !== false"
                    type="button"
                    class="toast-close"
                    :aria-label="t('common.close')"
                    @click.stop="handleCloseButtonClick(item.id)"
                >
                    ×
                </button>
                <div
                    v-if="(item._lifeMs || 0) > 0"
                    class="toast-progress"
                >
                    <i
                        :key="`bar_${item.id}_${item._dedupCount || 0}`"
                        class="toast-progress-bar"
                        :style="{ animationDuration: `${item._lifeMs}ms` }"
                    ></i>
                </div>
            </div>
            <div
                v-if="queued.length > 0"
                key="__queue_hint__"
                class="toast-queue-hint"
            >
                {{ t('message.queueMore', { count: queued.length }) }}
            </div>
        </TransitionGroup>
    </div>
</template>

<script setup>
import { toRef } from 'vue';
import { useMessageIslandMotion } from '@common/shell/useMessageIslandMotion';
import { useLocale } from '@common/app/useLocale';

const props = defineProps({
    messages: {
        type: Array,
        default: () => [],
    },
    // 等待队列（MAX_VISIBLE 之外的积压消息）。传数组引用以保持响应式，仅读取 length。
    queued: {
        type: Array,
        default: () => [],
    },
    position: {
        type: String,
        default: 'top-right',
    },
    // 新增：默认自动关闭的时间（毫秒）。设置为 0 则不自动关闭
    duration: {
        type: Number,
        default: 3000,
    },
});

const emit = defineEmits(['close']);
const { t } = useLocale();

const messagesRef = toRef(props, 'messages');
const durationRef = toRef(props, 'duration');

// 将自动关闭、悬停暂停恢复、点击收缩消失统一封装，避免组件中重复计时器逻辑。
// V3.4.x：暂停语义提升到整岛（指针进入岛内暂停全部计时），阅读时邻条不再消失。
const {
    clickCollapseMs,
    handleCloseButtonClick,
    handleItemClick,
    isCollapsing,
    pauseAllTimers,
    resumeAllTimers,
} = useMessageIslandMotion({
    messagesRef,
    durationRef,
    onClose: (id) => emit('close', id),
});

// 动画时长通过 CSS 变量暴露，便于后续在主题层统一调参。
const cssVars = {
    '--toast-collapse-duration': `${clickCollapseMs}ms`,
};

// --- 原有逻辑 ---
function resolveVisualType(type) {
    if (type === 'soup') return 'info';
    return type;
}

function shouldShowTitle(item) {
    return item?.showTitle !== false && item?.type !== 'soup';
}

function getTypeIcon(type) {
    if (type === 'success') return '✓';
    if (type === 'error') return '!';
    if (type === 'warning') return '⚠';
    if (type === 'soup') return '🥣';
    return 'i';
}

function getTypeTitle(type) {
    if (type === 'success') return t('message.types.success');
    if (type === 'error') return t('message.types.error');
    if (type === 'warning') return t('message.types.warning');
    if (type === 'soup') return t('message.types.soup');
    return t('message.types.info');
}

// HTML 转义，避免 v-html 注入风险。
function escapeHtml(input) {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 根据字符类型（中英文）分别包装，以便 CSS 中区分字体
function formatTextWithFonts(text) {
    const safeText = String(text ?? '');
    return safeText.replace(/([a-zA-Z]+)|([\u4E00-\u9FFF]+)|(.)/g, (match, en, zh) => {
        if (en) {
            return `<span class="toast-text-en">${escapeHtml(en)}</span>`;
        }
        if (zh) {
            return `<span class="toast-text-zh">${escapeHtml(zh)}</span>`;
        }
        return escapeHtml(match); // 保留其他字符（包括换行符、数字、符号等）
    });
}
</script>

<style scoped>
.message-host {
    position: fixed;
    z-index: var(--z-toast);
    pointer-events: none;
    width: min(500px, calc(100vw - 24px));
    --island-spring-bouncy: cubic-bezier(0.34, 1.56, 0.64, 1);
    --island-spring-stable: cubic-bezier(0.2, 0, 0, 1);
    --island-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

.message-host-top-center {
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
}

/* 组件默认 position 的兜底样式（此前缺失：fixed 无偏移时位置未定义） */
.message-host-top-right {
    top: 16px;
    right: 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}

.toast-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-radius: 36px;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
    /* 28→20px：首屏 burst 多条同时进出时模糊面积大，减负后观感几乎无差 */
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: #000000;
    max-width: 100%;
    transition: all 0.4s var(--island-spring-bouncy);
}

.toast-item {
    pointer-events: auto;
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 20px 16px;
    color: #ffffff;
    cursor: default;
    user-select: none;
    transform-origin: center top;
    max-height: 150px;
    box-sizing: border-box;
    will-change: transform, opacity, max-height, padding, filter;
    background-color: transparent;
}

/* Internal borders for segmented look when multiple messages */
.toast-item:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.toast-item.clickable {
    cursor: pointer;
    transition: background-color 0.2s;
}

.toast-item.clickable:hover {
    background-color: rgba(255, 255, 255, 0.12);
}

.toast-item.clickable:active {
    background-color: rgba(255, 255, 255, 0.06);
}

/* Icons styling */
.toast-icon-wrap {
    position: relative;
    flex-shrink: 0;
}

.toast-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: bold;
}

/* 防抖合并计数徽标：替代旧的"（共N条）"文本改写 */
.toast-count {
    position: absolute;
    top: -7px;
    right: -10px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.92);
    color: #000000;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    box-sizing: border-box;
    border: 2px solid #000000;
    font-family: 'SF Pro Text', 'Segoe UI', Arial, sans-serif;
}

.toast-success .toast-icon {
    background: var(--success);
    color: #000000;
}

.toast-error .toast-icon {
    background: var(--danger);
    color: #ffffff;
}

.toast-warning .toast-icon {
    background: var(--warning);
    color: #000000;
}

.toast-info .toast-icon {
    background: var(--info);
    color: #ffffff;
}

.toast-content {
    min-width: 0;
    flex: 1;
}

.toast-title {
    /* 标题为中文（成功/错误/警告/提示），补中文字体栈避免 Cinzel 拉丁衬线下的不可控回退 */
    font-family: 'Cinzel', 'Microsoft YaHei', 'Noto Sans CJK SC', 'PingFang SC', 'Times New Roman', serif;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
    margin-bottom: 2px;
}

.toast-text {
    font-size: 14px;
    font-family: 'Cinzel', 'Times New Roman', serif;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.7);
    word-break: break-word;
    white-space: pre-wrap;
    overflow-wrap: break-word;
}

/* 中文字体 - 使用思源黑体或微软雅黑等衬线字体 */
.toast-text-zh {
    font-family: 'Microsoft YaHei', 'Noto Sans CJK SC', 'PingFang SC', sans-serif;
    font-weight: 800;
    letter-spacing: 0.02em;
}

/* 英文字体 - 使用更现代的无衬线字体 */
.toast-text-en {
    font-family: 'SF Pro Text', 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    font-weight: 500;
    letter-spacing: -0.01em;
}

.toast-close {
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-left: auto;
}

.toast-close:hover {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}

/* 自动关闭进度条：时长 = 实际调度寿命(_lifeMs，含错峰偏移)，与计时器严格同相位；
   整岛悬停时随计时器一起冻结（play-state 联动 .toast-list:hover） */
.toast-progress {
    position: absolute;
    left: 20px;
    right: 20px;
    bottom: 6px;
    height: 2px;
    border-radius: 1px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
    pointer-events: none;
}

.toast-progress-bar {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    transform-origin: left center;
    background: rgba(255, 255, 255, 0.35);
    animation: toast-life linear forwards;
}

.toast-success .toast-progress-bar { background: var(--success); opacity: 0.55; }
.toast-error .toast-progress-bar { background: var(--danger); opacity: 0.65; }
.toast-warning .toast-progress-bar { background: var(--warning); opacity: 0.6; }
.toast-info .toast-progress-bar { background: var(--info); opacity: 0.55; }

.toast-list:hover .toast-progress-bar {
    animation-play-state: paused;
}

@keyframes toast-life {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
}

/* 队列积压徽标：MAX_VISIBLE 之外的等待消息数，让首屏 burst 的"后续还有"可预期 */
.toast-queue-hint {
    pointer-events: none;
    padding: 6px 20px 8px;
    text-align: center;
    font-size: 12px;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.45);
    font-family: 'Microsoft YaHei', 'Noto Sans CJK SC', 'PingFang SC', sans-serif;
    border-top: 1px dashed rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
}

/* =========================================
   Vue Transition Group Classes
========================================= */

/* Default Enter/Leave Baseline */
.toast-enter-active,
.toast-leave-active {
    transition:
        transform 0.5s var(--island-spring-bouncy),
        opacity 0.4s ease-out,
        max-height 0.5s var(--island-spring-bouncy),
        padding 0.5s var(--island-spring-bouncy),
        filter 0.4s ease-out;
}

/* 进场级联：同帧 burst 多条时按列表序错峰 45ms，避免齐刷刷弹出（leave/move 不延迟） */
.toast-enter-active {
    transition-delay: calc(var(--i, 0) * 45ms);
}

@media (prefers-reduced-motion: reduce) {
    .toast-enter-active {
        transition-delay: 0ms;
    }

    .toast-progress {
        display: none;
    }
}

/* Success Priority: Fast, Bouncy, Playful */
.toast-success.toast-enter-active,
.toast-success.toast-leave-active {
    transition:
        transform 0.4s var(--island-spring-bouncy),
        opacity 0.3s ease-out,
        max-height 0.4s var(--island-spring-bouncy),
        padding 0.4s var(--island-spring-bouncy);
}

/* Error/Warning Priority: Slower, Steadier, Serious */
.toast-error.toast-enter-active,
.toast-error.toast-leave-active,
.toast-warning.toast-enter-active,
.toast-warning.toast-leave-active {
    transition:
        transform 0.6s var(--island-spring-stable),
        opacity 0.5s ease-out,
        max-height 0.6s var(--island-spring-stable),
        padding 0.6s var(--island-spring-stable);
}

/* Start State（blur 8→4px：首屏多条同时 enter 时模糊过渡叠加是掉帧大户） */
.toast-enter-from {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    filter: blur(4px);
}

/* End State（blur 10→6px，理由同上） */
.toast-leave-to {
    opacity: 0;
    transform: scale(0.9) translateY(-10px);
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    filter: blur(6px);
}

/* Morphing Container Layout Triggers */
.toast-leave-active {
    position: absolute;
    width: 100%;
}

.toast-move {
    transition: transform 0.5s var(--island-spring-bouncy);
}
</style>
