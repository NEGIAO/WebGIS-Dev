/**
 * 启动任务调度功能库
 * 负责首屏优先策略与非关键任务的延后执行
 *
 * 导出：
 * - scheduleLowPriorityTask(task)
 * - waitForCriticalTileReady(timeoutMs)
 */

import { unByKey } from 'ol/Observable';

/**
 * 工厂函数 - 返回启动任务调度相关的导出函数
 * @param {Object} options 配置选项
 * @param {Ref} options.componentUnmountedRef - 组件卸载标志的 ref
 * @param {number} options.criticalTileReadyTimeoutMs - 关键瓦片加载超时时间
 * @returns {Object} 包含 scheduleLowPriorityTask 和 waitForCriticalTileReady 的对象
 */
export function createStartupTaskSchedulerFeature({
    componentUnmountedRef,
    criticalTileReadyTimeoutMs = 3000,
    mapInstanceRef = null,
}) {
    // [C10] 追踪所有待执行的调度任务句柄
    const pendingHandles = [];
    const isIdleCallback = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';

    /**
     * 在首屏关键瓦片加载后调度非关键任务
     * 避免阻塞首次渲染，提升首屏加载体验
     * 优先使用 requestIdleCallback，回退到 setTimeout
     * @param {Function} task - 待调度的任务函数
     */
    function scheduleLowPriorityTask(task) {
        if (isIdleCallback) {
            const handle = window.requestIdleCallback(
                () => {
                    // 任务执行后移除追踪
                    const idx = pendingHandles.indexOf(handle);
                    if (idx !== -1) pendingHandles.splice(idx, 1);
                    if (!componentUnmountedRef.value) task();
                },
                { timeout: 1500 },
            );
            pendingHandles.push(handle);
            return;
        }
        const handle = setTimeout(() => {
            const idx = pendingHandles.indexOf(handle);
            if (idx !== -1) pendingHandles.splice(idx, 1);
            if (!componentUnmountedRef.value) task();
        }, 0);
        pendingHandles.push(handle);
    }

    /**
     * [C10] 取消所有待执行的调度任务
     * 组件卸载时调用，防止回调在卸载后执行
     */
    function cancelScheduledTasks() {
        pendingHandles.forEach((handle) => {
            if (isIdleCallback) {
                window.cancelIdleCallback(handle);
            } else {
                clearTimeout(handle);
            }
        });
        pendingHandles.length = 0;
    }

    /**
     * 等待关键瓦片完成首次渲染
     * 避免阻塞后续非关键任务，采用返回 Promise 的方案以便异步等待
     * @param {number} timeoutMs - 超时时间（毫秒），默认使用工厂配置
     * @returns {Promise<void>}
     */
    function waitForCriticalTileReady(timeoutMs = criticalTileReadyTimeoutMs) {
        return new Promise((resolve) => {
            const map = mapInstanceRef?.value;
            if (!map) {
                resolve();
                return;
            }
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                if (renderCompleteKey) unByKey(renderCompleteKey);
                clearTimeout(timer);
                resolve();
            };

            const renderCompleteKey = map.on('rendercomplete', finish);
            const timer = setTimeout(finish, timeoutMs);
        });
    }

    return {
        scheduleLowPriorityTask,
        waitForCriticalTileReady,
        cancelScheduledTasks,
    };
}
