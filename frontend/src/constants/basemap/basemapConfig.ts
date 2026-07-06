/**
 * 底图配置文件
 * 集中管理图层源定义和底图预设配置
 * 新增图源时只需编辑此文件的 LAYER_SOURCE_DEFINITIONS 和 BASEMAP_PRESETS
 */

import { ref } from 'vue';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import type {
    ConfiguredTileServiceDefinition,
    NonStandardXYZAdapter,
    TileSourceLike,
} from '../../composables/useTileSourceFactory';
import {
    buildMapsForFreeAdapter,
    createConfiguredServiceSource,
    createVectorTileSourceFromUrl,
    createXYZSourceFromUrl,
    prioritizeTileSourceRequest,
} from '../../composables/useTileSourceFactory';

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
    | '专题'
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
    normBase: string;
    tiandituTk: string;
    customUrl: string;
};

export type LayerSourceDefinition = {
    id: string;
    name: string;
    category: LayerCategory;
    group: LayerGroup;
    defaultVisible?: boolean;
    createSource: (ctx: LayerFactoryContext) => TileSourceInstance;
};

export type BasemapPresetDefinition = {
    id: string;
    label: string;
    stack: string[];
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

export const GOOGLE_MANUAL_HOST = 'gac-geo.googlecnapps.club';

/** 默认底图预设 ID */
export const DEFAULT_BASEMAP_PRESET_ID = 'custom_China_Blender_preset_2';

/** Google 主机选择状态（全局单例） */
export const activeGoogleTileHost = ref(GOOGLE_MANUAL_HOST);

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
/** 拼接 Google 瓦片服务 URL */
export const buildGoogleTileUrl = (pathAndQuery: string) =>
    `https://${activeGoogleTileHost.value}${pathAndQuery}`;

/** 拼接天地图瓦片服务 URL */
export const buildTiandituUrl = (pathAndQuery: string, tiandituTk: string): string => {
    const hasQuery = pathAndQuery.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `https://${TILE_HOSTS.tianditu}${pathAndQuery}${separator}tk=${tiandituTk}`;
};

/**
 * 为 source 标记 skipHighResTile 标志，用于注记图层跳过 zDirection 高清瓦片优化
 * （避免注记文字在非整数 zoom 时因取上层瓦片而显示过小）
 */
function withSkipHighResTile<T extends XYZ>(src: T): T & { skipHighResTile: true } {
    Object.assign(src, { skipHighResTile: true });
    return src as T & { skipHighResTile: true };
}

// ========== 配置1：图层源定义 ==========
export const LAYER_SOURCE_DEFINITIONS: LayerSourceDefinition[] = [
    // 1、注记图层
    {
        id: 'label_tianditu',
        name: '天地图注记',
        category: 'label',
        group: '注记',
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
        category: 'label',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: 'https://negiao-webgis.hf.space/proxy/gcj2wgs/http://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                    }),
                ),
            ),
    },

    // 2、地形图层
    {
        id: 'terrain_gac',
        name: 'Google山体阴影(gac)',
        category: 'terrain',
        group: '地形',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://negiao-webgis.hf.space/proxy/gcj2wgs/http://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        id: 'imagery_google',
        name: 'Google原版',
        category: 'imagery',
        group: '影像',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}'),
                    maxZoom: 20,
                }),
            ),
    },
    {
        id: 'theme_arcgis_imagery_root',
        name: 'ESRI影像图',
        category: 'imagery',
        group: 'World',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'imagery_google_standard',
        name: 'Google标准',
        category: 'imagery',
        group: '影像',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga'
                }),
            ),
    },
    {
        id: 'imagery_mapbox',
        name: 'Mapbox影像',
        category: 'imagery',
        group: '影像',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ'
                }),
            ),
    },
    {
        id: 'imagery_yandex',
        name: 'Yandex影像',
        category: 'imagery',
        group: '影像',
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

    // 4、专题图层 - WMS/WMTS
    {
        id: 'theme_gd_basic_farmland_wms',
        name: '广东基本农田(WMS)',
        category: 'theme',
        group: '专题',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/ocean-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
                }),
            ),
    },

    // 7、MFF 专题层
    {
        id: 'theme_mff_water',
        name: 'MFF水体',
        category: 'theme',
        group: '专题',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/topo-v4/{z}/{x}/{y}.png?key=osLOujcXk1GJrGk5oaDz',
                }),
            ),
    },

    // 8、矢量图层
    {
        id: 'vector_tianditu',
        name: '天地图矢量',
        category: 'vector',
        group: '矢量',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://negiao-webgis.hf.space/proxy/gcj2wgs/http://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        id: 'vector_maptiler_streets',
        name: 'MapTiler街道',
        category: 'vector',
        group: '矢量',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://negiao-webgis.hf.space/proxy/gcj2wgs/https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off',
                }),
            ),
    },
    {
        id: 'vector_osm',
        name: 'OSM标准',
        category: 'vector',
        group: '矢量',
        createSource: () => new OSM(),
    },
    {
        id: 'vector_carton_light',
        name: 'CartoDB',
        category: 'vector',
        group: '矢量',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png' }),
            ),
    },
    {
        id: 'vector_alidade',
        name: 'Alidade Sm',
        category: 'vector',
        group: '矢量',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png',
                }),
            ),
    },
    {
        id: 'vector_geoq_gray',
        name: 'GeoQ灰(GCJ)',
        category: 'vector',
        group: '矢量',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldGrayMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldGrayMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
                }),
            ),
    },
    {
        id: 'vector_geoq_hydro',
        name: 'GeoQ水(GCJ)',
        category: 'vector',
        group: '矢量',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' }),
            ),
    },
    {
        id: 'terrain_arcgis_elev_hillshade',
        name: 'ESRI世界山体阴影',
        category: 'terrain',
        group: 'Elevation',
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
        createSource: ({ normBase }) =>
            prioritizeTileSourceRequest(new XYZ({ url: `${normBase}tiles/{z}/{x}/{y}.png` })),
    },
    {
        id: 'custom',
        name: '自定义URL',
        category: 'custom',
        group: '自定义',
        createSource: ({ customUrl }) =>
            customUrl
                ? createXYZSourceFromUrl(customUrl, { adapters: NON_STANDARD_XYZ_ADAPTERS })
                : null,
    },
    {
        id: 'google_Backend_Proxy',
        name: '后端代理',
        category: 'custom',
        group: '自定义',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://negiao-webgis.hf.space/proxy/mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        id: 'ships66',
        name: '船舶网',
        category: 'custom',
        group: '自定义',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://negiao-webgis.hf.space/tiles/ships66/{z}/{x}/{y}.png',
                }),
            ),
    },
    {
        id: 'custom_mapbox_labeled',
        name: 'Mapbox 自定义',
        category: 'custom',
        group: '自定义',
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
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
                }),
            ),
    },
];

