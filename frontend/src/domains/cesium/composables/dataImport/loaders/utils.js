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
        } else if (format === 'kml' || format === 'kmz' || format === 'geojson' || format === 'czml' || format === 'shp') {
            // 矢量 DataSource（含 KMZ 解包后的 KML）
            if (entity.entities?.values?.length > 0) {
                viewer.flyTo(entity, { duration: 2 });
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
    if (isTerrainProvider && viewer.scene && typeof Cesium?.EllipsoidTerrainProvider === 'function') {
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

/**
 * 解析 KML 文本中地面几何要素的「Folder run」叠放序号。
 *
 * 背景：一个 KML/KMZ 内常按 Folder 组织多个面数据图层（如 HENU.kmz：
 * Folder line_Clip 线层 + Folder LandParcel 下并排的 建筑/体育/水体/绿地/居住区/学校
 * 面层）。Cesium 贴地面（GroundPrimitive）等高几何的定序机制（本地 1.132 bundle 实证）：
 * - GroundPrimitiveBatcher 把（材质, zIndex）相同的几何合并进**同一个** GroundPrimitive，
 *   批内等高三角形 depth-test **先写入者胜出**；
 * - OrderedGroundPrimitiveCollection 按 zIndex 分桶、桶间升序渲染，**zIndex 越大越靠上**。
 * 所有地面几何 zIndex 默认相同（0）时，绘制顺序退化为实体集合顺序，导致「地块」大面
 * 覆盖建筑等顶部图层。需要按文档 Folder 结构给地面实体分配递进 zIndex。
 *
 * 定序方向（V3.6.19，与 2D 统一；对标 QGIS 图例：文档在前的 Folder 在上）：
 * 文档首 run 拿最高 zIndex，文档末 run 拿最低。线/面同体系编号（PolylineGraphics.zIndex
 * 要求 clampToGround，调用方须先执行 forceDataSourceClampToGround）。
 *
 * 规则：按文档顺序遍历，统计含 <Polygon> 或 <LineString> 的 Placemark
 *（MultiGeometry 内的也算；纯点 Placemark 不参与地面定序）；
 * 记录每个地面要素的「最内层 Folder 名」，Folder 变化即开新 run（rank+1），
 * 保证 rank 沿文档单调不减（兼容嵌套 Folder，避免按最外层 Folder 编号时
 * 嵌套子文件夹全部同 rank 导致定序失效）。
 *
 * @param {string} kmlText - 归一化（去 kml: 前缀）后的 KML 文本
 * @returns {number[]} 每个地面几何 Placemark 的 run 序号，与文档中地面要素顺序一一对应
 */
export function parseKmlPolygonStackingRanks(kmlText) {
    if (!kmlText) return [];

    const xml = new DOMParser().parseFromString(kmlText, 'text/xml');
    if (xml.documentElement.tagName === 'parsererror') return [];

    const ranks = [];
    let currentFolder = null;
    let currentRank = -1;

    const visit = (node, folderStack) => {
        if (node.tagName === 'Folder') {
            // 无 name 的 Folder 用路径序号占位，保证不同 Folder 恒定产生不同 run
            const nameNode = Array.from(node.children).find((child) => child.tagName === 'name');
            const folderName = String(nameNode?.textContent || '').trim() || `__folder_${folderStack.length}__`;
            const nextStack = folderStack.concat(folderName);
            Array.from(node.children).forEach((child) => visit(child, nextStack));
            return;
        }

        if (node.tagName === 'Placemark') {
            const hasGroundGeometry =
                node.getElementsByTagName('Polygon').length > 0 ||
                node.getElementsByTagName('LineString').length > 0;
            if (hasGroundGeometry) {
                const innermost = folderStack.length > 0 ? folderStack[folderStack.length - 1] : null;
                if (innermost !== currentFolder) {
                    currentRank += 1;
                    currentFolder = innermost;
                }
                ranks.push(currentRank);
            }
            return;
        }

        Array.from(node.children).forEach((child) => visit(child, folderStack));
    };

    Array.from(xml.documentElement.children).forEach((child) => visit(child, []));
    return ranks;
}

/**
 * 为 DataSource 中的地面实体分配递进 zIndex（V3.6.19：方向与 2D 统一，对标 QGIS 图例）。
 *
 * 策略 A（ranks 与地面实体数量对齐，如 KML 经 parseKmlPolygonStackingRanks 解析，
 * 含线要素；线/面同体系，混合 Placemark 的 polygon/polyline 取同一 zIndex）：
 *   zIndex = (buckets - 1) - floor((rank + 1) / (maxRank + 2) * buckets)
 *   例 HENU：8 个 run（maxRank=7, span=9, buckets=64）→ 56/49/42/35/28/21/14/0，
 *   文档首 Folder（道路线层）最高在顶，文档末 Folder（学校基底）最低垫底。
 * 策略 B（回退，无 ranks 或数量不一致）：按面实体序号等分位
 *   zIndex = floor(index / total * buckets)，保持文档顺序（先画垫底）——
 *   扁平单层（GeoJSON/SHP 无 Folder 结构）在 QGIS/OL 均是先画垫底，故此处不反转。
 *
 * 仅当存在多于一个 run（策略 A）或多于一个面（策略 B）时才生效；
 * 单一图层保持默认 zIndex，避免跨数据源引入无意义的定序副作用。
 *
 * @param {Cesium.CustomDataSource|Cesium.GeoJsonDataSource|Cesium.KmlDataSource} dataSource
 * @param {number} [buckets=64] - zIndex 量化档位数（0~63，留余量给其它业务层）
 * @param {number[]|null} [ranks=null] - parseKmlPolygonStackingRanks 的 run 序号数组
 */
export function applyGroundStackingZIndex(dataSource, buckets = 64, ranks = null) {
    const groundEntities = (dataSource?.entities?.values || []).filter(
        (entity) => entity.polygon || entity.polyline,
    );
    if (!groundEntities.length) return;

    const clampZ = (value) => Math.min(buckets - 1, Math.max(0, Math.floor(value)));

    const hasRanks = Array.isArray(ranks) && ranks.length === groundEntities.length;
    if (hasRanks) {
        const maxRank = Math.max(...ranks);
        if (maxRank >= 1) {
            const span = maxRank + 2;
            groundEntities.forEach((entity, index) => {
                // 文档在前 → zIndex 更高 → 渲染在上（与 2D renderOrder rank 语义对齐）
                const z = buckets - 1 - clampZ(((ranks[index] + 1) / span) * buckets);
                if (entity.polygon) entity.polygon.zIndex = z;
                if (entity.polyline) entity.polyline.zIndex = z;
            });
            return;
        }
        // 全部同 run（单一地面图层），无需定序
        return;
    }

    // 策略 B：按面实体序号等分位（保持文档顺序，先画垫底；扁平层不反转）
    const polygons = groundEntities.filter((entity) => entity.polygon);
    const total = polygons.length;
    if (total > 1) {
        polygons.forEach((entity, index) => {
            entity.polygon.zIndex = clampZ((index / total) * buckets);
        });
    }
}
