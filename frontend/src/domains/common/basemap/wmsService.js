/**
 * 通用 WMS 服务元数据解析 — 引擎无关（OL / Cesium 共用）
 *
 * 职责：
 * - isWmsServiceUrl / matchArcgisRestServiceUrl / looksLikeWmsSourceUrl:
 *   识别标准 WMS 特征 URL 与 ArcGIS REST 服务端点（…/MapServer）
 * - ensureWmsServiceInfo: 拉取并解析 GetCapabilities，产出全部可选图层(layerOptions)、
 *   默认图层(layers)、版本、格式、坐标系策略等信息；
 *   ArcGIS REST 地址会自动探测候选 WMS 端点（<ctx>services/.../WmsServer 优先）
 * - getCachedWmsInfo: 同步读取已解析的缓存（未命中返回 null）
 *
 * 注意：common 域不得反向依赖 @ol，此处用 DOMParser 自行解析最小化字段。
 */

const WMS_INFO_CACHE = new Map();
const CAPABILITIES_FETCH_TIMEOUT_MS = 10000;

/** Web 墨卡托常见 CRS 代号 */
const MERCATOR_CRS_PATTERN = /^(EPSG(:|\/)?(3857|900913|102100|102113)|OSGEO:41001)$/i;
/** 地理坐标（经纬度）常见 CRS 代号 */
const GEOGRAPHIC_CRS_PATTERN = /^(CRS:?84|EPSG:?4326|EPSG:?4269|EPSG:?4258)$/i;

/**
 * 判断 URL 是否为 WMS 服务特征
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isWmsServiceUrl(rawUrl) {
    const source = String(rawUrl || '').trim();
    if (!source) return false;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const parsed = new URL(source, base);
        const queryValue = (name) => {
            for (const [key, value] of parsed.searchParams.entries()) {
                if (key.toUpperCase() === name) return String(value || '').toUpperCase();
            }
            return '';
        };
        if (queryValue('SERVICE') === 'WMS') return true;
        const request = queryValue('REQUEST');
        if (request === 'GETMAP' || request === 'GETCAPABILITIES') return true;
        return /wms/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

/**
 * 识别 ArcGIS REST 地图服务端点（…/MapServer）
 * 用户通常只粘贴 REST 地址，WMS 端点需要探测换算
 *
 * @returns {{origin: string, servicePath: string} | null} servicePath 已剥离查询参数与尾斜杠
 */
export function matchArcgisRestServiceUrl(rawUrl) {
    const source = String(rawUrl || '').trim();
    if (!source) return null;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const urlObj = new URL(source, base);
        if (!/^https?:$/i.test(urlObj.protocol)) return null;
        const cleanPath = urlObj.pathname.replace(/\/+$/, '');
        if (!/\/mapserver\/?$/i.test(cleanPath)) return null;
        return { origin: urlObj.origin, servicePath: cleanPath };
    } catch {
        return null;
    }
}

/** 是否为可解析出 WMS 图源的 URL（标准 WMS 特征 或 ArcGIS REST 服务端点） */
export function looksLikeWmsSourceUrl(rawUrl) {
    return isWmsServiceUrl(rawUrl) || Boolean(matchArcgisRestServiceUrl(rawUrl));
}

/**
 * 由 REST 地址生成候选 WMS 端点（按命中率排序）：
 * 1. <ctx>/rest/services/X/MapServer → <ctx>services/X/MapServer/WmsServer（Esri 规范路径）
 * 2. 原地址 + /WMSServer（新版 ArcGIS 在启用 WMS 后开放）
 * 3. 原地址 + /WmsServer
 */
function buildArcgisWmsCandidates(servicePath) {
    const restMatch = servicePath.match(/^(.*\/)rest\/(services\/.+)$/i);
    if (restMatch) {
        return [
            `${restMatch[1]}${restMatch[2]}/WmsServer`,
            `${servicePath}/WMSServer`,
            `${servicePath}/WmsServer`,
        ];
    }
    return [`${servicePath}/WmsServer`, `${servicePath}/WMSServer`];
}

function appendCapabilitiesParams(urlStr) {
    try {
        const parsed = new URL(urlStr);
        setParamIgnoreCase(parsed.searchParams, 'SERVICE', 'WMS');
        setParamIgnoreCase(parsed.searchParams, 'REQUEST', 'GetCapabilities');
        return parsed.toString();
    } catch {
        return urlStr;
    }
}

