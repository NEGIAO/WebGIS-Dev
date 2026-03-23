import { searchAmapPlaces } from './map';
import { gcj02ToWgs84 } from '../utils/coordTransform';

function normalizeTiandituItem(item) {
    if (!item) return null;

    const name = item.name || item.poiName || item.areaName || item.displayName || item.title || item.address || item.keyWord || '未知地点';

    let lon = item.lon || item.lng || item.x;
    let lat = item.lat || item.latit || item.y;

    if ((!lon || !lat) && item.lonlat) {
        const parts = String(item.lonlat).split(',');
        if (parts.length >= 2) {
            lon = parts[0];
            lat = parts[1];
        }
    }

    if (!lon || !lat || Number.isNaN(parseFloat(lon)) || Number.isNaN(parseFloat(lat))) {
        return null;
    }

    return {
        display_name: name,
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        original: item
    };
}

function parseTiandituResponse(data) {
    if (!data) return [];

    let rawList = [];

    if (data.area) {
        rawList = [data.area];
    } else if (Array.isArray(data.areas)) {
        rawList = data.areas;
    } else if (Array.isArray(data.pois)) {
        rawList = data.pois;
    } else if (data.queryResults && Array.isArray(data.queryResults.results)) {
        rawList = data.queryResults.results;
    } else if (Array.isArray(data.results)) {
        rawList = data.results;
    } else if (Array.isArray(data.data)) {
        rawList = data.data;
    } else if (Array.isArray(data)) {
        rawList = data;
    } else {
        return [];
    }

    return rawList.map(normalizeTiandituItem).filter(item => item !== null);
}

async function searchWithTianditu({ keywords, page = 1, pageSize = 10, tiandituTk, mapBound }) {
    if (!tiandituTk) {
        throw new Error('天地图 Token 未配置');
    }

    const postObj = {
        keyWord: keywords,
        level: 12,
        mapBound,
        queryType: 1,
        start: Math.max(0, (page - 1) * pageSize),
        count: pageSize
    };

    const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(JSON.stringify(postObj))}&type=query&tk=${encodeURIComponent(tiandituTk)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const data = await res.json();
    const items = parseTiandituResponse(data);
    const total = Number(data?.count ?? items.length);
    return { items, total: Number.isFinite(total) ? total : items.length };
}

async function searchWithNominatim({ keywords, pageSize = 10, page = 1 }) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=${pageSize}&q=${encodeURIComponent(keywords)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim Error: ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data)
        ? data.map(item => ({
            name: item.display_name,
            address: item.display_name,
            display_name: item.display_name,
            lon: parseFloat(item.lon),
            lat: parseFloat(item.lat)
        }))
        : [];
    const total = page === 1 ? items.length : Math.max(items.length + (page - 1) * pageSize, items.length);
    return { items, total };
}

async function searchWithAmap({ keywords, page = 1, pageSize = 10, amapKey = '' }) {
    const apiKey = String(amapKey || '').trim();
    if (!apiKey) {
        throw new Error('高德 Web 服务 Key 未配置');
    }

    const data = await searchAmapPlaces({
        key: apiKey,
        keywords,
        page,
        offset: pageSize
    });

    const pois = Array.isArray(data?.pois) ? data.pois : [];
    const items = pois.map((poi) => {
        const location = String(poi.location || '').split(',');
        const gcjLon = Number.parseFloat(location[0]);
        const gcjLat = Number.parseFloat(location[1]);
        const [wgsLon, wgsLat] = gcj02ToWgs84(gcjLon, gcjLat);
        return {
            id: poi.id,
            name: poi.name,
            address: poi.address || poi.pname || '',
            display_name: `${poi.name}${poi.address ? ` - ${poi.address}` : ''}`,
            lon: Number.isFinite(wgsLon) ? wgsLon : undefined,
            lat: Number.isFinite(wgsLat) ? wgsLat : undefined,
            gcjLon: Number.isFinite(gcjLon) ? gcjLon : undefined,
            gcjLat: Number.isFinite(gcjLat) ? gcjLat : undefined,
            coordSystem: 'wgs84'
        };
    });

    const total = Number(data?.count ?? items.length);
    return { items, total: Number.isFinite(total) ? total : items.length };
}

export async function fetchLocationResultsByService({
    service,
    keywords,
    page = 1,
    pageSize = 10,
    amapKey = '',
    tiandituTk = '',
    mapBound
}) {
    if (!keywords) {
        return { items: [], total: 0 };
    }

    if (service === 'tianditu') {
        return searchWithTianditu({ keywords, page, pageSize, tiandituTk, mapBound });
    }
    if (service === 'nominatim') {
        return searchWithNominatim({ keywords, page, pageSize });
    }
    if (service === 'amap') {
        return searchWithAmap({ keywords, page, pageSize, amapKey });
    }
    throw new Error(`未知搜索服务: ${service}`);
}
