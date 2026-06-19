/**
 * 引擎无关的图层源描述符
 * 从 LAYER_SOURCE_DEFINITIONS 提取的元数据，用于为不同地图引擎（OL/Cesium）创建图层
 * 新增图源时需同步编辑此文件和 basemapConfig.ts
 */

import type { LayerCategory, LayerGroup } from './basemapConfig';

// ========== 类型定义 ==========

/** 图层源描述符：引擎无关的瓦片源元数据 */
export type TileSourceDescriptor = {
    /** 唯一标识符，与 LAYER_SOURCE_DEFINITIONS 中的 id 一致 */
    id: string;
    /** 显示名称 */
    name: string;
    /** 图层分类 */
    category: LayerCategory;
    /** 图层分组 */
    group: LayerGroup;
    /** 服务类型 */
    serviceType: 'xyz' | 'wms' | 'wmts' | 'osm' | 'vector-tile' | 'custom';
    /** 瓦片 URL 模板，支持 {z}/{x}/{y} 占位符 */
    url: string;
    /** 最大缩放级别 */
    maxZoom?: number;
    /** 子域名列表，用于负载均衡 */
    subdomains?: string[];
    /** 非标准适配器 ID（如 maps-for-free） */
    nonStandardAdapter?: string;
    /** 动态上下文需求：运行时需要替换的占位符 */
    needsContext?: ('tiandituTk' | 'customUrl' | 'normBase')[];
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
};

// ========== 图层源描述符列表 ==========
// 从 basemapConfig.ts 的 LAYER_SOURCE_DEFINITIONS 提取，保持相同顺序

