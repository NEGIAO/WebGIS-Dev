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
export function looksLikeWmtsUrl(rawUrl) {
    const url = String(rawUrl || '');
    return /service=wmts/i.test(url) || /\/wmts(\/|\?|$)/i.test(url);
}

/**
 * 判定 XYZ 模板行序
 * @returns {'zyx'|'zxy'} zyx = {z}/{y}/{x}（ArcGIS REST 行序）；zxy = 标准 slippy {z}/{x}/{y}
 */
export function detectTileYScheme(rawUrl) {
    const url = String(rawUrl || '');
    // 按 {z} 之后 y/x 的出现顺序判断；{z} 缺省时按 {y} 在 {x} 前 → zyx
    if (/\{z\}[\s\S]*?\{y\}[\s\S]*?\{x\}/.test(url)) return 'zyx';
    return 'zxy';
}

const capsCache = new Map(); // 归一化地址 → Promise<info>

/** 带超时与代理兜底的文本拉取（直连失败 → 后端 /proxy/{url} 重试一次） */
async function fetchCapsText(url) {
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
            if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
            return await res2.text();
        } finally {
            clearTimeout(retryTimeout);
        }
    } finally {
        clearTimeout(timeoutId);
    }
}

function textOf(parent, tag) {
    const node = parent?.getElementsByTagName?.(tag)?.[0];
    return node?.textContent?.trim() || '';
}

function pickPreferredMatrixSet(capsRoot) {
    const sets = [];
    const nodes = capsRoot.getElementsByTagName('TileMatrixSet');
    for (const node of nodes) {
        const id = textOf(node, 'Identifier');
        const crs = textOf(node, 'SupportedCRS');
        sets.push({ id, crs });
    }
    // 优选 3857 系标准四叉树矩阵集
    const preferred = sets.find((s) => /3857|900913|googlemapscompatible/i.test(s.crs || ''));
    return preferred || null;
}

/**
 * 解析 WMTS Capabilities 并缓存（同地址并发共享同一 Promise）
 * @param {string} rawUrl 用户输入的 WMTS 地址
 * @returns {Promise<{endpoint,title,layerOptions,matrixSet,srs,format,style,version}|null>}
 */
export async function ensureWmtsServiceInfo(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!url) return null;
    const base = url.split('?')[0].replace(/\/+$/, '');
    const versionMatch = url.match(/version=([\d.]+)/i);
    const version = versionMatch ? versionMatch[1] : '1.0.0';
    const capsUrl = `${base}?SERVICE=WMTS&VERSION=${version}&REQUEST=GetCapabilities`;

    if (!capsCache.has(capsUrl)) {
        capsCache.set(
            capsUrl,
            (async () => {
                const text = await fetchCapsText(capsUrl);
                const doc = new DOMParser().parseFromString(text, 'text/xml');
                if (doc.getElementsByTagName('Exception')[0]) {
                    throw new Error(textOf(doc, 'ExceptionText') || 'WMTS 服务返回异常');
                }
                const serviceTitle = doc.getElementsByTagName('Title')[0]?.textContent?.trim()
                    || base.replace(/^https?:\/\//, '');
                const matrixSet = pickPreferredMatrixSet(doc);
                const layerOptions = [];
                const layerNodes = doc.getElementsByTagName('Layer');
                for (const layer of layerNodes) {
                    // 仅取直接子级 Identifier（避免嵌套 Layer 干扰）
                    const identifier = layer.getElementsByTagName('Identifier')[0]?.textContent?.trim();
                    if (!identifier) continue;
                    const layerTitle = layer.getElementsByTagName('Title')[0]?.textContent?.trim() || identifier;
                    layerOptions.push({
                        name: identifier,
                        title: layerTitle,
                        label: layerTitle,
                    });
                }
                if (!matrixSet) {
                    throw new Error('未找到 WebMercator(3857) 系标准 TileMatrixSet，暂不支持该 WMTS 服务');
                }
                let format = 'image/png';
                const formatNode = doc.getElementsByTagName('Format')[0]?.textContent?.trim();
                if (/jpeg/i.test(formatNode || '')) format = 'image/jpeg';
                return {
                    endpoint: base,
                    title: serviceTitle,
                    layerOptions,
                    matrixSet: matrixSet.id,
                    srs: matrixSet.crs,
                    format,
                    style: '',
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
