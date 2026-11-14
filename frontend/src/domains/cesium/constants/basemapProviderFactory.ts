/**
 * Cesium ImageryProvider 工厂
 * 将引擎无关的 TileSourceDescriptor 转换为 Cesium.ImageryProvider 实例
 * 支持快速底图切换——使用 AbortController 中断旧请求，与 OL 侧 fetch() 策略一致
 */
import type { BasemapTileSourceDescriptor as TileSourceDescriptor } from '@common/basemap/catalogProjection';
import { getDescriptorById } from '@common/basemap/catalogProjection';
import { useMessage } from '@common/shell/useMessage';
import { notifyTileRateLimited } from '@common/utils/tileRateLimitNotify';
import {
    OSM_DE_MIRROR_ORIGIN,
    OSM_TILE_HOST,
    OSM_TILE_TEMPLATE,
    isOsmBlockedTileBlob,
} from '@common/basemap/osmTileFallback';
import { tileProxyUrl, TILE_PROXY_MODE } from '@/config/publicRuntime';

/** 创建 Provider 所需的运行时上下文 */
export type CesiumProviderContext = {
    tiandituTk: string;
    ovitalTdtkey: string;
    customUrl: string;
    normBase: string;
};

/** 扩展 Cesium 的 ImageryProvider 类型以包含我们添加的属性 */
export type AugmentedImageryProvider = Record<string, unknown> & {
    _abortController?: AbortController;
    _descriptorId?: string;
};

// Cesium 运行时类型映射（避免硬编码 import Cesium）
type CesiumRuntime = any;
type ImageryProviderInstance = any;

// ========== AbortController 管理 Map ==========
/** 记录每个 descriptorId 对应的 AbortController，用于快速中断旧请求 */
const abortControllerMap = new Map<string, AbortController>();

/**
 * 为给定的 descriptorId 创建新的 AbortController，同时中断旧的
 * @param descriptorId 图层源 ID
 * @returns 新的 AbortController
 */
function rotateAbortController(descriptorId: string): AbortController {
    const existing = abortControllerMap.get(descriptorId);
    if (existing) {
        existing.abort();
    }
    const controller = new AbortController();
    abortControllerMap.set(descriptorId, controller);
    return controller;
}

/**
 * 中断指定 descriptorId 的所有进行中的瓦片请求
 * @param descriptorId 图层源 ID
 */
export function abortDescriptorRequests(descriptorId: string): void {
    const controller = abortControllerMap.get(descriptorId);
    if (controller) {
        controller.abort();
        abortControllerMap.delete(descriptorId);
    }
}

/**
 * 中断所有进行中的瓦片请求
 */
export function abortAllDescriptorRequests(): void {
    abortControllerMap.forEach((controller) => {
        controller.abort();
    });
    abortControllerMap.clear();
}

// ========== 瓦片请求容灾与代理兜底 ==========

let lastCesiumProxyNotifyAt = 0;
const CESIUM_PROXY_NOTIFY_DEBOUNCE_MS = 5000;

function notifyCesiumProxyFallback(): void {
    const now = Date.now();
    if (now - lastCesiumProxyNotifyAt < CESIUM_PROXY_NOTIFY_DEBOUNCE_MS) return;
    lastCesiumProxyNotifyAt = now;
    try {
        useMessage().info('部分瓦片直连受限，已自动切换至代理/镜像加速加载', { duration: 4000 });
    } catch {
        // 非 Vue 上下文（SSR/测试）静默
    }
}

/**
 * 将 Blob 解码为 Cesium 支持的图片对象（优先使用 createImageBitmap 保持高性能与 flipY，回退 HTMLImageElement）
 */
