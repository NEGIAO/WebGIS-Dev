/**
 * 底图定义分组 3（按 LAYER_SOURCE_DEFINITIONS 原始顺序切片）
 *
 * 拆出原因：单文件超 500 行；分组保持定义顺序，UI 底图列表顺序不变。
 */
import XYZ from 'ol/source/XYZ';
import VectorTileSource from 'ol/source/VectorTile';
import {
    buildTiandituUrl,
    NON_STANDARD_XYZ_ADAPTERS,
} from '../basemapCore';
import {
    createVectorTileSourceFromUrl,
    createXYZSourceFromUrl,
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import { bd2wgsProxyUrl, gcj2wgsProxyUrl } from '@/config/publicRuntime';
import type { LayerSourceDefinition } from '../basemapCore';

/**
 * OpenFreeMap 矢量瓦片源。
 * 使用官方稳定别名 /planet/latest/{z}/{x}/{y}.pbf —— 自动指向最新版本、瓦片非空，
 * 避免写死版本戳（会随数据更新过期），也免去运行时拉取 TileJSON 解析。
 * 无版本段的 /planet/{z}/{x}/{y}.pbf 返回空瓦片，故这里显式用 latest。
 * 样式走 basemapLayerFactory 的 styleUrl 管线（applyStyle updateSource:false），只消费矢量数据。
 */
function createOpenFreeMapVectorSource(): VectorTileSource {
    const source = createVectorTileSourceFromUrl(
        'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf',
    );
    source.set('styleUrl', 'https://tiles.openfreemap.org/styles/liberty');
    return source;
}

const definitions: LayerSourceDefinition[] = [
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
        id: 'vector_tianditu_mvt',
        name: '天地图矢量(MVT)',
        category: 'vector',
        group: '矢量',
        url: 'https://vpn.negiao.cn/tdt-mvt/mvt/{z}/{x}/{y}',
        styleUrl: 'https://vpn.negiao.cn/tdt-mvt/style-tech-blue.json',
        serviceType: 'vector-tile',
        createSource: () => {
            const source = createVectorTileSourceFromUrl(
                'https://vpn.negiao.cn/tdt-mvt/mvt/{z}/{x}/{y}',
            );
            source.set('styleUrl', 'https://vpn.negiao.cn/tdt-mvt/style-tech-blue.json');
            return source;
        },
    },
    {
        id: 'vector_openfreemap_liberty',
        name: 'OpenFreeMap矢量',
        category: 'vector',
        group: '矢量',
        // 稳定别名 latest 自动指向最新版本，瓦片非空且不会因版本戳更新过期
        url: 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf',
        styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
        serviceType: 'vector-tile',
        maxZoom: 14,
        createSource: () => createOpenFreeMapVectorSource(),
    },
    {
        id: 'vector_tuxin',
        name: '图新矢量',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.geovisearth.com/base/v1/vec/{z}/{x}/{y}?token=0aeb02f29320b060c2e2d0c04eb4887c6b8d5a8ed479b3aacff2b6a273b0d38d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.geovisearth.com/base/v1/vec/{z}/{x}/{y}?token=0aeb02f29320b060c2e2d0c04eb4887c6b8d5a8ed479b3aacff2b6a273b0d38d',
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
        id: 'vector_baidu_wgs',
        name: '百度地图(WGS)',
        category: 'vector',
        group: '矢量',
        // 百度 BD09MC 为独立网格（Y 轴向上、res=2^(18-z)），前端以标准 XYZ 索引请求，
        // 后端 /proxy/bd2wgs 拉对应百度网格跨网格重采样对齐 WGS84（实现见 backend/domains/tiles/rectify/bd/）。
        // 子域固定 maponline0 避免 OL/Cesium 对 {s}/{0-9} 语义差异；负载均衡无碍正确性。
        url: bd2wgsProxyUrl(
            'https://maponline0.bdimg.com/tile/?qt=vtile&x={x}&y={y}&z={z}&styles=pl&scaler=1&from=jsapi2_0',
        ),
        serviceType: 'xyz',
        maxZoom: 18,
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: bd2wgsProxyUrl(
                        'https://maponline0.bdimg.com/tile/?qt=vtile&x={x}&y={y}&z={z}&styles=pl&scaler=1&from=jsapi2_0',
                    ),
                    maxZoom: 18,
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
];

export default definitions;
