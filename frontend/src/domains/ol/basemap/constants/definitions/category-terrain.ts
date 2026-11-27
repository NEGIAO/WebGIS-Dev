/**
 * 底图定义：地形底图
 *
 * 每条定义自带完整 URL 与显式属性；order 用于恢复原始定义顺序。
 */
import XYZ from 'ol/source/XYZ';
import {
    buildOvitalUrl,
    NON_STANDARD_XYZ_ADAPTERS,
} from '../basemapCore';
import {
    createXYZSourceFromUrl,
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import { wgs2gcjProxyUrl } from '@/config/publicRuntime';
import type { LayerSourceDefinition } from '../basemapCore';

const definitions: LayerSourceDefinition[] = [
    {
        order: 9,
        id: 'terrain_gac',
        name: 'Google山体阴影(gac)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google山体阴影(gac) · Google / WGS84',
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
        order: 10,
        id: 'terrain_google',
        name: 'Google山体阴影',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google山体阴影 · Google / WGS84',
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
    {
        order: 56,
        id: 'theme_arcgis_usa_topo',
        name: 'USA地形图',
        catalogCategory: 'terrain',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'USA地形图 · ESRI / WGS84',
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
        order: 58,
        id: 'theme_arcgis_shaded_relief',
        name: '世界地形渲染图',
        catalogCategory: 'terrain',
        provider: 'ESRI',
        coord: 'WGS84',
        description: '世界地形渲染图 · ESRI / WGS84',
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
        order: 60,
        id: 'theme_arcgis_terrain_base',
        name: '世界地形底图',
        catalogCategory: 'terrain',
        provider: 'ESRI',
        coord: 'WGS84',
        description: '世界地形底图 · ESRI / WGS84',
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
        order: 61,
        id: 'theme_arcgis_topo_root',
        name: '世界地形图',
        catalogCategory: 'terrain',
        provider: 'ESRI',
        coord: 'WGS84',
        description: '世界地形图 · ESRI / WGS84',
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
        order: 62,
        id: 'terrain_esa',
        name: '欧空局地形',
        catalogCategory: 'terrain',
        provider: 'Other',
        coord: 'NONE',
        description: '欧空局地形 · Other / 无坐标系',
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
        order: 70,
        id: 'theme_mff_water',
        name: 'MFF水体',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF水体 · MFF / WGS84',
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
        order: 71,
        id: 'theme_mff_admin',
        name: 'MFF行政边界',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF行政边界 · MFF / WGS84',
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
        order: 72,
        id: 'theme_mff_streets',
        name: 'MFF街道',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF街道 · MFF / WGS84',
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
        order: 73,
        id: 'theme_mff_country',
        name: 'MFF国家边界',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF国家边界 · MFF / WGS84',
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
        order: 74,
        id: 'theme_mff_crop',
        name: 'MFF作物',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF作物 · MFF / WGS84',
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
        order: 75,
        id: 'theme_mff_grass',
        name: 'MFF草地',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF草地 · MFF / WGS84',
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
        order: 76,
        id: 'theme_mff_forest',
        name: 'MFF森林',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF森林 · MFF / WGS84',
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
        order: 77,
        id: 'theme_mff_tundra',
        name: 'MFF冻土',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF冻土 · MFF / WGS84',
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
        order: 78,
        id: 'theme_mff_sand',
        name: 'MFF沙地',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF沙地 · MFF / WGS84',
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
        order: 79,
        id: 'theme_mff_swamp',
        name: 'MFF沼泽',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF沼泽 · MFF / WGS84',
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
        order: 80,
        id: 'theme_mff_ice',
        name: 'MFF冰川',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: 'MFF冰川 · MFF / WGS84',
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
        order: 81,
        id: 'terrain_relief',
        name: '地形浮雕(MFF)',
        catalogCategory: 'terrain',
        provider: 'MFF',
        coord: 'WGS84',
        description: '地形浮雕(MFF) · MFF / WGS84',
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
        order: 82,
        id: 'terrain_maptiler_landscape',
        name: 'MapTiler地貌',
        catalogCategory: 'terrain',
        provider: 'MapTiler',
        coord: 'WGS84',
        description: 'MapTiler地貌 · MapTiler / WGS84',
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
        order: 83,
        id: 'terrain_maptiler_topo',
        name: 'MapTiler地形图',
        catalogCategory: 'terrain',
        provider: 'MapTiler',
        coord: 'WGS84',
        description: 'MapTiler地形图 · MapTiler / WGS84',
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
        order: 84,
        id: 'terrain_stamen',
        name: 'Stamen地形',
        catalogCategory: 'terrain',
        provider: 'Stamen',
        coord: 'WGS84',
        description: 'Stamen地形 · Stamen / WGS84',
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
        order: 85,
        id: 'terrain_outdoors',
        name: 'Stadia户外',
        catalogCategory: 'terrain',
        provider: 'Stadia',
        coord: 'WGS84',
        description: 'Stadia户外 · Stadia / WGS84',
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
    {
        order: 139,
        id: 'vector_google_combo_terrain_wgs',
        name: 'Google纯地形(WGS)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google纯地形(WGS) · Google / WGS84',
        category: 'vector',
        group: '矢量',
        url: 'https://mt0.google.com/vt/lyrs=t&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt0.google.com/vt/lyrs=t&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        order: 140,
        id: 'vector_google_combo_terrain_gcj',
        name: 'Google纯地形(GCJ)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'GCJ02',
        description: 'Google纯地形(GCJ) · Google / GCJ02',
        category: 'vector',
        group: '矢量',
        url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=t&x={x}&y={y}&z={z}'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=t&x={x}&y={y}&z={z}'),
                }),
            ),
    },
    {
        order: 141,
        id: 'vector_google_combo_terrain_hybrid_wgs',
        name: 'Google地形混合(WGS)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google地形混合(WGS) · Google / WGS84',
        category: 'vector',
        group: '矢量',
        url: 'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
                }),
            ),
    },
    {
        order: 142,
        id: 'vector_google_combo_terrain_hybrid_gcj',
        name: 'Google地形混合(GCJ)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'GCJ02',
        description: 'Google地形混合(GCJ) · Google / GCJ02',
        category: 'vector',
        group: '矢量',
        url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'),
                }),
            ),
    },
    {
        order: 143,
        id: 'vector_google_combo_clean_terrain_wgs',
        name: 'Google干净地形(WGS)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google干净地形(WGS) · Google / WGS84',
        category: 'vector',
        group: '矢量',
        url: 'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off',
                }),
            ),
    },
    {
        order: 144,
        id: 'vector_google_combo_clean_terrain_gcj',
        name: 'Google干净地形(GCJ)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'GCJ02',
        description: 'Google干净地形(GCJ) · Google / GCJ02',
        category: 'vector',
        group: '矢量',
        url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off'),
                }),
            ),
    },
    {
        order: 145,
        id: 'vector_google_combo_clean_terrain_no_road_wgs',
        name: 'Google干净地形无路(WGS)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'WGS84',
        description: 'Google干净地形无路(WGS) · Google / WGS84',
        category: 'vector',
        group: '矢量',
        url: 'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off,s.t:3%7Cs.e.g%7Cp.v:off,s.t:4%7Cs.e.g%7Cp.v:off',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off,s.t:3%7Cs.e.g%7Cp.v:off,s.t:4%7Cs.e.g%7Cp.v:off',
                }),
            ),
    },
    {
        order: 146,
        id: 'vector_google_combo_clean_terrain_no_road_gcj',
        name: 'Google干净地形无路(GCJ)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'GCJ02',
        description: 'Google干净地形无路(GCJ) · Google / GCJ02',
        category: 'vector',
        group: '矢量',
        url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off,s.t:3%7Cs.e.g%7Cp.v:off,s.t:4%7Cs.e.g%7Cp.v:off'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: wgs2gcjProxyUrl('https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off,s.t:3%7Cs.e.g%7Cp.v:off,s.t:4%7Cs.e.g%7Cp.v:off'),
                }),
            ),
    },
    {
        order: 147,
        id: 'vector_google_combo_pb_hillshade_wgs',
        name: 'GooglePB山体阴影(WGS)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'WGS84',
        description: 'GooglePB山体阴影(WGS) · Google / WGS84',
        category: 'vector',
        group: '矢量',
        url: 'https://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5',
                }),
            ),
    },
    {
        order: 148,
        id: 'vector_google_combo_pb_hillshade_gcj',
        name: 'GooglePB山体阴影(GCJ)',
        catalogCategory: 'terrain',
        provider: 'Google',
        coord: 'GCJ02',
        description: 'GooglePB山体阴影(GCJ) · Google / GCJ02',
        category: 'vector',
        group: '矢量',
        url: wgs2gcjProxyUrl('https://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: wgs2gcjProxyUrl('https://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5'),
                }),
            ),
    },
    {
        order: 164,
        id: 'terrain_opentopomap',
        name: '地形图',
        catalogCategory: 'terrain',
        provider: 'Other',
        coord: 'NONE',
        description: '地形图 · Other / 无坐标系',
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
        order: 165,
        id: 'terrain_omap_contour',
        name: '奥维等高线',
        catalogCategory: 'terrain',
        provider: 'Other',
        coord: 'NONE',
        description: '奥维等高线 · Other / 无坐标系',
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
        order: 166,
        id: 'terrain_arcgis_elev_hillshade',
        name: 'ESRI世界山体阴影',
        catalogCategory: 'terrain',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI世界山体阴影 · ESRI / WGS84',
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
        order: 167,
        id: 'terrain_arcgis_elev_hillshade_dark',
        name: 'ESRI深色山体阴影',
        catalogCategory: 'terrain',
        provider: 'ESRI',
        coord: 'WGS84',
        description: 'ESRI深色山体阴影 · ESRI / WGS84',
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
];

export default definitions;