async function decodeBlobToImage(
    Cesium: CesiumRuntime,
    blob: Blob,
): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
        try {
            if (Cesium?.Resource?.createImageBitmapFromBlob) {
                return await Cesium.Resource.createImageBitmapFromBlob(blob, {
                    flipY: true,
                    premultiplyAlpha: false,
                    skipColorSpaceConversion: false,
                });
            }
            return await createImageBitmap(blob, {
                imageOrientation: 'flipY',
                premultiplyAlpha: 'none',
                colorSpaceConversion: 'default',
            });
        } catch {
            // 解码失败时回退到 HTMLImageElement 路径
        }
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const blobUrl = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(blobUrl);
            resolve(img);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(blobUrl);
            reject(err);
        };
        img.src = blobUrl;
    });
}

function buildCesiumTileProxyUrl(srcUrl: string): string | null {
    if (TILE_PROXY_MODE === 'off') return null;
    try {
        const url = new URL(srcUrl);
        const hostAndPath = `${url.host}${url.pathname}${url.search}`;
        return tileProxyUrl(hostAndPath);
    } catch {
        return null;
    }
}

export interface WrapFetchFallbackOptions {
    isOsm?: boolean;
    descriptorId?: string;
    templateUrl?: string;
    subdomains?: string[];
}

/**
 * 包装 ImageryProvider 的 requestImage 方法，提供与 OL 侧同构的容灾与中断能力：
 * 1. 显式 referrerPolicy: 'origin-when-cross-origin'，规避 OSM 官方 Tile Usage Policy 403 封锁；
 * 2. 结合 AbortController 与 Cesium Request.cancelFunction，实现相机离开与底图切换时的秒级网络中断；
 * 3. 遇到 403 / 429 / 网络错误 或 TILE_PROXY_MODE === 'always' 时，自动回退到后端 /proxy 代理；
 * 4. 遇到 OSM 官方 6987 字节「403 Access blocked」拦截图时，自动回退到 OpenStreetMap 德国社区合规镜像；
 * 5. 将获取的 Blob 通过 createImageBitmap(..., { imageOrientation: 'flipY' }) 或 new Image() 解码交付渲染。
 */
