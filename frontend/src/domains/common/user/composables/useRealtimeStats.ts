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
import {
    AUTH_CHANGED_EVENT,
    getBackendBearerToken,
    getOrCreateGuestDeviceId,
    getPresenceClientId,
} from '@common/user/services/auth';

const SSE_ENDPOINT = '/api/statistics/stream';
const TICKET_ENDPOINT = '/api/statistics/ticket';
const PRESENCE_PING_ENDPOINT = '/api/statistics/presence/ping';
const PRESENCE_OFFLINE_ENDPOINT = '/api/statistics/presence/offline';
const INITIAL_RETRY_MS = 2000;
const MAX_RETRY_MS = 30000;
/** SSE 断开时的轻量保活间隔（仅内存 tracker，不查统计 DB） */
const FALLBACK_PING_MS = 25000;
/** 后端每 30s 周期广播：若超过 65s 仍无事件到达（如休眠/半开断网），切回前台时强制重连 */
const SILENT_STALL_MS = 65000;

// ─── 模块级单例状态（所有调用方共享同一连接）───
const stats = ref<any>(null);
const connected = ref(false);
let _eventSource: any = null;
let _retryTimer: any = null;
let _retryMs = INITIAL_RETRY_MS;
let _dead = false;
let _connecting = false;
let _connectionGeneration = 0;
let _fallbackPingTimer: any = null;
let _offlineBeaconBound = false;
let _offlineBeaconSent = false;
let _lastStatsEventAt = 0;
let _authWatchHandle: any = null;
let _authListenerBound = false;
let _authSyncInFlight = false;
let _lastAuthToken = typeof getBackendBearerToken === 'function' ? getBackendBearerToken() : '';
/** 已注册的 onStats 回调集合（多消费者共享同一连接） */
const _callbacks = new Set<(data: any) => void>();

// ─── 回前台消息积压合并（rAF 合并同一渲染帧内的连续更新）───
let _pendingData: any = null;
let _notifyScheduled = false;
let _notifyHandle: any = null;
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

function _notify(data: any) {
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
function _scheduleNotify(data: any) {
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
    const clientId = typeof getPresenceClientId === 'function' ? getPresenceClientId() : '';
    const resp = await backendAPI.get(TICKET_ENDPOINT, {
        params: clientId ? { client_id: clientId } : undefined,
    });
    const ticket = resp?.ticket ?? resp?.data?.ticket;
    return typeof ticket === 'string' && ticket ? ticket : '';
}

/**
 * SSE URL 仅能带一次性 ticket；EventSource 无法附带 Authorization / X-Guest-Device-Id。
 * 后端 ticket 已在换取时绑定 presence_id 与 client_id，连接侧只消费 ticket 载荷。
 */

function _buildUrl() {
    // 登录用户与游客（携带 X-Guest-Device-Id 的访客）都建立 SSE 推送通道；
    // 在线判定以后端连接存活与鉴权活跃为准。
    return `${String(BACKEND_BASE_URL || '').replace(/\/$/, '')}${SSE_ENDPOINT}`;
}

function _buildPresenceHeaders(
    extra: Record<string, any> = {},
    tokenOverride?: string,
) {
    const headers: Record<string, any> = { ...extra };
    const token =
        tokenOverride !== undefined
            ? tokenOverride
            : typeof getBackendBearerToken === 'function'
                ? getBackendBearerToken()
                : '';
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    try {
        const deviceId = getOrCreateGuestDeviceId();
        if (deviceId) {
            headers['X-Guest-Device-Id'] = deviceId;
        }
        const clientId = typeof getPresenceClientId === 'function' ? getPresenceClientId() : '';
        if (clientId) {
            headers['X-Presence-Client-Id'] = clientId;
        }
    } catch {
        /* storage 不可用时忽略 */
    }
    return headers;
}

async function _sendPresenceBeacon(
    path: string,
    {
        tokenOverride,
        force = false,
        preferBeacon = false,
    }: { tokenOverride?: string; force?: boolean; preferBeacon?: boolean } = {},
) {
    const isOfflinePath = path === PRESENCE_OFFLINE_ENDPOINT;
    if (isOfflinePath) {
        if (!force && (_dead || _offlineBeaconSent)) return;
        _offlineBeaconSent = true;
    }

    const clientId = typeof getPresenceClientId === 'function' ? getPresenceClientId() : '';
    let deviceId = '';
    try {
        deviceId = getOrCreateGuestDeviceId();
    } catch {
        /* ignore */
    }

    const base = `${String(BACKEND_BASE_URL || '').replace(/\/$/, '')}${path}`;
    const url = clientId ? `${base}?client_id=${encodeURIComponent(clientId)}` : base;
    const token =
        tokenOverride !== undefined
            ? tokenOverride
            : typeof getBackendBearerToken === 'function'
                ? getBackendBearerToken()
                : '';
    // sendBeacon 无法附带自定义 Header；把 client_id 与 guest_device_id 同步放进 JSON body，
    // 确保游客关页 beacon 也能精确撤销对应标签页的在线信号。
    const body = JSON.stringify({
        client_id: clientId || undefined,
        guest_device_id: deviceId || undefined,
    });

    const trySendTextBeacon = () => {
        if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
            return false;
        }
        // 使用 CORS 简单类型 text/plain：前后端分离跨域部署在 pagehide/beforeunload 下
        // 不触发 OPTIONS 预检，避免被浏览器在卸载期中止；后端 _parse_presence_beacon 直接解析原始 body JSON。
        const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        return navigator.sendBeacon(url, blob);
    };

    const headers = _buildPresenceHeaders({ 'Content-Type': 'application/json' }, tokenOverride);
    const fetchOptions: RequestInit = {
        method: 'POST',
        headers,
        credentials: 'include',
        body,
        keepalive: true,
    };
    try {
        if (preferBeacon && trySendTextBeacon()) {
            return;
        }
        if (token) {
            await fetch(url, fetchOptions);
            return;
        }
        if (trySendTextBeacon()) {
            return;
        }
        await fetch(url, fetchOptions);
    } catch {
        /* beacon 尽力而为 */
    }
}

