/**
 * WMS / ArcGIS 服务元信息的公共契约
 *
 * 由三个解析器（Capabilities XML / ArcGIS f=json / URL 查询串）共同产出，
 * 引擎侧（OL wmsSource、Cesium remoteService）只按本契约消费。
 */

/** 图层选择项（Capabilities 树形枚举与 ArcGIS 子图层统一形态） */
export interface WmsLayerOption {
    /** LAYERS 参数值；组图层为其下全部图层名按序拼接 */
    name: string;
    /** 展示名 */
    title: string;
    /** 上级分组路径（"A / B"），顶层为空串 */
    path: string;
    /** 选择器文案 */
    label: string;
}

/** 服务元信息（ensureWmsServiceInfo 的产物） */
export interface WmsServiceInfo {
    /** 默认 LAYERS 参数值；空串表示服务自身默认可见图层 */
    layers: string;
    title: string;
    layerOptions: WmsLayerOption[];
    /** 服务地理范围 [w, s, e, n]（EPSG:4326）；不可得时为 null */
    geographicBbox?: number[] | null;
    version: string;
    format: string;
    /** 服务声明的 CRS/SRS 原文列表 */
    crsList: string[];
    /** 归一化后的首选坐标系（EPSG:3857 / EPSG:4326） */
    srs: string;
    /** 是否按 Web 墨卡托出图 */
    mercator: boolean;
    /** 服务基址（不含查询串） */
    endpoint: string;
    /** 解析来源：capabilities | arcgis-json | query */
    source: string;
    /** 是否 ArcGIS 原生协议（/export、/tile、/query） */
    arcgis?: boolean;
    /** ArcGIS：是否开放 Query 能力 */
    queryable?: boolean;
    /** ArcGIS：是否带切片缓存 */
    tiled?: boolean;
    /** ArcGIS 出图方式：直连瓦片 或 动态 export */
    tileMode?: 'tiles' | 'export';
    /** ArcGIS 切片最大级别 */
    maxLevel?: number;
}

/** 点查请求策略 */
export interface ServiceRequestOptions {
    /** 单次请求硬超时（毫秒） */
    timeoutMs?: number;
    /** 直连失败时的后端代理地址构造器（与瓦片 /proxy/{url} 同通道） */
    buildProxyUrl?: (url: string) => string | null;
}
