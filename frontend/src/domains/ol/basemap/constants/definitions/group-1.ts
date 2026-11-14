/**
 * 底图定义分组 1（按 LAYER_SOURCE_DEFINITIONS 原始顺序切片）
 *
 * 拆出原因：单文件超 500 行；分组保持定义顺序，UI 底图列表顺序不变。
 */
import XYZ from 'ol/source/XYZ';
import {
    withSkipHighResTile,
    buildTiandituUrl,
    buildOvitalUrl,
    NON_STANDARD_XYZ_ADAPTERS,
} from '../basemapCore';
import {
    createXYZSourceFromUrl,
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import { gcj2wgsProxyUrl } from '@/config/publicRuntime';
import type { LayerSourceDefinition } from '../basemapCore';

const definitions: LayerSourceDefinition[] = [
    {
        id: 'Omap_label',
        name: '奥维注记',
        category: 'label',
        group: '注记',
        url: 'https://omap.map-world.com.cn/dia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=dia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&tdtkey={ovitalTdtkey}',
        serviceType: 'xyz',
        needsContext: ['ovitalTdtkey'],
        createSource: ({ ovitalTdtkey }) =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: buildOvitalUrl(
                            '/dia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=dia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}',
                            ovitalTdtkey,
                        ),
                    }),
                ),
            ),
    },
    {
        id: 'label_tianditu',
        name: '天地图注记',
        category: 'label',
        group: '注记',
        url: 'https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        serviceType: 'xyz',
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
        url: 'https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={tiandituTk}',
        serviceType: 'xyz',
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
        url: 'https://tiles.geovisearth.com/base/v1/cia/{z}/{x}/{y}?token=0aeb02f29320b060c2e2d0c04eb4887c6b8d5a8ed479b3aacff2b6a273b0d38d',
        serviceType: 'xyz',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: 'https://tiles.geovisearth.com/base/v1/cia/{z}/{x}/{y}?token=0aeb02f29320b060c2e2d0c04eb4887c6b8d5a8ed479b3aacff2b6a273b0d38d',
                    }),
                ),
            ),
    },
    {
        id: 'label_minedata',
        name: 'MineMap注记',
        category: 'label',
        group: '注记',
        // MineMap（四维图新）标准标注。服务上限 z=18（z≥19 实测返回 404）。
        // 坐标基准为 GCJ-02 加偏源——同网格与「WGS84 对齐的高德纠偏瓦片」实测比对，
        // 「杭州站」东向差约 25px（z13 下 ≈480m），符合 GCJ 偏移量级与方向，故与
        // 高德/腾讯/谷歌中国同样走 gcj2wgs 逐瓦片纠偏。若日后该服务改为无偏，
        // 去掉 gcj2wgsProxyUrl 包裹即可（url 与 createSource 两处必须同改）。
        // key 与 URL 耦合且前端请求必然可见，按 dev-conventions「底图源 URL 例外」硬编码。
        url: gcj2wgsProxyUrl(
            'https://map-api.minedata.cn/service/data/raster-label?style=standard&z={z}&x={x}&y={y}&key=5c6cb47b45c746de9e4e9135a725d857',
        ),
        serviceType: 'xyz',
        maxZoom: 18,
        // 与其他注记图层一致地跳过 zDirection 高清瓦片优化：
        // 否则非整数 zoom 时注记会取上层瓦片，文字被缩得比同屏其它标注小
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: gcj2wgsProxyUrl(
                            'https://map-api.minedata.cn/service/data/raster-label?style=standard&z={z}&x={x}&y={y}&key=5c6cb47b45c746de9e4e9135a725d857',
                        ),
                    }),
                ),
            ),
    },
    {
        id: 'amap_label',
        name: '高德注记无偏',
        group: '注记',
        url: gcj2wgsProxyUrl(
            'http://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        ),
        serviceType: 'xyz',
        category: 'label',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: gcj2wgsProxyUrl(
                            'http://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                        ),
                    }),
                ),
            ),
    },
    {
        id: 'tianditu_ibo_w',
        name: '天地图国界',
        category: 'label',
        group: '注记',
        // DataServer 形式（与 3D 侧 useCesiumLayers 同源）：T=ibo_w 直接以 x/y/l 取瓦片
        url: 'https://t{s}.tianditu.gov.cn/DataServer?T=ibo_w&x={x}&y={y}&l={z}&tk={tiandituTk}',
        serviceType: 'xyz',
        createSource: ({ tiandituTk }) =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: buildTiandituUrl(
                            '/DataServer?T=ibo_w&x={x}&y={y}&l={z}',
                            tiandituTk,
                        ),
                    }),
                ),
            ),
    },
    {
        id: 'custom',
        name: '自定义URL',
        category: 'custom',
        group: '自定义',
        url: '',
        adapters: NON_STANDARD_XYZ_ADAPTERS,
        serviceType: 'custom',
        createSource: ({ customUrl }) =>
            customUrl
                ? createXYZSourceFromUrl(customUrl, { adapters: NON_STANDARD_XYZ_ADAPTERS })
                : null,
    },
    {
        id: 'terrain_gac',
        name: 'Google山体阴影(gac)',
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
        id: 'terrain_google',
        name: 'Google山体阴影',
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
        id: 'imagery_tianditu',
        name: '天地图影像',
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
        id: 'imagery_tuxin',
        name: '图新影像',
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
        id: 'imagery_amap',
        name: '高德影像(GCJ)',
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
        id: 'imagery_amap_wgs',
        name: '高德影像(WGS)',
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
        id: 'imagery_google',
        name: 'Google原版',
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
        id: 'imagery_gac',
        name: 'Google(gac)',
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
        id: 'theme_arcgis_imagery_root',
        name: 'ESRI影像图',
        category: 'imagery',
        group: 'World',
        // url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        // arcgisonline的域名被墙；但是wayback的arcgis域名可以访问；所以使用wayback的arcgis域名
        url: 'https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/26334/{z}/{y}/{x}',
        // id：26334是wayback的arcgis域名的服务id，对应的时间戳为最新的2026-08-05（仅部分地区，中国大陆部分的影像不会同步更新，但与大陆arcgisonline的影像相同，wayback的arcgis域名的服务更新更快，且可以访问）
        // 后续如果wayback的arcgis域名的服务id更新了，需要修改id为最新的服务id（参见后端api：/api/historical-imagery/esri-wayback/layers 为二次封装好的接口，可获取最新的服务id）
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    // url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    url: 'https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/26334/{z}/{y}/{x}',
                }),
            ),
    },
    {
        id: 'imagery_google_standard',
        name: 'Google标准',
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
        id: 'imagery_google_water',
        name: 'Google水系(WGS)',
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
        id: 'imagery_mapbox',
        name: 'Mapbox影像',
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
        id: 'imagery_yandex',
        name: 'Yandex影像',
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
        id: 'imagery_maptiler_satellite',
        name: 'MapTiler影像',
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
        id: 'imagery_maptiler_satellite_hd',
        name: 'MapTiler影像HD',
        category: 'imagery',
        group: '影像',
        url: 'https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}@2x.jpg?key=osLOujcXk1GJrGk5oaDz',
        serviceType: 'xyz',
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
    {
        id: 'imagery_alidade_satellite',
        name: 'Alidade卫星',
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
        id: 'label_stamen_toner_lines',
        name: 'Stamen线划',
        category: 'label',
        group: '注记',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                    }),
                ),
            ),
    },
    {
        id: 'label_stamen_toner_labels',
        name: 'Stamen注记',
        category: 'label',
        group: '注记',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            withSkipHighResTile(
                prioritizeTileSourceRequest(
                    new XYZ({
                        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                    }),
                ),
            ),
    },
];

export default definitions;