function _stopFallbackPing() {
    if (_fallbackPingTimer) {
        clearInterval(_fallbackPingTimer);
        _fallbackPingTimer = null;
    }
}

function _startFallbackPing() {
    _stopFallbackPing();
    if (_dead) return;
    _fallbackPingTimer = setInterval(async () => {
        if (_dead || connected.value) return;
        try {
            const clientId = typeof getPresenceClientId === 'function' ? getPresenceClientId() : '';
            let deviceId = '';
            try {
                deviceId = getOrCreateGuestDeviceId();
            } catch {
                /* ignore */
            }
            await backendAPI.post(
                PRESENCE_PING_ENDPOINT,
                { client_id: clientId || undefined, guest_device_id: deviceId || undefined },
                { headers: _buildPresenceHeaders() },
            );
        } catch {
            /* 保活失败交给 SSE 重试 */
        }
    }, FALLBACK_PING_MS);
}

function _closeActiveEventSourceOnUnload() {
    _connectionGeneration += 1;
    _connecting = false;
    connected.value = false;
    if (_eventSource) {
        _eventSource.close();
        _eventSource = null;
    }
    _stopFallbackPing();
}

function _bindOfflineBeacon() {
    if (_offlineBeaconBound || typeof window === 'undefined') return;
    const onBeforeUnload = () => {
        if (_dead) return;
        void _sendPresenceBeacon(PRESENCE_OFFLINE_ENDPOINT, { preferBeacon: true });
    };
    const onPageHide = () => {
        if (_dead) return;
        // 离开页面时同步主动关闭 SSE 并使用零预检 sendBeacon 上送离线信号，防止代理层长留半开连接
        _closeActiveEventSourceOnUnload();
        void _sendPresenceBeacon(PRESENCE_OFFLINE_ENDPOINT, { preferBeacon: true });
    };
    window.addEventListener('pagehide', onPageHide, { passive: true });
    window.addEventListener('beforeunload', onBeforeUnload, { passive: true });
    _offlineBeaconBound = true;
}

async function _syncAuthStateAndReconnectIfChanged() {
    if (_authSyncInFlight) return;
    const token = typeof getBackendBearerToken === 'function' ? getBackendBearerToken() : '';
    if (token === _lastAuthToken) return;
    const prevToken = _lastAuthToken;
    _lastAuthToken = token;
    if (_dead) return;

    _authSyncInFlight = true;
    try {
        // 先等待旧身份 offline 上送完成，再重建新身份 SSE：消除同 client_id 下的并发竞态，
        // 避免滞后到达的旧 offline 误杀刚建连的新连接，或旧 session 心跳滞留。
        if (prevToken) {
            await _sendPresenceBeacon(PRESENCE_OFFLINE_ENDPOINT, {
                tokenOverride: prevToken,
                force: true,
            });
        }
        if (_dead) return;
        reconnect();
        // 异步窗口内若再次切换了 token，由下一轮继续对齐
        const latestToken =
            typeof getBackendBearerToken === 'function' ? getBackendBearerToken() : '';
        if (latestToken !== _lastAuthToken && !_dead) {
            setTimeout(() => {
                void _syncAuthStateAndReconnectIfChanged();
            }, 0);
        }
    } finally {
        _authSyncInFlight = false;
    }
}

