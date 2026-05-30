/**
 * 瓦片源工厂 — WMS 源创建
 *
 * 从 useTileSourceFactory.ts 拆分。
 */

import TileWMS from 'ol/source/TileWMS';
import WMSCapabilities from 'ol/format/WMSCapabilities';
import { DEFAULT_WMS_VERSION, type AutoTileSourceResult } from './types';
import {
    parseUrlSafe,
    getSearchParamCaseInsensitive,
    resolveServiceEndpoint,
    createCapabilitiesUrl,
    fetchTextWithTimeout,
} from './urlUtils';
import { prioritizeTileSourceRequest } from './tileLifecycle';

function pickPreferredWmsCrs(layer: any): string {
    const crsList = layer?.CRS || layer?.SRS || [];
    if (Array.isArray(crsList)) {
        if (crsList.includes('EPSG:3857')) return 'EPSG:3857';
        if (crsList.includes('EPSG:4326')) return 'EPSG:4326';
        return crsList[0] || 'EPSG:3857';
    }
    return String(crsList || 'EPSG:3857');
}

function findFirstNamedWmsLayer(layer: any): any | null {
    if (!layer) return null;
    if (layer.Name) return layer;
    if (Array.isArray(layer.Layer)) {
        for (const child of layer.Layer) {
            const found = findFirstNamedWmsLayer(child);
            if (found) return found;
        }
    }
    return null;
}

function extractWmsGetMapUrl(capabilities: any): string {
    const getMap = capabilities?.Capability?.Request?.GetMap;
    if (!getMap) return '';
    if (typeof getMap.href === 'string') return getMap.href;
    if (Array.isArray(getMap.DCPType)) {
        for (const dcp of getMap.DCPType) {
            const http = dcp?.HTTP?.Get;
            if (typeof http?.href === 'string') return http.href;
        }
    }
    return '';
}

export function detectWmsByUrl(urlObj: URL): boolean {
    const service = getSearchParamCaseInsensitive(urlObj, 'SERVICE').toUpperCase();
    const request = getSearchParamCaseInsensitive(urlObj, 'REQUEST').toUpperCase();
    if (service === 'WMS') return true;
    if (request === 'GETMAP' || request === 'GETCAPABILITIES') return true;
    if (/wms/i.test(urlObj.pathname)) return true;
    return false;
}

export function createTileWmsSource(opts: { url: string; params: Record<string, string> }): TileWMS {
    return new TileWMS({
        url: opts.url,
        params: opts.params,
        serverType: 'geoserver',
        transition: 0,
    });
}

function createWmsSourceFromGetMapUrl(urlObj: URL): TileWMS {
    const endpoint = `${urlObj.origin}${urlObj.pathname}`;
    const params: Record<string, string> = {};

    for (const [k, v] of urlObj.searchParams.entries()) {
        params[k.toUpperCase()] = v;
    }

    return createTileWmsSource({ url: endpoint, params });
}

export async function createWmsSourceStrict(rawUrl: string): Promise<AutoTileSourceResult> {
    const parsed = parseUrlSafe(rawUrl);
    if (!parsed || !detectWmsByUrl(parsed)) {
        throw new Error('未识别为 WMS 服务');
    }

    const request = getSearchParamCaseInsensitive(parsed, 'REQUEST').toUpperCase();
    if (request === 'GETMAP') {
        return {
            source: prioritizeTileSourceRequest(createWmsSourceFromGetMapUrl(parsed)),
            kind: 'wms',
            detail: 'WMS GetMap',
        };
    }

    const capabilitiesUrl = createCapabilitiesUrl(rawUrl, 'WMS', DEFAULT_WMS_VERSION);
    const xmlText = await fetchTextWithTimeout(capabilitiesUrl);
    const parser = new WMSCapabilities();
    const capabilities = parser.read(xmlText);

    const topLayer = capabilities?.Capability?.Layer;
    const targetLayer = findFirstNamedWmsLayer(topLayer);
    const layerName = String(targetLayer?.Name || '').trim();
    if (!layerName) {
        throw new Error('WMS Capabilities 未找到可用图层名称');
    }

    const preferredFormat = Array.isArray(capabilities?.Capability?.Request?.GetMap?.Format)
        ? capabilities.Capability.Request.GetMap.Format.find((fmt: string) => /png/i.test(fmt)) ||
          capabilities.Capability.Request.GetMap.Format[0]
        : 'image/png';

    const endpointCandidate = extractWmsGetMapUrl(capabilities);
    const endpoint = resolveServiceEndpoint(endpointCandidate, rawUrl);
    const version = String(capabilities?.version || DEFAULT_WMS_VERSION);
    const preferredCrs = pickPreferredWmsCrs(targetLayer);

    const params: Record<string, string> = {
        LAYERS: layerName,
        STYLES: '',
        FORMAT: String(preferredFormat || 'image/png'),
        TRANSPARENT: 'true',
        VERSION: version,
    };

    if (version === '1.3.0') {
        params.CRS = preferredCrs;
    } else {
        params.SRS = preferredCrs;
    }

    return {
        source: createTileWmsSource({ url: endpoint, params }),
        kind: 'wms',
        detail: `WMS 图层: ${layerName}`,
    };
}
