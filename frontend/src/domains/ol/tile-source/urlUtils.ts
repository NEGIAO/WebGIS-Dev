/**
 * 瓦片源工厂 — URL 工具函数
 *
 * 从 useTileSourceFactory.ts 拆分。
 */

import { CAPABILITIES_FETCH_TIMEOUT_MS } from './types';

export function normalizeCustomServiceUrl(rawUrl: string): string {
    return String(rawUrl || '').trim();
}

export function normalizeTemplateTokens(url: string): string {
    return String(url || '')
        .replace(/\{z\}/gi, '{z}')
        .replace(/\{x\}/gi, '{x}')
        .replace(/\{y\}/gi, '{y}')
        .replace(/\{-y\}/gi, '{-y}')
        .replace(/\{s\}/gi, '{s}');
}

export function parseUrlSafe(rawUrl: string): URL | null {
    try {
        return new URL(rawUrl);
    } catch {
        return null;
    }
}

export function getSearchParamCaseInsensitive(urlObj: URL, key: string): string {
    const upper = urlObj.searchParams.get(key.toUpperCase());
    if (upper !== null) return upper;
    const lower = urlObj.searchParams.get(key.toLowerCase());
    if (lower !== null) return lower;
    for (const [k, v] of urlObj.searchParams.entries()) {
        if (k.toUpperCase() === key.toUpperCase()) return v;
    }
    return '';
}

export function setSearchParamCaseInsensitive(urlObj: URL, key: string, value: string): void {
    for (const [k] of urlObj.searchParams.entries()) {
        if (k.toUpperCase() === key.toUpperCase()) {
            urlObj.searchParams.delete(k);
        }
    }
    urlObj.searchParams.set(key, value);
}

export function looksLikeXYZTemplate(url: string): boolean {
    // 仅判定是否含「{...} 占位符」，不再限定内部必须是 x/y/z。
    // 支持非标准瓦片（如 TMS 翻转 Y 的 y={-y}、{-z}/{-x}/{-y}、{TileMatrix}/{TileCol}/{TileRow} 等）：
    // 用户只需在占位符内做 - 之类的纠正即可，检测器不应因 token 名称而拒绝。
    return /\{[^{}]+\}/.test(url);
}

export function looksLikeVectorTileUrl(url: string): boolean {
    // 文件扩展名(.pbf/.mvt)
    if (/\.pbf(\?|$)/i.test(url) || /\.mvt(\?|$)/i.test(url)) return true;
    // 无扩展名但路径明确含矢量语义（如天地图 MVT 二次封装 .../mvt/{z}/{x}/{y}）。
    // 用词边界 /mvt/ /vector/ 而非宽泛的 /tile/，避免误判 ArcGIS/标准 XYZ 栅格瓦片。
    return /\/mvt\//i.test(url) || /\/vector\//i.test(url) || /\/pbf\//i.test(url);
}

export function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export function isPrivateHost(hostname: string): boolean {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.local')
    );
}

export function resolveServiceEndpoint(candidateUrl: string, fallbackUrl: string): string {
    if (candidateUrl) return candidateUrl;
    const parsed = parseUrlSafe(fallbackUrl);
    return parsed ? `${parsed.origin}${parsed.pathname}` : fallbackUrl;
}

export function createCapabilitiesUrl(
    baseUrl: string,
    service: 'WMS' | 'WMTS',
    version: string,
): string {
    const parsed = parseUrlSafe(baseUrl);
    if (!parsed) return baseUrl;

    setSearchParamCaseInsensitive(parsed, 'SERVICE', service);
    setSearchParamCaseInsensitive(parsed, 'REQUEST', 'GetCapabilities');
    setSearchParamCaseInsensitive(parsed, 'VERSION', version);

    return parsed.toString();
}

export async function fetchTextWithTimeout(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CAPABILITIES_FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    } finally {
        clearTimeout(timeoutId);
    }
}