function _onAuthChangedEvent() {
    void _syncAuthStateAndReconnectIfChanged();
}

function _watchAuthChanges() {
    if (typeof window === 'undefined') return;
    if (!_authListenerBound) {
        window.addEventListener(AUTH_CHANGED_EVENT, _onAuthChangedEvent);
        _authListenerBound = true;
    }
    if (_authWatchHandle) return;
    _authWatchHandle = setInterval(_onAuthChangedEvent, 2000);
}

/** 切回前台 / 网络恢复：SSE 已断或疑似静默半开时立即恢复重连。 */
function _handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (_dead) return;
    if (!connected.value && !_eventSource && !_connecting) {
        _retryMs = INITIAL_RETRY_MS;
        if (_retryTimer) {
            clearTimeout(_retryTimer);
            _retryTimer = null;
        }
        void connect();
        return;
    }
    if (
        connected.value &&
        _lastStatsEventAt > 0 &&
        Date.now() - _lastStatsEventAt > SILENT_STALL_MS
    ) {
        reconnect();
    }
}

function _handleNetworkOnline() {
    if (_dead) return;
    if (!connected.value && !_connecting) {
        reconnect();
    }
}

function _handlePageShow(event: PageTransitionEvent) {
    if (_dead || !event?.persisted) return;
    _offlineBeaconSent = false;
    reconnect();
}

let _visibilityListenerBound = false;

function _bindVisibilityListener() {
    if (_visibilityListenerBound || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', _handleVisibilityChange, { passive: true });
    if (typeof window !== 'undefined') {
        window.addEventListener('online', _handleNetworkOnline, { passive: true });
        window.addEventListener('pageshow', _handlePageShow as EventListener, { passive: true });
    }
    _visibilityListenerBound = true;
}

function _unbindVisibilityListener() {
    if (!_visibilityListenerBound || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', _handleVisibilityChange);
    if (typeof window !== 'undefined') {
        window.removeEventListener('online', _handleNetworkOnline);
        window.removeEventListener('pageshow', _handlePageShow as EventListener);
    }
    _visibilityListenerBound = false;
}

async function connect() {
    if (_dead || _connecting || _eventSource) return;
    const generation = ++_connectionGeneration;
    _connecting = true;
    _offlineBeaconSent = false;
    _lastAuthToken = typeof getBackendBearerToken === 'function' ? getBackendBearerToken() : '';
    _bindVisibilityListener();
    _bindOfflineBeacon();
    _watchAuthChanges();

    const baseUrl = _buildUrl();
    if (!baseUrl) {
        // 防御：baseUrl 为空时必须复位 _connecting，否则后续 connect() 永久被拒
        _connecting = false;
        return;
    }

    // 先换取一次性 ticket，再建立 SSE 连接（失败则进入错误重试路径）
    let url;
    try {
        const ticket = await _fetchTicket();
        url = ticket ? `${baseUrl}?ticket=${encodeURIComponent(ticket)}` : '';
    } catch {
        url = '';
    }
    if (_dead || generation !== _connectionGeneration) {
        _connecting = false;
        return;
    }
    if (!url) {
        _connecting = false;
        _startFallbackPing();
        _scheduleRetry();
        return;
    }

    let es;
    try {
        es = new EventSource(url, { withCredentials: true });
    } catch {
        _connecting = false;
        _startFallbackPing();
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
        _lastStatsEventAt = Date.now();
        _stopFallbackPing();
    };

    es.addEventListener('online_stats', (event) => {
        try {
            const data = JSON.parse(event.data);
            _lastStatsEventAt = Date.now();
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
        // 断线：指数退避重连；SSE 不可用期间用页面打开时的 presence ping 兜底
        // （仅内存 tracker，非 HF keep-alive）。
        _startFallbackPing();
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

function disconnect(options: { sendOffline?: boolean } = {}) {
    const { sendOffline = true } = options || {};
    const shouldSend = sendOffline && !_dead;
    // 在 _dead 置 true 与清空会话令牌前发送离线通知，确保仍携带当前身份凭证
    if (shouldSend) {
        void _sendPresenceBeacon(PRESENCE_OFFLINE_ENDPOINT, { force: true });
    }
    _dead = true;
    _disconnect();
    _stopFallbackPing();
    _unbindVisibilityListener();
    if (_authListenerBound && typeof window !== 'undefined') {
        window.removeEventListener(AUTH_CHANGED_EVENT, _onAuthChangedEvent);
        _authListenerBound = false;
    }
    if (_authWatchHandle) {
        clearInterval(_authWatchHandle);
        _authWatchHandle = null;
    }
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
    _offlineBeaconSent = false;
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
export function useRealtimeStats({ onStats }: { onStats?: (data: any) => void } = {}) {
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
