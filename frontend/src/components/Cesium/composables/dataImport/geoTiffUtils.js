/**
 * geoTiffUtils.js
 * GeoTIFF 解析、投影、色带渲染等纯工具函数
 *
 * 从 useCesiumDataImport.js 中提取的顶层辅助函数，不依赖 Vue 或 Cesium 实例。
 */

// ── 懒加载缓存 ──────────────────────────────────────────
let proj4Cache = null;
let geotiffCache = null;

/**
 * 懒加载 geotiff.js 解析库
 * @returns {Promise<{ fromArrayBuffer: Function }>}
 */
export async function ensureGeoTIFF() {
    if (geotiffCache) return geotiffCache;
    const GeoTIFF = await import('geotiff');
    geotiffCache = { fromArrayBuffer: GeoTIFF.fromArrayBuffer };
    return geotiffCache;
}

/**
 * 从 GeoTIFF 的 model tiepoint + pixel scale 计算地理包围盒（度）
 *
 * 使用 geotiff.js 自带的 getOrigin/getResolution 同步 API，
 * 它们内部正确地处理了 ModelTiepoint、ModelPixelScale 和 ModelTransformation，
 * 以及 Y 分辨率的正负符号。
 *
 * @param {import('geotiff').GeoTIFFImage} image
 * @returns {{ west: number, south: number, east: number, north: number }}
 * @throws {Error} GeoTIFF 缺少地理参考信息
 */
export function extractGeoTiffBbox(image) {
    // getOrigin()/getResolution() 抛出 Error 表示无地理参考
    const origin = image.getOrigin();           // [x, y, z] 左上角模型坐标
    const resolution = image.getResolution();   // [resX, resY, resZ]（resY 已取反处理）
    const w = image.getWidth();
    const h = image.getHeight();

    const xMin = origin[0];
    const xMax = origin[0] + w * resolution[0];
    const yMin = origin[1];
    const yMax = origin[1] + h * resolution[1];

    return {
        west: Math.min(xMin, xMax),
        east: Math.max(xMin, xMax),
        south: Math.min(yMin, yMax),
        north: Math.max(yMin, yMax),
    };
}

/**
 * 判断包围盒数值是否为地理坐标（度）
 * @param {{ west:number, south:number, east:number, north:number }} bbox
 * @returns {boolean}
 */
export function isGeographicBbox(bbox) {
    return (
        bbox.west >= -180 && bbox.east <= 180 &&
        bbox.south >= -90 && bbox.north <= 90 &&
        bbox.west < bbox.east && bbox.south < bbox.north
    );
}

/**
 * 经典高程色带颜色停点（从低到高）
 * 每项：{ pos: 0-1, r, g, b }
 */
export const ELEVATION_RAMP = [
    { pos: 0.00, r: 0x1a, g: 0x52, b: 0x2e }, // 深绿
    { pos: 0.12, r: 0x4b, g: 0x9e, b: 0x3e }, // 绿
    { pos: 0.25, r: 0x7f, g: 0xbc, b: 0x40 }, // 亮绿
    { pos: 0.35, r: 0xa8, g: 0xc8, b: 0x4b }, // 黄绿
    { pos: 0.45, r: 0xd4, g: 0xc8, b: 0x4a }, // 黄
    { pos: 0.55, r: 0xd4, g: 0x9c, b: 0x3a }, // 橙
    { pos: 0.65, r: 0xc2, g: 0x7a, b: 0x38 }, // 浅棕
    { pos: 0.75, r: 0x9c, g: 0x5c, b: 0x2e }, // 棕
    { pos: 0.84, r: 0x8c, g: 0x68, b: 0x54 }, // 粉棕
    { pos: 0.92, r: 0xc8, g: 0xbe, b: 0xb4 }, // 浅灰
    { pos: 1.00, r: 0xfa, g: 0xf5, b: 0xef }, // 近白
];

/**
 * 在色带中查找 t 对应的 RGBA 颜色（线性插值）
 * @param {number} t - 归一化值 [0, 1]
 * @param {{ r:number, g:number, b:number }} out - 输出对象
 */
export function rampLookup(t, out) {
    // 钳位
    if (t <= 0) { out.r = ELEVATION_RAMP[0].r; out.g = ELEVATION_RAMP[0].g; out.b = ELEVATION_RAMP[0].b; return; }
    if (t >= 1) { out.r = ELEVATION_RAMP[ELEVATION_RAMP.length - 1].r; out.g = ELEVATION_RAMP[ELEVATION_RAMP.length - 1].g; out.b = ELEVATION_RAMP[ELEVATION_RAMP.length - 1].b; return; }

    // 二分查找所在区间
    let lo = 0;
    let hi = ELEVATION_RAMP.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (t < ELEVATION_RAMP[mid].pos) hi = mid;
        else lo = mid;
    }

    const a = ELEVATION_RAMP[lo];
    const b = ELEVATION_RAMP[hi];
    const f = (t - a.pos) / (b.pos - a.pos);
    out.r = Math.round(a.r + (b.r - a.r) * f);
    out.g = Math.round(a.g + (b.g - a.g) * f);
    out.b = Math.round(a.b + (b.b - a.b) * f);
}

