/**
 * ArcGIS REST 地图服务适配（…/MapServer）
 *
 * 四件事：元数据（f=json）解析、点查（/{layer}/query 与 /identify）、
 * 切片与动态出图模板、以及 REST 不可达时回退 WMS 端点的探测。
 */

import { formatDateEpoch } from '@common/utils/datetime';
import type { ServiceRequestOptions, WmsServiceInfo } from './types';
import { isValidLonLatBbox, MERCATOR_HALF_WORLD, mercatorToLonLat, WEB_MERCATOR_MAX_EXTENT } from './geoBbox';
import {
    appendCapabilitiesParams,
    buildArcgisWmsCandidates,
    looksLikeCapabilitiesXml,
    matchArcgisRestServiceUrl,
} from './urlDetect';
import { fetchCapabilitiesText, requestServiceJson } from './transport';

/**
 * 解析 ArcGIS REST 服务元数据（…/MapServer?f=json）
 * 只需 Map 能力即可访问（与 ArcGIS Pro 同源协议），无需 WMS
 */
export function parseArcgisServiceJson(jsonText: string, baseUrl: string): WmsServiceInfo {
    let meta;
    try {
        meta = JSON.parse(String(jsonText || ''));
    } catch {
        throw new Error('ArcGIS 服务元数据 JSON 解析失败');
    }
    // HTML 错误页 / 无效服务防御
    if (!meta || typeof meta !== 'object' || (!Array.isArray(meta.layers) && !meta.mapName && !meta.serviceDescription)) {
        throw new Error('响应不是有效的 ArcGIS 服务元数据');
    }

    const layerOptions = [{ name: '', label: '默认（全部可见图层）', title: '', path: '' }];
    for (const layer of Array.isArray(meta.layers) ? meta.layers : []) {
        if (!layer || layer.id == null) continue;
        const name = String(layer.name ?? layer.id);
        layerOptions.push({
            name: String(layer.id),
            title: name,
            path: '',
            label: `${name} (${layer.id})`,
        });
    }

    const fullExtent = arcgisExtentToLonLat(meta.fullExtent);
    // 切片方案判定：标准墨卡托网格 → 直连 /tile/{z}/{y}/{x}（缺失瓦片为 404，按透明处理）；
    // 否则（如 GCS 缓存/非标准 LOD）走 export 动态出图
    const standardTiles = isStandardMercatorTileScheme(meta.tileInfo);
    const lods = Array.isArray(meta.tileInfo?.lods) ? meta.tileInfo.lods : [];
    const maxLevel = Number(lods.at(-1)?.level);

    return {
        layers: '',
        // 空 LAYERS = 服务默认可见图层（与 ArcGIS Pro 行为一致）
        title: String(meta.mapName || meta.serviceDescription || ''),
        layerOptions,
        geographicBbox: isValidLonLatBbox(fullExtent) ? fullExtent : null,
        arcgis: true,
        queryable: /query/i.test(String(meta.capabilities || '')),
        tiled: Boolean(meta.tileInfo),
        tileMode: standardTiles ? 'tiles' : 'export',
        maxLevel: Number.isFinite(maxLevel) ? maxLevel : undefined,
        version: String(meta.currentVersion || ''),
        format: 'image/png',
        crsList: [],
        srs: 'EPSG:3857',
        mercator: true,
        endpoint: baseUrl,
        source: 'arcgis-json',
    };
}

/**
 * ArcGIS REST 点查：按子图层精确查询指定经纬度处的要素属性。
 * 使用 /{layerId}/query 端点（非 identify）—— 每层独立请求、无歧义，
 * 只返回该层在该点的要素，与地图渲染的图层一一对应。
 *
 * @param {Object} [requestOptions] 请求策略（见 requestServiceJson）
 */
export async function queryArcgisLayerAtPoint(
    endpoint: string,
    layerId: string,
    lon: number,
    lat: number,
    requestOptions: ServiceRequestOptions = {},
): Promise<Array<{ attributes: Record<string, any> }> | null> {
    const base = String(endpoint || '').replace(/\/+$/, '');
    if (!base || !layerId) return null;

    const qs = new URLSearchParams({
        geometry: JSON.stringify({ x: Number(lon), y: Number(lat) }),
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'false',
        resultRecordCount: '20',
        f: 'json',
    });

    const data = await requestServiceJson(`${base}/${layerId}/query?${qs}`, requestOptions);
    if (data?.error) throw new Error(data.error.message || '服务端查询错误');

    const features = (Array.isArray(data?.features) ? data.features : []).map((f: any) => ({
        attributes: alignAttributesForDisplay(f?.attributes, data),
    }));
    return features;
}

