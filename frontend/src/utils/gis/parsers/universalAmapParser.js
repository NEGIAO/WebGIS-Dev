/**
 * amapParser.js - 高德数据解析专用工具
 */
import { gcj02ToWgs84 } from '../../coordTransform'; // 确保路径正确

// --- 私有工具函数 (不导出) ---
function createParserError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function parsePayloadToObject(payload) {
    if (payload && typeof payload === 'object') return payload;
    const text = String(payload || '').trim();
    if (!text) throw createParserError('EMPTY', '内容为空');
    
    // 尝试解析 JSON 或 JSONP
    try {
        const direct = JSON.parse(text);
        if (direct) return direct;
    } catch (e) {}

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
            return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
        } catch (e) {}
    }
    throw createParserError('INVALID_JSON', '不是有效的 JSON');
}

function parseLngLatPair(text) {
    const parts = String(text || '').split(',');
    if (parts.length < 2) return null;
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    return [lng, lat];
}

function closeRingIfNeeded(ring = []) {
    if (ring.length < 3) return [];
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    return ring.length >= 4 ? ring : [];
}

// 关键增强：兼容多分隔符的坐标解析
function parseShapeToGcjRings(shape = '') {
    const text = String(shape || '').trim();
    if (!text) return [];
    // 自动判断分隔符：下划线或分号
    const pointSep = text.includes('_') ? '_' : ';';
    return text.split('|').map(r => r.trim()).filter(Boolean)
        .map(r => r.split(pointSep).map(p => parseLngLatPair(p)).filter(Boolean))
        .map(r => closeRingIfNeeded(r))
        .filter(r => r.length >= 4);
}

function convertGcjRingsToWgs84(gcjRings = []) {
    return gcjRings.map(ring => ring.map(pt => gcj02ToWgs84(pt[0], pt[1])));
}

// --- 公共导出函数 ---

/**
 * 逻辑1：解析高德详情数据 (原本的逻辑)
 */
export function parseAmapDetailAoi(payload) {
    const data = parsePayloadToObject(payload);
    const aoiNode = data?.data?.spec?.mining_shape || data?.spec?.mining_shape || data?.pois?.[0]?.spec?.mining_shape || {};
    const shape = aoiNode.shape || data?.pois?.[0]?.biz_ext?.aoi || '';
    
    const ringsGcj02 = parseShapeToGcjRings(shape);
    if (!ringsGcj02.length) throw createParserError('NO_SHAPE', '未发现边界');

    return {
        poiid: data?.data?.base?.poiid || data?.pois?.[0]?.id || '',
        name: data?.data?.base?.name || data?.pois?.[0]?.name || '',
        ringsGcj02,
        ringsWgs84: convertGcjRingsToWgs84(ringsGcj02),
        source: 'detail'
    };
}

/**
 * 逻辑2：解析高德搜索 AOI 数据 (你新增的逻辑)
 */
export function parseAmapSearchAoi(payload) {
    const data = parsePayloadToObject(payload);
    const aoiNode = data?.aois?.[0] || {};
    const shape = aoiNode.polyline || '';
    
    const ringsGcj02 = parseShapeToGcjRings(shape);
    if (!ringsGcj02.length) throw createParserError('NO_SHAPE', '未发现边界');

    return {
        poiid: aoiNode.id || '',
        name: aoiNode.name || '',
        ringsGcj02,
        ringsWgs84: convertGcjRingsToWgs84(ringsGcj02),
        source: 'search-api'
    };
}

/**
 * 逻辑3：解析标准 GeoJSON 数据
 * 有问题，展示先放着，当用户输入的是标准的geojson的时候，由于优先判断前两个逻辑，导致无法正确解析，后续需要调整逻辑顺序，或者在前两个逻辑中增加对输入格式的判断，确保只有真正的高德数据才走前两个逻辑，其他的都走标准geojson的解析逻辑。
 */ 
export function parseStandardGeoJson(payload) {
    const data = parsePayloadToObject(payload);
    
    // 检查是否是 FeatureCollection
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw createParserError('NOT_GEOJSON', '不是有效的 FeatureCollection GeoJSON');
    }
    
    if (data.features.length === 0) {
        throw createParserError('NO_FEATURES', 'GeoJSON 中没有要素');
    }
    
    // 收集所有有效的Polygon几何
    const rings = [];
    let poiid = '';
    let name = '';
    
    data.features.forEach((feature, index) => {
        if (feature.type !== 'Feature') return;
        
        const geometry = feature.geometry;
        if (!geometry) return;
        
        // 提取属性
        if (!poiid && feature.properties) {
            poiid = feature.properties.id || feature.properties.poiid || feature.properties.ID || '';
        }
        if (!name && feature.properties) {
            name = feature.properties.name || feature.properties.Name || '';
        }
        
        // 处理 Polygon 几何
        if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
            const polygonRings = geometry.coordinates;
            polygonRings.forEach(ring => {
                if (Array.isArray(ring)) {
                    // GeoJSON 坐标格式是 [lng, lat]，直接转换为 [[lng, lat], ...]
                    const convertedRing = ring.map(coord => {
                        if (Array.isArray(coord) && coord.length >= 2) {
                            return [
                                parseFloat(coord[0]),
                                parseFloat(coord[1])
                            ];
                        }
                        return null;
                    }).filter(pt => pt !== null && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
                    
                    const closedRing = closeRingIfNeeded(convertedRing);
                    if (closedRing.length >= 4) {
                        rings.push(closedRing);
                    }
                }
            });
        }
        
        // 处理 MultiPolygon 几何
        if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
            geometry.coordinates.forEach(polygon => {
                if (Array.isArray(polygon)) {
                    polygon.forEach(ring => {
                        if (Array.isArray(ring)) {
                            const convertedRing = ring.map(coord => {
                                if (Array.isArray(coord) && coord.length >= 2) {
                                    return [
                                        parseFloat(coord[0]),
                                        parseFloat(coord[1])
                                    ];
                                }
                                return null;
                            }).filter(pt => pt !== null && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
                            
                            const closedRing = closeRingIfNeeded(convertedRing);
                            if (closedRing.length >= 4) {
                                rings.push(closedRing);
                            }
                        }
                    });
                }
            });
        }
    });
    
    if (!rings.length) {
        throw createParserError('NO_GEOMETRY', '未发现有效的 Polygon 几何');
    }
    
    // GeoJSON中的坐标通常是 WGS84，不是 GCJ02
    // 假设输入的 GeoJSON 已经是 WGS84 坐标系
    return {
        poiid: poiid || '',
        name: name || '标准GeoJSON',
        ringsGcj02: rings,  // 先用 GeoJSON 坐标直接作为 ringsGcj02
        ringsWgs84: rings,  // 假设输入已是 WGS84，所以 ringsWgs84 = rings
        source: 'standard-geojson'
    };
}

/**
 * 逻辑4：万能解析入口 (兜底逻辑)
 */
export function universalAmapParser(payload) {
    try {
        return parseAmapDetailAoi(payload);
    } catch (e) {
        try {
            return parseAmapSearchAoi(payload);
        } catch (e2) {
            try {
                return parseStandardGeoJson(payload);
            } catch (e3) {
                throw new Error('所有解析尝试均已失败，请检查输入格式（支持高德详情、高德搜索AOI或标准GeoJSON）');
            }
        }
    }
}