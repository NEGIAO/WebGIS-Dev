/**
 * 运行时地图 Token 池特性（自 MapContainer 抽离，行为保持一致）。
 *
 * 职责：
 * - applyRuntimeMapTokens：应用后端下发的天地图 token（重建 LAYER_CONFIGS 并保留图层可见性/透明度状态）
 * - hydrateRuntimeMapTokens：启动时拉取运行时 token 并应用
 * - retryTiandituLayersWithNextToken：主 token 失效时切换备用 token 并重试受影响天地图图层
 *
 * 依赖全部注入（factory 模式）；monitorLayerTimeout / switchLayerById /
 * emitBaseLayersChangeBatched 在宿主组件中晚于本工厂创建，故以 getter 形式传入延迟解析。
 */
export function createRuntimeMapTokenPool({
    getTiandituTk,
    setTiandituTk,
    tiandituTkRef,
    layerListRef,
    customMapUrlRef,
    selectedLayerRef,
    mapInstanceRef,
    LAYER_CONFIGS,
    layerInstances,
    NORM_BASE,
    DEFAULT_BASEMAP_PRESET_ID,
    createLayerConfigs,
    resolvePresetLayerIds,
    loadRuntimeMapTokens,
    markRuntimeMapTokenFailed,
    abortTileSourceRequests,
    getMonitorLayerTimeout,
    getSwitchLayerById,
    getEmitBaseLayersChangeBatched,
    message,
}) {
    /** 应用运行时 token：token 变化时重建底图配置，并迁移既有可见性/透明度状态 */
    function applyRuntimeMapTokens(tokens = {}) {
        const nextTiandituTk = String(tokens.tiandituTk || '').trim();
        if (!nextTiandituTk || nextTiandituTk === getTiandituTk()) return;

        const previousLayerState = new globalThis.Map(
            (Array.isArray(layerListRef.value) ? layerListRef.value : []).map((item) => [
                item.id,
                {
                    visible: !!item.visible,
                    opacity: typeof item.opacity === 'number' ? item.opacity : 1,
                },
            ]),
        );

        setTiandituTk(nextTiandituTk);
        tiandituTkRef.value = nextTiandituTk;

        const nextLayerConfigs = createLayerConfigs(
            NORM_BASE,
            nextTiandituTk,
            customMapUrlRef.value,
        );
        LAYER_CONFIGS.splice(0, LAYER_CONFIGS.length, ...nextLayerConfigs);
        layerListRef.value = LAYER_CONFIGS.map((cfg) => ({
            id: cfg.id,
            name: cfg.name,
            visible: previousLayerState.has(cfg.id)
                ? previousLayerState.get(cfg.id).visible
                : cfg.visible,
            opacity: previousLayerState.get(cfg.id)?.opacity ?? 1,
        }));
    }

    /** 启动时拉取运行时 token 并应用 */
    async function hydrateRuntimeMapTokens() {
        const tokens = await loadRuntimeMapTokens({ silent: false });
        applyRuntimeMapTokens(tokens);
    }

    function isTiandituLayerId(layerId) {
        return String(layerId || '')
            .trim()
            .toLowerCase()
            .includes('tianditu');
    }

    /** 解析本次失败应重试的天地图图层集合（优先当前选中底图栈） */
    function resolveRuntimeTiandituLayerIds(layerId) {
        const selectedStack = resolvePresetLayerIds(selectedLayerRef.value);
        const failedLayerId = String(layerId || '').trim();
        const failedStack = resolvePresetLayerIds(failedLayerId);
        const sourceIds =
            selectedStack.includes(failedLayerId) || !failedStack.length
                ? selectedStack
                : failedStack;
        const candidates = sourceIds.length ? sourceIds : [failedLayerId];
        const result = [];
        const seen = new Set();

        candidates.forEach((id) => {
            const normalized = String(id || '').trim();
            if (!normalized || seen.has(normalized) || !isTiandituLayerId(normalized)) return;
            seen.add(normalized);
            result.push(normalized);
        });

        return result;
    }

    /** 中断在途瓦片请求并清空图层 source，等待用新 token 重建 */
    function resetLayerSourceForRuntimeToken(layerId) {
        const layer = layerInstances[layerId];
        if (!layer || typeof layer.setSource !== 'function') return;

        const source = layer.getSource?.();
        if (source) {
            abortTileSourceRequests(source);
        }

        layer.set?.(`_isTimeoutMonitored_${layerId}`, false);
        layer.setSource(null);
    }

    /** 对可见图层重新挂载超时监控 */
    function attachRuntimeTokenMonitor(layerId) {
        const layer = layerInstances[layerId];
        const item = Array.isArray(layerListRef.value)
            ? layerListRef.value.find((entry) => entry.id === layerId)
            : null;
        if (!layer || !item?.visible) return;

        layer.set?.(`_isTimeoutMonitored_${layerId}`, false);
        getMonitorLayerTimeout()?.(
            layer,
            layerId,
            selectedLayerRef.value === DEFAULT_BASEMAP_PRESET_ID,
        );
    }

    /** 主 token 失效：切换备用 token → 重置受影响图层 source → 重建当前底图并恢复监控 */
    function retryTiandituLayersWithNextToken({ layerId, reason, releaseMonitor } = {}) {
        const affectedLayerIds = resolveRuntimeTiandituLayerIds(layerId);
        if (!affectedLayerIds.length) return false;

        const tokenSwitch = markRuntimeMapTokenFailed('tianditu_tk');
        if (!tokenSwitch.switched) return false;

        releaseMonitor?.();
        applyRuntimeMapTokens(tokenSwitch.tokens);
        affectedLayerIds.forEach(resetLayerSourceForRuntimeToken);

        getSwitchLayerById()?.(selectedLayerRef.value, {
            onUpdated: () => {
                getEmitBaseLayersChangeBatched()?.();
                mapInstanceRef.value?.updateSize?.();
            },
        });
        affectedLayerIds.forEach(attachRuntimeTokenMonitor);

        message?.warning?.(
            `天地图 token 已切换到备用项，正在重试 ${affectedLayerIds.join(' + ')}${
                reason ? `：${reason}` : ''
            }`,
        );
        return true;
    }

    return {
        applyRuntimeMapTokens,
        hydrateRuntimeMapTokens,
        retryTiandituLayersWithNextToken,
    };
}
