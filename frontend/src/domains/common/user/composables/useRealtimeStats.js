/**
 * useRealtimeStats — 实时在线统计 composable（模块级单例）
 *
 * 封装 EventSource 连接 /api/statistics/stream，监听 online_stats 事件，
 * 自动解析数据并通过回调推送；断线后自动重连（指数退避，最大 10s，
 * 连续 5 次失败后停止自动重连，等待 reconnect() 手动恢复）。
 *
 * 单例化：
 * 此前 SSE 连接绑定在账号面板开合上——面板没开时无连接信号，断网/关页
 * 只能等 300s 活跃窗口过期，在线数延迟 5 分钟。现改为模块级单例：
 * 全局（HomeView）挂载时建立连接，连接存续 = 在线；断连/offline 上报 =
 * 立即下线。账号面板等组件只注册 onStats 回调消费数据，不再控制连接。
 *
 * 心跳模型（在线判定唯一信号源）：
 * 在线 = 前端每 5s POST /api/statistics/heartbeat（经 client.js 拦截器
 * 自动携带 token 或 X-Guest-Device-Id）；停心跳（下线/断网/关页）→ 后端
 * 15s 窗口过期自动剔除。心跳响应携带 online 数，作为无 SSE 时的兜底展示
 * 数据（心跳 = 信号通道 + 数据通道）。SSE 仅承担每 15s 的推送通道，连接
 * 断开不影响在线判定（无需 offline 上报、无需连接保活语义）。
 *
 * 后台标签页说明：浏览器对后台标签定时器节流（≥1min），后台页心跳可能
 * 中断而被窗口剔除；切换到前台时立即补发一次心跳恢复在线。
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
import backendAPI from '@/api/backend/client';

const SSE_ENDPOINT = '/api/statistics/stream';
const TICKET_ENDPOINT = '/api/statistics/ticket';
const HEARTBEAT_ENDPOINT = '/api/statistics/heartbeat';
const HEARTBEAT_INTERVAL_MS = 5000;//每隔 5 秒发送一次心跳
const INITIAL_RETRY_MS = 2000;
const MAX_RETRY_MS = 10000;
const MAX_CONSECUTIVE_FAILURES = 5;

// ─── 模块级单例状态（所有调用方共享同一连接）───
const stats = ref(null);
const connected = ref(false);
let _eventSource = null;
let _retryTimer = null;
let _retryMs = INITIAL_RETRY_MS;
let _consecutiveFailures = 0;
let _dead = false;
/** 已注册的 onStats 回调集合（多消费者共享同一连接） */
const _callbacks = new Set();

/** 广播数据到所有已注册回调 */
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

async function _fetchTicket() {
    const resp = await backendAPI.get(TICKET_ENDPOINT);
    const ticket = resp?.data?.ticket;
    return typeof ticket === 'string' && ticket ? ticket : '';
}

function _buildUrl() {
    // 登录用户与游客（携带 X-Guest-Device-Id 的访客）都建立 SSE 推送通道；
    // 在线判定与连接无关（心跳模型），这里的连接只保证收到 15s 定时推送。
    return SSE_ENDPOINT;
}

/**
 * 发送一次活跃心跳。
 *
 * 经 backendAPI 拦截器自动携带 Authorization token 或 X-Guest-Device-Id。
 * 失败静默（断网/后端暂不可达时自然停发 → 后端窗口过期自动剔除，正是
 * "下线即不发送"的语义）。响应携带 online 当前在线数：无 SSE 推送通道
 * 时（SSE 不可用/未连接）以该字段兜底展示实时人数。
 */
function _sendHeartbeat() {
    try {
        backendAPI
            .post(HEARTBEAT_ENDPOINT, {})
            .then((resp) => {
                const online = resp?.data?.online;
                if (typeof online === 'number' && stats.value?.realtime_online_users !== online) {
                    stats.value = { ...(stats.value || {}), realtime_online_users: online };
                }
            })
            .catch(() => {
                /* 心跳失败静默：停发即离线 */
            });
    } catch (_e) {
        /* 静默 */
    }
}

/** 后台标签页定时器节流时心跳中断，切换回前台立即补发一次恢复在线 */
function _bindVisibilityListener() {
    document.addEventListener(
        'visibilitychange',
        () => {
            if (!document.hidden) _sendHeartbeat();
        },
        { passive: true },
    );
}

function _unbindVisibilityListener() {
    document.removeEventListener('visibilitychange', _bindVisibilityListener);
}

let _heartbeatTimer = null;

function _startHeartbeat() {
    // 幂等：重连路径会反复调用 connect() → _startHeartbeat()，
    // 必须先清旧 interval，避免心跳定时器随重连/重连次数累积
    if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
    }
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
    if (_dead) return;

    _disconnect();

    // 心跳与 SSE 相互独立：心跳先启动，保证在线判定与展示兜底
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
    if (!url) {
        _scheduleRetry();
        return;
    }

    const es = new EventSource(url, { withCredentials: true });
    _eventSource = es;

    es.onopen = () => {
        connected.value = true;
        _retryMs = INITIAL_RETRY_MS; // 连接成功后重置退避
        _consecutiveFailures = 0;
    };

    es.addEventListener('online_stats', (event) => {
        try {
            const data = JSON.parse(event.data);
            _notify(data);
        } catch (_e) {
            // 解析失败静默跳过
        }
    });

    es.onerror = () => {
        connected.value = false;
        es.close();
        _eventSource = null;

        // 连续失败达上限后停止自动重连（网络恢复后由 reconnect 手动恢复）
        _consecutiveFailures += 1;
        if (_consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            return;
        }
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
}

function reconnect() {
    _dead = false;
    _retryMs = INITIAL_RETRY_MS;
    _consecutiveFailures = 0;
    connect();
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