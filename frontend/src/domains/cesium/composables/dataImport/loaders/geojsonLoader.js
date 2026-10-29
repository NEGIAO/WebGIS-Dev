/**
 * geojsonLoader.js
 * GeoJSON/JSON 格式加载器
 */

import { flyToEntity, applyGroundStackingZIndex } from './utils.js';
import { VECTOR_GROUND_LOAD_OPTIONS } from '../../terrain/groundPlacementCapabilities';
import {
    detectGeoJSONProjectionDetailed,
    ensureProjectionAvailable,
} from '@common/data-import/crs/crsUtils';
import { rememberSourceSnapshot } from '@common/data-import/crs/sourceSnapshot';
import { resolveDatasetProjection, reprojectGeoJSON } from '@common/data-import/crs-engine';

/** 高度属性候选键（米）。缺失/非法一律保持贴地，不拉伸。 */
const HEIGHT_PROPERTY_KEYS = ['height_m', 'height', 'HEIGHT', 'Height', 'altitude', 'elevation'];
/** 拉伸上限（米）：防脏数据把视角炸飞 */
const MAX_EXTRUDE_METERS = 1500;

/**
 * 读取要素高度（米）。
 * @param {Cesium.Entity} entity
 * @param {Cesium} Cesium - 命名空间（取当前时间求值）
 * @returns {number|null} 合法正高度，无则 null
 */
function readFeatureHeightMeters(entity, Cesium) {
    const bag = entity?.properties;
    if (!bag) return null;
    for (const key of HEIGHT_PROPERTY_KEYS) {
        let raw;
        try {
            const prop = bag[key];
            raw = prop && typeof prop.getValue === 'function'
                ? prop.getValue(Cesium.JulianDate.now())
                : prop;
        } catch {
            continue;
        }
        const num = Number(raw);
        if (Number.isFinite(num) && num > 0 && num <= MAX_EXTRUDE_METERS) return num;
    }
    return null;
}

/**
 * 白模拔高：按高度属性把面拉成体（volume 起于 height=0，止于 extrudedHeight）。
 * 须在 forceDataSourceClampToGround 之后调用（该兜底清 height 但不动 extrudedHeight；
 * 此处显式 height=0 走 Primitive 体渲染，挤出才有保障）。无高度的要素保持贴地原样。
 * @returns {number} 被拉伸的要素数
 */
function extrudePolygonsByHeight(dataSource, Cesium) {
    const entities = dataSource?.entities?.values;
    if (!entities) return 0;
    let count = 0;
    for (const entity of entities) {
        if (!entity?.polygon) continue;
        if (entity.polygon.extrudedHeight !== undefined && entity.polygon.extrudedHeight !== null) continue;
        const heightMeters = readFeatureHeightMeters(entity, Cesium);
        if (heightMeters === null) continue;
        entity.polygon.height = 0;
        entity.polygon.extrudedHeight = heightMeters;
        count += 1;
    }
    return count;
}

/**
 * 加载 GeoJSON/JSON 文件到 Cesium
 *
 * @param {Object} ctx
 * @param {File} ctx.file
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 * @returns {Promise<{id: string, name: string, type: string, entity: Cesium.GeoJsonDataSource}>}
 */
