/**
 * 统一底图目录类型（引擎无关，纯数据）。
 *
 * 设计文档：Docs/Architecture/basemap-catalog-redesign.md
 * 阶段 1 只建立目录元数据骨架；阶段 2 再把 OL 图层定义迁入本目录。
 */

export type BasemapCategory =
    | 'service'
    | 'recommended'
    | 'imagery'
    | 'terrain'
    | 'electronic'
    | 'historical'
    | 'vector';

export type BasemapProvider =
    | 'AMAP'
    | 'Google'
    | 'Tianditu'
    | 'Tuxin'
    | 'Baidu'
    | 'Tencent'
    | 'ESRI'
    | 'MapTiler'
    | 'Mapbox'
    | 'OSM'
    | 'Carto'
    | 'Stadia'
    | 'Stamen'
    | 'OpenFreeMap'
    | 'VersaTiles'
    | 'MapLibre'
    | 'Jawg'
    | 'Protomaps'
    | 'MFF'
    | 'MineMap'
    | 'GeoQ'
    | 'Windy'
    | 'Sentinel'
    | 'ESRI Wayback'
    | 'NASA'
    | 'Bing'
    | 'OpenSeaMap'
    | 'OpenRailwayMap'
    | 'Local'
    | 'Custom'
    | 'Other';

export type BasemapCoord = 'WGS84' | 'GCJ02' | 'BD09' | 'NONE' | 'MIXED';

export type BasemapServiceType =
    | 'xyz'
    | 'wms'
    | 'wmts'
    | 'osm'
    | 'vector-tile'
    | 'custom'
    | 'service-trigger';

/** 阶段 2 迁入的完整图层定义；此处先声明，供 registry 与后续适配层共用。 */
export interface BasemapLayerDefinition {
    id: string;
    name: string;
    /** 源定义中显式声明的统一目录分类 */
    catalogCategory: BasemapCategory;
    serviceType: BasemapServiceType;
    url: string;
    defaultVisible?: boolean;

    category: BasemapCategory;
    provider: BasemapProvider;
    coord: BasemapCoord;
    description: string;
    keywords?: string[];
    tags?: string[];
    date?: string | number;
    source?: string;
    recommended?: boolean;
    /** V3.7.16：纠偏/代理标识——correction≠none 或 proxy='proxy'（必经 VPS 瓦片代理） */
    proxied?: boolean;

    needsContext?: unknown;
    tokenParam?: string;
    maxZoom?: number;
    tilePixelRatio?: number;
    subdomains?: string[];
    adapters?: unknown;
    styleUrl?: string;
    wms?: unknown;
    wmts?: unknown;
    nonStandardAdapter?: string;
    fallbackLayerId?: string;
}

/** 带编号与展示元数据的预设条目（编号即 URL 参数 l 的 1-based 值）。 */
export interface BasemapCatalogEntry {
    /** 原 preset id，永不改变 */
    id: string;
    /** 不含编号的短名 */
    label: string;
    stack: string[];
    /** URL 参数 l 的 1-based 编号 */
    number: number;
    /** 与 BASEMAP_OPTIONS 一致的带编号 label */
    displayLabel: string;

    category: BasemapCategory;
    provider: BasemapProvider;
    coord: BasemapCoord;
    description: string;
    keywords: string[];
    tags: string[];
    date?: string | number;
    source?: string;
    recommended: boolean;
    /** V3.7.16：纠偏/代理标识（correction≠none 或 proxy='proxy'），条目渲染 proxy 徽标 */
    proxied?: boolean;
    dynamic?: 'wayback' | 'custom-service';
    /** 动态目录项（如 ESRI Wayback 快照）选中时直接使用的 URL */
    customUrl?: string;
}

export interface BasemapProviderNode {
    provider: BasemapProvider;
    /** V3.7.16：第三级坐标目录移除，条目直接平铺在服务商层（按 COORD_ORDER 排序），
     *  坐标信息由条目自身的坐标徽标 / tooltip / 搜索面包屑承载 */
    entries: BasemapCatalogEntry[];
}

export interface BasemapCategoryNode {
    category: BasemapCategory;
    providers: BasemapProviderNode[];
    /** 常用推荐：平铺条目，不再分服务商/坐标系 */
    entries?: BasemapCatalogEntry[];
}
