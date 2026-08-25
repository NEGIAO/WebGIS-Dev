/**
 * cesiumRemoteServiceAdapter.js
 * 在线服务注册表 → Cesium ImageryLayer 渲染适配器（与 OL 适配器同构）。
 *
 * 职责：watch 注册表 records，双向同步：
 * - 新增 → 按类型构建 Provider（WMS / ArcGIS 切片 / ArcGIS 动态 export）
 * - 更新 → 同步 show / alpha；渲染签名变化时重建 Provider
 * - 删除 → viewer.imageryLayers.remove
 * 叠放顺序：records 数组顺序即服务间叠放次序，整体位于当前底图之上。
 */

import { watch } from 'vue';
import {
    useRemoteServices,
    computeLayersParam,
    renderSignature,
    usesPerSublayerRequests,
    visualOrderedSublayerIds,
    registerRsvcEngineApi,
    unregisterRsvcEngineApi,
} from '@common/basemap/remoteServices';
import { buildArcgisExportTemplate } from '@common/basemap/wmsService';

const MERCATOR_HALF = 20037508.342789244;
// 容量上限由 zIndexBands 在线服务子带（100~149）约束，Cesium 侧无 zIndex 限制

function stripTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
}

/** bbox 占位符数值计算（北起 y） */
function bboxParts(z, x, y) {
    const extentSize = (2 * MERCATOR_HALF) / 2 ** z;
    const minx = -MERCATOR_HALF + x * extentSize;
    const maxx = minx + extentSize;
    const maxy = MERCATOR_HALF - y * extentSize;
    return { minx, miny: maxy - extentSize, maxx, maxy };
}

/** 记录 → 渲染签名：任一要素变化即重建 Provider（共享实现，见 remoteServices.ts） */

function buildProvider(Cesium, record) {
    const endpoint = stripTrailingSlash(record.endpoint);
    const layersParam = computeLayersParam(record);

    // 标准 XYZ 瓦片（含 ArcGIS 行序 zyx 与 TMS 南起 y 反算）
    if (record.kind === 'xyz') {
        // UrlTemplateImageryProvider 按 {x}/{y} 具名 token 替换、与出现顺序无关，
        // zyx 模板 {z}/{y}/{x} 原样传入即可正确出图，禁止做占位符换位
        const url = String(record.url || endpoint || '');
        const scheme = record.yScheme || 'zxy';
        // tms：南起 y 反算经 customTags 覆盖 {y} token
        const tmsOptions = scheme === 'tms'
            ? { customTags: { y: (_tile, x, y, level) => 2 ** level - 1 - Number(y) } }
            : {};
        return new Cesium.UrlTemplateImageryProvider({
            url,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: Number.isFinite(record.maxLevel) ? Number(record.maxLevel) : 22,
            enablePickFeatures: false,
            ...tmsOptions,
        });
    }

    // WMTS（限 WebMercator 系标准四叉树矩阵集，注册阶段已过滤）
    if (record.kind === 'wmts') {
        if (typeof Cesium.WebMapTileServiceImageryProvider !== 'function') return null;
        return new Cesium.WebMapTileServiceImageryProvider({
            url: endpoint,
            layer: layersParam,
            style: record.style || '',
            format: record.format || 'image/png',
            tileMatrixSetID: record.matrixSet || 'EPSG:3857',
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: Number.isFinite(record.maxLevel) ? Number(record.maxLevel) : 22,
        });
    }

    // 标准 WMS
    if (record.kind === 'wms') {
        if (typeof Cesium.WebMapServiceImageryProvider !== 'function') return null;
        const version = String(record.version || '1.1.1');
        const parameters = {
            service: 'WMS',
            version,
            request: 'GetMap',
            styles: '',
            format: record.format || 'image/png',
            transparent: true,
            [version.startsWith('1.3') ? 'crs' : 'srs']: record.srs || 'EPSG:3857',
        };
        return new Cesium.WebMapServiceImageryProvider({
            url: endpoint,
            layers: layersParam,
            parameters,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            enablePickFeatures: false,
        });
    }

    // ArcGIS 切片缓存
    if (record.tileMode === 'tiles') {
        return new Cesium.UrlTemplateImageryProvider({
            url: `${endpoint}/tile/{z}/{y}/{x}`,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: Number.isFinite(record.maxLevel) ? Number(record.maxLevel) : 24,
            enablePickFeatures: false,
        });
    }

    // ArcGIS 动态 export（拆分渲染时 sublayerId 非空：单子图层独立请求）
    const bareIds = layersParam.replace(/^show:/, '');
    const template = buildArcgisExportTemplate(
        { endpoint, format: record.format },
        bareIds,
    );
    return new Cesium.UrlTemplateImageryProvider({
        url: template,
        customTags: {
            minx: (_, x, y, z) => bboxParts(z, x, y).minx.toFixed(2),
            miny: (_, x, y, z) => bboxParts(z, x, y).miny.toFixed(2),
            maxx: (_, x, y, z) => bboxParts(z, x, y).maxx.toFixed(2),
            maxy: (_, x, y, z) => bboxParts(z, x, y).maxy.toFixed(2),
            w: () => '256',
            h: () => '256',
        },
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: 24,
        enablePickFeatures: false,
    });
}

