/**
 * OL 瓦片源工厂（V3.7.16 层定义驱动重构）
 *
 * 唯一入口 createOlSource(definition, ctx)：定义 → ol/source。
 * 取代 174 条定义里各写的 createSource 工厂（url 与 createSource 写两次、
 * 定义里直接 import OL 的问题至此消除）。
 *
 * 与旧 createSource 的逐分支等价关系（见 scripts/check-basemap-migration.mjs）：
 * - xyz（无适配器）：prioritizeTileSourceRequest(new XYZ({url, maxZoom, tilePixelRatio}))
 * - xyz（nonStandardAdapter）：createXYZSourceFromUrl(url, {adapters})，不套 prioritize
 *   （旧 MFF / custom 定义同样不套，行为保持一致）
 * - wmts：经 createConfiguredServiceSource 走 XYZ（GetTile 模板形态）——旧
 *   createConfiguredServiceSource 的 wmts 分支本就返回 XYZ，同步工厂无法拉取
 *   Capabilities、手写 tileGrid 属猜测，故不改成真正的 ol WMTS（见日志）
 * - wms：经 createConfiguredServiceSource 走 TileWMS（与旧一致）
 * - mvt：createVectorTileSourceFromUrl + styleUrl（旧一致；不套 prioritize）
 * - osm：prioritizeTileSourceRequest(new OSM())（旧一致）
 * - custom：customUrl 为空返回 null，否则 createXYZSourceFromUrl(customUrl, {adapters})
 * 建完统一：skipHighResTile 的定义包 withSkipHighResTile（注记图层跳过
 * zDirection 高清瓦片优化，见 basemapLayerFactory.buildRasterBasemapSource）。
 *
 * 天地图子域：OL 的 renderXYZTemplate 不展开 {s}（ol/tileurlfunction.js），
 * 故天地图模板的 t{s} 在此钉为 t0——与旧 buildTiandituUrl 的输出逐字节一致。
 * Cesium 侧保留 {s}（其 normalizeSubdomainRange 会展开），不在此处理。
 */

import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import type { TileSourceLike } from '@ol/tile-source';
import {
    createConfiguredServiceSource,
    createVectorTileSourceFromUrl,
    createXYZSourceFromUrl,
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import { TILE_PROXY_BASE_URL } from '@/config/publicRuntime';
import type {
    TileLayerContext,
    TileLayerDefinition,
} from '@common/basemap/definitions/types';
import { resolveTileUrl } from '@common/basemap/definitions/resolveTileUrl';
import { NON_STANDARD_XYZ_ADAPTERS } from './nonStandardAdapters';

/** 旧 createSource 的返回类型：XYZ | TileWMS | WMTS | VectorTileSource | OSM | null */
export type OlTileSourceInstance = TileSourceLike | OSM | null;

/**
 * 为 source 标记 skipHighResTile 标志，用于注记图层跳过 zDirection 高清瓦片优化
 * （避免注记文字在非整数 zoom 时因取上层瓦片而显示过小）
 */
export function withSkipHighResTile<T extends XYZ>(src: T): T & { skipHighResTile: true } {
    Object.assign(src, { skipHighResTile: true });
    return src as T & { skipHighResTile: true };
}

/**
 * 解析 OL 侧最终瓦片 URL：先走共用 resolveTileUrl（占位符 + 纠偏/代理），
 * 再把天地图的 t{s} 子域钉为 t0（OL 不展开 {s}，见文件头）。
 */
function resolveOlTileUrl(definition: TileLayerDefinition, ctx: TileLayerContext): string {
    const url = resolveTileUrl(definition, {
        ...ctx,
        tileProxyBaseUrl: TILE_PROXY_BASE_URL,
    });
    return url.replace('t{s}.tianditu.gov.cn', 't0.tianditu.gov.cn');
}

/**
 * 根据图层定义创建 OL 瓦片源
 * @param definition 图层定义（common 定义层，纯数据）
 * @param ctx 运行时上下文（tiandituTk / ovitalTdtkey / customUrl）
 * @returns OL source 实例；custom 且 customUrl 为空、或不支持的类型返回 null
 */
export function createOlSource(
    definition: TileLayerDefinition,
    ctx: TileLayerContext,
): OlTileSourceInstance {
    if (!definition) return null;

    const url = resolveOlTileUrl(definition, ctx);
    const xyzOptions: { maxZoom?: number; tilePixelRatio?: number } = {};
    if (typeof definition.maxZoom === 'number') xyzOptions.maxZoom = definition.maxZoom;
    if (typeof definition.tilePixelRatio === 'number') {
        xyzOptions.tilePixelRatio = definition.tilePixelRatio;
    }

    let source: OlTileSourceInstance;

    switch (definition.method) {
        case 'osm': {
            source = prioritizeTileSourceRequest(new OSM());
            break;
        }
        case 'custom': {
            if (!ctx.customUrl) return null;
            source = createXYZSourceFromUrl(ctx.customUrl, {
                adapters: NON_STANDARD_XYZ_ADAPTERS,
            });
            break;
        }
        case 'mvt': {
            const vectorSource = createVectorTileSourceFromUrl(url);
            if (definition.styleUrl) vectorSource.set('styleUrl', definition.styleUrl);
            source = vectorSource;
            break;
        }
        case 'wms':
        case 'wmts': {
            // 与旧 createConfiguredServiceSource 完全一致：wms → TileWMS，
            // wmts（GetTile 模板）→ XYZ；adapters 透传（对两条河南 WMTS 是 no-op）。
            source = createConfiguredServiceSource(
                {
                    id: definition.id,
                    name: definition.name,
                    serviceType: definition.method,
                    url,
                    ...(definition.wms ? { wms: definition.wms } : {}),
                    ...(definition.wmts ? { wmts: definition.wmts } : {}),
                },
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            );
            break;
        }
        case 'xyz':
        default: {
            if (definition.nonStandardAdapter) {
                // maps-for-free 等非标准 URL：由适配器改写 tileUrlFunction（旧一致，不套 prioritize）
                source = createXYZSourceFromUrl(url, {
                    adapters: NON_STANDARD_XYZ_ADAPTERS,
                    ...(typeof xyzOptions.tilePixelRatio === 'number'
                        ? { tilePixelRatio: xyzOptions.tilePixelRatio }
                        : {}),
                });
            } else {
                source = prioritizeTileSourceRequest(new XYZ({ url, ...xyzOptions }));
            }
            break;
        }
    }

    if (definition.skipHighResTile && source instanceof XYZ) {
        source = withSkipHighResTile(source);
    }

    return source;
}
