/**
 * cesiumAttrDataset.js
 * Cesium 实体集合 → `attrStore` 数据集（复用 2D 属性表）。
 *
 * 为什么要有这一层：三维侧此前自带 `CesiumAttributeTableDialog`（只读、无排序 /
 * 无字段配置 / 无统计 / 无导出 / 无编辑），与 2D 的 `AttributeTable` 是两套 UI。
 * 属性表本质是「一张表 + 一份字段配置」，与引擎无关——因此不再另造 UI，
 * 而是把实体转成 `AttrLayerDataset` 灌进同一个 store，让两端渲染同一组件。
 *
 * 与 2D 的差异只有一处：3D 侧没有可回写的属性存储，行点击只做定位，
 * 单元格编辑 / 删除要素由宿主不挂载对应事件来禁用（组件按 emit 是否存在自然降级）。
 */
import { collectEntityProperties } from '@cesium-domain/utils/cesiumLayerSerialization';

/** 行数上限：与 collectEntityProperties 默认值一致，防超大图层卡死表格 */
export const CESIUM_ATTR_ROW_LIMIT = 5000;

/** 数据集 id 前缀（与 2D 托管图层 id 不会冲突，syncLayers 侧另有豁免） */
export const CESIUM_ATTR_DATASET_PREFIX = 'cesium-attr:';

/** 取属性当前时刻值（PropertyBag / ConstantProperty / 普通值统一处理） */
function resolveProperty(prop, time) {
    if (prop === null || prop === undefined) return undefined;
    if (typeof prop.getValue === 'function') {
        try {
            return prop.getValue(time);
        } catch {
            return undefined;
        }
    }
    return prop;
}

function isCartesian3(value) {
    return !!value && typeof value === 'object' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

/** 从各类几何属性里尽力收集 Cartesian3 顶点（失败返回空数组，不影响主流程） */
function collectCartesians(Cesium, entity, time) {
    const out = [];
    const push = (value) => {
        if (!value) return;
        if (isCartesian3(value)) {
            out.push(value);
            return;
        }
        if (Array.isArray(value)) value.forEach(push);
        else if (Array.isArray(value?.positions)) value.positions.forEach(push);
    };

    try {
        push(resolveProperty(entity?.position, time));
        push(resolveProperty(entity?.polyline?.positions, time));
        push(resolveProperty(entity?.polygon?.hierarchy, time));
        push(resolveProperty(entity?.wall?.positions, time));
        push(resolveProperty(entity?.corridor?.positions, time));
        push(resolveProperty(entity?.polylineVolume?.positions, time));
    } catch {
        /* 动态属性求值失败：忽略该实体几何，行仍可按名称定位 */
    }

    // 矩形（Rectangle）不是点集，直接由弧度值换算经纬度边界
    const rectangle = resolveProperty(entity?.rectangle?.coordinates, time);
    if (rectangle && Number.isFinite(rectangle.west) && Cesium?.Math) {
        const toDeg = (rad) => Cesium.Math.toDegrees(rad);
        out.push(
            { __lon: toDeg(rectangle.west), __lat: toDeg(rectangle.south) },
            { __lon: toDeg(rectangle.east), __lat: toDeg(rectangle.north) },
        );
    }

    return out;
}

/**
 * 实体包围范围 [west, south, east, north]（度）。
 * 用于属性表「按当前视图筛选」——extent 为 null 时该行恒被保留（诚实降级）。
 */
function entityExtent(Cesium, entity, time) {
    if (!Cesium?.Cartographic || !Cesium?.Math) return null;
    const points = collectCartesians(Cesium, entity, time);
    if (!points.length) return null;

    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;

    for (const point of points) {
        let lon;
        let lat;
        if (Number.isFinite(point.__lon)) {
            lon = point.__lon;
            lat = point.__lat;
        } else {
            const carto = Cesium.Cartographic.fromCartesian(point);
            if (!carto) continue;
            lon = Cesium.Math.toDegrees(carto.longitude);
            lat = Cesium.Math.toDegrees(carto.latitude);
        }
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        west = Math.min(west, lon);
        south = Math.min(south, lat);
        east = Math.max(east, lon);
        north = Math.max(north, lat);
    }

    if (![west, south, east, north].every(Number.isFinite)) return null;
    return [west, south, east, north];
}

/**
 * 字段类型推断（用于统计列的数值聚合与排序比较器）。
 * 采样前 50 个非空值：全部可转有限数字 → number；全部为 true/false → boolean；其余 string。
 */
function inferFieldType(samples) {
    const values = samples.filter((value) => value !== null && value !== undefined && value !== '');
    if (!values.length) return 'string';

    if (values.every((value) => value === true || value === false || value === 'true' || value === 'false')) {
        return 'boolean';
    }
    if (values.every((value) => value !== '' && Number.isFinite(Number(value)))) return 'number';
    return 'string';
}

/**
 * 构建 attrStore 数据集。
 *
 * @param {object} params
 * @param {object} params.Cesium Cesium 命名空间
 * @param {Array} params.entities 实体数组
 * @param {string} params.layerId 图层 id（不含 `cesium:` 前缀）
 * @param {string} params.layerName 图层显示名
 * @returns {{dataset: object|null, truncated: boolean, rowCount: number}}
 */
export function buildCesiumAttrDataset({ Cesium, entities, layerId, layerName } = {}) {
    const list = Array.isArray(entities) ? entities.filter(Boolean) : [];
    if (!list.length) return { dataset: null, truncated: false, rowCount: 0 };

    const id = String(layerId || '').trim();
    const name = String(layerName || id || '三维图层');
    const { columns, rows, truncated } = collectEntityProperties(Cesium, list, CESIUM_ATTR_ROW_LIMIT);
    if (!rows.length) return { dataset: null, truncated, rowCount: 0 };

    const time = Cesium?.JulianDate?.now?.();
    const entityById = new Map();
    list.forEach((entity) => {
        if (entity?.id) entityById.set(String(entity.id), entity);
    });

    // 字段配置：列顺序沿用 collectEntityProperties 的并集顺序，别名与键同名
    const sampleLimit = 50;
    const fieldConfig = {};
    columns.forEach((key) => {
        const samples = [];
        for (let i = 0; i < rows.length && samples.length < sampleLimit; i += 1) {
            const value = rows[i].values?.[key];
            if (value !== undefined) samples.push(value);
        }
        fieldConfig[key] = {
            key,
            alias: key,
            visible: true,
            type: inferFieldType(samples),
        };
    });

    const datasetRows = rows.map((row, index) => {
        const entity = entityById.get(String(row.entityId));
        return {
            id: `${id}::${row.entityId}`,
            featureId: row.entityId,
            layerId: id,
            layerName: name,
            sourceType: 'cesium',
            geometryType: 'unknown',
            properties: row.values,
            rawAttributes: row.values,
            statistics: {},
            geometry: null,
            extent: entityExtent(Cesium, entity, time),
            searchText: `${row.name} ${Object.values(row.values).join(' ')}`.toLowerCase(),
            __index: index,
        };
    });

    return {
        dataset: {
            id: `${CESIUM_ATTR_DATASET_PREFIX}${id}`,
            layerId: id,
            layerName: name,
            sourceType: 'cesium',
            geometryType: 'unknown',
            metadata: { engine: 'cesium', rowCount: datasetRows.length, truncated },
            rows: datasetRows,
            fieldConfig,
            statistics: {},
        },
        truncated,
        rowCount: datasetRows.length,
    };
}
