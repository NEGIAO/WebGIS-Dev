/**
 * 瓦片源工厂 — XYZ 源创建 + 自动检测编排器
 *
 * 从 useTileSourceFactory.ts 拆分。
 */

import XYZ from 'ol/source/XYZ';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import {
    type TileYNormalizeMode,
    type CustomTileSourceKind,
    type TileSourceLike,
    type AutoTileSourceResult,
    type NonStandardXYZAdapter,
    type ConfiguredTileServiceDefinition,
    type AutoDetectOptions,
    DEFAULT_WMS_VERSION,
} from './types';
import {
    normalizeCustomServiceUrl,
    normalizeTemplateTokens,
    parseUrlSafe,
    looksLikeXYZTemplate,
    looksLikeVectorTileUrl,
    toErrorMessage,
} from './urlUtils';
import { prioritizeTileSourceRequest } from './tileLifecycle';
import { detectWmsByUrl, createTileWmsSource, createWmsSourceStrict } from './wmsSource';
import { detectWmtsByUrl, createWmtsSourceStrict } from './wmtsSource';

// ==================== Y 轴归一化 ====================

export function normalizeTileY(z: number, rawY: number, mode: TileYNormalizeMode = 'auto'): number {
    if (mode === 'direct') return rawY;
    if (mode === 'invert-tms') return (1 << z) - 1 - rawY;
    if (mode === 'ol-negative') return -rawY - 1;
    return rawY;
}

export function toQuadKey(x: number, y: number, z: number): string {
    let key = '';
    for (let i = z; i > 0; i--) {
        let digit = 0;
        const mask = 1 << (i - 1);
        if (x & mask) digit += 1;
        if (y & mask) digit += 2;
        key += digit.toString();
    }
    return key;
}

export function buildMapsForFreeAdapter(
    layerName: string,
    displayName: string,
    ext: string = 'gif',
): NonStandardXYZAdapter {
    return {
        pattern: new RegExp(`maps-for-free\\.com.*${layerName}`, 'i'),
        name: displayName,
        urlFunction: (tileCoord: number[]) => {
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = normalizeTileY(z, tileCoord[2], 'auto');
            return `https://maps-for-free.com/layer/${layerName}/z${z}/row${y}/${z}_${x}-${y}.${ext}`;
        },
    };
}

export const DEFAULT_NON_STANDARD_XYZ_ADAPTERS: Record<string, NonStandardXYZAdapter> = {};

export function detectNonStandardXYZ(
    url: string,
    adapters: Record<string, NonStandardXYZAdapter>,
): { name: string; urlFunction: (tc: number[]) => string } | null {
    for (const adapter of Object.values(adapters || {})) {
        if (adapter.pattern.test(url)) {
            return { name: adapter.name, urlFunction: adapter.urlFunction };
        }
    }
    return null;
}

// ==================== XYZ 源创建 ====================

export function createXYZSourceFromUrl(
    rawUrl: string,
    options: { adapters?: Record<string, NonStandardXYZAdapter>; tilePixelRatio?: number } = {},
): XYZ {
    const url = normalizeTemplateTokens(normalizeCustomServiceUrl(rawUrl));
    const adapters = options.adapters || DEFAULT_NON_STANDARD_XYZ_ADAPTERS;
    const xyzOptions: ConstructorParameters<typeof XYZ>[0] = {};

    // HD/@2x 瓦片实际 512×512 叠在 256 网格上，需告知 OL 渲染器按 256 网格缩放还原
    if (typeof options.tilePixelRatio === 'number' && options.tilePixelRatio > 0) {
        xyzOptions.tilePixelRatio = options.tilePixelRatio;
    }

    const nonStandard = detectNonStandardXYZ(url, adapters);
    if (nonStandard) {
        return new XYZ({
            tileUrlFunction: nonStandard.urlFunction,
            tilePixelRatio: xyzOptions.tilePixelRatio ?? 1,
        });
    }

    return new XYZ({ url, ...xyzOptions });
}

export function createVectorTileSourceFromUrl(rawUrl: string): VectorTileSource {
    const cleanUrl = normalizeTemplateTokens(normalizeCustomServiceUrl(rawUrl));
    return new VectorTileSource({
        url: cleanUrl,
        format: new MVT(),
    });
}

// ==================== 配置化服务源创建 ====================

