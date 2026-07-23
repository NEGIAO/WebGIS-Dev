/**
 * importUtils.js
 * 数据导入模块的通用工具函数
 *
 * 功能：提供文件扩展名提取、Blob URL 管理、场景定位、GIS 解析器懒加载等共享工具。
 * 所有数据导入子模块（GeoJSON/KML/KMZ/SHP/GLTF/CZML/3DTiles/GeoTIFF）均依赖本模块。
 */

/** @type {string} 3D Tiles 根文件名标识 */
export const TILESET_JSON_INDICATOR = 'tileset.json';

/** @type {object|null} GIS 解析器缓存（shpjs + dbfParser） */
let gisParserCache = null;

/**
 * 提取文件扩展名（小写）
 * @param {string} filename - 文件名
 * @returns {string} 小写扩展名，如 'json', 'kml', 'tif'
 */
export function getExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? '' : filename.slice(lastDot + 1).toLowerCase();
}

/**
 * 为文件创建 Blob URL
 * @param {File|Blob} file - 文件对象
 * @returns {string} blob: URL
 */
export function createBlobUrl(file) {
    return URL.createObjectURL(file);
}

/**
 * 释放 Blob URL
 * @param {string} url - blob: URL
 */
export function revokeBlobUrl(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

/**
 * 定位/飞至数据源实体
 * 根据数据源类型自动计算合适的相机视角
 *
 * @param {object} viewer - Cesium Viewer 实例
 * @param {object} Cesium - Cesium 命名空间
 * @param {object} entity - 数据源实体
 * @param {string} format - 数据格式类型（'geojson', 'kml', 'gltf', 'tif', '3dtiles', 'czml', 'shp'）
 */
export function flyToEntity(viewer, Cesium, entity, format) {
    if (!viewer || !Cesium || !entity) return;

    if (format === 'tif' && entity.imageryProvider?.rectangle) {
        // GeoTIFF：飞至影像矩形范围
        const rect = entity.imageryProvider.rectangle;
        viewer.camera.flyTo({ destination: rect, duration: 2 });
        return;
    }

    // 默认：flyTo 数据源
    viewer.flyTo(entity, { duration: 2 });
}

/**
 * 懒加载 GIS 解析器（shpjs + dbfParser）
 * 用于 SHP 文件解析，返回 { decompressBuffer, parseShpPartsToGeoJSON }
 *
 * @returns {Promise<{ decompressBuffer: Function, parseShpPartsToGeoJSON: Function }>}
 */
export async function ensureGisParsers() {
    if (gisParserCache) return gisParserCache;

    const [shpMod, dbfMod] = await Promise.all([
        import('shpjs'),
        import('../../../../utils/gis/parsers/dbfParser.ts'),
    ]);

    const shpModule = shpMod.default || shpMod;
    const dbfModule = dbfMod.default || dbfMod;

    /**
     * 解压 KMZ 压缩包，提取内部文件条目
     * @param {ArrayBuffer} buffer - ZIP 二进制数据
     * @param {string} name - 文件名（用于错误提示）
     * @returns {Promise<Array<{ name: string, ext: string, text: string, buffer: ArrayBuffer }>>}
     */
    async function decompressBuffer(buffer, _name) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(buffer);
        const entries = [];
        const promises = [];
        zip.forEach((relPath, entry) => {
            if (entry.dir) return;
            const ext = getExtension(relPath);
            promises.push(
                entry.async('text').then((text) => {
                    entries.push({ name: relPath, ext, text, buffer: null });
                }).catch(() =>
                    entry.async('arraybuffer').then((ab) => {
                        entries.push({ name: relPath, ext, buffer: ab, text: null });
                    })
                )
            );
        });
        await Promise.all(promises);
        return entries;
    }

    /**
     * 解析 SHP 文件 Parts 为 GeoJSON（EPSG:4326）
     * @param {{ shp: ArrayBuffer, dbf?: ArrayBuffer, prj?: string }} parts
     * @returns {Promise<object|object[]>} GeoJSON FeatureCollection 或 FeatureCollection 数组
     */
    async function parseShpPartsToGeoJSON(parts) {
        const geojson = await shpModule.parseShp(parts.shp, parts.prj || '');
        if (parts.dbf) {
            const dbfRecords = dbfModule.parseDbf(parts.dbf);
            if (dbfRecords && dbfRecords.length > 0) {
                const features = Array.isArray(geojson.features)
                    ? geojson.features
                    : (geojson.features ? [geojson] : []);
                const merged = features.map((feat, i) => {
                    if (i < dbfRecords.length) {
                        feat = { ...feat, properties: { ...feat.properties, ...dbfRecords[i] } };
                    }
                    return feat;
                });
                return { type: 'FeatureCollection', features: merged };
            }
        }
        return geojson;
    }

    gisParserCache = { decompressBuffer, parseShpPartsToGeoJSON };
    return gisParserCache;
}