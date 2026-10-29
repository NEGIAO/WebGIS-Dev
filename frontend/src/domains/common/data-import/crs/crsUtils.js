import { get as getProjection } from 'ol/proj.js';
import { register } from 'ol/proj/proj4.js';
import proj4 from 'proj4';
import backendAPI from '@/api/backend';
import { buildProj4DefForCode, isProj4String, projDefinitionAlias } from './crsPresets';

const EPSG_PATTERN = /(EPSG[:/]{1,2})(\d{3,6})/i;
const URN_EPSG_PATTERN = /urn:ogc:def:crs:EPSG::(\d{3,6})/i;
const WKT_PATTERN = /\b(PROJCS|PROJCRS|GEOGCS|GEODCRS)\s*\[/i;

const WKT_NAME_TO_EPSG = [
    { pattern: /WGS[_\s]?84|GCS_WGS_1984/i, epsg: 'EPSG:4326' },
    { pattern: /WEB[_\s]?MERCATOR|PSEUDO[-_\s]?MERCATOR/i, epsg: 'EPSG:3857' },
    { pattern: /CGCS[_\s]?2000|GCS_CHINA_GEODETIC_COORDINATE_SYSTEM_2000/i, epsg: 'EPSG:4490' },
    { pattern: /XI'?AN[_\s]?1980|GCS_XIAN_1980/i, epsg: 'EPSG:4610' },
    { pattern: /BEIJING[_\s]?1954|GCS_BEIJING_1954/i, epsg: 'EPSG:4214' },
];

const COMMON_DEFS = {
    'EPSG:4490': '+proj=longlat +ellps=GRS80 +no_defs +type=crs',
};

function extractWktAuthorityCode(text = '') {
    const input = String(text || '');
    if (!input) return null;

    const isProjectedWkt = /\bPROJ(?:CS|CRS)\s*\[/i.test(input);
    const allMatches = Array.from(
        input.matchAll(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["']?(\d{3,6})["']?\s*\]/gi),
    );
    if (!allMatches.length) return null;

    if (isProjectedWkt) {
        const geographicCodes = new Set([4326, 4490, 4610, 4214]);
        const projected = allMatches
            .map((item) => Number(item?.[1]))
            .find((value) => Number.isFinite(value) && !geographicCodes.has(value));
        if (Number.isFinite(projected)) return `EPSG:${projected}`;
    }

    const preferred = allMatches
        .map((item) => Number(item?.[1]))
        .find((value) => Number.isFinite(value) && value > 4000 && value !== 4326);
    if (Number.isFinite(preferred)) return `EPSG:${preferred}`;

    return `EPSG:${allMatches[0][1]}`;
}

function extractWktProjectionName(text = '') {
    const input = String(text || '');
    if (!input) return '';
    return input.match(/PROJ(?:CS|CRS)\s*\[\s*["']([^"']+)["']/i)?.[1] || '';
}

function makeProjectionTag(prefix, value) {
    const normalized = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!normalized) return null;
    return `${prefix}:${normalized}`;
}

export function normalizeProjectionCode(input) {
    if (!input) return null;

    if (typeof input === 'object') {
        if (typeof input.getCode === 'function') {
            return normalizeProjectionCode(input.getCode());
        }

        // Handle plain objects like { code: 'EPSG:4547' } or { properties: { name: 'EPSG:4547' } }
        const candidates = [
            input.code,
            input.name,
            input.srsName,
            input.properties?.name,
            input.properties?.code,
            input.crs,
            input.projection,
        ];

        for (const candidate of candidates) {
            const normalizedCandidate = normalizeProjectionCode(candidate);
            if (normalizedCandidate) return normalizedCandidate;
        }

        return null;
    }

    const text = String(input).trim();
    if (!text) return null;

    if (WKT_PATTERN.test(text)) {
        const isProjectedWkt = /\bPROJ(?:CS|CRS)\s*\[/i.test(text);
        const fromAuthority = extractWktAuthorityCode(text);
        if (fromAuthority) return fromAuthority;

        // 投影 WKT 不能按「基准面名字」映射到地理坐标系：
        // ESRI 风格 PRJ 常出现 SPHEROID["CGCS2000"] / GCS_WGS_1984，
        // 若命中名字表就会把「CGCS2000 3 度带 37 带」误判成「CGCS2000 经纬度（4490）」，
        // 于是平面坐标被当成度、整份数据落到错误位置。地理 WKT 才做名字匹配。
        if (!isProjectedWkt) {
            for (const entry of WKT_NAME_TO_EPSG) {
                if (entry.pattern.test(text)) return entry.epsg;
            }
        }

        const projectionName = extractWktProjectionName(text);
        if (projectionName) {
            return makeProjectionTag('PCS', projectionName);
        }
    }

    const urnMatch = text.match(URN_EPSG_PATTERN);
    if (urnMatch) return `EPSG:${urnMatch[1]}`;

    const epsgMatch = text.match(EPSG_PATTERN);
    if (epsgMatch) return `EPSG:${epsgMatch[2]}`;

    if (/^EPSG:\d{3,6}$/i.test(text)) {
        return text.toUpperCase();
    }

    return text;
}

function sampleCoordinatesFromGeometry(geometry, out, limit = 80) {
    if (!geometry || !Array.isArray(out) || out.length >= limit) return;

    const coords = geometry.coordinates;
    if (!Array.isArray(coords)) return;

    const stack = [coords];
    while (stack.length && out.length < limit) {
        const node = stack.pop();
        if (!Array.isArray(node) || !node.length) continue;

        if (typeof node[0] === 'number' && typeof node[1] === 'number') {
            out.push([node[0], node[1]]);
            continue;
        }

        for (let i = node.length - 1; i >= 0; i--) {
            stack.push(node[i]);
        }
    }
}

/**
 * 坐标量级推断（按中国场景校准）。
 *
 * 旧判据是「x、y 都落在 ±20037508 内即 Web 墨卡托」，但 4326 的取值区间被 3857 完全包含，
 * 且高斯-克吕格的米制坐标同样落在该区间 —— 结果所有平面数据都被判成 3857，
 * 再按墨卡托反算会落到几千公里外（实测示例：(528700, 3402800) → 约 4.7°E / 29.4°N）。
 *
 * 新判据利用「三段互不重叠」的事实：
 *   无带号 GK/UTM 东坐标：300k~700k（3 度带）/ 166k~834k（UTM）  → |x| < 1e6
 *   中国境内 Web 墨卡托东坐标：8.1e6~15.0e6（东经 73°~135°）      → 1e6 ≤ |x| ≤ 15.5e6
 *   带号前缀 GK/UTM 东坐标：13.5e6~43.5e6                         → 通常 >15.5e6
 * 其中「带号前缀 13.5e6~15.0e6」与墨卡托存在窄重叠，故该区间按 ambiguous 处理，
 * 交由界面提示用户确认，而不是静默猜测。
 *
 * @param {Array<[number, number]>} coords 采样点
 * @returns {{code: string|null, confidence: 'high'|'medium'|'ambiguous'|'none', hint: string}}
 */
function inferProjectionFromCoordinatesDetailed(coords) {
    if (!coords?.length) return { code: null, confidence: 'none', hint: '' };

    let total = 0;
    let inDegrees = 0;
    let planarNoZone = 0;
    let mercatorLike = 0;

    for (const point of coords) {
        const x = Number(point?.[0]);
        const y = Number(point?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        total += 1;

        if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
            inDegrees += 1;
            continue;
        }

        const absX = Math.abs(x);
        const absY = Math.abs(y);
        if (absX < 1e6) {
            planarNoZone += 1;
        } else if (absX <= 15.5e6 && absY <= 8.5e6) {
            mercatorLike += 1;
        }
    }

    if (!total) return { code: null, confidence: 'none', hint: '' };

    if (inDegrees / total >= 0.9) {
        return { code: 'EPSG:4326', confidence: 'high', hint: '' };
    }
    if (planarNoZone / total >= 0.9) {
        return {
            code: null,
            confidence: 'ambiguous',
            hint: '检测到平面坐标（东坐标约 30 万~70 万米），缺少带号 / 中央经线，无法自动判定',
        };
    }
    if (mercatorLike / total >= 0.9) {
        return {
            code: 'EPSG:3857',
            confidence: 'medium',
            hint: '按坐标量级推断为 Web 墨卡托（EPSG:3857）',
        };
    }
    return {
        code: null,
        confidence: 'ambiguous',
        hint: '坐标量级不一致或超出中国常见投影范围，需要手动指定坐标系',
    };
}

/** 兼容旧调用：只取编码，歧义时返回 null */
function inferProjectionFromCoordinates(coords) {
    return inferProjectionFromCoordinatesDetailed(coords).code;
}

/**
 * 功能：探测 GeoJSON 的源坐标系，并给出置信度与歧义说明。
 * 参数：geojson —— 已解析的 GeoJSON 对象。
 * 返回：`{ code, confidence, hint }`；declared 表示文件自带声明，inferred 表示量级推断。
 * 说明：RFC 7946 已删除 `crs` 成员，但仍大量存在于国内数据中，因此先读声明再推断。
 */
export function detectGeoJSONProjectionDetailed(geojson) {
    if (!geojson) return { code: null, confidence: 'none', hint: '' };

    const crsName = geojson?.crs?.properties?.name || geojson?.crs?.name;
    const normalized = normalizeProjectionCode(crsName);
    if (normalized) return { code: normalized, confidence: 'declared', hint: '' };

    const features = Array.isArray(geojson?.features)
        ? geojson.features
        : Array.isArray(geojson)
          ? geojson
          : [];

    const samples = [];
    for (const feature of features) {
        sampleCoordinatesFromGeometry(feature?.geometry, samples, 120);
        if (samples.length >= 120) break;
    }

    return inferProjectionFromCoordinatesDetailed(samples);
}

export function detectGeoJSONProjection(geojson) {
    return detectGeoJSONProjectionDetailed(geojson).code;
}

export function detectProjectionFromKmlText(kmlText) {
    if (!kmlText) return null;

    const srsMatch = String(kmlText).match(/srsName=["']([^"']+)["']/i);
    const srsNormalized = normalizeProjectionCode(srsMatch?.[1]);
    if (srsNormalized) return srsNormalized;

    const coordText = String(kmlText).match(/<coordinates>([^<]+)<\/coordinates>/i)?.[1];
    if (!coordText) return null;

    const pairs = coordText
        .trim()
        .split(/\s+/)
        .slice(0, 30)
        .map((chunk) => chunk.split(',').map((v) => Number(v.trim())))
        .filter((arr) => Number.isFinite(arr[0]) && Number.isFinite(arr[1]))
        .map((arr) => [arr[0], arr[1]]);

    return inferProjectionFromCoordinates(pairs);
}

export async function ensureProjectionAvailable(projectionCode) {
    // PROJ 定义串（`+proj=…`）：散列成别名后直接注册，不走 EPSG 查询
    const rawText = String(projectionCode || '').trim();
    if (isProj4String(rawText)) {
        const alias = projDefinitionAlias(rawText);
        try {
            if (!proj4.defs(alias)) proj4.defs(alias, rawText);
        } catch {
            return null;
        }
        register(proj4);
        return getProjection(alias) ? alias : null;
    }

    const normalized = normalizeProjectionCode(projectionCode);
    if (!normalized) return null;

    if (normalized.startsWith('PCS:') || normalized.startsWith('GCS:')) {
        return null;
    }

    if (getProjection(normalized)) {
        return normalized;
    }

    const commonDef = COMMON_DEFS[normalized];
    if (commonDef) {
        proj4.defs(normalized, commonDef);
        register(proj4);
        return getProjection(normalized) ? normalized : null;
    }

    // 中国分带投影：按 EPSG 公式本地生成定义，不依赖后端在线（离线 / 内网部署同样可用）
    const localDef = buildProj4DefForCode(normalized);
    if (localDef) {
        proj4.defs(normalized, localDef);
        register(proj4);
        return getProjection(normalized) ? normalized : null;
    }

    const epsgCode = normalized.match(/^EPSG:(\d{3,6})$/i)?.[1];
    if (!epsgCode) return null;

    try {
        const defText = String(
            await backendAPI.get(`/api/proxy/geo/epsg/${epsgCode}/proj4`, {
                responseType: 'text',
                transformResponse: [(value) => value],
            }),
        ).trim();
        if (!defText || /Not found/i.test(defText)) return null;

        proj4.defs(normalized, defText);
        register(proj4);
        return getProjection(normalized) ? normalized : null;
    } catch {
        return null;
    }
}
