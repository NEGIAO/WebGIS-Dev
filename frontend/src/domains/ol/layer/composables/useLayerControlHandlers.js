/**
 * 图层控制面板事件处理库（Phase 21 - 性能优化版）
 *
 * 主要改进：
 * 1. 引入 AbortController 机制阻断无用的底图切片请求
 * 2. 优化并发槽位释放，解决国外底图加载导致的“卡死”问题
 */
import { watch } from 'vue';
import { abortTileSourceRequests, buildRequestProxyUrl } from '@ol/tile-source/index';
import { createBasemapLayerFromSource, isVectorTileLayer, buildRasterBasemapSource } from '@ol/basemap/composables/basemapLayerFactory';
import { ensureWmsServiceInfo, queryCandidateAtPoint } from '@common/basemap/wmsService';
import { composeIdentifyHeading } from '@common/basemap/identifyPresentation';
import { detectTileYScheme, ensureWmtsServiceInfo } from '@common/basemap/xyzWmtsCapabilities';
import {
    registerRemoteService,
    useRemoteServices,
    renderOrderedIds,
} from '@common/basemap/remoteServices';
import { transformExtent, toLonLat } from 'ol/proj';

export function createLayerControlHandlers({
    selectedLayerRef,
    customMapUrlRef,
    layerListRef,
    layerInstances,
    refreshLayersState,
    createAutoTileSourceFromUrl,
    message,
    mapInstanceRef,
    emitBaseLayersChange,
    /** 在线服务点查命中回调：({ title, attributes }) → HomeView 属性信息面板 */
    onIdentifyResult,
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

    // ========== 在线服务要素点查（结果上报 HomeView 属性信息面板，与上传图层共用同一 UI） ==========
    let arcgisIdentifyInfo = null; // 自定义底图流程的可查询服务（兼容保留）
    let identifyClickKey = null; // singleclick 监听句柄
    const remoteStore = useRemoteServices();

    /**
     * 收集可查询候选：自定义底图服务 + 注册表中可见且开放 Query 的全部服务。
     * 每个勾选的子图层展开为独立候选（精确 top:单层），并按视觉叠放序
     * （renderOrderedIds：头部=最上层）排序 —— 点击命中的第一组即用户看到的最上层要素。
     */
    function collectIdentifyCandidates() {
        const candidates = [];
        if (arcgisIdentifyInfo && selectedLayerRef?.value === 'custom') {
            candidates.push({ serviceTitle: arcgisIdentifyInfo.title || '自定义服务', info: arcgisIdentifyInfo });
        }
        for (const record of remoteStore.records.value) {
            if (record.kind !== 'arcgis' || !record.visible || !record.queryable) continue;
            for (const name of renderOrderedIds(record)) {
                candidates.push({
                    serviceTitle: record.title || record.url,
                    info: { ...record, arcgis: true },
                    subLayerName: name,
                });
            }
        }
        return candidates;
    }

    // 点查序号：连续点击时仅最后一次点击允许上报，防止慢请求过期回填
    let identifySeq = 0;

    async function handleMapIdentify(evt) {
        const candidates = collectIdentifyCandidates();
        if (!candidates.length) return;
        const map = mapInstanceRef?.value;
        if (!map || !evt?.coordinate) return;

        const view = map.getView();
        const size = map.getSize();
        if (!size?.[0]) return;
        const lonLat = toLonLat(evt.coordinate, view.getProjection());
        let extentDeg = [];
        try {
            extentDeg = transformExtent(view.calculateExtent(size), view.getProjection(), 'EPSG:4326');
        } catch {
            /* 投影转换失败时留空 —— 仅 identify 回退路径消费 */
        }

        const seq = ++identifySeq;

        // 并发查询全部候选，统一归一化为 { candidate, hits:[{layerName,attributes}] }
        // 请求通道带硬超时 + 后端代理兜底（见 wmsService.requestServiceJson），
        // 保证 Promise 必然落地。
        const settled = await Promise.allSettled(
            candidates.map((candidate) =>
                queryCandidateAtPoint(
                    candidate,
                    lonLat,
                    { extent: extentDeg, width: size[0], height: size[1] },
                    { buildProxyUrl: buildRequestProxyUrl },
                ),
            ),
        );

        // 过期响应（期间用户又点击了别处）直接丢弃
        if (seq !== identifySeq) return;

        // 失败诊断：逐候选输出原因（跨域/超时/HTTP 状态），便于现场定位
        settled.forEach((entry, index) => {
            if (entry.status === 'rejected') {
                console.warn(
                    '[Identify] 候选查询失败:',
                    candidates[index]?.subLayerName || candidates[index]?.serviceTitle || '(未知)',
                    '→',
                    entry.reason?.message,
                );
            }
        });

        // ── 只取视觉最上层有命中的候选的首条要素（与 ArcGIS Pro 行为一致）──
        // 命中即回调 onIdentifyResult 上报至左下角「属性信息」面板；
        // 无命中 / 全部失败不打扰用户（原因已进控制台）。
        for (const entry of settled) {
            if (entry.status !== 'fulfilled') continue;
            const { candidate, hits } = entry.value;
            const hit = hits?.[0];
            if (!hit) continue;
            onIdentifyResult?.({
                title: composeIdentifyHeading(candidate.serviceTitle, hit.layerName),
                attributes: hit.attributes || {},
            });
            return;
        }
    }

    function bindArcgisIdentify(info) {
        arcgisIdentifyInfo = info;
        const map = mapInstanceRef?.value;
        if (!map || identifyClickKey !== null) return;
        identifyClickKey = map.on('singleclick', handleMapIdentify);
    }

    function disableArcgisIdentify() {
        arcgisIdentifyInfo = null;
    }

    // 点击查询监听常驻绑定：地图就绪即挂载，无候选时处理器自行短路。
    // 避免"仅 custom URL 流程才挂监听"的时序缺口——注册表中任何
    // visible && queryable 的服务（含刷新/跨引擎场景）都能保持点选查询能力。
    watch(mapInstanceRef, (map) => {
        if (map && identifyClickKey === null) {
            identifyClickKey = map.on('singleclick', handleMapIdentify);
        }
    });

    /**
     * 将视图缩放到服务的地理范围（仅当服务声明了有效范围时生效）
     * @param {string} serviceUrl 服务 URL（元数据已在解析阶段缓存，此处零网络开销）
     * @returns {Promise<boolean>} 是否执行了定位
     */
    async function fitViewToServiceExtent(serviceUrl) {
        const map = mapInstanceRef?.value;
        if (!map || typeof map.getView !== 'function') return false;
        const view = map.getView();
        if (!view || typeof view.fit !== 'function') return false;

        const info = await ensureWmsServiceInfo(serviceUrl);
        const geo = info?.geographicBbox;
        if (!Array.isArray(geo) || geo.length !== 4 || !geo.every(Number.isFinite)) return false;

        let extent;
        try {
            extent = transformExtent(geo, 'EPSG:4326', view.getProjection());
        } catch {
            return false;
        }
        if (!Array.isArray(extent) || !extent.every(Number.isFinite)) return false;

        view.fit(extent, {
            size: map.getSize?.(),
            padding: [60, 60, 60, 60],
            maxZoom: 18,
            duration: 600,
        });
        return true;
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
     * @param {{ wmsLayers?: string }} [payload] WMS 可指定图层名（LAYERS）
     */
    async function loadCustomMap(payload = {}) {
        const normalizedUrl = String(customMapUrlRef?.value || '').trim();
        if (!normalizedUrl) {
            const emptyMessage = '自定义图源 URL 为空';
            message?.warning?.(emptyMessage);
            return {
                success: false,
                message: emptyMessage,
                layerId: 'custom',
            };
        }

        const preferredWmsLayers = String(payload?.wmsLayers || '').trim();
        console.warn('[RSVC] loadCustomMap url=', normalizedUrl, '| wmsLayers=', preferredWmsLayers || '(空=默认全量)');

        try {
            /**
             * 【关键改动 3】：清理 custom 图层的残留请求
             * 防止用户连续快速点击“加载”按钮导致请求堆积[cite: 2]
             */
            stopLayerNetworkRequests('custom');

            const detected = await createAutoTileSourceFromUrl(normalizedUrl, {
                preferredLayers: preferredWmsLayers || undefined,
            });
            const customLayer = layerInstances?.custom;
            const layerState = resolveLayerPresentation('custom', customLayer);

            const kindTextMap = {
                xyz: '标准XYZ',
                'non-standard-xyz': '非标准XYZ',
                wms: 'WMS',
                wmts: 'WMTS',
                'vector-tile': '矢量切片',
            };

            const kindText = kindTextMap[detected.kind] || detected.kind || '未知图源';
            const successMessage = `自动识别图源: ${kindText}（${detected.detail}）`;
            message?.success?.(successMessage);

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
                    customLayer.setSource(buildRasterBasemapSource(detected.source));
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

            emitBaseLayersChange?.();

            // 小范围服务：自动缩放到数据范围（元数据已缓存，此处近乎零开销）
            /**
             * 【渲染归属单一化】custom 底图实例退位：注册成功后由注册表 adapter 统一渲染
             * （在线服务子带 zIndex 100~149）。隐藏实例 + 清请求，并同步 layerList 状态
             * 防止后续 refreshLayersState 复活；非注册类型（非标准 XYZ/矢量切片）不调用。
             */
            function retireCustomBasemapInstance() {
                const customTarget = layerListRef?.value?.find((item) => item.id === 'custom');
                if (customTarget) customTarget.visible = false;
                const customInstance = layerInstances?.custom;
                if (customInstance?.setVisible) customInstance.setVisible(false);
                stopLayerNetworkRequests?.('custom');
            }

            if (detected.kind === 'wms') {
                const svcInfo = await ensureWmsServiceInfo(normalizedUrl);
                // 常驻绑定点击监听：候选集合动态收集（注册表中任何可见+可查询服务都参与命中）
                bindArcgisIdentify(svcInfo || null);
                // 注册到「在线服务」注册表（TOC 统一管理；同 url+同图层去重更新）
                if (svcInfo?.arcgis || svcInfo?.source === 'capabilities') {
                    const matchedOption = svcInfo.layerOptions?.find(
                        (option) => option.name === preferredWmsLayers,
                    );
                    registerRemoteService({
                        kind: svcInfo.arcgis ? 'arcgis' : 'wms',
                        url: normalizedUrl,
                        endpoint: svcInfo.endpoint || normalizedUrl,
                        title: svcInfo.title || normalizedUrl,
                        selectedLayerId: preferredWmsLayers,
                        layerLabel: matchedOption?.title || '',
                        sublayers: (svcInfo.layerOptions || [])
                            .filter((option) => option.name && !option.name.includes(','))
                            .map((option) => ({ name: option.name, title: option.title, label: option.label })),
                        selectedIds: preferredWmsLayers ? preferredWmsLayers.split(',') : [],
                        layersParam: svcInfo.arcgis
                            ? preferredWmsLayers
                                ? `show:${preferredWmsLayers}`
                                : ''
                            : preferredWmsLayers || String(svcInfo.layers ?? ''),
                        tileMode: svcInfo.tileMode,
                        maxLevel: svcInfo.maxLevel,
                        format: svcInfo.format,
                        version: svcInfo.version,
                        srs: svcInfo.srs,
                        geographicBbox: svcInfo.geographicBbox,
                        queryable: svcInfo.queryable === true,
                    });
                    message?.info?.('已同步至图层面板「在线服务」分组', { duration: 2500 });
                    retireCustomBasemapInstance();
                }
                const fitted = await fitViewToServiceExtent(normalizedUrl);
                if (fitted) {
                    message?.info?.('已定位到图层数据范围', { duration: 2500 });
                }
            } else if (detected.kind === 'wmts') {
                disableArcgisIdentify();
                const svcInfo = await ensureWmtsServiceInfo(normalizedUrl);
                if (svcInfo && svcInfo.layerOptions.length) {
                    const firstLayer = preferredWmsLayers || svcInfo.layerOptions[0].name;
                    const matchedOption = svcInfo.layerOptions.find(
                        (option) => option.name === firstLayer,
                    );
                    registerRemoteService({
                        kind: 'wmts',
                        url: normalizedUrl,
                        endpoint: svcInfo.endpoint,
                        title: svcInfo.title,
                        selectedLayerId: firstLayer,
                        layerLabel: matchedOption?.title || '',
                        sublayers: svcInfo.layerOptions,
                        selectedIds: [firstLayer],
                        layersParam: firstLayer,
                        matrixSet: svcInfo.matrixSet,
                        style: svcInfo.style,
                        format: svcInfo.format,
                        version: svcInfo.version,
                        srs: svcInfo.srs,
                        queryable: false,
                    });
                    message?.info?.('已同步至图层面板「在线服务」分组', { duration: 2500 });
                    retireCustomBasemapInstance();
                } else {
                    message?.warning('该 WMTS 服务未解析到可用图层，或缺少 WebMercator 系标准矩阵集');
                }
            } else if (detected.kind === 'xyz') {
                // 标准 XYZ 模板：注册进「在线服务」分组（行序自动判定，tms 需手动改 yScheme）
                disableArcgisIdentify();
                let title = normalizedUrl;
                try {
                    const parsed = new URL(normalizedUrl);
                    title = `XYZ · ${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
                } catch {
                    /* URL 解析失败时退回原始地址 */
                }
                registerRemoteService({
                    kind: 'xyz',
                    url: normalizedUrl,
                    endpoint: normalizedUrl,
                    title,
                    selectedLayerId: '',
                    layerLabel: '',
                    sublayers: [],
                    selectedIds: [],
                    layersParam: '',
                    yScheme: detectTileYScheme(normalizedUrl),
                    queryable: false,
                });
                message?.info?.('已同步至图层面板「在线服务」分组', { duration: 2500 });
                retireCustomBasemapInstance();
            } else {
                // 非标准 XYZ / 矢量切片等：仍走原 custom 底图通道（渲染逻辑依赖底图工厂）
                disableArcgisIdentify();
            }

            return {
                success: true,
                message: successMessage,
                layerId: 'custom',
                kind: detected.kind,
                detail: detected.detail,
                url: normalizedUrl,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error || 'URL格式错误或无法解析');
            const failedMessage = `加载自定义图源失败: ${errorMessage}`;
            message?.error?.(failedMessage);
            return {
                success: false,
                message: failedMessage,
                layerId: 'custom',
                url: normalizedUrl,
            };
        }
    }

    /**
     * 统一接收图层切换与自定义 URL 加载
     */
    async function handleLayerChange(payload = {}) {
        const nextLayerId = String(payload.layerId || '').trim();
        const normalizedCustomUrl = String(payload.customUrl || '').trim();
        let customLoadResult = null;

        const isCustomUrlSelection =
            payload.source === 'custom-url' || payload.source === 'catalog';

        if (isCustomUrlSelection && customMapUrlRef) {
            customMapUrlRef.value = normalizedCustomUrl;
            if (customMapUrlRef.value) {
                customLoadResult = await loadCustomMap({ wmsLayers: payload.wmsLayers });
            } else {
                customLoadResult = {
                    success: false,
                    message: '自定义图源 URL 为空',
                    layerId: 'custom',
                };
            }

            if (customLoadResult?.success === false) {
                return {
                    success: false,
                    message: customLoadResult.message,
                    layerId: 'custom',
                    customLoadResult,
                };
            }
        }

        const resolvedLayerId = isCustomUrlSelection ? 'custom' : nextLayerId;
        if (resolvedLayerId) {
            applyBasemapSelection(resolvedLayerId);
        }

        if (resolvedLayerId === 'custom' && customMapUrlRef?.value && !isCustomUrlSelection) {
            customLoadResult = await loadCustomMap({ wmsLayers: payload.wmsLayers });
        }

        return {
            success: customLoadResult?.success ?? true,
            message: customLoadResult?.message || '图层状态已更新',
            layerId: resolvedLayerId || selectedLayerRef?.value || '',
            customUrl: resolvedLayerId === 'custom' ? String(customMapUrlRef?.value || '').trim() : '',
            customLoadResult,
        };
    }

    /**
     * 处理图层排序、可见性和透明度更新
     * [性能优化] 按操作类型走不同刷新路径，避免全量刷新
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
            // 排序需要全量刷新 zIndex
            refreshLayersState?.();
            return;
        }

        if (payload.type === 'visibility') {
            const target = list.find((item) => item.id === payload.layerId);
            if (!target) return;
            target.visible = !!payload.visible;

            // [Bug Fix] 当图层被设置为可见时，需要确保 source 已初始化。
            // 问题背景：switchLayerById 会调用 clearLayerSourceForced 清除非当前底图的 source，
            // 导致后续在面板中勾选图层时，即使设置了 visible = true，由于 source 已被清除，
            // 图层无法显示内容。
            // 解决方案：调用 refreshLayersState 确保所有图层的 source 被正确初始化，
            // 同时同步 zIndex 和可见性状态。
            if (target.visible) {
                refreshLayersState?.();
            } else {
                // 只设置 OL 图层可见性，不遍历全部图层（隐藏时无需初始化 source）
                const layer = layerInstances?.[payload.layerId];
                layer?.setVisible?.(false);
            }
            // 通知底图面板状态变化
            emitBaseLayersChange?.();
            return;
        }

        if (payload.type === 'opacity') {
            const layerId = String(payload.layerId);
            const opacity = Number(payload.opacity);
            if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return;

            const target = list.find((item) => item.id === layerId);
            if (!target) return;
            target.opacity = opacity;
            // 只设置 OL 图层透明度，最轻量路径
            const layer = layerInstances?.[layerId];
            layer?.setOpacity?.(opacity);
        }
    }

    return {
        loadCustomMap,
        handleLayerChange,
        handleLayerOrderUpdate,
    };
}