/** 粗校验响应确为 WMS Capabilities，而非 HTML 错误页 */
function looksLikeCapabilitiesXml(xmlText) {
    return /<(WMS_Capabilities|WMT_MS_Capabilities)[\s>]/i.test(String(xmlText || '').slice(0, 500));
}

/**
 * 解析 ArcGIS REST 服务元数据（…/MapServer?f=json）
 * 只需 Map 能力即可访问（与 ArcGIS Pro 同源协议），无需 WMS
 */
function parseArcgisServiceJson(jsonText, baseUrl) {
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
export async function queryArcgisLayerAtPoint(endpoint, layerId, lon, lat, requestOptions = {}) {
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

    const features = (Array.isArray(data?.features) ? data.features : []).map((f) => ({
        attributes: alignAttributesForDisplay(f?.attributes, data),
    }));
    return features;
}

// ==================== 点查请求通道：超时 + 后端代理兜底 ====================
// 背景：目标服务常无 CORS 头（瓦片正是靠后端 /proxy/{url} 兜底才能加载）。
// 点查若裸直连，被拦/预检挂起时 Promise 永不 settle → UI 永久停留「查询中」。
// 因此所有点查请求统一走本通道：
//   1. AbortController 硬超时 —— 保证请求必然落地（成功/失败），UI 状态必然推进
//   2. 直连失败且调用方提供 buildProxyUrl 时 → 后端 /proxy/{url} 重试一次（与瓦片同通道）

/** 单次请求硬超时（毫秒） */
const POINT_QUERY_TIMEOUT_MS = 10000;

/**
 * 带超时的单次 JSON 请求；返回 { ok, status, text }，网络异常向上抛。
 * 失败仅 console.warn 留痕（含超时与原始错误），成功路径零日志。
 */
async function fetchJsonText(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
    } catch (error) {
        const reason = error?.name === 'AbortError' ? `超时(${timeoutMs}ms)` : (error?.message || '网络异常');
        console.warn('[Identify][fail]', reason, url);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 服务端 JSON 请求统一通道
 *
 * @param {string} url 完整请求地址
 * @param {{timeoutMs?:number, buildProxyUrl?:(url:string)=>string|null}} [options]
 *   - timeoutMs 单次请求超时（默认 10s）
 *   - buildProxyUrl 直连失败时的后端代理地址构造器（与瓦片 /proxy/{url} 同通道）；不传则直连失败即抛
 * @returns {Promise<Object>} 解析后的 JSON
 */
async function requestServiceJson(url, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : POINT_QUERY_TIMEOUT_MS;

    let direct;
    try {
        direct = await fetchJsonText(url, timeoutMs);
        if (!direct.ok) return Promise.reject(new Error(`服务响应异常（HTTP ${direct.status}）`));
        try {
            return JSON.parse(direct.text);
        } catch {
            // 响应可达但非 JSON（登录页/错误页等）→ 走代理重试通道
            throw new Error('响应非 JSON');
        }
    } catch (directError) {
        const proxiedUrl = options.buildProxyUrl?.(url);
        if (!proxiedUrl || proxiedUrl === url) {
            if (directError?.message === '响应非 JSON') throw directError;
            const reason = directError?.name === 'AbortError' ? '请求超时' : '网络不可达或跨域被拦截(CORS)';
            throw new Error(reason);
        }
        const viaProxy = await fetchJsonText(proxiedUrl, timeoutMs);
        if (!viaProxy.ok) throw new Error(`服务响应异常（HTTP ${viaProxy.status}，代理通道）`);
        try {
            return JSON.parse(viaProxy.text);
        } catch {
            throw new Error('代理通道响应非 JSON');
        }
    }
}

/** 属性对象归一化：非纯对象（null/原始值）一律落空表，杜绝下游 Object.entries 抛错 */
function normalizeFeatureAttributes(value) {
    return value && typeof value === 'object' ? value : {};
}

// ==================== 字段展示对齐：别名映射 + 日期格式化 ====================
// ArcGIS /query 响应自带 fieldAliases 与 fields[].{name,alias,type}，
// 直接展示原始键名（tbbm/ysdm…）不可读 —— 统一在此层对齐为业务别名。

const DATE_FIELD_TYPE = 'esriFieldTypeDate';

/** 从响应提取 字段名 → 别名 映射（fieldAliases 优先，fields[].alias 补充） */
function buildFieldAliasMap(data) {
    const map = {};
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
function buildDateFieldSet(data) {
    const set = new Set();
    if (Array.isArray(data?.fields)) {
        for (const field of data.fields) {
            if (field?.name && field?.type === DATE_FIELD_TYPE) set.add(field.name);
        }
    }
    return set;
}

/** 日期型字段值（epoch 毫秒）→ YYYY-MM-DD HH:mm:ss；非法值原样字符串返回 */
function formatDateEpoch(value) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return String(value ?? '');
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return String(value ?? '');
    const pad = (n) => String(n).padStart(2, '0');
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
}

/**
 * 属性键名对齐为服务端声明的业务别名（如 tbbm → 图斑编号）；
 * 未声明别名的字段保留原名；日期型字段值格式化为可读时间。
 */
function alignAttributesForDisplay(attributes, data) {
    const aliases = buildFieldAliasMap(data);
    const dateFields = buildDateFieldSet(data);
    const out = {};
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
export async function queryCandidateAtPoint(candidate, lonLat, view = {}, requestOptions = {}) {
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
export async function identifyArcgisFeatures(info, lonLat, view = {}, opts = {}) {
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
        ? opts.selectedIds.map((item) => String(item)).filter(Boolean)
        : null;
    if (Array.isArray(opts.selectedIds) && !selectedList.length) {
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
        const results = (Array.isArray(data?.results) ? data.results : []).map((item) => ({
            layerName: String(item?.layerName ?? ''),
            value: String(item?.value ?? ''),
            attributes: alignAttributesForDisplay(item?.attributes, data),
        }));
        return { results };
    } catch (error) {
        console.warn('[wmsService] identify 失败:', error);
        return { error: error?.message || '网络请求失败' };
    }
}

// Web 墨卡托常量：动态 export 模板按瓦片计算 BBOX
const WEB_MERCATOR_MAX_EXTENT = Math.PI * 6378137;

/**
 * 构建 ArcGIS 切片直连模板（仅 tileMode==='tiles' 时有效）
 * 缺失瓦片服务端返回 404，客户端按透明处理
 */
export function buildArcgisTileTemplate(info) {
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
export function buildArcgisExportTemplate(info, selectedLayer = '') {
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
export function renderArcgisTileUrl(template, z, x, y, tileSizePx = 256) {
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

async function probeArcgisWmsEndpoint(rawUrl) {
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

function queryValueIgnoreCase(urlObj, name) {
    for (const [key, value] of urlObj.searchParams.entries()) {
        if (key.toUpperCase() === name) return String(value || '').trim();
    }
    return '';
}

function directChild(node, tagName) {
    const children = node?.children || [];
    for (const child of children) {
        if (child.tagName === tagName) return child;
    }
    return null;
}

function textOf(node) {
    return String(node?.textContent || '').trim();
}

/** 从 Layer 元素及其祖先收集 CRS/SRS 声明 */
function collectLayerCrsList(layerNode) {
    const values = [];
    let current = layerNode;
    while (current) {
        for (const child of current.children || []) {
            if (child.tagName === 'CRS' || child.tagName === 'SRS') {
                const text = textOf(child);
                if (text) values.push(text);
            } else if (child.tagName === 'BoundingBox') {
                const crs = child.getAttribute('CRS') || child.getAttribute('SRS');
                if (crs) values.push(crs);
            }
        }
        current = current.parentElement;
    }
    return values;
}

function findFirstNamedLayer(root) {
    const layerNodes = root.getElementsByTagName('Layer');
    for (const node of Array.from(layerNodes)) {
        const nameNode = directChild(node, 'Name');
        if (nameNode && textOf(nameNode)) {
            const titleNode = directChild(node, 'Title');
            return { node, name: textOf(nameNode), title: textOf(titleNode) };
        }
    }
    return null;
}

/**
 * 递归枚举 Capabilities 中所有可选择的命名图层
 * 组图层（有 Name 的中间节点）同样可选择（服务端渲染全部子图层）
 */
function collectNamedLayerOptions(layerNode, parentPath = []) {
    const options = [];
    for (const child of layerNode?.children || []) {
        if (child.tagName !== 'Layer') continue;
        const name = textOf(directChild(child, 'Name'));
        const title = textOf(directChild(child, 'Title')) || name;
        if (!name) {
            // 无 Name 的纯分组节点：继续下钻，标题并入路径
            options.push(...collectNamedLayerOptions(child, [...parentPath, title]));
            continue;
        }
        options.push({
            name,
            title,
            path: parentPath.join(' / '),
            label: parentPath.length ? `${parentPath.join(' / ')} / ${title} (${name})` : `${title} (${name})`,
        });
        options.push(...collectNamedLayerOptions(child, [...parentPath, title]));
    }
    return options;
}

/** 去重并保证文档顺序（同名子分组先于后代出现时保留父项） */
function dedupeLayerOptions(options) {
    return options.filter(
        (option, index) => options.findIndex((item) => item.name === option.name) === index,
    );
}

function extractGetMapFormats(root) {
    const formats = [];
    // 直接找 GetMap 节点下的 Format 子元素（兼容大小写命名风格）
    for (const node of Array.from(root.getElementsByTagName('*'))) {
        if (!/getmap$/i.test(node.tagName)) continue;
        for (const child of node.children || []) {
            if (child.tagName === 'Format' && textOf(child)) formats.push(textOf(child));
        }
        if (formats.length) break;
    }
    return formats;
}

function pickPreferredFormat(formats) {
    return (
        formats.find((fmt) => /png/i.test(fmt)) ||
        formats.find((fmt) => /image/i.test(fmt)) ||
        'image/png'
    );
}

/**
 * 根据服务声明的 CRS 决定请求策略
 * 优先 Web 墨卡托（与 Cesium 默认瓦片方案一致），否则回退经纬度方案
 */
function resolveCrsStrategy(crsList, explicitSrs) {
    if (explicitSrs) {
        if (MERCATOR_CRS_PATTERN.test(explicitSrs)) return { srs: 'EPSG:3857', mercator: true };
        if (GEOGRAPHIC_CRS_PATTERN.test(explicitSrs)) return { srs: 'EPSG:4326', mercator: false };
    }
    const hasMercator = crsList.some((crs) => MERCATOR_CRS_PATTERN.test(crs));
    if (hasMercator) return { srs: 'EPSG:3857', mercator: true };
    const geographic = crsList.find((crs) => GEOGRAPHIC_CRS_PATTERN.test(crs));
    if (geographic) return { srs: 'EPSG:4326', mercator: false };
    return { srs: 'EPSG:3857', mercator: true };
}

/**
 * 定位 Capabilities 根图层节点
 * OGC 规范路径: WMS_Capabilities → Capability → Layer（注意不能只查文档根直接子级）
 */
function findRootCapabilityLayer(doc) {
    for (const child of doc.documentElement?.children || []) {
        if (child.tagName === 'Capability') {
            const rootLayer = directChild(child, 'Layer');
            if (rootLayer) return rootLayer;
        }
    }
    // 兜底：个别服务不规范时全文搜索第一个 Layer 节点
    return doc.getElementsByTagName('Layer')[0] || null;
}

/** 合成单条图层选项（枚举兜底用） */
function toSingleOption(name, title) {
    return { name, title: title || name, path: '', label: `${title || name} (${name})` };
}

// ---- 地理范围提取（统一归一化为 EPSG:4326 经纬度 [w,s,e,n]）----

function bboxUnion(target, box) {
    if (!Array.isArray(box) || box.length !== 4) return target;
    if (!box.every((v) => Number.isFinite(v))) return target;
    if (!target) return [...box];
    // 跨经度 180° 的病态范围直接丢弃，避免并集成全球条带
    if (box[2] < box[0] || box[3] < box[1]) return target;
    return [
        Math.min(target[0], box[0]),
        Math.min(target[1], box[1]),
        Math.max(target[2], box[2]),
        Math.max(target[3], box[3]),
    ];
}

function isValidLonLatBbox(box) {
    return (
        Array.isArray(box) &&
        box.length === 4 &&
        box.every((v) => Number.isFinite(v)) &&
        box[2] > box[0] &&
        box[3] > box[1] &&
        box[0] >= -180.5 && box[2] <= 180.5 &&
        box[1] >= -90.5 && box[3] <= 90.5
    );
}

/** 从 Layer 元素读取地理范围（兼容 1.3.0 EX_GeographicBoundingBox 与 1.1.1 LatLonBoundingBox） */
function readLayerGeographicBbox(layerNode) {
    for (const child of layerNode?.children || []) {
        if (child.tagName === 'EX_GeographicBoundingBox') {
            const pick = (tag) => {
                const node = directChild(child, tag);
                const value = Number.parseFloat(textOf(node));
                return Number.isFinite(value) ? value : NaN;
            };
            const west = pick('westBoundLongitude');
            const east = pick('eastBoundLongitude');
            const south = pick('southBoundLatitude');
            const north = pick('northBoundLatitude');
            const box = [west, south, east, north];
            if (isValidLonLatBbox(box)) return box;
        } else if (child.tagName === 'LatLonBoundingBox') {
            const box = [
                Number.parseFloat(child.getAttribute('minx')),
                Number.parseFloat(child.getAttribute('miny')),
                Number.parseFloat(child.getAttribute('maxx')),
                Number.parseFloat(child.getAttribute('maxy')),
            ];
            if (isValidLonLatBbox(box)) return box;
        }
    }
    return null;
}

/** Web 墨卡托米制坐标 → 经纬度 */
function mercatorToLonLat(x, y) {
    const lon = (x / WEB_MERCATOR_MAX_EXTENT) * 180;
    const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * (180 / Math.PI);
    return [lon, lat];
}

/** ArcGIS fullExtent（含空间参考）→ 经纬度 bbox；不支持投影时返回 null */
function arcgisExtentToLonLat(extent) {
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

const MERCATOR_HALF_WORLD = 20037508.342789244;

/**
 * 判断切片方案是否为标准 Web 墨卡托 XYZ 网格
 * （origin 左上角 -20037508.34, 20037508.34；256px；level0 res≈156543.03 且逐层折半）
 * 满足时可直接用 /tile/{z}/{y}/{x} 模板，无需动态 export（托管切片服务 export 会 500）
 */
function isStandardMercatorTileScheme(tileInfo) {
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

function parseCapabilitiesXml(xmlText, fallbackEndpoint) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('WMS Capabilities XML 解析失败');
    }

    const version = doc.documentElement.getAttribute('version') || '1.1.1';
    const found = findFirstNamedLayer(doc.documentElement);
    if (!found) throw new Error('WMS Capabilities 未找到可用图层名称');

    const rootLayerNode = findRootCapabilityLayer(doc);
    let layerOptions = rootLayerNode
        ? dedupeLayerOptions(collectNamedLayerOptions(rootLayerNode))
        : [];

    // 兜底：树形枚举异常为空时至少保留默认图层，保证选择器可用
    if (!layerOptions.length) {
        layerOptions = [toSingleOption(found.name, found.title)];
    }

    // 多图层服务：默认按文档顺序整卷加载（WMS 规范中列表首层画在最底部）
    const allNames = layerOptions.map((option) => option.name);
    const layers = allNames.join(',');
    if (allNames.length > 1) {
        layerOptions = [
            { name: layers, title: '全部图层', path: '', label: '全部图层（按顺序叠加）' },
            ...layerOptions,
        ];
    }

    // 服务地理范围：并集所有图层声明的经纬度范围，供前端自动缩放定位
    let geographicBbox = null;
    if (rootLayerNode) {
        for (const node of [rootLayerNode, ...rootLayerNode.getElementsByTagName('Layer')]) {
            geographicBbox = bboxUnion(geographicBbox, readLayerGeographicBbox(node));
        }
    }
    if (!isValidLonLatBbox(geographicBbox)) {
        geographicBbox = readLayerGeographicBbox(found.node);
    }

    const crsList = collectLayerCrsList(found.node);
    const format = pickPreferredFormat(extractGetMapFormats(doc.documentElement));
    const strategy = resolveCrsStrategy(crsList, '');

    return {
        layers,
        title: found.title,
        layerOptions,
        geographicBbox: isValidLonLatBbox(geographicBbox) ? geographicBbox : null,
        version,
        format,
        crsList,
        ...strategy,
        endpoint: fallbackEndpoint,
        source: 'capabilities',
    };
}

function buildInfoFromQuery(urlObj) {
    const layers =
        queryValueIgnoreCase(urlObj, 'LAYERS') || queryValueIgnoreCase(urlObj, 'LAYERNAMES');
    if (!layers) return null;

    const explicitVersion = queryValueIgnoreCase(urlObj, 'VERSION') || '1.1.1';
    const explicitFormat = queryValueIgnoreCase(urlObj, 'FORMAT') || 'image/png';
    const explicitSrs =
        queryValueIgnoreCase(urlObj, 'SRS') || queryValueIgnoreCase(urlObj, 'CRS') || '';

    const strategy = resolveCrsStrategy([], explicitSrs);
    return {
        layers,
        title: '',
        layerOptions: [],
        version: explicitVersion,
        format: explicitFormat,
        crsList: strategy.srs ? [strategy.srs] : [],
        ...strategy,
        endpoint: `${urlObj.origin}${urlObj.pathname}`,
        source: 'query',
    };
}

async function fetchCapabilitiesText(capabilitiesUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CAPABILITIES_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(capabilitiesUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * 拉取并缓存 WMS 服务元信息
 * URL 已带 LAYERS 参数时直接采用，跳过 capabilities 请求
 *
 * @param {string} rawUrl WMS 服务 URL
 * @returns {Promise<Object|null>} 解析失败返回 null
 */
export async function ensureWmsServiceInfo(rawUrl) {
    const source = String(rawUrl || '').trim();
    if (!source) return null;

    let urlObj;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        urlObj = new URL(source, base);
    } catch {
        return null;
    }

    const cacheKey = `${urlObj.origin}${urlObj.pathname}?${urlObj.searchParams.toString()}`;
    if (WMS_INFO_CACHE.has(cacheKey)) {
        return WMS_INFO_CACHE.get(cacheKey);
    }

    try {
        let info = buildInfoFromQuery(urlObj);

        // 场景1：URL 已带 LAYERS 参数，直接采用
        if (!info && isWmsServiceUrl(source)) {
            const capabilitiesUrl = new URL(`${urlObj.origin}${urlObj.pathname}`);
            setParamIgnoreCase(capabilitiesUrl.searchParams, 'SERVICE', 'WMS');
            setParamIgnoreCase(capabilitiesUrl.searchParams, 'REQUEST', 'GetCapabilities');
            const xmlText = await fetchCapabilitiesText(capabilitiesUrl.toString());
            info = parseCapabilitiesXml(xmlText, `${urlObj.origin}${urlObj.pathname}`);
        }

        // 场景2：ArcGIS REST 端点（…/MapServer）
        // 优先原生协议（f=json 元数据 + export 动态出图，与 ArcGIS Pro 同源，仅需 Map 能力）；
        // 失败时回退 WMS 端点探测
        if (!info && matchArcgisRestServiceUrl(source)) {
            const matched = matchArcgisRestServiceUrl(source);
            const serviceBase = `${matched.origin}${matched.servicePath}`;
            try {
                const jsonText = await fetchCapabilitiesText(`${serviceBase}?f=json`);
                info = parseArcgisServiceJson(jsonText, serviceBase);
            } catch (jsonError) {
                console.warn('[wmsService] ArcGIS 原生协议不可用，尝试 WMS 探测:', jsonError?.message);
            }
            if (!info) {
                const probed = await probeArcgisWmsEndpoint(source);
                if (!probed) {
                    throw new Error('该 ArcGIS 服务无法访问（REST 与 WMS 均不可达）');
                }
                info = parseCapabilitiesXml(probed.xmlText, probed.endpoint);
            }
        }

        if (!info) return null;

        WMS_INFO_CACHE.set(cacheKey, info);
        return info;
    } catch (error) {
        console.warn('[wmsService] 解析 WMS 服务失败:', error);
        WMS_INFO_CACHE.delete(cacheKey);
        return null;
    }
}

function setParamIgnoreCase(searchParams, name, value) {
    const existing = [...searchParams.keys()].find(
        (key) => key.toUpperCase() === name.toUpperCase(),
    );
    if (existing) searchParams.set(existing, value);
    else searchParams.set(name, value);
}

/**
 * 同步读取已缓存的 WMS 服务元信息
 * @param {string} rawUrl
 * @returns {Object|null}
 */
export function getCachedWmsInfo(rawUrl) {
    const source = String(rawUrl || '').trim();
    if (!source) return null;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const urlObj = new URL(source, base);
        const cacheKey = `${urlObj.origin}${urlObj.pathname}?${urlObj.searchParams.toString()}`;
        return WMS_INFO_CACHE.get(cacheKey) || null;
    } catch {
        return null;
    }
}
