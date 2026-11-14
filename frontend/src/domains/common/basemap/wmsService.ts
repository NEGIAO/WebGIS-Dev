/**
 * 通用 WMS / ArcGIS 服务元数据解析入口 — 引擎无关（OL / Cesium 共用）
 *
 * 本文件只做编排与缓存，协议实现按职责分层在同目录 `wms/` 下：
 * - `wms/urlDetect`  URL 形态识别与查询参数工具（无请求）
 * - `wms/geoBbox`    经纬度 bbox 校验/并集、Web 墨卡托换算
 * - `wms/transport`  Capabilities 文本 / 点查 JSON 取数通道（超时 + 代理兜底）
 * - `wms/capabilities` WMS GetCapabilities XML 解析
 * - `wms/arcgisRest` ArcGIS REST 元数据、点查、切片/导出模板、WMS 端点探测
 * - `wms/types`      元信息与请求策略的公共契约
 *
 * 服务解析顺序：URL 自带 LAYERS → WMS Capabilities → ArcGIS REST（f=json → WMS 探测）。
 * 注意：common 域不得反向依赖 @ol，XML 解析一律用 DOMParser。
 */

import { parseCapabilitiesXml, resolveCrsStrategy } from './wms/capabilities';
import { parseArcgisServiceJson, probeArcgisWmsEndpoint } from './wms/arcgisRest';
import { fetchCapabilitiesText } from './wms/transport';
import {
    buildArcgisProbePaths,
    isWmsServiceUrl,
    matchArcgisRestServiceUrl,
    queryValueIgnoreCase,
    setParamIgnoreCase,
} from './wms/urlDetect';
import type { WmsServiceInfo } from './wms/types';

const WMS_INFO_CACHE = new Map<string, WmsServiceInfo>();

// ── 公共 API（对外路径 @common/basemap/wmsService 保持不变） ──
export {
    buildArcgisExportTemplate,
    buildArcgisTileTemplate,
    identifyArcgisFeatures,
    queryArcgisLayerAtPoint,
    queryCandidateAtPoint,
    renderArcgisTileUrl,
} from './wms/arcgisRest';
export { isWmsServiceUrl, looksLikeWmsSourceUrl, matchArcgisRestServiceUrl } from './wms/urlDetect';
export type { ServiceRequestOptions, WmsLayerOption, WmsServiceInfo } from './wms/types';

function buildInfoFromQuery(urlObj: URL): WmsServiceInfo | null {
    const layers =
        queryValueIgnoreCase(urlObj, 'LAYERS') || queryValueIgnoreCase(urlObj, 'LAYERNAMES');
    if (!layers) return null;

    const explicitVersion = queryValueIgnoreCase(urlObj, 'VERSION') || '1.1.1';
    const explicitFormat = queryValueIgnoreCase(urlObj, 'FORMAT') || 'image/png';
    const explicitSrs =
        queryValueIgnoreCase(urlObj, 'SRS') || queryValueIgnoreCase(urlObj, 'CRS') || '';

    const strategy = resolveCrsStrategy([], explicitSrs);
    return {
        layers,
        title: '',
        layerOptions: [],
        version: explicitVersion,
        format: explicitFormat,
        crsList: strategy.srs ? [strategy.srs] : [],
        ...strategy,
        endpoint: `${urlObj.origin}${urlObj.pathname}`,
        source: 'query',
    };
}

export async function ensureWmsServiceInfo(rawUrl: string): Promise<WmsServiceInfo | null> {
    const source = String(rawUrl || '').trim();
    if (!source) return null;

    let urlObj: URL;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        urlObj = new URL(source, base);
    } catch {
        return null;
    }

    const cacheKey = `${urlObj.origin}${urlObj.pathname}?${urlObj.searchParams.toString()}`;
    if (WMS_INFO_CACHE.has(cacheKey)) {
        return WMS_INFO_CACHE.get(cacheKey) ?? null;
    }

    try {
        let info = buildInfoFromQuery(urlObj);

        // 场景1：URL 已带 LAYERS 参数，直接采用
        if (!info && isWmsServiceUrl(source)) {
            const capabilitiesUrl = new URL(`${urlObj.origin}${urlObj.pathname}`);
            setParamIgnoreCase(capabilitiesUrl.searchParams, 'SERVICE', 'WMS');
            setParamIgnoreCase(capabilitiesUrl.searchParams, 'REQUEST', 'GetCapabilities');
            const xmlText = await fetchCapabilitiesText(capabilitiesUrl.toString());
            info = parseCapabilitiesXml(xmlText, `${urlObj.origin}${urlObj.pathname}`);
        }

        // 场景2：ArcGIS REST 端点（…/MapServer）
        // 优先原生协议（f=json 元数据 + export 动态出图，与 ArcGIS Pro 同源，仅需 Map 能力）；
        // 原样与「插入 /rest/ 段」两个路径变体逐一探测；均失败时回退 WMS 端点探测
        const matched = info ? null : matchArcgisRestServiceUrl(source);
        if (matched) {
            const probePaths = buildArcgisProbePaths(matched.servicePath);
            for (const path of probePaths) {
                const serviceBase = `${matched.origin}${path}`;
                try {
                    const jsonText = await fetchCapabilitiesText(`${serviceBase}?f=json`);
                    info = parseArcgisServiceJson(jsonText, serviceBase);
                    break; // 该变体可达且元数据有效 → endpoint 固定为此基址
                } catch (jsonError: unknown) {
                    const msg = jsonError instanceof Error ? jsonError.message : jsonError;
                    console.warn('[wmsService] ArcGIS f=json 探测失败，尝试下一变体:', path, msg);
                }
            }
            if (!info) {
                const probed = await probeArcgisWmsEndpoint(source);
                if (!probed) {
                    throw new Error('该 ArcGIS 服务无法访问（REST 与 WMS 均不可达）');
                }
                info = parseCapabilitiesXml(probed.xmlText, probed.endpoint);
            }
        }

        if (!info) return null;

        WMS_INFO_CACHE.set(cacheKey, info);
        return info;
    } catch (error) {
        console.warn('[wmsService] 解析 WMS 服务失败:', error);
        WMS_INFO_CACHE.delete(cacheKey);
        return null;
    }
}

/**
 * 同步读取已缓存的 WMS 服务元信息
 * @param rawUrl WMS / ArcGIS 服务地址
 * @returns 命中缓存的元信息；未解析过返回 null
 */
export function getCachedWmsInfo(rawUrl: string): WmsServiceInfo | null {
    const source = String(rawUrl || '').trim();
    if (!source) return null;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const urlObj = new URL(source, base);
        const cacheKey = `${urlObj.origin}${urlObj.pathname}?${urlObj.searchParams.toString()}`;
        return WMS_INFO_CACHE.get(cacheKey) || null;
    } catch {
        return null;
    }
}
