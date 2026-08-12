/**
 * useRealtimeStats — SSE 实时统计推送 composable（V3.4.63 R1）
 *
 * 封装 EventSource 连接 /api/statistics/stream，监听 online_stats 事件，
 * 自动解析数据并通过回调推送；断线后自动重连（指数退避，最大 10s）。
 *
 * 使用方式：
 *   const { stats, connected, reconnect } = useRealtimeStats({
//  *     onStats: (data) => { /* 更新 store / ref */
//  *   });
//  */
import { onBeforeUnmount, ref } from 'vue';
import { getAuthToken } from '@common/user/services/auth';

const SSE_ENDPOINT = '/api/statistics/stream';
const INITIAL_RETRY_MS = 2000;
const MAX_RETRY_MS = 10000;

export function useRealtimeStats({ onStats } = {}) {
    const stats = ref(null);
    const connected = ref(false);
    const _eventSource = ref(null);
    const _retryTimer = ref(null);
    const _retryMs = ref(INITIAL_RETRY_MS);
    let _dead = false;

    function _buildUrl() {
        const token = getAuthToken();
        // EventSource 不支持自定义 header，token 通过 query param 传递（后端 _extract_token 已适配）
        const sep = SSE_ENDPOINT.includes('?') ? '&' : '?';
        return token ? `${SSE_ENDPOINT}${sep}token=${encodeURIComponent(token)}` : SSE_ENDPOINT;
    }

    function connect() {
        if (_dead) return;

        _disconnect();

        const es = new EventSource(_buildUrl(), { withCredentials: true });
        _eventSource.value = es;

        es.onopen = () => {
            connected.value = true;
            _retryMs.value = INITIAL_RETRY_MS; // 连接成功后重置退避
        };

        es.addEventListener('online_stats', (event) => {
            try {
                const data = JSON.parse(event.data);
                stats.value = data;
                if (typeof onStats === 'function') {
                    onStats(data);
                }
            } catch (_e) {
                // 解析失败静默跳过
            }
        });

        es.onerror = () => {
            connected.value = false;
            es.close();
            _eventSource.value = null;

            // 自动重连（仅组件未卸载时）
            if (!_dead) {
                _retryTimer.value = setTimeout(() => {
                    _retryMs.value = Math.min(_retryMs.value * 2, MAX_RETRY_MS);
                    connect();
                }, _retryMs.value);
            }
        };
    }

    function _disconnect() {
        if (_eventSource.value) {
            _eventSource.value.close();
            _eventSource.value = null;
        }
        if (_retryTimer.value) {
            clearTimeout(_retryTimer.value);
            _retryTimer.value = null;
        }
    }

    function disconnect() {
        _dead = true;
        _disconnect();
    }

    function reconnect() {
        _dead = false;
        _retryMs.value = INITIAL_RETRY_MS;
        connect();
    }

    // 组件卸载时清理
    onBeforeUnmount(() => {
        disconnect();
    });

    return {
        stats,
        connected,
        connect,
        disconnect,
        reconnect,
    };
}
