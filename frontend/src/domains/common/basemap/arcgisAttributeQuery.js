/**
 * arcgisAttributeQuery.js — ArcGIS REST 要素属性拉取（引擎无关，纯 JS）
 *
 * 用途：TOC「在线服务」的 ArcGIS 动态服务（具备 Query 能力）打开属性表。
 * 协议：{endpoint}/{layerId}/query?where=1=1&outFields=*&returnGeometry=true
 *       （几何需随行返回，供属性表双击定位 / 缩放到选中要素）
 *
 * 归一化产出：
 *   fields  [{key, alias, type}]   —— esri 字段类型映射为 string|number|date|boolean
 *   records [{ featureId, properties, geometry, extent }]
 */

const ESRI_TYPE_MAP = {
    esriFieldTypeString: 'string',
    esriFieldTypeSmallInteger: 'number',
    esriFieldTypeInteger: 'number',
    esriFieldTypeSingle: 'number',
    esriFieldTypeDouble: 'number',
    esriFieldTypeOID: 'number',
    esriFieldTypeDate: 'date',
    esriFieldTypeBlob: 'string',
    esriFieldTypeGUID: 'string',
};

function mapEsriType(esriType) {
    // ESRI 类型为驼峰字面量（esriFieldTypeString 等），禁止 lowercase 后匹配 —— 永远失配
    return ESRI_TYPE_MAP[String(esriType || '').trim()] || 'string';
}

/**
 * 拉取单个子图层的属性表
 * @param {object} params
 * @param {string} params.endpoint 服务基址（…/MapServer）
 * @param {string} params.layerId 图层 id（数字字符串）
 * @param {number} [params.maxFeatures=2000] resultRecordCount 上限
 * @returns {Promise<{fields: Array<{key,alias,type}>, records: Array<{featureId:string, properties:Record<string,unknown>}>}>}
 */
