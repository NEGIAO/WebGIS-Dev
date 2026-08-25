/**
 * 底图配置 — 单一真相源（SSOT）
 *
 * 职责：
 *   1. LAYER_SOURCE_DEFINITIONS — 所有底图定义的权威来源
 *      ├─ url 字段：plaintext 模板（含占位符），供 Cesium 通过 getDescriptorById() 自动派生
 *      └─ createSource 工厂：OL 引擎运行时调用，注入 token/代理等上下文
 *   2. TileSourceDescriptor + getDescriptorById() — Cesium 描述符自动派生（替代已删除的 sourceDescriptors.ts）
 *   3. BASEMAP_PRESETS (re-export) — 预设目录（实际定义在 basemapPresets.ts）
 *
 * ⚠️ URL 二字段的分工（不可合并）：
 *   - url        → 静态模板，Cesium 直接消费；占位符（{tiandituTk}/{ovitalTdtkey}/{customUrl}）由 Cesium 侧替换
 *   - createSource → OL 工厂函数；运行时会注入 tiandituTk/ovitalTdtkey/customUrl，且可能叠加代理/适配器逻辑
 *   二者结构不同（如天地图 url 含 &tk={tiandituTk}，createSource 用 buildTiandituUrl 拼 tk），
 *   JS 对象字面量无法自引用（无法在 createSource 内写 def.url），故接受"写两次"的现实。
 *
 * ⚠️ 增删改底图时的同步清单：
 *   - 必改：本文件的 LAYER_SOURCE_DEFINITIONS 一条定义（url + createSource + 元数据）
 *   - 必改：basemapPresets.ts 中的 preset（若需出现在预设列表中）
 *   - 无需改：Cesium 描述符（getDescriptorById 自动派生）
 *   - 无需改：sourceDescriptors.ts（已删除）
 */

