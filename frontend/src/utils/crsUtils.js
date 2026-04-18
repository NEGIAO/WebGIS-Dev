import { get as getProjection } from 'ol/proj.js';
import { register } from 'ol/proj/proj4.js';
import proj4 from 'proj4';
import backendAPI from '../api/backend';

const EPSG_PATTERN = /(EPSG[:/]{1,2})(\d{3,6})/i;
const URN_EPSG_PATTERN = /urn:ogc:def:crs:EPSG::(\d{3,6})/i;
const WKT_PATTERN = /\b(PROJCS|PROJCRS|GEOGCS|GEODCRS)\s*\[/i;

const WKT_NAME_TO_EPSG = [
    { pattern: /WGS[_\s]?84|GCS_WGS_1984/i, epsg: 'EPSG:4326' },
    { pattern: /WEB[_\s]?MERCATOR|PSEUDO[-_\s]?MERCATOR/i, epsg: 'EPSG:3857' },
    { pattern: /CGCS[_\s]?2000|GCS_CHINA_GEODETIC_COORDINATE_SYSTEM_2000/i, epsg: 'EPSG:4490' },
    { pattern: /XI'?AN[_\s]?1980|GCS_XIAN_1980/i, epsg: 'EPSG:4610' },
    { pattern: /BEIJING[_\s]?1954|GCS_BEIJING_1954/i, epsg: 'EPSG:4214' }
];

const COMMON_DEFS = {
    'EPSG:4490': '+proj=longlat +ellps=GRS80 +no_defs +type=crs'
};

function extractWktAuthorityCode(text = '') {
    const input = String(text || '');
    if (!input) return null;

    const isProjectedWkt = /\bPROJ(?:CS|CRS)\s*\[/i.test(input);
    const allMatches = Array.from(input.matchAll(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["']?(\d{3,6})["']?\s*\]/gi));
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
            input.projection
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
        const fromAuthority = extractWktAuthorityCode(text);
        if (fromAuthority) return fromAuthority;

        for (const entry of WKT_NAME_TO_EPSG) {
            if (entry.pattern.test(text)) return entry.epsg;
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

function inferProjectionFromCoordinates(coords) {
    if (!coords?.length) return null;

    let total = 0;
    let in4326 = 0;
    let in3857 = 0;

    for (const point of coords) {
        const x = Number(point?.[0]);
        const y = Number(point?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        total += 1;

        if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
            in4326 += 1;
        }

        if (x >= -20037508.35 && x <= 20037508.35 && y >= -20037508.35 && y <= 20037508.35) {
            in3857 += 1;
        }
    }

    if (!total) return null;
    if (in4326 / total >= 0.9) return 'EPSG:4326';
    if (in3857 / total >= 0.9 && in4326 / total < 0.1) return 'EPSG:3857';
    return null;
}

export function detectGeoJSONProjection(geojson) {
    if (!geojson) return null;

    const crsName = geojson?.crs?.properties?.name || geojson?.crs?.name;
    const normalized = normalizeProjectionCode(crsName);
    if (normalized) return normalized;

    const features = Array.isArray(geojson?.features)
        ? geojson.features
        : (Array.isArray(geojson) ? geojson : []);

    const samples = [];
    for (const feature of features) {
        sampleCoordinatesFromGeometry(feature?.geometry, samples, 120);
        if (samples.length >= 120) break;
    }

    return inferProjectionFromCoordinates(samples);
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

    const epsgCode = normalized.match(/^EPSG:(\d{3,6})$/i)?.[1];
    if (!epsgCode) return null;

    try {
        const defText = String(
            await backendAPI.get(`/api/proxy/geo/epsg/${epsgCode}/proj4`, {
                responseType: 'text',
                transformResponse: [(value) => value]
            })
        ).trim();
        if (!defText || /Not found/i.test(defText)) return null;

        proj4.defs(normalized, defText);
        register(proj4);
        return getProjection(normalized) ? normalized : null;
    } catch {
        return null;
    }
}
