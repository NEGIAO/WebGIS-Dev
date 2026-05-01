/**
 * 底图容灾功能库
 * 职责：底图切换验证、加载监测、异常降级策略。
 */
export function createBasemapResilience({ message }) {
    /**
     * [改进] 验证底图加载状态
     * - 前置检查立即返回（同步）
     * - 网络检查使用 Promise.race 快速失败（1.5s）
     * - 支持 AbortSignal 用于验证中止
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

        return Promise.race([
            // 实际的瓦片加载验证
            new Promise((resolve) => {
                let hasSuccessfulLoad = false;
                let hasError = false;
                let errorCount = 0;

                const onTileLoadEnd = () => {
                    hasSuccessfulLoad = true;
                };

                const onTileLoadError = () => {
                    errorCount++;
                    if (errorCount >= 3) {
                        hasError = true;
                    }
                };

                const cleanup = () => {
                    source.un('tileloadend', onTileLoadEnd);
                    source.un('tileloaderror', onTileLoadError);
                    if (signal) {
                        signal.removeEventListener('abort', onAbort);
                    }
                };

                const onAbort = () => {
                    cleanup();
                    resolve({ success: false, reason: '验证已取消' });
                };

                if (signal) {
                    signal.addEventListener('abort', onAbort);
                }

                source.on('tileloadend', onTileLoadEnd);
                source.on('tileloaderror', onTileLoadError);

                setTimeout(() => {
                    cleanup();

                    if (hasSuccessfulLoad) {
                        resolve({ success: true, reason: '切换成功' });
                    } else if (hasError) {
                        resolve({ success: false, reason: '底图服务异常，多个瓦片加载失败' });
                    } else {
                        resolve({ success: false, reason: '未能获取底图数据（需梯子或超时）' });
                    }
                }, checkTimeoutMs);
            }),
            // [改进] 快速失败：1.5s 就认为超时，而不是等 3s
            new Promise(resolve =>
                setTimeout(() => {
                    resolve({ success: false, reason: '加载超时（1.5s）' });
                }, 1500)
            )
        ]);
    };

    const createBaseLayerFallbackManager = (layerId, isDefaultBaseLayer) => {
        const FALLBACK_OPTIONS = ['tianDiTu', 'local'];

        let fallbackAttempts = 0;
        const maxFallbackAttempts = FALLBACK_OPTIONS.length;
        let lastFallbackKey = null;

        return {
            getNextFallbackOption: () => {
                if (fallbackAttempts >= maxFallbackAttempts) {
                    message?.warning?.(`[底图兜底] ${layerId} 已尝试所有兜底选项`);
                    return null;
                }

                const nextOption = FALLBACK_OPTIONS[fallbackAttempts];
                lastFallbackKey = nextOption;
                fallbackAttempts++;
                return nextOption;
            },
            getCurrentFallback: () => lastFallbackKey,
            isNotifyOnly: () => !isDefaultBaseLayer,
            reset: () => {
                fallbackAttempts = 0;
                lastFallbackKey = null;
            }
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

        const fallbackManager = createBaseLayerFallbackManager(layerId, isDefaultBaseLayer);

        const cleanUp = () => {
            if (activityTimer) {
                clearTimeout(activityTimer);
                activityTimer = null;
            }
            source.un('tileloadstart', onTileLoadStart);
            source.un('tileloadend', onTileLoadEnd);
            source.un('tileloaderror', onTileLoadError);
        };

        const switchToBackup = (reason, triggerCallback) => {
            if (isSwitched) return;
            isSwitched = true;

            message?.warning?.(`[底图降级] ${layerId} - ${reason}`);

            if (fallbackManager.isNotifyOnly()) {
                message?.warning?.(`[底图监测] ${layerId} 非默认底图，可能异常: ${reason}`);
                if (triggerCallback) triggerCallback();
                cleanUp();
                return;
            }

            const nextOption = fallbackManager.getNextFallbackOption();
            if (!nextOption) {
                message?.error?.(`[底图降级] ${layerId} 所有兜底选项已尝试`);
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
                    switchToBackup(`服务无响应（${ACTIVITY_TIMEOUT / 1000}秒无瓦片加载）`, callbacks.onTimeout);
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
            loadingTilesCount--;
            consecutiveErrors = 0;

            if (loadingTilesCount <= 0) {
                loadingTilesCount = 0;
                if (activityTimer) {
                    clearTimeout(activityTimer);
                    activityTimer = null;
                }

                if (!hasNotifiedSuccess && totalErrors === 0) {
                    hasNotifiedSuccess = true;
                    if (callbacks.onSuccess) callbacks.onSuccess();
                }
            } else {
                resetActivityTimer();
            }
        };

        const onTileLoadError = () => {
            if (isSwitched) return;
            loadingTilesCount--;
            consecutiveErrors++;
            totalErrors++;

            if (consecutiveErrors >= MAX_ERRORS) {
                switchToBackup(`服务异常（连续${consecutiveErrors}个瓦片失败）`, callbacks.onError);
                return;
            }

            if (totalErrors === WARNING_THRESHOLD) {
                message?.warning?.(`[底图监测] ${layerId} 累计错误${totalErrors}个，建议检查网络`);
            }

            if (loadingTilesCount <= 0) {
                loadingTilesCount = 0;
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
    };

    return {
        validateBaseLayerSwitch,
        createBaseLayerFallbackManager,
        monitorLayerTimeout
    };
}
