/**
 * 创建启动阶段 URL 恢复守卫。
 * 用于在分享链接参数尚未应用前暂停 OL 写回，避免当前默认视图覆盖 URL。
 * @param {Object} options
 * @param {Function} options.parseUrlToState - 读取当前 URL 中 OL 视图参数的函数。
 * @param {Function} options.getPendingParams - 读取路由阶段缓存参数的函数。
 * @param {Function} options.isUrlSyncEnabled - 判断当前 OL 是否允许写回 URL。
 * @returns {{ canSyncNow: Function, markInitialRestoreApplied: Function, hasPendingRestore: Function }}
 */
export function createStartupUrlRestoreGuard({
    parseUrlToState,
    getPendingParams,
    isUrlSyncEnabled,
} = {}) {
    const hasRestorableOlView = () => {
        const pendingParams = getPendingParams?.() || {};
        if (pendingParams.view === 'cesium') return false;

        const routeState = parseUrlToState?.() || {};
        return Number.isFinite(Number(routeState.lng)) && Number.isFinite(Number(routeState.lat));
    };

    let initialRestorePending = hasRestorableOlView();

    return {
        /**
         * 当前是否仍存在启动期待恢复参数。
         * @returns {boolean} true 表示需要继续暂停主动 URL 写回。
         */
        hasPendingRestore() {
            return initialRestorePending;
        },

        /**
         * 标记启动期 URL 参数已经处理完毕，后续 OL 视图变化可正常写回。
         * @returns {void}
         */
        markInitialRestoreApplied() {
            initialRestorePending = false;
        },

        /**
         * 判断当前是否允许执行 OL URL 写回。
         * @returns {boolean} true 表示可安全写回当前 OL 视图。
         */
        canSyncNow() {
            return Boolean(isUrlSyncEnabled?.()) && !initialRestorePending;
        },
    };
}
