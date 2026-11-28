/**
 * 非标准 XYZ 图源适配器表（V3.7.16 自 ol/basemap/constants/basemapCore.ts 移入）
 *
 * maps-for-free 使用非标准 URL 格式（z{z}/row{y}/{z}_{x}-{y}.gif），
 * 不能直接当 XYZ 模板用，由 createXYZSourceFromUrl 按 URL 模式匹配后
 * 改用 tileUrlFunction 生成。OL 引擎侧专属，定义层只存
 * nonStandardAdapter 字符串 ID，不持有此表。
 */

import { buildBingQuadKeyAdapter, buildMapsForFreeAdapter } from '@ol/tile-source';
import type { NonStandardXYZAdapter } from '@ol/tile-source';

export const NON_STANDARD_XYZ_ADAPTERS: Record<string, NonStandardXYZAdapter> = {
    // V3.7.16：Bing 使用 quadkey 而非 XYZ，由 xyzSource 的通用适配器编码
    'bing-aerial': buildBingQuadKeyAdapter('a', 'jpeg', 'Bing影像'),
    'bing-road': buildBingQuadKeyAdapter('r', 'png', 'Bing道路'),
    'bing-hybrid': buildBingQuadKeyAdapter('h', 'jpeg', 'Bing混合影像'),
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
    'maps-for-free-ice': buildMapsForFreeAdapter('ice', '冰川(MFF)'),
};
