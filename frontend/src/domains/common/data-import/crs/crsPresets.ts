/**
 * CGCS2000 高斯-克吕格带号 ↔ EPSG 映射与 proj4 定义生成（零依赖，可被 Node 直接验证）。
 *
 * 背景：中国测绘成果的平面坐标绝大多数是 CGCS2000 高斯-克吕格投影，但 EPSG 把
 * 「3 度带 / 6 度带」×「带号前缀 / 中央经线」拆成了四段互不连续的编码区间：
 *
 *   4513~4533  3 度带 · 带号 25~45      x_0 = 带号 × 1e6 + 500000
 *   4534~4554  3 度带 · 中央经线 75E~135E（每 3°） x_0 = 500000
 *   4491~4501  6 度带 · 带号 13~23      x_0 = 带号 × 1e6 + 500000
 *   4502~4512  6 度带 · 中央经线 75E~135E（每 6°） x_0 = 500000
 *
 * 以上四段区间与 x_0 取值已用 epsg.io 的 4534 / 4547 / 4513 / 4491 / 4512 五个条目核对。
 * 带号前缀与不带前缀的差别**只在 x_0**，投影参数其余部分完全相同；这也是「带号拿错整体
 * 偏移几十公里」的直接原因 —— 差的是 1e6 量级的假东。
 */

/** 预设分组：地理坐标系 / 投影坐标系 */
export type CrsPresetKind = 'geographic' | 'projected';

/** 下拉选项 */
export interface CrsPreset {
    /** 规范化编码，形如 `EPSG:4547` */
    code: string;
    /** 界面主文案 */
    label: string;
    /** 界面副文案（带号 / 中央经线） */
    hint: string;
    kind: CrsPresetKind;
}

/** 3 度带编码区间 */
const THREE_DEGREE_ZONE_RANGE = { from: 4513, to: 4533, zoneFrom: 25 };
/** 3 度带中央经线区间 */
const THREE_DEGREE_CM_RANGE = { from: 4534, to: 4554, cmFrom: 75, step: 3 };
/** 6 度带编码区间 */
const SIX_DEGREE_ZONE_RANGE = { from: 4491, to: 4501, zoneFrom: 13 };
/** 6 度带中央经线区间 */
const SIX_DEGREE_CM_RANGE = { from: 4502, to: 4512, cmFrom: 75, step: 6 };

/** 不带带号前缀时的高斯投影假东（米） */
const FALSE_EASTING = 500000;

/** CGCS2000 椭球（GRS80）投影参数模板 */
function buildProj4(centralMeridian: number, x0: number): string {
    return [
        '+proj=tmerc',
        '+lat_0=0',
        `+lon_0=${centralMeridian}`,
        '+k=1',
        `+x_0=${x0}`,
        '+y_0=0',
        '+ellps=GRS80',
        '+units=m',
        '+no_defs',
    ].join(' ');
}

/**
 * 功能：把任意输入规范成 `EPSG:xxxx`。
 * 参数：input —— 可能是 `4547`、`epsg:4547`、` EPSG:4547 `、`urn:ogc:def:crs:EPSG::4547`。
 * 返回：规范化编码；无法识别时返回空串。
 * 说明：只处理数字型 EPSG，WKT 文本不在此列（由 crs-engine 的 WKT 注册链路负责）。
 */
export function normalizeEpsgCode(input: unknown): string {
    const raw = String(input ?? '').trim();
    if (!raw) return '';
    const fromUrn = raw.match(/urn:ogc:def:crs:EPSG:[^:]*:(\d{4,6})/i)?.[1];
    if (fromUrn) return `EPSG:${fromUrn}`;
    const fromPlain = raw.match(/^(?:epsg\s*[:_ ]?\s*)?(\d{4,6})$/i)?.[1];
    if (fromPlain) return `EPSG:${fromPlain}`;
    return '';
}

/** 取编号部分；非 EPSG 编码返回 NaN */
function epsgNumber(code: string): number {
    const normalized = normalizeEpsgCode(code);
    return normalized ? Number(normalized.slice(5)) : Number.NaN;
}

/**
 * 功能：判定编码是否属于 CGCS2000 高斯-克吕格四段区间之一。
 * 参数：code —— EPSG 编码。
 * 返回：命中时返回该投影的元信息，否则 null。
 */
