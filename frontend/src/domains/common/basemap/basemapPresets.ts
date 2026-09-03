/**
 * 底图预设目录（纯数据，零 OL/Cesium 依赖）
 *
 * 控制不同底图在地图上的显示优先顺序（stack 数组决定叠加层次）。
 * 从 basemapConfig.ts 抽离（V3.4.54 加载性能优化）：预设 id/label/stack 与
 * URL 图层索引映射是纯常量，供 useUrlParamStore 等入口链路消费；
 * 抽离后登录页入口不再连带打包 OpenLayers（原链：useUrlParamStore →
 * basemapResolver → basemapConfig → ol/source/*）。
 *
 * 本文件禁止 import 任何 ol / cesium / 工厂模块。
 */

export type BasemapPresetDefinition = {
    id: string;
    label: string;
    stack: string[];
};

/** 默认底图预设 ID */
export const DEFAULT_BASEMAP_PRESET_ID = 'custom_China_Blender_preset_2';

// ========== 配置2：底图预设 ==========
export const BASEMAP_PRESETS: BasemapPresetDefinition[] = [
    { id: 'local_tiles_preset', label: '本地瓦片', stack: ['local_tiles'] },
    { id: 'custom', label: 'WMS/WMTS/XYZ', stack: ['custom'] },

    // 天地图系列
    {
        id: 'imagery_tianditu_preset',
        label: '天地图影像',
        stack: ['imagery_tianditu', 'label_tianditu'],
    },
    {
        id: 'vector_tianditu_preset',
        label: '天地图矢量',
        stack: ['vector_tianditu', 'label_tianditu'],
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
    {
        id: 'imagery_tianditu_omap_contour_preset',
        label: '奥维等高线',
        stack: ['imagery_tianditu', 'terrain_omap_contour', 'label_tianditu'],
    },
    {
        id: 'google_Backend_Proxy_preset',
        label: '后端代理谷歌',
        stack: ['google_Backend_Proxy', 'label_tianditu'],
    },
    { id: 'imagery_amap_wgs_preset', label: '高德影像(WGS)', stack: ['imagery_amap_wgs'] },
    { id: 'vector_amap_wgs_preset', label: '高德地图(WGS)', stack: ['vector_amap_wgs'] },
    { id: 'vector_baidu_wgs_preset', label: '百度地图(WGS)', stack: ['vector_baidu_wgs'] },
    { id: 'imagery_mapbox_preset', label: 'Mapbox影像', stack: ['imagery_mapbox', 'label_tuxin'] },
    {
        id: 'arcgis_imagery_preset',
        label: 'ESRI影像',
        stack: ['theme_arcgis_imagery_root', 'label_tianditu'],
    },
    {
        id: 'imagery_google_standard_preset',
        label: 'Google标准',
        stack: ['imagery_google_standard'],
    },
    { id: 'vector_Google_clean_preset', label: 'Google简洁', stack: ['vector_Google_clean'] },
    { id: 'vector_amap_preset', label: '高德地图', stack: ['vector_amap'] },
    { id: 'vector_tengxun_preset', label: '腾讯地图', stack: ['vector_tengxun'] },
    { id: 'vector_osm_preset', label: 'OSM标准', stack: ['vector_osm'] },
    { id: 'vector_cyclosm_preset', label: 'CyclOSM骑行', stack: ['vector_cyclosm'] },
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
    {
        id: 'custom_China_Blender_preset_2',
        label: 'China Blender2',
        stack: ['custom_China_Blender','label_tianditu_vector'],
    },
    { id: 'vector_carton_light_preset', label: 'Carto浅色', stack: ['vector_carton_light'] },
    { id: 'vector_carton_dark_preset', label: 'Carto深色', stack: ['vector_carton_dark'] },
    { id: 'vector_toner_preset', label: '黑白版画', stack: ['vector_toner'] },
    { id: 'vector_alidade_preset', label: '清爽风格', stack: ['vector_alidade'] },
    {
        id: 'vector_stamen_toner_background_preset',
        label: 'Toner背景',
        stack: ['vector_stamen_toner_background'],
    },
    {
        id: 'vector_stamen_toner_lite_preset',
        label: 'Toner浅色',
        stack: ['vector_stamen_toner_lite'],
    },
    {
        id: 'vector_alidade_smooth_dark_preset',
        label: 'Alidade暗色',
        stack: ['vector_alidade_smooth_dark'],
    },
    { id: 'vector_osm_bright_preset', label: 'OSM Bright', stack: ['vector_osm_bright'] },
    { id: 'terrain_stamen_preset', label: 'Stamen地形', stack: ['terrain_stamen'] },
    { id: 'terrain_outdoors_preset', label: 'Stadia户外', stack: ['terrain_outdoors'] },
    {
        id: 'theme_stamen_watercolor_preset',
        label: 'Stamen水彩',
        stack: ['theme_stamen_watercolor'],
    },
    {
        id: 'imagery_alidade_satellite_preset',
        label: 'Alidade卫星',
        stack: ['imagery_alidade_satellite'],
    },
    {
        id: 'label_stamen_toner_lines_preset',
        label: 'Stamen线划',
        stack: ['label_stamen_toner_lines'],
    },
    {
        id: 'label_stamen_toner_labels_preset',
        label: 'Stamen注记',
        stack: ['label_stamen_toner_labels'],
    },

    // MapTiler 系列
    {
        id: 'imagery_maptiler_satellite_preset',
        label: 'MapTiler影像',
        stack: ['imagery_maptiler_satellite', 'label_tianditu'],
    },
    {
        id: 'imagery_maptiler_satellite_hd_preset',
        label: 'MapTiler影像HD',
        stack: ['imagery_maptiler_satellite_hd', 'label_tianditu'],
    },
    {
        id: 'vector_maptiler_streets_preset',
        label: 'MapTiler街道',
        stack: ['vector_maptiler_streets'],
    },
    {
        id: 'terrain_maptiler_landscape_preset',
        label: 'MapTiler地貌',
        stack: ['terrain_maptiler_landscape'],
    },
    {
        id: 'terrain_maptiler_topo_preset',
        label: 'MapTiler地形图',
        stack: ['terrain_maptiler_topo'],
    },
    {
        id: 'theme_maptiler_winter_preset',
        label: 'MapTiler冬季',
        stack: ['terrain_maptiler_topo', 'theme_maptiler_winter'],
    },
    { id: 'theme_maptiler_ocean_preset', label: 'MapTiler海洋', stack: ['theme_maptiler_ocean'] },

    // ArcGIS (ESRI) 系列
    { id: 'imagery_yandex_preset', label: 'Yandex卫星', stack: ['imagery_yandex'] },
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
    { id: 'vector_geoq_hydro_preset', label: 'GeoQ水', stack: ['vector_geoq_hydro'] },

    // Google 水系叠加（底部影像 + 水系纠偏叠加层）
    {
        id: 'imagery_google_water_preset',
        label: 'Google水系',
        stack: ['imagery_tuxin', 'imagery_google_water'],
    },

    // Sentinel-2 无云年度影像（EOX，2016~2025）
    {
        id: 'imagery_s2_cloudless_2016_preset',
        label: 'Sentinel无云2016',
        stack: ['imagery_s2_cloudless_2016', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2017_preset',
        label: 'Sentinel无云2017',
        stack: ['imagery_s2_cloudless_2017', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2018_preset',
        label: 'Sentinel无云2018',
        stack: ['imagery_s2_cloudless_2018', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2019_preset',
        label: 'Sentinel无云2019',
        stack: ['imagery_s2_cloudless_2019', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2020_preset',
        label: 'Sentinel无云2020',
        stack: ['imagery_s2_cloudless_2020', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2021_preset',
        label: 'Sentinel无云2021',
        stack: ['imagery_s2_cloudless_2021', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2022_preset',
        label: 'Sentinel无云2022',
        stack: ['imagery_s2_cloudless_2022', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2023_preset',
        label: 'Sentinel无云2023',
        stack: ['imagery_s2_cloudless_2023', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2024_preset',
        label: 'Sentinel无云2024',
        stack: ['imagery_s2_cloudless_2024', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2025_preset',
        label: 'Sentinel无云2025',
        stack: ['imagery_s2_cloudless_2025', 'label_tianditu'],
    },
];

/** Preset labels use the public 1-based URL layer number. */
export const ALL_BASEMAP_PRESETS: BasemapPresetDefinition[] = BASEMAP_PRESETS.map(
    (preset, index) => ({
        ...preset,
        label: `${index + 1} ${preset.label}`,
    }),
);

/**
 * URL 图层选项列表:用于 URL 参数 l 的图层索引映射(与 ALL_BASEMAP_PRESETS 同序)。
 * 原位于 basemapResolver.ts,随预设数据一并抽离至无 ol 依赖层。
 */
export const URL_LAYER_OPTIONS = ALL_BASEMAP_PRESETS.map((preset) => preset.id);
