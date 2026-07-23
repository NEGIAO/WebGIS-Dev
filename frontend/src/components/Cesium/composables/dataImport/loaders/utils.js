/**
 * utils.js
 * 数据导入共享工具函数
 *
 * 提供文件扩展名提取、相机定位、Blob URL 管理、GIS 解析器懒加载等通用能力。
 */

/**
 * 统一的地形高度采样 —— 异步版
 *
 * 检测是否开启了真实地形（非 EllipsoidTerrainProvider），
 * 使用 Cesium.sampleTerrainMostDetailed 主动触发瓦片加载并等待高精度高度。
 *
 * @param {Object} ctx
 * @param {number} ctx.lng - 经度（度）
 * @param {number} ctx.lat - 纬度（度）
 * @param {Cesium.Viewer} ctx.viewer
 * @param {Cesium} ctx.Cesium
 * @param {number} [ctx.timeout=8000] - 超时毫秒，超时后返回 null
 * @returns {Promise<number|null>} 地形高度（米），无地形数据时返回 null
 */
export async function sampleTerrainHeight({ lng, lat, viewer, Cesium, timeout = 8000 }) {
    if (!viewer?.terrainProvider) return null;
    if (viewer.terrainProvider.constructor === Cesium.EllipsoidTerrainProvider) return null;

    const carto = Cesium.Cartographic.fromDegrees(lng, lat);

    try {
        const results = await Promise.race([
            Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT')), timeout)
            ),
        ]);
        if (results && results.length > 0 && results[0].height !== undefined) {
            return results[0].height;
        }
    } catch (e) {
        if (e.message !== 'TIMEOUT') {
            console.warn('[Terrain] 高度采样失败:', e.message || e);
        }
    }
    return null;
}

/**
 * 将数据抬升到地形表面上方（统一入口）
 *
 * 采样目标位置的地形高度，如果数据当前高度低于地形，返回需要抬升的偏移量（米）。
 * 返回 null 表示无需调整或无法采样。
 *
 * @param {Object} ctx
 * @param {number} ctx.lng
 * @param {number} ctx.lat
 * @param {number} ctx.currentHeight - 数据当前海拔（米）
 * @param {Cesium.Viewer} ctx.viewer
 * @param {Cesium} ctx.Cesium
 * @param {number} [ctx.margin=10] - 抬升余量
 * @returns {Promise<number|null>} 需要抬升的米数，null 表示无需调整
 */
export async function calcTerrainOffset({ lng, lat, currentHeight, viewer, Cesium, margin = 10 }) {
    const terrainH = await sampleTerrainHeight({ lng, lat, viewer, Cesium });
    if (terrainH === null || terrainH === undefined) return null;

    const diff = terrainH - currentHeight;
    if (diff <= 0) return null; // 已经在或高于地形

    const offset = diff + margin;
    console.warn(
        `[Terrain] 贴地调整: 地形 ${terrainH.toFixed(1)}m, ` +
        `数据 ${currentHeight.toFixed(1)}m, 抬升 ${offset.toFixed(1)}m`
    );
    return offset;
}

/**
 * 获取文件扩展名（小写）
 * @param {string} filename - 文件名
 * @returns {string} 小写扩展名（不含点）
 */
export function getExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? '' : filename.slice(lastDot + 1).toLowerCase();
}

/**
 * 从 DataSource 或 Tileset 中计算相机定位目标
 * @param {Cesium.Viewer} viewer - Cesium 场景
 * @param {Cesium} Cesium - Cesium 命名空间
 * @param {Cesium.DataSource|Cesium.Cesium3DTileset} entity - 加载后的数据源
 * @param {string} format - 数据格式
 */
export function flyToEntity(viewer, Cesium, entity, format) {
    if (!viewer || !Cesium || !entity) return;

    try {
        if (format === '3dtiles' && entity.boundingSphere) {
            viewer.flyTo(entity, {
                duration: 2,
                offset: new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(0),
                    Cesium.Math.toRadians(-30),
                    entity.boundingSphere.radius * 2.0,
                ),
            });
        } else if (format === 'tif') {
            const rect = entity.imageryProvider?.rectangle;
            if (rect) {
                viewer.camera.flyTo({ destination: rect, duration: 2 });
            }
        } else if (entity.entities && entity.entities.values.length > 0) {
            viewer.flyTo(entity, { duration: 2 });
        }
    } catch (e) {
        console.warn('[CesiumDataImport] flyTo 定位失败:', e);
    }
}

/**
 * 从文件创建 Object URL
 * @param {File|Blob} file - 文件对象
 * @returns {string} Blob URL
 */
export function createBlobUrl(file) {
    return URL.createObjectURL(file);
}

/**
 * 回收 Blob URL，释放内存
 * @param {string} url - 要回收的 URL
 */
export function revokeBlobUrl(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

/** @type {Promise<{decompressBuffer: Function, parseShpPartsToGeoJSON: Function}>|null} */
let gisParserCache = null;

/**
 * 懒加载 GIS 解析器（shpjs + 自定义 dbfParser）
 * @returns {Promise<{decompressBuffer: Function, parseShpPartsToGeoJSON: Function}>}
 */
export async function ensureGisParsers() {
    if (gisParserCache) return gisParserCache;

    const [{ decompressBuffer }, { parseShpPartsToGeoJSON }] = await Promise.all([
        import('../../../../../utils/gis/decompressFile.js'),
        import('../../../../../utils/gis/parsers/shpParser.ts'),
    ]);

    gisParserCache = { decompressBuffer, parseShpPartsToGeoJSON };
    return gisParserCache;
}