export const TILE_SOURCE_DESCRIPTORS: TileSourceDescriptor[] = [
    // 1、注记图层
    {
        id: 'label_tianditu',
        name: '天地图注记',
        category: 'label',
        group: '注记',
        serviceType: 'xyz',
        url: 'https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
        needsContext: ['tiandituTk'],
    },
    {
        id: 'label_tianditu_vector',
        name: '天地图矢量注记',
        category: 'label',
        group: '注记',
        serviceType: 'xyz',
        url: 'https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
        needsContext: ['tiandituTk'],
    },
    {
        id: 'label_tuxin',
        name: '图新注记',
        category: 'label',
        group: '注记',
        serviceType: 'xyz',
        url: 'https://tiles.geovisearth.com/base/v1/cia/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
    },
    {
        id: 'amap_label',
        name: '高德注记无偏',
        category: 'label',
        group: '注记',
        serviceType: 'xyz',
        url: 'https://negiao-webgis.hf.space/proxy/gcj2wgs/http://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    },

    // 2、地形图层
    {
        id: 'terrain_gac',
        name: 'Google山体阴影(gac)',
        category: 'terrain',
        group: '地形',
        serviceType: 'xyz',
        url: 'https://gac-geo.googlecnapps.club/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5',
    },
    {
        id: 'terrain_google',
        name: 'Google山体阴影',
        category: 'terrain',
        group: '地形',
        serviceType: 'xyz',
        url: 'https://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5',
    },

    // 3、影像图层
    {
        id: 'imagery_tianditu',
        name: '天地图影像',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
        needsContext: ['tiandituTk'],
    },
    {
        id: 'imagery_tuxin',
        name: '图新影像',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://tiles.geovisearth.com/base/v1/img/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
    },
    {
        id: 'imagery_amap',
        name: '高德影像(GCJ)',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    },
    {
        id: 'imagery_amap_wgs',
        name: '高德影像(WGS)',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://negiao-webgis.hf.space/proxy/gcj2wgs/http://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    },
    {
        id: 'imagery_google',
        name: 'Google原版',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        maxZoom: 20,
    },
    {
        id: 'imagery_gac',
        name: 'Google(gac)',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}',
        maxZoom: 20,
    },
    {
        id: 'theme_arcgis_imagery_root',
        name: 'ESRI影像图',
        category: 'imagery',
        group: 'World',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'imagery_google_standard',
        name: 'Google标准',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga',
    },
    {
        id: 'imagery_mapbox',
        name: 'Mapbox影像',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
    },
    {
        id: 'imagery_yandex',
        name: 'Yandex影像',
        category: 'imagery',
        group: '影像',
        serviceType: 'xyz',
        url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}',
    },

    // 4、专题图层 - WMS/WMTS
    {
        id: 'theme_gd_basic_farmland_wms',
        name: '广东基本农田(WMS)',
        category: 'theme',
        group: '专题',
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
    {
        id: 'theme_hn_basic_farmland_wmts',
        name: '河南基本农田(WMTS)',
        category: 'theme',
        group: '专题',
        serviceType: 'wmts',
        url: 'https://www.hnsditu.cn/iserver/services/map-agscache-jibennongtian/wmts100',
        wmts: {
            layer: 'jibennongtian',
            style: 'default',
            matrixSet: 'GoogleMapsCompatible_jibennongtian',
            format: 'image/png',
            version: '1.0.0',
        },
    },
    {
        id: 'theme_hn_farmland_wmts',
        name: '河南耕地(WMTS)',
        category: 'theme',
        group: '专题',
        serviceType: 'wmts',
        url: 'https://www.hnsditu.cn/iserver/services/map-agscache-gengdi/wmts100',
        wmts: {
            layer: 'gengdi',
            style: 'default',
            matrixSet: 'GoogleMapsCompatible_gengdi',
            format: 'image/png',
            version: '1.0.0',
        },
    },

    // 5、ArcGIS Online 服务
    {
        id: 'theme_arcgis_canvas_dark_base',
        name: 'ESRI深灰色底图',
        category: 'theme',
        group: 'Canvas',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_canvas_dark_ref',
        name: 'ESRI深灰色参考注记',
        category: 'theme',
        group: 'Canvas',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_canvas_light_base',
        name: 'ESRI浅灰色底图',
        category: 'theme',
        group: 'Canvas',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_canvas_light_ref',
        name: 'ESRI浅灰色参考注记',
        category: 'theme',
        group: 'Canvas',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_ocean_base',
        name: 'ESRI海洋底图',
        category: 'theme',
        group: 'Ocean',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_ocean_ref',
        name: 'ESRI海洋参考注记',
        category: 'theme',
        group: 'Ocean',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'imagery_arcgis_polar_ant_img',
        name: 'ESRI南极影像',
        category: 'imagery',
        group: 'Polar',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Antarctic_Imagery/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'imagery_arcgis_polar_arc_img',
        name: 'ESRI北极影像',
        category: 'imagery',
        group: 'Polar',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Imagery/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_polar_arc_base',
        name: 'ESRI北极底图',
        category: 'theme',
        group: 'Polar',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'label_arcgis_polar_arc_ref',
        name: 'ESRI北极参考注记',
        category: 'label',
        group: 'Polar',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_ref_boundaries',
        name: 'ESRI世界边界地名',
        category: 'theme',
        group: 'Reference',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_ref_boundaries_alt',
        name: 'ESRI世界边界地名(备选)',
        category: 'theme',
        group: 'Reference',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places_Alternate/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_ref_overlay',
        name: 'ESRI世界参考叠加层',
        category: 'theme',
        group: 'Reference',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_ref_transport',
        name: 'ESRI世界交通',
        category: 'theme',
        group: 'Reference',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_spec_nav',
        name: 'ESRI世界航海图',
        category: 'theme',
        group: 'Specialty',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Specialty/World_Navigation_Charts/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_natgeo_world',
        name: '国家地理世界地图',
        category: 'theme',
        group: 'World',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_usa_topo',
        name: 'USA地形图',
        category: 'theme',
        group: 'World',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_physical_root',
        name: '世界自然地理图',
        category: 'theme',
        group: 'World',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_shaded_relief',
        name: '世界地形渲染图',
        category: 'theme',
        group: 'World',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_street_root',
        name: '世界街道图',
        category: 'theme',
        group: 'World',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_terrain_base',
        name: '世界地形底图',
        category: 'theme',
        group: 'World',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'theme_arcgis_topo_root',
        name: '世界地形图',
        category: 'theme',
        group: 'World',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    },

    // 6、其他专题图层
    {
        id: 'terrain_esa',
        name: '欧空局地形',
        category: 'terrain',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png',
    },
    {
        id: 'theme_windy',
        name: 'windy',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://tiles.windy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}/?lang=en',
    },
    {
        id: 'theme_windy2',
        name: 'windy2',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://tiles.windy.com/v1/maptiles/winter/256/{z}/{x}/{y}/?lang=en',
    },
    {
        id: 'theme_windy_outer',
        name: 'windy轮廓',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://tiles.windy.com/tiles/v10.0/darkmap-retina/{z}/{x}/{y}.png',
    },
    {
        id: 'theme_windy_greenland',
        name: 'windy Gray',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://tiles.windy.com/tiles/v10.0/grayland/{z}/{x}/{y}.png',
    },

    // 7、MFF 专题层（非标准 XYZ 适配器）
    {
        id: 'theme_mff_water',
        name: 'MFF水体',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/water/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-water',
    },
    {
        id: 'theme_mff_admin',
        name: 'MFF行政边界',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/admin/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-admin',
    },
    {
        id: 'theme_mff_streets',
        name: 'MFF街道',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/streets/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-streets',
    },
    {
        id: 'theme_mff_country',
        name: 'MFF国家边界',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/country/z{z}/row{y}/{z}_{x}-{y}.png',
        nonStandardAdapter: 'maps-for-free-country',
    },
    {
        id: 'theme_mff_crop',
        name: 'MFF作物',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/crop/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-crop',
    },
    {
        id: 'theme_mff_grass',
        name: 'MFF草地',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/grass/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-grass',
    },
    {
        id: 'theme_mff_forest',
        name: 'MFF森林',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/forest/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-forest',
    },
    {
        id: 'theme_mff_tundra',
        name: 'MFF冻土',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/tundra/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-tundra',
    },
    {
        id: 'theme_mff_sand',
        name: 'MFF沙地',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/sand/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-sand',
    },
    {
        id: 'theme_mff_swamp',
        name: 'MFF沼泽',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/swamp/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-swamp',
    },
    {
        id: 'theme_mff_ice',
        name: 'MFF冰川',
        category: 'theme',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/ice/z{z}/row{y}/{z}_{x}-{y}.gif',
        nonStandardAdapter: 'maps-for-free-ice',
    },
    {
        id: 'terrain_relief',
        name: '地形浮雕(MFF)',
        category: 'terrain',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg',
        nonStandardAdapter: 'maps-for-free-relief',
    },

    // 8、矢量图层
    {
        id: 'vector_tianditu',
        name: '天地图矢量',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
        needsContext: ['tiandituTk'],
    },
    {
        id: 'vector_tuxin',
        name: '图新矢量',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://tiles.geovisearth.com/base/v1/vec/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228',
    },
    {
        id: 'vector_amap',
        name: '高德地图(GCJ)',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    },
    {
        id: 'vector_amap_wgs',
        name: '高德地图(WGS)',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://negiao-webgis.hf.space/proxy/gcj2wgs/http://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    },
    {
        id: 'vector_tengxun',
        name: '腾讯地图(GCJ)',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0',
    },
    {
        id: 'vector_Google_clean',
        name: 'Google简洁(wgs)',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://negiao-webgis.hf.space/proxy/gcj2wgs/https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga',
    },
    {
        id: 'vector_osm',
        name: 'OSM标准',
        category: 'vector',
        group: '矢量',
        serviceType: 'osm',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    },
    {
        id: 'vector_carton_light',
        name: 'CartoDB',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
    },
    {
        id: 'vector_carton_dark',
        name: 'CartoDB Dark',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
    },
    {
        id: 'vector_wikipedia',
        name: 'Wikipedia',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
    },
    {
        id: 'vector_toner',
        name: 'Stamen Toner',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png',
    },
    {
        id: 'vector_alidade',
        name: 'Alidade Sm',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png',
    },
    {
        id: 'vector_geoq_gray',
        name: 'GeoQ灰(GCJ)',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldGrayMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldGrayMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
    },
    {
        id: 'vector_geoq_hydro',
        name: 'GeoQ水(GCJ)',
        category: 'vector',
        group: '矢量',
        serviceType: 'xyz',
        url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
    },
    {
        id: 'vector_henu_border_pbf',
        name: 'HENU边界矢量',
        category: 'vector',
        group: '矢量',
        serviceType: 'vector-tile',
        url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/Border_Vector/VectorTileServer/tile/{z}/{y}/{x}.pbf',
    },

    // 9、地形图层
    {
        id: 'terrain_opentopomap',
        name: '地形图',
        category: 'terrain',
        group: '专题',
        serviceType: 'xyz',
        url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    },
    {
        id: 'terrain_arcgis_elev_hillshade',
        name: 'ESRI世界山体阴影',
        category: 'terrain',
        group: 'Elevation',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    },
    {
        id: 'terrain_arcgis_elev_hillshade_dark',
        name: 'ESRI深色山体阴影',
        category: 'terrain',
        group: 'Elevation',
        serviceType: 'xyz',
        url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}',
    },

    // 10、自定义图层
    {
        id: 'local_tiles',
        name: '自定义瓦片',
        category: 'custom',
        group: '自定义',
        serviceType: 'xyz',
        url: '{normBase}tiles/{z}/{x}/{y}.png',
        needsContext: ['normBase'],
    },
    {
        id: 'custom',
        name: '自定义URL',
        category: 'custom',
        group: '自定义',
        serviceType: 'custom',
        url: '',
        needsContext: ['customUrl'],
    },
    {
        id: 'google_Backend_Proxy',
        name: '后端代理',
        category: 'custom',
        group: '自定义',
        serviceType: 'xyz',
        url: 'https://negiao-webgis.hf.space/proxy/mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    },
    {
        id: 'ships66',
        name: '船舶网',
        category: 'custom',
        group: '自定义',
        serviceType: 'xyz',
        url: 'https://negiao-webgis.hf.space/tiles/ships66/{z}/{x}/{y}.png',
    },
    {
        id: 'custom_mapbox_labeled',
        name: 'Mapbox 自定义',
        category: 'custom',
        group: '自定义',
        serviceType: 'xyz',
        url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo6wg8dm003v01s8d58qckdv/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
    },
    {
        id: 'custom_mapbox_unlabeled',
        name: 'Mapbox 自定义(无标注)',
        category: 'custom',
        group: '自定义',
        serviceType: 'xyz',
        url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo71ml4b001m01sp8u9o773g/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
    },
    {
        id: 'custom_China_Blender',
        name: 'China Blender',
        category: 'custom',
        group: '自定义',
        serviceType: 'xyz',
        url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
    },
];

// ========== 便捷查找 ==========

/** 按 ID 快速查找描述符 */
const DESCRIPTOR_MAP = new Map(TILE_SOURCE_DESCRIPTORS.map((d) => [d.id, d]));

/**
 * 根据图层源 ID 获取描述符
 * @param id 图层源 ID
 * @returns 描述符或 undefined
 */
export function getDescriptorById(id: string): TileSourceDescriptor | undefined {
    return DESCRIPTOR_MAP.get(id);
}

/**
 * 获取所有描述符的 ID 列表
 * @returns ID 数组
 */
export function getAllDescriptorIds(): string[] {
    return TILE_SOURCE_DESCRIPTORS.map((d) => d.id);
}