/** 属性对象归一化：非纯对象（null/原始值）一律落空表，杜绝下游 Object.entries 抛错 */
function normalizeFeatureAttributes(value: any): Record<string, any> {
    return value && typeof value === 'object' ? value : {};
}

// ==================== 字段展示对齐：别名映射 + 日期格式化 ====================
// ArcGIS /query 响应自带 fieldAliases 与 fields[].{name,alias,type}，
// 直接展示原始键名（tbbm/ysdm…）不可读 —— 统一在此层对齐为业务别名。

const DATE_FIELD_TYPE = 'esriFieldTypeDate';

/** 从响应提取 字段名 → 别名 映射（fieldAliases 优先，fields[].alias 补充） */
function buildFieldAliasMap(data: any): Record<string, string> {
    const map: Record<string, string> = {};
    if (!data || typeof data !== 'object') return map;
    const fieldAliases = data.fieldAliases;
    if (fieldAliases && typeof fieldAliases === 'object') {
        for (const [name, alias] of Object.entries(fieldAliases)) {
            if (name && alias && typeof alias === 'string') map[name] = alias;
        }
    }
    if (Array.isArray(data.fields)) {
        for (const field of data.fields) {
            if (field?.name && field?.alias && !map[field.name]) map[field.name] = String(field.alias);
        }
    }
    return map;
}

/** 从响应提取 字段名 → 是否日期型（esriFieldTypeDate） */
function buildDateFieldSet(data: any): Set<string> {
    const set = new Set<string>();
    if (Array.isArray(data?.fields)) {
        for (const field of data.fields) {
            if (field?.name && field?.type === DATE_FIELD_TYPE) set.add(field.name);
        }
    }
    return set;
}

// formatDateEpoch 单源实现见 @common/utils/datetime

/**
 * 属性键名对齐为服务端声明的业务别名（如 tbbm → 图斑编号）；
 * 未声明别名的字段保留原名；日期型字段值格式化为可读时间。
 */
function alignAttributesForDisplay(attributes: any, data: any): Record<string, any> {
    const aliases: Record<string, string> = buildFieldAliasMap(data);
    const dateFields: Set<string> = buildDateFieldSet(data);
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(normalizeFeatureAttributes(attributes))) {
        out[aliases[key] || key] = dateFields.has(key) ? formatDateEpoch(value) : value;
    }
    return out;
}

/**
 * 点查统一入口（OL / Cesium 双引擎共用）：单个查询候选 → 归一化命中集。
 *
 * 候选结构：{ info, subLayerName?, serviceTitle }
 * - 带 subLayerName（注册表候选）→ /{layerId}/query 逐层精确点查，与渲染图层一一对应；
 *   服务端正常无命中返回 { hits: [] }（非错误），网络失败/服务端 error 向上抛错
 * - 无 subLayerName（自定义底图旧通道候选）→ identify 全量语义（服务端返回当前可见层的命中）
 *
 * @param {Object} candidate 查询候选
 * @param {[number,number]} lonLat [lon, lat] EPSG:4326
 * @param {Object} view identify 回退路径消费的视图参数 { extent:[w,s,e,n], width, height }
 * @param {{timeoutMs?:number, buildProxyUrl?:(url:string)=>string|null}} [requestOptions]
 *        请求策略：直连失败时经 buildProxyUrl 构造后端代理地址重试（与瓦片同通道）
 * @returns {Promise<{candidate:Object, hits:Array<{layerName:string,attributes:Object}>}>}
 *          candidate 原样回传 —— 引擎侧统一按 `const { candidate, hits } = result` 消费
 */
