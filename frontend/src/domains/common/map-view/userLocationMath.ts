/**
 * 功能名称：用户定位纯工具（几何估算 / URL 标记 / 开发者开关）
 * 日    期：2026/11/13
 *
 * 从 useUserLocation 拆出：不依赖地图实例与响应式状态的纯函数，
 * 供定位 composable 与其它模块复用。
 */
import { normalizeBinaryFlag, normalizeLocationFlag } from '@common/utils/normalize';

/** 角度 → 弧度 */
export function toRad(value: unknown): number {
    return (Number(value) * Math.PI) / 180;
}

/** 球面距离（米） */
export function haversineMeters(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371000 * c;
}

/** 取 [minLng, minLat, maxLng, maxLat] 的中心点（非法输入返回 null） */
export function getExtentCenter(extent: number[] | null | undefined): { lon: number; lat: number } | null {
    if (!Array.isArray(extent) || extent.length < 4) return null;
    const nums = extent.slice(0, 4).map((item) => Number(item));
    if (!nums.every((item) => Number.isFinite(item))) return null;
    const minX = Math.min(nums[0], nums[2]);
    const minY = Math.min(nums[1], nums[3]);
    const maxX = Math.max(nums[0], nums[2]);
    const maxY = Math.max(nums[1], nums[3]);
    return {
        lon: (minX + maxX) / 2,
        lat: (minY + maxY) / 2,
    };
}

/** 由城市范围对角线估算定位精度（米），非法输入返回 +∞ */
export function estimateExtentAccuracyMeters(extent: number[] | null | undefined): number {
    if (!Array.isArray(extent) || extent.length < 4) return Number.POSITIVE_INFINITY;
    const nums = extent.slice(0, 4).map((item) => Number(item));
    if (!nums.every((item) => Number.isFinite(item))) return Number.POSITIVE_INFINITY;

    const minX = Math.min(nums[0], nums[2]);
    const minY = Math.min(nums[1], nums[3]);
    const maxX = Math.max(nums[0], nums[2]);
    const maxY = Math.max(nums[1], nums[3]);
    const centerLon = (minX + maxX) / 2;
    const centerLat = (minY + maxY) / 2;

    const widthMeters = haversineMeters(minX, centerLat, maxX, centerLat);
    const heightMeters = haversineMeters(centerLon, minY, centerLon, maxY);
    const diagonalMeters = Math.sqrt(widthMeters ** 2 + heightMeters ** 2);
    if (!Number.isFinite(diagonalMeters) || diagonalMeters <= 0)
        return Number.POSITIVE_INFINITY;

    return Math.max(1000, diagonalMeters / 2);
}

/** 精度收敛到展示区间 [20, 5000]，非法值回退 30 */
export function toDisplayAccuracyMeters(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 30;
    return Math.min(Math.max(value, 20), 5000);
}

/** 从 hash 查询串优先、search 查询串兜底读取 URL 参数 */
export function readQueryValueFromUrl(key: string): string {
    if (typeof window === 'undefined') return '';

    const hash = String(window.location.hash || '');
    const queryStart = hash.indexOf('?');
    if (queryStart >= 0) {
        const hashParams = new URLSearchParams(hash.slice(queryStart + 1));
        const hashValue = String(hashParams.get(key) || '').trim();
        if (hashValue) return hashValue;
    }

    const searchParams = new URLSearchParams(
        String(window.location.search || '').replace(/^\?/, ''),
    );
    return String(searchParams.get(key) || '').trim();
}

/** 开发者调试开关（dev / devApi 查询参数） */
export interface DeveloperModeSwitches {
    devModeEnabled: boolean;
    /** 禁用高德 IP 定位（改用免费服务） */
    disableAmapIpLocation: boolean;
}

export function resolveDeveloperModeSwitches(): DeveloperModeSwitches {
    const devModeRaw = readQueryValueFromUrl('dev') || readQueryValueFromUrl('debug');
    const devModeEnabled = normalizeBinaryFlag(devModeRaw, '0') === '1';
    const disableApiText = String(
        readQueryValueFromUrl('devApi') ||
            readQueryValueFromUrl('devApis') ||
            readQueryValueFromUrl('disableApi') ||
            readQueryValueFromUrl('disableApis') ||
            readQueryValueFromUrl('debugApi') ||
            '',
    ).toLowerCase();

    const disableApiTokens = new Set(
        disableApiText
            .split(',')
            .map((token) => token.trim())
            .filter(Boolean),
    );

    return {
        devModeEnabled,
        disableAmapIpLocation:
            devModeEnabled ||
            disableApiTokens.has('amap-ip') ||
            disableApiTokens.has('amap-location') ||
            disableApiTokens.has('amap-ip-location'),
    };
}

/**
 * 仅当用户授权定位（GPS 或 IP）成功时，才在 URL 中写入 loc 来源标记
 * - GPS 授权：写入 loc=gps，且后续 IP 回退不可降级覆盖（GPS 优先级最高）
 * - IP 定位：写入 loc=ip，但不写入 p 编码坐标（p 仅由 GPS 授权写入）
 * @param source 定位来源 'gps' | 'ip' | 'unknown'（unknown 直接返回不写入）
 */
export function markLocationSuccessFlagInUrl(source = 'unknown'): void {
    if (source !== 'gps' && source !== 'ip') return;

    if (typeof window === 'undefined') return;

    try {
        const hash = String(window.location.hash || '#/home');
        const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
        const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
        const hashPath = hashPathRaw || '/home';
        const params = new URLSearchParams(hashQueryRaw);

        if (normalizeBinaryFlag(params.get('s'), '0') !== '1') {
            params.set('s', '0');
        }

        const currentLoc = normalizeLocationFlag(params.get('loc') || '0', '0');
        if (currentLoc === source) return;
        // GPS 优先级最高：已标记为 gps 时，后续 IP 回退不得降级覆盖
        if (currentLoc === 'gps' && source !== 'gps') return;

        params.set('loc', source);
        const nextHashQuery = params.toString();
        const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
        const nextHash = nextHashQuery
            ? `#${normalizedHashPath}?${nextHashQuery}`
            : `#${normalizedHashPath}`;
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
        // Ignore URL patch failures to avoid breaking locate flow.
    }
}

/**
 * 判断坐标是否落在中国大陆范围（含港澳台、海南，排除蒙古/俄罗斯/中亚/南海大部分区域）
 * @param lon 经度（WGS-84）
 * @param lat 纬度（WGS-84）
 */
export function isCoordinateInChina(lon: number, lat: number): boolean {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
    return lon >= 73.5 && lon <= 135.0 && lat >= 3.0 && lat <= 53.6;
}
