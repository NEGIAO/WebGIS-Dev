/**
 * layerUtils.js
 * 图层管理模块的通用工具函数
 *
 * 功能：底图选项构建、地形配置、预设描述、XYZ URL 规范化、Primitive 销毁等共享工具。
 * 从 useCesiumLayers.js 拆分，保持单一职责。
 */

import { BASEMAP_OPTIONS, resolvePresetLayerIds } from '../../../../constants/basemap/basemapResolver';
import { getDescriptorById } from '../../../../constants/basemap/sourceDescriptors';

// --- 模块级常量 ---

export const TDT_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7'];
export const TDT_SERVICE_ROOT = 'https://t{s}.tianditu.gov.cn/';
export const ARCGIS_WORLD_TERRAIN_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
export const CESIUM_OSM_BUILDINGS_ASSET_ID = 96188;
export const CUSTOM_XYZ_BASEMAP_ID = 'custom-xyz';
export const CUSTOM_XYZ_BASEMAP_URL_KEY = 'webgis_custom_basemap_url';
export const TDT_LEGACY_LABEL_LAYER_VISIBLE_KEY = 'cesium_tdt_label_layer_visible';
export const TDT_BOUNDARY_LAYER_VISIBLE_KEY = 'cesium_tdt_boundary_layer_visible';
export const TDT_TEXT_LABEL_LAYER_VISIBLE_KEY = 'cesium_tdt_text_label_layer_visible';
export const CESIUM_OSM_BUILDINGS_VISIBLE_KEY = 'cesium_osm_buildings_visible';
export const GOOGLE_PHOTOREALISTIC_3D_TILES_VISIBLE_KEY = 'cesium_google_photorealistic_3d_tiles_visible';

// --- 底图选项构建 ---

/**
 * 将统一预设映射为 Cesium 兼容的选项列表
 * @returns {Array<{value: string, label: string, description: string, source: string}>}
 */
export function buildUnifiedBasemapOptions() {
    return BASEMAP_OPTIONS.map((opt) => ({
        ...opt,
        description: getPresetDescription(opt.value),
        source: 'preset',
    }));
}

/**
 * 获取预设的简要描述
 * @param {string} presetId - 预设 ID
 * @returns {string} 描述文本，如 "天地图影像 + 天地图标注"
 */
export function getPresetDescription(presetId) {
    const stack = resolvePresetLayerIds(presetId);
    if (!stack.length) return '复合底图';
    const names = stack.map((sid) => {
        const desc = getDescriptorById(sid);
        return desc ? desc.name : sid;
    });
    return names.slice(0, 3).join(' + ') + (names.length > 3 ? ' ...' : '');
}

/** 预构建的底图选项列表 */
export const unifiedBasemapOptions = buildUnifiedBasemapOptions();

// --- 地形选项 ---

export const terrainOptions = [
    { value: 'tianditu', label: '天地图地形', description: '天地图高程地形服务' },
    { value: 'cesiumWorld', label: 'Cesium世界地形', description: 'Cesium ion 全球地形服务' },
    { value: 'arcgisWorld', label: 'ArcGIS世界地形', description: 'ArcGIS World Elevation 3D 高程服务' },
    { value: 'ellipsoid', label: '平面地形', description: '无高程的椭球地形' },
];

// --- 地形 Picker 图标 ---

/**
 * 获取地形 Picker 图标颜色
 * @param {string} value - 地形类型值
 * @returns {string} CSS 颜色
 */
export function getTerrainIconColor(value) {
    if (value === 'ellipsoid') return '#a3a3a3';
    if (value === 'arcgisWorld') return '#5ea1ff';
    return '#d0a449';
}

/**
 * 获取地形 Picker 图标短文本
 * @param {string} value - 地形类型值
 * @returns {string} 2 字符缩写
 */
export function getTerrainIconText(value) {
    if (value === 'cesiumWorld') return 'CW';
    if (value === 'arcgisWorld') return 'AG';
    if (value === 'ellipsoid') return 'EL';
    return 'TE';
}

// --- 运行时工具 ---

/**
 * 统一读取运行时值（函数/ref/原始值）
 * @param {Function|Object|string} source - 值来源
 * @returns {string} 字符串值
 */
export function readRuntimeValue(source) {
    if (typeof source === 'function') {
        return String(source() || '').trim();
    }
    if (source && typeof source === 'object' && 'value' in source) {
        return String(source.value || '').trim();
    }
    return String(source || '').trim();
}

/**
 * 安全销毁 Cesium Primitive
 * @param {Object} primitive - Cesium primitive 对象
 */
export function destroyPrimitive(primitive) {
    if (!primitive || primitive.isDestroyed?.()) return;
    try {
        primitive.destroy?.();
    } catch (error) {
        console.warn('Primitive destroy warning:', error);
    }
}

// --- OSM Buildings ---

/**
 * 创建 Cesium OSM Buildings 3D Tileset
 * 优先使用 ion asset ID，兼容旧版 createOsmBuildingsAsync
 *
 * @param {Object} Cesium - Cesium 命名空间
 * @param {Object} [options={}] - Tileset 配置选项
 * @returns {Promise<Object>} Cesium3DTileset 实例
 */
export async function createCesiumOsmBuildingsTileset(Cesium, options = {}) {
    if (typeof Cesium?.Cesium3DTileset?.fromIonAssetId === 'function') {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
            CESIUM_OSM_BUILDINGS_ASSET_ID,
            options,
        );
        if (!tileset.style && typeof Cesium.Cesium3DTileStyle === 'function') {
            tileset.style = new Cesium.Cesium3DTileStyle({
                color: "Boolean(${feature['cesium#color']}) ? color(${feature['cesium#color']}) : color('white')",
            });
        }
        return tileset;
    }
    return Cesium.createOsmBuildingsAsync(options);
}

