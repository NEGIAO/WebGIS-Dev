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
                duration: 1.5,
                offset: new Cesium.HeadingPitchRange(
                    0,
                    Cesium.Math.toRadians(-45),
                    entity.boundingSphere.radius * 3.5,
                ),
            });
        } else if (format === 'gltf' && entity.model) {
            // Entity 模型：viewer.flyTo 直接支持
            viewer.flyTo(entity, { duration: 1.5 });
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
 * 数据源句柄的场景卸载（对象级宿主探测版）。
 *
 * 以句柄在 Cesium 各容器中的「真实挂载关系」为准分派卸载
 * （viewer.entities / viewer.dataSources / viewer.imageryLayers /
 * scene.primitives 的 contains 均为 === 引用比较），而非依赖注册方的
 * type 元数据字符串 —— 注册侧类型错配时（如影像图层被记成 '3dtiles'），
 * 字符型分派会产生 primitives.remove(ImageryLayer) 一类静默 no-op，
 * 导致「TOC 已删档、场景仍渲染」的不同步缺陷。
 *
 * @param {{ viewer: object, Cesium: object, entity: object, type?: string }} params
 * @param {object} params.viewer - Cesium Viewer 实例
 * @param {object} [params.Cesium] - Cesium 命名空间（地形复位与实例判定用）
 * @param {object} params.entity - loadedDataSources 记录的原始句柄（调用方须已 toRaw）
 * @param {string} [params.type] - 记录 type（'terrain' 显式声明时强制走地形复位分支）
 * @returns {boolean} 是否成功从某个宿主容器卸载（或完成地形复位）
 */
export function detachEntityFromScene({ viewer, Cesium, entity, type }) {
    if (!viewer || !entity || typeof entity !== 'object') return false;

    // 1) Entity 形态句柄（GLTF Entity 等）：viewer.entities
    const viewerEntities = viewer.entities;
    if (viewerEntities?.contains?.(entity)) {
        viewerEntities.remove(entity);
        return true;
    }

    // 2) DataSource（GeoJSON/KML/CZML/SHP/Custom…）：viewer.dataSources（destroy=true 级联销毁）
    const dataSources = viewer.dataSources;
    if (dataSources?.contains?.(entity)) {
        dataSources.remove(entity, true);
        return true;
    }

    // 3) 栅格覆盖层（ImageryLayer）：viewer.imageryLayers（destroy=true 级联销毁）
    const imageryLayers = viewer.imageryLayers;
    if (imageryLayers?.contains?.(entity)) {
        imageryLayers.remove(entity, true);
        return true;
    }

    // 4) 场景级图元（Cesium3DTileset / Model / 复合 I3S provider…）：scene.primitives
    const primitives = viewer.scene?.primitives;
    if (primitives?.contains?.(entity)) {
        primitives.remove(entity);
        return true;
    }

    // 5) 地形 Provider：非容器型对象，唯一合法处置是复位为默认椭球地形
    const isTerrainProvider =
        String(type || '') === 'terrain' ||
        (typeof Cesium?.TerrainProvider === 'function' && entity instanceof Cesium.TerrainProvider) ||
        (typeof Cesium?.EllipsoidTerrainProvider === 'function' &&
            entity instanceof Cesium.EllipsoidTerrainProvider);
    if (isTerrainProvider && viewer.scene) {
        viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        return true;
    }

    return false;
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
        import('@common/data-import/decompressFile.js'),
        import('@common/data-import/parsers/shpParser.ts'),
    ]);

    gisParserCache = { decompressBuffer, parseShpPartsToGeoJSON };
    return gisParserCache;
}

/**
 * 实体级贴地强制兜底（加载期 clampToGround 选项之外的第二道保险）：
 * - 折线：clampToGround = true（GroundPolyline，随地形起伏）
 * - 点/模型：heightReference = CLAMP_TO_GROUND
 * - 面：清除显式高度与 perPositionHeight（走 GroundPrimitive 贴地分类）
 *
 * 背景：当源文件带 <altitudeMode>absolute</altitudeMode> 等显式声明时，
 * Cesium 会优先尊重文件语义而绕过 load 期 clampToGround 选项；
 * 项目要求「矢量数据全部贴地」，故在加载后统一强制。
 *
 * @param {Cesium.CustomDataSource|Cesium.GeoJsonDataSource|Cesium.KmlDataSource} dataSource
 * @param {Cesium} Cesium - Cesium 命名空间
 */
export function forceDataSourceClampToGround(dataSource, Cesium) {
    if (!dataSource?.entities || !Cesium?.HeightReference) return;
    const clampRef = Cesium.HeightReference.CLAMP_TO_GROUND;
    for (const entity of dataSource.entities.values) {
        if (entity.polyline) {
            entity.polyline.clampToGround = true;
        }
        if (entity.point) {
            entity.point.heightReference = clampRef;
        }
        if (entity.model) {
            entity.model.heightReference = clampRef;
        }
        if (entity.polygon) {
            entity.polygon.perPositionHeight = false;
            entity.polygon.height = undefined;
        }
    }
}
