/**
 * useRealtimeStats — 实时在线统计 composable（模块级单例）
 *
 * 封装 EventSource 连接 /api/statistics/stream，监听 online_stats 事件，
 * 自动解析数据并通过回调推送；断线后自动重连（指数退避，最大 30s，永久重试）。
 *
 * 单例化：
 * 此前 SSE 连接绑定在账号面板开合上——面板没开时无连接信号，断网/关页
 * 只能等 300s 活跃窗口过期，在线数延迟 5 分钟。现改为模块级单例：
 * 全局（HomeView）挂载时建立连接，连接存续 = 在线；断连/offline 上报 =
 * 立即下线。账号面板等组件只注册 onStats 回调消费数据，不再控制连接。
 *
 * 在线判定（V3.5.25 重构，后端为主、前端零轮询）：
 * - 主信号 = SSE 长连接本身。后端以"连接是否存活"计数在线（引用计数，
 *   同身份多标签页不误杀），见 backend/api/realtime_stats.py。前端正常态
 *   只维持这一条 SSE 连接，不发送任何心跳请求。
 * - 兜底信号 = 低频心跳（仅当 SSE 断开时启用，30s 一次）。SSE 不可达期间
 *   仍以心跳维持在线计数与人数展示；SSE 恢复即停心跳。
 * 动机：原模型每 5s POST 一次心跳（穿透 require_login 做一次会话 DB 查询），
 * 长期运行 + 后台标签节流回前台后高频轮询，在受限后端上形成持续读取压力
 * 并拖垮响应（表现为前端卡顿、需刷新页面）。改为连接为主后前端常态零轮询。
 *
 * 后台标签页与回前台积压（V3.5.25）：
 * - SSE 连接常驻（10s keep-alive 保活），后台页仍计入在线。
 * - 浏览器可能在后台暂存连续到达的 online_stats；回前台时通过 rAF 合并
 *   同一渲染帧内的更新，降低响应式更新集中触发造成的卡顿风险。
 * - 切回前台若 SSE 已断（代理杀连接），立即重置退避重连而非等待。
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
const HEARTBEAT_ENDPOINT = '/api/statistics/heartbeat';
// 心跳仅作 SSE 断开时的兜底，低频即可（30s）；SSE 存活期间不发送。
const HEARTBEAT_INTERVAL_MS = 30000;
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
    // 在线判定以连接存活为准，连接只保证收到 15s 定时推送。
    return `${String(BACKEND_BASE_URL || '').replace(/\/$/, '')}${SSE_ENDPOINT}`;
}

/**
 * 发送一次活跃心跳（仅 SSE 断开时的兜底）。
 *
 * 经 backendAPI 拦截器自动携带 Authorization token 或 X-Guest-Device-Id。
 * 失败静默（断网/后端暂不可达时自然停发 → 后端窗口过期自动剔除）。
 * 响应携带 online 当前在线数，作为无 SSE 时的兜底展示数据。
 */
function _sendHeartbeat() {
    try {
        backendAPI
            .post(HEARTBEAT_ENDPOINT, {})
            .then((resp) => {
                const online = resp?.online ?? resp?.data?.online;
                if (typeof online === 'number' && stats.value?.realtime_online_users !== online) {
                    _scheduleNotify({
                        ...(stats.value || {}),
                        realtime_online_users: online,
                    });
                }
            })
            .catch(() => {
                /* 心跳失败静默：停发即离线 */
            });
    } catch (_e) {
        /* 静默 */
    }
}

/** 切回前台：SSE 已断时立即心跳并重置退避重连。 */
function _handleVisibilityChange() {
    if (document.hidden) return;
    if (!connected.value) {
        _sendHeartbeat();
        if (!_eventSource && !_connecting) {
            _retryMs = INITIAL_RETRY_MS;
            if (_retryTimer) {
                clearTimeout(_retryTimer);
                _retryTimer = null;
            }
            void connect();
        }
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

let _heartbeatTimer = null;

function _startHeartbeat() {
    // 幂等：仅当 SSE 不可用才需要心跳兜底；SSE 存活时由 onopen 停掉。
    if (_heartbeatTimer) return;
    _sendHeartbeat();
    _heartbeatTimer = setInterval(_sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function _stopHeartbeat() {
    if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
    }
}

async function connect() {
    if (_dead || _connecting || _eventSource) return;
    const generation = ++_connectionGeneration;
    _connecting = true;

    // 默认启用兜底心跳；SSE 成功建立后由 onopen 停掉（常态零轮询）。
    _startHeartbeat();
    _bindVisibilityListener();

    const baseUrl = _buildUrl();
    if (!baseUrl) return;

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
        _startHeartbeat();
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
        _stopHeartbeat(); // SSE 已接管在线信号，停掉兜底心跳（常态零轮询）
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
        // SSE 断开 → 启用心跳兜底，并永久重试（不再 5 次后放弃，避免需刷新页）。
        _startHeartbeat();
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
    _stopHeartbeat();
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
