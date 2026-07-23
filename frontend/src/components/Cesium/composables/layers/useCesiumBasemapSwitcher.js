/**
 * Cesium 底图快速切换器 + 熔断降级
 * 移植自 OL 侧 useBasemapSelectionWatcher.js 的熔断/降级模式
 * 监听 ImageryLayer 加载事件，超时/失败后触发降级链
 */

/**
 * 工厂函数 - 创建 Cesium 底图切换器
 * @param {Object} options
 * @param {Function} options.getViewer - 获取 Cesium Viewer
 * @param {Function} options.getCesium - 获取 Cesium 运行时
 * @param {import('vue').Ref<string>} options.activeBasemap - 当前活跃底图预设 ID
 * @param {Function} options.applyBasemap - 底图应用函数
 * @param {Function} options.resolvePresetLayerIds - 预设→栈源 ID 数组解析
 * @param {Function} options.message - 消息提示工具
 * @param {number} [options.validationTimeoutMs=5000] - 加载验证超时
 * @param {number} [options.circuitBreakThreshold=3] - 连续失败次数阈值
 * @returns {Object} switcher API
 */
export function useCesiumBasemapSwitcher({
    getViewer,
    getCesium: _getCesium,
    activeBasemap,
    applyBasemap,
    resolvePresetLayerIds,
    message,
    validationTimeoutMs = 5000,
    circuitBreakThreshold = 3,
}) {
    /** 每个预设的失败计数 */
    const failureCountMap = new Map();

    /** 已熔断的预设集合 */
    const circuitOpenSet = new Set();

    /** 当前是否处于熔断状态（供 UI 绑定） */
    const isCircuitOpen = { value: false };

    /** 验证计时器 */
    let validationTimer = null;

    /** 当前监控的 imageryLayer 引用 */
    let monitoredLayers = [];

    /** 当前验证周期内注册的事件解绑函数 */
    let validationDisposers = [];

    /**
     * 切换底图预设
     * @param {string} presetId - 预设 ID
     * @param {Object} [options]
     * @param {boolean} [options.forceReload=false] - 强制重载
     * @returns {boolean} 是否成功发起切换
     */
    function switchBasemap(presetId, options = {}) {
        if (!presetId) return false;

        // 检查熔断状态
        if (circuitOpenSet.has(presetId) && !options.forceReload) {
            console.warn(`[CesiumBasemapSwitcher] 预设 "${presetId}" 已熔断，跳过`);
            isCircuitOpen.value = true;
            return false;
        }

        // 执行切换
        const success = applyBasemap(presetId, options);
        if (!success) {
            recordFailure(presetId);
            return false;
        }

        // 启动后台验证
        startValidation(presetId);
        return true;
    }

    /**
     * 启动后台加载验证
     * 监听 imageryLayer 的 tile 加载事件，超时后标记失败
     * @param {string} presetId - 当前预设 ID
     */
    function startValidation(presetId) {
        clearValidation();
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers) return;

        // 查找当前底图对应的 imagery layer（排除 overlay 层）
        const stackIds = resolvePresetLayerIds(presetId);
        const currentLayers = [];
        for (let i = 0; i < viewer.imageryLayers.length; i++) {
            const layer = viewer.imageryLayers.get(i);
            if (layer?.imageryProvider?._descriptorId && stackIds.includes(layer.imageryProvider._descriptorId)) {
                currentLayers.push(layer);
            }
        }

        if (!currentLayers.length) {
            // 没有可监控的层——可能是传统 ProviderViewModel 创建的
            // 跳过验证，不触发熔断
            return;
        }

        monitoredLayers = currentLayers;
        let hasLoaded = false;

        const onLoad = () => {
            hasLoaded = true;
            clearValidation();
            // 加载成功——重置失败计数
            failureCountMap.delete(presetId);
            if (circuitOpenSet.has(presetId)) {
                circuitOpenSet.delete(presetId);
                isCircuitOpen.value = circuitOpenSet.size > 0;
            }
        };

        const onError = (error) => {
            if (!hasLoaded) {
                console.warn(`[CesiumBasemapSwitcher] 预设 "${presetId}" 加载出错:`, error);
                recordFailure(presetId);
                clearValidation();
            }
        };

        // 绑定 tile 加载事件
        for (const layer of monitoredLayers) {
            const provider = layer.imageryProvider;
            if (provider?.errorEvent) {
                provider.errorEvent.addEventListener(onError);
                validationDisposers.push(() => provider.errorEvent.removeEventListener(onError));
            }
            if (provider?.ready) {
                onLoad();
                return;
            }
            if (provider?.readyPromise?.then) {
                provider.readyPromise.then(onLoad).catch(onError);
            }
        }

        // 超时检测
        validationTimer = setTimeout(() => {
            if (!hasLoaded) {
                console.warn(`[CesiumBasemapSwitcher] 预设 "${presetId}" 加载超时 (${validationTimeoutMs}ms)`);
                recordFailure(presetId);
            }
        }, validationTimeoutMs);
    }

    /**
     * 记录失败并检查是否需要熔断
     * @param {string} presetId
     */
    function recordFailure(presetId) {
        const count = (failureCountMap.get(presetId) || 0) + 1;
        failureCountMap.set(presetId, count);

        if (count >= circuitBreakThreshold) {
            circuitOpenSet.add(presetId);
            isCircuitOpen.value = true;
            console.warn(
                `[CesiumBasemapSwitcher] 预设 "${presetId}" 达到熔断阈值 (${circuitBreakThreshold})，已熔断`
            );

            // 尝试降级到默认预设
            attemptFallback(presetId);
        }
    }

    /**
     * 熔断后尝试降级到默认预设
     * @param {string} failedPresetId - 失败的预设 ID
     */
    function attemptFallback(failedPresetId) {
        const defaultPresetId = 'custom_China_Blender_preset_2';

        if (failedPresetId === defaultPresetId) {
            // 默认预设也熔断了——降级到天地图
            const fallbackId = 'imagery_tianditu_preset';
            if (!circuitOpenSet.has(fallbackId)) {
                message?.warning?.(`底图加载失败，已降级到天地图影像`, { closable: true });
                activeBasemap.value = fallbackId;
            } else {
                message?.error?.('所有底图均加载失败，请检查网络', { closable: true });
            }
            return;
        }

        if (!circuitOpenSet.has(defaultPresetId)) {
            message?.warning?.(`底图加载失败，已降级到默认底图`, { closable: true });
            activeBasemap.value = defaultPresetId;
        } else {
            // 默认也熔断——降级到天地图
            const fallbackId = 'imagery_tianditu_preset';
            if (!circuitOpenSet.has(fallbackId)) {
                message?.warning?.(`底图加载失败，已降级到天地图影像`, { closable: true });
                activeBasemap.value = fallbackId;
            } else {
                message?.error?.('所有底图均加载失败，请检查网络', { closable: true });
            }
        }
    }

    /**
     * 清除验证计时器和事件监听
     */
    function clearValidation() {
        if (validationTimer) {
            clearTimeout(validationTimer);
            validationTimer = null;
        }
        for (const dispose of validationDisposers) {
            try {
                dispose();
            } catch {
                // Cesium Event 解绑失败不影响后续验证周期重建。
            }
        }
        validationDisposers = [];
        monitoredLayers = [];
    }

    /**
     * 重置熔断链路（用户手动操作）
     * 清除所有失败计数和熔断状态
     */
    function resetCircuitBreaker() {
        failureCountMap.clear();
        circuitOpenSet.clear();
        isCircuitOpen.value = false;
        clearValidation();
    }

    /**
     * 清理所有资源
     */
    function cleanup() {
        clearValidation();
        failureCountMap.clear();
        circuitOpenSet.clear();
        isCircuitOpen.value = false;
    }

    return {
        switchBasemap,
        resetCircuitBreaker,
        isCircuitOpen,
        cleanup,
    };
}
