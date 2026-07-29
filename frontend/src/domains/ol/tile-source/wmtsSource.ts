/**
 * 瓦片源工厂 — WMTS 源创建
 *
 * 从 useTileSourceFactory.ts 拆分。
 */

import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import { DEFAULT_WMTS_VERSION, type AutoTileSourceResult, type NonStandardXYZAdapter } from './types';
import {
    parseUrlSafe,
    getSearchParamCaseInsensitive,
    setSearchParamCaseInsensitive,
    createCapabilitiesUrl,
    fetchTextWithTimeout,
} from './urlUtils';
import { prioritizeTileSourceRequest } from './tileLifecycle';
import { createXYZSourceFromUrl } from './xyzSource';

export function detectWmtsByUrl(urlObj: URL): boolean {
    const service = getSearchParamCaseInsensitive(urlObj, 'SERVICE').toUpperCase();
    const request = getSearchParamCaseInsensitive(urlObj, 'REQUEST').toUpperCase();
    if (service === 'WMTS') return true;
    if (request === 'GETTILE' || request === 'GETCAPABILITIES') return true;
    if (/wmts/i.test(urlObj.pathname)) return true;
    return false;
}

export function normalizeWmtsResourceTemplate(url: string): string {
    return String(url || '')
        .replace(/\{TileMatrix\}/gi, '{z}')
        .replace(/\{TileRow\}/gi, '{y}')
        .replace(/\{TileCol\}/gi, '{x}')
        .replace(/\{tilematrix\}/gi, '{z}')
        .replace(/\{tilerow\}/gi, '{y}')
        .replace(/\{tilecol\}/gi, '{x}');
}

function pickWmtsMatrixSet(layer: any): string {
    const sets = layer?.TileMatrixSetLink;
    if (Array.isArray(sets) && sets.length) {
        return String(sets[0]?.TileMatrixSet || '');
    }
    return '';
}

export function buildWmtsGetTileTemplateUrl(urlObj: URL): string {
    const templateUrl = `${urlObj.origin}${urlObj.pathname}`;
    const parsed = new URL(templateUrl);

    for (const [k, v] of urlObj.searchParams.entries()) {
        const upper = k.toUpperCase();
        if (upper !== 'REQUEST' && upper !== 'SERVICE') {
            parsed.searchParams.set(k, v);
        }
    }

    const tileMatrix = getSearchParamCaseInsensitive(urlObj, 'TILEMATRIX');
    const tileRow = getSearchParamCaseInsensitive(urlObj, 'TILEROW');
    const tileCol = getSearchParamCaseInsensitive(urlObj, 'TILECOL');

    if (tileMatrix) setSearchParamCaseInsensitive(parsed, 'TILEMATRIX', '{z}');
    if (tileRow) setSearchParamCaseInsensitive(parsed, 'TILEROW', '{y}');
    if (tileCol) setSearchParamCaseInsensitive(parsed, 'TILECOL', '{x}');

    return parsed.toString();
}

export async function createWmtsSourceStrict(
    rawUrl: string,
    adapters: Record<string, NonStandardXYZAdapter>,
): Promise<AutoTileSourceResult> {
    const parsed = parseUrlSafe(rawUrl);
    if (!parsed || !detectWmtsByUrl(parsed)) {
        throw new Error('未识别为 WMTS 服务');
    }

    const request = getSearchParamCaseInsensitive(parsed, 'REQUEST').toUpperCase();
    if (request === 'GETTILE') {
        const templateUrl = buildWmtsGetTileTemplateUrl(parsed);
        return {
            source: createXYZSourceFromUrl(templateUrl, { adapters }),
            kind: 'wmts',
            detail: 'WMTS GetTile 模板',
        };
    }

    if (/\{\s*tilematrix\s*\}/i.test(rawUrl)) {
        const normalizedTemplate = normalizeWmtsResourceTemplate(rawUrl);
        return {
            source: createXYZSourceFromUrl(normalizedTemplate, { adapters }),
            kind: 'wmts',
            detail: 'WMTS 模板',
        };
    }

    const capabilitiesUrl = createCapabilitiesUrl(rawUrl, 'WMTS', DEFAULT_WMTS_VERSION);
    const xmlText = await fetchTextWithTimeout(capabilitiesUrl);
    const parser = new WMTSCapabilities();
    const capabilities = parser.read(xmlText);

    const layers = Array.isArray(capabilities?.Contents?.Layer)
        ? capabilities.Contents.Layer
        : capabilities?.Contents?.Layer
          ? [capabilities.Contents.Layer]
          : [];

    const layer = layers.find((item: any) => item?.Identifier) || layers[0];
    const layerId = String(layer?.Identifier || '').trim();
    if (!layerId) {
        throw new Error('WMTS Capabilities 未找到可用图层');
    }

    const matrixSet = pickWmtsMatrixSet(layer);
    const wmtsOptions = optionsFromCapabilities(capabilities, {
        layer: layerId,
        matrixSet: matrixSet || undefined,
    });

    if (wmtsOptions) {
        return {
            source: prioritizeTileSourceRequest(
                new WMTS({ ...wmtsOptions, zDirection: -1 }),
            ),
            kind: 'wmts',
            detail: `WMTS 图层: ${layerId}`,
        };
    }

    const resourceUrls = Array.isArray(layer?.ResourceURL)
        ? layer.ResourceURL
        : layer?.ResourceURL
          ? [layer.ResourceURL]
          : [];
    const tileTemplate = resourceUrls.find(
        (item: any) => String(item?.resourceType || '').toLowerCase() === 'tile',
    )?.template;
    if (!tileTemplate) {
        throw new Error('WMTS Capabilities 解析失败：缺少可用的 ResourceURL 模板');
    }

    const normalizedTemplate = normalizeWmtsResourceTemplate(tileTemplate);
    const templateWithMatrixSet =
        matrixSet && normalizedTemplate.includes('{tilematrixset}')
            ? normalizedTemplate.replace(/\{tilematrixset\}/gi, matrixSet)
            : normalizedTemplate;

    return {
        source: createXYZSourceFromUrl(templateWithMatrixSet, { adapters }),
        kind: 'wmts',
        detail: `WMTS 模板: ${layerId}`,
    };
}
