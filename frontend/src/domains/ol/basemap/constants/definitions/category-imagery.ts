/**
 * 底图定义：影像底图
 *
 * 每条定义自带完整 URL 与显式属性；order 用于恢复原始定义顺序。
 */
import XYZ from 'ol/source/XYZ';
import {
    buildTiandituUrl,
} from '../basemapCore';
import {
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import { gcj2wgsProxyUrl, wgs2gcjProxyUrl } from '@/config/publicRuntime';
import type { LayerSourceDefinition } from '../basemapCore';

const definitions: LayerSourceDefinition[] = [
    {
        order: 11,
        id: 'imagery_tianditu',
        name: '天地图影像',
        catalogCategory: 'imagery',
        provider: 'Tianditu',
        coord: 'WGS84',
        description: '天地图影像 · Tianditu / WGS84',
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
        order: 12,
        id: 'imagery_tuxin',
        name: '图新影像',
        catalogCategory: 'imagery',
        provider: 'Tuxin',
        coord: 'GCJ02',
        description: '图新影像 · Tuxin / GCJ02',
        category: 'imagery',
        group: '影像',
        url: 'https://tiles.geovisearth.com/base/v1/img/{z}/{x}/{y}?token=0aeb02f29320b060c2e2d0c04eb4887c6b8d5a8ed479b3aacff2b6a273b0d38d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.geovisearth.com/base/v1/img/{z}/{x}/{y}?token=0aeb02f29320b060c2e2d0c04eb4887c6b8d5a8ed479b3aacff2b6a273b0d38d',
                }),
            ),
    },
    {
        order: 13,
        id: 'imagery_amap',
        name: '高德影像(GCJ)',
        catalogCategory: 'imagery',
        provider: 'AMAP',
        coord: 'GCJ02',
        description: '高德影像(GCJ) · AMAP / GCJ02',
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
        order: 14,
        id: 'imagery_amap_wgs',
        name: '高德影像(WGS)',
        catalogCategory: 'imagery',
        provider: 'AMAP',
        coord: 'WGS84',
        description: '高德影像(WGS) · AMAP / WGS84',
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
        order: 15,
        id: 'imagery_google',
        name: 'Google原版',
        catalogCategory: 'imagery',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google原版 · Google / WGS84',
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
        order: 16,
        id: 'imagery_gac',
        name: 'Google(gac)',
        catalogCategory: 'imagery',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google(gac) · Google / WGS84',
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
        order: 18,
        id: 'imagery_google_standard',
        name: 'Google标准',
        catalogCategory: 'imagery',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google标准 · Google / WGS84',
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
        order: 19,
        id: 'imagery_google_water',
        name: 'Google水系(WGS)',
        catalogCategory: 'imagery',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google水系(WGS) · Google / WGS84',
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
        order: 20,
        id: 'imagery_mapbox',
        name: 'Mapbox影像',
        catalogCategory: 'imagery',
        provider: 'Mapbox',
        coord: 'WGS84',
        description: 'Mapbox影像 · Mapbox / WGS84',
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
        order: 21,
        id: 'imagery_yandex',
        name: 'Yandex影像',
        catalogCategory: 'imagery',
        provider: 'Other',
        coord: 'NONE',
        description: 'Yandex影像 · Other / 无坐标系',
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
        order: 22,
        id: 'imagery_maptiler_satellite',
        name: 'MapTiler影像',
        catalogCategory: 'imagery',
        provider: 'MapTiler',
        coord: 'WGS84',
        description: 'MapTiler影像 · MapTiler / WGS84',
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
        order: 23,
        id: 'imagery_maptiler_satellite_hd',
        name: 'MapTiler影像HD',
        catalogCategory: 'imagery',
        provider: 'MapTiler',
        coord: 'WGS84',
        description: 'MapTiler影像HD · MapTiler / WGS84',
        category: 'imagery',
        group: '影像',
        url: 'https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}@2x.jpg?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}@2x.jpg?key=osLOujcXk1GJrGk5oaDz',
                    
                    
                    
                    tilePixelRatio: 2,
                }),
            ),
    },
    {
        order: 24,
        id: 'imagery_alidade_satellite',
        name: 'Alidade卫星',
        catalogCategory: 'imagery',
        provider: 'Stadia',
        coord: 'WGS84',
        description: 'Alidade卫星 · Stadia / WGS84',
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
        order: 44,
        id: 'theme_arcgis_ocean_base',
        name: 'ESRI海洋底图',
        catalogCategory: 'imagery',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI海洋底图 · ESRI / WGS84',
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
        order: 45,
        id: 'theme_arcgis_ocean_ref',
        name: 'ESRI海洋参考注记',
        catalogCategory: 'imagery',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI海洋参考注记 · ESRI / WGS84',
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
        order: 46,
        id: 'imagery_arcgis_polar_ant_img',
        name: 'ESRI南极影像',
        catalogCategory: 'imagery',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI南极影像 · ESRI / WGS84',
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
        order: 47,
        id: 'imagery_arcgis_polar_arc_img',
        name: 'ESRI北极影像',
        catalogCategory: 'imagery',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI北极影像 · ESRI / WGS84',
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
        order: 48,
        id: 'theme_arcgis_polar_arc_base',
        name: 'ESRI北极底图',
        catalogCategory: 'imagery',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI北极底图 · ESRI / WGS84',
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
        order: 49,
        id: 'label_arcgis_polar_arc_ref',
        name: 'ESRI北极参考注记',
        catalogCategory: 'imagery',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI北极参考注记 · ESRI / WGS84',
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
        order: 68,
        id: 'theme_maptiler_ocean',
        name: 'MapTiler海洋',
        catalogCategory: 'imagery',
        provider: 'MapTiler',
        coord: 'WGS84',
        description: 'MapTiler海洋 · MapTiler / WGS84',
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
        order: 69,
        id: 'theme_stamen_watercolor',
        name: 'Stamen水彩',
        catalogCategory: 'imagery',
        provider: 'Stamen',
        coord: 'WGS84',
        description: 'Stamen水彩 · Stamen / WGS84',
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
    {
        order: 121,
        id: 'vector_google_combo_hybrid_gcj',
        name: 'Google混合影像(GCJ)',
        catalogCategory: 'imagery',
        provider: 'Google',
        coord: 'GCJ02',
        description: 'Google混合影像(GCJ) · Google / GCJ02',
        category: 'vector',
        group: '矢量',
        url: 'https://mt0.google.com/vt/lyrs=y&hl=zh-CN&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt0.google.com/vt/lyrs=y&hl=zh-CN&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        order: 122,
        id: 'vector_google_combo_hybrid_wgs',
        name: 'Google混合影像(WGS)',
        catalogCategory: 'imagery',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google混合影像(WGS) · Google / WGS84',
        category: 'vector',
        group: '矢量',
        url: gcj2wgsProxyUrl('https://mt0.google.com/vt/lyrs=y&hl=zh-CN&x={x}&y={y}&z={z}'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: gcj2wgsProxyUrl('https://mt0.google.com/vt/lyrs=y&hl=zh-CN&x={x}&y={y}&z={z}'),
                }),
            ),
    },
    {
        order: 137,
        id: 'vector_google_combo_satellite_wgs',
        name: 'Google纯卫星(WGS)',
        catalogCategory: 'imagery',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google纯卫星(WGS) · Google / WGS84',
        category: 'vector',
        group: '矢量',
        url: 'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        order: 138,
        id: 'vector_google_combo_satellite_gcj',
        name: 'Google纯卫星(GCJ)',
        catalogCategory: 'imagery',
        provider: 'Google',
        coord: 'GCJ02',
        description: 'Google纯卫星(GCJ) · Google / GCJ02',
        category: 'vector',
        group: '矢量',
        url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'),
                }),
            ),
    },
];

export default definitions;
