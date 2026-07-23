/**
 * utils.js
 * 数据导入共享工具函数
 *
 * 提供文件扩展名提取、相机定位、Blob URL 管理、GIS 解析器懒加载等通用能力。
 */

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