export async function queryCandidateAtPoint(
    candidate: any,
    lonLat: [number, number],
    view: Record<string, any> = {},
    requestOptions: ServiceRequestOptions = {},
): Promise<{ candidate: any; hits: Array<{ layerName: string; attributes: Record<string, any> }> }> {
    const lon = Number(lonLat?.[0]);
    const lat = Number(lonLat?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new Error('查询坐标无效');
    }

    // 自定义底图通道：无具体子层 → 走 identify（服务端裁决全部可见层）
    if (!candidate?.subLayerName) {
        const outcome = await identifyArcgisFeatures(candidate?.info, [lon, lat], view, {
            request: requestOptions,
        });
        if (outcome.error) throw new Error(outcome.error);
        return {
            candidate,
            hits: (outcome.results || []).map((result) => ({
                layerName: String(result.layerName ?? ''),
                attributes: normalizeFeatureAttributes(result.attributes),
            })),
        };
    }

    // 注册表通道：逐层精确点查（queryArcgisLayerAtPoint 对空 endpoint/layerId 返回 null）
    const features = await queryArcgisLayerAtPoint(
        candidate.info?.endpoint,
        candidate.subLayerName,
        lon,
        lat,
        requestOptions,
    );
    return {
        candidate,
        hits: (features || []).map((feature) => ({
            layerName: String(candidate.subLayerName),
            attributes: normalizeFeatureAttributes(feature?.attributes),
        })),
    };
}
export async function identifyArcgisFeatures(
    info: any,
    lonLat: any,
    view: Record<string, any> = {},
    opts: Record<string, any> = {},
): Promise<{ error?: string; results?: Array<{ layerName: string; value: string; attributes: Record<string, any> }> }> {
    if (!info?.arcgis || !info.queryable) {
        return { error: '该服务未开放 Query 能力' };
    }
    const [lon, lat] = (lonLat || []).map(Number);
    const extent = Array.isArray(view?.extent) ? view.extent.map(Number) : [];
    const width = Number(view?.width);
    const height = Number(view?.height);
    if (![lon, lat].every(Number.isFinite) || extent.length !== 4 || !extent.every(Number.isFinite) ||
        !Number.isFinite(width) || !Number.isFinite(height)) {
        return { error: '查询参数不完整' };
    }

    const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : 3;
    const layerId = String(opts.layerId ?? '').trim();

    // 参与识别的子图层集合：
    // - 显式单层 → top:{id}
    // - 勾选组合数组（可为空）→ top:{id1,id2,…}：仅返回这些层中视觉最上层的命中；
    //   空数组 = 全部未勾选 → 直接返回空结果
    // - 未传数组（undefined）→ all（兼容旧调用）
    const selectedList = Array.isArray(opts.selectedIds)
        ? opts.selectedIds.map((item: any) => String(item)).filter(Boolean)
        : null;
    if (selectedList !== null && !selectedList.length) {
        return { results: [] };
    }
    let layersParam;
    if (layerId) layersParam = `top:${layerId}`;
    else if (selectedList?.length) layersParam = `top:${selectedList.join(',')}`;
    else layersParam = 'all';

    const base = `${String(info.endpoint).replace(/\/+$/, '')}/identify`;
    const qs = [
        `geometry=${lon},${lat}`,
        'geometryType=esriGeometryPoint',
        'sr=4326',
        `layers=${layersParam}`,
        `tolerance=${tolerance}`,
        `mapExtent=${extent.join(',')}`,
        `imageDisplay=${width},${height},96`,
        'returnGeometry=false',
        'f=json',
    ];

    try {
        const data = await requestServiceJson(`${base}?${qs.join('&')}`, opts.request);
        if (data?.error) return { error: data.error.message || '服务端查询错误' };
        const results = (Array.isArray(data?.results) ? data.results : []).map((item: any) => ({
            layerName: String(item?.layerName ?? ''),
            value: String(item?.value ?? ''),
            attributes: alignAttributesForDisplay(item?.attributes, data),
        }));
        return { results };
    } catch (error: unknown) {
        console.warn('[wmsService] identify 失败:', error);
        return { error: error instanceof Error ? error.message : '网络请求失败' };
    }
}

/**
 * 构建 ArcGIS 切片直连模板（仅 tileMode==='tiles' 时有效）
 * 缺失瓦片服务端返回 404，客户端按透明处理
 */
export function buildArcgisTileTemplate(info: any): string {
    return `${String(info?.endpoint || '').replace(/\/+$/, '')}/tile/{z}/{y}/{x}`;
}

/**
 * 构建 ArcGIS 动态出图 URL 模板（引擎共用）
 * 占位符 {minx}{miny}{maxx}{maxy}{w}{h} 由各引擎的瓦片回调填充（EPSG:3857 米制）
 *
 * 注意：查询串必须手工拼接 —— URLSearchParams 会把 {token} 编码成 %7B...%7D，
 * 导致后续占位符替换永远落空，服务端收到字面量 "{w}" 的非法参数。
 *
 * @param {Object} info ensureWmsServiceInfo 返回的 arcgis 信息
 * @param {string} selectedLayer 选中的图层 id；空串表示全部默认可见图层
 */
export function buildArcgisExportTemplate(info: any, selectedLayer = ''): string {
    const base = `${String(info?.endpoint || '').replace(/\/+$/, '')}/export`;
    const parts = [
        'bboxSR=3857',
        'imageSR=3857',
        'size={w},{h}',
        `format=${info?.format || 'image/png'}`,
        'transparent=true',
        'f=image',
    ];
    const layer = String(selectedLayer || '').trim();
    if (layer) {
        // 多图层叠加同样合法：支持 "show:0,1,2" 形式透传
        parts.push(`LAYERS=show:${layer}`);
    }
    parts.push('bbox={minx},{miny},{maxx},{maxy}');
    return `${base}?${parts.join('&')}`;
}

