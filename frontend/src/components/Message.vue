<template>
  <div
    class="message-host"
    :class="`message-host-${position}`"
    :style="cssVars"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup name="toast" tag="div" class="toast-list">
      <div
        v-for="item in messages"
        :key="item.id"
        class="toast-item"
        :class="[
          `toast-${resolveVisualType(item.type)}`,
          { 'toast-soup': item.type === 'soup' },
          {
            clickable: item.closable !== false,
            'toast-item-collapsing': isCollapsing(item.id)
          }
        ]"
        @mouseenter="pauseTimer(item.id)"
        @mouseleave="resumeTimer(item)"
        @click="handleItemClick(item)"
      >
        <div class="toast-icon">{{ getTypeIcon(item.type) }}</div>
        <div class="toast-content">
          <div v-if="shouldShowTitle(item)" class="toast-title">{{ getTypeTitle(item.type) }}</div>
          <div class="toast-text" v-html="formatTextWithFonts(item.text)"></div>
        </div>
        <button
          v-if="item.closable !== false"
          type="button"
          class="toast-close"
          aria-label="关闭"
          @click.stop="handleCloseButtonClick(item.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { toRef } from 'vue';
import { useMessageIslandMotion } from '../composables/useMessageIslandMotion';

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  },
  position: {
    type: String,
    default: 'top-right'
  },
  // 新增：默认自动关闭的时间（毫秒）。设置为 0 则不自动关闭
  duration: {
    type: Number,
    default: 3000 
  }
});

const emit = defineEmits(['close']);

const messagesRef = toRef(props, 'messages');
const durationRef = toRef(props, 'duration');

// 将自动关闭、hover 暂停恢复、点击收缩消失统一封装，避免组件中重复计时器逻辑。
const {
  clickCollapseMs,
  handleCloseButtonClick,
  handleItemClick,
  isCollapsing,
  pauseTimer,
  resumeTimer
} = useMessageIslandMotion({
  messagesRef,
  durationRef,
  onClose: (id) => emit('close', id)
});

// 动画时长通过 CSS 变量暴露，便于后续在主题层统一调参。
const cssVars = {
  '--toast-collapse-duration': `${clickCollapseMs}ms`
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
  if (type === 'success') return '成功';
  if (type === 'error') return '错误';
  if (type === 'warning') return '警告';
  if (type === 'soup') return '鸡汤';
  return '提示';
}

// 根据字符类型（中英文）分别包装，以便 CSS 中区分字体
function formatTextWithFonts(text) {
  return text.replace(/([a-zA-Z]+)|([\u4E00-\u9FFF]+)|(.)/g, (match, en, zh) => {
    if (en) {
      return `<span class="toast-text-en">${en}</span>`;
    }
    if (zh) {
      return `<span class="toast-text-zh">${zh}</span>`;
    }
    return match; // 保留其他字符（包括换行符、数字、符号等）
  });
}
</script>

<style scoped>

.message-host {
  position: fixed;
  z-index: 9999;
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

.toast-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: 36px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #000000;
  max-width: 100%;
  transition: all 0.4s var(--island-spring-bouncy);
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
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
.toast-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: bold;
}

.toast-success .toast-icon {
  background: #34c759;
  color: #000000;
}

.toast-error .toast-icon {
  background: #ff3b30;
  color: #ffffff;
}

.toast-warning .toast-icon {
  background: #ffcc00;
  color: #000000;
}

.toast-info .toast-icon {
  background: #0a84ff;
  color: #ffffff;
}

.toast-content {
  min-width: 0;
  flex: 1;
}

.toast-title {
  font-family: 'Cinzel', 'Times New Roman', serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
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

/* Start State */
.toast-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  filter: blur(8px);
}

/* End State */
.toast-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-10px);
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  filter: blur(10px);
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