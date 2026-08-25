/**
 * 瓦片源工厂 — WMS 源创建
 *
 * 支持 URL 形态：
 * - 标准 WMS（路径含 /wms 或 SERVICE=WMS 等参数）
 * - ArcGIS REST 服务端点（…/MapServer，自动探测换算 WMS 端点）
 * - GetMap 完整 URL（带 LAYERS 等参数直接采用）
 *
 * Capabilities 解析统一委托给 common/basemap/wmsService（OL/Cesium 共用）。
 */

import TileWMS from 'ol/source/TileWMS';
import XYZ from 'ol/source/XYZ';
import { DEFAULT_WMS_VERSION, type AutoTileSourceResult } from './types';
import { parseUrlSafe, getSearchParamCaseInsensitive, resolveServiceEndpoint } from './urlUtils';
import {
    ensureWmsServiceInfo,
    matchArcgisRestServiceUrl,
    buildArcgisExportTemplate,
    renderArcgisTileUrl,
} from '@common/basemap/wmsService';import { prioritizeTileSourceRequest } from './tileLifecycle';

export function detectWmsByUrl(urlObj: URL): boolean {
    const service = getSearchParamCaseInsensitive(urlObj, 'SERVICE').toUpperCase();
    const request = getSearchParamCaseInsensitive(urlObj, 'REQUEST').toUpperCase();
    if (service === 'WMS') return true;
    if (request === 'GETMAP' || request === 'GETCAPABILITIES') return true;
    if (/wms/i.test(urlObj.pathname)) return true;
    return false;
}

/**
 * 将 WMS CRS 代号映射为 OL 认识的投影。
 * 服务仅声明 EPSG:4326 时，必须把 source projection 一并设为 4326，
 * 否则 TileWMS 会用视图(3857)的米制 BBOX 冒充 4326 请求，导致出图错乱；
 * 设置后 OL 自动按源投影取图并在客户端重投影到视图。
 */
export function toOlProjection(crs: string): string | undefined {
    const normalized = String(crs || '')
        .trim()
        .toUpperCase()
        .replace(/^EPSG\//, 'EPSG:');
    if (/^(CRS:?84|EPSG:?4326|EPSG:?4258|EPSG:?4269)$/.test(normalized)) return 'EPSG:4326';
    if (/^(EPSG:?3857|EPSG:?900913|EPSG:?102100|EPSG:?102113|OSGEO:41001)$/.test(normalized)) {
        return 'EPSG:3857';
    }
    return undefined;
}

export function createTileWmsSource(opts: {
    url: string;
    params: Record<string, string>;
    projection?: string;
}): TileWMS {
    return new TileWMS({
        url: opts.url,
        params: opts.params,
        serverType: 'geoserver',
        transition: 0,
        ...(opts.projection ? { projection: opts.projection } : {}),
    });
}

function createWmsSourceFromGetMapUrl(urlObj: URL): TileWMS {
    const endpoint = `${urlObj.origin}${urlObj.pathname}`;
    const params: Record<string, string> = {};

    for (const [k, v] of urlObj.searchParams.entries()) {
        params[k.toUpperCase()] = v;
    }

    const crsParam = params.SRS || params.CRS || '';
    return createTileWmsSource({ url: endpoint, params, projection: toOlProjection(crsParam) });
}

export async function createWmsSourceStrict(
    rawUrl: string,
    options: { preferredLayers?: string } = {},
): Promise<AutoTileSourceResult> {
    const parsed = parseUrlSafe(rawUrl);
    const isDirectWms = Boolean(parsed && detectWmsByUrl(parsed));
    if (!isDirectWms && !matchArcgisRestServiceUrl(rawUrl)) {
        throw new Error('未识别为 WMS 服务');
    }

    // GetMap 完整 URL：参数齐全，直接采用
    const request = parsed ? getSearchParamCaseInsensitive(parsed, 'REQUEST').toUpperCase() : '';
    if (request === 'GETMAP') {
        return {
            source: prioritizeTileSourceRequest(createWmsSourceFromGetMapUrl(parsed!)),
            kind: 'wms',
            detail: 'WMS GetMap',
        };
    }

    // 其余统一走通用解析器（内部处理标准 WMS 与 ArcGIS REST 端点，含缓存）
    const info = await ensureWmsServiceInfo(rawUrl);
    if (!info || !info.layerOptions?.length) {
        throw new Error('服务元数据解析失败或未找到可用图层');
    }

    // ArcGIS 原生协议
    if (info.arcgis) {
        // 切片缓存（标准墨卡托网格）：直连 /tile/{z}/{y}/{x}。
        // 不套 prioritize 生命周期 —— 缺失瓦片的 404 属常态，若走 fetch 包装会触发后端代理回退造成双倍无效请求。
        const selectedLayer = String(options.preferredLayers ?? '').trim();
        if (info.tileMode === 'tiles') {
            const maxLevel = Number.isFinite(info.maxLevel) ? Number(info.maxLevel) : undefined;
            return {
                source: new XYZ({
                    url: `${String(info.endpoint).replace(/\/+$/, '')}/tile/{z}/{y}/{x}`,
                    maxZoom: maxLevel ?? 22,
                    transition: 0,
                }),
                kind: 'wms',
                detail: `ArcGIS 切片缓存${selectedLayer ? `: ${selectedLayer}` : ''}`,
            };
        }
        // 动态出图（export）
        const template = buildArcgisExportTemplate(info, selectedLayer);
        return {
            source: prioritizeTileSourceRequest(
                new XYZ({
                    tileUrlFunction: ([z, x, y]: number[]) => renderArcgisTileUrl(template, z, x, y),
                    maxZoom: 24,
                    transition: 0,
                }),
            ),
            kind: 'wms',
            detail: `ArcGIS 动态图层${selectedLayer ? `: ${selectedLayer}` : ': 全部可见'}`,
        };
    }

    const layerName = String(options.preferredLayers || '').trim() || info.layers;
    const version = String(info.version || DEFAULT_WMS_VERSION);
    const preferredCrs = info.srs || 'EPSG:3857';
    const endpoint = resolveServiceEndpoint(String(info.endpoint || ''), rawUrl);

    const params: Record<string, string> = {
        LAYERS: layerName,
        STYLES: '',
        FORMAT: String(info.format || 'image/png'),
        TRANSPARENT: 'true',
        VERSION: version,
    };

    if (version === '1.3.0') {
        params.CRS = preferredCrs;
    } else {
        params.SRS = preferredCrs;
    }

    return {
        source: createTileWmsSource({
            url: endpoint,
            params,
            projection: toOlProjection(preferredCrs),
        }),
        kind: 'wms',
        detail: `WMS 图层: ${layerName}`,
    };
}
