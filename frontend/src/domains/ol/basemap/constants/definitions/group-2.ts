/**
 * 底图定义分组 2（按 LAYER_SOURCE_DEFINITIONS 原始顺序切片）
 *
 * 拆出原因：单文件超 500 行；分组保持定义顺序，UI 底图列表顺序不变。
 */
import XYZ from 'ol/source/XYZ';
import {
    buildS2CloudlessDef,
    NON_STANDARD_XYZ_ADAPTERS,
} from '../basemapCore';
import {
    createConfiguredServiceSource,
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import type { LayerSourceDefinition } from '../basemapCore';

const definitions: LayerSourceDefinition[] = [
    ...Array.from({ length: 10 }, (_, i) => buildS2CloudlessDef(2016 + i)),
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
];

export default definitions;
