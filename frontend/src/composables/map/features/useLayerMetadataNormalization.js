/**
 * useLayerMetadataNormalization.js
 *
 * 图层元数据与属性快照标准化工具。
 * 输出统一的属性结构，供图层注册、属性表和联动高亮共用。
 */

import { getCenter as getExtentCenter } from 'ol/extent';
import { toLonLat } from 'ol/proj';

function isPlainObject(value) {
    return !!value && Object.prototype.toString.call(value) === '[object Object]';
}

function safeClone(value) {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            // fall through
        }
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function parseHtmlText(html) {
    if (typeof html !== 'string') return String(html || '').trim();
    if (typeof DOMParser !== 'undefined') {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            // ★ 主动剥离 <script>/<style>/<noscript> 标签及 inline 事件属性，
            //    避免残留 JavaScript 代码进入属性表
            stripScriptsAndStyles(doc);
            return String(doc.body.textContent || '').trim();
        } catch {
            // fallback to regex
        }
    }
    return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * ★ 新增（2026-06-21）：主动剥离 DOM 中的 script/style/noscript 标签，
 *    并移除所有节点上的 inline 事件属性（onclick/onerror/onload 等）。
 *    DOMParser 解析 text/html 时不自动执行脚本，但节点对象仍保留在 DOM 中，
 *    通过 textContent 提取时不会包含 <script>，但需要显式移除以保证防御深度。
 * @param {Document} doc DOMParser 解析结果
 */
function stripScriptsAndStyles(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    const removable = doc.querySelectorAll('script, style, noscript, iframe, object, embed');
    removable.forEach((node) => {
        try { node.parentNode?.removeChild(node); } catch { /* ignore */ }
    });
    // 移除 inline 事件属性
    const allElements = doc.querySelectorAll('*');
    allElements.forEach((el) => {
        if (!el.attributes) return;
        Array.from(el.attributes).forEach((attr) => {
            if (/^on[a-z]+/i.test(attr.name)) {
                try { el.removeAttribute(attr.name); } catch { /* ignore */ }
            }
            if (/^javascript:/i.test(attr.value || '')) {
                try { el.removeAttribute(attr.name); } catch { /* ignore */ }
            }
        });
    });
}

/**
 * ★ 新增（2026-06-21）：归一化 <Null> 占位符为 null
 * OSM Nominatim / Cesium FeatureDescription / GeoServer WFS 等 GIS 数据源
 * 习惯使用 <Null> 表示空值（XML 风格），属性表应识别此约定。
 */
const NULL_PATTERN = /^\s*<\s*Null\s*>\s*$/i;
function normalizeNullString(str) {
    if (typeof str !== 'string') return str;
    return NULL_PATTERN.test(str) ? null : str;
}

