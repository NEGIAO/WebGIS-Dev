import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useAppStore = defineStore('appStore', () => {
    const loading = ref(false);
    const loadingText = ref('');
    const isInitialGisLoadComplete = ref(false);
    /** 左侧「日志监控」入口控制的运行日志面板显隐 */
    const logMonitorVisible = ref(false);

    let loadingTimeoutId: any = null;

    function showLoading(text: string = '', options: { timeoutMs?: number } = {}) {
        loading.value = true;
        loadingText.value = String(text || '').trim();

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
                    hideLoading();
                }
                loadingTimeoutId = null;
            }, timeoutMs);
        }
    }

    function hideLoading() {
        loading.value = false;
        loadingText.value = '';

        // Clear timeout when manually hiding
        if (loadingTimeoutId !== null) {
            clearTimeout(loadingTimeoutId);
            loadingTimeoutId = null;
        }
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
