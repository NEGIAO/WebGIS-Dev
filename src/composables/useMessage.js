import { h, reactive, render, readonly } from 'vue';
import Message from '../components/Message.vue';

const MAX_VISIBLE = 3;

const state = reactive({
  messages: [],
  queue: []
});

let seed = 1;
let hostMounted = false;
let hostEl = null;

function nextId() {
  seed += 1;
  return `msg_${Date.now()}_${seed}`;
}

function getDefaultDuration(type, inputDuration) {
  if (Number.isFinite(inputDuration) && inputDuration >= 0) return inputDuration;
  if (type === 'error') return 0;
  return 4000;
}

function flushQueue() {
  while (state.messages.length < MAX_VISIBLE && state.queue.length > 0) {
    const next = state.queue.shift();
    state.messages.push(next);
    if (next.duration > 0) {
      next.timer = setTimeout(() => {
        remove(next.id);
      }, next.duration);
    }
  }
}

function createMessage(type, text, options = {}) {
  const payload = {
    id: nextId(),
    type,
    text: String(text || ''),
    duration: getDefaultDuration(type, options.duration),
    closable: options.closable ?? (type === 'error'),
    timer: null
  };

  if (state.messages.length >= MAX_VISIBLE) {
    state.queue.push(payload);
  } else {
    state.messages.push(payload);
    if (payload.duration > 0) {
      payload.timer = setTimeout(() => {
        remove(payload.id);
      }, payload.duration);
    }
  }

  return payload.id;
}

function remove(id) {
  const idx = state.messages.findIndex((m) => m.id === id);
  if (idx < 0) return;

  const target = state.messages[idx];
  if (target?.timer) {
    clearTimeout(target.timer);
  }
  state.messages.splice(idx, 1);
  flushQueue();
}

function clearAll() {
  state.messages.forEach((item) => {
    if (item.timer) clearTimeout(item.timer);
  });
  state.messages = [];
  state.queue = [];
}

function ensureMessageHost(position = 'top-right') {
  if (hostMounted && hostEl) {
    render(h(Message, {
      messages: state.messages,
      position,
      onClose: remove
    }), hostEl);
    return;
  }

  hostEl = document.createElement('div');
  hostEl.id = 'global-message-host';
  document.body.appendChild(hostEl);
  render(h(Message, {
    messages: state.messages,
    position,
    onClose: remove
  }), hostEl);
  hostMounted = true;
}

function notifyBatch({
  success = 0,
  failed = 0,
  warnings = 0,
  label = '导入任务'
} = {}) {
  const summary = `${label}：成功 ${success}，失败 ${failed}${warnings ? `，警告 ${warnings}` : ''}`;
  if (failed > 0) {
    return createMessage('warning', summary, { closable: true, duration: 6000 });
  }
  return createMessage('success', summary);
}

export function useMessage() {
  return {
    state: readonly(state),
    ensureMessageHost,
    remove,
    clearAll,
    notifyBatch,
    success: (text, options) => createMessage('success', text, options),
    error: (text, options) => createMessage('error', text, options),
    warning: (text, options) => createMessage('warning', text, options),
    info: (text, options) => createMessage('info', text, options)
  };
}
