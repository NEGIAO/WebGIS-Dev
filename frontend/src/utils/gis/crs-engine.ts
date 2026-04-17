import proj4 from 'proj4';

type ProjectionResult = {
    sourceCrs: string;
    targetCrs: 'EPSG:4326' | 'EPSG:3857';
    needsTransform: boolean;
    prjProvided: boolean;
    prjResolved: boolean;
    prjName: string;
    prjError?: string;
};

export const UNSUPPORTED_PROJECTED_CRS_CODE = 'UNSUPPORTED_PROJECTED_CRS';
export const UNSUPPORTED_PROJECTED_CRS_MESSAGE = '投影坐标系处理遇到问题。系统已尝试自动转换到 WGS84，若转换失败可能存在坐标系配置问题。';

type PrjRegistrationResult = {
    code: string;
    prjName: string;
    resolved: boolean;
    error?: string;
};

function normalizeCrs(code = ''): string {
    const raw = String(code || '').trim();
    if (!raw) return '';

    // Preserve custom WKT aliases registered via proj4.defs(alias, wkt).
    if (/^WKT:/i.test(raw)) return raw;

    const text = raw.toUpperCase().replace(/_/g, ':');
    if (text.startsWith('EPSG:')) return text;
    if (/^\d+$/.test(text)) return `EPSG:${text}`;
    return text;
}

export function sanitizeWktText(wkt = ''): string {
    return String(wkt || '')
        .replace(/^\uFEFF/, '')
        .replace(/\0/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\t ]+/g, ' ')
        .replace(/\s*\n\s*/g, ' ')
        .trim();
}

