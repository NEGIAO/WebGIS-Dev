/**
 * Stable basemap preset allowlist exposed to the Agent.
 *
 * Intentionally excluded:
 *   - local_tiles_preset (local tiles, no internet)
 *   - custom (arbitrary URL)
 *   - custom_*_preset (custom server URLs: Mapbox, China Blender)
 *   - google_Backend_Proxy_preset (requires backend proxy)
 *   - Farmland/ship/windy thematic overlays (specialized, not general basemaps)
 *   - Polar/MFF relief (niche use cases)
 *
 * The Agent submits presetId only; project presets own all provider URLs.
 */
export const AGENT_BASEMAP_PRESETS = Object.freeze([
    // Tianditu
    { id: 'imagery_tianditu_preset', label: '天地图影像' },
    { id: 'vector_tianditu_preset', label: '天地图矢量' },
    // Tuxin
    { id: 'imagery_tuxin_preset', label: '图新影像' },
    { id: 'vector_tuxin_preset', label: '图新矢量' },
    // Google
    { id: 'imagery_gac_preset', label: 'Google(gac)' },
    { id: 'imagery_google_preset', label: 'Google原版' },
    { id: 'imagery_google_standard_preset', label: 'Google标准' },
    { id: 'vector_Google_clean_preset', label: 'Google简洁' },
    // Amap
    { id: 'imagery_amap_preset', label: '高德影像' },
    { id: 'vector_amap_preset', label: '高德地图' },
    // Mapbox
    { id: 'imagery_mapbox_preset', label: 'Mapbox影像' },
    // Other imagery
    { id: 'imagery_yandex_preset', label: 'Yandex卫星' },
    // Vector
    { id: 'vector_osm_preset', label: 'OSM标准' },
    { id: 'vector_carton_light_preset', label: 'Carto浅色' },
    { id: 'vector_carton_dark_preset', label: 'Carto深色' },
    { id: 'vector_toner_preset', label: '黑白版画' },
    { id: 'vector_alidade_preset', label: '清爽风格' },
    // MapTiler
    { id: 'imagery_maptiler_satellite_preset', label: 'MapTiler影像' },
    { id: 'imagery_maptiler_satellite_hd_preset', label: 'MapTiler影像HD' },
    { id: 'vector_maptiler_streets_preset', label: 'MapTiler街道' },
    { id: 'terrain_maptiler_landscape_preset', label: 'MapTiler地貌' },
    { id: 'terrain_maptiler_topo_preset', label: 'MapTiler地形图' },
    // ArcGIS
    { id: 'arcgis_imagery_preset', label: 'ESRI影像' },
    { id: 'arcgis_canvas_dark_preset', label: 'ESRI深灰' },
    { id: 'arcgis_canvas_light_preset', label: 'ESRI浅灰' },
    { id: 'arcgis_street_preset', label: 'ESRI街道' },
    { id: 'arcgis_topo_preset', label: 'ESRI世界地形' },
    { id: 'arcgis_natgeo_preset', label: '国家地理' },
    { id: 'arcgis_physical_preset', label: '自然地理' },
    { id: 'arcgis_ocean_preset', label: 'ESRI海洋' },
    { id: 'arcgis_terrain_base_preset', label: '地形底色' },
    // Terrain
    { id: 'arcgis_elev_hillshade_preset', label: '山体阴影' },
    { id: 'arcgis_elev_hillshade_dark_preset', label: '深色阴影' },
    { id: 'terrain_google_preset', label: 'Google山体' },
    { id: 'terrain_opentopomap_preset', label: '开放地形' },
    { id: 'terrain_esa_preset', label: '欧空局地形' },
    // Other
    { id: 'vector_geoq_gray_preset', label: 'GeoQ灰' },
    { id: 'vector_geoq_hydro_preset', label: 'GeoQ水' },
]);

export const AGENT_BASEMAP_PRESET_IDS = Object.freeze(
    AGENT_BASEMAP_PRESETS.map((preset) => preset.id),
);

const AGENT_BASEMAP_PRESET_ID_SET = new Set(AGENT_BASEMAP_PRESET_IDS);
const AGENT_BASEMAP_PRESET_LABELS = new Map(
    AGENT_BASEMAP_PRESETS.map((preset) => [preset.id, preset.label]),
);

export function isAgentBasemapPresetId(value) {
    return typeof value === 'string' && AGENT_BASEMAP_PRESET_ID_SET.has(value.trim());
}

export function getAgentBasemapPresetLabel(value) {
    return AGENT_BASEMAP_PRESET_LABELS.get(String(value || '').trim()) || null;
}
