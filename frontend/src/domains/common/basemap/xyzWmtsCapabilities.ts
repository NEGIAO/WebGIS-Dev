/**
 * xyzWmtsCapabilities.js — XYZ 模板行序判定 + WMTS GetCapabilities 轻量解析。
 *
 * 纯 JS 实现（不依赖 OpenLayers），供 common 层注册入口产出元数据；
 * 渲染端（OL/Cesium adapter）各自用原生 API 构建源/Provider。
 *
 * WMTS 支持范围（首期）：WebMercator 系标准四叉树矩阵集
 * （SupportedCRS 含 3857 / 900913 / GoogleMapsCompatible），
 * 非标准矩阵集在解析阶段即被跳过并记录原因。
 */

import { getCapabilitiesProxyBuilder } from './capabilitiesProxy';

/** 判定是否为可直接注册的 WMTS 服务地址 */
export function looksLikeWmtsUrl(rawUrl: any) {
    const url = String(rawUrl || '');
    return /service=wmts/i.test(url) || /\/wmts(\/|\?|$)/i.test(url);
}

/**
 * 判定 XYZ 模板行序
 * @returns {'zyx'|'zxy'|'tms'} zyx = {z}/{y}/{x}；zxy = 标准 slippy；tms = {-y} 南起 Y
 */
export function detectTileYScheme(rawUrl: any) {
    const url = String(rawUrl || '');
    if (/\{-y\}/i.test(url)) return 'tms';
    // 按 {z} 之后 y/x 的出现顺序判断；{z} 缺省时按 {y} 在 {x} 前 → zyx
    if (/\{z\}[\s\S]*?\{y\}[\s\S]*?\{x\}/.test(url)) return 'zyx';
    return 'zxy';
}

const capsCache = new Map(); // 归一化地址 → Promise<info>

/** 带超时与代理兜底的文本拉取（直连失败 → 后端 /proxy/{url} 重试一次） */
async function fetchCapsText(url: any) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (directError) {
        const buildProxyUrl = getCapabilitiesProxyBuilder();
        const proxiedUrl = buildProxyUrl?.(url);
        if (!proxiedUrl || proxiedUrl === url) throw directError;
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), 10000);
        try {
            const res2 = await fetch(proxiedUrl, { signal: retryController.signal });
            if (!res2.ok) throw new Error(`HTTP ${res2.status}`, { cause: directError });
            return await res2.text();
        } finally {
            clearTimeout(retryTimeout);
        }
    } finally {
        clearTimeout(timeoutId);
    }
}

function elementsByLocalName(parent: any, tag: string) {
    if (!parent) return [];
    const namespaced = parent.getElementsByTagNameNS?.('*', tag);
    if (namespaced?.length) return Array.from(namespaced);
    return Array.from(parent.getElementsByTagName?.(tag) || []);
}

function textOf(parent: any, tag: string) {
    const node = elementsByLocalName(parent, tag)[0] as any;
    return node?.textContent?.trim() || '';
}

function isWebMercatorMatrixSet(set: any) {
    return /3857|900913|googlemapscompatible/i.test(`${set?.id || ''} ${set?.crs || ''}`);
}

function readMatrixSets(capsRoot: any) {
    return elementsByLocalName(capsRoot, 'TileMatrixSet')
        .map((node: any) => ({
            id: textOf(node, 'Identifier'),
            crs: textOf(node, 'SupportedCRS'),
        }))
        .filter((set: any) => set.id && set.crs);
}

function pickLayerMatrixSet(matrixSets: any[], layer: any) {
    const linkedIds = elementsByLocalName(layer, 'TileMatrixSetLink')
        .map((link: any) => textOf(link, 'TileMatrixSet'))
        .filter(Boolean);
    const compatible = linkedIds
        .map((id: string) => matrixSets.find((set) => set.id === id))
        .filter((set: any) => isWebMercatorMatrixSet(set));
    // 双引擎渲染端均使用 WebMercatorTilingScheme；优先标准 GoogleMapsCompatible，
    // 再接受 EPSG:3857 / 900913 等价矩阵集，4326-only 图层不进入可加载选项。
    return compatible.find((set: any) => /googlemapscompatible/i.test(set.id))
        || compatible.find((set: any) => /3857/i.test(set.crs))
        || compatible[0]
        || null;
}

function operationEndpoint(capsRoot: any, operationName: string, fallback: string) {
    const operation = elementsByLocalName(capsRoot, 'Operation')
        .find((node: any) => node?.getAttribute?.('name') === operationName);
    const getNode = elementsByLocalName(operation, 'Get')[0] as any;
    const href = getNode?.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href')
        || getNode?.getAttribute?.('xlink:href')
        || getNode?.getAttribute?.('href')
        || '';
    return String(href || fallback).replace(/[?&]+$/, '');
}

