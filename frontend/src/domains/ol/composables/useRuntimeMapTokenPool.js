/**
 * 运行时地图 Token 池特性（自 MapContainer 抽离，行为保持一致）。
 *
 * 职责：
 * - applyRuntimeMapTokens：应用后端下发的运行时 token（重建 LAYER_CONFIGS 并保留图层可见性/透明度状态）
 * - hydrateRuntimeMapTokens：启动时拉取运行时 token 并应用
 * - retryRuntimeTokenLayersWithNextToken：图层失败时按所属密钥池切换备用 token 并重试受影响图层
 *   （密钥池判定走 basemapConfig.resolveRuntimeTokenPoolKey 的 needsContext 声明，天地图/奥维通用）
 *
 * 依赖全部注入（factory 模式）；monitorLayerTimeout / switchLayerById /
 * emitBaseLayersChangeBatched 在宿主组件中晚于本工厂创建，故以 getter 形式传入延迟解析。
 */
import { resolveRuntimeTokenPoolKey } from '@ol/basemap/constants/basemapConfig';

/** 密钥池显示名（toast 提示用） */
const TOKEN_POOL_LABELS = {
    tianditu_tk: '天地图',
    ovital_tdtkey: '奥维',
};

export function createRuntimeMapTokenPool({
    getTiandituTk,
    setTiandituTk,
    tiandituTkRef,
    getOvitalTdtkey,
    setOvitalTdtkey,
    ovitalTdtkeyRef,
    layerListRef,
    customMapUrlRef,
    selectedLayerRef,
    mapInstanceRef,
    LAYER_CONFIGS,
    layerInstances,
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
        const nextOvitalTdtkey = String(tokens.ovitalTdtkey || '').trim();
        const tiandituChanged = nextTiandituTk && nextTiandituTk !== getTiandituTk();
        const ovitalChanged = nextOvitalTdtkey && nextOvitalTdtkey !== getOvitalTdtkey();
        if (!tiandituChanged && !ovitalChanged) return;

        const previousLayerState = new globalThis.Map(
            (Array.isArray(layerListRef.value) ? layerListRef.value : []).map((item) => [
                item.id,
                {
                    visible: !!item.visible,
                    opacity: typeof item.opacity === 'number' ? item.opacity : 1,
                },
            ]),
        );

        if (tiandituChanged) {
            setTiandituTk(nextTiandituTk);
            tiandituTkRef.value = nextTiandituTk;
        }
        if (ovitalChanged) {
            setOvitalTdtkey(nextOvitalTdtkey);
            ovitalTdtkeyRef.value = nextOvitalTdtkey;
        }

        const nextLayerConfigs = createLayerConfigs(
            getTiandituTk(),
            getOvitalTdtkey(),
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

    /**
     * 判定失败图层/预设涉及的全部运行时密钥池。
     * 直接图层 ID 命中 needsContext 优先；否则按预设展开栈内图层去重取池
     * （useBasemapSelectionWatcher 回调传入的是预设 ID，如 'tianditu'）。
     */
    function resolveLayerTokenPools(layerId) {
        const failedLayerId = String(layerId || '').trim();
        const direct = resolveRuntimeTokenPoolKey(failedLayerId);
        if (direct) return [direct];
        const expanded = resolvePresetLayerIds(failedLayerId);
        if (!expanded.length) return [];
        const pools = [];
        expanded.forEach((id) => {
            const poolKey = resolveRuntimeTokenPoolKey(id);
            if (poolKey && !pools.includes(poolKey)) pools.push(poolKey);
        });
        return pools;
    }

    /** 解析本次失败应重试的图层集合（同一密钥池，优先当前选中底图栈） */
    function resolveAffectedLayerIds(layerId, poolKey) {
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
            if (!normalized || seen.has(normalized) || resolveRuntimeTokenPoolKey(normalized) !== poolKey) return;
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

    /**
     * 主 token 失效：判定涉及密钥池 → 轮换各池备用 token → 重置受影响图层 source → 重建当前底图并恢复监控。
     * 天地图 / 奥维等所有带备用 key 的密钥池通用；预设栈含多个密钥池时逐池轮换（任一成功即视为已处理）。
     */
    function retryRuntimeTokenLayersWithNextToken({ layerId, reason, releaseMonitor } = {}) {
        const poolKeys = resolveLayerTokenPools(layerId);
        if (!poolKeys.length) return false;

        const switchedPools = [];
        poolKeys.forEach((poolKey) => {
            const tokenSwitch = markRuntimeMapTokenFailed(poolKey);
            if (!tokenSwitch.switched) return;
            switchedPools.push(poolKey);
            applyRuntimeMapTokens(tokenSwitch.tokens);
        });
        if (!switchedPools.length) return false;

        releaseMonitor?.();
        const affectedLayerIds = [...new Set(
            switchedPools.flatMap((poolKey) => resolveAffectedLayerIds(layerId, poolKey)),
        )];
        affectedLayerIds.forEach(resetLayerSourceForRuntimeToken);

        getSwitchLayerById()?.(selectedLayerRef.value, {
            onUpdated: () => {
                getEmitBaseLayersChangeBatched()?.();
                mapInstanceRef.value?.updateSize?.();
            },
        });
        affectedLayerIds.forEach(attachRuntimeTokenMonitor);

        const label = switchedPools.map((poolKey) => TOKEN_POOL_LABELS[poolKey] || poolKey).join(' / ');
        message?.warning?.(
            `${label} token 已切换到备用项，正在重试 ${affectedLayerIds.join(' + ') || selectedLayerRef.value}${
                reason ? `：${reason}` : ''
            }`,
        );
        return true;
    }

    return {
        applyRuntimeMapTokens,
        hydrateRuntimeMapTokens,
        retryRuntimeTokenLayersWithNextToken,
    };
}
