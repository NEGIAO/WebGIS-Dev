/**
 * useRealtimeStats — 实时在线统计 composable（模块级单例）
 *
 * 封装 EventSource 连接 /api/statistics/stream，监听 online_stats 事件，
 * 自动解析数据并通过回调推送；断线后自动重连（指数退避，最大 30s，永久重试）。
 *
 * 单例化：
 * 全局（HomeView）挂载时建立连接，连接存续 = 在线；账号面板等组件只注册
 * onStats 回调消费数据，不再控制连接。
 *
 * 在线判定（V3.5.25 重构，统计逻辑完全由后端承担）：
 * - 唯一主动信号 = SSE 长连接本身。后端以"连接是否存活"计数在线（引用计数，
 *   同身份多标签页不误杀），并以读路径 disconnect 探测及时感知半开连接，
 *   见 backend/api/realtime_stats.py。前端正常态零轮询、零心跳请求。
 * - SSE 不可达期间，后端以"普通鉴权 API 请求的搭车活跃记录"判定是否仍在
 *   线（浏览页面必然伴随 API 活动，前端无需为此发送任何额外请求）；
 *   心跳过期由后端扫描协程即时剔除并广播，下线显示不再有长静默期。
 * - /api/statistics/heartbeat 端点仅作向后兼容保留，前端不再调用。
 *
 * 后台标签页与回前台积压：
 * - SSE 连接常驻（后端 keep-alive 保活），后台页仍计入在线。
 * - 浏览器可能在后台暂存连续到达的 online_stats；回前台时通过 rAF 合并
 *   同一渲染帧内的更新，降低响应式更新集中触发造成的卡顿风险。
 * - 切回前台若 SSE 已断（代理杀连接），立即重置退避重连而非等待——该操作
 *   只是恢复连接，不产生数据请求。
 *
 * 鉴权说明（V3.5.19）：
 * EventSource 不支持自定义 header，且完整会话 token 不应出现在 URL。
 * 因此先经 /api/statistics/ticket（Authorization header 正常鉴权）
 * 换取 60s 有效的一次性 ticket，再以 ?ticket= 建立 SSE 连接。
 *
 * 使用方式：
 *   // 全局挂载点（HomeView）：
 *   const { reconnect, disconnect } = useRealtimeStats();
 *   onMounted(() => reconnect());
 *   onUnmounted(() => disconnect());
 *
 *   // 数据消费者（FloatingAccountPanel）：
 *   const { stats, connected } = useRealtimeStats({ onStats: (data) => {...} });
 */
import { onBeforeUnmount, ref } from 'vue';
import backendAPI, { BACKEND_BASE_URL } from '@/api/backend/client';

const SSE_ENDPOINT = '/api/statistics/stream';
const TICKET_ENDPOINT = '/api/statistics/ticket';
const INITIAL_RETRY_MS = 2000;
const MAX_RETRY_MS = 30000;

// ─── 模块级单例状态（所有调用方共享同一连接）───
const stats = ref(null);
const connected = ref(false);
let _eventSource = null;
let _retryTimer = null;
let _retryMs = INITIAL_RETRY_MS;
let _dead = false;
let _connecting = false;
let _connectionGeneration = 0;
/** 已注册的 onStats 回调集合（多消费者共享同一连接） */
const _callbacks = new Set();

// ─── 回前台消息积压合并（rAF 合并同一渲染帧内的连续更新）───
let _pendingData = null;
let _notifyScheduled = false;
let _notifyHandle = null;
let _notifyUsesAnimationFrame = false;

function _flushNotify() {
    _notifyScheduled = false;
    _notifyHandle = null;
    if (_pendingData) {
        const d = _pendingData;
        _pendingData = null;
        _notify(d);
    }
}

function _notify(data) {
    stats.value = data;
    _callbacks.forEach((cb) => {
        try {
            cb(data);
        } catch (_e) {
            /* 单个消费者异常不影响其他消费者 */
        }
    });
}

/** 合并多次同步到达的 online_stats 为下一帧一次更新（回前台积压防护） */
function _scheduleNotify(data) {
    _pendingData = data;
    if (_notifyScheduled) return;
    _notifyScheduled = true;
    if (typeof requestAnimationFrame === 'function') {
        _notifyUsesAnimationFrame = true;
        _notifyHandle = requestAnimationFrame(_flushNotify);
    } else {
        _notifyUsesAnimationFrame = false;
        _notifyHandle = setTimeout(_flushNotify, 0);
    }
}

async function _fetchTicket() {
    const resp = await backendAPI.get(TICKET_ENDPOINT);
    const ticket = resp?.ticket ?? resp?.data?.ticket;
    return typeof ticket === 'string' && ticket ? ticket : '';
}