export function wrapProviderWithFetchFallback(
    Cesium: CesiumRuntime,
    provider: any,
    abortSignal?: AbortSignal,
    options: WrapFetchFallbackOptions = {},
): any {
    if (!provider || typeof provider.requestImage !== 'function') return provider;

    const originalRequestImage = provider.requestImage.bind(provider);
    const subdomains = options.subdomains && options.subdomains.length > 0 ? options.subdomains : ['a', 'b', 'c'];
    // OSM 分支必须使用带 {z}/{x}/{y} 的模板：官方 OpenStreetMapImageryProvider 的
    // _resource.url 属 Cesium 私有字段且可能不含占位符，直接沿用会导致所有瓦片请求同一 URL。
    const osmFallbackTemplate = options.isOsm ? OSM_TILE_TEMPLATE : '';
    const rawTemplate =
        options.templateUrl ||
        osmFallbackTemplate ||
        provider._resource?.url ||
        OSM_TILE_TEMPLATE;

    provider.requestImage = async function (x: number, y: number, level: number, request?: any) {
        if (abortSignal?.aborted) {
            throw new Error('Tile request aborted by provider');
        }

        const tileController = new AbortController();
        const onProviderAbort = () => tileController.abort();

        if (abortSignal) {
            abortSignal.addEventListener('abort', onProviderAbort, { once: true });
        }

        if (request) {
            const originalCancel = request.cancelFunction;
            request.cancelFunction = () => {
                try { originalCancel?.(); } catch { /* 忽略 */ }
                tileController.abort();
            };
        }

        const cleanup = () => {
            if (abortSignal) {
                abortSignal.removeEventListener('abort', onProviderAbort);
            }
        };

        const sub = subdomains[Math.abs(x + y + level) % subdomains.length] || '';
        const directUrl = rawTemplate
            .replace(/\{z\}/g, String(level))
            .replace(/\{x\}/g, String(x))
            .replace(/\{y\}/g, String(y))
            .replace(/\{s\}/g, sub);

        const proxyUrl = options.isOsm
            ? tileProxyUrl(`${OSM_TILE_HOST}/${level}/${x}/${y}.png`)
            : (buildCesiumTileProxyUrl(directUrl) || tileProxyUrl(directUrl.replace(/^https?:\/\//i, '')));

        const osmCommunityMirrorUrl = options.isOsm
            ? `${OSM_DE_MIRROR_ORIGIN}/${level}/${x}/${y}.png`
            : null;

        const tryFetchBlob = async (targetUrl: string, useReferrer: boolean): Promise<Blob | null> => {
            try {
                const resp = await fetch(targetUrl, {
                    signal: tileController.signal,
                    mode: 'cors',
                    credentials: 'omit',
                    referrerPolicy: useReferrer ? 'origin-when-cross-origin' : 'no-referrer',
                });

                if (resp.status === 429) {
                    notifyTileRateLimited();
                    return null;
                }

                if (!resp.ok) return null;

                const blob = await resp.blob();
                // 拦截 OSM 拦截占位图（HTTP 200 但内容为「403 Access blocked」提示图）
                if (options.isOsm && isOsmBlockedTileBlob(blob)) {
                    return null;
                }
                if (blob.size < 64) {
                    return null;
                }
                return blob;
            } catch {
                return null;
            }
        };

        try {
            let blob: Blob | null = null;
            let usedFallback = false;

            if (TILE_PROXY_MODE === 'always' && proxyUrl) {
                blob = await tryFetchBlob(proxyUrl, false);
            } else {
                // fallback 模式：先直连（显式带 origin-when-cross-origin Referer 对齐 OL）
                blob = await tryFetchBlob(directUrl, true);

                // 直连 403 / 失败且允许代理时，回退到代理
                if (!blob && TILE_PROXY_MODE !== 'off' && proxyUrl && !tileController.signal.aborted) {
                    blob = await tryFetchBlob(proxyUrl, false);
                    if (blob) usedFallback = true;
                }

                // 若直连与代理均不可用（如代理返回 6987 假图），自动回退到 OSM 德国镜像
                if (!blob && osmCommunityMirrorUrl && !tileController.signal.aborted) {
                    blob = await tryFetchBlob(osmCommunityMirrorUrl, true);
                    if (blob) usedFallback = true;
                }
            }

            if (!blob) {
                if (!tileController.signal.aborted) {
                    return await originalRequestImage(x, y, level, request);
                }
                throw new Error(`Tile fetch aborted: ${level}/${x}/${y}`);
            }

            if (usedFallback) {
                notifyCesiumProxyFallback();
            }

            return await decodeBlobToImage(Cesium, blob);
        } finally {
            cleanup();
        }
    };

    return provider;
}

// ========== URL 模板解析工具 ==========

/**
 * 展开子域名范围 {a-d} → ['a','b','c','d']，并将 URL 中的 {a-d} 替换为 {s}
 * @param url URL 模板
 * @returns {{ url: string; subdomains: string[] }} 标准化后的 URL 和子域名列表
 */
function normalizeSubdomainRange(url: string): { url: string; subdomains: string[] } {
    const match = url.match(/\{([a-z0-9])-([a-z0-9])\}/i);
    if (!match) {
        // 检查 {s} 占位符但没有子域名范围
        if (/\{s\}/i.test(url)) {
            // 默认使用数字子域名 t0-t2：天地图/OSM/高德/腾讯等主流瓦片服务均用数字子域格式；
            // 天地图官方支持 t0-t7 共 8 个子域（负载均衡），此处取前 3 个已足够日常使用；
            // 字母子域 (a/b/c) 仅 Google 等少数服务使用，不适宜作默认。
            return { url, subdomains: ['0', '1', '2'] };
        }
        return { url, subdomains: [] };
    }

    const start = match[1].charCodeAt(0);
    const end = match[2].charCodeAt(0);
    const subdomains: string[] = [];
    for (let i = start; i <= end; i++) {
        subdomains.push(String.fromCharCode(i));
    }
    return {
        url: url.replace(match[0], '{s}'),
        subdomains,
    };
}

/**
 * 将 {x},{y},{z},{s} 转换为 Cesium 兼容格式
 * Cesium UrlTemplateImageryProvider 支持: {z}, {x}, {y}, {s}, {reverseY}, {westProjectedX} 等
 * 同时将 OL 风格的 {-y} 转换为 Cesium 的 {reverseY} 处理方式（如果适用）
 * 同时处理 WMTS 风格大写占位符：{TILEMATRIX}→{z}、{TILEROW}→{y}、{TILECOL}→{x}
 * 天地图等 WMTS 图源使用大写占位符，Cesium 不识别会导致瓦片请求 URL 中保留字面量而无法加载。
 * @param url URL 模板
 * @returns Cesium 兼容的 URL 模板
 */
function toCesiumUrlTemplate(url: string): string {
    return url
        .replace(/\{z\}/gi, '{z}')
        .replace(/\{x\}/gi, '{x}')
        // Cesium 的 UrlTemplateImageryProvider 不识别 {-y}，
        // 必须在归一化阶段就把 OL 风格的「负 Y / TMS 反转」占位符翻译为 {reverseY}，
        // 否则瓦片请求会被发成 y=-N&... 这种永远 404 的 URL。
        // 顺序：先处理 {-y}，再处理普通 {y}，避免误伤。
        .replace(/\{-\s*y\s*\}/gi, '{reverseY}')
        .replace(/\{y\}/gi, '{y}')
        .replace(/\{s\}/gi, '{s}')
        .replace(/\{subdomains?\}/gi, '{s}')
        .replace(/\{switch:[^}]+\}/gi, '{s}')
        // WMTS 大写占位符 → Cesium 小写（天地图等 WMTS 图源使用大写，不转换则保留字面量导致 404）
        .replace(/\{TILEMATRIX\}/gi, '{z}')
        .replace(/\{TILEROW\}/gi, '{y}')
        .replace(/\{TILECOL\}/gi, '{x}')
        // OL 风格的 URL 里经常有未被花括号包裹的 % 转义占位符（典型例子：
        // Google apistyle= 里的 %7C / %2C）。Cesium 会按字面输出，
        // 必须把它们解码回原始字符，否则像 ?apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off
        // 里的 | 在 Google 端会被识别为 OR 字符，导致瓦片样式错乱或 404。
        .replace(/%7C/gi, '|')
        .replace(/%2C/gi, ',');
}

/**
 * 解析上下文占位符，替换 URL 中的 {tiandituTk}、{ovitalTdtkey}、{customUrl}、{normBase}
 * @param url URL 模板
 * @param ctx 运行时上下文
 * @returns 解析后的 URL
 */
function resolveContextPlaceholders(url: string, ctx: CesiumProviderContext): string {
    let resolved = url;
    if (ctx.tiandituTk) {
        resolved = resolved.replace(/\{tiandituTk\}/g, ctx.tiandituTk);
    }
    if (ctx.ovitalTdtkey) {
        resolved = resolved.replace(/\{ovitalTdtkey\}/g, ctx.ovitalTdtkey);
    }
    if (ctx.customUrl) {
        resolved = resolved.replace(/\{customUrl\}/g, ctx.customUrl);
    }
    if (ctx.normBase) {
        resolved = resolved.replace(/\{normBase\}/g, ctx.normBase);
    }
    return resolved;
}

// ========== 非标准适配器转换 ==========

/**
 * MFF（maps-for-free）非标准 URL → Cesium 兼容 XYZ URL
 * OL 端使用 createXYZSourceFromUrl 处理 MFF 的非标准 URL 格式，
 * Cesium 端将其转换为标准 {z}/{x}/{y} 模板格式。
 *
 * MFF 原始格式: https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg
 * 转换后: https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg (Cesium 支持)
 *
 * 注意：MFF 的 Y 轴是 TMS 格式（从上到下），在 Cesium 中需要
 * 使用 tilingScheme 的 numberOfLevelZeroTilesY 来处理反转。
 * 但由于 MFF 使用自定义的 {z} 位置格式（z{z} 中 z 值不同），
 * 直接用 UrlTemplateImageryProvider + WebMercatorTilingScheme 可能有问题。
 * 实际上 MFF 的 URL 格式在 Cesium 中难以完全正确——标记为实验性支持。
 */
function buildMffCesiumUrl(_descriptor: TileSourceDescriptor): string | null {
    // MFF 使用非标准 URL 格式，暂时返回 null 跳过 Cesium 渲染
    // 后续可通过自定义 Cesium TileCoordinatesImageryProvider 实现
    return null;
}

// ========== 主工厂函数 ==========

/**
 * 根据描述符创建 Cesium ImageryProvider 实例
 *
 * @param Cesium Cesium 运行时对象
 * @param descriptor 引擎无关的图层源描述符
 * @param ctx 运行时上下文（token、customUrl 等）
 * @returns Cesium.ImageryProvider 实例，不支持的返回 null
 *
 * 策略：
 * - xyz: UrlTemplateImageryProvider + WebMercatorTilingScheme
 * - osm: OpenStreetMapImageryProvider（如果有）或 UrlTemplateImageryProvider
 * - wms: WebMapServiceImageryProvider
 * - wmts: WebMapTileServiceImageryProvider
 * - vector-tile: 返回 null（Cesium 不支持 PBF 矢量瓦片）
 * - custom: 解析 ctx.customUrl，创建 UrlTemplateImageryProvider
 */
export function createCesiumImageryProvider(
    Cesium: CesiumRuntime,
    descriptor: TileSourceDescriptor,
    ctx: CesiumProviderContext,
): ImageryProviderInstance | null {
    if (!Cesium || !descriptor) return null;

    // 旋转 AbortController，中断旧请求
    const abortController = rotateAbortController(descriptor.id);
    const abortSignal = abortController.signal;

    const { serviceType } = descriptor;

    // 解析 URL 中的上下文占位符
    let url = resolveContextPlaceholders(descriptor.url, ctx);

    // 自定义服务类型——使用 ctx.customUrl
    if (serviceType === 'custom') {
        if (!ctx.customUrl) return null;
        url = ctx.customUrl;
    }

    // 非标准适配器：MFF 等
    if (descriptor.nonStandardAdapter) {
        const mffUrl = buildMffCesiumUrl(descriptor);
        if (!mffUrl) return null; // MFF 暂不支持 Cesium 渲染
        url = mffUrl;
    }

    // 单源调用降级（直接传入 vector_tianditu_mvt 时降级为栅格天地图矢量）
    if (descriptor.id === 'vector_tianditu_mvt') {
        const fallbackDesc = getDescriptorById('vector_tianditu');
        if (fallbackDesc) {
            return createCesiumImageryProvider(Cesium, fallbackDesc, ctx);
        }
    }

    // Cesium 不支持的图源类型
    if (serviceType === 'vector-tile') {
        console.warn(`[CesiumProvider] 图源 "${descriptor.id}" 是矢量瓦片(PBF)，Cesium 不支持，已跳过。`);
        return null;
    }

    const { subdomains: rangeSubdomains } = normalizeSubdomainRange(url);
    const templateUrl = toCesiumUrlTemplate(url);
    const subdomains = descriptor.subdomains || rangeSubdomains;
    const maxLevel = descriptor.maxZoom || 18;

    try {
        let provider: ImageryProviderInstance = null;

        if (abortSignal.aborted) return null;

        switch (serviceType) {
            case 'wms': {
                if (typeof Cesium.WebMapServiceImageryProvider !== 'function') {
                    console.warn(`[CesiumProvider] Cesium 运行时不支持 WebMapServiceImageryProvider`);
                    return null;
                }
                const wmsParams = descriptor.wms;
                if (!wmsParams?.layers) {
                    console.warn(`[CesiumProvider] WMS 图源 "${descriptor.id}" 缺少 layers 参数`);
                    return null;
                }
                provider = new Cesium.WebMapServiceImageryProvider({
                    url: templateUrl || descriptor.url,
                    layers: wmsParams.layers,
                    parameters: {
                        version: wmsParams.version || '1.1.1',
                        srs: wmsParams.srs || 'EPSG:3857',
                        format: wmsParams.format || 'image/png',
                        styles: wmsParams.styles || '',
                        transparent: wmsParams.transparent !== false,
                    },
                });
                break;
            }

            case 'wmts': {
                if (typeof Cesium.WebMapTileServiceImageryProvider !== 'function') {
                    console.warn(`[CesiumProvider] Cesium 运行时不支持 WebMapTileServiceImageryProvider`);
                    return null;
                }
                const wmtsParams = descriptor.wmts;
                if (!wmtsParams?.layer || !wmtsParams.matrixSet) {
                    console.warn(`[CesiumProvider] WMTS 图源 "${descriptor.id}" 缺少 layer 或 matrixSet 参数`);
                    return null;
                }
                provider = new Cesium.WebMapTileServiceImageryProvider({
                    url: templateUrl || descriptor.url,
                    layer: wmtsParams.layer,
                    style: wmtsParams.style || 'default',
                    format: wmtsParams.format || 'image/png',
                    tileMatrixSetID: wmtsParams.matrixSet,
                    maximumLevel: maxLevel,
                });
                break;
            }

            case 'osm': {
                const osmUrl = OSM_TILE_TEMPLATE;
                provider = new Cesium.UrlTemplateImageryProvider({
                    url: osmUrl,
                    subdomains: ['a', 'b', 'c'],
                    tilingScheme: new Cesium.WebMercatorTilingScheme(),
                    maximumLevel: Math.min(maxLevel, 19),
                    enablePickFeatures: false,
                });
                wrapProviderWithFetchFallback(Cesium, provider, abortSignal, {
                    isOsm: true,
                    descriptorId: descriptor.id,
                    templateUrl: osmUrl,
                    subdomains: ['a', 'b', 'c'],
                });
                break;
            }

            default: {
                // xyz 或未知类型
                // 兼容 {reverseY}：腾讯矢量瓦片用 {-y}，归一化后变成 {reverseY}，
                // UrlTemplateImageryProvider 只把它当成普通占位符，因此只要包含
                // {z} 或 {x} 或 {y}（或 {reverseY}）之一就放行。
                if (!templateUrl) {
                    console.warn(`[CesiumProvider] 图源 "${descriptor.id}" URL 为空: ${templateUrl}`);
                    return null;
                }
                const hasAnyAxisToken =
                    templateUrl.includes('{z}') ||
                    templateUrl.includes('{x}') ||
                    templateUrl.includes('{y}') ||
                    templateUrl.includes('{reverseY}');
                if (!hasAnyAxisToken) {
                    console.warn(`[CesiumProvider] 图源 "${descriptor.id}" URL 缺少 {z}/{x}/{y}/{reverseY} 占位符: ${templateUrl}`);
                    return null;
                }

                provider = new Cesium.UrlTemplateImageryProvider({
                    url: templateUrl,
                    subdomains: subdomains.length > 0 ? subdomains : undefined,
                    tilingScheme: new Cesium.WebMercatorTilingScheme(),
                    maximumLevel: maxLevel,
                    enablePickFeatures: false,
                });

                if (templateUrl.includes('openstreetmap.org')) {
                    wrapProviderWithFetchFallback(Cesium, provider, abortSignal, {
                        isOsm: true,
                        descriptorId: descriptor.id,
                        templateUrl,
                        subdomains: subdomains.length > 0 ? subdomains : undefined,
                    });
                }
                break;
            }
        }

        if (abortSignal.aborted) {
            // 如果在创建过程中已被中断，销毁 provider
            if (provider && typeof provider.destroy === 'function') {
                try { provider.destroy(); } catch { /* 忽略 */ }
            }
            return null;
        }

        // 在 provider 上标记 descriptorId，便于后续追踪
        if (provider) {
            provider._descriptorId = descriptor.id;
            // 瓦片加载失败时尽量识别 429 并 toast（Cesium 错误对象不一定带 status）
            try {
                const errorEvent = (provider as any)?.errorEvent;
                if (errorEvent && typeof errorEvent.addEventListener === 'function') {
                    errorEvent.addEventListener((tileError: any) => {
                        const status =
                            Number(tileError?.statusCode) ||
                            Number(tileError?.status) ||
                            Number(tileError?.error?.statusCode) ||
                            0;
                        if (status === 429) {
                            notifyTileRateLimited();
                        }
                    });
                }
            } catch {
                // Provider 未实现 errorEvent 时忽略
            }
        }

        return provider;
    } catch (_error) {
        // 底图 Provider 创建失败:该图层不显示,以 message 提示用户(懒调用避免模块顶层执行)
        useMessage().error(`底图 "${descriptor.id}" 加载失败`);
        return null;
    }
}

/**
 * 批量创建 Cesium ImageryProvider 实例（用于预设 stack 中的多个图层源）
 *
 * @param Cesium Cesium 运行时对象
 * @param sourceIds 图层源 ID 数组（栈顺序）
 * @param ctx 运行时上下文
 * @returns 有效的 ImageryProvider 数组（跳过 null）
 */
export function createCesiumImageryProvidersFromStack(
    Cesium: CesiumRuntime,
    sourceIds: string[],
    ctx: CesiumProviderContext,
): ImageryProviderInstance[] {
    if (!Cesium || !Array.isArray(sourceIds)) return [];
    return buildCesiumImageryProvidersForPreset(Cesium, sourceIds, ctx);
}

// ========== 便捷出口函数 ==========

/**
 * Cesium 专属降级源映射表：
 * 针对 Cesium 暂不支持的服务类型（如 MVT 矢量瓦片），自动映射到对应的经典栅格切片源
 */
const CESIUM_SOURCE_FALLBACK_MAP: Record<string, string[]> = {
    // 天地图 MVT 矢量切片降级为经典天地图栅格矢量 + 高清注记
    vector_tianditu_mvt: ['vector_tianditu', 'label_tianditu'],
};

/**
 * 根据预设 ID 和堆叠的源 ID 列表创建 Cesium 底图
 * 这是从 useCesiumLayers 调用时的主要入口
 *
 * @param Cesium Cesium 运行时对象
 * @param sourceIds 源 ID 数组
 * @param ctx 运行时上下文
 * @returns 有效的 ImageryProvider 数组
 */
export function buildCesiumImageryProvidersForPreset(
    Cesium: CesiumRuntime,
    sourceIds: string[],
    ctx: CesiumProviderContext,
): ImageryProviderInstance[] {
    if (!Cesium || !Array.isArray(sourceIds)) return [];

    // 处理 Cesium 不支持源的降级映射（如 vector_tianditu_mvt -> vector_tianditu + label_tianditu）
    const effectiveSourceIds: string[] = [];
    for (const id of sourceIds) {
        if (CESIUM_SOURCE_FALLBACK_MAP[id]) {
            effectiveSourceIds.push(...CESIUM_SOURCE_FALLBACK_MAP[id]);
        } else {
            effectiveSourceIds.push(id);
        }
    }

    const providers: ImageryProviderInstance[] = [];

    for (const sourceId of effectiveSourceIds) {
        const descriptor = getDescriptorById(sourceId);
        if (!descriptor) {
            console.warn(`[CesiumProvider] 未找到描述符: ${sourceId}`);
            continue;
        }

        const provider = createCesiumImageryProvider(Cesium, descriptor, ctx);
        if (provider) {
            providers.push(provider);
        }
    }

    return providers;
}