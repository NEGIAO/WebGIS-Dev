import {
    addressToLocation,
    locationToAddress,
    reverseGeocodeByPriority,
    reverseGeocodeTianditu
} from './geocoding';
import { fetchLocationResultsByService } from './locationSearch';
import { getIpLocation } from './ipLocation';
import { getWeather } from './weather';
import backendAPI, {
    apiLocationIpLocate,
    apiLocationReverse,
    apiLocationTrackVisit
} from './backend';

export * from './map';
export * from './geocoding';
export * from './locationSearch';
export * from './ipLocation';
export * from './weather';
export * from './backend';

/**
 * 统一地址地理编码入口。
 */
export async function apiAddressGeocode(address, city = '', options = {}) {
    const data = await addressToLocation(address, city, options);
    return {
        ok: true,
        service: 'amap',
        data
    };
}

/**
 * 统一逆地理编码入口（WGS-84）。
 */
export async function apiReverseGeocode(lng, lat, options = {}) {
    const data = await locationToAddress(lng, lat, 'base', options);
    return {
        ok: true,
        service: 'amap',
        data
    };
}

/**
 * 统一逆地理编码入口（高德优先，天地图兜底）。
 */
export async function apiReverseGeocodeWithFallback(lng, lat, options = {}) {
    const data = await reverseGeocodeByPriority(lng, lat, options);
    return {
        ok: true,
        service: String(data?.provider || 'unknown').toLowerCase(),
        data
    };
}

/**
 * 统一位置搜索入口。
 */
export async function apiSearchLocations(params = {}) {
    const normalized = await fetchLocationResultsByService(params);
    return {
        ok: true,
        service: String(params?.service || '').trim().toLowerCase(),
        data: normalized
    };
}

/**
 * 统一 IP 定位入口。
 */
export async function apiIpLocation(ip = '', options = {}) {
    const data = await getIpLocation(ip, options);
    return {
        ok: !!data?.ok,
        service: 'amap-ip',
        data
    };
}

/**
 * 统一 IP 所属国家探测（后端代理 ipapi）。
 */
export async function apiIpCountry(ip = '') {
    const data = await backendAPI.get('/api/proxy/ipapi/country', {
        params: String(ip || '').trim() ? { ip: String(ip || '').trim() } : {}
    });
    return {
        ok: true,
        service: 'ipapi-country',
        data
    };
}

/**
 * 统一天气查询入口。
 */
export async function apiWeather(adcode, type = 'base') {
    const data = await getWeather(adcode, type);
    return {
        ok: true,
        service: 'amap-weather',
        data
    };
}

export {
    addressToLocation,
    locationToAddress,
    reverseGeocodeByPriority,
    reverseGeocodeTianditu,
    fetchLocationResultsByService,
    getIpLocation,
    getWeather
};
