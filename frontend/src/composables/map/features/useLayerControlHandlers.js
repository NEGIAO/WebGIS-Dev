/**
 * 图层控制面板事件处理库（Phase 21 - 性能优化版）
 *
 * 主要改进：
 * 1. 引入 AbortController 机制阻断无用的底图切片请求
 * 2. 优化并发槽位释放，解决国外底图加载导致的“卡死”问题
 */
import { abortTileSourceRequests } from '../../useTileSourceFactory'; // 确保路径指向你存放工厂函数的地方
import { createBasemapLayerFromSource, isVectorTileLayer } from './basemapLayerFactory';

export function createLayerControlHandlers({
    selectedLayerRef,
    customMapUrlRef,
    layerListRef,
    layerInstances,
    refreshLayersState,
    createAutoTileSourceFromUrl,
    message,
    mapInstanceRef,
}) {
    /**
     * 【关键改动 1】：内部助手函数
     * 作用：在物理层面掐断指定图层正在进行的 HTTP 请求[cite: 2]
     */
    function stopLayerNetworkRequests(layerId) {
        if (!layerId || !layerInstances) return;
        const layer = layerInstances[layerId];
        const source = layer?.getSource?.();
        if (source) {
            // 立即停止所有 pending 的 fetch 请求，释放浏览器 6 个并发槽位[cite: 2]
            abortTileSourceRequests(source);
        }
    }

    // Resolve layer visibility, opacity, and zIndex for replacement.
    function resolveLayerPresentation(layerId, fallbackLayer) {
        const list = layerListRef?.value;
        const item = Array.isArray(list) ? list.find((entry) => entry.id === layerId) : null;

        const visible =
            fallbackLayer?.getVisible?.() ??
            (typeof item?.visible === 'boolean' ? item.visible : true);
        const opacity =
            fallbackLayer?.getOpacity?.() ??
            (typeof item?.opacity === 'number' ? item.opacity : 1);
        const zIndex =
            fallbackLayer?.getZIndex?.() ??
            (item && Array.isArray(list) ? list.length - list.indexOf(item) : 0);

        return { visible, opacity, zIndex };
    }

    // Swap the layer instance in map and cache when type changes.
    function replaceLayerInstance(layerId, nextLayer) {
        if (!layerId || !nextLayer) return;
        const map = mapInstanceRef?.value;
        const currentLayer = layerInstances?.[layerId];

        if (map && currentLayer) {
            map.removeLayer(currentLayer);
        }

        if (map) {
            map.addLayer(nextLayer);
        }

        if (layerInstances) {
            layerInstances[layerId] = nextLayer;
        }
    }

    /**
     * 应用底图选择
     */
    function applyBasemapSelection(layerId) {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId || !selectedLayerRef) return;

        if (selectedLayerRef.value === normalizedLayerId) {
            return;
        }

        /**
         * 【关键改动 2】：先阻断，再切换
         * 如果不调用这一步，旧底图（如 Google）没加载完的瓦片会继续占用网络通道[cite: 2]
         */
        stopLayerNetworkRequests(selectedLayerRef.value);

        selectedLayerRef.value = normalizedLayerId;
    }

    /**
     * 加载自定义 URL 底图
     */
    async function loadCustomMap() {
        if (!customMapUrlRef?.value) return;

        try {
            /**
             * 【关键改动 3】：清理 custom 图层的残留请求
             * 防止用户连续快速点击“加载”按钮导致请求堆积[cite: 2]
             */
            stopLayerNetworkRequests('custom');

            const detected = await createAutoTileSourceFromUrl(customMapUrlRef.value);
            const customLayer = layerInstances?.custom;
            const layerState = resolveLayerPresentation('custom', customLayer);

            const kindTextMap = {
                xyz: '标准XYZ',
                'non-standard-xyz': '非标准XYZ',
                wms: 'WMS',
                wmts: 'WMTS',
                'vector-tile': '矢量切片',
            };

            message?.success?.(`自动识别图源: ${kindTextMap[detected.kind]}（${detected.detail}）`);

            const isVectorTile = detected.kind === 'vector-tile';

            if (isVectorTile) {
                if (customLayer && isVectorTileLayer(customLayer) && customLayer.setSource) {
                    customLayer.setSource(detected.source);
                } else {
                    const nextLayer = createBasemapLayerFromSource(detected.source, layerState);
                    replaceLayerInstance('custom', nextLayer);
                }
            } else {
                if (customLayer && !isVectorTileLayer(customLayer) && customLayer.setSource) {
                    customLayer.setSource(detected.source);
                } else {
                    const nextLayer = createBasemapLayerFromSource(detected.source, layerState);
                    replaceLayerInstance('custom', nextLayer);
                }
            }

            const target = layerListRef?.value?.find((item) => item.id === 'custom');
            if (target) {
                target.visible = true;
                refreshLayersState?.();
            }
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error || 'URL格式错误或无法解析');
            message?.error?.(`加载自定义图源失败: ${errorMessage}`);
        }
    }

    /**
     * 统一接收图层切换与自定义 URL 加载
     */
    function handleLayerChange(payload = {}) {
        const nextLayerId = String(payload.layerId || '').trim();
        if (nextLayerId) {
            applyBasemapSelection(nextLayerId);
        }

        if (payload.source === 'custom-url' && customMapUrlRef) {
            customMapUrlRef.value = String(payload.customUrl || '').trim();
            if (customMapUrlRef.value) {
                void loadCustomMap();
            }
        }

        if (
            nextLayerId === 'custom' &&
            customMapUrlRef?.value &&
            payload.source !== 'custom-url'
        ) {
            void loadCustomMap();
        }
    }

    /**
     * 处理图层排序、可见性和透明度更新（这部分逻辑保持现状即可）
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
        handleLayerOrderUpdate,
    };
}
