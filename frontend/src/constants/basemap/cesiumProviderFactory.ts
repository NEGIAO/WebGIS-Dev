/**
 * Cesium ImageryProvider 工厂
 * 将引擎无关的 TileSourceDescriptor 转换为 Cesium.ImageryProvider 实例
 * 支持快速底图切换——使用 AbortController 中断旧请求，与 OL 侧 fetch() 策略一致
 */
import type { TileSourceDescriptor } from './sourceDescriptors';
import { getDescriptorById } from './sourceDescriptors';

/** 创建 Provider 所需的运行时上下文 */
export type CesiumProviderContext = {
    tiandituTk: string;
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
            return { url, subdomains: ['a', 'b', 'c'] };
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
        // OL 风格的 URL 里经常有未被花括号包裹的 % 转义占位符（典型例子：
        // Google apistyle= 里的 %7C / %2C）。Cesium 会按字面输出，
        // 必须把它们解码回原始字符，否则像 ?apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off
        // 里的 | 在 Google 端会被识别为 OR 字符，导致瓦片样式错乱或 404。
        .replace(/%7C/gi, '|')
        .replace(/%2C/gi, ',');
}

/**
 * 解析上下文占位符，替换 URL 中的 {tiandituTk}、{customUrl}、{normBase}
 * @param url URL 模板
 * @param ctx 运行时上下文
 * @returns 解析后的 URL
 */
function resolveContextPlaceholders(url: string, ctx: CesiumProviderContext): string {
    let resolved = url;
    if (ctx.tiandituTk) {
        resolved = resolved.replace(/\{tiandituTk\}/g, ctx.tiandituTk);
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
                if (typeof Cesium.OpenStreetMapImageryProvider === 'function') {
                    provider = new Cesium.OpenStreetMapImageryProvider({
                        maximumLevel: maxLevel,
                    });
                } else {
                    // 降级为 UrlTemplateImageryProvider
                    provider = new Cesium.UrlTemplateImageryProvider({
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        maximumLevel: maxLevel,
                    });
                }
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
        }

        return provider;
    } catch (error) {
        console.error(`[CesiumProvider] 创建 "${descriptor.id}" 的 ImageryProvider 失败:`, error);
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

    const providers: ImageryProviderInstance[] = [];

    for (const sourceId of sourceIds) {
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