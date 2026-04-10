/**
 * 底图管理常量配置
 * 本文件仅维护图层 URL、分组、组合栈与轻量映射。
 * 协议识别与建源逻辑请见 src/composables/useTileSourceFactory.ts
 */

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
export type LayerCategory = 'base' | 'label';
export type LayerGroup = '影像' | '矢量' | '专题' | '注记' | 'Canvas' | '地形' | '海洋' | '参考' | '专题'| '极地' | '世界' | '其他'| 'ArcGIS Online'| 'Root' | 'Navigation' | 'Elevation' | 'Ocean' | 'Polar' | 'Reference' | 'Specialty'| 'World';

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
    // 注记图层
    {
        id: 'label',
        name: '天地图注记',
        category: 'label',
        group: '注记',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'label_vector',
        name: '天地图矢量注记',
        category: 'label',
        group: '注记',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/cva_w/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=cva&STYLE=default&FORMAT=tiles&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },

    // 主图层
    {
        id: 'local',
        name: '自定义瓦片',
        category: 'base',
        group: '专题',
        createSource: ({ normBase }) => new XYZ({ url: `${normBase}tiles/{z}/{x}/{y}.png` })
    },
    {
        id: 'custom',
        name: '自定义URL',
        category: 'base',
        group: '专题',
        createSource: ({ customUrl }) => customUrl
            ? createXYZSourceFromUrl(customUrl, { adapters: NON_STANDARD_XYZ_ADAPTERS })
            : null
    },
    
    // ========== 配置1：用户自定义 WMS/WMTS/XYZ 图层==========
    // 在此直接添加新的WMS、WMTS、XYZ服务，然后在配置2（BASEMAP_PRESETS）中添加堆叠预设
    
    // 广东基本农田 (WMS)
    {
        id: 'gd_basic_farmland_wms',
        name: '广东基本农田(WMS)',
        category: 'base',
        group: '专题',
        createSource: () => createConfiguredServiceSource({
            id: 'gd_basic_farmland_wms',
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
        id: 'hn_basic_farmland_wmts',
        name: '河南基本农田(WMTS)',
        category: 'base',
        group: '专题',
        createSource: () => createConfiguredServiceSource({
            id: 'hn_basic_farmland_wmts',
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
        id: 'hn_farmland_wms',
        name: '河南耕地(WMTS)',
        category: 'base',
        group: '专题',
        createSource: () => createConfiguredServiceSource({
            id: 'hn_farmland_wms',
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
    
    {
        id: 'Google_clean',
        name: 'Google简洁(原版)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off'
        })
    },
    {
        id: 'tianDiTu_vec',
        name: '天地图矢量',
        category: 'base',
        group: '矢量',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'tianDiTu',
        name: '天地图影像',
        category: 'base',
        group: '影像',
        createSource: ({ tiandituTk }) => new XYZ({
            url: buildTiandituUrl('/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', tiandituTk)
        })
    },
    {
        id: 'google',
        name: 'Google(gac)',
        category: 'base',
        group: '影像',
        defaultVisible: true,
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=s&x={x}&y={y}&z={z}'), maxZoom: 20 })
    },
    {
        id: 'google_standard',
        name: 'Google标准',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: buildGoogleTileUrl('/maps/vt?lyrs=m&x={x}&y={y}&z={z}') })
    },
    {
        id: 'google_clean',
        name: 'Google简洁',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: buildGoogleTileUrl('/maps/vt?lyrs=m&x={x}&y={y}&z={z}&s=Ga&apistyle=s.e:l|p.v:off,s.t:1|s.e.g|p.v:off,s.t:3|s.e.g|p.v:off')
        })
    },
    {
        id: 'osm',
        name: 'OSM(需梯子)',
        category: 'base',
        group: '矢量',
        createSource: () => new OSM()
    },
    {
        id: 'yandex_sat',
        name: 'Yandex卫星',
        category: 'base',
        group: '影像',
        createSource: () => new XYZ({ url: 'https://sat02.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}' })
    },
    {
        id: 'geoq_gray',
        name: 'GeoQ灰(GCJ)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldGrayMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldGrayMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png'
        })
    },
    {
        id: 'geoq_hydro',
        name: 'GeoQ水(GCJ)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://thematic.geoq.cn/arcgis/rest/services/ThematicMaps/WorldHydroMap/MapServer/WMTS/tile/1.0.0/ThematicMaps_WorldHydroMap/default/GoogleMapsCompatible/{z}/{y}/{x}.png'
        })
    },
    {
        id: 'amap',
        name: '高德地图(GCJ)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
        })
    },
    {
        id: 'amap_image',
        name: '高德影像(GCJ)',
        category: 'base',
        group: '影像',
        createSource: () => new XYZ({ url: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}' })
    },
    {
        id: 'tengxun',
        name: '腾讯地图(GCJ)',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({
            url: 'https://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0'
        })
    },
    // ===============================================================================================================================================
    // Arcgis Online 服务25个
    // --- Canvas 分类 ---

    // --- Canvas 分类 ---
    {
        id: 'arcgis_canvas_dark_base',
        name: 'ArcGIS深灰色底图',
        category: 'base',
        group: 'Canvas',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_canvas_dark_ref',
        name: 'ArcGIS深灰色参考注记',
        category: 'base',
        group: 'Canvas',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_canvas_light_base',
        name: 'ArcGIS浅灰色底图',
        category: 'base',
        group: 'Canvas',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_canvas_light_ref',
        name: 'ArcGIS浅灰色参考注记',
        category: 'base',
        group: 'Canvas',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Elevation 分类 ---
    {
        id: 'arcgis_elev_hillshade',
        name: 'ArcGIS世界山体阴影',
        category: 'base',
        group: 'Elevation',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_elev_hillshade_dark',
        name: 'ArcGIS深色山体阴影',
        category: 'base',
        group: 'Elevation',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Ocean 分类 ---
    {
        id: 'arcgis_ocean_base',
        name: 'ArcGIS海洋底图',
        category: 'base',
        group: 'Ocean',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_ocean_ref',
        name: 'ArcGIS海洋参考注记',
        category: 'base',
        group: 'Ocean',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Polar 分类 (极地) ---
    {
        id: 'arcgis_polar_ant_img',
        name: 'ArcGIS南极影像',
        category: 'base',
        group: 'Polar',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Antarctic_Imagery/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_polar_arc_img',
        name: 'ArcGIS北极影像',
        category: 'base',
        group: 'Polar',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Imagery/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_polar_arc_base',
        name: 'ArcGIS北极底图',
        category: 'base',
        group: 'Polar',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_polar_arc_ref',
        name: 'ArcGIS北极参考注记',
        category: 'base',
        group: 'Polar',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Arctic_Ocean_Reference/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Reference 分类 ---
    {
        id: 'arcgis_ref_boundaries',
        name: 'ArcGIS世界边界地名',
        category: 'base',
        group: 'Reference',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_ref_boundaries_alt',
        name: 'ArcGIS世界边界地名(备选)',
        category: 'base',
        group: 'Reference',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places_Alternate/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_ref_overlay',
        name: 'ArcGIS世界参考叠加层',
        category: 'base',
        group: 'Reference',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_ref_transport',
        name: 'ArcGIS世界交通',
        category: 'base',
        group: 'Reference',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Specialty 分类 ---
    {
        id: 'arcgis_spec_nav',
        name: 'ArcGIS世界航海图',
        category: 'base',
        group: 'Specialty',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/Specialty/World_Navigation_Charts/MapServer/tile/{z}/{y}/{x}' })
    },

    // --- Root 根目录 ---
    {
        id: 'arcgis_natgeo_world',
        name: '国家地理世界地图',
        category: 'base',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_usa_topo',
        name: 'USA地形图',
        category: 'base',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_imagery_root',
        name: '世界影像图',
        category: 'base',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_physical_root',
        name: '世界自然地理图',
        category: 'base',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_shaded_relief',
        name: '世界地形渲染图',
        category: 'base',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_street_root',
        name: '世界街道图',
        category: 'base',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_terrain_base',
        name: '世界地形底图',
        category: 'base',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}' })
    },
    {
        id: 'arcgis_topo_root',
        name: '世界地形图',
        category: 'base',
        group: 'World',
        createSource: () => new XYZ({ url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}' })
    },



    // ===============================================================================================================================================
    {
        id: 'topo',
        name: '地形图',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' })
    },
    {
        id: 'opentopomap',
        name: 'OpenTopoMap',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' })
    },
    {
        id: 'esa_topo',
        name: '欧空局地形',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png' })
    },
    {
        id: 'windy',
        name: 'windy',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}/?lang=en' })
    },
    {
        id: 'windy2',
        name: 'windy2',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/v1/maptiles/winter/256/{z}/{x}/{y}/?lang=en' })
    },
    {
        id: 'windy_outer',
        name: 'windy轮廓',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/darkmap-retina/{z}/{x}/{y}.png' })
    },
    {
        id: 'windy_greenland',
        name: 'windy Gray',
        category: 'base',
        group: '专题',
        createSource: () => new XYZ({ url: 'https://tiles.windy.com/tiles/v10.0/grayland/{z}/{x}/{y}.png' })
    },
    {
        id: 'carton_light',
        name: 'CartoDB',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' })
    },
    {
        id: 'carton_dark',
        name: 'CartoDB Dark',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' })
    },
    {
        id: 'wikepedia',
        name: 'Wikipedia',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png' })
    },
    {
        id: 'toner',
        name: 'Stamen Toner',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png' })
    },
    {
        id: 'alidade',
        name: 'Alidade Sm',
        category: 'base',
        group: '矢量',
        createSource: () => new XYZ({ url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png' })
    },

    // MFF 专题层（直接inline URL，禁止使用函数生成）
    {
        id: 'mff_water',
        name: 'MFF水体',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/water/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_admin',
        name: 'MFF行政边界',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/admin/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_streets',
        name: 'MFF街道',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/streets/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_country',
        name: 'MFF国家边界',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/country/z{z}/row{y}/{z}_{x}-{y}.png', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_crop',
        name: 'MFF作物',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/crop/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_grass',
        name: 'MFF草地',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/grass/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_forest',
        name: 'MFF森林',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/forest/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_tundra',
        name: 'MFF冻土',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/tundra/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_sand',
        name: 'MFF沙地',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/sand/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_swamp',
        name: 'MFF沼泽',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/swamp/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'mff_ice',
        name: 'MFF冰川',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/ice/z{z}/row{y}/{z}_{x}-{y}.gif', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'relief',
        name: '地形浮雕(MFF)',
        category: 'base',
        group: '专题',
        createSource: () => createXYZSourceFromUrl('https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg', { adapters: NON_STANDARD_XYZ_ADAPTERS })
    },
    {
        id: 'Google',
        name: 'Google原版',
        category: 'base',
        group: '影像',
        createSource: () => new XYZ({ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 })
    }
];


// 配置2：多底图叠置预设（下拉菜单显示用）
const BASEMAP_PRESETS: BasemapPresetDefinition[] = [
    { id: 'local', label: '自定义瓦片', stack: ['local'] },
    { id: 'tianDiTu_vec', label: '天地图矢量', stack: ['tianDiTu_vec', 'label_vector'] },
    { id: 'tianDiTu', label: '天地图影像', stack: ['tianDiTu', 'label'] },
    { id: 'google', label: 'Google(gac)', stack: ['google', 'label'] },

    // 用户自定义预设（直接在此添加新预设）
    { id: 'hn_basic_farmland_wmts', label: '河南基本农田', stack: ['tianDiTu', 'hn_basic_farmland_wmts', 'label'] },
    { id: 'gd_basic_farmland_wms', label: '广东基本农田', stack: ['tianDiTu', 'gd_basic_farmland_wms', 'label'] },
    { id: 'hn_farmland_wms', label: '河南耕地', stack: ['tianDiTu', 'hn_farmland_wms', 'label'] },

    { id: 'Google', label: 'Google原版', stack: ['Google', 'label'] },
    { id: 'google_standard', label: 'Google标准', stack: ['google_standard'] },
    { id: 'google_clean', label: 'Google简洁', stack: ['google_clean'] },
    { id: 'Google_clean', label: 'Google简洁(原版)', stack: ['Google_clean'] },
    { id: 'osm', label: 'OSM(需梯子)', stack: ['osm'] },
    { id: 'amap', label: '高德地图(GCJ)', stack: ['amap'] },
    { id: 'amap_image', label: '高德影像(GCJ)', stack: ['amap_image'] },

    // ArcGIS Online 系列 25个
    { id: 'arcgis_canvas_dark', label: 'ArcGIS Canvas 深灰', stack: ['arcgis_canvas_dark_base', 'arcgis_canvas_dark_ref'] },
    { id: 'arcgis_canvas_light', label: 'ArcGIS Canvas 浅灰', stack: ['arcgis_canvas_light_base', 'arcgis_canvas_light_ref'] },
    { id: 'arcgis_elev_hillshade', label: 'ArcGIS Hillshade', stack: ['arcgis_elev_hillshade', 'label'] },
    { id: 'arcgis_elev_hillshade_dark', label: 'ArcGIS Hillshade Dark', stack: ['arcgis_elev_hillshade_dark', 'label'] },
    { id: 'arcgis_ocean', label: 'ArcGIS Ocean', stack: ['arcgis_ocean_base', 'arcgis_ocean_ref'] },
    { id: 'arcgis_polar_ant_img', label: 'ArcGIS 南极影像', stack: ['arcgis_polar_ant_img'] },
    { id: 'arcgis_polar_arc_img', label: 'ArcGIS 北极影像', stack: ['arcgis_polar_arc_img'] },
    { id: 'arcgis_polar_arc', label: 'ArcGIS 北极', stack: ['arcgis_polar_arc_base', 'arcgis_polar_arc_ref'] },
    { id: 'arcgis_ref_boundaries', label: 'ArcGIS 世界边界地名', stack: ['arcgis_ref_boundaries'] },
    { id: 'arcgis_ref_boundaries_alt', label: 'ArcGIS 世界边界地名(备选)', stack: ['arcgis_ref_boundaries_alt'] },
    { id: 'arcgis_ref_overlay', label: 'ArcGIS 世界参考叠加层', stack: ['arcgis_ref_overlay'] },
    { id: 'arcgis_ref_transport', label: 'ArcGIS 世界交通', stack: ['arcgis_ref_transport', 'label'] },
    { id: 'arcgis_spec_nav', label: 'ArcGIS 世界航海图', stack: ['arcgis_spec_nav'] },
    { id: 'arcgis_natgeo_world', label: '国家地理世界地图', stack: ['arcgis_natgeo_world'] },
    { id: 'arcgis_usa_topo', label: 'USA地形图', stack: ['arcgis_usa_topo', 'label'] },
    { id: 'arcgis_imagery_root', label: '世界影像图', stack: ['arcgis_imagery_root','label'] },
    { id: 'arcgis_physical_root', label: '世界自然地理图', stack: ['arcgis_physical_root', 'label'] },
    { id: 'arcgis_shaded_relief', label: '世界地形渲染图', stack: ['arcgis_shaded_relief', 'label'] },
    { id: 'arcgis_street_root', label: '世界街道图', stack: ['arcgis_street_root'] },
    { id: 'arcgis_terrain_base', label: '漂亮海洋', stack: ['arcgis_terrain_base', 'label'] },
    { id: 'arcgis_topo_root', label: '世界地形图', stack: ['arcgis_topo_root'] },
    { id: 'arcgis_canvas_dark', label: 'ArcGIS Canvas 深灰', stack: ['arcgis_canvas_dark_base', 'arcgis_canvas_dark_ref'] },
    { id: 'arcgis_canvas_light', label: 'ArcGIS Canvas 浅灰', stack: ['arcgis_canvas_light_base', 'arcgis_canvas_light_ref'] },
    { id: 'arcgis_elev_hillshade', label: 'ArcGIS Hillshade', stack: ['arcgis_elev_hillshade'] },
    { id: 'arcgis_elev_hillshade_dark', label: 'ArcGIS Hillshade Dark', stack: ['arcgis_elev_hillshade_dark'] },
    { id: 'arcgis_ocean', label: 'ArcGIS Ocean', stack: ['arcgis_ocean_base', 'arcgis_ocean_ref'] },




    { id: 'relief', label: '地形浮雕(MFF)', stack: ['relief', 'label'] },
    { id: 'mff_water', label: 'MFF水体', stack: ['relief', 'mff_water', 'label'] },
    { id: 'mff_admin', label: 'MFF行政边界', stack: ['relief', 'mff_admin', 'label'] },
    { id: 'mff_streets', label: 'MFF街道', stack: ['relief', 'mff_streets', 'label'] },
    { id: 'mff_country', label: 'MFF国家边界', stack: ['relief', 'mff_country', 'label'] },
    { id: 'mff_crop', label: 'MFF作物', stack: ['relief', 'mff_crop', 'label'] },
    { id: 'mff_grass', label: 'MFF草地', stack: ['relief', 'mff_grass', 'label'] },
    { id: 'mff_forest', label: 'MFF森林', stack: ['relief', 'mff_forest', 'label'] },
    { id: 'mff_tundra', label: 'MFF冻土', stack: ['relief', 'mff_tundra', 'label'] },
    { id: 'mff_sand', label: 'MFF沙地', stack: ['relief', 'mff_sand', 'label'] },
    { id: 'mff_swamp', label: 'MFF沼泽', stack: ['relief', 'mff_swamp', 'label'] },
    { id: 'mff_ice', label: 'MFF冰川', stack: ['relief', 'mff_ice', 'label'] },
    { id: 'yandex_sat', label: 'Yandex卫星', stack: ['yandex_sat'] },
    { id: 'geoq_gray', label: 'GeoQ灰(GCJ)', stack: ['geoq_gray'] },
    { id: 'geoq_hydro', label: 'GeoQ水(GCJ)', stack: ['geoq_hydro'] },
    { id: 'tengxun', label: '腾讯地图(GCJ)', stack: ['tengxun'] },
    { id: 'topo', label: '地形图', stack: ['topo'] },
    { id: 'opentopomap', label: 'OpenTopoMap', stack: ['opentopomap'] },
    { id: 'esa_topo', label: '欧空局地形', stack: ['esa_topo'] },
    { id: 'windy', label: 'windy', stack: ['windy'] },
    { id: 'windy2', label: 'windy2', stack: ['windy2'] },
    { id: 'windy_outer', label: 'windy轮廓', stack: ['windy_outer'] },
    { id: 'windy_greenland', label: 'windy Gray', stack: ['windy_greenland'] },
    { id: 'carton_light', label: 'CartoDB', stack: ['carton_light'] },
    { id: 'carton_dark', label: 'CartoDB Dark', stack: ['carton_dark'] },
    { id: 'wikepedia', label: 'Wikipedia', stack: ['wikepedia'] },
    { id: 'toner', label: 'Stamen Toner', stack: ['toner'] },
    { id: 'alidade', label: 'Alidade Sm', stack: ['alidade'] },
    { id: 'custom', label: '自定义URL', stack: ['custom'] }
];


// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++







































const LAYER_SOURCE_MAP = new Map(LAYER_SOURCE_DEFINITIONS.map((item) => [item.id, item]));
const BASEMAP_PRESET_MAP = new Map(BASEMAP_PRESETS.map((item) => [item.id, item]));

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
    return LAYER_SOURCE_MAP.get(String(layerId || ''))?.category || 'base';
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
        visible: !!definition.defaultVisible,
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
