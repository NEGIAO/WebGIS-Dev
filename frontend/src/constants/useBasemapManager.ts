/**
 * 底图管理常量配置
 * 本文件仅维护图层 URL、分组、组合栈与轻量映射。
 * 协议识别与建源逻辑请见 src/composables/useTileSourceFactory.ts
 */
// import { anonymousTileLoader } from '@/composables/useTileSourceFactory';

import { ref } from 'vue';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import type {
    ConfiguredTileServiceDefinition,
    NonStandardXYZAdapter,
    TileSourceLike
} from '../composables/useTileSourceFactory';
import {
    buildMapsForFreeAdapter,
    createConfiguredServiceSource,
    createXYZSourceFromUrl
} from '../composables/useTileSourceFactory';

export {
    createAutoTileSourceFromUrl,
    detectCustomTileServiceKind,
    detectNonStandardXYZ,
    normalizeTileY,
    toQuadKey
} from '../composables/useTileSourceFactory';

export type {
    TileYNormalizeMode,
    CustomTileSourceKind,
    AutoTileSourceResult
} from '../composables/useTileSourceFactory';

// ========== 主机配置常量 ==========
export const TILE_HOSTS = {
    tianditu: 't0.tianditu.gov.cn',
    googleCandidates: ['mt3v.gggis.com', 'gac-geo.googlecnapps.club']
};

export const GOOGLE_HOST_STRATEGY = 'manual' as const;
export const GOOGLE_MANUAL_HOST = TILE_HOSTS.googleCandidates[1];
export const GOOGLE_PROBE_TIMEOUT_MS = 1200;

// ========== 类型定义 ==========
// 六大类型：注记(label)、影像(imagery)、地形(terrain)、矢量(vector)、专题(theme)、自定义(custom)
export type LayerCategory =  'label' | 'imagery' |'terrain'|'vector'|'theme' |"custom";
export type LayerGroup = "自定义"|'影像' | '矢量' | '专题' | '注记' | 'Canvas' | '地形' | '海洋' | '参考' | '专题' | '极地' | '世界' | '其他' | 'ESRI Online' | 'Root' | 'Navigation' | 'Elevation' | 'Ocean' | 'Polar' | 'Reference' | 'Specialty' | 'World';

type TileSourceInstance = TileSourceLike | OSM | null;

type LayerFactoryContext = {
    normBase: string;
    tiandituTk: string;
    customUrl: string;
};

type LayerSourceDefinition = {
    id: string;
    name: string;
    category: LayerCategory;
    group: LayerGroup;
    defaultVisible?: boolean;
    createSource: (ctx: LayerFactoryContext) => TileSourceInstance;
};

type BasemapPresetDefinition = {
    id: string;
    label: string;
    // 从下到上的图层顺序
    stack: string[];
};

type UserEditableTileLayerConfig = ConfiguredTileServiceDefinition & {
    category?: LayerCategory;
    group?: LayerGroup;
    defaultVisible?: boolean;
};

/** 
    默认底图预设 ID
    Default Basemap Preset ID
 */
// export const DEFAULT_BASEMAP_PRESET_ID = 'tianDiTu';
// export const DEFAULT_BASEMAP_PRESET_ID = 'local';
// export const DEFAULT_BASEMAP_PRESET_ID = 'google';
export const DEFAULT_BASEMAP_PRESET_ID = 'custom_mapbox_unlabeled_preset';
// //gac谷歌
// ========== 响应式状态 ==========
/** Google 主机选择状态（全局单例） */
export const activeGoogleTileHost = ref(GOOGLE_MANUAL_HOST);

// ========== 轻量工具函数（主机选择） ==========
export function probeGoogleHostLatency(host: string, timeoutMs: number = GOOGLE_PROBE_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const start = performance.now();
        const img = new Image();
        let settled = false;

        const end = (latency: number) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            resolve(latency);
        };

        const timer = setTimeout(() => end(Number.POSITIVE_INFINITY), timeoutMs);
        img.onload = () => end(performance.now() - start);
        img.onerror = () => end(Number.POSITIVE_INFINITY);
        img.src = `https://${host}/maps/vt?lyrs=s&x=0&y=0&z=1&_probe=${Date.now()}`;
    });
}

