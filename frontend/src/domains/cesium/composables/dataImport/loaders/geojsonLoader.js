/**
 * geojsonLoader.js
 * GeoJSON/JSON 格式加载器
 */

import { flyToEntity, applyGroundStackingZIndex } from './utils.js';
import { VECTOR_GROUND_LOAD_OPTIONS } from '../../terrain/groundPlacementCapabilities';

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
        let raw = null;
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
export async function loadGeoJSON({ file, getCesium, getViewer, message, loadedDataSources, nextId }) {
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
    flyToEntity(viewer, Cesium, dataSource, 'geojson');

    const record = { id, name: file.name, type: 'geojson', entity: dataSource };
    loadedDataSources.value = [...loadedDataSources.value, record];

    message.success(
        extrudedCount > 0
            ? `GeoJSON "${file.name}" 加载成功，已按高度拉伸 ${extrudedCount} 栋`
            : `GeoJSON "${file.name}" 加载成功`,
    );
    return record;
}