/**
 * 将单波段 TypedArray 渲染为 RGBA ImageData（经典高程色带）
 * 自动拉伸栅格值到 [0, 1] 后映射到色带
 *
 * @param {TypedArray} raster - 原始栅格数据
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imageData
 * @param {{ min?: number, max?: number }} [range] - 可选的显式拉伸范围
 */
export function renderSingleBandToImageData(raster, width, height, imageData, range) {
    let min = range?.min ?? Infinity;
    let max = range?.max ?? -Infinity;
    const len = Math.min(raster.length, width * height);

    // 未指定范围时自动计算
    if (range?.min === undefined) {
        for (let i = 0; i < len; i++) {
            const v = raster[i];
            if (Number.isFinite(v)) {
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
    }

    const rangeVal = max - min || 1;
    const color = { r: 0, g: 0, b: 0 };

    for (let i = 0; i < len; i++) {
        const t = (raster[i] - min) / rangeVal;
        rampLookup(t, color);
        const idx = i * 4;
        imageData.data[idx] = color.r;
        imageData.data[idx + 1] = color.g;
        imageData.data[idx + 2] = color.b;
        imageData.data[idx + 3] = 255;
    }
}

/**
 * 将 RGB 交错数组渲染为 RGBA ImageData
 * @param {Uint8Array} rgbData - readRGB() 返回的交错 Uint8Array
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imageData
 */
export function renderRGBToImageData(rgbData, width, height, imageData) {
    const len = Math.min(Math.floor(rgbData.length / 3), width * height);
    for (let i = 0; i < len; i++) {
        const idx = i * 4;
        const srcIdx = i * 3;
        imageData.data[idx] = rgbData[srcIdx];
        imageData.data[idx + 1] = rgbData[srcIdx + 1];
        imageData.data[idx + 2] = rgbData[srcIdx + 2];
        imageData.data[idx + 3] = 255;
    }
}

/**
 * 懒加载 proj4 重投影库
 * @returns {Promise<Function>} proj4 函数
 */
export async function ensureProj4() {
    if (proj4Cache) return proj4Cache;
    const proj4 = await import('proj4');
    // 注册 3857 → 4326 转换（proj4 内置支持）
    proj4Cache = proj4.default;
    return proj4Cache;
}

/** 3857 坐标范围（Web Mercator 有效范围） */
export const MERCATOR_BOUNDS = {
    min: -20037508.34,
    max: 20037508.34,
};

/**
 * 判断包围盒数值是否为 Web Mercator（3857）范围
 * @param {{ west:number, south:number, east:number, north:number }} bbox
 * @returns {boolean}
 */
export function isMercatorBbox(bbox) {
    const { min, max } = MERCATOR_BOUNDS;
    return (
        bbox.west >= min && bbox.east <= max &&
        bbox.south >= min && bbox.north <= max &&
        bbox.west < bbox.east && bbox.south < bbox.north
    );
}

/**
 * 检测 GeoTIFF 的 CRS，返回 CRS 标识或 null
 * @param {import('geotiff').GeoTIFFImage} image
 * @param {{ west:number, south:number, east:number, north:number }} bbox
 * @returns {'4326'|'3857'|null}
 */
export function detectCRS(image, bbox) {
    const geoKeys = image.getGeoKeys();
    if (geoKeys) {
        // ProjectedCSTypeGeoKey 优先检查：3857/900913 = Web Mercator
        // 注意：3857 影像常同时设置 ProjectedCSTypeGeoKey=3857 和 GeographicTypeGeoKey=4326，
        // 因此必须优先检查投影坐标系类型，避免被误判为地理坐标系。
        if (geoKeys.ProjectedCSTypeGeoKey === 3857 || geoKeys.ProjectedCSTypeGeoKey === 900913) return '3857';
        // GeographicTypeGeoKey: 4326 = WGS84（仅当非投影坐标系时）
        if (geoKeys.GeographicTypeGeoKey === 4326) return '4326';
    }
    // 无 GeoKeys 时从数值范围推测
    if (isGeographicBbox(bbox)) return '4326';
    if (isMercatorBbox(bbox)) return '3857';
    return null;
}

/**
 * 将 3857（Web Mercator）包围盒投影到 4326（WGS84）
 * @param {{ west:number, south:number, east:number, north:number }} bbox3857
 * @returns {Promise<{ west:number, south:number, east:number, north:number }>}
 */
export async function transformMercatorTo4326(bbox3857) {
    const proj4 = await ensureProj4();
    const sw = proj4('EPSG:3857', 'EPSG:4326', [bbox3857.west, bbox3857.south]);
    const ne = proj4('EPSG:3857', 'EPSG:4326', [bbox3857.east, bbox3857.north]);
    return {
        west: sw[0],
        south: sw[1],
        east: ne[0],
        north: ne[1],
    };
}