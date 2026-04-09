/**
 * Tile Source Factory
 * 负责 XYZ / WMS / WMTS 的识别、建源和 overzoom 兼容逻辑。
 */

import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import WMSCapabilities from 'ol/format/WMSCapabilities';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';

export type TileYNormalizeMode = 'auto' | 'direct' | 'invert-tms' | 'ol-negative';
export type CustomTileSourceKind = 'xyz' | 'non-standard-xyz' | 'wms' | 'wmts' | 'unknown';
export type TileSourceLike = XYZ | TileWMS | WMTS;

export type AutoTileSourceResult = {
    source: TileSourceLike;
    kind: Exclude<CustomTileSourceKind, 'unknown'>;
    detail: string;
};

export type NonStandardXYZAdapter = {
    pattern: RegExp;
    name: string;
    urlFunction: (tileCoord: number[]) => string;
};

export type ConfiguredTileServiceType = 'xyz' | 'wms' | 'wmts';

export type ConfiguredTileServiceDefinition = {
    id: string;
    name: string;
    serviceType: ConfiguredTileServiceType;
    url: string;
    enabled?: boolean;
    wms?: {
        layers?: string;
        version?: string;
        styles?: string;
        format?: string;
        transparent?: boolean;
        srs?: string;
        crs?: string;
    };
    wmts?: {
        layer?: string;
        style?: string;
        matrixSet?: string;
        format?: string;
        version?: string;
    };
};

export type TileSourceFactoryOptions = {
    adapters?: Record<string, NonStandardXYZAdapter>;
};

export type AutoDetectOptions = {
    adapters?: Record<string, NonStandardXYZAdapter>;
};

const DEFAULT_WMS_VERSION = '1.1.1';
const DEFAULT_WMTS_VERSION = '1.0.0';
const CAPABILITIES_FETCH_TIMEOUT_MS = 10000;

function normalizeCustomServiceUrl(rawUrl: string): string {
    return String(rawUrl || '').trim().replace(/&amp;/gi, '&');
}

function normalizeTemplateTokens(url: string): string {
    return String(url || '').replace(/\$\{([a-z_]+)\}/gi, (_, axis: string) => `{${String(axis || '').toLowerCase()}}`);
}

function parseUrlSafe(rawUrl: string): URL | null {
    try {
        return new URL(rawUrl);
    } catch {
        return null;
    }
}

function getSearchParamCaseInsensitive(urlObj: URL, key: string): string {
    const normalizedKey = String(key || '').toLowerCase();
    if (!normalizedKey) return '';

    for (const [k, v] of urlObj.searchParams.entries()) {
        if (k.toLowerCase() === normalizedKey) return String(v || '');
    }

    return '';
}

function setSearchParamCaseInsensitive(urlObj: URL, key: string, value: string): void {
    const normalizedKey = String(key || '').toLowerCase();
    if (!normalizedKey) return;

    let matchedKey = '';
    for (const [k] of urlObj.searchParams.entries()) {
        if (k.toLowerCase() === normalizedKey) {
            matchedKey = k;
            break;
        }
    }

    urlObj.searchParams.set(matchedKey || key, value);
}

function looksLikeXYZTemplate(url: string): boolean {
    return /\{z\}/i.test(url) && /\{x\}/i.test(url) && (/\{y\}/i.test(url) || /\{-y\}/i.test(url));
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || '未知错误');
}

function toFiniteZoom(value: unknown): number | null {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    return Math.floor(num);
}

function fillXYZTemplate(template: string, z: number, x: number, y: number): string {
    const max = Math.max(0, Math.pow(2, z) - 1);
    return String(template || '')
        .replace(/\{z\}/gi, String(z))
        .replace(/\{x\}/gi, String(x))
        .replace(/\{y\}/gi, String(y))
        .replace(/\{-y\}/gi, String(Math.max(0, max - y)));
}

// 未用函数
// function createTileUrlFunction(templateUrl: string): (tileCoord: number[]) => string {
//     const normalizedTemplate = normalizeTemplateTokens(normalizeCustomServiceUrl(templateUrl));

