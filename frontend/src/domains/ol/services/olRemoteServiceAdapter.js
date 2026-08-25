/**
 * olRemoteServiceAdapter.js
 * 在线服务注册表 → OL 图层渲染适配器。
 *
 * 职责：watch 注册表 records，双向同步图层生命周期：
 * - 新增记录 → 按类型构建 source（WMS TileWMS / ArcGIS 切片 XYZ / ArcGIS 动态 export XYZ）
 * - 更新记录 → 同步 visible / opacity / zIndex（在线服务子带 100~149，见 zIndexBands）
 * - 删除记录 → 移除地图图层并清理本地句柄
 *
 * 由 MapContainer 挂载；flyTo 供 TOC「缩放到范围」动作调用。
 */

import { watch } from 'vue';
import { XYZ } from 'ol/source';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import TileLayer from 'ol/layer/Tile';
import { transformExtent } from 'ol/proj';
import {
    useRemoteServices,
    computeLayersParam,
    renderSignature,
    usesPerSublayerRequests,
    visualOrderedSublayerIds,
    registerRsvcEngineApi,
    unregisterRsvcEngineApi,
} from '@common/basemap/remoteServices';
import { detectTileYScheme } from '@common/basemap/xyzWmtsCapabilities';
import { buildArcgisExportTemplate, renderArcgisTileUrl } from '@common/basemap/wmsService';
import { createTileWmsSource, toOlProjection } from '@ol/tile-source/index';
import { Z_BAND } from '@ol/layer/zIndexBands';

const REMOTE_CAPACITY = 50; // 在线服务子带容量上限（100~149），见 zIndexBands 注释
// 拆分渲染时单条记录最多占用的子带槽数（子图层各自独立请求 + zIndex 排序）
const SPLIT_SLOTS = 20;

// WMTS Capabilities 进程内缓存：capsUrl → Promise<解析后文档>（渲染期拉取，不入持久化）
const wmtsCapsCache = new Map();
const wmtsPending = new Set(); // `${recordId}:${signature}` 防重复异步建源

function stripTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
}

/**
 * 记录 → OL Source（与自定义底图构建逻辑同源）
 * @returns {ol.Source|null} xyz/wms/arcgis 返回同步构建的源；wmtS 返回 null（走异步 buildWmtsSourceAsync）
 */
function buildSourceForRecord(record) {
    const selected = computeLayersParam(record);

    // 标准 XYZ 瓦片（含 ArcGIS 行序 zyx 与 TMS 南起 y 反算）
    if (record.kind === 'xyz') {
        let template = String(record.endpoint || record.url || '');
        const scheme = record.yScheme || detectTileYScheme(template);
        // OL 的 XYZ 源对 {z}{x}{y} 占位符的出现顺序不敏感，zyx 无需换位；
        // 仅 tms 需要 {y} → {-y}（OL 原生支持南起 y 反算占位符）
        if (scheme === 'tms') template = template.replace(/\{y\}/g, '{-y}');
        return new XYZ({
            url: template,
            maxZoom: Number.isFinite(record.maxLevel) ? Number(record.maxLevel) : 22,
            transition: 0,
            crossOrigin: 'anonymous',
        });
    }

    if (record.kind === 'arcgis') {
        if (record.tileMode === 'tiles') {
            return new XYZ({
                url: `${stripTrailingSlash(record.endpoint)}/tile/{z}/{y}/{x}`,
                maxZoom: Number.isFinite(record.maxLevel) ? Number(record.maxLevel) : 22,
                transition: 0,
            });
        }
        // 动态 export：按瓦片坐标填充米制 bbox（模板由 common 构建器产出）
        // computeLayersParam 产出带 "show:" 前缀，模板内部会再拼一次前缀，须先剥除
        const template = buildArcgisExportTemplate(
            { endpoint: record.endpoint, format: record.format },
            selected.replace(/^show:/, ''),
        );
        return new XYZ({
            tileUrlFunction: (tileCoord) => renderArcgisTileUrl(template, tileCoord[0], tileCoord[1], tileCoord[2]),
            maxZoom: 24,
            transition: 0,
        });
    }

    // 标准 WMS
    const version = String(record.version || '1.1.1');
    const params = {
        LAYERS: selected,
        STYLES: '',
        FORMAT: String(record.format || 'image/png'),
        TRANSPARENT: 'true',
        VERSION: version,
    };
    if (version === '1.3.0') params.CRS = String(record.srs || 'EPSG:3857');
    else params.SRS = String(record.srs || 'EPSG:3857');

    return createTileWmsSource({
        url: stripTrailingSlash(record.endpoint),
        params,
        projection: toOlProjection(record.srs),
    });
}

const wmtsParser = new WMTSCapabilities();

