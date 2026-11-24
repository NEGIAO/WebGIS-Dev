/**
 * Agent 双向地理编码工具（只读）
 *
 * 把「经纬度 → 地名」与「地名 → 经纬度」从 search_and_zoom 中拆出为独立工具：
 * 二者只做数据查询，不移动地图、不建图层、不经 MapCommandBus。
 *
 * 坐标契约：入参与输出均为 WGS-84。底层 api 层已处理 GCJ-02 转换
 * （见 api/geocoding.ts 与 api/locationSearch.ts 的头注释），本模块不感知转换细节。
 */

import { apiAddressGeocode, apiReverseGeocodeWithFallback } from '@/api/index';
import { fetchLocationResultsByService, searchWithNominatim } from '@/api/locationSearch';

/** 工具统一返回结构：与 GISCommander 其它只读工具保持一致 */
export interface GeocodingToolResult {
    success: boolean;
    code: string;
    message: string;
    location?: Record<string, unknown>;
    [key: string]: unknown;
}

/** 从异常中取可读信息，避免把对象序列化成 [object Object] */
function errorMessage(error: unknown, fallback = 'geocoding service error'): string {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
        const value = (error as { message?: unknown }).message;
        if (typeof value === 'string' && value) return value;
    }
    return fallback;
}

/**
 * 拼接行政区名称，去掉直辖市等场景下 province === city 的重复项。
 */
function joinRegion(parts: Array<unknown>): string {
    const seen: string[] = [];
    for (const part of parts) {
        const text = String(part || '').trim();
        if (text && !seen.includes(text)) seen.push(text);
    }
    return seen.join('');
}

/**
 * 经纬度 → 具体地名（逆地理编码）。
 *
 * 走统一入口 apiReverseGeocodeWithFallback：高德优先、天地图兜底，
 * 内部自动 WGS-84 → GCJ-02。失败一律返回结构化结果，不抛异常。
 *
 * @param params.lng WGS-84 经度（-180 ~ 180）
 * @param params.lat WGS-84 纬度（-90 ~ 90）
 * @returns {{success: boolean, code: string, message: string, location?: Object}}
 */
export async function reverseGeocodeTool({
    lng,
    lat,
}: { lng?: number | string; lat?: number | string } = {}): Promise<GeocodingToolResult> {
    const longitude = Number(lng);
    const latitude = Number(lat);
    if (
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    ) {
        return {
            success: false,
            code: 'INVALID_ARGUMENT',
            message: 'reverse_geocode 需要有效的 WGS-84 经纬度：lng ∈ [-180,180]，lat ∈ [-90,90]',
        };
    }

    try {
        const { data } = await apiReverseGeocodeWithFallback(longitude, latitude, { silent: true });
        const province = String(data?.province || '').trim();
        const city = String(data?.city || '').trim();
        const district = String(data?.district || '').trim();
        const township = String(data?.township || '').trim();
        const address = String(data?.formattedAddress || '').trim();
        const region = joinRegion([province, city, district, township]);
        const provider = String(data?.provider || 'unknown').trim();

        if (!region && !address) {
            return {
                success: false,
                code: 'ADDRESS_NOT_FOUND',
                message: `逆地理编码未返回地址：(${longitude.toFixed(6)}, ${latitude.toFixed(6)})`,
            };
        }

        // 高德的 formattedAddress 通常已含省市区：仅在不含时才并列展示，避免地名重复
        const placeLabel = region && address && !address.startsWith(region)
            ? `${region}（${address}）`
            : region || address;
        const adcode = String(data?.adcode || '').trim();
        const businessAreas = Array.isArray(data?.businessAreas)
            ? data.businessAreas.map((item: any) => String(item?.name || '').trim()).filter(Boolean)
            : [];

        return {
            success: true,
            code: 'OK',
            message: `${placeLabel}，坐标 (${longitude.toFixed(6)}, ${latitude.toFixed(6)})（WGS-84）${adcode ? `，行政区划码 ${adcode}` : ''} [${provider}]`,
            location: {
                lng: longitude,
                lat: latitude,
                province,
                city,
                district,
                township,
                region,
                address,
                formattedAddress: address,
                adcode,
                businessAreas,
                provider,
                coordinateSystem: 'WGS-84',
            },
        };
    } catch (error: unknown) {
        return {
            success: false,
            code: 'REVERSE_GEOCODE_FAILED',
            message: `逆地理编码失败：${errorMessage(error)}`,
        };
    }
}