export function describeCgcs2000(
    code: string,
): { zone: number | null; centralMeridian: number; withZonePrefix: boolean } | null {
    const n = epsgNumber(code);
    if (!Number.isFinite(n)) return null;

    if (n >= THREE_DEGREE_ZONE_RANGE.from && n <= THREE_DEGREE_ZONE_RANGE.to) {
        const zone = THREE_DEGREE_ZONE_RANGE.zoneFrom + (n - THREE_DEGREE_ZONE_RANGE.from);
        return { zone, centralMeridian: zone * 3, withZonePrefix: true };
    }
    if (n >= THREE_DEGREE_CM_RANGE.from && n <= THREE_DEGREE_CM_RANGE.to) {
        const centralMeridian =
            THREE_DEGREE_CM_RANGE.cmFrom + (n - THREE_DEGREE_CM_RANGE.from) * THREE_DEGREE_CM_RANGE.step;
        return { zone: centralMeridian / 3, centralMeridian, withZonePrefix: false };
    }
    if (n >= SIX_DEGREE_ZONE_RANGE.from && n <= SIX_DEGREE_ZONE_RANGE.to) {
        const zone = SIX_DEGREE_ZONE_RANGE.zoneFrom + (n - SIX_DEGREE_ZONE_RANGE.from);
        return { zone, centralMeridian: zone * 6 - 3, withZonePrefix: true };
    }
    if (n >= SIX_DEGREE_CM_RANGE.from && n <= SIX_DEGREE_CM_RANGE.to) {
        const centralMeridian =
            SIX_DEGREE_CM_RANGE.cmFrom + (n - SIX_DEGREE_CM_RANGE.from) * SIX_DEGREE_CM_RANGE.step;
        return { zone: (centralMeridian + 3) / 6, centralMeridian, withZonePrefix: false };
    }
    return null;
}

/**
 * 功能：生成 CGCS2000 高斯-克吕格投影的 proj4 定义串。
 * 参数：code —— EPSG 编码（必须落在四段区间内）。
 * 返回：proj4 定义串；非 CGCS2000 带号编码返回 null（交给 proj4 内置或后端代理）。
 */
export function buildCgcs2000Proj4Def(code: string): string | null {
    const meta = describeCgcs2000(code);
    if (!meta) return null;
    const x0 = meta.withZonePrefix
        ? (meta.zone as number) * 1000000 + FALSE_EASTING
        : FALSE_EASTING;
    return buildProj4(meta.centralMeridian, x0);
}

/**
 * 功能：由中央经线反查 EPSG 编码。
 * 参数：centralMeridian —— 中央经线（度）；degree —— 3 或 6 度带；withZonePrefix —— 是否要带号前缀那一段。
 * 返回：EPSG 编码；不在规则网格上时返回空串。
 * 说明：中央经线必须能被带号整除（3 度带）或满足 zone*6-3（6 度带），否则说明数据不是标准分带。
 */
export function cgcs2000CodeFromCentralMeridian(
    centralMeridian: number,
    options: { degree?: 3 | 6; withZonePrefix?: boolean } = {},
): string {
    const degree = options.degree === 6 ? 6 : 3;
    const cm = Number(centralMeridian);
    if (!Number.isFinite(cm)) return '';

    if (degree === 3) {
        const zone = cm / 3;
        if (!Number.isInteger(zone) || cm < 75 || cm > 135) return '';
        return options.withZonePrefix
            ? `EPSG:${THREE_DEGREE_ZONE_RANGE.from + (zone - 25)}`
            : `EPSG:${THREE_DEGREE_CM_RANGE.from + (zone - 25)}`;
    }

    const zone = (cm + 3) / 6;
    if (!Number.isInteger(zone) || cm < 75 || cm > 135) return '';
    return options.withZonePrefix
        ? `EPSG:${SIX_DEGREE_ZONE_RANGE.from + (zone - 13)}`
        : `EPSG:${SIX_DEGREE_CM_RANGE.from + (zone - 13)}`;
}

/** 是否为 PROJ 定义串（`+proj=utm +zone=50 …`） */
export function isProj4String(input: unknown): boolean {
    return /^\s*\+proj\s*=/.test(String(input ?? ''));
}

/**
 * 功能：为 PROJ 串生成稳定别名。
 * 参数：projStr —— `+proj=…` 形式的定义串。
 * 返回：`PROJ:<8 位哈希>`；同一串恒定得到同一别名，便于重复导入时命中缓存。
 * 说明：proj4 的 defs() 以「名字」为键，PROJ 串本身不能直接当键，故先散列。
 */
