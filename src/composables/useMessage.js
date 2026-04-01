import { h, reactive, render, readonly } from 'vue';
import Message from '../components/Message.vue';

const MAX_VISIBLE = 3;
//默认持续时间，单位毫秒
const DEFAULT_DURATION_MS = 3000;

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
  return DEFAULT_DURATION_MS;
}

function flushQueue() {
  while (state.messages.length < MAX_VISIBLE && state.queue.length > 0) {
    const next = state.queue.shift();
    state.messages.push(next);
  }
}

function createMessage(type, text, options = {}) {
  const payload = {
    id: nextId(),
    type,
    text: String(text || ''),
    duration: getDefaultDuration(type, options.duration),
    closable: options.closable ?? true
  };

  if (state.messages.length >= MAX_VISIBLE) {
    state.queue.push(payload);
  } else {
    state.messages.push(payload);
  }

  return payload.id;
}

function remove(id) {
  const idx = state.messages.findIndex((m) => m.id === id);
  if (idx < 0) return;

  state.messages.splice(idx, 1);
  flushQueue();
}

function clearAll() {
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