//     return (tileCoord: number[]) => {
//         if (!Array.isArray(tileCoord) || tileCoord.length < 3) return '';

//         const z = Number(tileCoord[0]);
//         const x = Number(tileCoord[1]);
//         const rawY = Number(tileCoord[2]);
//         if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(rawY)) return '';

//         const y = normalizeTileY(z, rawY, 'auto');
//         const resolved = { z, x, y };

//         return fillXYZTemplate(normalizedTemplate, resolved.z, resolved.x, resolved.y);
//     };
// }

function isPrivateHost(hostname: string): boolean {
    const host = String(hostname || '').toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
}

function resolveServiceEndpoint(candidateUrl: string, fallbackUrl: string): string {
    const fallbackParsed = parseUrlSafe(fallbackUrl);
    const fallbackEndpoint = fallbackParsed
        ? `${fallbackParsed.origin}${fallbackParsed.pathname}`
        : fallbackUrl;

    const candidateParsed = parseUrlSafe(candidateUrl);
    if (!candidateParsed) return fallbackEndpoint;

    if (fallbackParsed && candidateParsed.hostname !== fallbackParsed.hostname && isPrivateHost(candidateParsed.hostname)) {
        return fallbackEndpoint;
    }

    return `${candidateParsed.origin}${candidateParsed.pathname}`;
}

function createCapabilitiesUrl(rawUrl: string, service: 'WMS' | 'WMTS', defaultVersion: string): string {
    const parsed = parseUrlSafe(rawUrl);
    if (!parsed) return rawUrl;

    setSearchParamCaseInsensitive(parsed, 'SERVICE', service);
    setSearchParamCaseInsensitive(parsed, 'REQUEST', 'GetCapabilities');

    if (!getSearchParamCaseInsensitive(parsed, 'VERSION')) {
        setSearchParamCaseInsensitive(parsed, 'VERSION', defaultVersion);
    }

    return parsed.toString();
}

