import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useAppStore = defineStore('appStore', () => {
    const loading = ref(false);
    const loadingText = ref('');
    const isInitialGisLoadComplete = ref(false);
    /** 左侧「日志监控」入口控制的运行日志面板显隐 */
    const logMonitorVisible = ref(false);

    let loadingTimeoutId: any = null;
    /**
     * 隐藏延迟（毫秒）：hideLoading() 被调用后推迟该时长才真正隐藏。
     * 用于首屏地图就绪后留出过渡缓冲，避免遮罩消失瞬间露出未铺满的白底。
     */
    let loadingHideDelayMs = 0;
    /** 延迟隐藏挂起的定时器 */
    let hideDelayTimerId: any = null;

    /**
     * 最短持续时间（毫秒）：showLoading 后遮罩至少显示该时长。
     * 就绪事件早于该时长时（如首屏只等到第一张瓦片就 emit ready），
     * hideLoading() 的调用会被推迟到时长满足后才真正执行。
     */
    let loadingMinDurationMs = 0;
    /** 当前这轮遮罩的开始时间戳 */
    let loadingShownAtMs = 0;
    /** 最短持续时间到期前挂起的定时器 */
    let minDurationTimerId: any = null;

    function showLoading(
        text: string = '',
        options: { timeoutMs?: number; hideDelayMs?: number; minDurationMs?: number } = {},
    ) {
        // 新一轮 showLoading 取消尚未到期的延迟隐藏，避免旧计时误伤新遮罩
        if (hideDelayTimerId !== null) {
            clearTimeout(hideDelayTimerId);
            hideDelayTimerId = null;
        }
        if (minDurationTimerId !== null) {
            clearTimeout(minDurationTimerId);
            minDurationTimerId = null;
        }

        loading.value = true;
        loadingText.value = String(text || '').trim();
        loadingHideDelayMs = Number.isFinite(options.hideDelayMs)
            ? Math.max(0, Number(options.hideDelayMs))
            : 0;
        // 未传 minDurationMs 时归零，避免上一轮的最短时长泄漏到本轮无关任务
        loadingMinDurationMs = Number.isFinite(options.minDurationMs)
            ? Math.max(0, Number(options.minDurationMs))
            : 0;
        loadingShownAtMs = Date.now();

        // Clear any existing timeout
        if (loadingTimeoutId !== null) {
            clearTimeout(loadingTimeoutId);
            loadingTimeoutId = null;
        }

        const timeoutMs = Number.isFinite(options.timeoutMs)
            ? Math.max(0, Number(options.timeoutMs))
            : 15000;

        // timeoutMs=0 用于必须等待真实就绪事件的长任务（例如 Cesium 首屏瓦片）。
        if (timeoutMs > 0) {
            loadingTimeoutId = window.setTimeout(() => {
                if (loading.value) {
                    console.warn(
                        `[Loading Timeout] Auto-hiding loading overlay after ${timeoutMs}ms safety threshold.`,
                    );
                    forceHideLoading();
                }
                loadingTimeoutId = null;
            }, timeoutMs);
        }
    }

    /**
     * 强制立即隐藏（绕过隐藏延迟），仅供内部超时兜底使用。
     */
    function forceHideLoading() {
        if (hideDelayTimerId !== null) {
            clearTimeout(hideDelayTimerId);
            hideDelayTimerId = null;
        }
        if (minDurationTimerId !== null) {
            clearTimeout(minDurationTimerId);
            minDurationTimerId = null;
        }
        loading.value = false;
        loadingText.value = '';

        // Clear timeout when manually hiding
        if (loadingTimeoutId !== null) {
            clearTimeout(loadingTimeoutId);
            loadingTimeoutId = null;
        }
    }

    function hideLoading() {
        // 最短持续时间：就绪事件来得太早时，推迟到时长满足后再隐藏
        const elapsedMs = Date.now() - loadingShownAtMs;
        if (loadingMinDurationMs > 0 && elapsedMs < loadingMinDurationMs) {
            if (minDurationTimerId !== null) return; // 幂等：已挂起则不重复
            minDurationTimerId = window.setTimeout(() => {
                minDurationTimerId = null;
                // 链式重入 hideLoading：时长已满足，会继续走 hideDelayMs 分支，
                // 保证两个延迟机制可叠加（直接 forceHide 会绕过隐藏延迟）
                hideLoading();
            }, loadingMinDurationMs - elapsedMs);
            return;
        }

        // 隐藏延迟：推迟真正的隐藏（幂等，只挂一个定时器）
        if (loadingHideDelayMs > 0) {
            if (hideDelayTimerId !== null) return;
            hideDelayTimerId = window.setTimeout(() => {
                hideDelayTimerId = null;
                forceHideLoading();
            }, loadingHideDelayMs);
            return;
        }

        forceHideLoading();
    }

    function markGisInitComplete() {
        isInitialGisLoadComplete.value = true;
    }

    function toggleLogMonitor() {
        logMonitorVisible.value = !logMonitorVisible.value;
    }

    function setLogMonitorVisible(visible: boolean) {
        logMonitorVisible.value = !!visible;
    }

    return {
        loading,
        loadingText,
        isInitialGisLoadComplete,
        logMonitorVisible,
        showLoading,
        hideLoading,
        markGisInitComplete,
        toggleLogMonitor,
        setLogMonitorVisible,
    };
});
