import proj4 from 'proj4';
import { buildProj4DefForCode, isProj4String, projDefinitionAlias } from './crsPresets';

/** 源坐标系的判定依据，决定界面是否要提示用户复核 */
export type ProjectionConfidence = 'override' | 'declared' | 'inferred' | 'ambiguous' | 'default';

type ProjectionResult = {
    sourceCrs: string;
    targetCrs: 'EPSG:4326' | 'EPSG:3857';
    needsTransform: boolean;
    prjProvided: boolean;
    prjResolved: boolean;
    prjName: string;
    prjError?: string;
    /** override=人工指定 / declared=文件声明 / inferred=量级推断 / ambiguous=存疑 / default=兜底 4326 */
    confidence: ProjectionConfidence;
    /** 为 true 时调用方应提示「请手动指定坐标系」，不要静默按 4326 处理 */
    ambiguous: boolean;
    /** 面向用户的判定说明（歧义原因或推断依据），无内容时为空串 */
    hint: string;
};

export const UNSUPPORTED_PROJECTED_CRS_CODE = 'UNSUPPORTED_PROJECTED_CRS';
export const UNSUPPORTED_PROJECTED_CRS_MESSAGE =
    '投影坐标系处理遇到问题。系统已尝试自动转换到 WGS84，若转换失败可能存在坐标系配置问题。';

type PrjRegistrationResult = {
    code: string;
    prjName: string;
    resolved: boolean;
    error?: string;
};