/** 按瓦片坐标(北起 y)渲染 export 模板中的 bbox 占位符 */
export function renderArcgisTileUrl(
    template: string,
    z: number,
    x: number,
    y: number,
    tileSizePx = 256,
): string {
    const extentSize = (2 * WEB_MERCATOR_MAX_EXTENT) / 2 ** z;
    const minx = -WEB_MERCATOR_MAX_EXTENT + x * extentSize;
    const maxx = minx + extentSize;
    const maxy = WEB_MERCATOR_MAX_EXTENT - y * extentSize;
    const miny = maxy - extentSize;
    return template
        .replace('{minx}', minx.toFixed(2))
        .replace('{miny}', miny.toFixed(2))
        .replace('{maxx}', maxx.toFixed(2))
        .replace('{maxy}', maxy.toFixed(2))
        .replaceAll('{w}', String(tileSizePx))
        .replaceAll('{h}', String(tileSizePx));
}

export async function probeArcgisWmsEndpoint(rawUrl: string): Promise<{ endpoint: string; xmlText: string } | null> {
    const matched = matchArcgisRestServiceUrl(rawUrl);
    if (!matched) return null;

    for (const path of buildArcgisWmsCandidates(matched.servicePath)) {
        const endpoint = `${matched.origin}${path}`;
        try {
            const xmlText = await fetchCapabilitiesText(appendCapabilitiesParams(endpoint));
            if (!looksLikeCapabilitiesXml(xmlText)) continue;
            return { endpoint, xmlText };
        } catch {
            // 候选不可达，继续下一个
        }
    }
    return null;
}

/** ArcGIS fullExtent（含空间参考）→ 经纬度 bbox；不支持投影时返回 null */
function arcgisExtentToLonLat(extent: any): number[] | null {
    if (!extent || typeof extent !== 'object') return null;
    const nums = [extent.xmin, extent.ymin, extent.xmax, extent.ymax].map(Number);
    if (!nums.every((v) => Number.isFinite(v))) return null;
    const sr = extent.spatialReference || {};
    const wkid = Number(sr.latestWkid ?? sr.wkid ?? NaN);
    if (wkid === 4326) return nums;
    if ([3857, 900913, 102100, 102113].includes(wkid)) {
        const [lonMin, latMin] = mercatorToLonLat(nums[0], nums[1]);
        const [lonMax, latMax] = mercatorToLonLat(nums[2], nums[3]);
        return [lonMin, latMin, lonMax, latMax];
    }
    return null;
}

/**
 * 判断切片方案是否为标准 Web 墨卡托 XYZ 网格
 * （origin 左上角 -20037508.34, 20037508.34；256px；level0 res≈156543.03 且逐层折半）
 * 满足时可直接用 /tile/{z}/{y}/{x} 模板，无需动态 export（托管切片服务 export 会 500）
 */
function isStandardMercatorTileScheme(tileInfo: any): boolean {
    if (!tileInfo || typeof tileInfo !== 'object') return false;
    const sr = tileInfo.spatialReference || {};
    const wkid = Number(sr.latestWkid ?? sr.wkid ?? NaN);
    if (![3857, 102100, 900913].includes(wkid)) return false;
    if (Number(tileInfo.rows) !== 256 || Number(tileInfo.cols) !== 256) return false;

    const originX = Number(tileInfo.origin?.x);
    const originY = Number(tileInfo.origin?.y);
    if (!Number.isFinite(originX) || !Number.isFinite(originY)) return false;
    if (Math.abs(originX + MERCATOR_HALF_WORLD) > 1 || Math.abs(originY - MERCATOR_HALF_WORLD) > 1) {
        return false;
    }

    const lods = Array.isArray(tileInfo.lods) ? tileInfo.lods : [];
    if (!lods.length) return false;
    const baseRes = Number(lods[0]?.resolution);
    if (!Number.isFinite(baseRes) || Math.abs(baseRes - 156543.033928) > baseRes * 0.001) {
        return false;
    }
    // 抽查前几级是否逐层折半（防非标准 LOD 序列混入）
    for (let i = 1; i < Math.min(lods.length, 5); i++) {
        const expect = baseRes / 2 ** i;
        if (Math.abs(Number(lods[i]?.resolution) - expect) > expect * 0.001) return false;
    }
    return true;
}