/** 单条 arcgis 动态子图层 → 独立 export Provider（每子图层一个请求） */
function buildSublayerProvider(Cesium, record, sublayerId) {
    const template = buildArcgisExportTemplate(
        { endpoint: stripTrailingSlash(record.endpoint), format: record.format },
        sublayerId,
    );
    return new Cesium.UrlTemplateImageryProvider({
        url: template,
        customTags: {
            minx: (_, x, y, z) => bboxParts(z, x, y).minx.toFixed(2),
            miny: (_, x, y, z) => bboxParts(z, x, y).miny.toFixed(2),
            maxx: (_, x, y, z) => bboxParts(z, x, y).maxx.toFixed(2),
            maxy: (_, x, y, z) => bboxParts(z, x, y).maxy.toFixed(2),
            w: () => '256',
            h: () => '256',
        },
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: 24,
        enablePickFeatures: false,
    });
}

export function createCesiumRemoteServiceAdapter({ getViewer, getCesium }) {
    const store = useRemoteServices();
    // recordId → entry（单请求渲染）或 ImageryLayer[]（arcgis 拆分渲染）
    const layerHandles = new Map();

    /** 拆分渲染：每个勾选子图层一条 ImageryLayer，叠放次序由 imageryLayers 层序表达 */
    function createSplitEntry(Cesium, record) {
        const viewer = getViewer?.();
        const orderedIds = visualOrderedSublayerIds(record);
        if (!orderedIds.length) return [];
        // 视觉序 0（最上）最后 add → Cesium 后加者在上
        const orderedBottomFirst = [...orderedIds].reverse();
        const created = [];
        for (const subId of orderedBottomFirst) {
            let provider;
            try {
                provider = buildSublayerProvider(Cesium, record, subId);
            } catch (error) {
                console.warn('[RemoteServices][Cesium] 子图层 Provider 构建失败:', error);
                continue;
            }
            if (!provider) continue;
            const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
            imageryLayer.show = record.visible !== false;
            imageryLayer.alpha = Number.isFinite(record.opacity) ? record.opacity : 1;
            created.push(imageryLayer);
        }
        return created;
    }

    function syncRecord(record) {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer?.imageryLayers || !Cesium) return;

        let entry = layerHandles.get(record.id);
        const signature = renderSignature(record);
        const isSplit = usesPerSublayerRequests(record);

        if (entry && (entry.signature !== signature || entry.split !== isSplit)) {
            for (const layer of entry.layers) viewer.imageryLayers.remove(layer, true);
            layerHandles.delete(record.id);
            entry = null;
        }

        if (!entry) {
            let layers;
            if (isSplit) {
                layers = createSplitEntry(Cesium, record);
                if (!layers.length) return;
            } else {
                let provider;
                try {
                    provider = buildProvider(Cesium, record);
                } catch (error) {
                    console.warn('[RemoteServices][Cesium] Provider 构建失败:', error);
                    return;
                }
                if (!provider) return;
                const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
                imageryLayer.show = record.visible !== false;
                imageryLayer.alpha = Number.isFinite(record.opacity) ? record.opacity : 1;
                layers = [imageryLayer];
            }
            layerHandles.set(record.id, { layers, signature, split: isSplit });
            return;
        }

        for (const layer of entry.layers) {
            layer.show = record.visible !== false;
            layer.alpha = Number.isFinite(record.opacity) ? record.opacity : 1;
        }
    }

    /**
     * 按记录数组顺序整体重排：尾→头逐个 raiseToTop，列表头部（TOC 上方）最后置顶 = 视觉上层，
     * 与 OL 端 zIndex 反向映射及用户图层/子图层排序惯例一致。
     * 拆分条目整组连续搬运，组内视觉次序保持不变。
     */
    function restack(records) {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers) return;
        for (let i = records.length - 1; i >= 0; i--) {
            const entry = layerHandles.get(records[i].id);
            if (!entry) continue;
            // 组内自底向上逐个 raiseToTop，整组相对次序不变且位于当前最顶
            for (let j = 0; j < entry.layers.length; j++) {
                viewer.imageryLayers.raiseToTop(entry.layers[j]);
            }
        }
    }

    function reconcile(records) {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers) return;

        const aliveIds = new Set(records.map((item) => item.id));
        for (const [id, entry] of layerHandles) {
            if (!aliveIds.has(id)) {
                viewer.imageryLayers.remove(entry.imageryLayer, true);
                layerHandles.delete(id);
            }
        }
        records.forEach((record) => syncRecord(record));
        restack(records);
    }

    let stopWatch = null;
    stopWatch = watch(
        () => store.records.value,
        (next) => reconcile(next || []),
        { deep: true, immediate: true },
    );

    // viewer 就绪自愈：适配器可能在 viewer 创建前挂载（如引擎切换时序），
    // 就绪瞬间补一次 reconcile，保证注册表服务必然上图
    let stopViewerWatch = null;
    stopViewerWatch = watch(
        () => !!getViewer?.()?.imageryLayers,
        (ready) => {
            if (ready) reconcile(store.records.value || []);
        },
        { immediate: true },
    );

    const adapter = {
        zoomTo(id) {
            return this.flyTo(id);
        },
        flyTo(id) {
            const viewer = getViewer?.();
            const Cesium = getCesium?.();
            const record = store.getRemoteService(String(id || '').replace('rsvc:', ''));
            if (!viewer?.camera || !Cesium?.Rectangle?.fromDegrees || !record?.geographicBbox) return false;
            const [w, s, e, n] = record.geographicBbox;
            viewer.camera.flyTo({
                destination: Cesium.Rectangle.fromDegrees(w, s, e, n),
                duration: 1.5,
            });
            return true;
        },
        dispose() {
            if (typeof stopWatch === 'function') stopWatch();
            if (typeof stopViewerWatch === 'function') stopViewerWatch();
            unregisterRsvcEngineApi('cesium');
            const viewer = getViewer?.();
            if (viewer?.imageryLayers) {
                for (const [, entry] of layerHandles) {
                    try {
                        viewer.imageryLayers.remove(entry.imageryLayer, true);
                    } catch {
                        /* ignore */
                    }
                }
            }
            layerHandles.clear();
        },
    };

    registerRsvcEngineApi('cesium', { zoomTo: (id) => adapter.zoomTo(id) });
    return adapter;
}