export async function resolvePreferredGoogleHost() {
    if (GOOGLE_HOST_STRATEGY !== ('fastest' as any)) return GOOGLE_MANUAL_HOST;

    const candidates = TILE_HOSTS.googleCandidates || [];
    if (!candidates.length) return GOOGLE_MANUAL_HOST;

    const measured = await Promise.all(candidates.map(async (host) => ({
        host,
        latency: await probeGoogleHostLatency(host)
    })));

    measured.sort((a, b) => (a.latency as number) - (b.latency as number));
    const best = measured[0];
    return Number.isFinite(best?.latency as number) ? best.host : GOOGLE_MANUAL_HOST;
}

/** 拼接 Google 瓦片服务 URL。 */
export const buildGoogleTileUrl = (pathAndQuery: string) => `https://${activeGoogleTileHost.value}${pathAndQuery}`;

/** 拼接天地图瓦片服务 URL。 */
export const buildTiandituUrl = (pathAndQuery: string, tiandituTk: string): string => {
    const hasQuery = pathAndQuery.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `https://${TILE_HOSTS.tianditu}${pathAndQuery}${separator}tk=${tiandituTk}`;
};

// 非标准 XYZ 图源适配器（内部工具，在配置1中使用）
const NON_STANDARD_XYZ_ADAPTERS: Record<string, NonStandardXYZAdapter> = {
    'maps-for-free-relief': buildMapsForFreeAdapter('relief', '地形浮雕(MFF)', 'jpg'),
    'maps-for-free-water': buildMapsForFreeAdapter('water', '水体(MFF)'),
    'maps-for-free-admin': buildMapsForFreeAdapter('admin', '行政边界(MFF)'),
    'maps-for-free-streets': buildMapsForFreeAdapter('streets', '街道(MFF)'),
    'maps-for-free-country': buildMapsForFreeAdapter('country', '国家边界(MFF)', 'png'),
    'maps-for-free-crop': buildMapsForFreeAdapter('crop', '作物(MFF)'),
    'maps-for-free-grass': buildMapsForFreeAdapter('grass', '草地(MFF)'),
    'maps-for-free-forest': buildMapsForFreeAdapter('forest', '森林(MFF)'),
    'maps-for-free-tundra': buildMapsForFreeAdapter('tundra', '冻土(MFF)'),
    'maps-for-free-sand': buildMapsForFreeAdapter('sand', '沙地(MFF)'),
    'maps-for-free-swamp': buildMapsForFreeAdapter('swamp', '沼泽(MFF)'),
    'maps-for-free-ice': buildMapsForFreeAdapter('ice', '冰川(MFF)')
};

// ========== 配置已统一到配置1（图层）和配置2（预设） ===========

// ========== 单文件集中配置（图层源 + 预设） ==========
// 设计原则：一处配置、全局生效
// 配置1：在 LAYER_SOURCE_DEFINITIONS 中直接配置所有 URL 和属性 => 自动显示在图层列表
// 配置2：在 BASEMAP_PRESETS 中直接配置图层叠置和顺序 => 自动显示在下拉菜单
// 新增图源时：仅在配置1和2中直接编辑即可，所有URL直接inline，禁止使用变量引用










































// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