// --- 底图 Tooltip ---

/**
 * 获取底图选项的 tooltip 文本
 * @param {Object} option - 底图选项对象
 * @returns {string} tooltip 文本
 */
export function getBasemapTooltip(option) {
    if (option.value === CUSTOM_XYZ_BASEMAP_ID) {
        return `${option.description || option.label}\n支持 https://server/{z}/{x}/{y}.png`;
    }
    return option.description || option.label;
}

// --- 预设 Picker 图标 ---

/**
 * 获取预设 Picker 图标颜色（根据第一个图层源分类）
 * @param {string} presetId - 预设 ID
 * @returns {string} CSS 颜色
 */
export function getPresetPickerColor(presetId) {
    const stackIds = resolvePresetLayerIds(presetId);
    if (!stackIds.length) return '#37d67a';
    const firstDesc = getDescriptorById(stackIds[0]);
    if (!firstDesc) return '#37d67a';
    const cat = firstDesc.category;
    if (cat === 'imagery') return '#5ea1ff';
    if (cat === 'vector') return '#37d67a';
    if (cat === 'terrain') return '#d0a449';
    if (cat === 'label') return '#a78bfa';
    if (cat === 'theme') return '#f59e0b';
    if (cat === 'custom') return '#f472b6';
    return '#37d67a';
}

/**
 * 获取预设 Picker 图标短标签
 * @param {string} presetId - 预设 ID
 * @param {string} label - 原始标签
 * @returns {string} 2 字符短标签
 */
export function getPresetPickerLabel(presetId, label) {
    const safeLabel = String(label || '').replace(/[<>&"']/g, '');
    return safeLabel.slice(0, 2) || 'BM';
}

// --- XYZ URL 规范化 ---

/**
 * 规范化自定义 XYZ 瓦片 URL
 * 统一 {z}/{x}/{y}/{s} 占位符，展开子域名范围
 *
 * @param {string} rawUrl - 原始 URL 字符串
 * @returns {{valid: boolean, message: string, url: string, subdomains: string[]}}
 */
export function normalizeCustomXyzUrl(rawUrl) {
    const source = String(rawUrl || '').trim();
    if (!source) {
        return { valid: false, message: '自定义 XYZ URL 为空', url: '', subdomains: [] };
    }

    let url = source
        .replace(/\{z\}/gi, '{z}')
        .replace(/\{x\}/gi, '{x}')
        .replace(/\{y\}/gi, '{y}')
        .replace(/\{subdomains?\}/gi, '{s}')
        .replace(/\{switch:[^}]+\}/gi, '{s}')
        .replace(/\{s\}/gi, '{s}');

    const subdomainRange = url.match(/\{([a-z0-9])-([a-z0-9])\}/i);
    let subdomains = [];

    if (subdomainRange) {
        subdomains = expandSubdomainRange(subdomainRange[1], subdomainRange[2]);
        url = url.replace(subdomainRange[0], '{s}');
    } else if (/\{s\}/i.test(url)) {
        subdomains = ['a', 'b', 'c'];
    }

    if (!/\{z\}/.test(url) || !/\{x\}/.test(url) || !/\{y\}/.test(url)) {
        return { valid: false, message: 'URL 需要包含 {z}、{x}、{y} 占位符', url, subdomains };
    }

    if (!isValidCustomTileUrl(url)) {
        return { valid: false, message: 'URL 格式不合法', url, subdomains };
    }

    return { valid: true, message: '', url, subdomains };
}

/**
 * 展开子域名范围 {a-f} → ['a','b','c','d','e','f']
 * @param {string} start - 起始字符
 * @param {string} end - 结束字符
 * @returns {string[]} 子域名字符数组
 */
export function expandSubdomainRange(start, end) {
    const startCode = String(start || '').charCodeAt(0);
    const endCode = String(end || '').charCodeAt(0);
    if (!Number.isFinite(startCode) || !Number.isFinite(endCode)) return [];

    const step = startCode <= endCode ? 1 : -1;
    const values = [];
    for (let code = startCode; step > 0 ? code <= endCode : code >= endCode; code += step) {
        values.push(String.fromCharCode(code));
    }
    return values;
}

/**
 * 验证自定义瓦片 URL 合法性
 * @param {string} url - URL 字符串
 * @returns {boolean} 是否合法
 */
export function isValidCustomTileUrl(url) {
    if (/^(https?:)?\/\//i.test(url) || url.startsWith('/')) return true;

    try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const parsed = new URL(url, baseUrl);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// --- 底图 ID 生成 ---

/**
 * 根据标签和索引生成官方底图 ID
 * @param {string} label - 底图标签
 * @param {number} index - 索引
 * @returns {string} slugified ID
 */
export function createOfficialBasemapId(label, index) {
    const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `official_${index}_${slug || 'basemap'}`;
}

// --- Picker 图标 SVG ---

/**
 * 创建 Picker 图标 SVG data URI
 * @param {string} color - 圆形颜色
 * @param {string} shortLabel - 短标签（最多 2 字符）
 * @returns {string} data:image/svg+xml URI
 */
export function createPickerIcon(color, shortLabel) {
    const safeLabel = String(shortLabel || '').replace(/[<>&"']/g, '').slice(0, 2);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="10" fill="#0f2432"/>
            <circle cx="32" cy="30" r="18" fill="${color}" opacity="0.9"/>
            <text x="32" y="53" text-anchor="middle" fill="#ffffff" font-size="10" font-family="Arial">${safeLabel}</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}