function parseHtmlTableValue(value) {
    if (typeof value !== 'string' || !/<table[\s>]/i.test(value)) return null;
    if (typeof DOMParser === 'undefined') return null;
    let doc;
    try {
        doc = new DOMParser().parseFromString(value, 'text/html');
    } catch {
        return null;
    }

    // ★ 增强：主动剥离脚本/样式/inline 事件
    stripScriptsAndStyles(doc);

    const table = doc.querySelector('table');
    if (!table) return null;

    const parsed = {};

    // ★ 重写：列索引驱动解析，识别 <thead> 表头或首行 <tr><th>...</th></tr>
    const thead = table.querySelector('thead');
    const headerRow = thead ? thead.querySelector('tr') : null;
    const headerCells = headerRow
        ? Array.from(headerRow.querySelectorAll('th,td')).map((c) => String(c.textContent || '').trim())
        : null;
    let headerKeyIndex = 0;

    // 表头包含 "name/value" 风格的关键字时，按列索引解析
    const HEADER_KEY_HINTS = ['名称', 'name', '属性', 'field', 'property', 'key', 'detail', '字段', '参数'];
    const HEADER_VALUE_HINTS = ['值', 'value', 'value1', 'val', 'content', 'result', '取值', '字段值'];

    let useColumnIndex = false;
    if (headerCells && headerCells.length >= 2) {
        const lowerHeaders = headerCells.map((h) => h.toLowerCase());
        const hasKeyColumn = lowerHeaders.some((h) => HEADER_KEY_HINTS.includes(h));
        const hasValueColumn = lowerHeaders.some((h) => HEADER_VALUE_HINTS.includes(h));
        if (hasKeyColumn && hasValueColumn) {
            useColumnIndex = true;
            headerKeyIndex = lowerHeaders.findIndex((h) => HEADER_KEY_HINTS.includes(h));
        }
    }

    // 获取数据行（tbody > tr 或全部 tr 排除表头）
    let dataRows;
    if (thead) {
        const tbody = table.querySelector('tbody') || table;
        dataRows = Array.from(tbody.querySelectorAll('tr')).filter((tr) => !thead.contains(tr));
    } else {
        const allRows = Array.from(table.querySelectorAll('tr'));
        // 没有显式 thead：第一行若是 <th>，则当作表头跳过
        if (headerCells && allRows[0] === headerRow) {
            dataRows = allRows.slice(1);
        } else {
            dataRows = allRows;
        }
    }

    dataRows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('th,td'));
        if (cells.length < 2) return;

        let rawKey;
        let valueCells;

        if (useColumnIndex) {
            rawKey = String(cells[headerKeyIndex]?.textContent || '').trim();
            valueCells = cells.filter((_, idx) => idx !== headerKeyIndex);
        } else {
            // 默认：cells[0] = key, cells[1+] = value
            rawKey = String(cells[0]?.textContent || '').trim();
            valueCells = cells.slice(1);
        }

        if (!rawKey) return;

        // ★ 处理 valueCells 中的嵌套表格 / <dl>
        const valueTexts = valueCells.map((cell) => {
            const nestedTable = cell.querySelector?.('table');
            if (nestedTable) {
                const nestedHtml = nestedTable.outerHTML;
                const nested = parseHtmlTableValue(nestedHtml);
                return nested || parseHtmlText(cell.innerHTML);
            }
            const nestedDl = cell.querySelector?.('dl');
            if (nestedDl) {
                const nested = parseDefinitionListValue(nestedDl.outerHTML);
                return nested || parseHtmlText(cell.innerHTML);
            }
            return parseHtmlText(cell.innerHTML || cell.textContent || '');
        }).filter((text) => text !== '');

        if (!valueTexts.length) return;

        const rawValue = valueTexts.join(' ').trim();
        const normalizedValue = normalizeNullString(rawValue);

        // ★ 同名 key 合并为数组
        if (Object.prototype.hasOwnProperty.call(parsed, rawKey)) {
            const existing = parsed[rawKey];
            if (Array.isArray(existing)) {
                parsed[rawKey].push(normalizedValue);
            } else {
                parsed[rawKey] = [existing, normalizedValue];
            }
        } else {
            parsed[rawKey] = normalizedValue;
        }
    });

    return Object.keys(parsed).length ? parsed : null;
}

/**
 * ★ 新增（2026-06-21）：解析 HTML 定义列表 <dl>/<dt>/<dd>
 *  部分 GIS 元数据使用定义列表表达字段-值对：
 *  <dl><dt>name</dt><dd>foo</dd><dt>type</dt><dd>city</dd></dl>
 * @param {string} value HTML 字符串
 * @returns {Object|null} 解析结果
 */
