/**
 * 底图容灾功能库
 * 职责：底图切换验证、加载监测、异常降级策略。
 */
export function createBasemapResilience({ message }) {
    // [C4] 追踪所有活跃的超时监测器，支持统一清理
    const activeMonitors = new Map(); // layerId -> { cleanup, layer }

    // [Fix] 持久化 FallbackManager 实例，按 layerId 缓存，避免每次 new 导致降级链重置
    const fallbackManagers = new Map(); // layerId -> FallbackManager instance

    /**
     * [Fix] 获取或创建 per-layerId 的 FallbackManager 单例
     */
    function getFallbackManager(layerId, isDefaultBaseLayer) {
        if (!fallbackManagers.has(layerId)) {
            fallbackManagers.set(layerId, createBaseLayerFallbackManager(layerId, isDefaultBaseLayer));
        }
        return fallbackManagers.get(layerId);
    }

    /**
     * 验证底图加载状态
     * - 前置检查立即返回（同步）
     * - 使用 checkTimeoutMs 作为唯一超时（移除了硬编码 1.5s 快失败）
     * - 支持 AbortSignal 用于验证中止
     * - [Fix] 监听 tileloadstart 确认有新瓦片开始加载，避免缓存假阳性
     * - [Fix] 至少需要 1 次 start + 1 次 end 才算成功
     */
    const validateBaseLayerSwitch = async (layerId, layer, checkTimeoutMs = 3000, signal) => {
        // 前置检查：立即返回，不走 Promise
        if (!layer) {
            return { success: false, reason: '底图图层实例不存在' };
        }

        const source = layer.getSource?.();
        if (!source) {
            return { success: false, reason: '底图数据源不可用' };
        }

        // 监听 abort 信号
        if (signal?.aborted) {
            return { success: false, reason: '验证已取消' };
        }

        return new Promise((resolve) => {
            let startedTiles = 0;
            let endedTiles = 0;
            let errorCount = 0;
            let settled = false;

            const settle = (result) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(result);
            };

            const onTileLoadStart = () => {
                startedTiles++;
            };

            const onTileLoadEnd = () => {
                endedTiles++;
                // [Fix] 至少 1 个瓦片 start + end 都完成才算成功
                if (startedTiles > 0 && endedTiles >= 1) {
                    settle({ success: true, reason: '切换成功' });
                }
            };

            const onTileLoadError = () => {
                errorCount++;
                // [Fix] 3 个瓦片失败就快速判定失败，不等超时
                if (errorCount >= 3) {
                    settle({ success: false, reason: '底图服务异常，多个瓦片加载失败' });
                }
            };

            const cleanup = () => {
                source.un('tileloadstart', onTileLoadStart);
                source.un('tileloadend', onTileLoadEnd);
                source.un('tileloaderror', onTileLoadError);
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
            };

            const onAbort = () => {
                settle({ success: false, reason: '验证已取消' });
            };

            if (signal) {
                signal.addEventListener('abort', onAbort);
            }

            source.on('tileloadstart', onTileLoadStart);
            source.on('tileloadend', onTileLoadEnd);
            source.on('tileloaderror', onTileLoadError);

            // [Fix] 使用 checkTimeoutMs 作为唯一超时，移除了硬编码 1.5s 快失败
            setTimeout(() => {
                if (startedTiles === 0) {
                    settle({ success: false, reason: '未能获取底图数据（无瓦片开始加载，需梯子或超时）' });
                } else if (endedTiles > 0) {
                    // 有瓦片加载成功但还没被 settle 拦截到（并发场景）
                    settle({ success: true, reason: '切换成功' });
                } else if (errorCount > 0) {
                    settle({ success: false, reason: '底图服务异常，瓦片加载失败' });
                } else {
                    settle({ success: false, reason: `底图加载超时（${checkTimeoutMs / 1000}秒）` });
                }
            }, checkTimeoutMs);
        });
    };

    /**
     * [Fix] FallbackManager：降级选项管理
     * - 排除当前失败的 layerId，避免降级到同一个图层
     * - 维护有状态的降级链
     */
    const createBaseLayerFallbackManager = (layerId, isDefaultBaseLayer) => {
        const FALLBACK_OPTIONS = ['tianDiTu', 'local'];

        let fallbackAttempts = 0;
        let lastFallbackKey = null;

        return {
            getNextFallbackOption: () => {
                // [Fix] 跳过当前失败的 layerId，避免降级到同一个图层
                while (fallbackAttempts < FALLBACK_OPTIONS.length) {
                    const option = FALLBACK_OPTIONS[fallbackAttempts];
                    fallbackAttempts++;
                    if (option !== layerId) {
                        lastFallbackKey = option;
                        return option;
                    }
                }

                message?.warning?.(`[底图兜底] ${layerId} 已尝试所有兜底选项`);
                return null;
            },
            getCurrentFallback: () => lastFallbackKey,
            isNotifyOnly: () => !isDefaultBaseLayer,
            reset: () => {
                fallbackAttempts = 0;
                lastFallbackKey = null;
            },
        };
    };

    const monitorLayerTimeout = (layer, layerId, isDefaultBaseLayer, callbacks = {}) => {
        const monitorKey = `_isTimeoutMonitored_${layerId}`;
        if (layer.get?.(monitorKey)) return;
        layer.set?.(monitorKey, true);

        const source = layer.getSource?.();
        if (!source) return;

        const MAX_ERRORS = 3;
        const ACTIVITY_TIMEOUT = 10000;
        const WARNING_THRESHOLD = 5;

        let activityTimer = null;
        let loadingTilesCount = 0;
        let consecutiveErrors = 0;
        let totalErrors = 0;
        let isSwitched = false;
        let hasNotifiedSuccess = false;

        const fallbackManager = getFallbackManager(layerId, isDefaultBaseLayer);

        const cleanUp = () => {
            if (activityTimer) {
                clearTimeout(activityTimer);
                activityTimer = null;
            }
            source.un('tileloadstart', onTileLoadStart);
            source.un('tileloadend', onTileLoadEnd);
            source.un('tileloaderror', onTileLoadError);

            // [Fix] 从 activeMonitors 中移除，避免内存泄漏
            activeMonitors.delete(layerId);
            layer.set?.(monitorKey, false);
        };

        const switchToBackup = (reason, triggerCallback) => {
            if (isSwitched) return;
            isSwitched = true;

            message?.warning?.(`[底图降级] ${layerId} - ${reason}`);

            if (fallbackManager.isNotifyOnly()) {
                message?.warning?.(`[底图监测] ${layerId} 非默认底图，可能异常: ${reason}`);
                message?.info?.('若页面长时间无底图，请尝试切换底图或刷新页面以重新加载。');
                if (triggerCallback) triggerCallback();
                cleanUp();
                return;
            }

            const nextOption = fallbackManager.getNextFallbackOption();
            if (!nextOption) {
                message?.error?.(`[底图降级] ${layerId} 所有兜底选项已尝试`);
                message?.info?.('若切换后仍无底图，请刷新页面或手动选择其他底图。');
                if (triggerCallback) triggerCallback();
                cleanUp();
                return;
            }

            message?.warning?.(`[底图降级] ${layerId} 已切换至 ${nextOption}`);
            if (callbacks.onLayerSwitchRequired) {
                callbacks.onLayerSwitchRequired(nextOption, reason);
            }

            if (triggerCallback) triggerCallback();
            cleanUp();
        };

        const resetActivityTimer = () => {
            if (activityTimer) clearTimeout(activityTimer);
            if (loadingTilesCount > 0) {
                activityTimer = setTimeout(() => {
                    switchToBackup(
                        `服务无响应（${ACTIVITY_TIMEOUT / 1000}秒无瓦片加载）`,
                        callbacks.onTimeout,
                    );
                }, ACTIVITY_TIMEOUT);
            }
        };

        const onTileLoadStart = () => {
            if (isSwitched) return;
            loadingTilesCount++;
            resetActivityTimer();
        };

        const onTileLoadEnd = () => {
            if (isSwitched) return;
            loadingTilesCount = Math.max(0, loadingTilesCount - 1);
            consecutiveErrors = 0;

            if (loadingTilesCount === 0) {
                if (activityTimer) {
                    clearTimeout(activityTimer);
                    activityTimer = null;
                }

                // [Fix] 允许在恢复后重新触发 onSuccess
                if (totalErrors === 0 && !hasNotifiedSuccess) {
                    hasNotifiedSuccess = true;
                    if (callbacks.onSuccess) callbacks.onSuccess();
                }
            } else {
                resetActivityTimer();
            }
        };

        const onTileLoadError = () => {
            if (isSwitched) return;
            loadingTilesCount = Math.max(0, loadingTilesCount - 1);
            consecutiveErrors++;
            totalErrors++;

            if (consecutiveErrors >= MAX_ERRORS) {
                switchToBackup(`服务异常（连续${consecutiveErrors}个瓦片失败）`, callbacks.onError);
                return;
            }

            if (totalErrors === WARNING_THRESHOLD) {
                message?.warning?.(`[底图监测] ${layerId} 累计错误${totalErrors}个，建议检查网络`);
            }

            if (loadingTilesCount === 0) {
                if (activityTimer) {
                    clearTimeout(activityTimer);
                    activityTimer = null;
                }
            } else {
                resetActivityTimer();
            }
        };

        source.on('tileloadstart', onTileLoadStart);
        source.on('tileloadend', onTileLoadEnd);
        source.on('tileloaderror', onTileLoadError);

        // [C4] 注册监测器以便统一清理
        activeMonitors.set(layerId, { cleanup: cleanUp, layer });
    };

    /**
     * [C4] 清理所有活跃的超时监测器
     * 组件卸载时调用，防止 timer 和事件监听器泄漏
     */
    function disposeAllMonitors() {
        activeMonitors.forEach(({ cleanup, layer }, layerId) => {
            cleanup();
            const monitorKey = `_isTimeoutMonitored_${layerId}`;
            layer?.set?.(monitorKey, false);
        });
        activeMonitors.clear();

        // [Fix] 清理所有 FallbackManager 实例
        fallbackManagers.clear();
    }

    return {
        validateBaseLayerSwitch,
        getFallbackManager,
        monitorLayerTimeout,
        disposeAllMonitors,
    };
}
