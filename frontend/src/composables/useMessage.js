import { h, reactive, render, readonly } from 'vue';
import Message from '../components/Message.vue';
import { GOLDEN_SOUP_QUOTES } from '../constants/goldenSoupQuotes';

const MAX_VISIBLE = 3;
//默认持续时间，单位毫秒
const DEFAULT_DURATION_MS = 3000;
const DEFAULT_SOUP_DURATION_MS = 5200;
const FALLBACK_SOUP = Object.freeze({
  cn: '今天先不和世界较劲，先和自己和解。',
  en: 'Do not wrestle with the world today; make peace with yourself first.'
});

const state = reactive({
  messages: [],
  queue: []
});

let seed = 1;
let hostMounted = false;
let hostEl = null;
let soupPool = [];
let lastSoupIndex = -1;

function nextId() {
  seed += 1;
  return `msg_${Date.now()}_${seed}`;
}

function getDefaultDuration(type, inputDuration) {
  if (Number.isFinite(inputDuration) && inputDuration >= 0) return inputDuration;
  if (type === 'soup') return DEFAULT_SOUP_DURATION_MS;
  return DEFAULT_DURATION_MS;
}

function refillSoupPool() {
  const total = GOLDEN_SOUP_QUOTES.length;
  soupPool = Array.from({ length: total }, (_, index) => index);

  for (let i = soupPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [soupPool[i], soupPool[j]] = [soupPool[j], soupPool[i]];
  }

  // 轮询一圈后重洗牌时，尽量避免与上一句重复。
  if (soupPool.length > 1 && soupPool[soupPool.length - 1] === lastSoupIndex) {
    const swapIndex = Math.floor(Math.random() * (soupPool.length - 1));
    [soupPool[swapIndex], soupPool[soupPool.length - 1]] = [
      soupPool[soupPool.length - 1],
      soupPool[swapIndex]
    ];
  }
}

function pickSoupQuote() {
  if (GOLDEN_SOUP_QUOTES.length === 0) return FALLBACK_SOUP;
  if (soupPool.length === 0) refillSoupPool();

  const index = soupPool.pop();
  if (!Number.isInteger(index)) return FALLBACK_SOUP;

  lastSoupIndex = index;
  return GOLDEN_SOUP_QUOTES[index] || FALLBACK_SOUP;
}

function formatSoupQuote(quote) {
  const cn = String(quote?.cn || '').trim();
  const en = String(quote?.en || '').trim();

  if (cn && en) return `${cn}\n${en}`;
  if (cn) return cn;
  if (en) return en;
  return `${FALLBACK_SOUP.cn}\n${FALLBACK_SOUP.en}`;
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
    closable: options.closable ?? true,
    showTitle: options.showTitle ?? true
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

function soup(options = {}) {
  const quote = pickSoupQuote();
  const text = formatSoupQuote(quote);

  return createMessage('soup', text, {
    ...options,
    showTitle: false
  });
}

export function useMessage() {
  return {
    state: readonly(state),
    ensureMessageHost,
    remove,
    clearAll,
    notifyBatch,
    soup,
    success: (text, options) => createMessage('success', text, options),
    error: (text, options) => createMessage('error', text, options),
    warning: (text, options) => createMessage('warning', text, options),
    info: (text, options) => createMessage('info', text, options)
  };
}