function parseDefinitionListValue(value) {
    if (typeof value !== 'string' || !/<dl[\s>]/i.test(value)) return null;
    if (typeof DOMParser === 'undefined') return null;
    let doc;
    try {
        doc = new DOMParser().parseFromString(value, 'text/html');
    } catch {
        return null;
    }
    stripScriptsAndStyles(doc);
    const dl = doc.querySelector('dl');
    if (!dl) return null;

    const parsed = {};
    const children = Array.from(dl.children);
    let pendingKey = '';

    children.forEach((child) => {
        const tag = String(child.tagName || '').toLowerCase();
        const text = String(child.textContent || '').trim();
        const normalizedText = normalizeNullString(text);
        if (tag === 'dt') {
            pendingKey = text;
        } else if (tag === 'dd' && pendingKey) {
            if (Object.prototype.hasOwnProperty.call(parsed, pendingKey)) {
                const existing = parsed[pendingKey];
                parsed[pendingKey] = Array.isArray(existing) ? [...existing, normalizedText] : [existing, normalizedText];
            } else {
                parsed[pendingKey] = normalizedText;
            }
            pendingKey = '';
        }
    });

    return Object.keys(parsed).length ? parsed : null;
}

export function normalizeHtmlAttributes(attributes) {
    if (!isPlainObject(attributes)) return attributes;

    let next = { ...attributes };
    Object.entries(attributes).forEach(([key, value]) => {
        if (typeof value !== 'string') return;

        // ★ 增强（2026-06-21）：先尝试 <dl>/<dt>/<dd> 定义列表
        if (/<dl[\s>]/i.test(value) && !/<table[\s>]/i.test(value)) {
            const dlParsed = parseDefinitionListValue(value);
            if (dlParsed && isPlainObject(dlParsed)) {
                // 解析结果优先，原 attributes 兜底：保留原始 key 在解析值缺失时仍可见
                next = { ...next, ...dlParsed };
                // 保留原始字段供调试
                next[key] = parseHtmlText(value);
                return;
            }
        }

        if (/<table[\s>]/i.test(value)) {
            const parsed = parseHtmlTableValue(value);
            if (parsed && isPlainObject(parsed)) {
                // 解析结果优先，原 attributes 兜底
                next = { ...next, ...parsed };
            }
            next[key] = parseHtmlText(value);
        }
    });

    return next;
}

function normalizePrimitiveValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (value instanceof Date)
        return Number.isFinite(value.getTime()) ? value.toISOString() : String(value);
    if (typeof value === 'string') return value.trim();
    return String(value);
}

function inferValueType(value) {
    if (value === null || value === undefined || value === '') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number' && Number.isFinite(value)) return 'number';
    if (value instanceof Date && Number.isFinite(value.getTime())) return 'date';

    if (typeof value === 'string') {
        const compact = value.trim();
        if (!compact) return 'string';
        if (/^(true|false)$/i.test(compact)) return 'boolean';
        if (/^-?\d+(?:\.\d+)?$/.test(compact) && Number.isFinite(Number(compact))) return 'number';
        const timestamp = Date.parse(compact);
        if (Number.isFinite(timestamp) && /[-/:T ]/.test(compact)) return 'date';
    }

    return 'string';
}

function mergeTypeCounts(target, source) {
    const next = { ...target };
    Object.entries(source || {}).forEach(([key, value]) => {
        next[key] = (next[key] || 0) + Number(value || 0);
    });
    return next;
}

function flattenAttributes(input, prefix = '', target = {}, seen = new WeakSet()) {
    if (input === null || input === undefined) return target;

    if (typeof input !== 'object') {
        if (prefix) target[prefix] = normalizePrimitiveValue(input);
        return target;
    }

    if (input instanceof Date) {
        if (prefix) target[prefix] = normalizePrimitiveValue(input);
        return target;
    }

    if (Array.isArray(input)) {
        if (!input.length && prefix) {
            target[prefix] = [];
            return target;
        }

        input.forEach((item, index) => {
            const nextKey = prefix ? `${prefix}.${index}` : String(index);
            flattenAttributes(item, nextKey, target, seen);
        });
        return target;
    }

    if (!isPlainObject(input)) {
        if (prefix) target[prefix] = normalizePrimitiveValue(input);
        return target;
    }

    if (seen.has(input)) {
        if (prefix) target[prefix] = '[Circular]';
        return target;
    }
    seen.add(input);

    const entries = Object.entries(input).filter(
        ([key]) => !['geometry', 'style', 'id', '_gid'].includes(key),
    );

    if (!entries.length && prefix) {
        target[prefix] = {};
        return target;
    }

    entries.forEach(([key, value]) => {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (value === null || value === undefined) {
            target[nextKey] = value;
            return;
        }

        if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            value instanceof Date
        ) {
            target[nextKey] = normalizePrimitiveValue(value);
            return;
        }

        flattenAttributes(value, nextKey, target, seen);
    });

    return target;
}

