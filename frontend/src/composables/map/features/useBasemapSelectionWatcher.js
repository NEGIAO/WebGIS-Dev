import { watch } from 'vue';

/**
 * Basemap selection watcher feature
 *
 * Responsibilities:
 * - Listen to selected basemap changes
 * - Apply layer switch and URL sync
 * - Validate switched basemap availability
 * - Auto fallback for default basemap when unavailable
 */
export function createBasemapSelectionWatcher({
    selectedLayerRef,
    switchLayerById,
    resolvePresetLayerIds,
    emitBaseLayersChange,
    mapInstanceRef,
    layerInstances,
    syncUrlFromMap,
    validateBaseLayerSwitch,
    createBaseLayerFallbackManager,
    getBasemapOptionLabel,
    message,
    defaultLayerId = 'google',
    validationTimeoutMs = 3000,
    switchDebounceMs = 300,
    circuitBreakThreshold = 3,
    onCircuitBreak,
    onCircuitReset,
}) {
    let isAutoSwitchingLayer = false;
    let switchTimer = null;
    let switchSeq = 0;

    const failureStateMap = new Map();

    function clearSwitchTimer() {
        if (switchTimer) {
            clearTimeout(switchTimer);
            switchTimer = null;
        }
    }

    function getFailureState(layerId) {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId) {
            return { failures: 0, circuitOpen: false };
        }

        if (!failureStateMap.has(normalizedLayerId)) {
            failureStateMap.set(normalizedLayerId, {
                failures: 0,
                circuitOpen: false,
            });
        }

        return failureStateMap.get(normalizedLayerId);
    }

    function markLayerFailure(layerId) {
        const state = getFailureState(layerId);
        state.failures += 1;

        if (state.failures >= circuitBreakThreshold) {
            state.circuitOpen = true;
            onCircuitBreak?.(String(layerId || ''), state.failures);
        }

        return state.failures;
    }

    function clearLayerFailure(layerId) {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId) return;

        const state = getFailureState(normalizedLayerId);
        const wasOpen = !!state.circuitOpen;

        state.failures = 0;
        state.circuitOpen = false;

        if (wasOpen) {
            onCircuitReset?.(normalizedLayerId);
        }
    }

    function releaseLayerSource(layerId) {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId || !layerInstances) return;

        const layer = layerInstances[normalizedLayerId];
        if (!layer) return;

        const source = layer.getSource?.();
        if (source && typeof source.clear === 'function') {
            source.clear();
        }

        if (typeof layer.setSource === 'function') {
            layer.setSource(null);
        }
    }

    function releasePreviousLayerSources(previousLayerId, nextLayerId) {
        const previousStack = Array.isArray(resolvePresetLayerIds?.(previousLayerId))
            ? resolvePresetLayerIds(previousLayerId)
            : [previousLayerId];
        const nextStack = Array.isArray(resolvePresetLayerIds?.(nextLayerId))
            ? resolvePresetLayerIds(nextLayerId)
            : [nextLayerId];
        const keepSet = new Set(nextStack.map((id) => String(id || '').trim()));

        previousStack
            .map((id) => String(id || '').trim())
            .filter(Boolean)
            .forEach((id) => {
                if (!keepSet.has(id)) {
                    releaseLayerSource(id);
                }
            });
    }

    function resetBasemapChain({ targetLayerId } = {}) {
        clearSwitchTimer();
        switchSeq += 1;
        isAutoSwitchingLayer = false;

        failureStateMap.forEach((state) => {
            state.failures = 0;
            state.circuitOpen = false;
        });
        onCircuitReset?.(String(targetLayerId || selectedLayerRef?.value || ''));

        const normalizedTarget = String(targetLayerId || selectedLayerRef?.value || '').trim();
        if (!normalizedTarget) return;

        const targetStack = Array.isArray(resolvePresetLayerIds?.(normalizedTarget))
            ? resolvePresetLayerIds(normalizedTarget)
            : [normalizedTarget];

        targetStack.forEach((layerId) => releaseLayerSource(layerId));

        switchLayerById?.(normalizedTarget, {
            onUpdated: () => {
                emitBaseLayersChange?.();
                if (mapInstanceRef?.value && typeof mapInstanceRef.value.updateSize === 'function') {
                    mapInstanceRef.value.updateSize();
                }
            }
        });

        syncUrlFromMap?.();
        message?.info?.('底图链路已重置，请重试底图切换。');
    }

    async function runLayerSwitch(val, prevVal, currentSeq) {
        const activeStack = resolvePresetLayerIds?.(val) || [];

        if (!isAutoSwitchingLayer && getFailureState(val).circuitOpen) {
            message?.warning?.('当前网络异常，请尝试手动重试。可点击“重置链路”按钮。');
            onCircuitBreak?.(String(val || ''), getFailureState(val).failures);

            if (prevVal && prevVal !== val) {
                isAutoSwitchingLayer = true;
                selectedLayerRef.value = prevVal;
            }
            return;
        }

        if (prevVal !== undefined) {
            releasePreviousLayerSources(prevVal, val);
        }

        switchLayerById?.(val, {
            onUpdated: () => {
                emitBaseLayersChange?.();

                if (isAutoSwitchingLayer && mapInstanceRef?.value) {
                    setTimeout(() => {
                        if (mapInstanceRef?.value && typeof mapInstanceRef.value.updateSize === 'function') {
                            mapInstanceRef.value.updateSize();
                        }
                    }, 50);
                }
            }
        });

        if (prevVal === undefined) return;

        syncUrlFromMap?.();

        if (isAutoSwitchingLayer) {
            isAutoSwitchingLayer = false;
            return;
        }

        const switchedLayer = layerInstances?.[val];
        if (!switchedLayer) return;

        const result = await validateBaseLayerSwitch?.(val, switchedLayer, validationTimeoutMs);
        if (currentSeq !== switchSeq) {
            return;
        }

        if (result?.success) {
            clearLayerFailure(val);
            const optionLabel = getBasemapOptionLabel?.(val) || val;
            if (activeStack.length > 1) {
                message?.success?.(`已切换到${optionLabel}组合（${activeStack.join(' + ')}）`);
            } else {
                message?.success?.(`已成功切换到${optionLabel}底图`);
            }
            return;
        }

        const reason = result?.reason || '未知错误';
        const failCount = markLayerFailure(val);
        const isDefaultBaseLayer = val === defaultLayerId;

        if (failCount >= circuitBreakThreshold) {
            message?.error?.('当前网络异常，请尝试手动重试。可点击“重置链路”按钮。');

            const fallbackManager = createBaseLayerFallbackManager?.(val, true);
            const nextFallbackOption = fallbackManager?.getNextFallbackOption?.();
            if (nextFallbackOption && nextFallbackOption !== val) {
                isAutoSwitchingLayer = true;
                selectedLayerRef.value = nextFallbackOption;
                message?.info?.(`已自动切换至${nextFallbackOption}底图`);
            }
            return;
        }

        if (!isDefaultBaseLayer) {
            message?.warning?.(`切换到${val}底图失败：${reason}，请重新选择底图`);
            return;
        }

        message?.error?.(`${val}底图加载失败（${reason}），正在自动切换备用底图...`);
        const fallbackManager = createBaseLayerFallbackManager?.(val, true);
        const nextFallbackOption = fallbackManager?.getNextFallbackOption?.();

        if (!nextFallbackOption) {
            message?.error?.('所有兜底底图均不可用，请检查网络或重新选择底图');
            return;
        }

        isAutoSwitchingLayer = true;
        selectedLayerRef.value = nextFallbackOption;
        message?.info?.(`已自动切换至${nextFallbackOption}底图`);
    }

    function bindBasemapSelectionWatcher() {
        return watch(selectedLayerRef, (val, prevVal, onCleanup) => {
            clearSwitchTimer();

            if (prevVal === undefined) {
                switchSeq += 1;
                void runLayerSwitch(val, prevVal, switchSeq);
                return;
            }

            switchTimer = setTimeout(() => {
                switchSeq += 1;
                const currentSeq = switchSeq;
                void runLayerSwitch(val, prevVal, currentSeq);
                switchTimer = null;
            }, switchDebounceMs);

            onCleanup(() => {
                clearSwitchTimer();
            });
        }, { immediate: true });
    }

    return {
        bindBasemapSelectionWatcher,
        resetBasemapChain
    };
}
