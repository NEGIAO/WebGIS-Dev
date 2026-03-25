<template>
  <div class="message-host" :class="`message-host-${position}`" role="status" aria-live="polite">
    <TransitionGroup name="toast" tag="div" class="toast-list">
      <div
        v-for="item in messages"
        :key="item.id"
        class="toast-item"
        :class="`toast-${item.type}`"
      >
        <div class="toast-icon">{{ getTypeIcon(item.type) }}</div>
        <div class="toast-content">
          <div class="toast-title">{{ getTypeTitle(item.type) }}</div>
          <div class="toast-text">{{ item.text }}</div>
        </div>
        <button
          v-if="item.closable"
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
const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  },
  position: {
    type: String,
    default: 'top-right'
  }
});

const emit = defineEmits(['close']);

function emitClose(id) {
  emit('close', id);
}

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
}

.toast-close:hover {
  color: rgba(21, 34, 48, 0.95);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.28s ease;
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
