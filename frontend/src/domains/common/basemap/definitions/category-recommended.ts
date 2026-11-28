/**
 * 精选底图（常用推荐）显式定义清单（V3.7.16）
 *
 * 定位：目录「常用推荐」一级分类的**唯一 SSOT**。每条只声明 preset id，
 * 展示名/stack/provider/coord/description 仍来自 basemapPresets.ts 与源图层定义，
 * 不在本文件重复——避免两处维护漂移（Force_command §4 SSOT）。
 *
 * 维护方式：自由增删改下方数组即可。顺序即推荐入口的展示顺序。
 * 允许与其他分类重复：registry 会把源定义主分类写入 tags，
 * 因此推荐条目同时出现在「常用推荐」与其原始分类中（快捷入口语义）。
 *
 * 初始内容取自清单建立时的前 20 条预设（一次性 copy，仅供起步）；
 * 此后推荐集合**只由本文件决定**，与预设数组顺序无任何关联。
 * 注释仅作识别用途（label / 构成 stack），不参与渲染。
 */

export interface RecommendedBasemapEntry {
    /** 对应 ALL_BASEMAP_PRESETS 中的 preset id */
    presetId: string;
    /** 识别用注释：展示名 + 构成（不参与运行时） */
    note: string;
}

export const RECOMMENDED_BASEMAPS: readonly RecommendedBasemapEntry[] = [
    // { presetId: 'local_tiles_preset', note: '本地瓦片 [local_tiles]' },
    // { presetId: 'custom', note: 'WMS/WMTS/MVT/XYZ [custom]' },
    { presetId: 'imagery_tianditu_preset', note: '天地图影像 [imagery_tianditu, label_tianditu]' },
    { presetId: 'vector_tianditu_preset', note: '天地图矢量 [vector_tianditu, label_tianditu]' },
    { presetId: 'vector_tianditu_mvt_preset', note: '天地图MVT矢量 [vector_tianditu_mvt]' },
    { presetId: 'imagery_tuxin_preset', note: '星图影像 [imagery_tuxin, label_tuxin]' },
    { presetId: 'vector_tuxin_preset', note: '星图矢量 [vector_tuxin, label_tuxin]' },
    { presetId: 'imagery_gac_preset', note: '谷歌影像(gac) [imagery_gac, label_tianditu]' },
    { presetId: 'imagery_google_preset', note: '谷歌影像原版 [imagery_google, terrain_google, label_tianditu]' },
    { presetId: 'imagery_amap_preset', note: '高德影像原版 [imagery_amap]' },
    { presetId: 'imagery_tianditu_omap_contour_preset', note: '奥维等高线 [imagery_tianditu, terrain_omap_contour, label_tianditu]' },
    { presetId: 'google_Backend_Proxy_preset', note: 'Google卫星影像(后端代理) [google_Backend_Proxy, label_tianditu]' },
    { presetId: 'osm_Backend_Proxy_preset', note: 'OSM代理 [osm_Backend_Proxy]' },
    { presetId: 'imagery_amap_wgs_preset', note: '高德影像(WGS) [imagery_amap_wgs]' },
    { presetId: 'vector_amap_wgs_preset', note: '高德地貌+建筑(WGS) [vector_amap_wgs]' },
    { presetId: 'vector_baidu_wgs_preset', note: '百度地图(WGS) [vector_baidu_wgs]' },
    { presetId: 'imagery_mapbox_preset', note: 'Mapbox影像 [imagery_mapbox, label_tuxin]' },
    { presetId: 'arcgis_imagery_preset', note: 'ESRI影像 [theme_arcgis_imagery_root, label_tianditu]' },
    { presetId: 'imagery_google_standard_preset', note: 'Google标准电子(GCJ) [imagery_google_standard]' },
    { presetId: 'vector_Google_clean_preset', note: 'Google简洁地形(WGS) [vector_Google_clean]' },
] as const;

/** 推荐 preset id 集合（O(1) 判定；模块加载时构建一次） */
export const RECOMMENDED_PRESET_IDS: ReadonlySet<string> = new Set(
    RECOMMENDED_BASEMAPS.map((entry) => entry.presetId),
);