// ========== 配置2：底图预设 ==========
export const BASEMAP_PRESETS: BasemapPresetDefinition[] = [
    { id: 'local_tiles_preset', label: '本地瓦片', stack: ['local_tiles'] },
    { id: 'custom', label: '自定义URL', stack: ['custom'] },

    // 天地图系列
    {
        id: 'imagery_tianditu_preset',
        label: '天地图影像',
        stack: ['imagery_tianditu', 'label_tianditu'],
    },
    {
        id: 'vector_tianditu_preset',
        label: '天地图矢量',
        stack: ['vector_tianditu', 'label_tianditu_vector'],
    },

    // 图新系列
    { id: 'imagery_tuxin_preset', label: '图新影像', stack: ['imagery_tuxin', 'label_tuxin'] },
    { id: 'vector_tuxin_preset', label: '图新矢量', stack: ['vector_tuxin', 'label_tuxin'] },

    // 互联网商业地图
    { id: 'imagery_gac_preset', label: 'Google(gac)', stack: ['imagery_gac', 'label_tianditu'] },
    {
        id: 'imagery_google_preset',
        label: 'Google原版',
        stack: ['imagery_google', 'terrain_google', 'label_tianditu'],
    },
    { id: 'imagery_amap_preset', label: '高德影像', stack: ['imagery_amap'] },
    { id: 'imagery_yandex_preset', label: 'Yandex卫星', stack: ['imagery_yandex'] },
    {
        id: 'google_Backend_Proxy_preset',
        label: '后端代理谷歌',
        stack: ['google_Backend_Proxy', 'label_tianditu'],
    },
    { id: 'imagery_amap_wgs_preset', label: '高德影像(WGS)', stack: ['imagery_amap_wgs'] },
    { id: 'vector_amap_wgs_preset', label: '高德地图(WGS)', stack: ['vector_amap_wgs'] },
    { id: 'imagery_mapbox_preset', label: 'Mapbox影像', stack: ['imagery_mapbox', 'label_tuxin'] },
    {
        id: 'imagery_google_standard_preset',
        label: 'Google标准',
        stack: ['imagery_google_standard'],
    },
    { id: 'vector_Google_clean_preset', label: 'Google简洁', stack: ['vector_Google_clean'] },
    { id: 'vector_amap_preset', label: '高德地图', stack: ['vector_amap'] },
    { id: 'vector_tengxun_preset', label: '腾讯地图', stack: ['vector_tengxun'] },
    { id: 'vector_osm_preset', label: 'OSM标准', stack: ['vector_osm'] },
    { id: 'custom_mapbox_labeled_preset', label: 'Mapbox自定义', stack: ['custom_mapbox_labeled'] },
    {
        id: 'custom_mapbox_unlabeled_preset',
        label: 'Mapbox(无注记)',
        stack: ['custom_mapbox_unlabeled', 'label_tuxin'],
    },
    {
        id: 'custom_China_Blender_preset',
        label: 'China Blender1',
        stack: ['custom_China_Blender', 'terrain_google'],
    },
    { id: 'custom_China_Blender_preset_2', label: 'China Blender2', stack: ['custom_China_Blender'] },
    { id: 'vector_carton_light_preset', label: 'Carto浅色', stack: ['vector_carton_light'] },
    { id: 'vector_carton_dark_preset', label: 'Carto深色', stack: ['vector_carton_dark'] },
    { id: 'vector_toner_preset', label: '黑白版画', stack: ['vector_toner'] },
    { id: 'vector_alidade_preset', label: '清爽风格', stack: ['vector_alidade'] },

    // MapTiler 系列
    { id: 'imagery_maptiler_satellite_preset', label: 'MapTiler影像', stack: ['imagery_maptiler_satellite', 'label_tianditu'] },
    { id: 'imagery_maptiler_satellite_hd_preset', label: 'MapTiler影像HD', stack: ['imagery_maptiler_satellite_hd', 'label_tianditu'] },
    { id: 'vector_maptiler_streets_preset', label: 'MapTiler街道', stack: ['vector_maptiler_streets'] },
    { id: 'terrain_maptiler_landscape_preset', label: 'MapTiler地貌', stack: ['terrain_maptiler_landscape'] },
    { id: 'terrain_maptiler_topo_preset', label: 'MapTiler地形图', stack: ['terrain_maptiler_topo'] },
    { id: 'theme_maptiler_winter_preset', label: 'MapTiler冬季', stack: ['terrain_maptiler_topo', 'theme_maptiler_winter'] },
    { id: 'theme_maptiler_ocean_preset', label: 'MapTiler海洋', stack: ['theme_maptiler_ocean'] },

    // ArcGIS (ESRI) 系列
    {
        id: 'arcgis_imagery_preset',
        label: 'ESRI影像',
        stack: ['theme_arcgis_imagery_root', 'label_tianditu'],
    },
    {
        id: 'arcgis_canvas_dark_preset',
        label: 'ESRI深灰',
        stack: ['theme_arcgis_canvas_dark_base', 'theme_arcgis_canvas_dark_ref'],
    },
    {
        id: 'arcgis_canvas_light_preset',
        label: 'ESRI浅灰',
        stack: ['theme_arcgis_canvas_light_base', 'theme_arcgis_canvas_light_ref'],
    },
    { id: 'arcgis_street_preset', label: 'ESRI街道', stack: ['theme_arcgis_street_root'] },
    { id: 'arcgis_topo_preset', label: 'ESRI世界地形', stack: ['theme_arcgis_topo_root'] },
    { id: 'arcgis_natgeo_preset', label: '国家地理', stack: ['theme_arcgis_natgeo_world'] },
    { id: 'arcgis_physical_preset', label: '自然地理', stack: ['theme_arcgis_physical_root'] },

    // 地形与专题系列
    {
        id: 'arcgis_elev_hillshade_preset',
        label: '山体阴影',
        stack: ['terrain_arcgis_elev_hillshade', 'label_tianditu'],
    },
    {
        id: 'arcgis_elev_hillshade_dark_preset',
        label: '深色阴影',
        stack: ['terrain_arcgis_elev_hillshade_dark', 'label_tianditu'],
    },
    { id: 'terrain_google_preset', label: 'Google山体', stack: ['terrain_google'] },
    { id: 'terrain_opentopomap_preset', label: '开放地形', stack: ['terrain_opentopomap'] },
    { id: 'terrain_esa_preset', label: '欧空局地形', stack: ['terrain_esa'] },

    // 农田专题
    {
        id: 'hn_basic_farmland_preset',
        label: '河南基本农田',
        stack: ['imagery_tianditu', 'theme_hn_basic_farmland_wmts', 'label_tianditu'],
    },
    {
        id: 'hn_farmland_preset',
        label: '河南耕地',
        stack: ['imagery_tianditu', 'theme_hn_farmland_wmts', 'label_tianditu'],
    },
    {
        id: 'gd_basic_farmland_preset',
        label: '广东基本农田',
        stack: ['imagery_tianditu', 'theme_gd_basic_farmland_wms', 'label_tianditu'],
    },

    // Windy 气象系列
    { id: 'ship66_preset', label: '船舶网', stack: ['ships66'] },
    { id: 'windy_preset', label: 'Windy户外', stack: ['theme_windy'] },
    { id: 'windy2_preset', label: 'Windy冬季', stack: ['theme_windy2'] },
    { id: 'windy_outer_preset', label: 'Windy轮廓', stack: ['theme_windy_outer'] },
    { id: 'windy_greenland_preset', label: 'Windy灰色', stack: ['theme_windy_greenland'] },

    // 极地与海洋系列
    {
        id: 'arcgis_ocean_preset',
        label: 'ESRI海洋',
        stack: ['theme_arcgis_ocean_base', 'theme_arcgis_ocean_ref'],
    },
    {
        id: 'arcgis_terrain_base_preset',
        label: '地形底色',
        stack: ['theme_arcgis_terrain_base', 'label_tianditu'],
    },
    { id: 'arcgis_polar_ant_preset', label: '南极影像', stack: ['imagery_arcgis_polar_ant_img'] },
    { id: 'arcgis_polar_arc_preset', label: '北极影像', stack: ['imagery_arcgis_polar_arc_img'] },
    {
        id: 'arcgis_polar_arc_base_preset',
        label: '北极地图',
        stack: ['theme_arcgis_polar_arc_base', 'label_arcgis_polar_arc_ref'],
    },

    // Maps For Free (MFF) 浮雕系列
    { id: 'mff_relief_preset', label: '地形浮雕', stack: ['terrain_relief', 'label_tianditu'] },
    {
        id: 'mff_water_preset',
        label: 'MFF水体',
        stack: ['terrain_relief', 'theme_mff_water', 'label_tianditu'],
    },
    {
        id: 'mff_admin_preset',
        label: 'MFF边界',
        stack: ['terrain_relief', 'theme_mff_admin', 'label_tianditu'],
    },
    {
        id: 'mff_streets_preset',
        label: 'MFF街道',
        stack: ['terrain_relief', 'theme_mff_streets', 'label_tianditu'],
    },
    {
        id: 'mff_forest_preset',
        label: 'MFF森林',
        stack: ['terrain_relief', 'theme_mff_forest', 'label_tianditu'],
    },

    // 其他与自定义
    { id: 'vector_geoq_gray_preset', label: 'GeoQ灰', stack: ['vector_geoq_gray'] },
    { id: 'vector_geoq_hydro_preset', label: 'GeoQ水', stack: ['vector_geoq_hydro'] },
    { id: 'vector_henu_border_preset', label: '矢量边界', stack: ['vector_henu_border_pbf'] },
];
