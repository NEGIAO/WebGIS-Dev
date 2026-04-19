/**
 * 图层控制面板事件处理库（Phase 21）
 *
 * 功能：
 * - 处理底图切换与自定义 URL 加载
 * - 处理图层排序、显隐、透明度更新
 * - 处理自定义底图自动识别并落图
 */

export function createLayerControlHandlers({
    selectedLayerRef,
    customMapUrlRef,
    layerListRef,
    layerInstances,
    refreshLayersState,
    createAutoTileSourceFromUrl,
    message
}) {
    const BASEMAP_SWITCH_DEBOUNCE_MS = 300;
    let basemapSwitchTimer = null;

    function applyBasemapSelection(layerId) {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId || !selectedLayerRef) return;
        selectedLayerRef.value = normalizedLayerId;
    }

    function scheduleBasemapSelection(layerId) {
        if (basemapSwitchTimer) {
            clearTimeout(basemapSwitchTimer);
            basemapSwitchTimer = null;
        }

        basemapSwitchTimer = setTimeout(() => {
            applyBasemapSelection(layerId);
            basemapSwitchTimer = null;
        }, BASEMAP_SWITCH_DEBOUNCE_MS);
    }

    /**
     * 加载用户输入的 URL，按 XYZ -> WMS -> WMTS 自动识别并激活 custom 图层。
     */
    async function loadCustomMap() {
        if (!customMapUrlRef?.value) return;

        try {
            const detected = await createAutoTileSourceFromUrl(customMapUrlRef.value);
            const customLayer = layerInstances?.custom;

            const kindTextMap = {
                xyz: '标准XYZ',
                'non-standard-xyz': '非标准XYZ',
                wms: 'WMS',
                wmts: 'WMTS'
            };

            message?.success?.(`自动识别图源: ${kindTextMap[detected.kind]}（${detected.detail}）`);

            if (customLayer?.setSource) {
                customLayer.setSource(detected.source);
                const target = layerListRef?.value?.find((item) => item.id === 'custom');
                if (target) {
                    target.visible = true;
                    refreshLayersState?.();
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : String(error || 'URL格式错误或无法解析');
            message?.error?.(`加载自定义图源失败: ${errorMessage}`);
        }
    }

    /**
     * 统一接收图层切换与自定义 URL 加载。
     */
    function handleLayerChange(payload = {}) {
        const nextLayerId = String(payload.layerId || '').trim();
        if (nextLayerId) {
            scheduleBasemapSelection(nextLayerId);
        }

        if (payload.source === 'custom-url' && customMapUrlRef) {
            customMapUrlRef.value = String(payload.customUrl || '').trim();
            if (customMapUrlRef.value) {
                void loadCustomMap();
            }
        }
    }

    /**
     * 处理图层排序、可见性和透明度更新。
     */
    function handleLayerOrderUpdate(payload = {}) {
        const list = layerListRef?.value;
        if (!Array.isArray(list)) return;

        if (payload.type === 'reorder') {
            const dragIndex = Number(payload.dragIndex);
            const dropIndex = Number(payload.dropIndex);
            if (!Number.isInteger(dragIndex) || !Number.isInteger(dropIndex)) return;
            if (dragIndex < 0 || dropIndex < 0) return;
            if (dragIndex >= list.length || dropIndex >= list.length) return;
            if (dragIndex === dropIndex) return;

            const moved = list.splice(dragIndex, 1)[0];
            list.splice(dropIndex, 0, moved);
            refreshLayersState?.();
            return;
        }

        if (payload.type === 'visibility') {
            const target = list.find((item) => item.id === payload.layerId);
            if (!target) return;
            target.visible = !!payload.visible;
            refreshLayersState?.();
            return;
        }

        if (payload.type === 'opacity') {
            const layerId = String(payload.layerId);
            const opacity = Number(payload.opacity);
            if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return;

            const target = list.find((item) => item.id === layerId);
            if (!target) return;
            target.opacity = opacity;
            refreshLayersState?.();
        }
    }

    return {
        loadCustomMap,
        handleLayerChange,
        handleLayerOrderUpdate
    };
}