export async function fetchArcgisLayerAttributes({ endpoint, layerId, maxFeatures = 2000 }) {
    const base = String(endpoint || '').replace(/\/+$/, '');
    if (!base || layerId === undefined || layerId === null || layerId === '') {
        throw new Error('缺少服务端点或图层 id');
    }

    const qs = new URLSearchParams({
        where: '1=1',
        outFields: '*',
        returnGeometry: 'true',
        returnZ: 'false',
        returnM: 'false',
        resultRecordCount: String(maxFeatures),
        f: 'json',
    });
    const url = `${base}/${layerId}/query?${qs.toString()}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data?.error) {
        throw new Error(data.error.message || '服务端查询错误');
    }
    if (!Array.isArray(data?.features)) {
        throw new Error('响应不是有效的要素集');
    }

    const fields = (Array.isArray(data.fields) ? data.fields : []).map((field) => ({
        key: String(field.name),
        alias: String(field.alias || field.name),
        type: mapEsriType(field.type),
    }));

    const objectIdField = String(data.objectIdFieldName || 'OBJECTID');

    // ── 几何转换：esri geometry → GeoJSON 风格（统一到 EPSG:4326）──
    const sr = Number(data.spatialReference?.latestWkid ?? data.spatialReference?.wkid ?? 4326);
    const geoType = String(data.geometryType || '');
    // EPSG:3857 及其历史 WKID 别名（Web 墨卡托投影，4326 单独命中处理）
    const MERCATOR_WKIDS = [3857, 102100, 900913, 102113];

    function projPair(x, y) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
        const nx = Number(x); const ny = Number(y);
        if (sr === 4326) return [nx, ny];
        if (MERCATOR_WKIDS.includes(sr)) {
            return [(nx / 20037508.342789244) * 180,
                (Math.atan(Math.exp((ny / 20037508.342789244) * Math.PI)) * 360) / Math.PI - 180];
        }
        return null;
    }

    function convertGeometry(esriGeom, geoTypeOverride) {
        if (!esriGeom || typeof esriGeom !== 'object') return null;
        // Esri 要素级 geometry 不含 type：类型取响应级 geometryType
        const geoType = geoTypeOverride || String(esriGeom.type || '');
        let coordinates = null;

        if (geoType === 'esriGeometryPoint') {
            const pair = projPair(esriGeom.x, esriGeom.y);
            coordinates = pair;
        } else if (geoType === 'esriGeometryMultipoint') {
            coordinates = (esriGeom.points || []).map((p) => projPair(p[0], p[1]));
        } else if (geoType === 'esriGeometryPolyline') {
            coordinates = (esriGeom.paths || []).map((path) => path.map((p) => projPair(p[0], p[1])));
        } else if (geoType === 'esriGeometryPolygon') {
            coordinates = (esriGeom.rings || []).map((ring) => ring.map((p) => projPair(p[0], p[1])));
        } else {
            return null;
        }

        if (!coordinates) return null;

        // 收集有效点算范围；任一点投影失败（未知 SR）→ 整体放弃几何
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
        const walk = (node) => {
            if (!Array.isArray(node)) return false;
            if (Number.isFinite(node[0]) && Number.isFinite(node[1])) {
                minX = Math.min(minX, node[0]); minY = Math.min(minY, node[1]);
                maxX = Math.max(maxX, node[0]); maxY = Math.max(maxY, node[1]);
                return true;
            }
            for (const child of node) walk(child);
            return true;
        };
        walk(coordinates);
        if (!Number.isFinite(minX)) return null;
        // 跨日界线病态范围放弃定位
        if (maxX - minX > 350) return null;

        const geoJsonType = {
            esriGeometryPoint: 'Point',
            esriGeometryMultipoint: 'MultiPoint',
            esriGeometryPolyline: 'MultiLineString',
            esriGeometryPolygon: 'Polygon',
        }[geoType] || 'Unknown';

        return {
            geometry: { type: geoJsonType, coordinates },
            extent: [minX, minY, maxX, maxY],
        };
    }

    const records = data.features.map((feature, index) => {
        const attributes = feature?.attributes && typeof feature.attributes === 'object'
            ? feature.attributes
            : {};
        const featureId = String(attributes[objectIdField] ?? index);
        const converted = convertGeometry(feature?.geometry, geoType);
        return {
            featureId,
            properties: attributes,
            geometry: converted?.geometry ?? null,
            extent: converted?.extent ?? null,
        };
    });

    return { fields, records, exceededTransferLimit: data.exceededTransferLimit === true };
}

/**
 * 合并多个子图层的查询结果为一个属性表数据集
 * 每行注入「子图层」列便于区分来源；字段集取并集（别名优先级：先出现者保留）
 */
export function mergeSublayerAttributes(queryResults) {
    const fieldMeta = new Map(); // key -> {key,alias,type}
    const rows = [];
    let runningIndex = 0;

    for (const result of queryResults) {
        if (!result || result.error || !result.records?.length) continue;

        // 先登记该层字段元信息（含别名）
        for (const field of result.fields || []) {
            if (!fieldMeta.has(field.key)) {
                fieldMeta.set(field.key, { ...field });
            }
        }

        for (const record of result.records) {
            runningIndex += 1;
            rows.push({
                featureId: `${result.layerId}:${record.featureId}`,
                properties: {
                    ...(result.layerTitle ? { 子图层: result.layerTitle } : {}),
                    ...record.properties,
                },
                geometry: record.geometry ?? null,
                extent: record.extent ?? null,
                layerTitle: result.layerTitle,
                layerId: result.layerId,
                index: runningIndex,
            });
        }
    }

    return {
        fields: [...fieldMeta.values()],
        records: rows.map((row) => ({
            featureId: row.featureId,
            properties: row.properties,
            geometry: row.geometry,
            extent: row.extent,
        })),
        layerTitles: queryResults.map((r) => r?.layerTitle).filter(Boolean),
        totalRows: rows.length,
    };
}