async function fetchTextWithTimeout(url: string, timeoutMs: number = CAPABILITIES_FETCH_TIMEOUT_MS): Promise<string> {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: abortController.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

function pickPreferredWmsCrs(layer: any): string {
    const values: string[] = [];

    const maybeAdd = (value: any) => {
        if (Array.isArray(value)) {
            value.forEach(maybeAdd);
            return;
        }
        const text = String(value || '').trim();
        if (text) values.push(text);
    };

    maybeAdd(layer?.CRS);
    maybeAdd(layer?.SRS);

    if (!values.length) return 'EPSG:3857';
    const normalized = values.map((item) => item.toUpperCase());
    const epsg3857 = normalized.find((item) => item === 'EPSG:3857');
    if (epsg3857) return epsg3857;
    const epsg4326 = normalized.find((item) => item === 'EPSG:4326');
    if (epsg4326) return epsg4326;
    return normalized[0];
}

function findFirstNamedWmsLayer(layer: any): any | null {
    if (!layer) return null;

    const name = String(layer?.Name || '').trim();
    if (name) return layer;

    const children = Array.isArray(layer?.Layer)
        ? layer.Layer
        : layer?.Layer
            ? [layer.Layer]
            : [];

    for (const child of children) {
        const found = findFirstNamedWmsLayer(child);
        if (found) return found;
    }

    return null;
}

function extractWmsGetMapUrl(capabilities: any): string {
    const dcpType = capabilities?.Capability?.Request?.GetMap?.DCPType;
    const firstDcp = Array.isArray(dcpType) ? dcpType[0] : dcpType;
    const onlineResource = firstDcp?.HTTP?.Get?.OnlineResource;

    if (typeof onlineResource === 'string') return onlineResource;
    if (typeof onlineResource?.href === 'string') return onlineResource.href;
    if (typeof onlineResource?.['xlink:href'] === 'string') return onlineResource['xlink:href'];

    return '';
}

function detectWmsByUrl(urlObj: URL): boolean {
    const service = getSearchParamCaseInsensitive(urlObj, 'SERVICE').toUpperCase();
    const request = getSearchParamCaseInsensitive(urlObj, 'REQUEST').toUpperCase();

    if (service === 'WMS') return true;
    if (service && service !== 'WMS') return false;

    if (request === 'GETMAP') return true;
    if (request === 'GETCAPABILITIES' && /\/wms(\/|$|\?)/i.test(urlObj.pathname)) return true;

    return /\/wms(\/|$|\?)/i.test(urlObj.pathname);
}

function detectWmtsByUrl(urlObj: URL): boolean {
    const service = getSearchParamCaseInsensitive(urlObj, 'SERVICE').toUpperCase();
    const request = getSearchParamCaseInsensitive(urlObj, 'REQUEST').toUpperCase();

    if (service === 'WMTS') return true;
    if (service && service !== 'WMTS') return false;

    if (request === 'GETTILE') return true;
    if (request === 'GETCAPABILITIES' && /\/wmts(\/|$|\?)/i.test(urlObj.pathname)) return true;

    return /\/wmts(\/|$|\?)/i.test(urlObj.pathname);
}

function normalizeWmtsResourceTemplate(url: string): string {
    return String(url || '')
        .replace(/\{tilematrix\}/gi, '{z}')
        .replace(/\{tilerow\}/gi, '{y}')
        .replace(/\{tilecol\}/gi, '{x}')
        .replace(/\{tilematrixset\}/gi, '{tilematrixset}');
}

function pickWmtsMatrixSet(layer: any): string {
    const links = Array.isArray(layer?.TileMatrixSetLink)
        ? layer.TileMatrixSetLink
        : layer?.TileMatrixSetLink
            ? [layer.TileMatrixSetLink]
            : [];

    const matrixSets: string[] = links
        .map((item: any) => String(item?.TileMatrixSet || '').trim())
        .filter(Boolean);

    let preferred = '';
    for (const matrixSet of matrixSets) {
        if (/googlemapscompatible/i.test(matrixSet)) {
            preferred = matrixSet;
            break;
        }
    }

    return preferred || matrixSets[0] || '';
}

function buildWmtsGetTileTemplateUrl(urlObj: URL): string {
    const templateUrl = new URL(urlObj.toString());

    setSearchParamCaseInsensitive(templateUrl, 'SERVICE', 'WMTS');
    setSearchParamCaseInsensitive(templateUrl, 'REQUEST', 'GetTile');

    if (!getSearchParamCaseInsensitive(templateUrl, 'VERSION')) {
        setSearchParamCaseInsensitive(templateUrl, 'VERSION', DEFAULT_WMTS_VERSION);
    }

    setSearchParamCaseInsensitive(templateUrl, 'TILEMATRIX', '{z}');
    setSearchParamCaseInsensitive(templateUrl, 'TILEROW', '{y}');
    setSearchParamCaseInsensitive(templateUrl, 'TILECOL', '{x}');

    return templateUrl.toString();
}

function createTileWmsSource(opts: {
    url: string;
    params: Record<string, string>;
}): TileWMS {
    return new TileWMS({
        url: opts.url,
        params: opts.params,
        crossOrigin: 'anonymous',
        zDirection: 0
    });
}

function createWmsSourceFromGetMapUrl(urlObj: URL): TileWMS {
    const endpoint = `${urlObj.origin}${urlObj.pathname}`;
    const version = getSearchParamCaseInsensitive(urlObj, 'VERSION') || DEFAULT_WMS_VERSION;
    const layers = getSearchParamCaseInsensitive(urlObj, 'LAYERS');

    if (!layers) {
        throw new Error('WMS GetMap URL 缺少 LAYERS 参数');
    }

    const styles = getSearchParamCaseInsensitive(urlObj, 'STYLES');
    const format = getSearchParamCaseInsensitive(urlObj, 'FORMAT') || 'image/png';
    const transparent = getSearchParamCaseInsensitive(urlObj, 'TRANSPARENT') || 'true';
    const crs = getSearchParamCaseInsensitive(urlObj, 'CRS');
    const srs = getSearchParamCaseInsensitive(urlObj, 'SRS');

    const params: Record<string, string> = {
        LAYERS: layers,
        STYLES: styles,
        FORMAT: format,
        TRANSPARENT: transparent,
        VERSION: version
    };

    if (version === '1.3.0') {
        params.CRS = crs || srs || 'EPSG:3857';
    } else {
        params.SRS = srs || crs || 'EPSG:3857';
    }

    return createTileWmsSource({
        url: endpoint,
        params
    });
}

export function normalizeTileY(z: number, rawY: number, mode: TileYNormalizeMode = 'auto'): number {
    if (!Number.isFinite(rawY)) return rawY;

    if (mode === 'direct') return rawY;
    if (mode === 'invert-tms') return (1 << z) - 1 - rawY;
    if (mode === 'ol-negative') return -rawY - 1;

    return rawY < 0 ? (-rawY - 1) : rawY;
}

export function toQuadKey(x: number, y: number, z: number): string {
    let quadKey = '';
    for (let i = z; i > 0; i--) {
        let digit = 0;
        const mask = 1 << (i - 1);
        if ((x & mask) !== 0) digit += 1;
        if ((y & mask) !== 0) digit += 2;
        quadKey += digit.toString();
    }
    return quadKey;
}

export function buildMapsForFreeAdapter(layerName: string, displayName: string, ext: string = 'gif'): NonStandardXYZAdapter {
    return {
        pattern: new RegExp(`maps-for-free\\.com.*${layerName}`, 'i'),
        name: displayName,
        urlFunction: (tileCoord: number[]) => {
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = normalizeTileY(z, tileCoord[2], 'auto');
            return `https://maps-for-free.com/layer/${layerName}/z${z}/row${y}/${z}_${x}-${y}.${ext}`;
        }
    };
}

export const DEFAULT_NON_STANDARD_XYZ_ADAPTERS: Record<string, NonStandardXYZAdapter> = {
    'maps-for-free-relief': buildMapsForFreeAdapter('relief', '地形浮雕(MFF)', 'jpg'),
    'maps-for-free-water': buildMapsForFreeAdapter('water', '水体(MFF)'),
    'maps-for-free-admin': buildMapsForFreeAdapter('admin', '行政边界(MFF)'),
    'maps-for-free-streets': buildMapsForFreeAdapter('streets', '街道(MFF)'),
    'maps-for-free-country': buildMapsForFreeAdapter('country', '国家边界(MFF)', 'png'),
    'maps-for-free-crop': buildMapsForFreeAdapter('crop', '作物(MFF)'),
    'maps-for-free-grass': buildMapsForFreeAdapter('grass', '草地(MFF)'),
    'maps-for-free-forest': buildMapsForFreeAdapter('forest', '森林(MFF)'),
    'maps-for-free-tundra': buildMapsForFreeAdapter('tundra', '冻土(MFF)'),
    'maps-for-free-sand': buildMapsForFreeAdapter('sand', '沙地(MFF)'),
    'maps-for-free-swamp': buildMapsForFreeAdapter('swamp', '沼泽(MFF)'),
    'maps-for-free-ice': buildMapsForFreeAdapter('ice', '冰川(MFF)')
};

export function detectNonStandardXYZ(
    url: string,
    adapters: Record<string, NonStandardXYZAdapter> = DEFAULT_NON_STANDARD_XYZ_ADAPTERS
): { name: string; urlFunction: (tc: number[]) => string } | null {
    for (const adapter of Object.values(adapters || {})) {
        if (adapter.pattern.test(url)) {
            return {
                name: adapter.name,
                urlFunction: adapter.urlFunction
            };
        }
    }

    return null;
}

export function createXYZSourceFromUrl(rawUrl: string, options: TileSourceFactoryOptions = {}): XYZ {
    const cleanUrl = normalizeTemplateTokens(normalizeCustomServiceUrl(rawUrl));
    const adapters = options.adapters || DEFAULT_NON_STANDARD_XYZ_ADAPTERS;
    const nonStandard = detectNonStandardXYZ(cleanUrl, adapters);

    if (nonStandard) {
        return new XYZ({
            tileUrlFunction: nonStandard.urlFunction,
            tilePixelRatio: 1
        });
    }

    return new XYZ({ url: cleanUrl });
}

export function createConfiguredServiceSource(
    definition: ConfiguredTileServiceDefinition,
    options: { adapters?: Record<string, NonStandardXYZAdapter> } = {}
): TileSourceLike {
    const url = normalizeTemplateTokens(normalizeCustomServiceUrl(definition.url));
    const serviceType = definition.serviceType;

    if (serviceType === 'xyz') {
        return createXYZSourceFromUrl(url, {
            adapters: options.adapters
        });
    }

    if (serviceType === 'wmts') {
        return createXYZSourceFromUrl(url, {
            adapters: options.adapters
        });
    }

    const parsed = parseUrlSafe(url);
    const endpoint = parsed ? `${parsed.origin}${parsed.pathname}` : url;
    const version = definition.wms?.version || DEFAULT_WMS_VERSION;

    const params: Record<string, string> = {
        LAYERS: String(definition.wms?.layers || ''),
        STYLES: String(definition.wms?.styles || ''),
        FORMAT: String(definition.wms?.format || 'image/png'),
        TRANSPARENT: definition.wms?.transparent === false ? 'false' : 'true',
        VERSION: version
    };

    if (!params.LAYERS) {
        throw new Error(`WMS 图层 ${definition.id} 缺少 layers 配置`);
    }

    if (version === '1.3.0') {
        params.CRS = String(definition.wms?.crs || definition.wms?.srs || 'EPSG:3857');
    } else {
        params.SRS = String(definition.wms?.srs || definition.wms?.crs || 'EPSG:3857');
    }

    return createTileWmsSource({
        url: endpoint,
        params
    });
}

function createXyzSourceStrict(
    url: string,
    adapters: Record<string, NonStandardXYZAdapter>
): AutoTileSourceResult {
    const nonStandard = detectNonStandardXYZ(url, adapters);

    if (nonStandard) {
        return {
            source: new XYZ({
                tileUrlFunction: nonStandard.urlFunction,
                tilePixelRatio: 1
            }),
            kind: 'non-standard-xyz',
            detail: nonStandard.name
        };
    }

    if (!looksLikeXYZTemplate(url)) {
        throw new Error('URL 中未检测到 {z}/{x}/{y} 模板占位符');
    }

    return {
        source: new XYZ({ url }),
        kind: 'xyz',
        detail: '标准 XYZ'
    };
}

async function createWmsSourceStrict(rawUrl: string): Promise<AutoTileSourceResult> {
    const parsed = parseUrlSafe(rawUrl);
    if (!parsed || !detectWmsByUrl(parsed)) {
        throw new Error('未识别为 WMS 服务');
    }

    const request = getSearchParamCaseInsensitive(parsed, 'REQUEST').toUpperCase();
    if (request === 'GETMAP') {
        return {
            source: createWmsSourceFromGetMapUrl(parsed),
            kind: 'wms',
            detail: 'WMS GetMap'
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
        ? capabilities.Capability.Request.GetMap.Format.find((fmt: string) => /png/i.test(fmt)) || capabilities.Capability.Request.GetMap.Format[0]
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
        VERSION: version
    };

    if (version === '1.3.0') {
        params.CRS = preferredCrs;
    } else {
        params.SRS = preferredCrs;
    }

    return {
        source: createTileWmsSource({
            url: endpoint,
            params
        }),
        kind: 'wms',
        detail: `WMS 图层: ${layerName}`
    };
}

async function createWmtsSourceStrict(
    rawUrl: string,
    adapters: Record<string, NonStandardXYZAdapter>
): Promise<AutoTileSourceResult> {
    const parsed = parseUrlSafe(rawUrl);
    if (!parsed || !detectWmtsByUrl(parsed)) {
        throw new Error('未识别为 WMTS 服务');
    }

    const request = getSearchParamCaseInsensitive(parsed, 'REQUEST').toUpperCase();
    if (request === 'GETTILE') {
        const templateUrl = buildWmtsGetTileTemplateUrl(parsed);
        return {
            source: createXYZSourceFromUrl(templateUrl, {
                adapters
            }),
            kind: 'wmts',
            detail: 'WMTS GetTile 模板'
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
        matrixSet: matrixSet || undefined
    });

    if (wmtsOptions) {
        return {
            source: new WMTS({
                ...wmtsOptions,
                zDirection: -1
            }),
            kind: 'wmts',
            detail: `WMTS 图层: ${layerId}`
        };
    }

    const resourceUrls = Array.isArray(layer?.ResourceURL)
        ? layer.ResourceURL
        : layer?.ResourceURL
            ? [layer.ResourceURL]
            : [];
    const tileTemplate = resourceUrls.find((item: any) => String(item?.resourceType || '').toLowerCase() === 'tile')?.template;
    if (!tileTemplate) {
        throw new Error('WMTS Capabilities 解析失败：缺少可用的 ResourceURL 模板');
    }

    const normalizedTemplate = normalizeWmtsResourceTemplate(tileTemplate);
    const templateWithMatrixSet = matrixSet && normalizedTemplate.includes('{tilematrixset}')
        ? normalizedTemplate.replace(/\{tilematrixset\}/gi, matrixSet)
        : normalizedTemplate;

    return {
        source: createXYZSourceFromUrl(templateWithMatrixSet, {
            adapters
        }),
        kind: 'wmts',
        detail: `WMTS 模板: ${layerId}`
    };
}

export function detectCustomTileServiceKind(
    rawUrl: string,
    adapters: Record<string, NonStandardXYZAdapter> = DEFAULT_NON_STANDARD_XYZ_ADAPTERS
): { kind: CustomTileSourceKind; name: string } {
    const normalizedUrl = normalizeTemplateTokens(normalizeCustomServiceUrl(rawUrl));
    if (!normalizedUrl) {
        return { kind: 'unknown', name: '未知格式' };
    }

    const nonStandard = detectNonStandardXYZ(normalizedUrl, adapters);
    if (nonStandard) {
        return { kind: 'non-standard-xyz', name: `${nonStandard.name}（非标准XYZ）` };
    }

    if (looksLikeXYZTemplate(normalizedUrl)) {
        return { kind: 'xyz', name: '标准XYZ' };
    }

    const parsed = parseUrlSafe(normalizedUrl);
    if (!parsed) {
        return { kind: 'unknown', name: '未知格式' };
    }

    if (detectWmsByUrl(parsed)) {
        return { kind: 'wms', name: 'WMS 服务' };
    }

    if (detectWmtsByUrl(parsed)) {
        return { kind: 'wmts', name: 'WMTS 服务' };
    }

    return { kind: 'unknown', name: '未知格式' };
}

export async function createAutoTileSourceFromUrl(
    rawUrl: string,
    options: AutoDetectOptions = {}
): Promise<AutoTileSourceResult> {
    const normalizedUrl = normalizeTemplateTokens(normalizeCustomServiceUrl(rawUrl));
    if (!normalizedUrl) {
        throw new Error('URL 为空，请输入有效服务地址');
    }

    const adapters = options.adapters || DEFAULT_NON_STANDARD_XYZ_ADAPTERS;
    const errors: string[] = [];

    try {
        return createXyzSourceStrict(normalizedUrl, adapters);
    } catch (error) {
        errors.push(`XYZ: ${toErrorMessage(error)}`);
    }

    try {
        return await createWmsSourceStrict(normalizedUrl);
    } catch (error) {
        errors.push(`WMS: ${toErrorMessage(error)}`);
    }

    try {
        return await createWmtsSourceStrict(normalizedUrl, adapters);
    } catch (error) {
        errors.push(`WMTS: ${toErrorMessage(error)}`);
    }

    throw new Error(`无法解析该图源，已依次尝试 XYZ -> WMS -> WMTS。${errors.join(' | ')}`);
}
