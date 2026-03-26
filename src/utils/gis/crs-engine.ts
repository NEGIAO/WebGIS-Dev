import proj4 from 'proj4';

type ProjectionResult = {
    sourceCrs: string;
    targetCrs: 'EPSG:4326' | 'EPSG:3857';
    needsTransform: boolean;
};

function normalizeCrs(code = ''): string {
    const text = String(code || '').trim().toUpperCase().replace(/_/g, ':');
    if (!text) return '';
    if (text.startsWith('EPSG:')) return text;
    if (/^\d+$/.test(text)) return `EPSG:${text}`;
    return text;
}

function detectFromPrj(prjText = ''): string {
    const text = String(prjText || '');
    if (!text) return 'EPSG:4326';

    if (/WGS[_\s]?84|GCS_WGS_1984/i.test(text)) return 'EPSG:4326';
    if (/WEB_MERCATOR|PSEUDO[-_\s]?MERCATOR|3857/i.test(text)) return 'EPSG:3857';
    if (/CGCS[_\s]?2000|4490/i.test(text)) return 'EPSG:4490';
    if (/XI'?AN[_\s]?1980|4610|西安80/i.test(text)) return 'EPSG:4610';
    if (/BEIJING[_\s]?1954|4214|北京54/i.test(text)) return 'EPSG:4214';

    const epsgMatch = text.match(/EPSG["']?\s*,\s*["']?(\d{4,6})/i);
    if (epsgMatch?.[1]) return `EPSG:${epsgMatch[1]}`;

    return 'EPSG:4326';
}

function detectFromKml(kmlText = ''): string {
    const text = String(kmlText || '');
    if (!text) return 'EPSG:4326';
    if (/EPSG:\s*3857/i.test(text)) return 'EPSG:3857';
    if (/EPSG:\s*4490/i.test(text)) return 'EPSG:4490';
    return 'EPSG:4326';
}

function ensureProjectionDefs(): void {
    if (!proj4.defs('EPSG:4490')) {
        proj4.defs('EPSG:4490', '+proj=longlat +datum=WGS84 +no_defs');
    }
    if (!proj4.defs('EPSG:4610')) {
        proj4.defs('EPSG:4610', '+proj=longlat +datum=WGS84 +no_defs');
    }
    if (!proj4.defs('EPSG:4214')) {
        proj4.defs('EPSG:4214', '+proj=longlat +datum=WGS84 +no_defs');
    }
}

export function resolveDatasetProjection(input: {
    prjText?: string;
    kmlText?: string;
    targetCrs?: 'EPSG:4326' | 'EPSG:3857';
}): ProjectionResult {
    ensureProjectionDefs();

    const targetCrs = input?.targetCrs || 'EPSG:4326';
    const sourceByPrj = normalizeCrs(detectFromPrj(input?.prjText || ''));
    const sourceByKml = normalizeCrs(detectFromKml(input?.kmlText || ''));
    const sourceCrs = sourceByPrj || sourceByKml || 'EPSG:4326';

    return {
        sourceCrs,
        targetCrs,
        needsTransform: sourceCrs !== 'EPSG:4326' && sourceCrs !== 'EPSG:3857'
    };
}

function transformCoordinates(coords: any, sourceCrs: string, targetCrs: string): any {
    if (!Array.isArray(coords)) return coords;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        const [x, y] = proj4(sourceCrs, targetCrs, [coords[0], coords[1]]);
        const extra = coords.slice(2);
        return [x, y, ...extra];
    }
    return coords.map((child) => transformCoordinates(child, sourceCrs, targetCrs));
}

export function reprojectGeoJSON<T extends any>(geojson: T, sourceCrs: string, targetCrs: 'EPSG:4326' | 'EPSG:3857' = 'EPSG:4326'): T {
    const normalizedSource = normalizeCrs(sourceCrs);
    if (!normalizedSource || normalizedSource === targetCrs) return geojson;

    const clone = JSON.parse(JSON.stringify(geojson));

    const applyToFeature = (feature: any) => {
        if (feature?.geometry?.coordinates) {
            feature.geometry.coordinates = transformCoordinates(feature.geometry.coordinates, normalizedSource, targetCrs);
        }
    };

    if (clone?.type === 'FeatureCollection' && Array.isArray(clone.features)) {
        clone.features.forEach(applyToFeature);
    } else if (clone?.type === 'Feature') {
        applyToFeature(clone);
    } else if (clone?.coordinates) {
        clone.coordinates = transformCoordinates(clone.coordinates, normalizedSource, targetCrs);
    }

    return clone;
}