/** 拉取并解析 WMTS Capabilities（进程内缓存，同地址并发共享同一 Promise） */
function fetchWmtsDoc(record) {
    const base = stripTrailingSlash(record.endpoint || record.url);
    const version = String(record.version || '1.0.0');
    const capsUrl = `${base}?SERVICE=WMTS&VERSION=${version}&REQUEST=GetCapabilities`;
    if (!wmtsCapsCache.has(capsUrl)) {
        wmtsCapsCache.set(
            capsUrl,
            fetch(capsUrl)
                .then(async (res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return wmtsParser.read(await res.text());
                })
                .catch((error) => {
                    wmtsCapsCache.delete(capsUrl); // 失败不缓存，允许重试
                    throw error;
                }),
        );
    }
    return wmtsCapsCache.get(capsUrl);
}

/**
 * 异步构建 WMTS 源：Capabilities 解析后经 optionsFromCapabilities 构建，
 * 校验矩阵集投影与视图投影匹配（非匹配则沿 3857 系候选链回退）。
 * @returns {Promise<ol.source.WMTS>}
 */
async function buildWmtsSourceAsync(record, map) {
    const doc = await fetchWmtsDoc(record);
    const viewProj = map.getView()?.getProjection();
    const candidates = [record.matrixSet, 'EPSG:3857', 'urn:ogc:def:crs:EPSG::3857', 'GoogleMapsCompatible']
        .filter(Boolean);
    let lastError = null;
    for (const matrixSet of candidates) {
        try {
            const options = optionsFromCapabilities(doc, {
                layer: computeLayersParam(record),
                matrixSet,
            });
            const srcProjCode = options.projection?.getCode?.() || '';
            const viewCode = viewProj?.getCode?.() || '';
            // 投影匹配：视图无投影信息时放行；否则要求代码一致或同为 3857 系
            if (viewCode && !/3857/.test(srcProjCode) && srcProjCode !== viewCode) {
                lastError = new Error(`矩阵集 ${matrixSet} 投影 ${srcProjCode} 与视图 ${viewCode} 不匹配`);
                continue;
            }
            options.transition = 0;
            options.crossOrigin = 'anonymous';
            return new WMTS(options);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('WMTS 无可用 TileMatrixSet');
}

export function createOlRemoteServiceAdapter({ mapInstanceRef }) {
    const store = useRemoteServices();
    const layerMap = new Map(); // recordId → ol Layer
    const signatureMap = new Map(); // recordId → renderSignature

    /** WMTS 异步建源调度：同签名去重，源就绪且记录仍存活时才落 setSource */
    function scheduleWmtsSource(record, signature, layer) {
        const key = `${record.id}:${signature}`;
        if (wmtsPending.has(key)) return;
        wmtsPending.add(key);
        const map = mapInstanceRef?.value;
        buildWmtsSourceAsync(record, map)
            .then((source) => {
                if (layerMap.get(record.id) === layer && signatureMap.get(record.id) === signature) {
                    layer.setSource(source);
                }
            })
            .catch((error) => console.warn('[RemoteServices] WMTS 源构建失败:', error))
            .finally(() => wmtsPending.delete(key));
    }

    /** 单条 arcgis 动态子图层 → export XYZ source（每子图层独立请求） */
    function buildArcgisSublayerSource(record, sublayerId) {
        const template = buildArcgisExportTemplate(
            { endpoint: record.endpoint, format: record.format },
            sublayerId,
        );
        return new XYZ({
            tileUrlFunction: (tileCoord) => renderArcgisTileUrl(template, tileCoord[0], tileCoord[1], tileCoord[2]),
            maxZoom: 24,
            transition: 0,
        });
    }

    /** zIndex：records 头部（TOC 列表上方）= 视觉上层，反向映射 */
    function bandZIndex(index, recordsCount) {
        return Z_BAND.REMOTE_SERVICES + Math.min(recordsCount - 1 - index, REMOTE_CAPACITY - 1);
    }

    /** 拆分渲染子图层带内 zIndex：视觉序 0（最上）→ 最高值；+0.5 避免与其它服务整带值碰撞 */
    function splitZIndex(bandValue, visualIndex) {
        return bandValue + (SPLIT_SLOTS - 1 - Math.min(visualIndex, SPLIT_SLOTS - 1)) + 0.5;
    }

    /**
     * 同步单条记录的图层集合。
     * layerMap 值：常规 kind = 单条 Layer；arcgis 动态 = Layer[]（每勾选子图层一条）。
     * ArcGIS 动态 LAYERS=show:x 只做过滤、服务端忽略列表顺序，叠放次序必须由客户端
     * zIndex 表达 → 拆分渲染；签名变化时整组移除重建。
     */
    function syncRecord(record, index, recordsCount) {
        const map = mapInstanceRef?.value;
        if (!map) return;
        const signature = renderSignature(record);
        let entry = layerMap.get(record.id);

        // 渲染要素变化（如子图层勾选组合改变）→ 整组重建
        if (entry && signatureMap.get(record.id) !== signature) {
            (Array.isArray(entry) ? entry : [entry]).forEach((item) => map.removeLayer(item));
            layerMap.delete(record.id);
            entry = undefined;
        }

        if (!entry) {
            // arcgis 动态：拆分渲染，每个勾选子图层独立 export 请求 + 独立 zIndex
            if (usesPerSublayerRequests(record)) {
                const orderedIds = visualOrderedSublayerIds(record);
                if (!orderedIds.length) return;
                const layers = orderedIds.map((subId, visualIndex) => new TileLayer({
                    source: buildArcgisSublayerSource(record, subId),
                    visible: record.visible !== false,
                    opacity: Number.isFinite(record.opacity) ? record.opacity : 1,
                    zIndex: splitZIndex(bandZIndex(index, recordsCount), visualIndex),
                    properties: { remoteServiceId: record.id, rsvcSublayerId: subId },
                }));
                layers.forEach((layer) => map.addLayer(layer));
                layerMap.set(record.id, layers);
                signatureMap.set(record.id, signature);
                return;
            }
            // WMTS 建源是异步的：先落无源占位图层，Capabilities 就绪后 setSource
            if (record.kind === 'wmts') {
                const layer = new TileLayer({
                    visible: record.visible !== false,
                    opacity: Number.isFinite(record.opacity) ? record.opacity : 1,
                    zIndex: bandZIndex(index, recordsCount),
                    properties: { remoteServiceId: record.id },
                });
                map.addLayer(layer);
                layerMap.set(record.id, layer);
                signatureMap.set(record.id, signature);
                scheduleWmtsSource(record, signature, layer);
                return;
            }
            let source;
            try {
                source = buildSourceForRecord(record);
            } catch (error) {
                console.warn('[RemoteServices] source 构建失败:', error);
                return;
            }
            const layer = new TileLayer({
                source,
                visible: record.visible !== false,
                opacity: Number.isFinite(record.opacity) ? record.opacity : 1,
                zIndex: bandZIndex(index, recordsCount),
                properties: { remoteServiceId: record.id },
            });
            map.addLayer(layer);
            layerMap.set(record.id, layer);
            signatureMap.set(record.id, signature);
            return;
        }

        // 已有图层集合：仅同步显隐 / 透明度 / zIndex（签名变化已在上方整体重建）
        (Array.isArray(entry) ? entry : [entry]).forEach((layer, splitIndex) => {
            if (layer.getVisible() !== record.visible) layer.setVisible(record.visible !== false);
            if (Math.abs((layer.getOpacity() ?? 1) - (record.opacity ?? 1)) > 0.001) {
                layer.setOpacity(Number.isFinite(record.opacity) ? record.opacity : 1);
            }
            const targetZIndex = Array.isArray(entry)
                ? splitZIndex(bandZIndex(index, recordsCount), splitIndex)
                : bandZIndex(index, recordsCount);
            if (layer.getZIndex() !== targetZIndex) layer.setZIndex(targetZIndex);
        });
    }

    function reconcile(records) {
        const map = mapInstanceRef?.value;
        if (!map) return;

        const aliveIds = new Set(records.map((item) => item.id));
        for (const [id, entry] of layerMap) {
            if (!aliveIds.has(id)) {
                (Array.isArray(entry) ? entry : [entry]).forEach((layer) => map.removeLayer(layer));
                layerMap.delete(id);
            }
        }
        records.forEach((record, index) => syncRecord(record, index, records.length));
    }

    // 双 watch 生命周期：地图就绪补挂 + 注册表记录同步，dispose 时一并停止
    const stopWatches = [];
    // 地图就绪补挂：adapter 在 setup 阶段创建（早于 onMounted 中 new Map），
    // records watch 的首次执行必然 no-op；刷新页面后 localStorage 恢复的服务
    // 若无此回调将永远不会上图。地图实例就绪时主动补一次 reconcile。
    stopWatches.push(watch(mapInstanceRef, (map) => {
        if (map) reconcile(store.records.value || []);
    }));
    stopWatches.push(watch(
        () => store.records.value,
        (next) => reconcile(next || []),
        { deep: true, immediate: true },
    ));

    const adapter = {
        /** TOC「缩放到范围」：定位到服务声明的地理范围（入参为 serviceId，不含 rsvc: 前缀） */
        zoomTo(id) {
            const map = mapInstanceRef?.value;
            const record = store.getRemoteService(String(id || ''));
            if (!map || !record?.geographicBbox) return false;
            const view = map.getView();
            try {
                view.fit(transformExtent(record.geographicBbox, 'EPSG:4326', view.getProjection()), {
                    size: map.getSize?.(),
                    padding: [60, 60, 60, 60],
                    maxZoom: 18,
                    duration: 600,
                });
                return true;
            } catch {
                return false;
            }
        },
        dispose() {
            stopWatches.forEach((stop) => {
                if (typeof stop === 'function') stop();
            });
            stopWatches.length = 0;
            unregisterRsvcEngineApi('ol');
            const map = mapInstanceRef?.value;
            if (!map) return;
            for (const [, entry] of layerMap) {
                (Array.isArray(entry) ? entry : [entry]).forEach((layer) => map.removeLayer(layer));
            }
            layerMap.clear();
            signatureMap.clear();
        },
    };

    // 注册引擎定位 API：TOC「缩放至图层」经 rsvcEngineApi 分发到本适配器
    registerRsvcEngineApi('ol', { zoomTo: (id) => adapter.zoomTo(id) });
    return adapter;
}
