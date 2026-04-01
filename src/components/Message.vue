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
          `toast-${item.type}`,
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
          <div class="toast-title">{{ getTypeTitle(item.type) }}</div>
          <div class="toast-text">{{ item.text }}</div>
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
    default: 2000 
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
function getTypeIcon(type) {
  if (type === 'success') return '✓';
  if (type === 'error') return '!';
  if (type === 'warning') return '⚠';
  return 'i';
}

function getTypeTitle(type) {
  if (type === 'success') return '成功';
  if (type === 'error') return '错误';
  if (type === 'warning') return '警告';
  return '提示';
}
</script>

<style scoped>

.message-host {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  width: min(420px, calc(100vw - 24px));
  --toast-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --toast-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --toast-collapse-duration: 280ms;
}

.message-host-top-right{
  top: 75px;         /* 保持你原本的顶部距离 */
  left: 50%;          /* 移至水平方向 50% 的位置 */
  right: auto;        /* 重置掉原本的 right 属性 */
  transform: translateX(-50%); /* 向左偏移自身宽度的 50%，达到真正的居中 */
  
  /* 确保 Flex 列表内部也是居中对齐（可选） */
  display: flex;
  flex-direction: column;
  align-items: center; 
}

.message-host-top-center {
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
}

.toast-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 10px 32px rgba(20, 30, 60, 0.18);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.58);
  max-width: 100%;
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  color: #203247;
  cursor: default;
  user-select: none;
  transform-origin: center center;
  max-height: 150px;
  box-sizing: border-box;
  will-change: transform, opacity, filter, max-height, padding, margin;
}

.toast-item:not(:last-child) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.toast-item.clickable {
  cursor: pointer;
}

.toast-item.clickable:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.toast-item.clickable:active {
  background-color: rgba(200, 200, 200, 0.1);
  transform: scale(0.98);
}

/* 灵动岛式收缩：先压缩、再轻微回弹、最终向中心消失。 */
.toast-item-collapsing {
  pointer-events: none;
  animation: island-collapse var(--toast-collapse-duration) var(--toast-ease-spring) forwards;
}

.toast-success {
  background: rgba(234, 250, 238, 0.4);
}

.toast-error {
  background: rgba(255, 235, 235, 0.4);
}

.toast-warning {
  background: rgba(255, 245, 225, 0.4);
}

.toast-info {
  background: rgba(235, 245, 255, 0.4);
}

.toast-icon {
  margin-top: 1px;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  color: #fff;
  background: rgba(40, 69, 99, 0.75);
}

.toast-content {
  min-width: 0;
  flex: 1;
}

.toast-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.toast-text {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.toast-close {
  border: none;
  background: transparent;
  color: rgba(46, 62, 79, 0.72);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  transition: color 0.2s ease; /* 关闭按钮颜色平滑过渡 */
}

.toast-close:hover {
  color: rgba(21, 34, 48, 0.95);
}

.toast-enter-active {
  transition:
    transform 0.42s var(--toast-ease-out),
    opacity 0.34s var(--toast-ease-out),
    filter 0.42s var(--toast-ease-out),
    max-height 0.42s var(--toast-ease-out),
    padding 0.42s var(--toast-ease-out),
    border-width 0.42s var(--toast-ease-out);
}

.toast-leave-active {
  transition:
    transform 0.26s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.22s ease-out,
    filter 0.24s ease-out,
    max-height 0.26s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.26s cubic-bezier(0.4, 0, 0.2, 1),
    border-width 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 优先级动画：成功更轻快 */
.toast-success.toast-enter-active,
.toast-success.toast-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.2s ease-out,
    filter 0.3s ease-out,
    max-height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    padding 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    border-width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 优先级动画：错误更慢更稳 */
.toast-error.toast-enter-active,
.toast-error.toast-leave-active {
  transition:
    transform 0.6s cubic-bezier(0.2, 0, 0.2, 1),
    opacity 0.5s ease-out,
    filter 0.6s ease-out,
    max-height 0.6s cubic-bezier(0.2, 0, 0.2, 1),
    padding 0.6s cubic-bezier(0.2, 0, 0.2, 1),
    border-width 0.6s cubic-bezier(0.2, 0, 0.2, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-14px) scale(0.9);
  filter: blur(6px);
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-width: 0;
}

.toast-leave-from {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
  max-height: 150px;
}

.toast-leave-to {
  opacity: 0;
  transform: scale(0.82);
  filter: blur(5px);
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-width: 0;
}

.toast-move {
  transition: transform 0.38s var(--toast-ease-out), max-height 0.38s var(--toast-ease-out);
}

@keyframes island-collapse {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale3d(1, 1, 1);
    filter: blur(0);
  }
  38% {
    transform: translate3d(0, 0, 0) scale3d(0.82, 0.82, 1);
  }
  60% {
    transform: translate3d(0, 0, 0) scale3d(0.88, 0.88, 1);
  }
  100% {
    opacity: 0;
    transform: translate3d(0, -1px, 0) scale3d(0.5, 0.5, 1);
    filter: blur(6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-item,
  .toast-enter-active,
  .toast-leave-active,
  .toast-move,
  .toast-item-collapsing {
    animation: none !important;
    transition: none !important;
    filter: none !important;
  }
}

@media (max-width: 768px) {
  .message-host {
    width: calc(100vw - 16px);
  }

  .message-host-top-right {
    top: 10px;
    left: 50%;
    right: auto;
    transform: translateX(-50%);
  }

  .toast-item {
    padding: 9px 10px;
    border-radius: 10px;
  }
}
</style>