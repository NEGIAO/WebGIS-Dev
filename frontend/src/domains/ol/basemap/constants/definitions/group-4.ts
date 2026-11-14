/**
 * 底图定义分组 4（按 LAYER_SOURCE_DEFINITIONS 原始顺序切片）
 *
 * 拆出原因：单文件超 500 行；分组保持定义顺序，UI 底图列表顺序不变。
 */
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import {
    buildOvitalUrl,
} from '../basemapCore';
import {
    createVectorTileSourceFromUrl,
    prioritizeTileSourceRequest,
} from '@ol/tile-source';
import { gcj2wgsProxyUrl, tileProxyUrl } from '@/config/publicRuntime';
import type { LayerSourceDefinition } from '../basemapCore';

const definitions: LayerSourceDefinition[] = [
    {
        id: 'vector_tengxun_wgs',
        name: '腾讯地图(WGS)',
        category: 'vector',
        group: '矢量',
        // 腾讯电子底图（GCJ-02）→ 经后端 /proxy/gcj2wgs 纠偏到 WGS84；与 vector_tengxun 同源，
        // 仅差纠偏代理。上游 y={-y} 为 TMS 翻转 Y（OpenLayers / Cesium 均支持），故不使用 query 拼裸 {y}。
        // 上游 y={-y} 为 TMS 翻转 Y（OpenLayers / Cesium 均支持）。自定义图源手动输入场景下，
        // urlUtils.looksLikeXYZTemplate 现已放宽为「含 {…} 占位符即认」（兼容 {-y} 等非标准 token），
        // 故本 URL 作为自定义源也能被正确识别为 XYZ（见 Docs/TODO/bugfix-optimization-plan.md）。
        url: gcj2wgsProxyUrl(
            'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0',
        ),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: gcj2wgsProxyUrl(
                        'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0',
                    ),
                }),
            ),
    },
    {
        id: 'vector_Google_clean',
        name: 'Google简洁(wgs)',
        category: 'vector',
        group: '矢量',
        url: gcj2wgsProxyUrl(
            'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off',
        ),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: gcj2wgsProxyUrl(
                        'https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l%7Cp.v:off,s.t:1%7Cs.e.g%7Cp.v:off,s.t:2%7Cs.e.g%7Cp.v:off',
                    ),
                }),
            ),
    },
    {
        id: 'vector_osm',
        name: 'OSM标准',
        category: 'vector',
        group: '矢量',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        serviceType: 'osm',
        createSource: () => prioritizeTileSourceRequest(new OSM()),
    },
    {
        id: 'vector_cyclosm',
        name: 'CyclOSM骑行',
        category: 'vector',
        group: '矢量',
        url: 'https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                }),
            ),
    },
    {
        id: 'vector_carton_light',
        name: 'CartoDB',
        category: 'vector',
        group: '矢量',
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        serviceType: 'xyz',
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
        url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        serviceType: 'xyz',
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
        url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
        serviceType: 'xyz',
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
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_alidade',
        name: 'Alidade Sm',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_stamen_toner_background',
        name: 'Stamen Toner底',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_stamen_toner_lite',
        name: 'Stamen Toner浅',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_alidade_smooth_dark',
        name: 'Alidade暗色',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_osm_bright',
        name: 'OSM Bright',
        category: 'vector',
        group: '矢量',
        url: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key=e5abf577-33b9-47f0-92b2-bd60f88d8c8d',
                }),
            ),
    },
    {
        id: 'vector_geoq_hydro',
        name: 'GeoQ水(GCJ)',
        category: 'vector',
        group: '矢量',
        url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
        serviceType: 'xyz',
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
        url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/Border_Vector/VectorTileServer/tile/{z}/{y}/{x}.pbf',
        serviceType: 'vector-tile',
        createSource: () =>
            createVectorTileSourceFromUrl(
                'https://webgis.henu.edu.cn/server/rest/services/Hosted/Border_Vector/VectorTileServer/tile/{z}/{y}/{x}.pbf',
            ),
    },
    {
        id: 'terrain_opentopomap',
        name: '地形图',
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
        id: 'terrain_omap_contour',
        name: '奥维等高线',
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
        id: 'terrain_arcgis_elev_hillshade',
        name: 'ESRI世界山体阴影',
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
        id: 'terrain_arcgis_elev_hillshade_dark',
        name: 'ESRI深色山体阴影',
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
    {
        id: 'local_tiles',
        name: '自定义瓦片',
        category: 'custom',
        group: '自定义',
        url: 'https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png',
                }),
            ),
    },
    {
        id: 'google_Backend_Proxy',
        name: '后端代理',
        category: 'custom',
        group: '自定义',
        url: tileProxyUrl('mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: tileProxyUrl('mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'),
                }),
            ),
    },
    {
        id: 'osm_Backend_Proxy',
        name: 'OSM代理',
        category: 'custom',
        group: '自定义',
        // OSM 官方瓦片在境内间歇不可达（见 README「已知限制」），此条目改走统一瓦片代理
        // /proxy/{上游 host+path}，与 google_Backend_Proxy 同形，仅上游不同。
        // OSM 官方自 2023 起只用单域名 tile.openstreetmap.org，不再有 {a-c} 子域，故不写 {s}。
        url: tileProxyUrl('tile.openstreetmap.org/{z}/{x}/{y}.png'),
        serviceType: 'xyz',
        // OSM 官方最高 z19；不设则会在 z20+ 反复请求 404 瓦片
        maxZoom: 19,
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: tileProxyUrl('tile.openstreetmap.org/{z}/{x}/{y}.png'),
                    maxZoom: 19,
                }),
            ),
    },
    {
        id: 'ships66',
        name: '船舶网',
        category: 'custom',
        group: '自定义',
        // 船舶网海图：走通用代理（/proxy/{上游URL}），不再使用专用 /tiles/ships66 端点。
        // 上游仅提供 http，故此处显式写 http://（代理侧按原样透传协议）。
        url: tileProxyUrl('http://g3.ships66.com/maps/one/{z}/{x}/{y}.png'),
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: tileProxyUrl('http://g3.ships66.com/maps/one/{z}/{x}/{y}.png'),
                }),
            ),
    },
    {
        id: 'custom_mapbox_labeled',
        name: 'Mapbox 自定义',
        category: 'custom',
        group: '自定义',
        url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo6wg8dm003v01s8d58qckdv/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
        serviceType: 'xyz',
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
        url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo71ml4b001m01sp8u9o773g/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
        serviceType: 'xyz',
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
        url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
        serviceType: 'xyz',
        createSource: () =>
            prioritizeTileSourceRequest(
                new XYZ({
                    url: 'https://webgis.henu.edu.cn/server/rest/services/Hosted/China_Blender/MapServer/WMTS/tile/1.0.0/China_Blender/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
                }),
            ),
    },
];

export default definitions;
