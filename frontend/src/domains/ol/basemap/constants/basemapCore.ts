/**
 * 底图配置内核：类型 / 主机常量 / 非标准适配器 / URL 构建器
 *
 * 从 basemapConfig.ts 拆出，供 `definitions/*.ts` 与 basemapConfig 共用，
 * 避免「定义分组文件反向依赖聚合文件」形成循环。
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
    prioritizeTileSourceRequest,
} from '@ol/tile-source';

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
    /** 矢量切片专属：Mapbox 样式表地址（可选） */
    styleUrl?: string;
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
export const NON_STANDARD_XYZ_ADAPTERS: Record<string, NonStandardXYZAdapter> = {
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
export function withSkipHighResTile<T extends XYZ>(src: T): T & { skipHighResTile: true } {
    Object.assign(src, { skipHighResTile: true });
    return src as T & { skipHighResTile: true };
}

// ========== EOX Sentinel-2 无云年度镶嵌（2016~2025） ==========
// 年度图层命名：2016 对应聚合层 s2cloudless_3857（EOX 官方 WMTS 标题即 "Sentinel-2 cloudless layer for 2016"），
// 其余年份为 s2cloudless-{year}_3857；10 个年度条目结构相同，用生成器收敛，避免 10 份重复字面量。
export const EOX_WMTS_URL = (layer: string): string =>
    `https://tiles.maps.eox.at/wmts?layer=${layer}&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}`;

/** 生成单个 Sentinel 无云年度图层定义（url 与 createSource 共用同一模板串，杜绝两字段漂移） */
export function buildS2CloudlessDef(year: number): LayerSourceDefinition {
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
