import backendAPI from './backend';
import { gcj02ToWgs84 } from '../utils/geo';

const AMAP_SUCCESS_STATUS = '1';
const AMAP_SUCCESS_INFOCODE = '10000';

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
  try {
    if (!tiandituTk) {
      throw new Error('天地图 Token 未配置');
    }

    // 如果没有提供 mapBound，使用全国范围的默认值
    // mapBound 格式: "minLon,minLat,maxLon,maxLat"
    const defaultBound = '73.5,18.2,135.0,53.5'; // 中国大约范围
    const finalMapBound = String(mapBound || '').trim() || defaultBound;

    const postObj = {
      keyWord: keywords,
      level: 12,
      mapBound: finalMapBound,
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
    
    return { 
      items, 
      total: Number.isFinite(total) ? total : items.length 
    };
  } catch (error) {
    // 处理天地图搜索错误
    console.error('Tianditu search error:', error);
    const errorMsg = error.message || '搜索失败';

    if (errorMsg.includes('Token')) {
      throw new Error('天地图配置错误：Token 未配置');
    }
    if (errorMsg.includes('无法连接')) {
      throw new Error('天地图搜索：网络连接失败，请检查网络设置');
    }
    if (errorMsg.includes('超时')) {
      throw new Error('天地图搜索：请求超时，请稍后重试');
    }
    if (errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504')) {
      throw new Error('天地图服务暂时不可用，请稍后重试');
    }

    throw new Error(`天地图搜索失败: ${errorMsg}`);
  }
}

async function searchWithNominatim({ keywords, pageSize = 10, page = 1 }) {
    try {
        const data = await backendAPI.get('/api/proxy/search/nominatim', {
            params: {
                keywords,
                limit: pageSize
            }
        });

        // 后端返回的是 Nominatim API 的原始响应（数组）
        const items = Array.isArray(data)
            ? data.map(item => ({
                name: item.display_name,
                address: item.display_name,
                display_name: item.display_name,
                lon: parseFloat(item.lon),
                lat: parseFloat(item.lat),
                poiid: item.place_id // Nominatim 用 place_id 作为唯一标识
            })).filter(item => !isNaN(item.lon) && !isNaN(item.lat))
            : [];
        
        const total = page === 1 ? items.length : Math.max(items.length + (page - 1) * pageSize, items.length);
        return { items, total };
    } catch (error) {
        // 处理错误并提供详细的错误信息
        console.error('Nominatim search error:', error);
        
        const errorMsg = error.message || '搜索失败';
        
        // 根据错误类型提供详细提示
        if (errorMsg.includes('无法连接')) {
            throw new Error('网络连接失败，请检查网络设置');
        }
        if (errorMsg.includes('超时')) {
            throw new Error('搜索超时，请稍后重试');
        }
        if (errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504')) {
            throw new Error('服务暂时不可用，请稍后重试');
        }
        
        throw new Error(`国际地名搜索失败: ${errorMsg}`);
    }
}

async function searchWithAmap({ keywords, page = 1, pageSize = 10 }) {
    try {
        // 调用后端代理而不是直接调用高德 API
        const data = await backendAPI.get('/api/proxy/amap/place/text', {
            params: {
                keywords,
                page,
                offset: pageSize
            }
        });

        // 检查高德 API 响应状态
        const status = String(data?.status ?? '0');
        const infocode = String(data?.infocode ?? '');
        const isSuccess = status === AMAP_SUCCESS_STATUS
            && (!infocode || infocode === AMAP_SUCCESS_INFOCODE);

        if (!isSuccess) {
            const infocode = data?.infocode || 'unknown';
            const errorMsg = data?.info || data?.message || '搜索失败';
            
            // 根据高德 API 的错误码提供详细提示
            let detailedMsg = errorMsg;
            if (infocode === '10000') {
                detailedMsg = '未找到匹配的地点';
            } else if (infocode === '10001') {
                detailedMsg = '用户密钥错误，请联系管理员';
            } else if (infocode === '10002') {
                detailedMsg = '用户IP被限制，请稍后重试';
            } else if (infocode === '10003') {
                detailedMsg = '日调用量超限，请明天再试';
            } else if (infocode === '10004') {
                detailedMsg = '服务不支持此操作';
            } else if (infocode === '10005') {
                detailedMsg = '必填参数缺失';
            } else if (infocode === '20000') {
                detailedMsg = '请求参数非法';
            }
            
            throw new Error(`高德搜索失败: ${detailedMsg} (status=${status}, 错误码=${infocode})`);
        }

        // 解析 POI 列表
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
        }).filter(item => item.lon !== undefined && item.lat !== undefined);

        const total = Number(data?.count ?? items.length);
        return { items, total: Number.isFinite(total) ? total : items.length };
    } catch (error) {
        // 处理后端或 API 错误
        console.error('Amap search error:', error);
        
        const errorMsg = error.message || '搜索失败';
        
        if (error.isQuotaExceeded) {
            throw new Error('高德API配额已用完，请升级账户或稍后重试');
        }
        
        if (error.originalError?.response?.status === 401) {
            throw new Error('权限不足，请确保已正确配置高德API Key，如问题持续请联系管理员');
        }
        
        if (error.originalError?.response?.status === 403) {
            throw new Error('高德API访问被拒绝，请检查API Key是否有效');
        }
        
        if (error.originalError?.response?.status === 503) {
            throw new Error('高德服务暂时不可用，请稍后重试');
        }
        
        if (errorMsg.includes('错误码')) {
            throw error; // 重新抛出带有错误码的错误
        }
        
        if (errorMsg.includes('无法连接')) {
            throw new Error('无法连接到高德服务，请检查网络');
        }
        
        if (errorMsg.includes('超时')) {
            throw new Error('搜索请求超时，请稍后重试');
        }
        
        throw new Error(`高德地名搜索失败: ${errorMsg}`);
    }
}

export async function fetchLocationResultsByService({
    service,
    keywords,
    page = 1,
    pageSize = 10,
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
        return searchWithAmap({ keywords, page, pageSize });
    }
    throw new Error(`未知搜索服务: ${service}`);
}
