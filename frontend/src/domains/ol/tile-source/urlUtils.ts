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
    return /\{z\}/i.test(url) && /\{x\}/i.test(url) && /\{y\}/i.test(url);
}

export function looksLikeVectorTileUrl(url: string): boolean {
    // 仅基于文件扩展名(.pbf/.mvt)检测矢量切片
    // 移除过于宽泛的 /tile(s)?/ 检测，避免误判标准 XYZ 栅格切片（如 ArcGIS tile 服务）
    return /\.pbf(\?|$)/i.test(url) || /\.mvt(\?|$)/i.test(url);
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
