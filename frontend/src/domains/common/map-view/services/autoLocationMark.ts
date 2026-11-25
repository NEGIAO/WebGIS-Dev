/**
 * IP 定位候选构造 + 进入系统自动定位标记（V3.7.13）。
 *
 * 本文件是 IP 定位请求的**单一事实来源**：
 * - `fetchIpLocationCandidate` 供 `useUserLocation.buildIpCandidate` 与入口自动标记共用；
 * - `markIpLocationFromBackend` 负责进入系统时非阻塞调用，成功即写 loc=ip。
 *
 * 用户进入系统后的定位只有三种结果：
 * 1. 用户授权 GPS 成功 → loc=gps（由现有 zoomToUser 流程写入，带 p 编码）
 * 2. 后端 IP 定位成功 → loc=ip（本模块负责，无 p 编码）
 * 3. 都失败 → 不写 loc（不留占位值）
 *
 * 兼容后端两种返回：
 * - 旧版：extent 四元数组，需取中心并做 GCJ-02→WGS-84 转换；
 * - 新版：直接 latitude/longitude（WGS-84），extent 为 null。
 */
import { apiLocationIpLocate } from '@/api/backend/location';
import { gcj02ToWgs84 } from '@common/data-import/crs/coordTransform';
import {
    estimateExtentAccuracyMeters,
    getExtentCenter,
    markLocationSuccessFlagInUrl,
} from '@common/map-view/userLocationMath';
import { setGlobalUserLocationContext } from '@common/map-view/services/userLocationContext';

/** 与 useUserLocation 的 LocationCandidate 同形（避免循环引用，不直接 import 类型） */
export interface IpLocationCandidate {
    source: 'ip';
    lon: number;
    lat: number;
    accuracyMeters: number;
    ipResult: any;
}

let autoMarkPromise: Promise<boolean> | null = null;

/**
 * 调用后端 ip-locate 并构造定位候选（纯请求，无 URL/上下文副作用）。
 *
 * @param ip 指定 IP（空串表示用请求方公网 IP）
 * @param preferFreeService 是否优先免费服务（跳过高德，兼容旧 zoomToUserCityByIp 开关）
 * @returns IP 定位候选；失败时由 axios Interceptor 抛错（配额异常由调用方按需上抛）
 */
export async function fetchIpLocationCandidate(
    ip = '',
    preferFreeService = false,
): Promise<IpLocationCandidate | null> {
    const result: any = await apiLocationIpLocate(ip, {
        preferFreeService,
        silent: true,
    });
    if (!result?.ok) return null;

    const extent = Array.isArray(result.extent) ? result.extent : null;
    const center = getExtentCenter(extent);

    let lon: number;
    let lat: number;
    let accuracyMeters: number;

    if (center) {
        // 旧版：extent 中心为 GCJ-02，需转 WGS-84；精度估算复用既有纯函数
        [lon, lat] = gcj02ToWgs84(center.lon, center.lat);
        accuracyMeters = estimateExtentAccuracyMeters(extent);
    } else {
        // 新版：后端直接返回经纬度（WGS-84），无 extent 不阻断定位成功
        lon = Number(result.longitude);
        lat = Number(result.latitude);
        accuracyMeters = 50000;
    }

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return { source: 'ip', lon, lat, accuracyMeters, ipResult: result };
}

/**
 * 进入系统自动 IP 定位并标记 loc=ip（整页只执行一次，失败静默）。
 *
 * @param routePath 当前路由路径（由调用方传入，避免依赖 location.hash 的写入时序；
 *                  省略时从 location.hash 推断）
 * @returns 是否成功标记（失败/已有 GPS/已执行过均返回 false）
 */
export function markIpLocationFromBackend(routePath?: string): Promise<boolean> {
    // 仅地图主页 /home 标记：根路径 / 是落地页、/register 等页面不需要定位信息。
    // 在占用一次性 Promise 之前判断，确保后续进入 /home 仍可触发。
    let path = String(routePath || '').trim();
    if (!path) {
        const hashText = typeof window === 'undefined' ? '' : String(window.location.hash || '');
        path = (hashText.startsWith('#') ? hashText.slice(1) : hashText).split('?')[0] || '/';
    }
    if (path !== '/home') return Promise.resolve(false);

    if (autoMarkPromise) return autoMarkPromise;

    autoMarkPromise = (async (): Promise<boolean> => {
        try {
            // 已有 GPS 标记时不覆盖：GPS 优先级最高（沿用 userLocationMath 的判定口径）
            const hash = String(window.location.hash || '');
            const queryIndex = hash.indexOf('?');
            const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : '');
            if (params.get('loc') === 'gps') return false;

            const candidate = await fetchIpLocationCandidate('');
            if (!candidate) return false;

            const result = candidate.ipResult;
            const context = setGlobalUserLocationContext({
                lon: candidate.lon,
                lat: candidate.lat,
                accuracy: candidate.accuracyMeters,
                accuracyMeters: candidate.accuracyMeters,
                source: 'ip',
                timestamp: Date.now(),
                encodedLocation: {
                    formattedAddress: `${result.province || ''}${result.city || ''}`.trim(),
                    province: String(result.province || ''),
                    city: String(result.city || ''),
                    district: '',
                    township: '',
                    adcode: String(result.adcode || ''),
                    businessAreas: [],
                },
            });
            if (!context) return false;

            markLocationSuccessFlagInUrl('ip');
            return true;
        } catch {
            // 定位失败静默：按用户语义不写任何 loc 参数
            return false;
        }
    })();

    return autoMarkPromise;
}