// 配置1：图层URL、属性设置
const LAYER_SOURCE_DEFINITIONS: LayerSourceDefinition[] = [
    // 1、注记图层
    {
        id: 'label_tianditu',
        name: '天地图注记',
        category: 'label',
        group: '注记',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'label_tianditu_vector',
        name: '天地图矢量注记',
        category: 'label',
        group: '注记',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/cva_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'label_tuxin',
        name: '图新注记',
        category: 'label',
        group: '注记',
        createSource: () => new XYZ({
            url: "https://tiles.geovisearth.com/base/v1/cia/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228"
        })
    },

    {
        id:'terrain_gac',
        name: 'Google山体阴影(gac)',
        category: 'terrain',
        group: '地形',
        createSource: () => new XYZ({
            url:"https://gac-geo.googlecnapps.club/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5"
        })
    },
    {
        id:'terrain_google',
        name: 'Google山体阴影',
        category: 'terrain',
        group: '地形',
        createSource: () => new XYZ({
            url:'http://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5'
        })
    },

    // 2、影像图层
    {
        id: 'imagery_tianditu',
        name: '天地图影像',
        category: 'imagery',
        group: '影像',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'imagery_tuxin',
        name: "图新影像",
        category: 'imagery',
        group: '影像',
        createSource: () => new XYZ({
            url: "https://tiles.geovisearth.com/base/v1/img/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228"
        })
    },
    {
        id: 'imagery_amap',
        name: '高德影像(GCJ)',
        category: 'imagery',
        group: '影像',
        createSource: () => new XYZ({ url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}' })
    },
    {
        id: 'imagery_google',
        name: 'Google原版',
        category: 'imagery',
        group: '影像',
        createSource: () => new XYZ({ 
            // tilePixelRatio: 2,
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 })
    },
    {
        id: 'imagery_gac',
        name: 'Google(gac)',
        category: 'imagery',
        group: '影像',
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}'), maxZoom: 20 })
    },
    {
        id: 'theme_arcgis_imagery_root',
        name: 'ESRI影像图',
        category: 'imagery',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'imagery_google_standard',
        name: 'Google标准',
        category: 'imagery',
        group: '影像',
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=m&x={x}&y={y}&z={z}') })
    },
    {
        id: 'imagery_yandex',
        name: 'Yandex影像',
        category: 'imagery',
        group: '影像',
        createSource: () => new XYZ({ url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}' })
    },
    // 3、专题图层
    // ========== 配置1：用户自定义 WMS/WMTS/XYZ 图层==========
    // 在此直接添加新的WMS、WMTS、XYZ服务，然后在配置2（BASEMAP_PRESETS）中添加堆叠预设

    // 广东基本农田 (WMS)
    {
        id: 'theme_gd_basic_farmland_wms',
        name: '广东基本农田(WMS)',
        category: 'theme',
        group: '专题',
        createSource: () => createConfiguredServiceSource({
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
                transparent: true
            }
        }, { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },

    // 河南基本农田 (WMTS)
    {
        id: 'theme_hn_basic_farmland_wmts',
        name: '河南基本农田(WMTS)',
        category: 'theme',
        group: '专题',
        createSource: () => createConfiguredServiceSource({
            id: 'theme_hn_basic_farmland_wmts',
            name: '河南基本农田(WMTS)',
            serviceType: 'wmts',
            url: 'https://www.hnsditu.cn/iserver/services/map-agscache-jibennongtian/wmts100?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=jibennongtian&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_jibennongtian&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
            wmts: {
                layer: 'jibennongtian',
                style: 'default',
                matrixSet: 'GoogleMapsCompatible_jibennongtian',
                format: 'image/png',
                version: '1.0.0'
            }
        }, { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },

    // 河南耕地现状 (WMTS)
    {
        id: 'theme_hn_farmland_wmts',
        name: '河南耕地(WMTS)',
        category: 'theme',
        group: '专题',
        createSource: () => createConfiguredServiceSource({
            id: 'theme_hn_farmland_wmts',
            name: '河南耕地(WMTS)',
            serviceType: 'wmts',
            url: 'https://www.hnsditu.cn/iserver/services/map-agscache-gengdi/wmts100?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=gengdi&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_gengdi&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
            wmts: {
                layer: 'gengdi',
                style: 'default',
                matrixSet: 'GoogleMapsCompatible_gengdi',
                format: 'image/png',
                version: '1.0.0'
            }
        }, { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    // ===============================================================================================================================================
    // Arcgis Online 服务25个
    // --- Canvas 分类 ---
    {
        id: 'theme_arcgis_canvas_dark_base',
        name: 'ESRI深灰色底图',
        category: 'theme',
        group: 'Canvas',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_canvas_dark_ref',
        name: 'ESRI深灰色参考注记',
        category: 'theme',
        group: 'Canvas',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_canvas_light_base',
        name: 'ESRI浅灰色底图',
        category: 'theme',
        group: 'Canvas',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_canvas_light_ref',
        name: 'ESRI浅灰色参考注记',
        category: 'theme',
        group: 'Canvas',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Elevation 分类 ---


    // --- Ocean 分类 ---
    {
        id: 'theme_arcgis_ocean_base',
        name: 'ESRI海洋底图',
        category: 'theme',
        group: 'Ocean',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_ocean_ref',
        name: 'ESRI海洋参考注记',
        category: 'theme',
        group: 'Ocean',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Polar 分类 (极地) ---
    {
        id: 'imagery_arcgis_polar_ant_img',
        name: 'ESRI南极影像',
        category: 'imagery',
        group: 'Polar',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Antarctic_Imagery/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'imagery_arcgis_polar_arc_img',
        name: 'ESRI北极影像',
        category: 'imagery',
        group: 'Polar',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Imagery/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_polar_arc_base',
        name: 'ESRI北极底图',
        category: 'theme',
        group: 'Polar',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'label_arcgis_polar_arc_ref',
        name: 'ESRI北极参考注记',
        category: 'label',
        group: 'Polar',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Reference/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Reference 分类 ---
    {
        id: 'theme_arcgis_ref_boundaries',
        name: 'ESRI世界边界地名',
        category: 'theme',
        group: 'Reference',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_ref_boundaries_alt',
        name: 'ESRI世界边界地名(备选)',
        category: 'theme',
        group: 'Reference',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places_Alternate/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_ref_overlay',
        name: 'ESRI世界参考叠加层',
        category: 'theme',
        group: 'Reference',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_ref_transport',
        name: 'ESRI世界交通',
        category: 'theme',
        group: 'Reference',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Specialty 分类 ---
    {
        id: 'theme_arcgis_spec_nav',
        name: 'ESRI世界航海图',
        category: 'theme',
        group: 'Specialty',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Specialty/World_Navigation_Charts/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Root 根目录 ---
    {
        id: 'theme_arcgis_natgeo_world',
        name: '国家地理世界地图',
        category: 'theme',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_usa_topo',
        name: 'USA地形图',
        category: 'theme',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}' })
    },

    {
        id: 'theme_arcgis_physical_root',
        name: '世界自然地理图',
        category: 'theme',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_shaded_relief',
        name: '世界地形渲染图',
        category: 'theme',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_street_root',
        name: '世界街道图',
        category: 'theme',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_terrain_base',
        name: '世界地形底图',
        category: 'theme',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'theme_arcgis_topo_root',
        name: '世界地形图',
        category: 'theme',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}' })
    },
    // ===============================================================================================================================================

    {
        id: 'terrain_esa',
        name: '欧空局地形',
        category: "terrain",
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png' })
    },
    {
        id: 'theme_windy',
        name: 'windy',
        category: 'theme',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}/?lang=en' })
    },
    {
        id: 'theme_windy2',
        name: 'windy2',
        category: 'theme',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/v1/maptiles/winter/256/{z}/{x}/{y}/?lang=en' })
    },
    {
        id: 'theme_windy_outer',
        name: 'windy轮廓',
        category: 'theme',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/darkmap-retina/{z}/{x}/{y}.png' })
    },
    {
        id: 'theme_windy_greenland',
        name: 'windy Gray',
        category: 'theme',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/grayland/{z}/{x}/{y}.png' })
    },

    // MFF 专题层（直接inline URL，禁止使用函数生成）
    {
        id: 'theme_mff_water',
        name: 'MFF水体',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/water/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_admin',
        name: 'MFF行政边界',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/admin/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_streets',
        name: 'MFF街道',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/streets/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_country',
        name: 'MFF国家边界',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/country/z{z}/row{y}/{z}_{x}-{y}.png', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_crop',
        name: 'MFF作物',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/crop/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_grass',
        name: 'MFF草地',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/grass/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_forest',
        name: 'MFF森林',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/forest/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_tundra',
        name: 'MFF冻土',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/tundra/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_sand',
        name: 'MFF沙地',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/sand/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_swamp',
        name: 'MFF沼泽',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/swamp/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'theme_mff_ice',
        name: 'MFF冰川',
        category: 'theme',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/ice/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'terrain_relief',
        name: '地形浮雕(MFF)',
        category: "terrain",
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    // ===================================================================
    // 4、矢量图层
    {
        id: 'vector_tianditu',
        name: '天地图矢量',
        category: 'vector',
        group: '矢量',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id:'vector_tuxin',
        name: '图新矢量',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({
            url:'https://tiles.geovisearth.com/base/v1/vec/{z}/{x}/{y}?token=26ee8d8d392b1cc49d91cd81ef1c802b6a63651541ac9c3d3d1359d8bf844228'
        })
    },
    {
        id: 'vector_amap',
        name: '高德地图(GCJ)',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
        })
    },

    {
        id: 'vector_tengxun',
        name: '腾讯地图(GCJ)',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0'
        })
    },
    {
        id: 'vector_Google_clean',
        name: 'Google简洁(原版)',
        category: "vector",
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off'
        })
    },
    {
        id: 'vector_osm',
        name: 'OSM标准',
        category: 'vector',
        group: '矢量',
        createSource: () => new OSM()
    },
    {
        id: 'vector_carton_light',
        name: 'CartoDB',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' })
    },
    {
        id: 'vector_carton_dark',
        name: 'CartoDB Dark',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' })
    },
    {
        id: 'vector_wikipedia',
        name: 'Wikipedia',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png' })
    },
    {
        id: 'vector_toner',
        name: 'Stamen Toner',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png' })
    },
    {
        id: 'vector_alidade',
        name: 'Alidade Sm',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png' })
    },
    {
        id: 'vector_geoq_gray',
        name: 'GeoQ灰(GCJ)',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldGrayMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldGrayMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png'
        })
    },
    {
        id: 'vector_geoq_hydro',
        name: 'GeoQ水(GCJ)',
        category: 'vector',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png'
        })
    },
    // ===================================================================
    // 5、地形图层
    {
        id: 'terrain_opentopomap',
        name: '地形图',
        category: 'terrain',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' })
    },
    // {
    //     id:'terrain_google',
    //     name: 'Google山体阴影',
    //     category: 'terrain',
    //     group: '地形',
    //     createSource: () => new XYZ({
    //         url:'http://www.google.com/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5'
    //     })
    // },
    // {
    //     id:'terrain_gac',
    //     name: 'Google山体阴影(gac)',
    //     category: 'terrain',
    //     group: '地形',
    //     createSource: () => new XYZ({
    //         url:"https://gac-geo.googlecnapps.club/maps/vt/pb=!1m4!1m3!1i{z}!2i{x}!3i{y}!2m1!1e5"
    //     })
    // },
    {
        id: 'terrain_arcgis_elev_hillshade',
        name: 'ESRI世界山体阴影',
        category: 'terrain',
        group: 'Elevation',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'terrain_arcgis_elev_hillshade_dark',
        name: 'ESRI深色山体阴影',
        category: 'terrain',
        group: 'Elevation',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}' })
    },
    // ===================================================================
    // 6、自定义图层custom
    {
        id: 'local_tiles',
        name: '自定义瓦片',
        category: "custom",
        group: '自定义',
        createSource: ({ normBase }) => new XYZ({ url: `${normBase}tiles/{z}/{x}/{y}.png` })
    },
    {
        id: 'custom',
        name: '自定义URL',
        category: "custom",
        group: '自定义',
        createSource: ({ customUrl }) => customUrl
            ? createXYZSourceFromUrl(customUrl, { adapters: NON_STANDARD_XYZ_ADAPTERS })
            : null
    },
    {
        id: 'google_Backend_Proxy',
        name: '后端代理',
        category: "custom",
        group: '自定义',
        createSource: () => new XYZ({
            url: 'https://negiao-webgis.hf.space/proxy/mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
        })
    },
    {
        id:'ships66',
        name:"船舶网",
        category:"custom",
        group:'自定义',
        createSource: () => new XYZ({
            url: 'https://negiao-webgis.hf.space/tiles/ships66/{z}/{x}/{y}.png'
        })
    },
    // 待修复
    // 盗用的token，有风险，会被mapbox后台检测到，为避免被溯源，需要隐藏referrer，
    // 且不允许用户修改URL（因为用户修改后可能会暴露token）
    {
        id: 'custom_mapbox_labeled',
        name: 'Mapbox 自定义',
        category: "custom",
        group: '自定义',
        createSource: () => 
            new XYZ({
            url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo6wg8dm003v01s8d58qckdv/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
            // crossOrigin: 'anonymous',
            // // 关键：在这里直接指定加载函数
            // tileLoadFunction: (tile, src) => anonymousTileLoader(tile, src)
        })
    },
    {
        id: 'custom_mapbox_unlabeled',
        name: 'Mapbox 自定义(无标注)',
        category: 'custom',
        group: '自定义',
        createSource: () => new XYZ({
            url: 'https://api.mapbox.com/styles/v1/1tpjc/cmo71ml4b001m01sp8u9o773g/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoieGVyb2MiLCJhIjoiY21lenIyeWk4MXRuOTJrcTVjMWIwMXc3dCJ9.nMoRkxxiCpnFxmZ1H-ScwQ',
            // crossOrigin: 'anonymous',
            // // 关键：在这里直接指定加载函数
            // tileLoadFunction: (tile, src) => anonymousTileLoader(tile, src)
        
        })
    }
];