export async function loadGeoJSON({
    file,
    overrideCrs = '',
    /**
     * 是否登记「源几何快照」。默认 true；三维侧「重设源坐标系」会带着快照重建一次，
     * 那次必须传 false —— 否则临时 id 会占掉快照注册表的 LRU 名额。
     */
    rememberSnapshot = true,
    /**
     * 静默模式：不弹「加载成功」、不飞相机。默认 false。
     * 供「重设源坐标系」重建时复用 —— 那条链路自己会给出一次提示与一次定位，
     * 否则用户会看到两条成功提示，且相机被同一个动作拽两次。
     */
    silent = false,
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const text = await file.text();
    let geojsonData;
    try {
        geojsonData = JSON.parse(text);
    } catch {
        throw new Error('GeoJSON 文件格式无效，无法解析为 JSON');
    }

    // 入口统一兼容：抓取器输出的裸字符串顶层 crs（如 'WGS84'）会使
    // Cesium 以 "crs.properties is undefined" 抛错（OL 则忽略）。
    // 数据本就是 WGS-84（两引擎默认），此处直接剥离（对象形式保留）——
    // 面板打包侧的 toSpecGeoJSON 只覆盖面板链路，文件拖放/2D 转 3D/Node 落盘
    // 都走这里，一处管所有来源。
    if (
        geojsonData &&
        typeof geojsonData === 'object' &&
        geojsonData.crs !== undefined &&
        (typeof geojsonData.crs !== 'object' || geojsonData.crs === null)
    ) {
        const { crs: _dropped, ...rest } = geojsonData;
        geojsonData = rest;
    }

    // 源坐标系判定：人工指定 > 文件 crs 声明 > 坐标量级推断。
    // Cesium 只认 WGS84 经纬度，非 4326 必须先重投影；转换后剥离 crs 成员，
    // 否则 Cesium 仍会按声明再解释一次（3857 数据会二次错位）。
    const detected = detectGeoJSONProjectionDetailed(geojsonData);
    const projection = resolveDatasetProjection({
        overrideCrs,
        sourceCrs: detected.code || '',
        sourceConfidence:
            detected.confidence === 'declared'
                ? 'declared'
                : detected.confidence === 'ambiguous'
                  ? 'ambiguous'
                  : detected.confidence === 'none'
                    ? 'none'
                    : 'inferred',
        sourceHint: detected.hint,
        targetCrs: 'EPSG:4326',
    });

    if (projection.ambiguous && !overrideCrs && typeof message?.warning === 'function') {
        message.warning(
            `"${file.name}" ${projection.hint}；可在导入区「源坐标系」中指定带号或 EPSG`,
            { duration: 6000 },
        );
    }

    // 重投影之前留存原始数值：三维侧「重设源坐标系」只认快照，没有它就只能重传。
    // reprojectGeoJSON 内部会 clone，不会就地改写入参，故此引用即原始几何。
    const rawGeojson = geojsonData;

    if (projection.needsTransform) {
        // 与 2D 管线能力对齐：本地生成表只覆盖 CGCS2000 分带 / UTM / 少数基准面，
        // 任意 EPSG（如 2154）必须先经 ensureProjectionAvailable 注册 —— 它内部会走
        // 后端 /api/proxy/geo/epsg 兜底；否则 reprojectGeoJSON 会直接抛 UNSUPPORTED_PROJECTED_CRS。
        const available = await ensureProjectionAvailable(projection.sourceCrs);
        if (!available) {
            message.error(
                `"${file.name}" 的源坐标系 ${projection.sourceCrs} 无法解析，请在导入区「源坐标系」中手动指定后重试`,
                { closable: true, duration: 0 },
            );
            throw new Error(`无法解析源坐标系 ${projection.sourceCrs}`);
        }

        let dropped = 0;
        geojsonData = reprojectGeoJSON(geojsonData, available, 'EPSG:4326', {
            onInvalid: (stats) => {
                dropped = stats.droppedFeatures;
            },
        });

        // 转换后必须还有要素：否则 Cesium 会安静地加载一个空数据源，用户只看到「什么都没发生」。
        // 单要素（非 FeatureCollection）转换失败时几何会原样保留，故用 dropped 判定而非要素数。
        const isCollection = Array.isArray(geojsonData?.features);
        const remain = isCollection
            ? geojsonData.features.length
            : geojsonData?.geometry
              ? 1
              : 0;
        const allDropped = isCollection ? remain === 0 : dropped > 0;
        if (!remain || allDropped) {
            message.error(
                `"${file.name}" 按 ${available} 转换后没有有效要素，已放弃导入（未加载任何数据）`,
                { closable: true, duration: 0 },
            );
            throw new Error('投影转换后无有效要素');
        }
        if (dropped > 0) {
            message.warning(
                `"${file.name}" 有 ${dropped} 个要素落在有效范围外，已跳过（其余 ${remain} 个已导入）`,
                { duration: 5200 },
            );
        }
    }
    if (geojsonData && typeof geojsonData === 'object' && geojsonData.crs !== undefined) {
        const { crs: _crsAfterReproject, ...rest } = geojsonData;
        geojsonData = rest;
    }

    const dataSource = await Cesium.GeoJsonDataSource.load(geojsonData, {
        // 贴地决策归策略（groundPlacementCapabilities），loader 只消费
        ...VECTOR_GROUND_LOAD_OPTIONS,
        stroke: Cesium.Color.fromCssColorString('#3ddc84'),
        fill: Cesium.Color.fromCssColorString('#3ddc84').withAlpha(0.3),
        markerColor: Cesium.Color.fromCssColorString('#3ddc84'),
        markerSize: 24,
    });

    const id = `geojson_${++nextId.current}`;
    dataSource.name = file.name;

    await viewer.dataSources.add(dataSource);
    // 贴地兜底：加载期选项之外再强制实体级钳制（防文件语义绕过）
    // 贴地由 groundPlacementService.applyOnImport → vector 策略统一承担，loader 不再各自兜底
    // 多面图层叠放定序：GeoJSON 无 Folder 结构，按文档中等分位给递进 zIndex，
    // 避免后写入的面覆盖先写入的面（GroundPrimitive 桶内先写入者胜出）
    applyGroundStackingZIndex(dataSource);
    // 白模拔高（须在贴地兜底之后）：有高度属性的面按米拉伸，无高度保持贴地
    const extrudedCount = extrudePolygonsByHeight(dataSource, Cesium);
    // 面/线走 GroundPrimitive，点自动 heightReference=CLAMP；地形切换由 Cesium 自动跟随
    // 静默模式由调用方负责定位（重设坐标系重建时，位置要等句柄换完才有意义）
    if (!silent) flyToEntity(viewer, Cesium, dataSource, 'geojson');

    const record = { id, name: file.name, type: 'geojson', entity: dataSource };
    loadedDataSources.value = [...loadedDataSources.value, record];

    // 快照登记在图层 id 确定之后：三维侧属性弹窗据此决定是否出现「重设源坐标系」。
    // 要素数超限时 rememberSourceSnapshot 返回 false（静默跳过），入口自然不出现。
    if (rememberSnapshot && rawGeojson) {
        const rawCount = Array.isArray(rawGeojson?.features) ? rawGeojson.features.length : 1;
        rememberSourceSnapshot(id, {
            geojson: rawGeojson,
            sourceCrs: projection.sourceCrs,
            targetCrs: 'EPSG:4326',
            featureCount: rawCount,
        });
    }

    if (!silent) {
        message.success(
            extrudedCount > 0
                ? `GeoJSON "${file.name}" 加载成功，已按高度拉伸 ${extrudedCount} 栋`
                : `GeoJSON "${file.name}" 加载成功`,
        );
    }
    return record;
}