export function createConfiguredServiceSource(
    definition: ConfiguredTileServiceDefinition,
    options: { adapters?: Record<string, NonStandardXYZAdapter> } = {},
): TileSourceLike {
    const url = normalizeTemplateTokens(normalizeCustomServiceUrl(definition.url));
    const serviceType = definition.serviceType;

    if (serviceType === 'xyz') {
        return createXYZSourceFromUrl(url, { adapters: options.adapters });
    }

    if (serviceType === 'wmts') {
        return createXYZSourceFromUrl(url, { adapters: options.adapters });
    }

    if (serviceType === 'vector-tile') {
        return createVectorTileSourceFromUrl(url);
    }

    const parsed = parseUrlSafe(url);
    const endpoint = parsed ? `${parsed.origin}${parsed.pathname}` : url;
    const version = definition.wms?.version || DEFAULT_WMS_VERSION;

    const params: Record<string, string> = {
        LAYERS: String(definition.wms?.layers || ''),
        STYLES: String(definition.wms?.styles || ''),
        FORMAT: String(definition.wms?.format || 'image/png'),
        TRANSPARENT: definition.wms?.transparent === false ? 'false' : 'true',
        VERSION: version,
    };

    if (!params.LAYERS) {
        throw new Error(`WMS 图层 ${definition.id} 缺少 layers 配置`);
    }

    if (version === '1.3.0') {
        params.CRS = String(definition.wms?.crs || definition.wms?.srs || 'EPSG:3857');
    } else {
        params.SRS = String(definition.wms?.srs || definition.wms?.crs || 'EPSG:3857');
    }

    return createTileWmsSource({ url: endpoint, params });
}

// ==================== 服务类型检测 ====================

export function detectCustomTileServiceKind(
    rawUrl: string,
    adapters: Record<string, NonStandardXYZAdapter> = DEFAULT_NON_STANDARD_XYZ_ADAPTERS,
): { kind: CustomTileSourceKind; name: string } {
    const normalizedUrl = normalizeTemplateTokens(normalizeCustomServiceUrl(rawUrl));
    if (!normalizedUrl) {
        return { kind: 'unknown', name: '未知格式' };
    }

    if (looksLikeVectorTileUrl(normalizedUrl)) {
        return { kind: 'vector-tile', name: '矢量切片 (MVT/PBF)' };
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

// ==================== 自动检测编排器 ====================

function createVectorTileSourceStrict(url: string): AutoTileSourceResult {
    if (!looksLikeVectorTileUrl(url)) {
        throw new Error('未识别为矢量切片服务');
    }
    if (!looksLikeXYZTemplate(url)) {
        throw new Error('矢量切片 URL 缺少 {z}/{x}/{y} 模板占位符');
    }
    return {
        source: createVectorTileSourceFromUrl(url),
        kind: 'vector-tile',
        detail: 'MVT/PBF',
    };
}

function createXyzSourceStrict(
    url: string,
    adapters: Record<string, NonStandardXYZAdapter>,
): AutoTileSourceResult {
    const nonStandard = detectNonStandardXYZ(url, adapters);

    if (nonStandard) {
        return {
            source: prioritizeTileSourceRequest(
                new XYZ({ tileUrlFunction: nonStandard.urlFunction, tilePixelRatio: 1 }),
            ),
            kind: 'non-standard-xyz',
            detail: nonStandard.name,
        };
    }

    if (!looksLikeXYZTemplate(url)) {
        throw new Error('URL 中未检测到 {z}/{x}/{y} 模板占位符');
    }

    return {
        source: prioritizeTileSourceRequest(new XYZ({ url })),
        kind: 'xyz',
        detail: '标准 XYZ',
    };
}

export async function createAutoTileSourceFromUrl(
    rawUrl: string,
    options: AutoDetectOptions = {},
): Promise<AutoTileSourceResult> {
    const normalizedUrl = normalizeTemplateTokens(normalizeCustomServiceUrl(rawUrl));
    if (!normalizedUrl) {
        throw new Error('URL 为空，请输入有效服务地址');
    }

    const adapters = options.adapters || DEFAULT_NON_STANDARD_XYZ_ADAPTERS;
    const errors: string[] = [];

    try {
        return createVectorTileSourceStrict(normalizedUrl);
    } catch (error) {
        errors.push(`VectorTile: ${toErrorMessage(error)}`);
    }

    try {
        const xyzResult = createXyzSourceStrict(normalizedUrl, adapters);
        return { ...xyzResult, source: prioritizeTileSourceRequest(xyzResult.source) };
    } catch (error) {
        errors.push(`XYZ: ${toErrorMessage(error)}`);
    }

    try {
        const wmsResult = await createWmsSourceStrict(normalizedUrl);
        return { ...wmsResult, source: prioritizeTileSourceRequest(wmsResult.source) };
    } catch (error) {
        errors.push(`WMS: ${toErrorMessage(error)}`);
    }

    try {
        const wmtsResult = await createWmtsSourceStrict(normalizedUrl, adapters);
        return { ...wmtsResult, source: prioritizeTileSourceRequest(wmtsResult.source) };
    } catch (error) {
        errors.push(`WMTS: ${toErrorMessage(error)}`);
    }

    throw new Error(`无法解析该图源，已依次尝试 XYZ -> WMS -> WMTS。${errors.join(' | ')}`);
}