// 配置2：多底图叠置预设（下拉菜单显示用）
// label不超过7个汉字，否则会样式会遮挡鹰眼视图
// 配置2：多底图叠置预设（同步更新后的版本）
const BASEMAP_PRESETS: BasemapPresetDefinition[] = [
    { id: 'local_tiles_preset', label: '本地瓦片', stack: ['local_tiles'] },
    { id: 'custom', label: '自定义URL', stack: ['custom'] },
    // ==========================================
    // 1. 天地图系列 (Tianditu - 国家地理信息公共服务平台)
    // ==========================================
    { id: 'imagery_tianditu_preset', label: '天地图影像', stack: ['imagery_tianditu', 'terrain_gac','label_tianditu'] },
    { id: 'vector_tianditu_preset', label: '天地图矢量', stack: ['vector_tianditu', 'terrain_gac','label_tianditu_vector'] },

    // ==========================================
    // 2. 星图地球系列 (Geovis/Tuxin - 图新)
    // ==========================================
    { id: 'imagery_tuxin_preset', label: "图新影像", stack: ['imagery_tuxin', 'terrain_gac','label_tuxin'] },
    { id: 'vector_tuxin_preset', label: '图新矢量', stack: ['vector_tuxin', 'terrain_gac','label_tuxin'] },

    // ==========================================
    // 3. 互联网商业地图 (Google, Amap, OSM, Mapbox)
    // ==========================================
    // --- 影像类 ---
    { id: 'imagery_gac_preset', label: 'Google(gac)', stack: ['imagery_gac', 'terrain_gac','label_tianditu'] },
    { id: 'imagery_google_preset', label: 'Google原版', stack: ['imagery_google', 'terrain_google','label_tianditu'] },
    { id: 'imagery_amap_preset', label: '高德影像', stack: ['imagery_amap','terrain_gac'] },
    { id: 'imagery_yandex_preset', label: 'Yandex卫星', stack: ['imagery_yandex','terrain_gac'] },
    { id: 'google_Backend_Proxy_preset', label: '后端代理谷歌', stack: ['google_Backend_Proxy', 'terrain_gac','label_tianditu'] },
    
    // --- 矢量类 ---
    { id: 'imagery_google_standard_preset', label: 'Google标准', stack: ['imagery_google_standard','terrain_gac'] },
    { id: 'vector_Google_clean_preset', label: 'Google简洁', stack: ['vector_Google_clean','terrain_gac'] },
    { id: 'vector_amap_preset', label: '高德地图', stack: ['vector_amap','terrain_gac'] },
    { id: 'vector_tengxun_preset', label: '腾讯地图', stack: ['vector_tengxun','terrain_gac'] },
    { id: 'vector_osm_preset', label: 'OSM标准', stack: ['vector_osm','terrain_gac'] },
    
    // --- 艺术风格/Mapbox ---
    { id: 'custom_mapbox_labeled_preset', label: 'Mapbox自定义', stack: ['custom_mapbox_labeled','terrain_gac'] },
    { id: 'custom_mapbox_unlabeled_preset', label: 'Mapbox(无注记)', stack: ['custom_mapbox_unlabeled', 'terrain_gac','label_tuxin'] },
    { id: 'vector_carton_light_preset', label: 'Carto浅色', stack: ['vector_carton_light'] },
    { id: 'vector_carton_dark_preset', label: 'Carto深色', stack: ['vector_carton_dark'] },
    { id: 'vector_toner_preset', label: '黑白版画', stack: ['vector_toner'] },
    { id: 'vector_alidade_preset', label: '清爽风格', stack: ['vector_alidade'] },

    // ==========================================
    // 4. ArcGIS (ESRI) 系列
    // ==========================================
    { id: 'arcgis_imagery_preset', label: 'ESRI影像', stack: ['theme_arcgis_imagery_root','terrain_gac','label_tianditu'] },
    { id: 'arcgis_canvas_dark_preset', label: 'ESRI深灰', stack: ['theme_arcgis_canvas_dark_base', 'theme_arcgis_canvas_dark_ref'] },
    { id: 'arcgis_canvas_light_preset', label: 'ESRI浅灰', stack: ['theme_arcgis_canvas_light_base', 'theme_arcgis_canvas_light_ref'] },
    { id: 'arcgis_street_preset', label: 'ESRI街道', stack: ['theme_arcgis_street_root'] },
    { id: 'arcgis_topo_preset', label: 'ESRI世界地形', stack: ['theme_arcgis_topo_root'] },
    { id: 'arcgis_natgeo_preset', label: '国家地理', stack: ['theme_arcgis_natgeo_world'] },
    { id: 'arcgis_physical_preset', label: '自然地理', stack: ['theme_arcgis_physical_root'] },

    // ==========================================
    // 5. 地形与专题系列 (Terrain & Themes)
    // ==========================================
    // --- 山体渲染 ---
    { id: 'arcgis_elev_hillshade_preset', label: '山体阴影', stack: ['terrain_arcgis_elev_hillshade', 'label_tianditu'] },
    { id: 'arcgis_elev_hillshade_dark_preset', label: '深色阴影', stack: ['terrain_arcgis_elev_hillshade_dark', 'label_tianditu'] },
    { id: 'terrain_google_preset', label: 'Google山体', stack: ['terrain_google'] },
    { id: 'terrain_opentopomap_preset', label: '开放地形', stack: ['terrain_opentopomap'] },
    { id: 'terrain_esa_preset', label: '欧空局地形', stack: ['terrain_esa'] },
    
    // --- 农田专题 (河南/广东) ---
    { id: 'hn_basic_farmland_preset', label: '河南基本农田', stack: ['imagery_tianditu', 'theme_hn_basic_farmland_wmts', 'label_tianditu'] },
    { id: 'hn_farmland_preset', label: '河南耕地', stack: ['imagery_tianditu', 'theme_hn_farmland_wmts', 'label_tianditu'] },
    { id: 'gd_basic_farmland_preset', label: '广东基本农田', stack: ['imagery_tianditu', 'theme_gd_basic_farmland_wms', 'label_tianditu'] },

    // --- Windy 气象系列 ---
    { id: 'ship66_preset', label: '船舶网', stack: ['ships66'] },
    { id: 'windy_preset', label: 'Windy户外', stack: ['theme_windy'] },
    { id: 'windy2_preset', label: 'Windy冬季', stack: ['theme_windy2'] },
    { id: 'windy_outer_preset', label: 'Windy轮廓', stack: ['theme_windy_outer'] },
    { id: 'windy_greenland_preset', label: 'Windy灰色', stack: ['theme_windy_greenland'] },

    // ==========================================
    // 6. 极地与海洋系列 (Polar & Ocean)
    // ==========================================
    { id: 'arcgis_ocean_preset', label: 'ESRI海洋', stack: ['theme_arcgis_ocean_base', 'theme_arcgis_ocean_ref'] },
    { id: 'arcgis_terrain_base_preset', label: '地形底色', stack: ['theme_arcgis_terrain_base', 'label_tianditu'] },
    { id: 'arcgis_polar_ant_preset', label: '南极影像', stack: ['imagery_arcgis_polar_ant_img'] },
    { id: 'arcgis_polar_arc_preset', label: '北极影像', stack: ['imagery_arcgis_polar_arc_img'] },
    { id: 'arcgis_polar_arc_base_preset', label: '北极地图', stack: ['theme_arcgis_polar_arc_base', 'label_arcgis_polar_arc_ref'] },

    // ==========================================
    // 7. Maps For Free (MFF) 浮雕系列
    // ==========================================
    { id: 'mff_relief_preset', label: '地形浮雕', stack: ['terrain_relief', 'label_tianditu'] },
    { id: 'mff_water_preset', label: 'MFF水体', stack: ['terrain_relief', 'theme_mff_water', 'label_tianditu'] },
    { id: 'mff_admin_preset', label: 'MFF边界', stack: ['terrain_relief', 'theme_mff_admin', 'label_tianditu'] },
    { id: 'mff_streets_preset', label: 'MFF街道', stack: ['terrain_relief', 'theme_mff_streets', 'label_tianditu'] },
    { id: 'mff_forest_preset', label: 'MFF森林', stack: ['terrain_relief', 'theme_mff_forest', 'label_tianditu'] },

    // ==========================================
    // 8. 其他与自定义
    // ==========================================
    { id: 'vector_geoq_gray_preset', label: 'GeoQ灰', stack: ['vector_geoq_gray'] },
    { id: 'vector_geoq_hydro_preset', label: 'GeoQ水', stack: ['vector_geoq_hydro'] },
];
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++







