function _buildUrl() {
    // 登录用户与游客（携带 X-Guest-Device-Id 的访客）都建立 SSE 推送通道；
    // 在线判定以后端连接存活与鉴权活跃为准。
    return `${String(BACKEND_BASE_URL || '').replace(/\/$/, '')}${SSE_ENDPOINT}`;
}

/** 切回前台：SSE 已断时立即重置退避并重连（仅恢复连接，不发数据请求）。 */
function _handleVisibilityChange() {
    if (document.hidden) return;
    if (!connected.value && !_eventSource && !_connecting && !_dead) {
        _retryMs = INITIAL_RETRY_MS;
        if (_retryTimer) {
            clearTimeout(_retryTimer);
            _retryTimer = null;
        }
        void connect();
    }
}

let _visibilityListenerBound = false;

function _bindVisibilityListener() {
    if (_visibilityListenerBound || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', _handleVisibilityChange, { passive: true });
    _visibilityListenerBound = true;
}

function _unbindVisibilityListener() {
    if (!_visibilityListenerBound || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', _handleVisibilityChange);
    _visibilityListenerBound = false;
}

async function connect() {
    if (_dead || _connecting || _eventSource) return;
    const generation = ++_connectionGeneration;
    _connecting = true;
    _bindVisibilityListener();

    const baseUrl = _buildUrl();
    if (!baseUrl) {
        // 防御：baseUrl 为空时必须复位 _connecting，否则后续 connect() 永久被拒
        _connecting = false;
        return;
    }

    // 先换取一次性 ticket，再建立 SSE 连接（失败则进入错误重试路径）
    let url = baseUrl;
    try {
        const ticket = await _fetchTicket();
        url = ticket ? `${baseUrl}?ticket=${encodeURIComponent(ticket)}` : '';
    } catch {
        url = '';
    }
    if (_dead || generation !== _connectionGeneration) return;
    if (!url) {
        _connecting = false;
        _scheduleRetry();
        return;
    }

    let es;
    try {
        es = new EventSource(url, { withCredentials: true });
    } catch {
        _connecting = false;
        _scheduleRetry();
        return;
    }
    _eventSource = es;
    _connecting = false;

    es.onopen = () => {
        if (_dead || generation !== _connectionGeneration || _eventSource !== es) {
            es.close();
            return;
        }
        connected.value = true;
        _retryMs = INITIAL_RETRY_MS; // 连接成功后重置退避
    };

    es.addEventListener('online_stats', (event) => {
        try {
            const data = JSON.parse(event.data);
            _scheduleNotify(data); // rAF 合并，防护回前台积压爆发
        } catch (_e) {
            // 解析失败静默跳过
        }
    });

    es.onerror = () => {
        if (generation !== _connectionGeneration || _eventSource !== es) return;
        connected.value = false;
        es.close();
        _eventSource = null;
        // 断线即进入永久指数退避重连；在线与否交由后端依据
        // "最近鉴权活跃"口径判定，前端不再发送任何兜底请求。
        _scheduleRetry();
    };
}

function _scheduleRetry() {
    if (_dead) return;
    if (_retryTimer) return;
    _retryTimer = setTimeout(() => {
        _retryTimer = null;
        _retryMs = Math.min(_retryMs * 2, MAX_RETRY_MS);
        connect();
    }, _retryMs);
}

function _disconnect() {
    _connectionGeneration += 1;
    _connecting = false;
    connected.value = false;
    if (_eventSource) {
        _eventSource.close();
        _eventSource = null;
    }
    if (_retryTimer) {
        clearTimeout(_retryTimer);
        _retryTimer = null;
    }
}

function disconnect() {
    _dead = true;
    _disconnect();
    _unbindVisibilityListener();
    if (_notifyScheduled && _notifyHandle !== null) {
        if (_notifyUsesAnimationFrame && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(_notifyHandle);
        } else {
            clearTimeout(_notifyHandle);
        }
    }
    _notifyScheduled = false;
    _notifyHandle = null;
    _pendingData = null;
}

function reconnect() {
    _dead = false;
    _retryMs = INITIAL_RETRY_MS;
    _disconnect();
    void connect();
}

/**
 * 获取全局单例 SSE 统计连接。
 *
 * @param {Object} [options]
 * @param {(data: Object) => void} [options.onStats] 数据回调（多消费者共享同一连接）
 * @returns {{ stats: import('vue').Ref, connected: import('vue').Ref, reconnect: Function, disconnect: Function }}
 */
export function useRealtimeStats({ onStats } = {}) {
    // 注册数据回调（组件卸载时自动注销）
    if (typeof onStats === 'function') {
        _callbacks.add(onStats);
        onBeforeUnmount(() => {
            _callbacks.delete(onStats);
        });
    }

    return {
        stats,
        connected,
        reconnect,
        disconnect,
    };
}