function matchInputProtocol(endpoint: string, rawUrl: string) {
    // EOX Capabilities 内仍声明 http:// 端点；HTTPS 页面必须升级，避免 mixed content。
    if (/^https:\/\//i.test(rawUrl) && /^http:\/\//i.test(endpoint)) {
        return endpoint.replace(/^http:\/\//i, 'https://');
    }
    return endpoint;
}

const WMTS_CONTROL_PARAMS = new Set([
    'SERVICE', 'REQUEST', 'VERSION', 'LAYER', 'STYLE', 'FORMAT', 'TILEMATRIXSET',
    'TILEMATRIX', 'TILEROW', 'TILECOL',
]);

/** 保留 token/key 等服务商鉴权参数，剔除会与新请求冲突的 WMTS 控制参数 */
function withPreservedServiceQuery(endpoint: string, rawUrl: string) {
    const target = new URL(endpoint, rawUrl);
    const source = new URL(rawUrl);
    for (const [key, value] of source.searchParams.entries()) {
        if (WMTS_CONTROL_PARAMS.has(key.toUpperCase()) || target.searchParams.has(key)) continue;
        target.searchParams.append(key, value);
    }
    return target.toString();
}

/**
 * 解析 WMTS Capabilities 并缓存（同地址并发共享同一 Promise）
 * @param {string} rawUrl 用户输入的 WMTS 地址
 * @returns {Promise<{endpoint,title,layerOptions,matrixSet,srs,format,style,version}|null>}
 */
export async function ensureWmtsServiceInfo(rawUrl: any) {
    const url = String(rawUrl || '').trim();
    if (!url) return null;
    const inputUrl = new URL(url);
    const base = `${inputUrl.origin}${inputUrl.pathname}`.replace(/\/+$/, '');
    const versionMatch = url.match(/version=([\d.]+)/i);
    const version = versionMatch ? versionMatch[1] : '1.0.0';
    const capabilitiesUrl = new URL(withPreservedServiceQuery(base, url));
    capabilitiesUrl.searchParams.set('SERVICE', 'WMTS');
    capabilitiesUrl.searchParams.set('VERSION', version);
    capabilitiesUrl.searchParams.set('REQUEST', 'GetCapabilities');
    const capsUrl = capabilitiesUrl.toString();

    if (!capsCache.has(capsUrl)) {
        capsCache.set(
            capsUrl,
            (async () => {
                const text = await fetchCapsText(capsUrl);
                const doc = new DOMParser().parseFromString(text, 'text/xml');
                if (elementsByLocalName(doc, 'Exception')[0]) {
                    throw new Error(textOf(doc, 'ExceptionText') || 'WMTS 服务返回异常');
                }
                const serviceTitle = textOf(doc, 'Title') || base.replace(/^https?:\/\//, '');
                const matrixSets = readMatrixSets(doc);
                const layerOptions = [];
                for (const layer of elementsByLocalName(doc, 'Layer')) {
                    const identifier = textOf(layer, 'Identifier');
                    if (!identifier) continue;
                    const matrixSet = pickLayerMatrixSet(matrixSets, layer);
                    if (!matrixSet) continue; // 跳过 4326-only 等当前渲染端不支持的图层
                    const layerTitle = textOf(layer, 'Title') || identifier;
                    const format = textOf(layer, 'Format') || 'image/png';
                    const styles = elementsByLocalName(layer, 'Style');
                    const defaultStyle = styles.find((node: any) => node?.getAttribute?.('isDefault') === 'true')
                        || styles[0];
                    layerOptions.push({
                        name: identifier,
                        title: layerTitle,
                        label: layerTitle,
                        matrixSet: matrixSet.id,
                        srs: matrixSet.crs,
                        format,
                        style: defaultStyle ? textOf(defaultStyle, 'Identifier') : 'default',
                    });
                }
                const endpoint = withPreservedServiceQuery(
                    matchInputProtocol(
                        operationEndpoint(doc, 'GetTile', withPreservedServiceQuery(base, url)),
                        url,
                    ),
                    url,
                );
                const firstLayer = layerOptions[0];
                return {
                    endpoint,
                    title: serviceTitle,
                    layerOptions,
                    // 顶层字段保留给旧调用方；实际选择图层后以 matchedOption 为准
                    matrixSet: firstLayer?.matrixSet || '',
                    srs: firstLayer?.srs || '',
                    format: firstLayer?.format || 'image/png',
                    style: firstLayer?.style || 'default',
                    version,
                };
            })(),
        );
    }
    try {
        return await capsCache.get(capsUrl);
    } catch (error) {
        capsCache.delete(capsUrl); // 失败不缓存，允许重试
        console.warn('[RemoteServices] WMTS Capabilities 解析失败:', error);
        return null;
    }
}