const LAYER_SOURCE_MAP = new Map(LAYER_SOURCE_DEFINITIONS.map((item) => [item.id, item]));
const BASEMAP_PRESET_MAP = new Map(BASEMAP_PRESETS.map((item) => [item.id, item]));

function resolveDefaultBasemapLayerIndex(): number {
    const index = BASEMAP_PRESETS.findIndex((preset) => preset.id === DEFAULT_BASEMAP_PRESET_ID);
    return index >= 0 ? index : 0;
}

function resolveDefaultVisibleLayerIdSet(): Set<string> {
    const preset = BASEMAP_PRESET_MAP.get(String(DEFAULT_BASEMAP_PRESET_ID || ''));
    const stack = Array.isArray(preset?.stack) && preset.stack.length
        ? preset.stack
        : [String(DEFAULT_BASEMAP_PRESET_ID || '')];

    const visibleLayerIdSet = new Set<string>();
    stack.forEach((id) => {
        const normalized = String(id || '').trim();
        if (!normalized) return;
        if (!LAYER_SOURCE_MAP.has(normalized)) return;
        visibleLayerIdSet.add(normalized);
    });

    return visibleLayerIdSet;
}

/** 默认底图在 URL_LAYER_OPTIONS 中的索引。 */
export const DEFAULT_BASEMAP_LAYER_INDEX = resolveDefaultBasemapLayerIndex();

