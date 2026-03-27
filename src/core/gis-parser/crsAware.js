import { detectGeoJSONProjection, detectProjectionFromKmlText, ensureProjectionAvailable, normalizeProjectionCode } from '../../utils/crsUtils';

function detectProjectionFromPrjText(prjText) {
    const text = String(prjText || '');
    if (!text) return null;

    const normalizedFromCode = normalizeProjectionCode(text);
    if (normalizedFromCode?.startsWith('EPSG:')) return normalizedFromCode;

    if (/WGS[_\s]?84|GCS_WGS_1984|WGS 84/i.test(text)) return 'EPSG:4326';
    if (/Web_Mercator|Pseudo[-_\s]?Mercator|3857/i.test(text)) return 'EPSG:3857';
    if (/CGCS[_\s]?2000|China Geodetic Coordinate System 2000/i.test(text)) return 'EPSG:4490';
    if (/Xian[_\s]?1980|西安80/i.test(text)) return 'EPSG:4610';
    if (/Beijing[_\s]?1954|北京54/i.test(text)) return 'EPSG:4214';

    return null;
}

export function detectKmlProjectionHint(kmlText) {
    const text = String(kmlText || '');
    const projected = detectProjectionFromKmlText(text);
    if (projected) return projected;

    // KML 的 LookAt/Region 通常基于椭球体经纬度表达，默认按 WGS84 解读。
    if (/<\s*(?:[\w-]+:)?LookAt\b/i.test(text) || /<\s*(?:[\w-]+:)?Region\b/i.test(text)) {
        return 'EPSG:4326';
    }

    return null;
}

export async function resolveProjectionOrDefault(inputProjection, label = '数据') {
    const normalized = normalizeProjectionCode(inputProjection);
    if (normalized) {
        const available = await ensureProjectionAvailable(normalized);
        if (available) {
            return { projection: available, warning: null };
        }
    }

    return {
        projection: 'EPSG:4326',
        warning: `${label} 坐标系无法识别，尝试按 WGS84（EPSG:4326）渲染。`
    };
}

export async function detectShpProjectionFromPrj(prjText) {
    const candidate = detectProjectionFromPrjText(prjText);
    return resolveProjectionOrDefault(candidate, 'Shapefile');
}

export async function detectGeoJsonProjection(geojsonData) {
    const candidate = detectGeoJSONProjection(geojsonData);
    return resolveProjectionOrDefault(candidate, 'GeoJSON');
}

function decodeBufferToText(buffer) {
    if (!(buffer instanceof ArrayBuffer)) return '';
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (!utf8.includes('\uFFFD')) return utf8;
    try {
        return new TextDecoder('gbk', { fatal: false }).decode(buffer);
    } catch {
        return utf8;
    }
}

export async function precheckArchiveCrs(entries = []) {
    const output = {
        prjProjection: null,
        kmlProjection: null,
        resolvedProjection: 'EPSG:4326',
        warning: null,
        needsReprojection: false
    };

    const prjEntry = entries.find((item) => item.extension === 'prj' && item.buffer instanceof ArrayBuffer) || null;
    if (prjEntry) {
        const prjText = decodeBufferToText(prjEntry.buffer);
        const prjResolved = await detectShpProjectionFromPrj(prjText);
        output.prjProjection = prjResolved.projection;
        output.resolvedProjection = prjResolved.projection || output.resolvedProjection;
        if (prjResolved.warning) output.warning = prjResolved.warning;
    }

    const kmlEntry = entries.find((item) => item.extension === 'kml' && item.buffer instanceof ArrayBuffer) || null;
    if (kmlEntry) {
        const kmlText = decodeBufferToText(kmlEntry.buffer);
        const kmlHint = detectKmlProjectionHint(kmlText);
        if (kmlHint) {
            const kmlResolved = await resolveProjectionOrDefault(kmlHint, 'KML/KMZ');
            output.kmlProjection = kmlResolved.projection;
            if (!output.prjProjection) {
                output.resolvedProjection = kmlResolved.projection || output.resolvedProjection;
                if (kmlResolved.warning) output.warning = kmlResolved.warning;
            }
        }
    }

    output.needsReprojection = !['EPSG:4326', 'EPSG:3857'].includes(String(output.resolvedProjection || '').toUpperCase());
    if (!output.prjProjection && !output.kmlProjection && !output.warning) {
        output.warning = '坐标系未明确声明，尝试按 WGS84（EPSG:4326）渲染。';
    }

    return output;
}