function detectFromPrj(prjText = ''): string {
    const text = sanitizeWktText(prjText);
    if (!text) return 'EPSG:4326';

    const isProjectedWkt = /\bPROJ(?:CS|CRS)\s*\[/i.test(text);
    if (isProjectedWkt) {
        // Try to extract EPSG code from AUTHORITY block (including projected codes)
        const allAuthorityCodes = Array.from(text.matchAll(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["']?(\d{4,6})["']?\s*\]/gi))
            .map((item) => Number(item?.[1]))
            .filter((value) => Number.isFinite(value));

        if (allAuthorityCodes.length) {
            // For projected WKT, prefer projected codes
            const projectedCode = allAuthorityCodes[0]; // Usually the first one is the projected code
            if (Number.isFinite(projectedCode)) {
                return `EPSG:${projectedCode}`;
            }
        }

        // Try to detect Gauss-Kruger or other China projections by name
        if (/GAUSS|KRUGER|克吕格/i.test(text)) {
            if (/Zone\s*18|18度/i.test(text)) return 'EPSG:2387';
            if (/Zone\s*21|21度/i.test(text)) return 'EPSG:2388';
            if (/Zone\s*24|24度/i.test(text)) return 'EPSG:2389';
            if (/Zone\s*27|27度/i.test(text)) return 'EPSG:2390';
        }

        // Try to detect UTM projections
        if (/UTM|UNIVERSAL\s+TRANSVERSE\s+MERCATOR/i.test(text)) {
            const zoneMatch = text.match(/[Zz]one\s+(\d+)/i);
            if (zoneMatch?.[1]) {
                const zone = parseInt(zoneMatch[1], 10);
                const north = /[Nn]orth|N\s*$|WGS\s*84/i.test(text);
                if (zone >= 1 && zone <= 60) {
                    const epsgCode = north ? 32600 + zone : 32700 + zone;
                    return `EPSG:${epsgCode}`;
                }
            }
        }

        // For any projected WKT we couldn't identify, return empty to allow fallback registration
        return '';
    }

    // Geographic coordinate systems
    if (/WGS[_\s]?84|GCS_WGS_1984/i.test(text)) return 'EPSG:4326';
    if (/WEB_MERCATOR|PSEUDO[-_\s]?MERCATOR|3857/i.test(text)) return 'EPSG:3857';
    if (/CGCS[_\s]?2000|4490|GCS_CHINA_GEODETIC_COORDINATE_SYSTEM_2000/i.test(text)) return 'EPSG:4490';
    if (/XI'?AN[_\s]?1980|4610|GCS_XIAN_1980|西安80/i.test(text)) return 'EPSG:4610';
    if (/BEIJING[_\s]?1954|4214|GCS_BEIJING_1954|北京54/i.test(text)) return 'EPSG:4214';

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

function extractPrjName(prjText = ''): string {
    const text = sanitizeWktText(prjText);
    if (!text) return '';
    const projected = text.match(/PROJ(?:CS|CRS)\s*\[\s*["']([^"']+)["']/i)?.[1];
    if (projected) return projected;
    return text.match(/GEO(?:GCS|DCRS)\s*\[\s*["']([^"']+)["']/i)?.[1] || '';
}

function hashText(text = ''): string {
    const value = String(text || '');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function makeWktAlias(prjText = ''): string {
    return `WKT:PRJ_${hashText(prjText)}`;
}

function registerWktProjection(prjText = ''): PrjRegistrationResult {
    const text = sanitizeWktText(prjText);
    const prjName = extractPrjName(text);

    if (!text) {
        return {
            code: 'EPSG:4326',
            prjName,
            resolved: true
        };
    }

    const directCode = normalizeCrs(detectFromPrj(text));
    if (directCode) {
        return {
            code: directCode,
            prjName,
            resolved: true
        };
    }

    const alias = makeWktAlias(text);
    try {
        if (!proj4.defs(alias)) {
            proj4.defs(alias, text);
        }
        if (proj4.defs(alias)) {
            return {
                code: alias,
                prjName,
                resolved: true
            };
        }
    } catch (error: any) {
        return {
            code: '',
            prjName,
            resolved: false,
            error: error?.message || String(error)
        };
    }

    return {
        code: '',
        prjName,
        resolved: false,
        error: '无法解析 PRJ WKT 定义'
    };
}

export function createUnsupportedProjectedCrsError(detail = '', notified = false): Error {
    const error = new Error(detail ? `${UNSUPPORTED_PROJECTED_CRS_MESSAGE}（${detail}）` : UNSUPPORTED_PROJECTED_CRS_MESSAGE) as Error & {
        code?: string;
        userMessage?: string;
        notified?: boolean;
    };
    error.code = UNSUPPORTED_PROJECTED_CRS_CODE;
    error.userMessage = UNSUPPORTED_PROJECTED_CRS_MESSAGE;
    error.notified = !!notified;
    return error;
}

export function isUnsupportedProjectedCrsError(error: any): boolean {
    return String(error?.code || '').toUpperCase() === UNSUPPORTED_PROJECTED_CRS_CODE;
}

function ensureProjectionDefs(): void {
    // Geographic coordinate systems (基准地理坐标系)
    if (!proj4.defs('EPSG:4326')) {
        proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
    }
    if (!proj4.defs('EPSG:4490')) {
        proj4.defs('EPSG:4490', '+proj=longlat +ellps=GRS80 +no_defs');
    }
    if (!proj4.defs('EPSG:4610')) {
        // Xi'an 1980 (西安80) commonly uses Krasovsky ellipsoid in legacy datasets.
        proj4.defs('EPSG:4610', '+proj=longlat +a=6378245 +rf=298.3 +no_defs');
    }
    if (!proj4.defs('EPSG:4214')) {
        // Beijing 1954 (北京54) also follows Krasovsky ellipsoid parameters.
        proj4.defs('EPSG:4214', '+proj=longlat +a=6378245 +rf=298.3 +no_defs');
    }

    // Web Mercator projection
    if (!proj4.defs('EPSG:3857')) {
        proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs');
    }

    // Projected coordinate systems for China (中国常用投影坐标系)
    // CGCS2000 / 3-degree Gauss-Kruger System - used in China
    if (!proj4.defs('EPSG:2387')) {
        // CGCS2000 / Gauss-Kruger zone 18
        proj4.defs('EPSG:2387', '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=18500000 +y_0=0 +ellps=GRS80 +units=m +no_defs');
    }
    if (!proj4.defs('EPSG:2388')) {
        // CGCS2000 / Gauss-Kruger zone 21
        proj4.defs('EPSG:2388', '+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=21500000 +y_0=0 +ellps=GRS80 +units=m +no_defs');
    }
    if (!proj4.defs('EPSG:2389')) {
        // CGCS2000 / Gauss-Kruger zone 24
        proj4.defs('EPSG:2389', '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=24500000 +y_0=0 +ellps=GRS80 +units=m +no_defs');
    }
    if (!proj4.defs('EPSG:2390')) {
        // CGCS2000 / Gauss-Kruger zone 27
        proj4.defs('EPSG:2390', '+proj=tmerc +lat_0=0 +lon_0=123 +k=1 +x_0=27500000 +y_0=0 +ellps=GRS80 +units=m +no_defs');
    }

    // UTM WGS84 zones (48, 49, 50, 51) - common for worldwide data
    if (!proj4.defs('EPSG:32649')) {
        // UTM zone 49N
        proj4.defs('EPSG:32649', '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs');
    }
    if (!proj4.defs('EPSG:32650')) {
        // UTM zone 50N
        proj4.defs('EPSG:32650', '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs');
    }
    if (!proj4.defs('EPSG:32651')) {
        // UTM zone 51N
        proj4.defs('EPSG:32651', '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs');
    }
}

export function resolveDatasetProjection(input: {
    prjText?: string;
    kmlText?: string;
    targetCrs?: 'EPSG:4326' | 'EPSG:3857';
}): ProjectionResult {
    ensureProjectionDefs();

    const targetCrs = input?.targetCrs || 'EPSG:4326';
    const prjText = sanitizeWktText(input?.prjText || '');
    const prjResolved = registerWktProjection(prjText);
    const sourceByPrj = normalizeCrs(prjResolved.code);
    const sourceByKml = normalizeCrs(detectFromKml(input?.kmlText || ''));
    const sourceCrs = sourceByPrj || sourceByKml || 'EPSG:4326';

    return {
        sourceCrs,
        targetCrs,
        needsTransform: sourceCrs !== targetCrs,
        prjProvided: !!prjText.trim(),
        prjResolved: !!sourceByPrj || !prjText.trim(),
        prjName: prjResolved.prjName,
        prjError: prjResolved.error
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

    ensureProjectionDefs();

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