const DEFAULT_VISIBLE_LAYER_ID_SET = resolveDefaultVisibleLayerIdSet();

/** URL 图层选项列表：用于 URL 参数中的图层索引映射。 */
export const URL_LAYER_OPTIONS = BASEMAP_PRESETS.map((preset) => preset.id);

/** 预设底图选项列表（用于 UI 下拉菜单）。 */
export const BASEMAP_OPTIONS = BASEMAP_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label
}));

/** 获取一个 option 对应的真实图层堆叠（去重，保序）。 */
export function resolvePresetLayerIds(optionId: string): string[] {
    const preset = BASEMAP_PRESET_MAP.get(String(optionId || ''));
    const stack = Array.isArray(preset?.stack) && preset.stack.length
        ? preset.stack
        : [String(optionId || '')];

    const deduped: string[] = [];
    const seen = new Set<string>();

    stack.forEach((id) => {
        const normalized = String(id || '').trim();
        if (!normalized || seen.has(normalized)) return;
        if (!LAYER_SOURCE_MAP.has(normalized)) return;

        seen.add(normalized);
        deduped.push(normalized);
    });

    return deduped;
}

/** 获取 option 的展示名称。 */
export function getBasemapOptionLabel(optionId: string): string {
    const preset = BASEMAP_PRESET_MAP.get(String(optionId || ''));
    return preset?.label || String(optionId || '');
}