export function projDefinitionAlias(projStr: string): string {
    const value = String(projStr || '').trim();
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `PROJ:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** 基础地理坐标系与全球投影（不含中国分带） */
export const BASIC_CRS_PRESETS: CrsPreset[] = [
    { code: 'EPSG:4326', label: 'WGS 84', hint: '经纬度 · GPS / OSM', kind: 'geographic' },
    { code: 'EPSG:4490', label: 'CGCS2000', hint: '经纬度 · 国家法定', kind: 'geographic' },
    { code: 'EPSG:3857', label: 'Web 墨卡托', hint: '网络瓦片底图', kind: 'projected' },
];

/** UTM（WGS84）编码区间：北半球 32601~32660，南半球 32701~32760 */
const UTM_NORTH_FROM = 32601;
const UTM_SOUTH_FROM = 32701;

/**
 * 功能：按 EPSG 编码生成 proj4 定义（**全项目唯一入口**）。
 * 覆盖：4326 / 4490 / 4610 / 4214 / 3857 / CGCS2000 四段分带 / UTM 南半球与北半球。
 * 返回：定义串；不在覆盖范围内返回 null（交由后端 `/api/proxy/geo/epsg` 兜底）。
 * 说明：把「基础地理坐标系 + 中国分带 + UTM」收敛到一个函数，避免
 *       crs-engine 与 crsUtils 各自维护一份 ensureProjectionDefs 而出现定义漂移。
 */
export function buildProj4DefForCode(code: string): string | null {
    const normalized = normalizeEpsgCode(code);
    if (!normalized) return null;

    switch (normalized) {
        case 'EPSG:4326':
            return '+proj=longlat +datum=WGS84 +no_defs';
        case 'EPSG:4490':
            return '+proj=longlat +ellps=GRS80 +no_defs';
        case 'EPSG:4610':
        case 'EPSG:4214':
            // 西安 80 / 北京 54 均使用克拉索夫斯基椭球
            return '+proj=longlat +a=6378245 +rf=298.3 +no_defs';
        case 'EPSG:3857':
            return '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs';
        default:
            break;
    }

    const n = Number(normalized.slice(5));
    if (n >= UTM_NORTH_FROM && n <= UTM_NORTH_FROM + 59) {
        return `+proj=utm +zone=${n - UTM_NORTH_FROM + 1} +datum=WGS84 +units=m +no_defs`;
    }
    if (n >= UTM_SOUTH_FROM && n <= UTM_SOUTH_FROM + 59) {
        return `+proj=utm +zone=${n - UTM_SOUTH_FROM + 1} +south +datum=WGS84 +units=m +no_defs`;
    }

    return buildCgcs2000Proj4Def(normalized);
}

/**
 * 功能：列出 UTM 预设。
 * 参数：hemisphere —— 南北半球；zoneFrom / zoneTo —— 带号区间（中国约 43~53）。
 * 返回：按带号升序的预设数组。
 */
export function listUtmPresets(
    options: { hemisphere?: 'north' | 'south'; zoneFrom?: number; zoneTo?: number } = {},
): CrsPreset[] {
    const hemisphere = options.hemisphere === 'south' ? 'south' : 'north';
    const from = Math.max(1, options.zoneFrom ?? 1);
    const to = Math.min(60, options.zoneTo ?? 60);
    const base = hemisphere === 'south' ? UTM_SOUTH_FROM : UTM_NORTH_FROM;
    const out: CrsPreset[] = [];
    for (let zone = from; zone <= to; zone += 1) {
        out.push({
            code: `EPSG:${base + zone - 1}`,
            label: `WGS 84 / UTM ${zone}${hemisphere === 'south' ? 'S' : 'N'}`,
            hint: `UTM ${zone} 带 · ${hemisphere === 'south' ? '南半球' : '北半球'}`,
            kind: 'projected',
        });
    }
    return out;
}

/**
 * 功能：列出 CGCS2000 三度带预设（默认，覆盖 75E~135E）。
 * 参数：degree —— 3 或 6；withZonePrefix —— 是否列出带号前缀那一段。
 * 返回：按中央经线升序的预设数组。
 * 说明：默认只列「中央经线」段，因为设计院交付物多用它；带号前缀段通过参数显式请求。
 */
export function listCgcs2000Presets(
    degree: 3 | 6 = 3,
    withZonePrefix = false,
): CrsPreset[] {
    const step = degree === 3 ? 3 : 6;
    const out: CrsPreset[] = [];
    for (let cm = 75; cm <= 135; cm += step) {
        const code = cgcs2000CodeFromCentralMeridian(cm, { degree, withZonePrefix });
        if (!code) continue;
        const meta = describeCgcs2000(code);
        if (!meta) continue;
        out.push({
            code,
            label: `CGCS2000 / ${degree} 度带`,
            hint: withZonePrefix
                ? `带号 ${meta.zone} · 中央经线 ${cm}°E`
                : `中央经线 ${cm}°E`,
            kind: 'projected',
        });
    }
    return out;
}