function getGeometryType(feature) {
    return (
        String(
            feature?.getGeometry?.()?.getType?.() ||
                feature?.geometry?.type ||
                feature?.geometryType ||
                feature?.type ||
                '',
        ).trim() || 'unknown'
    );
}

function getGeometryExtent(feature) {
    const geometry = feature?.getGeometry?.() || feature?.geometry || null;
    if (!geometry) return null;

    if (typeof geometry.getExtent === 'function') {
        const extent = geometry.getExtent();
        if (Array.isArray(extent) && extent.length >= 4 && extent.every(Number.isFinite)) {
            return extent.slice(0, 4);
        }
    }

    const coordinates = geometry?.coordinates;
    if (!coordinates) return null;

    const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
    };

    const visit = (node) => {
        if (!Array.isArray(node)) return;
        if (
            node.length >= 2 &&
            Number.isFinite(Number(node[0])) &&
            Number.isFinite(Number(node[1]))
        ) {
            const x = Number(node[0]);
            const y = Number(node[1]);
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
            return;
        }
        node.forEach((child) => visit(child));
    };

    visit(coordinates);

    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
        return null;
    }

    return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}

function getFeatureRepresentativeLonLat(feature) {
    const geometry = feature?.getGeometry?.();
    if (!geometry) return null;

    const extent = geometry.getExtent?.();
    if (!extent || extent.some((value) => !Number.isFinite(value))) return null;

    const centerCoord =
        geometry.getType?.() === 'Point' ? geometry.getCoordinates?.() : getExtentCenter(extent);

    if (!Array.isArray(centerCoord) || centerCoord.length < 2) return null;

    const [lon, lat] = toLonLat(centerCoord);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

    return [lon, lat];
}

function inferLayerRepresentativeLonLat(features = []) {
    for (const feature of features || []) {
        const pair = getFeatureRepresentativeLonLat(feature);
        if (pair) return pair;
    }
    return null;
}

function normalizeLayerMetadata(metadata, features = []) {
    const nextMetadata = { ...(metadata || {}) };
    const normalizedCrs = String(nextMetadata.crs || 'wgs84').toLowerCase();
    nextMetadata.crs = normalizedCrs === 'gcj02' ? 'gcj02' : 'wgs84';

    if (!(Number.isFinite(nextMetadata.longitude) && Number.isFinite(nextMetadata.latitude))) {
        const pair = inferLayerRepresentativeLonLat(features);
        if (pair) {
            nextMetadata.longitude = Number(pair[0].toFixed(6));
            nextMetadata.latitude = Number(pair[1].toFixed(6));
        }
    }

    return nextMetadata;
}

function extractFeatureId(feature, index = 0) {
    const candidates = [
        feature?.id,
        feature?._gid,
        feature?.properties?._gid,
        feature?.properties?.id,
        feature?.properties?.OBJECTID,
        feature?.properties?.FID,
        feature?.properties?.objectid,
        feature?.properties?.fid,
    ];

    const matched = candidates.find((item) => String(item || '').trim().length > 0);
    return String(matched || `feature_${index + 1}`);
}

function extractRawAttributes(feature) {
    if (!feature) return {};

    if (typeof feature.getProperties === 'function') {
        let properties = safeClone(feature.getProperties() || {});
        if (properties && typeof properties === 'object') {
            delete properties.geometry;
            delete properties.style;
            delete properties._style;
            delete properties.ol_uid;
        }
        properties = normalizeHtmlAttributes(properties);
        return properties && typeof properties === 'object' ? properties : {};
    }

    if (isPlainObject(feature.properties)) {
        let properties = safeClone(feature.properties);
        delete properties.geometry;
        delete properties.style;
        properties = normalizeHtmlAttributes(properties);
        return properties;
    }

    if (isPlainObject(feature)) {
        let clone = safeClone(feature);
        delete clone.geometry;
        delete clone.style;
        clone = normalizeHtmlAttributes(clone);
        return clone;
    }

    return {};
}

