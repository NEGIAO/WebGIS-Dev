/**
 * 瓦片底图定义类型（V3.7.16 层定义驱动重构）
 *
 * 定义层唯一类型：纯数据，零引擎依赖（不得 import ol / cesium）。
 * 旧类型 LayerSourceDefinition（ol/basemap/constants/basemapCore.ts）已删除，
 * 其 createSource 工厂已由 ol/basemap/loaders/createOlSource.ts 接管。
 *
 * 两字段各司其职，不可合并：
 * - coord = 纠偏后输出坐标系，即瓦片渲染时对齐的坐标系（供目录分组/筛选/UI 用）；
 *   源坐标系不由 coord 记录，由 correction 的左侧推导（gcj2wgs 源为 GCJ02、
 *   wgs2gcj 源为 WGS84、bd2wgs 源为 BD09；correction 缺省/为 none 时源 = coord）。
 * - correction = 引擎要做什么变换（行为指令，供加载用）。
 */

import type {
    BasemapCategory,
    BasemapCoord,
    BasemapProvider,
} from '../catalog/types';

/** 旧字段：引擎显示分类（保留兼容 z-band / descriptor） */
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

/** 瓦片加载方式：与旧 serviceType 对应，vector-tile 简写为 mvt */
export type TileLoadMethod = 'xyz' | 'wmts' | 'wms' | 'mvt' | 'osm' | 'custom';

/** 坐标纠偏变换：纠偏只能在 VPS 代理上做，直连纠偏不存在 */
export type CoordCorrection = 'none' | 'gcj2wgs' | 'wgs2gcj' | 'bd2wgs' | 'wgs2bd';

/** 是否走 VPS 瓦片代理：auto = 按 TILE_PROXY_MODE 回退（默认） */
export type ProxyMode = 'direct' | 'proxy' | 'auto';

/** 运行时上下文：占位符替换所需的值，由引擎侧从 token 池 / 用户输入注入 */
export type TileLayerContext = {
    tiandituTk: string;
    ovitalTdtkey: string;
    customUrl: string;
    /** 仅 Cesium 侧使用：{normBase} 占位符替换值 */
    normBase?: string;
};

export interface TileLayerDefinition {
    /** 原始定义顺序；URL 参数 l 的 1-based 序号契约依赖它，迁移禁改 */
    order: number;
    id: string;
    name: string;
    /** 统一目录分类：每条源定义显式声明，不再由运行时推断 */
    catalogCategory: BasemapCategory;
    provider: BasemapProvider;
    /** 纠偏后输出坐标系（渲染对齐用）；源坐标系见 correction */
    coord: BasemapCoord;
    description: string;
    /** 旧字段，仅兼容 */
    category: LayerCategory;
    /** 旧字段，仅兼容 */
    group: LayerGroup;
    /** 只声明一次：原始上游 URL，含 {x}/{y}/{z}/{s} 与 {tiandituTk} 等占位符；
     *  代理/纠偏一律由引擎侧 resolveTileUrl 拼装，定义里永不写代理前缀 */
    url: string;
    /** 告诉引擎用什么方式加载 */
    method: TileLoadMethod;
    /** 默认 'none'；GCJ 源填 gcj2wgs，百度填 bd2wgs */
    correction?: CoordCorrection;
    /** 默认 'auto'；correction != 'none' 时强制走代理（见 validate.ts） */
    proxy?: ProxyMode;
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
    /** mvt 样式地址 */
    styleUrl?: string;
    /** 最大缩放级别 */
    maxZoom?: number;
    /** 瓦片像素比：HD/@2x 瓦片实际为 512×512 叠在 256 网格上时设为 2 */
    tilePixelRatio?: number;
    /** 子域名列表，用于负载均衡 */
    subdomains?: string[];
    /** 运行时需要替换的占位符列表 */
    needsContext?: ('tiandituTk' | 'ovitalTdtkey' | 'customUrl')[];
    /** 非标准适配器 ID（如 maps-for-free-*），method='xyz' + 此字段 */
    nonStandardAdapter?: string;
    /** 默认双引擎；Cesium 暂不支持的（如 mvt / maps-for-free）只填 ['ol'] */
    engines?: ('ol' | 'cesium')[];
    /** 注记类图层跳过 zDirection 高清瓦片优化（旧 createSource 的 withSkipHighResTile） */
    skipHighResTile?: boolean;
    date?: string | number;
    defaultVisible?: boolean;
}