function normalizeCrs(code = ''): string {
    const raw = String(code || '').trim();
    if (!raw) return '';

    // Preserve custom aliases registered via proj4.defs(alias, wkt / projString).
    if (/^WKT:/i.test(raw)) return raw;
    // PROJ 别名统一小写：别名由 projDefinitionAlias() 生成（小写哈希），
    // 若在此处大写会导致 proj4.defs() 查不到定义。
    if (/^PROJ:/i.test(raw)) return `PROJ:${raw.slice(5).toLowerCase()}`;

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
        const allAuthorityCodes = Array.from(
            text.matchAll(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["']?(\d{4,6})["']?\s*\]/gi),
        )
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
    if (/CGCS[_\s]?2000|4490|GCS_CHINA_GEODETIC_COORDINATE_SYSTEM_2000/i.test(text))
        return 'EPSG:4490';
    if (/XI'?AN[_\s]?1980|4610|GCS_XIAN_1980|西安80/i.test(text)) return 'EPSG:4610';
    if (/BEIJING[_\s]?1954|4214|GCS_BEIJING_1954|北京54/i.test(text)) return 'EPSG:4214';

    const epsgMatch = text.match(/EPSG["']?\s*,\s*["']?(\d{4,6})/i);
    if (epsgMatch?.[1]) return `EPSG:${epsgMatch[1]}`;

    return 'EPSG:4326';
}

/** 从 KML 中提取显式 EPSG；无信号时返回空串（不再默认 4326，避免掩盖歧义） */
function detectFromKml(kmlText = ''): string {
    const text = String(kmlText || '');
    if (!text) return '';
    const match = text.match(/EPSG[:\s]*(\d{4,6})/i);
    return match?.[1] ? normalizeCrs(match[1]) : '';
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
        // 没有 .prj 不等于「就是 4326」：返回空编码，让上层继续看 KML / 预探测 / 人工指定，
        // 最终落到 default 或 ambiguous。旧实现直接返回 4326 会掩盖缺失。
        return {
            code: '',
            prjName,
            resolved: true,
        };
    }

    const directCode = normalizeCrs(detectFromPrj(text));
    if (directCode) {
        return {
            code: directCode,
            prjName,
            resolved: true,
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
                resolved: true,
            };
        }
    } catch (error: any) {
        return {
            code: '',
            prjName,
            resolved: false,
            error: error?.message || String(error),
        };
    }

    return {
        code: '',
        prjName,
        resolved: false,
        error: '无法解析 PRJ WKT 定义',
    };
}

export function createUnsupportedProjectedCrsError(detail = '', notified = false): Error {
    const error = new Error(
        detail
            ? `${UNSUPPORTED_PROJECTED_CRS_MESSAGE}（${detail}）`
            : UNSUPPORTED_PROJECTED_CRS_MESSAGE,
    ) as Error & {
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
        proj4.defs(
            'EPSG:3857',
            '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
        );
    }

    // Projected coordinate systems for China (中国常用投影坐标系)
    // CGCS2000 / 3-degree Gauss-Kruger System - used in China
    if (!proj4.defs('EPSG:2387')) {
        // CGCS2000 / Gauss-Kruger zone 18
        proj4.defs(
            'EPSG:2387',
            '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=18500000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
        );
    }
    if (!proj4.defs('EPSG:2388')) {
        // CGCS2000 / Gauss-Kruger zone 21
        proj4.defs(
            'EPSG:2388',
            '+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=21500000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
        );
    }
    if (!proj4.defs('EPSG:2389')) {
        // CGCS2000 / Gauss-Kruger zone 24
        proj4.defs(
            'EPSG:2389',
            '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=24500000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
        );
    }
    if (!proj4.defs('EPSG:2390')) {
        // CGCS2000 / Gauss-Kruger zone 27
        proj4.defs(
            'EPSG:2390',
            '+proj=tmerc +lat_0=0 +lon_0=123 +k=1 +x_0=27500000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
        );
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

/**
 * 功能：按需注册任意 EPSG 定义（含中国分带投影的本地生成）。
 * 参数：code —— EPSG 编码或 `WKT:` 别名。
 * 返回：注册后可用返回 true。
 * 说明：proj4 内置只有 4326 / 3857；CGCS2000 分带按公式现场生成，不依赖后端。
 */
export function ensureCrsDef(code: string): boolean {
    const raw = String(code || '').trim();
    // PROJ 定义串：先散列成稳定别名再注册（proj4 以名字为键）
    if (isProj4String(raw)) {
        const alias = projDefinitionAlias(raw);
        if (!proj4.defs(alias)) {
            try {
                proj4.defs(alias, raw);
            } catch {
                return false;
            }
        }
        return !!proj4.defs(alias);
    }
    const normalized = normalizeCrs(raw);
    if (!normalized) return false;
    ensureProjectionDefs();
    if (proj4.defs(normalized)) return true;

    const def = buildProj4DefForCode(normalized);
    if (!def) return false;
    try {
        proj4.defs(normalized, def);
    } catch {
        return false;
    }
    return !!proj4.defs(normalized);
}

/**
 * 功能：解析数据集应使用的源坐标系。
 * 参数：input.overrideCrs —— 人工指定（最高优先级）
 *       input.prjText —— .prj 文件内容（WKT）
 *       input.kmlText —— KML 文本
 *       input.sourceCrs / sourceConfidence / sourceHint —— 调用方预先探测的结果（如 GeoJSON）
 *       input.targetCrs —— 目标坐标系，默认 EPSG:4326
 * 返回：源/目标坐标系、是否需要重投影，以及判定依据（confidence / ambiguous / hint）。
 * 说明：优先级恒为 人工指定 > .prj > KML > 调用方探测 > 默认 4326；
 *       任何一步命中都立即返回，不做二次猜测。
 */
export function resolveDatasetProjection(input: {
    prjText?: string;
    kmlText?: string;
    sourceCrs?: string;
    sourceConfidence?: 'declared' | 'inferred' | 'ambiguous' | 'none';
    sourceHint?: string;
    overrideCrs?: string;
    targetCrs?: 'EPSG:4326' | 'EPSG:3857';
}): ProjectionResult {
    ensureProjectionDefs();

    const targetCrs = input?.targetCrs || 'EPSG:4326';
    const prjText = sanitizeWktText(input?.prjText || '');
    const prjResolved = registerWktProjection(prjText);
    const base = {
        targetCrs,
        prjProvided: !!prjText.trim(),
        prjName: prjResolved.prjName,
        prjError: prjResolved.error,
    };

    // ① 人工指定：跳过一切推断。支持 EPSG 编码、WKT 别名与 `+proj=` 定义串
    const rawOverride = String(input?.overrideCrs || '').trim();
    let override = '';
    if (rawOverride) {
        if (isProj4String(rawOverride)) {
            const alias = projDefinitionAlias(rawOverride);
            if (!proj4.defs(alias)) {
                try {
                    proj4.defs(alias, rawOverride);
                } catch {
                    // 非法 PROJ 串：退回自动识别，由 ambiguous 分支提示
                }
            }
            override = proj4.defs(alias) ? alias : '';
        } else {
            override = normalizeCrs(rawOverride);
        }
    }
    if (override) {
        return {
            ...base,
            sourceCrs: override,
            needsTransform: override !== targetCrs,
            prjResolved: true,
            confidence: 'override',
            ambiguous: false,
            hint: '',
        };
    }

    // ② .prj WKT
    const sourceByPrj = normalizeCrs(prjResolved.code);
    if (sourceByPrj) {
        return {
            ...base,
            sourceCrs: sourceByPrj,
            needsTransform: sourceByPrj !== targetCrs,
            prjResolved: true,
            confidence: 'declared',
            ambiguous: false,
            hint: '',
        };
    }

    // ③ KML 显式声明
    const sourceByKml = normalizeCrs(detectFromKml(input?.kmlText || ''));
    if (sourceByKml) {
        return {
            ...base,
            sourceCrs: sourceByKml,
            needsTransform: sourceByKml !== targetCrs,
            prjResolved: true,
            confidence: 'declared',
            ambiguous: false,
            hint: '',
        };
    }

    // ④ 调用方预探测（GeoJSON crs 成员 / 坐标量级推断）
    const sourcePreset = normalizeCrs(input?.sourceCrs || '');
    if (sourcePreset) {
        return {
            ...base,
            sourceCrs: sourcePreset,
            needsTransform: sourcePreset !== targetCrs,
            prjResolved: true,
            confidence: input?.sourceConfidence === 'inferred' ? 'inferred' : 'declared',
            ambiguous: false,
            hint: input?.sourceHint || '',
        };
    }

    // ⑤ 兜底：无法判定时不做静默处理，交给调用方提示
    const ambiguous = input?.sourceConfidence === 'ambiguous';
    return {
        ...base,
        sourceCrs: 'EPSG:4326',
        needsTransform: targetCrs !== 'EPSG:4326',
        prjResolved: !prjText.trim() ? true : prjResolved.resolved,
        confidence: ambiguous ? 'ambiguous' : 'default',
        ambiguous,
        hint: ambiguous ? input?.sourceHint || '未能判定源坐标系，暂按 WGS84 处理' : '',
    };
}

/** 重投影统计：用于向调用方报告被丢弃的要素数（对应 mapshaper 的 badArcs 计数） */
export type ReprojectStats = { droppedFeatures: number; invalidPoints: number };

function transformCoordinates(
    coords: any,
    sourceCrs: string,
    targetCrs: string,
    stats: ReprojectStats,
    rangeCheck: boolean,
): any {
    if (!Array.isArray(coords)) return coords;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        const [x, y] = proj4(sourceCrs, targetCrs, [coords[0], coords[1]]);
        const extra = coords.slice(2);
        // 非有限值或落在经纬度范围外 → 视为该点不可投影（投影边缘、参数错误等）
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            stats.invalidPoints += 1;
            return null;
        }
        if (rangeCheck && (Math.abs(x) > 180.0001 || Math.abs(y) > 90.0001)) {
            stats.invalidPoints += 1;
            return null;
        }
        return [x, y, ...extra];
    }
    const mapped = coords.map((child) =>
        transformCoordinates(child, sourceCrs, targetCrs, stats, rangeCheck),
    );
    return mapped.some((item) => item === null) ? null : mapped;
}

export function reprojectGeoJSON<T>(
    geojson: T,
    sourceCrs: string,
    targetCrs: 'EPSG:4326' | 'EPSG:3857' = 'EPSG:4326',
    options: { onInvalid?: (stats: ReprojectStats) => void } = {},
): T {
    const normalizedSource = normalizeCrs(sourceCrs);
    if (!normalizedSource || normalizedSource === targetCrs) return geojson;

    ensureProjectionDefs();
    if (!ensureCrsDef(normalizedSource)) {
        throw createUnsupportedProjectedCrsError(`无法解析源坐标系 ${normalizedSource}`);
    }

    const clone = JSON.parse(JSON.stringify(geojson));
    const stats: ReprojectStats = { droppedFeatures: 0, invalidPoints: 0 };
    const rangeCheck = targetCrs === 'EPSG:4326';

    // 返回 null 表示该要素含不可投影顶点；要素级整体丢弃（不留半条几何）
    const applyToFeature = (feature: any): any => {
        if (!feature?.geometry?.coordinates) return feature;
        const next = transformCoordinates(
            feature.geometry.coordinates,
            normalizedSource,
            targetCrs,
            stats,
            rangeCheck,
        );
        if (next === null) {
            stats.droppedFeatures += 1;
            return null;
        }
        feature.geometry.coordinates = next;
        return feature;
    };

    if (clone?.type === 'FeatureCollection' && Array.isArray(clone.features)) {
        clone.features = clone.features.map(applyToFeature).filter(Boolean);
    } else if (clone?.type === 'Feature') {
        // 单个要素：失败计数由 applyToFeature 内部完成，此处不可重复自增；
        // 几何保持原样（未被赋值），不返回空壳，调用方按要素数判断空图层
        applyToFeature(clone);
    } else if (clone?.coordinates) {
        const next = transformCoordinates(
            clone.coordinates,
            normalizedSource,
            targetCrs,
            stats,
            rangeCheck,
        );
        if (next) clone.coordinates = next;
    }

    if (stats.droppedFeatures > 0 || stats.invalidPoints > 0) {
        options.onInvalid?.(stats);
    }
    return clone;
}