/** 获取图层分类（用于外部状态同步）。 */
export function getLayerCategory(layerId: string): LayerCategory {
    return LAYER_SOURCE_MAP.get(String(layerId || ''))?.category || 'theme';
}

/** 获取图层分组（用于外部状态同步）。 */
export function getLayerGroup(layerId: string): LayerGroup {
    return LAYER_SOURCE_MAP.get(String(layerId || ''))?.group || '专题';
}

/**
 * 创建底图配置列表（由本文件集中配置驱动）。
 */
export function createLayerConfigs(normBase: string = '/', tiandituTk: string = '', customUrl: string = '') {
    const context: LayerFactoryContext = {
        normBase,
        tiandituTk,
        customUrl
    };

    return LAYER_SOURCE_DEFINITIONS.map((definition) => ({
        id: definition.id,
        name: definition.name,
        category: definition.category,
        group: definition.group,
        visible: DEFAULT_VISIBLE_LAYER_ID_SET.size > 0
            ? DEFAULT_VISIBLE_LAYER_ID_SET.has(definition.id)
            : !!definition.defaultVisible,
        createSource: () => definition.createSource(context)
    }));
}

/** 导出主要管理功能 */
export function useBasemapManager() {
    return {
        activeGoogleTileHost,
        probeGoogleHostLatency,
        resolvePreferredGoogleHost,
        buildGoogleTileUrl,
        buildTiandituUrl,
        createLayerConfigs,
        resolvePresetLayerIds,
        getBasemapOptionLabel,
        getLayerCategory,
        getLayerGroup
    };
}
