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
    { id: 'custom', label: 'WMS/WMTS/MVT/XYZ', stack: ['custom'] },

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
    {
        id: 'vector_tianditu_mvt_preset',
        label: '天地图MVT矢量',
        stack: ['vector_tianditu_mvt'],
    },

    // 星图系列
    { id: 'imagery_tuxin_preset', label: '星图影像', stack: ['imagery_tuxin', 'label_tuxin'] },
    { id: 'vector_tuxin_preset', label: '星图矢量', stack: ['vector_tuxin', 'label_tuxin'] },

    // 互联网商业地图
    { id: 'imagery_gac_preset', label: '谷歌影像(gac)', stack: ['imagery_gac', 'label_tianditu'] },
    {
        id: 'imagery_google_preset',
        label: '谷歌影像原版',
        stack: ['imagery_google', 'vector_google_combo_pb_hillshade_wgs', 'label_tianditu'],
    },
    { id: 'imagery_amap_preset', label: '高德影像', stack: ['imagery_amap'] },
    {
        id: 'imagery_tianditu_omap_contour_preset',
        label: '奥维等高线',
        stack: ['imagery_tianditu', 'terrain_omap_contour', 'label_tianditu'],
    },
    {
        id: 'google_Backend_Proxy_preset',
        label: '谷歌卫星代理',
        stack: ['google_Backend_Proxy', 'label_tianditu'],
    },
    // OSM 代理：矢量底图自带注记，不叠注记层（与 vector_osm_preset 同构）
    {
        id: 'osm_Backend_Proxy_preset',
        label: 'OSM代理',
        stack: ['osm_Backend_Proxy'],
    },
    { id: 'imagery_amap_wgs_preset', label: '高德影像(WGS)', stack: ['imagery_amap_wgs'] },
    { id: 'vector_amap_wgs_preset', label: '高德地貌+建筑(WGS)', stack: ['vector_amap_wgs'] },
    { id: 'vector_baidu_wgs_preset', label: '百度地图(WGS)', stack: ['vector_baidu_wgs'] },
    { id: 'imagery_mapbox_preset', label: 'Mapbox影像', stack: ['imagery_mapbox', 'label_tuxin'] },
    {
        id: 'arcgis_imagery_preset',
        label: 'ESRI影像',
        stack: ['theme_arcgis_imagery_root', 'label_tianditu'],
    },
    {
        id: 'imagery_google_standard_preset',
        label: '谷歌电子地图',
        stack: ['imagery_google_standard'],
    },
    { id: 'vector_Google_clean_preset', label: '简洁地形', stack: ['vector_google_combo_clean_terrain_no_road_wgs'] },
    { id: 'vector_amap_preset', label: '地貌+建筑', stack: ['vector_amap'] },
    { id: 'vector_tengxun_preset', label: '标准地图', stack: ['vector_tengxun'] },
    { id: 'vector_tengxun_wgs_preset', label: '标准地图', stack: ['vector_tengxun_wgs'] },
    { id: 'vector_osm_preset', label: '标准', stack: ['vector_osm'] },
    { id: 'vector_cyclosm_preset', label: '骑行', stack: ['vector_cyclosm'] },
    {
        id: 'custom_mapbox_labeled_preset',
        label: '自定义(含标注)',
        stack: ['custom_mapbox_labeled'],
    },
    {
        id: 'custom_mapbox_unlabeled_preset',
        label: '自定义(无标注)',
        stack: ['custom_mapbox_unlabeled', 'label_tuxin'],
    },
    {
        id: 'custom_China_Blender_preset',
        label: 'China Blender1',
        stack: ['custom_China_Blender', 'vector_google_combo_pb_hillshade_wgs'],
    },
    {
        id: 'custom_China_Blender_preset_2',
        label: 'China Blender2',
        stack: ['custom_China_Blender', 'label_tianditu_vector'],
    },
    { id: 'vector_carton_light_preset', label: '浅色', stack: ['vector_carton_light'] },
    { id: 'vector_carton_dark_preset', label: '深色', stack: ['vector_carton_dark'] },
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
    { id: 'vector_osm_bright_preset', label: 'Bright', stack: ['vector_osm_bright'] },
    { id: 'terrain_stamen_preset', label: '地形', stack: ['terrain_stamen'] },
    { id: 'terrain_outdoors_preset', label: '户外', stack: ['terrain_outdoors'] },
    {
        id: 'theme_stamen_watercolor_preset',
        label: '水彩',
        stack: ['theme_stamen_watercolor'],
    },
    {
        id: 'imagery_alidade_satellite_preset',
        label: '卫星',
        stack: ['imagery_alidade_satellite'],
    },
    {
        id: 'label_stamen_toner_lines_preset',
        label: '线划',
        stack: ['label_stamen_toner_lines'],
    },
    {
        id: 'label_stamen_toner_labels_preset',
        label: '注记',
        stack: ['label_stamen_toner_labels'],
    },

    // MapTiler 系列
    {
        id: 'imagery_maptiler_satellite_preset',
        label: '影像',
        stack: ['imagery_maptiler_satellite', 'label_tianditu'],
    },
    {
        id: 'imagery_maptiler_satellite_hd_preset',
        label: '影像HD',
        stack: ['imagery_maptiler_satellite_hd', 'label_tianditu'],
    },
    {
        id: 'vector_maptiler_streets_preset',
        label: '街道',
        stack: ['vector_maptiler_streets'],
    },
    {
        id: 'terrain_maptiler_landscape_preset',
        label: '地貌',
        stack: ['terrain_maptiler_landscape'],
    },
    {
        id: 'terrain_maptiler_topo_preset',
        label: '地形图',
        stack: ['terrain_maptiler_topo'],
    },
    {
        id: 'theme_maptiler_winter_preset',
        label: '冬季',
        stack: ['terrain_maptiler_topo', 'theme_maptiler_winter'],
    },
    { id: 'theme_maptiler_ocean_preset', label: '海洋', stack: ['theme_maptiler_ocean'] },

    // ArcGIS (ESRI) 系列
    { id: 'imagery_yandex_preset', label: 'Yandex卫星', stack: ['imagery_yandex'] },
    {
        id: 'arcgis_canvas_dark_preset',
        label: '深灰',
        stack: ['theme_arcgis_canvas_dark_base', 'theme_arcgis_canvas_dark_ref'],
    },
    {
        id: 'arcgis_canvas_light_preset',
        label: '浅灰',
        stack: ['theme_arcgis_canvas_light_base', 'theme_arcgis_canvas_light_ref'],
    },
    { id: 'arcgis_street_preset', label: '街道', stack: ['theme_arcgis_street_root'] },
    { id: 'arcgis_topo_preset', label: '世界地形', stack: ['theme_arcgis_topo_root'] },
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
    { id: 'terrain_google_preset', label: '山体', stack: ['vector_google_combo_pb_hillshade_wgs'] },
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
    { id: 'windy_preset', label: '户外', stack: ['theme_windy'] },
    { id: 'windy2_preset', label: '冬季', stack: ['theme_windy2'] },
    { id: 'windy_outer_preset', label: '轮廓', stack: ['theme_windy_outer'] },
    { id: 'windy_greenland_preset', label: '灰色', stack: ['theme_windy_greenland'] },

    // 极地与海洋系列
    {
        id: 'arcgis_ocean_preset',
        label: '海洋',
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
        label: '水体',
        stack: ['terrain_relief', 'theme_mff_water', 'label_tianditu'],
    },
    {
        id: 'mff_admin_preset',
        label: '边界',
        stack: ['terrain_relief', 'theme_mff_admin', 'label_tianditu'],
    },
    {
        id: 'mff_streets_preset',
        label: '街道',
        stack: ['terrain_relief', 'theme_mff_streets', 'label_tianditu'],
    },
    {
        id: 'mff_forest_preset',
        label: '森林',
        stack: ['terrain_relief', 'theme_mff_forest', 'label_tianditu'],
    },

    // 其他与自定义
    { id: 'vector_geoq_hydro_preset', label: '水系', stack: ['vector_geoq_hydro'] },

    // Google 水系叠加（底部影像 + 水系纠偏叠加层）
    {
        id: 'imagery_google_water_preset',
        label: '水系',
        stack: ['imagery_tuxin', 'vector_google_combo_water_wgs'],
    },

    // Sentinel-2 无云年度影像（EOX，2016~2025）
    {
        id: 'imagery_s2_cloudless_2016_preset',
        label: '无云2016',
        stack: ['imagery_s2_cloudless_2016', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2017_preset',
        label: '无云2017',
        stack: ['imagery_s2_cloudless_2017', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2018_preset',
        label: '无云2018',
        stack: ['imagery_s2_cloudless_2018', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2019_preset',
        label: '无云2019',
        stack: ['imagery_s2_cloudless_2019', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2020_preset',
        label: '无云2020',
        stack: ['imagery_s2_cloudless_2020', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2021_preset',
        label: '无云2021',
        stack: ['imagery_s2_cloudless_2021', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2022_preset',
        label: '无云2022',
        stack: ['imagery_s2_cloudless_2022', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2023_preset',
        label: '无云2023',
        stack: ['imagery_s2_cloudless_2023', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2024_preset',
        label: '无云2024',
        stack: ['imagery_s2_cloudless_2024', 'label_tianditu'],
    },
    {
        id: 'imagery_s2_cloudless_2025_preset',
        label: '无云2025',
        stack: ['imagery_s2_cloudless_2025', 'label_tianditu'],
    },
    // MineMap（四维图新）纯注记：源为 GCJ-02 加偏，已在图层定义处走 gcj2wgs 逐瓦片纠偏；
    // 仅标注无底图，选中后需再叠加影像（与 Stamen 注记 preset 同形态）。
    // 追加在列表末尾——URL 参数 l 为 1-based 索引契约，插在中间会改变既有预设编号、破坏已分享链接。
    {
        id: 'label_minedata_preset',
        label: '注记',
        stack: ['label_minedata'],
    },
    // OpenFreeMap Liberty 矢量样式（OSM 数据 + ol-mapbox-style 全量样式），追加在末尾以保持 l 索引契约
    {
        id: 'vector_openfreemap_liberty_preset',
        label: 'Liberty矢量',
        stack: ['vector_openfreemap_liberty'],
    },
    // 追加在末尾，保持既有 URL 参数 l 的 1-based 编号不变。
    {
        id: 'vector_amap_clean_hd_preset',
        label: '简洁512（无道路）',
        stack: ['vector_amap_clean_hd'],
    },
    {
        id: 'vector_amap_clean_wgs_preset',
        label: '简洁纠偏',
        stack: ['vector_amap_256_ltype_1_wgs'],
    },
    {
        id: 'vector_amap_clean_roads_preset',
        label: '简洁有路（无注记）',
        stack: ['vector_amap_clean_roads'],
    },
    {
        id: 'vector_amap_pure_roads_wgs_preset',
        label: '简洁底图+纯道路',
        stack: ['vector_amap_256_ltype_1_wgs', 'vector_amap_roads_wgs'],
    },
    // 高德 256px 电子底图 ltype 常用组合（GCJ + WGS），逐条显式声明，追加在末尾保持 URL l 索引不变
    {
        id: 'vector_amap_256_ltype_1_gcj_preset',
        label: '地貌',
        stack: ['vector_amap_256_ltype_1_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_1_wgs_preset',
        label: '地貌',
        stack: ['vector_amap_256_ltype_1_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_2_gcj_preset',
        label: '路网',
        stack: ['vector_amap_256_ltype_2_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_2_wgs_preset',
        label: '路网',
        stack: ['vector_amap_256_ltype_2_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_3_gcj_preset',
        label: '地貌+路网',
        stack: ['vector_amap_256_ltype_3_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_3_wgs_preset',
        label: '地貌+路网',
        stack: ['vector_amap_256_ltype_3_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_4_gcj_preset',
        label: '注记',
        stack: ['vector_amap_256_ltype_4_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_4_wgs_preset',
        label: '注记',
        stack: ['vector_amap_256_ltype_4_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_5_gcj_preset',
        label: '地貌+注记',
        stack: ['vector_amap_256_ltype_5_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_5_wgs_preset',
        label: '地貌+注记',
        stack: ['vector_amap_256_ltype_5_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_6_gcj_preset',
        label: '路网+注记',
        stack: ['vector_amap_256_ltype_6_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_6_wgs_preset',
        label: '路网+注记',
        stack: ['vector_amap_256_ltype_6_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_7_gcj_preset',
        label: '地貌+路网+注记',
        stack: ['vector_amap_256_ltype_7_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_7_wgs_preset',
        label: '地貌+路网+注记',
        stack: ['vector_amap_256_ltype_7_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_8_gcj_preset',
        label: '建筑',
        stack: ['vector_amap_256_ltype_8_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_8_wgs_preset',
        label: '建筑',
        stack: ['vector_amap_256_ltype_8_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_11_gcj_preset',
        label: '地貌+路网+建筑',
        stack: ['vector_amap_256_ltype_11_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_11_wgs_preset',
        label: '地貌+路网+建筑',
        stack: ['vector_amap_256_ltype_11_wgs'],
    },
    {
        id: 'vector_amap_256_ltype_15_gcj_preset',
        label: '全要素',
        stack: ['vector_amap_256_ltype_15_gcj'],
    },
    {
        id: 'vector_amap_256_ltype_15_wgs_preset',
        label: '全要素',
        stack: ['vector_amap_256_ltype_15_wgs'],
    },
    // Google 全组合（依据 Google_tiles.md）：GCJ 原生与 WGS 原生均提供两种坐标格式，追加在末尾保持 l 索引不变
    {
        id: 'vector_google_combo_standard_gcj_preset',
        label: '标准电子',
        stack: ['vector_google_combo_standard_gcj'],
    },
    {
        id: 'vector_google_combo_standard_wgs_preset',
        label: '标准电子',
        stack: ['vector_google_combo_standard_wgs'],
    },
    {
        id: 'vector_google_combo_hybrid_gcj_preset',
        label: '混合影像',
        stack: ['vector_google_combo_hybrid_gcj'],
    },
    {
        id: 'vector_google_combo_hybrid_wgs_preset',
        label: '混合影像',
        stack: ['vector_google_combo_hybrid_wgs'],
    },
    {
        id: 'vector_google_combo_labels_gcj_preset',
        label: '仅注记',
        stack: ['vector_google_combo_labels_gcj'],
    },
    {
        id: 'vector_google_combo_labels_wgs_preset',
        label: '仅注记',
        stack: ['vector_google_combo_labels_wgs'],
    },
    {
        id: 'vector_google_combo_road_labeled_gcj_preset',
        label: '纯路网含注记',
        stack: ['vector_google_combo_road_labeled_gcj'],
    },
    {
        id: 'vector_google_combo_road_labeled_wgs_preset',
        label: '纯路网含注记',
        stack: ['vector_google_combo_road_labeled_wgs'],
    },
    {
        id: 'vector_google_combo_road_skeleton_gcj_preset',
        label: '纯路网骨架',
        stack: ['vector_google_combo_road_skeleton_gcj'],
    },
    {
        id: 'vector_google_combo_road_skeleton_wgs_preset',
        label: '纯路网骨架',
        stack: ['vector_google_combo_road_skeleton_wgs'],
    },
    {
        id: 'vector_google_combo_road_text_gcj_preset',
        label: '纯路网注记',
        stack: ['vector_google_combo_road_text_gcj'],
    },
    {
        id: 'vector_google_combo_road_text_wgs_preset',
        label: '纯路网注记',
        stack: ['vector_google_combo_road_text_wgs'],
    },
    {
        id: 'vector_google_combo_water_gcj_preset',
        label: '纯水体',
        stack: ['vector_google_combo_water_gcj'],
    },
    {
        id: 'vector_google_combo_water_wgs_preset',
        label: '纯水体',
        stack: ['vector_google_combo_water_wgs'],
    },
    {
        id: 'vector_google_combo_pb_roadmap_gcj_preset',
        label: 'PB标准电子',
        stack: ['vector_google_combo_pb_roadmap_gcj'],
    },
    {
        id: 'vector_google_combo_pb_roadmap_wgs_preset',
        label: 'PB标准电子',
        stack: ['vector_google_combo_pb_roadmap_wgs'],
    },
    {
        id: 'vector_google_combo_pb_roadline_gcj_preset',
        label: 'PB纯路网',
        stack: ['vector_google_combo_pb_roadline_gcj'],
    },
    {
        id: 'vector_google_combo_pb_roadline_wgs_preset',
        label: 'PB纯路网',
        stack: ['vector_google_combo_pb_roadline_wgs'],
    },
    {
        id: 'vector_google_combo_satellite_wgs_preset',
        label: '纯卫星',
        stack: ['vector_google_combo_satellite_wgs'],
    },
    {
        id: 'vector_google_combo_satellite_gcj_preset',
        label: '纯卫星',
        stack: ['vector_google_combo_satellite_gcj'],
    },
    {
        id: 'vector_google_combo_terrain_wgs_preset',
        label: '纯地形',
        stack: ['vector_google_combo_terrain_wgs'],
    },
    {
        id: 'vector_google_combo_terrain_gcj_preset',
        label: '纯地形',
        stack: ['vector_google_combo_terrain_gcj'],
    },
    {
        id: 'vector_google_combo_terrain_hybrid_wgs_preset',
        label: '地形混合',
        stack: ['vector_google_combo_terrain_hybrid_wgs'],
    },
    {
        id: 'vector_google_combo_terrain_hybrid_gcj_preset',
        label: '地形混合',
        stack: ['vector_google_combo_terrain_hybrid_gcj'],
    },
    {
        id: 'vector_google_combo_clean_terrain_wgs_preset',
        label: '干净地形',
        stack: ['vector_google_combo_clean_terrain_wgs'],
    },
    {
        id: 'vector_google_combo_clean_terrain_gcj_preset',
        label: '干净地形',
        stack: ['vector_google_combo_clean_terrain_gcj'],
    },
    {
        id: 'vector_google_combo_clean_terrain_no_road_wgs_preset',
        label: '干净地形无路',
        stack: ['vector_google_combo_clean_terrain_no_road_wgs'],
    },
    {
        id: 'vector_google_combo_clean_terrain_no_road_gcj_preset',
        label: '干净地形无路',
        stack: ['vector_google_combo_clean_terrain_no_road_gcj'],
    },
    {
        id: 'vector_google_combo_pb_hillshade_wgs_preset',
        label: 'PB山体阴影',
        stack: ['vector_google_combo_pb_hillshade_wgs'],
    },
    {
        id: 'vector_google_combo_pb_hillshade_gcj_preset',
        label: 'PB山体阴影',
        stack: ['vector_google_combo_pb_hillshade_gcj'],
    },
    // V3.7.16：补齐「纠偏/代理版 ↔ 原始版」矩阵，追加在末尾以保持既有 1..148 编号不变
    { id: 'label_minedata_gcj_preset', label: 'MineMap注记(GCJ)', stack: ['label_minedata_gcj'] },
    { id: 'amap_label_gcj_preset', label: '高德注记(GCJ)', stack: ['amap_label_gcj'] },
    { id: 'vector_amap_gcj_preset', label: '高德地貌+建筑(GCJ)', stack: ['vector_amap_gcj'] },
    {
        id: 'vector_amap_roads_gcj_preset',
        label: '高德纯道路(GCJ)',
        stack: ['vector_amap_roads_gcj'],
    },
    { id: 'vector_baidu_preset', label: '百度地图(BD09)', stack: ['vector_baidu'] },
    { id: 'ships66_direct_preset', label: '船舶网(直连)', stack: ['ships66_direct'] },
    {
        id: 'vector_amap_hd_wgs_preset',
        label: '高德地貌+建筑(512 WGS)',
        stack: ['vector_amap_hd_wgs'],
    },
    {
        id: 'vector_amap_clean_hd_wgs_preset',
        label: '高德简洁电子(512 WGS)',
        stack: ['vector_amap_clean_hd_wgs'],
    },
    {
        id: 'vector_amap_clean_roads_wgs_preset',
        label: '高德简洁有路(512 WGS)',
        stack: ['vector_amap_clean_roads_wgs'],
    },
    { id: 'label_tuxin_wgs_preset', label: '图新注记(WGS)', stack: ['label_tuxin'] },
    { id: 'vector_tuxin_wgs_preset', label: '图新矢量(WGS)', stack: ['vector_tuxin'] },
    { id: 'imagery_tuxin_wgs_preset', label: '图新影像(WGS)', stack: ['imagery_tuxin'] },
    { id: 'vector_geoq_hydro_wgs_preset', label: 'GeoQ水(WGS)', stack: ['vector_geoq_hydro_wgs'] },
    {
        id: 'imagery_google_standard_wgs_preset',
        label: 'Google标准电子(WGS)',
        stack: ['imagery_google_standard_wgs'],
    },
    // V3.7.16：补齐互联网/GISer 高频公共底图，追加在末尾保持既有 1..162 编号不变
    { id: 'imagery_bing_aerial_preset', label: 'Bing影像', stack: ['imagery_bing_aerial'] },
    { id: 'vector_bing_road_preset', label: 'Bing道路', stack: ['vector_bing_road'] },
    { id: 'imagery_bing_hybrid_preset', label: 'Bing混合影像', stack: ['imagery_bing_hybrid'] },
    { id: 'vector_mapbox_streets_preset', label: 'Mapbox街道', stack: ['vector_mapbox_streets'] },
    {
        id: 'terrain_mapbox_outdoors_preset',
        label: 'Mapbox户外',
        stack: ['terrain_mapbox_outdoors'],
    },
    { id: 'vector_mapbox_light_preset', label: 'Mapbox浅色', stack: ['vector_mapbox_light'] },
    { id: 'vector_mapbox_dark_preset', label: 'Mapbox深色', stack: ['vector_mapbox_dark'] },
    {
        id: 'vector_maptiler_bright_preset',
        label: 'MapTiler明亮',
        stack: ['vector_maptiler_bright'],
    },
    {
        id: 'vector_maptiler_positron_preset',
        label: 'MapTiler极简',
        stack: ['vector_maptiler_positron'],
    },
    { id: 'vector_carto_voyager_preset', label: 'CARTO Voyager', stack: ['vector_carto_voyager'] },
    {
        id: 'vector_carto_positron_nolabels_preset',
        label: 'CARTO极简无注记',
        stack: ['vector_carto_positron_nolabels'],
    },
    {
        id: 'vector_carto_dark_nolabels_preset',
        label: 'CARTO深色无注记',
        stack: ['vector_carto_dark_nolabels'],
    },
    { id: 'terrain_usgs_topo_preset', label: 'USGS地形图', stack: ['terrain_usgs_topo'] },
    { id: 'imagery_usgs_preset', label: 'USGS影像', stack: ['imagery_usgs'] },
    { id: 'imagery_usgs_topo_preset', label: 'USGS影像地形', stack: ['imagery_usgs_topo'] },
    { id: 'label_openseamap_preset', label: 'OpenSeaMap海图注记', stack: ['label_openseamap'] },
    {
        id: 'vector_openrailwaymap_preset',
        label: 'OpenRailwayMap铁路',
        stack: ['vector_openrailwaymap'],
    },
    {
        id: 'imagery_nasa_modis_terra_preset',
        label: 'NASA MODIS真彩色',
        stack: ['imagery_nasa_modis_terra'],
    },
    {
        id: 'imagery_nasa_viirs_night_preset',
        label: 'NASA VIIRS夜间灯光',
        stack: ['imagery_nasa_viirs_night'],
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