import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import type {
    ConfiguredTileServiceDefinition,
    NonStandardXYZAdapter,
    TileSourceLike,
} from '@ol/tile-source';
import {
    buildMapsForFreeAdapter,
    createConfiguredServiceSource,
    createVectorTileSourceFromUrl,
    createXYZSourceFromUrl,
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
// 后端/瓦片代理基址统一由 publicRuntime 派生，禁止硬编码域名与直接读取 import.meta.env
import { backendTilesUrl, gcj2wgsProxyUrl, tileProxyUrl } from '@/config/publicRuntime';

// ========== 预设目录(已抽离至 basemapPresets.ts,原位 re-export 保持兼容) ==========
// 抽离原因见 basemapPresets.ts 头注释(切断登录页入口 → ol 的打包链)。
export { BASEMAP_PRESETS, DEFAULT_BASEMAP_PRESET_ID } from '@common/basemap/basemapPresets';
export type { BasemapPresetDefinition } from '@common/basemap/basemapPresets';

// ========== 类型定义 ==========
export type LayerCategory = 'label' | 'imagery' | 'terrain' | 'vector' | 'theme' | 'custom';
export type LayerGroup =
    | '自定义'
    | '影像'
    | '矢量'
    | '专题'
    | '注记'
    | 'Canvas'
    | '地形'
    | '海洋'
    | '参考'
    | '极地'
    | '世界'
    | '其他'
    | 'ESRI Online'
    | 'Root'
    | 'Navigation'
    | 'Elevation'
    | 'Ocean'
    | 'Polar'
    | 'Reference'
    | 'Specialty'
    | 'World';

export type TileSourceInstance = TileSourceLike | OSM | null;

export type LayerFactoryContext = {
    tiandituTk: string;
    ovitalTdtkey: string;
    customUrl: string;
};

export type LayerSourceDefinition = {
    id: string;
    name: string;
    category: LayerCategory;
    group: LayerGroup;
    defaultVisible?: boolean;
    adapters?: Record<string, NonStandardXYZAdapter>;
    /** plaintext URL 模板（含 {x}/{y}/{z}/{s}/{tiandituTk}/{customUrl} 等占位符）；Cesium 自动派生用，OL 不直接消费 */
    url: string;
    /** 服务类型（Cesium 引擎需要） */
    serviceType: 'xyz' | 'wms' | 'wmts' | 'osm' | 'vector-tile' | 'custom';
    /** 最大缩放级别 */
    maxZoom?: number;
    /** 瓦片像素比：HD/@2x 瓦片实际为 512×512 叠在 256 网格上时设为 2 */
    tilePixelRatio?: number;
    /** 子域名列表，用于负载均衡 */
    subdomains?: string[];
    /** 运行时需要替换的占位符列表 */
    needsContext?: ('tiandituTk' | 'ovitalTdtkey' | 'customUrl')[];
    /** 非标准适配器 ID（如 maps-for-free） */
    nonStandardAdapter?: string;
    /** WMS 专属参数 */
    wms?: {
        layers: string;
        version?: string;
        srs?: string;
        format?: string;
        styles?: string;
        transparent?: boolean;
    };
    /** WMTS 专属参数 */
    wmts?: {
        layer: string;
        style: string;
        matrixSet: string;
        format: string;
        version: string;
    };
    /** OL source 工厂：运行时调用，注入 tiandituTk/customUrl 上下文，可叠加代理/适配器逻辑；与 url 字段分工见文件头 */
    createSource: (ctx: LayerFactoryContext) => TileSourceInstance;
};

export type UserEditableTileLayerConfig = ConfiguredTileServiceDefinition & {
    category?: LayerCategory;
    group?: LayerGroup;
    defaultVisible?: boolean;
};

// ========== 主机配置常量 ==========
export const TILE_HOSTS = {
    tianditu: 't0.tianditu.gov.cn',
};

// ========== 非标准 XYZ 图源适配器 ==========
const NON_STANDARD_XYZ_ADAPTERS: Record<string, NonStandardXYZAdapter> = {
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
    'maps-for-free-ice': buildMapsForFreeAdapter('ice', '冰川(MFF)'),
};

// ========== 拼接 URL 工具函数 ==========
/** 拼接天地图瓦片服务 URL */
export const buildTiandituUrl = (pathAndQuery: string, tiandituTk: string): string => {
    const hasQuery = pathAndQuery.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `https://${TILE_HOSTS.tianditu}${pathAndQuery}${separator}tk=${tiandituTk}`;
};

/**
 * 拼接奥维瓦片服务 URL（tdtkey 为 L2 密钥，由管理员写入数据库，运行时注入）
 * @param pathAndQuery 奥维服务路径与查询串（如 /dia_w/wmts?...&TILECOL={x}）
 * @param tdtkey 奥维 TDT Key（来自运行时 token 池 ovital_tdtkey）
 * @returns 带 tdtkey 参数的完整 URL
 */
export const buildOvitalUrl = (pathAndQuery: string, tdtkey: string): string => {
    const hasQuery = pathAndQuery.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `https://omap.map-world.com.cn${pathAndQuery}${separator}tdtkey=${tdtkey}`;
};

/**
 * 为 source 标记 skipHighResTile 标志，用于注记图层跳过 zDirection 高清瓦片优化
 * （避免注记文字在非整数 zoom 时因取上层瓦片而显示过小）
 */
function withSkipHighResTile<T extends XYZ>(src: T): T & { skipHighResTile: true } {
    Object.assign(src, { skipHighResTile: true });
    return src as T & { skipHighResTile: true };
}

// ========== EOX Sentinel-2 无云年度镶嵌（2016~2025） ==========
// 年度图层命名：2016 对应聚合层 s2cloudless_3857（EOX 官方 WMTS 标题即 "Sentinel-2 cloudless layer for 2016"），
// 其余年份为 s2cloudless-{year}_3857；10 个年度条目结构相同，用生成器收敛，避免 10 份重复字面量。
const EOX_WMTS_URL = (layer: string): string =>
    `https://tiles.maps.eox.at/wmts?layer=${layer}&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}`;

/** 生成单个 Sentinel 无云年度图层定义（url 与 createSource 共用同一模板串，杜绝两字段漂移） */
function buildS2CloudlessDef(year: number): LayerSourceDefinition {
    const layerParam = year === 2016 ? 's2cloudless_3857' : `s2cloudless-${year}_3857`;
    const url = EOX_WMTS_URL(layerParam);
    return {
        id: `imagery_s2_cloudless_${year}`,
        name: `Sentinel无云${year}`,
        category: 'imagery',
        group: '影像',
        url,
        serviceType: 'xyz',
        createSource: () => prioritizeTileSourceRequest(new XYZ({ url })),
    };
}

// ========== 配置1：图层源定义 ==========
export const LAYER_SOURCE_DEFINITIONS: LayerSourceDefinition[] = [
    // 1、注记图层
    {
        id: 'Omap_label',
        name: '奥维注记',
        category: 'label',
        group: '注记',
        url: 'https://omap.map-world.com.cn/dia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=dia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&tdtkey={ovitalTdtkey}',
        serviceType: 'xyz',
        needsContext: ['ovitalTdtkey'],
        createSource: ({ ovitalTdtkey }) =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: buildOvitalUrl(
                            '/dia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=dia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}',
                            ovitalTdtkey,
                        ),
                    }),
                ),
            ),
    },
    {
        id: 'label_tianditu',
        name: '天地图注记',
        category: 'label',
        group: '注记',
        url: 'https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        serviceType: 'xyz',
        createSource: ({ tiandituTk }) =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: buildTiandituUrl(
                            '/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
                            tiandituTk,
                        ),
                    }),
                ),
            ),
    },
    {
        id: 'label_tianditu_vector',
        name: '天地图矢量注记',
        category: 'label',
        group: '注记',
        url: 'https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        serviceType: 'xyz',
        createSource: ({ tiandituTk }) =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: buildTiandituUrl(
                            '/cva_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
                            tiandituTk,
                        ),
                    }),
                ),
            ),
    },
    {
        id: 'label_tuxin',
        name: '图新注记',
        category: 'label',
        group: '注记',
        url: 'https://tiles.geovisearth.com/base/v1/cia/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
        serviceType: 'xyz',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: 'https://tiles.geovisearth.com/base/v1/cia/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
                    }),
                ),
            ),
    },
    {
        id: 'amap_label',
        name: '高德注记无偏',
        group: '注记',
        url: gcj2wgsProxyUrl(
            'http://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        ),
        serviceType: 'xyz',
        category: 'label',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: gcj2wgsProxyUrl(
                            'http://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                        ),
                    }),
                ),
            ),
    },
    {
        id: 'custom',
        name: '自定义URL',
        category: 'custom',
        group: '自定义',
        url: '',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'custom',
        createSource: ({ customUrl }) =>
            customUrl
                ? createXYZSourceFromUrl(customUrl, { adapters: NON_STANDARD_XYZ_ADAPTERS })
                : null,
    },
    // 2、地形图层
    {
        id: 'terrain_gac',
        name: 'Google山体阴影(gac)',
        category: 'terrain',
        group: '地形',
        url: 'https://gac-geo.googlecnapps.club/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://gac-geo.googlecnapps.club/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5',
                }),
            ),
    },
    {
        id: 'terrain_google',
        name: 'Google山体阴影',
        category: 'terrain',
        group: '地形',
        url: 'https://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5',
                }),
            ),
    },

    // 3、影像图层
    {
        id: 'imagery_tianditu',
        name: '天地图影像',
        category: 'imagery',
        group: '影像',
        url: 'https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        serviceType: 'xyz',
        createSource: ({ tiandituTk }) =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: buildTiandituUrl(
                        '/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
                        tiandituTk,
                    ),
                }),
            ),
    },
    {
        id: 'imagery_tuxin',
        name: '图新影像',
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.geovisearth.com/base/v1/img/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.geovisearth.com/base/v1/img/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
                }),
            ),
    },
    {
        id: 'imagery_amap',
        name: '高德影像(GCJ)',
        category: 'imagery',
        group: '影像',
        url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        id: 'imagery_amap_wgs',
        name: '高德影像(WGS)',
        category: 'imagery',
        group: '影像',
        url: gcj2wgsProxyUrl('http://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: gcj2wgsProxyUrl(
                        'http://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
                    ),
                }),
            ),
    },
    {
        id: 'imagery_google',
        name: 'Google原版',
        category: 'imagery',
        group: '影像',
        url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                    maxZoom: 20,
                }),
            ),
    },
    {
        id: 'imagery_gac',
        name: 'Google(gac)',
        category: 'imagery',
        group: '影像',
        url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}',
                    maxZoom: 20,
                }),
            ),
    },
    {
        id: 'theme_arcgis_imagery_root',
        name: 'ESRI影像图',
        category: 'imagery',
        group: 'World',
        // url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        // arcgisonline的域名被墙；但是wayback的arcgis域名可以访问；所以使用wayback的arcgis域名
        url: 'https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/26334/{z}/{y}/{x}',
        // id：26334是wayback的arcgis域名的服务id，对应的时间戳为最新的2026-08-05（仅部分地区，中国大陆部分的影像不会同步更新，但与大陆arcgisonline的影像相同，wayback的arcgis域名的服务更新更快，且可以访问）
        // 后续如果wayback的arcgis域名的服务id更新了，需要修改id为最新的服务id（参见后端api：/api/historical-imagery/esri-wayback/layers 为二次封装好的接口，可获取最新的服务id）
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    // url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    url: 'https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/26334/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'imagery_google_standard',
        name: 'Google标准',
        category: 'imagery',
        group: '影像',
        url: 'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga',
                }),
            ),
    },
    {
        id: 'imagery_google_water',
        name: 'Google水系(WGS)',
        category: 'imagery',
        group: '影像',
        url: gcj2wgsProxyUrl(
            'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=zh-CN&apistyle=s.t:0%7Cp.v:off,s.t:6%7Cp.v:on',
        ),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: gcj2wgsProxyUrl(
                        'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=zh-CN&apistyle=s.t:0%7Cp.v:off,s.t:6%7Cp.v:on',
                    ),
                }),
            ),
    },
    {
        id: 'imagery_mapbox',
        name: 'Mapbox影像',
        category: 'imagery',
        group: '影像',
        url: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
                }),
            ),
    },
    {
        id: 'imagery_yandex',
        name: 'Yandex影像',
        category: 'imagery',
        group: '影像',
        url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({ url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}' }),
            ),
    },
    {
        id: 'imagery_maptiler_satellite',
        name: 'MapTiler影像',
        category: 'imagery',
        group: '影像',
        url: 'https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
                }),
            ),
    },
    {
        id: 'imagery_maptiler_satellite_hd',
        name: 'MapTiler影像HD',
        category: 'imagery',
        group: '影像',
        url: 'https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}@2x.jpg?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}@2x.jpg?key=osLOujcXk1GJrGk5oaDz',
                    // HD 瓦片实际尺寸 512×512，叠在 256 瓦片网格上（@2x）。
                    // 显式声明 tilePixelRatio:2，让 OL 按 256 网格缩放还原，
                    // 避免被默认按 256 像素拉伸导致糊化与地理套合错位。
                    tilePixelRatio: 2,
                }),
            ),
    },
    {
        id: 'imagery_alidade_satellite',
        name: 'Alidade卫星',
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'label_stamen_toner_lines',
        name: 'Stamen线划',
        category: 'label',
        group: '注记',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                    }),
                ),
            ),
    },
    {
        id: 'label_stamen_toner_labels',
        name: 'Stamen注记',
        category: 'label',
        group: '注记',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                    }),
                ),
            ),
    },

    // Sentinel-2 无云年度镶嵌（EOX，2016~2025；公开服务无需 token）
    ...Array.from({ length: 10 }, (_, i) => buildS2CloudlessDef(2016 + i)),

    // 4、专题图层 - WMS/WMTS
    {
        id: 'theme_gd_basic_farmland_wms',
        name: '广东基本农田(WMS)',
        category: 'theme',
        group: '专题',
        url: 'https://guangdong.tianditu.gov.cn/geostar/gdsyjjbntbhtb_mercator/wms',
        serviceType: 'wms',
        createSource: () =>
            createConfiguredServiceSource(
                {
                    id: 'theme_gd_basic_farmland_wms',
                    name: '广东基本农田(WMS)',
                    serviceType: 'wms',
                    url: 'https://guangdong.tianditu.gov.cn/geostar/gdsyjjbntbhtb_mercator/wms',
                    wms: {
                        layers: '基本农田保护图斑_mercator',
                        version: '1.1.1',
                        srs: 'EPSG:3857',
                        format: 'image/png',
                        styles: '',
                        transparent: true,
                    },
                },
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_hn_basic_farmland_wmts',
        name: '河南基本农田(WMTS)',
        category: 'theme',
        group: '专题',
        url: 'https://www.hnsditu.cn/iserver/services/map-agscache-jibennongtian/wmts100?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=jibennongtian&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_jibennongtian&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
        serviceType: 'wmts',
        createSource: () =>
            createConfiguredServiceSource(
                {
                    id: 'theme_hn_basic_farmland_wmts',
                    name: '河南基本农田(WMTS)',
                    serviceType: 'wmts',
                    url: 'https://www.hnsditu.cn/iserver/services/map-agscache-jibennongtian/wmts100?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=jibennongtian&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_jibennongtian&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
                    wmts: {
                        layer: 'jibennongtian',
                        style: 'default',
                        matrixSet: 'GoogleMapsCompatible_jibennongtian',
                        format: 'image/png',
                        version: '1.0.0',
                    },
                },
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_hn_farmland_wmts',
        name: '河南耕地(WMTS)',
        category: 'theme',
        group: '专题',
        url: 'https://www.hnsditu.cn/iserver/services/map-agscache-gengdi/wmts100?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=gengdi&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_gengdi&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
        serviceType: 'wmts',
        createSource: () =>
            createConfiguredServiceSource(
                {
                    id: 'theme_hn_farmland_wmts',
                    name: '河南耕地(WMTS)',
                    serviceType: 'wmts',
                    url: 'https://www.hnsditu.cn/iserver/services/map-agscache-gengdi/wmts100?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=gengdi&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_gengdi&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
                    wmts: {
                        layer: 'gengdi',
                        style: 'default',
                        matrixSet: 'GoogleMapsCompatible_gengdi',
                        format: 'image/png',
                        version: '1.0.0',
                    },
                },
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },

    // 5、ArcGIS Online 服务
    {
        id: 'theme_arcgis_canvas_dark_base',
        name: 'ESRI深灰色底图',
        category: 'theme',
        group: 'Canvas',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_canvas_dark_ref',
        name: 'ESRI深灰色参考注记',
        category: 'theme',
        group: 'Canvas',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_canvas_light_base',
        name: 'ESRI浅灰色底图',
        category: 'theme',
        group: 'Canvas',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_canvas_light_ref',
        name: 'ESRI浅灰色参考注记',
        category: 'theme',
        group: 'Canvas',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_ocean_base',
        name: 'ESRI海洋底图',
        category: 'theme',
        group: 'Ocean',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_ocean_ref',
        name: 'ESRI海洋参考注记',
        category: 'theme',
        group: 'Ocean',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'imagery_arcgis_polar_ant_img',
        name: 'ESRI南极影像',
        category: 'imagery',
        group: 'Polar',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Antarctic_Imagery/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Antarctic_Imagery/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'imagery_arcgis_polar_arc_img',
        name: 'ESRI北极影像',
        category: 'imagery',
        group: 'Polar',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Imagery/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Imagery/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_polar_arc_base',
        name: 'ESRI北极底图',
        category: 'theme',
        group: 'Polar',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'label_arcgis_polar_arc_ref',
        name: 'ESRI北极参考注记',
        category: 'label',
        group: 'Polar',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_ref_boundaries',
        name: 'ESRI世界边界地名',
        category: 'theme',
        group: 'Reference',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_ref_boundaries_alt',
        name: 'ESRI世界边界地名(备选)',
        category: 'theme',
        group: 'Reference',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places_Alternate/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places_Alternate/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_ref_overlay',
        name: 'ESRI世界参考叠加层',
        category: 'theme',
        group: 'Reference',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_ref_transport',
        name: 'ESRI世界交通',
        category: 'theme',
        group: 'Reference',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_spec_nav',
        name: 'ESRI世界航海图',
        category: 'theme',
        group: 'Specialty',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Specialty/World_Navigation_Charts/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Specialty/World_Navigation_Charts/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_natgeo_world',
        name: '国家地理世界地图',
        category: 'theme',
        group: 'World',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_usa_topo',
        name: 'USA地形图',
        category: 'theme',
        group: 'World',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_physical_root',
        name: '世界自然地理图',
        category: 'theme',
        group: 'World',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_shaded_relief',
        name: '世界地形渲染图',
        category: 'theme',
        group: 'World',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_street_root',
        name: '世界街道图',
        category: 'theme',
        group: 'World',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_terrain_base',
        name: '世界地形底图',
        category: 'theme',
        group: 'World',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'theme_arcgis_topo_root',
        name: '世界地形图',
        category: 'theme',
        group: 'World',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },

    // 6、其他专题图层
    {
        id: 'terrain_esa',
        name: '欧空局地形',
        category: 'terrain',
        group: '专题',
        url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png',
                }),
            ),
    },
    {
        id: 'theme_windy',
        name: 'windy',
        category: 'theme',
        group: '专题',
        url: 'https://tiles.windy.com/v1/maptiles/outdoor/{z}/{x}/{y}/?lang=en',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.windy.com/v1/maptiles/outdoor/{z}/{x}/{y}/?lang=en',
                }),
            ),
    },
    {
        id: 'theme_windy2',
        name: 'windy2',
        category: 'theme',
        group: '专题',
        url: 'https://tiles.windy.com/v1/maptiles/winter/{z}/{x}/{y}/?lang=en',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.windy.com/v1/maptiles/winter/{z}/{x}/{y}/?lang=en',
                }),
            ),
    },
    {
        id: 'theme_windy_outer',
        name: 'windy轮廓',
        category: 'theme',
        group: '专题',
        url: 'https://tiles.windy.com/tiles/v10.0/darkmap-retina/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.windy.com/tiles/v10.0/darkmap-retina/{z}/{x}/{y}.png',
                }),
            ),
    },
    {
        id: 'theme_windy_greenland',
        name: 'windy Gray',
        category: 'theme',
        group: '专题',
        url: 'https://tiles.windy.com/tiles/v10.0/grayland/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/grayland/{z}/{x}/{y}.png' }),
            ),
    },
    {
        id: 'theme_maptiler_winter',
        name: 'MapTiler冬季',
        category: 'theme',
        group: '专题',
        url: 'https://api.maptiler.com/maps/winter-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/winter-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
                }),
            ),
    },
    {
        id: 'theme_maptiler_ocean',
        name: 'MapTiler海洋',
        category: 'theme',
        group: 'Ocean',
        url: 'https://api.maptiler.com/maps/ocean-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/ocean-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
                }),
            ),
    },
    {
        id: 'theme_stamen_watercolor',
        name: 'Stamen水彩',
        category: 'theme',
        group: '专题',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },

    // 7、MFF 专题层
    {
        id: 'theme_mff_water',
        name: 'MFF水体',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/water/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/water/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_admin',
        name: 'MFF行政边界',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/admin/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/admin/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_streets',
        name: 'MFF街道',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/streets/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/streets/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_country',
        name: 'MFF国家边界',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/country/z{z}/row{y}/{z}_{x}-{y}.png',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/country/z{z}/row{y}/{z}_{x}-{y}.png',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_crop',
        name: 'MFF作物',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/crop/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/crop/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_grass',
        name: 'MFF草地',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/grass/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/grass/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_forest',
        name: 'MFF森林',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/forest/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/forest/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_tundra',
        name: 'MFF冻土',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/tundra/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/tundra/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_sand',
        name: 'MFF沙地',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/sand/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/sand/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_swamp',
        name: 'MFF沼泽',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/swamp/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/swamp/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'theme_mff_ice',
        name: 'MFF冰川',
        category: 'theme',
        group: '专题',
        url: 'https://maps-for-free.com/layer/ice/z{z}/row{y}/{z}_{x}-{y}.gif',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/ice/z{z}/row{y}/{z}_{x}-{y}.gif',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'terrain_relief',
        name: '地形浮雕(MFF)',
        category: 'terrain',
        group: '专题',
        url: 'https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'xyz',
        createSource: () =>
            createXYZSourceFromUrl(
                'https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg',
                { adapters: NON_STANDARD_XYZ_ADAPTERS },
            ),
    },
    {
        id: 'terrain_maptiler_landscape',
        name: 'MapTiler地貌',
        category: 'terrain',
        group: '专题',
        url: 'https://api.maptiler.com/maps/landscape-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/landscape-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
                }),
            ),
    },
    {
        id: 'terrain_maptiler_topo',
        name: 'MapTiler地形图',
        category: 'terrain',
        group: '专题',
        url: 'https://api.maptiler.com/maps/topo-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/topo-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
                }),
            ),
    },
    {
        id: 'terrain_stamen',
        name: 'Stamen地形',
        category: 'terrain',
        group: '地形',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'terrain_outdoors',
        name: 'Stadia户外',
        category: 'terrain',
        group: '地形',
        url: 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },

    // 8、矢量图层
    {
        id: 'vector_tianditu',
        name: '天地图矢量',
        category: 'vector',
        group: '矢量',
        url: 'https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        serviceType: 'xyz',
        createSource: ({ tiandituTk }) =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: buildTiandituUrl(
                        '/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
                        tiandituTk,
                    ),
                }),
            ),
    },
    {
        id: 'vector_tuxin',
        name: '图新矢量',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.geovisearth.com/base/v1/vec/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.geovisearth.com/base/v1/vec/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
                }),
            ),
    },
    {
        id: 'vector_amap',
        name: '高德地图(GCJ)',
        category: 'vector',
        group: '矢量',
        url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        id: 'vector_amap_wgs',
        name: '高德地图(WGS)',
        category: 'vector',
        group: '矢量',
        url: gcj2wgsProxyUrl(
            'http://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        ),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: gcj2wgsProxyUrl(
                        'http://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                    ),
                }),
            ),
    },
    {
        id: 'vector_maptiler_streets',
        name: 'MapTiler街道',
        category: 'vector',
        group: '矢量',
        url: 'https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
                }),
            ),
    },
    {
        id: 'vector_tengxun',
        name: '腾讯地图(GCJ)',
        category: 'vector',
        group: '矢量',
        url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0',
                }),
            ),
    },
    {
        id: 'vector_Google_clean',
        name: 'Google简洁(wgs)',
        category: 'vector',
        group: '矢量',
        url: gcj2wgsProxyUrl(
            'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off',
        ),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: gcj2wgsProxyUrl(
                        'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off',
                    ),
                }),
            ),
    },
    {
        id: 'vector_osm',
        name: 'OSM标准',
        category: 'vector',
        group: '矢量',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        serviceType: 'osm',
        createSource: () => new OSM(),
    },
    {
        id: 'vector_cyclosm',
        name: 'CyclOSM骑行',
        category: 'vector',
        group: '矢量',
        url: 'https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                }),
            ),
    },
    {
        id: 'vector_carton_light',
        name: 'CartoDB',
        category: 'vector',
        group: '矢量',
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' }),
            ),
    },
    {
        id: 'vector_carton_dark',
        name: 'CartoDB Dark',
        category: 'vector',
        group: '矢量',
        url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' }),
            ),
    },
    {
        id: 'vector_wikipedia',
        name: 'Wikipedia',
        category: 'vector',
        group: '矢量',
        url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({ url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png' }),
            ),
    },
    {
        id: 'vector_toner',
        name: 'Stamen Toner',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_alidade',
        name: 'Alidade Sm',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_stamen_toner_background',
        name: 'Stamen Toner底',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_stamen_toner_lite',
        name: 'Stamen Toner浅',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_alidade_smooth_dark',
        name: 'Alidade暗色',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_osm_bright',
        name: 'OSM Bright',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_geoq_hydro',
        name: 'GeoQ水(GCJ)',
        category: 'vector',
        group: '矢量',
        url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
                }),
            ),
    },
    {
        id: 'vector_henu_border_pbf',
        name: 'HENU边界矢量',
        category: 'vector',
        group: '矢量',
        url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/Border_Vector/VectorTileServer/tile/{z}/{y}/{x}.pbf',
        serviceType: 'vector-tile',
        createSource: () =>
            createVectorTileSourceFromUrl(
                'https://webgis.henu.edu.cn/server/rest/services/Hosted/Border_Vector/VectorTileServer/tile/{z}/{y}/{x}.pbf',
            ),
    },

    // 9、地形图层
    {
        id: 'terrain_opentopomap',
        name: '地形图',
        category: 'terrain',
        group: '专题',
        url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' }),
            ),
    },
    {
        id: 'terrain_omap_contour',
        name: '奥维等高线',
        category: 'terrain',
        group: '专题',
        url: 'https://omap.map-world.com.cn/dgx_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=dgx&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&tdtkey={ovitalTdtkey}',
        serviceType: 'xyz',
        needsContext: ['ovitalTdtkey'],
        createSource: ({ ovitalTdtkey }) =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: buildOvitalUrl(
                        '/dgx_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=dgx&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}',
                        ovitalTdtkey,
                    ),
                }),
            ),
    },
    {
        id: 'terrain_arcgis_elev_hillshade',
        name: 'ESRI世界山体阴影',
        category: 'terrain',
        group: 'Elevation',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'terrain_arcgis_elev_hillshade_dark',
        name: 'ESRI深色山体阴影',
        category: 'terrain',
        group: 'Elevation',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },

    // 10、自定义图层
    {
        id: 'local_tiles',
        name: '自定义瓦片',
        category: 'custom',
        group: '自定义',
        url: 'https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png',
                }),
            ),
    },
    {
        id: 'google_Backend_Proxy',
        name: '后端代理',
        category: 'custom',
        group: '自定义',
        url: tileProxyUrl('mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: tileProxyUrl('mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'),
                }),
            ),
    },
    {
        id: 'ships66',
        name: '船舶网',
        category: 'custom',
        group: '自定义',
        url: backendTilesUrl('ships66/{z}/{x}/{y}.png'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: backendTilesUrl('ships66/{z}/{x}/{y}.png'),
                }),
            ),
    },
    {
        id: 'custom_mapbox_labeled',
        name: 'Mapbox 自定义',
        category: 'custom',
        group: '自定义',
        url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo6wg8dm003v01s8d58qckdv/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo6wg8dm003v01s8d58qckdv/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
                }),
            ),
    },
    {
        id: 'custom_mapbox_unlabeled',
        name: 'Mapbox 自定义(无标注)',
        category: 'custom',
        group: '自定义',
        url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo71ml4b001m01sp8u9o773g/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo71ml4b001m01sp8u9o773g/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
                }),
            ),
    },
    {
        id: 'custom_China_Blender',
        name: 'China Blender',
        category: 'custom',
        group: '自定义',
        url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
                }),
            ),
    },
];