function collectFieldValues(records, fieldKey) {
    return records.map((record) => record?.properties?.[fieldKey]);
}

function buildFieldConfig(records, previousMap = {}) {
    const keys = new Set();
    records.forEach((record) => {
        Object.keys(record.properties || {}).forEach((key) => keys.add(key));
    });

    const nextMap = {};
    Array.from(keys).forEach((fieldKey) => {
        const values = collectFieldValues(records, fieldKey);
        const oldConfig = previousMap[fieldKey];
        const typeCounts = values.reduce((acc, value) => {
            const type = inferValueType(value);
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        nextMap[fieldKey] = {
            key: fieldKey,
            alias: String(oldConfig?.alias || fieldKey),
            visible: oldConfig?.visible !== false,
            type:
                oldConfig?.type ||
                Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
                'string',
        };
    });

    return nextMap;
}

function buildRecordStatistics(properties) {
    const values = Object.values(properties || {});
    const typeCounts = { string: 0, number: 0, date: 0, boolean: 0, object: 0, null: 0 };
    const numericValues = [];

    values.forEach((value) => {
        if (value === null || value === undefined || value === '') {
            typeCounts.null += 1;
            return;
        }

        const type = inferValueType(value);
        if (type in typeCounts) typeCounts[type] += 1;
        else typeCounts.string += 1;

        if (type === 'number') {
            const num = Number(value);
            if (Number.isFinite(num)) numericValues.push(num);
        }
    });

    const sum = numericValues.reduce((acc, value) => acc + value, 0);
    return {
        valueCount: values.length,
        typeCounts,
        numericSummary: numericValues.length
            ? {
                  count: numericValues.length,
                  sum,
                  avg: sum / numericValues.length,
                  min: Math.min(...numericValues),
                  max: Math.max(...numericValues),
              }
            : {
                  count: 0,
                  sum: 0,
                  avg: 0,
                  min: null,
                  max: null,
              },
    };
}

function normalizeFeatureRecord(feature, context = {}) {
    const rawAttributes = extractRawAttributes(feature);
    const flattened = flattenAttributes(rawAttributes, '', {}, new WeakSet());
    const geometryType = getGeometryType(feature) || context.geometryType || 'unknown';
    const extent = getGeometryExtent(feature);
    const geometry = feature?.getGeometry?.() || feature?.geometry || null;

    return {
        id: String(context.id || extractFeatureId(feature, context.index || 0)),
        featureId: String(context.id || extractFeatureId(feature, context.index || 0)),
        layerId: String(context.layerId || ''),
        layerName: String(context.layerName || ''),
        sourceType: String(context.sourceType || 'upload'),
        geometryType,
        geometry,
        extent,
        properties: flattened,
        rawAttributes,
        statistics: buildRecordStatistics(flattened),
    };
}

function normalizeLayerAttributeSnapshot(layer = {}, previousSnapshot = null) {
    const layerId = String(layer?.id || layer?.layerId || '').trim();
    const layerName = String(layer?.name || layer?.layerName || '未命名图层');
    const sourceType = String(layer?.sourceType || previousSnapshot?.sourceType || 'upload');
    const features = Array.isArray(layer?.features) ? layer.features : [];
    const layerMetadata = isPlainObject(layer?.metadata) ? layer.metadata : {};
    const fallbackMetadata = isPlainObject(layer?.standardTocItem?.metadata)
        ? layer.standardTocItem.metadata
        : {};
    const metadata = normalizeLayerMetadata(
        {
            ...(fallbackMetadata || {}),
            ...(layerMetadata || {}),
        },
        features,
    );

    const records = features.length
        ? features.map((feature, index) =>
              normalizeFeatureRecord(feature, {
                  id: extractFeatureId(feature, index),
                  index,
                  layerId,
                  layerName,
                  sourceType,
                  geometryType: layer?.geometryType || metadata?.geometryType || 'unknown',
              }),
          )
        : [];

    if (!records.length) {
        const syntheticAttributes = flattenAttributes({
            ...(fallbackMetadata || {}),
            ...(layerMetadata || {}),
            ...(layer?.statistics || {}),
        });

        if (Object.keys(syntheticAttributes).length) {
            records.push({
                id: `${layerId || 'layer'}__metadata`,
                featureId: `${layerId || 'layer'}__metadata`,
                layerId,
                layerName,
                sourceType,
                geometryType: String(
                    layer?.geometryType || layer?.type || metadata?.geometryType || 'raster',
                ).toLowerCase(),
                geometry: null,
                extent: null,
                properties: syntheticAttributes,
                rawAttributes: safeClone({
                    ...(fallbackMetadata || {}),
                    ...(layerMetadata || {}),
                    ...(layer?.statistics || {}),
                }),
                statistics: {
                    valueCount: Object.keys(syntheticAttributes).length,
                    typeCounts: { string: 0, number: 0, date: 0, boolean: 0, object: 0, null: 0 },
                    numericSummary: { count: 0, sum: 0, avg: 0, min: null, max: null },
                },
            });
        }
    }

    const previousFieldConfig = previousSnapshot?.fieldConfig || layer?.fieldConfig || {};
    const fieldConfig = buildFieldConfig(records, previousFieldConfig);
    const geometryTypeCounts = records.reduce((acc, record) => {
        const key = String(record.geometryType || 'unknown');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const aggregatedStatistics = records.reduce(
        (acc, record) => {
            acc.valueCount += Number(record.statistics?.valueCount || 0);
            acc.typeCounts = mergeTypeCounts(acc.typeCounts, record.statistics?.typeCounts || {});
            acc.numericSummary.count += Number(record.statistics?.numericSummary?.count || 0);
            acc.numericSummary.sum += Number(record.statistics?.numericSummary?.sum || 0);
            if (record.statistics?.numericSummary?.min !== null) {
                acc.numericSummary.min =
                    acc.numericSummary.min === null
                        ? record.statistics.numericSummary.min
                        : Math.min(acc.numericSummary.min, record.statistics.numericSummary.min);
            }
            if (record.statistics?.numericSummary?.max !== null) {
                acc.numericSummary.max =
                    acc.numericSummary.max === null
                        ? record.statistics.numericSummary.max
                        : Math.max(acc.numericSummary.max, record.statistics.numericSummary.max);
            }
            return acc;
        },
        {
            rowCount: records.length,
            valueCount: 0,
            fieldCount: Object.keys(fieldConfig).length,
            geometryTypeCounts,
            typeCounts: { string: 0, number: 0, date: 0, boolean: 0, object: 0, null: 0 },
            numericSummary: { count: 0, sum: 0, avg: 0, min: null, max: null },
        },
    );

    if (aggregatedStatistics.numericSummary.count > 0) {
        aggregatedStatistics.numericSummary.avg =
            aggregatedStatistics.numericSummary.sum / aggregatedStatistics.numericSummary.count;
    }

    return {
        id: layerId,
        layerId,
        layerName,
        sourceType,
        geometryType: String(
            layer?.geometryType || metadata?.geometryType || records[0]?.geometryType || 'unknown',
        ),
        metadata,
        rows: records,
        records,
        fieldConfig,
        statistics: aggregatedStatistics,
    };
}

export function createLayerMetadataNormalizationFeature() {
    return {
        flattenAttributes,
        inferValueType,
        normalizeFeatureRecord,
        normalizeLayerAttributeSnapshot,
        getFeatureRepresentativeLonLat,
        inferLayerRepresentativeLonLat,
        normalizeLayerMetadata,
    };
}