/**
 * 地名 / 地址 / POI → 经纬度（正地理编码）。
 *
 * 三级降级：高德地址编码 → 高德 POI 文本检索 → Nominatim（国际兜底）。
 * 全部只读：命中后只返回坐标，不定位、不落图。
 *
 * @param params.address 地名、地址或 POI 名称
 * @param params.city 可选城市限定（仅高德生效）
 * @returns {{success: boolean, code: string, message: string, location?: Object}}
 */
export async function geocodeTool({
    address,
    city = '',
}: { address?: string; city?: string } = {}): Promise<GeocodingToolResult> {
    const query = String(address || '').trim();
    const cityHint = String(city || '').trim();
    if (!query) {
        return {
            success: false,
            code: 'INVALID_ARGUMENT',
            message: 'geocode 需要提供 address（地名、地址或 POI 名称）',
        };
    }

    // 1) 高德地址编码：行政区与标准地址最准
    try {
        const { data } = await apiAddressGeocode(query, cityHint, { silent: true });
        if (Number.isFinite(data?.lng) && Number.isFinite(data?.lat)) {
            return buildGeocodeHit({
                lng: data.lng,
                lat: data.lat,
                address: String(data.formattedAddress || query),
                adcode: String(data.adcode || ''),
                detail: String(data.level || ''),
                provider: 'amap-geocode',
                query,
            });
        }
    } catch (error: unknown) {
        console.warn(`[AgentGeocoding] 高德地址编码未命中「${query}」：${errorMessage(error)}`);
    }

    // 2) 高德 POI 文本检索：覆盖「西湖」「某某大厦」等非标准地址
    try {
        const { items } = await fetchLocationResultsByService({
            service: 'amap',
            keywords: query,
            city: cityHint,
            pageSize: 5,
        });
        const hit = (items || []).find(
            (item: any) => Number.isFinite(item?.lon) && Number.isFinite(item?.lat),
        );
        if (hit) {
            return buildGeocodeHit({
                lng: hit.lon,
                lat: hit.lat,
                address: String(hit.display_name || hit.name || query),
                adcode: '',
                detail: '',
                provider: cityHint ? 'amap-poi-city' : 'amap-poi',
                query,
            });
        }
    } catch (error: unknown) {
        console.warn(`[AgentGeocoding] 高德 POI 检索未命中「${query}」：${errorMessage(error)}`);
    }

    // 3) Nominatim：境外地名兜底
    try {
        const { items } = await searchWithNominatim({ keywords: query, pageSize: 1 });
        const hit = (items || [])[0];
        if (hit && Number.isFinite(hit?.lon) && Number.isFinite(hit?.lat)) {
            return buildGeocodeHit({
                lng: hit.lon,
                lat: hit.lat,
                address: String(hit.display_name || hit.name || query),
                adcode: '',
                detail: '',
                provider: 'nominatim',
                query,
            });
        }
    } catch (error: unknown) {
        console.warn(`[AgentGeocoding] Nominatim 检索未命中「${query}」：${errorMessage(error)}`);
    }

    return {
        success: false,
        code: 'GEOCODE_NOT_FOUND',
        message: `未找到「${query}」对应的坐标：高德地址/POI 与 Nominatim 均未命中，请换用更具体的地名或地址`,
    };
}

/** 归一命中结果为统一返回结构（输出坐标均为 WGS-84） */
function buildGeocodeHit({
    lng,
    lat,
    address,
    adcode,
    detail,
    provider,
    query,
}: {
    lng: number;
    lat: number;
    address: string;
    adcode: string;
    detail: string;
    provider: string;
    query: string;
}): GeocodingToolResult {
    return {
        success: true,
        code: 'OK',
        message: `「${query}」→ (${lng.toFixed(6)}, ${lat.toFixed(6)})（WGS-84）${address && address !== query ? `：${address}` : ''}${adcode ? `，行政区划码 ${adcode}` : ''} [${provider}]`,
        location: {
            lng,
            lat,
            address,
            formattedAddress: address,
            adcode,
            level: detail,
            provider,
            coordinateSystem: 'WGS-84',
        },
    };
}