// ========== Cesium 描述符自动派生（SSOT：从 LAYER_SOURCE_DEFINITIONS 派生，替代已删除的 sourceDescriptors.ts） ==========

/** 引擎无关的瓦片源描述符（Cesium 引擎使用）；字段与 LayerSourceDefinition 子集对齐，但不包含 createSource */
export type TileSourceDescriptor = {
    id: string;
    name: string;
    category: LayerCategory;
    group: LayerGroup;
    serviceType: 'xyz' | 'wms' | 'wmts' | 'osm' | 'vector-tile' | 'custom';
    url: string;
    maxZoom?: number;
    tilePixelRatio?: number;
    subdomains?: string[];
    nonStandardAdapter?: string;
    needsContext?: ('tiandituTk' | 'ovitalTdtkey' | 'customUrl')[];
    wms?: {
        layers: string;
        version?: string;
        srs?: string;
        format?: string;
        styles?: string;
        transparent?: boolean;
    };
    wmts?: {
        layer: string;
        style: string;
        matrixSet: string;
        format: string;
        version: string;
    };
};

/** 内部索引：id → LayerSourceDefinition 映射，供 getDescriptorById 查表用 */
const LAYER_SOURCE_MAP = new Map(LAYER_SOURCE_DEFINITIONS.map((d) => [d.id, d]));

