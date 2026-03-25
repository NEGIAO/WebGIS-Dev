import { get as getProjection } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';

const EPSG_PATTERN = /(EPSG[:/]{1,2})(\d{3,6})/i;
const URN_EPSG_PATTERN = /urn:ogc:def:crs:EPSG::(\d{3,6})/i;

const COMMON_DEFS = {
    'EPSG:4490': '+proj=longlat +ellps=GRS80 +no_defs +type=crs'
};

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
        const resp = await fetch(`https://epsg.io/${epsgCode}.proj4`, { cache: 'force-cache' });
        if (!resp.ok) return null;

        const defText = (await resp.text()).trim();
        if (!defText || /Not found/i.test(defText)) return null;

        proj4.defs(normalized, defText);
        register(proj4);
        return getProjection(normalized) ? normalized : null;
    } catch {
        return null;
    }
}
