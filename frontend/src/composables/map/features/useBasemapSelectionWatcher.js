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
    validationTimeoutMs = 3000
}) {
    let isAutoSwitchingLayer = false;

    function bindBasemapSelectionWatcher() {
        return watch(selectedLayerRef, async (val, prevVal) => {
            const activeStack = resolvePresetLayerIds?.(val) || [];

            switchLayerById?.(val, {
                onUpdated: () => {
                    emitBaseLayersChange?.();

                    // Auto-switch fallback path: force map refresh after switching.
                    if (isAutoSwitchingLayer && mapInstanceRef?.value) {
                        if (prevVal && layerInstances?.[prevVal]) {
                            const source = layerInstances[prevVal].getSource?.();
                            if (source && typeof source.clear === 'function') {
                                source.clear();
                            }
                        }

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
            if (result?.success) {
                const optionLabel = getBasemapOptionLabel?.(val) || val;
                if (activeStack.length > 1) {
                    message?.success?.(`已切换到${optionLabel}组合（${activeStack.join(' + ')}）`);
                } else {
                    message?.success?.(`已成功切换到${optionLabel}底图`);
                }
                return;
            }

            const reason = result?.reason || '未知错误';
            const isDefaultBaseLayer = val === defaultLayerId;

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
        }, { immediate: true });
    }

    return {
        bindBasemapSelectionWatcher
    };
}