/** 运行时密钥池类型：与后端 api_keys 表 key_name 一一对应 */
export type RuntimeTokenPoolKey = 'tianditu_tk' | 'ovital_tdtkey';

/**
 * 根据图层 ID 解析其运行时密钥池（SSOT：依据 needsContext 声明判定，杜绝字符串猜测）
 * 供容灾轮换使用：图层失败 → 判定所属密钥池 → 轮换该池备用 key
 * @param layerId 图层源 ID
 * @returns 密钥池 key；非 token 依赖图层返回 null
 */
export function resolveRuntimeTokenPoolKey(layerId: string): RuntimeTokenPoolKey | null {
    const def = LAYER_SOURCE_MAP.get(String(layerId || '').trim());
    if (!def?.needsContext?.length) return null;
    if (def.needsContext.includes('tiandituTk')) return 'tianditu_tk';
    if (def.needsContext.includes('ovitalTdtkey')) return 'ovital_tdtkey';
    return null;
}

/**
 * 根据 id 获取 Cesium 兼容的图层描述符
 * 从 LAYER_SOURCE_DEFINITIONS 自动派生（主字段直接复制），无需人工维护 → 彻底消除 sourceDescriptors.ts 的漂移风险
 * ⚠️ 返回值只读：嵌套字段（needsContext / wms / wmts）与原始定义共享同一引用，消费方禁止修改，否则污染 SSOT 源数据
 */
export function getDescriptorById(id: string): TileSourceDescriptor | undefined {
    const def = LAYER_SOURCE_MAP.get(id);
    if (!def) return undefined;
    return {
        id: def.id,
        name: def.name,
        category: def.category,
        group: def.group,
        serviceType: def.serviceType,
        url: def.url,
        maxZoom: def.maxZoom,
        tilePixelRatio: def.tilePixelRatio,
        subdomains: def.subdomains,
        nonStandardAdapter: def.nonStandardAdapter,
        needsContext: def.needsContext,
        wms: def.wms,
        wmts: def.wmts,
    };
}

/**
 * 获取所有描述符的 ID 列表
 * 用于 Cesium 构建图层枚举（与 LAYER_SOURCE_DEFINITIONS 同序）
 */
export function getAllDescriptorIds(): string[] {
    return LAYER_SOURCE_DEFINITIONS.map((d) => d.id);
}
