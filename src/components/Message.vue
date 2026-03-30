<template>
  <div class="message-host" :class="`message-host-${position}`" role="status" aria-live="polite">
    <TransitionGroup name="toast" tag="div" class="toast-list">
      <div
        v-for="item in messages"
        :key="item.id"
        class="toast-item"
        :class="`toast-${item.type}`"
        @mouseenter="pauseTimer(item.id)"
        @mouseleave="resumeTimer(item)"
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
          @click="emitClose(item.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { watch, onUnmounted } from 'vue';

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

// 用于存储每个 message 的定时器
const timers = new Map();

// 启动自动关闭定时器
function startTimer(item, customTime) {
  // 支持在单个 item 上覆盖全局的 duration，例如 item.duration = 5000
  const itemDuration = item.duration !== undefined ? item.duration : props.duration;
  
  // 如果时间 <= 0，则说明该提示框不自动关闭
  if (itemDuration <= 0) return;

  // 如果已经有定时器，先清除
  if (timers.has(item.id)) {
    clearTimeout(timers.get(item.id));
  }

  // 使用传入的时间(鼠标移出时的短时间) 或 默认设定的时间
  const timeToClose = customTime !== undefined ? customTime : itemDuration;

  const timer = setTimeout(() => {
    emitClose(item.id);
  }, timeToClose);

  timers.set(item.id, timer);
}

// 鼠标移入：暂停（清除）定时器
function pauseTimer(id) {
  if (timers.has(id)) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
}

// 鼠标移出：很快平滑消失（设置为 800ms 后关闭）
function resumeTimer(item) {
  const itemDuration = item.duration !== undefined ? item.duration : props.duration;
  if (itemDuration <= 0) return; // 如果本身设为不自动关闭，移出后也不关闭

  // 鼠标离开后，让它在很短的时间内（如 800ms）自动关闭
  startTimer(item, 800);
}

// 触发关闭事件并清理定时器
function emitClose(id) {
  pauseTimer(id); // 清理内部定时器
  emit('close', id);
}

// 监听 messages 数组的变化，为新加入的消息启动定时器
watch(
  () => props.messages,
  (newMessages, oldMessages) => {
    const oldIds = new Set((oldMessages || []).map(m => m.id));
    newMessages.forEach(msg => {
      // 发现新进入的消息
      if (!oldIds.has(msg.id)) {
        startTimer(msg);
      }
    });
  },
  { immediate: true, deep: true }
);

// 组件卸载时，清理所有正在运行的定时器以防内存泄漏
onUnmounted(() => {
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
});

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
}

.message-host-top-right {
  top: 14px;
  right: 14px;
}

.message-host-top-center {
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
}

.toast-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.32);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 10px 24px rgba(20, 30, 60, 0.18);
  background: rgba(255, 255, 255, 0.58);
  color: #203247;
  /* 新增：增加基础的过渡动画，让 hover 和尺寸变化更平滑 */
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* 新增：鼠标悬浮时轻微上浮，增加交互平滑感 */
.toast-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(20, 30, 60, 0.25);
}

.toast-success {
  border-color: rgba(59, 170, 105, 0.35);
  background: linear-gradient(145deg, rgba(214, 245, 224, 0.7), rgba(244, 255, 248, 0.55));
}

.toast-error {
  border-color: rgba(223, 79, 79, 0.35);
  background: linear-gradient(145deg, rgba(255, 225, 225, 0.75), rgba(255, 247, 247, 0.56));
}

.toast-warning {
  border-color: rgba(214, 145, 34, 0.35);
  background: linear-gradient(145deg, rgba(255, 239, 207, 0.78), rgba(255, 248, 234, 0.55));
}

.toast-info {
  border-color: rgba(58, 120, 214, 0.35);
  background: linear-gradient(145deg, rgba(219, 236, 255, 0.78), rgba(245, 250, 255, 0.55));
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

/* 进出场动画保持不变，由于使用了较慢的过渡效果看起来已经很平滑了 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px) translateY(-4px);
}

@media (max-width: 768px) {
  .message-host {
    width: calc(100vw - 16px);
  }

  .message-host-top-right {
    top: 10px;
    right: 8px;
  }

  .toast-item {
    padding: 9px 10px;
    border-radius: 10px;
  }
}
</style>