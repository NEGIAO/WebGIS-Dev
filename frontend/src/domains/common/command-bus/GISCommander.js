/**
 * GISCommander - Agent-facing GIS tool facade.
 *
 * It owns geocoding and fixed tool-to-command mappings while all map mutations
 * go through MapCommandBus. No arbitrary URL or command path is exposed.
 */

import { apiAddressGeocode, apiReverseGeocodeWithFallback, apiWeather } from '@/api/index.js';
import {
    fetchLocationResultsByService,
    searchWithAmapAround,
    searchWithNominatim,
} from '@/api/locationSearch.js';
import { DEFAULT_SEARCH_ZOOM, MAX_SEARCH_ZOOM } from '@common/utils/mapDefaults';

/** 「附近」类意图：命中后必须用周边检索，否则会退化成全国范围的首条结果 */
const NEARBY_INTENT_PATTERN = /(附近|周边|周围|最近的)/;
/** 周边检索前需要剔除的意图词与动词/助词，只留下可检索的类目词 */
const NEARBY_STRIP_PATTERN = /(附近|周边|周围|最近的|搜索|查找|查询|寻找|看看|显示|一下|找|的)/g;

/**
 * 去掉「附近/周边」等意图词与动词，留下可检索的类目词。
 * 例：「搜索附近的餐馆」→「餐馆」。
 * @param {string} query 原始查询
 * @returns {string}
 */
function stripNearbyWords(query) {
    return String(query || '').replace(NEARBY_STRIP_PATTERN, '').trim();
}

/**
 * @param {Object} deps
 * @param {Object} deps.commandBus 地图命令总线
 * @param {Function} [deps.getMapContext] 返回当前地图上下文快照（含 center），
 *   用于「附近的餐馆」这类需要圆心的周边检索；缺省时该类查询退化为文本检索。
 */
export function createGISCommander({ commandBus, getMapContext } = {}) {
    /**
     * 当前视图中心所在城市（用于文本检索的 city 限定），按约 1km 网格缓存。
     *
     * 必须声明在工厂作用域而非 searchAndZoom 内部：放在函数体内时每次调用都会重建，
     * 而单次调用里 resolveCurrentCity() 最多执行一次，缓存永远不会命中（等于没有）。
     */
    let cityCache = { key: '', value: '' };

    function execute(command, params) {
        if (!commandBus || typeof commandBus.execute !== 'function') {
            return Promise.resolve({
                success: false,
                code: 'MAP_COMMAND_BUS_NOT_READY',
                command,
                message: 'Map command bus is not ready',
            });
        }
        return commandBus.execute(command, params || {});
    }

    function setMapView(params = {}) {
        return execute('setMapView', params);
    }

    function setViewCenter(params = {}) {
        return execute('setViewCenter', params);
    }

    function setCameraOrientation(params = {}) {
        return execute('setCameraOrientation', params);
    }

    function zoomToExtent(params = {}) {
        return execute('zoomToExtent', params);
    }

    /**
     * 通过 Nominatim（OpenStreetMap）地理编码。
     * 用于国外地名 / POI，Amap 无法覆盖时使用。
     * @returns {Promise<{lng:number,lat:number,formattedAddress:string}|null>}
     */
    async function geocodeWithNominatim(query) {
        const { items } = await searchWithNominatim({ keywords: query, pageSize: 1 });
        const best = Array.isArray(items) && items[0];
        if (!best) return null;
        const lng = Number(best.lon);
        const lat = Number(best.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lng,
            lat,
            formattedAddress: best.display_name || best.name || query,
        };
    }

    /**
     * 搜索地名并缩放到目标位置。
     *
     * @param {Object} params
     * @param {string} params.query - 地名、地址或 POI
     * @param {string} [params.city=''] - 城市限定（仅 Amap 生效）
     * @param {number} [params.zoom=DEFAULT_SEARCH_ZOOM] - 目标缩放级别（单源见 @common/utils/mapDefaults）
     * @param {'auto'|'amap'|'nominatim'} [params.engine='auto'] - 地理编码引擎：
     *   - 'auto': 优先 Amap（国内），无结果时降级到 Nominatim（国际）
     *   - 'amap': 强制使用高德（仅国内有效）
     *   - 'nominatim': 强制使用 Nominatim（国际地名推荐）
     * @returns {Promise<Object>}
     */
    async function searchAndZoom({ query, city = '', zoom = DEFAULT_SEARCH_ZOOM, engine = 'auto' } = {}) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'Search query cannot be empty' };
        }

        const targetZoom = Math.min(Math.max(Number(zoom) || DEFAULT_SEARCH_ZOOM, 0), MAX_SEARCH_ZOOM);

        /**
         * 执行地图定位（公共逻辑）。
         * @param {number} lng WGS-84 经度
         * @param {number} lat WGS-84 纬度
         * @param {string} address 显示地址
         * @param {string} provider 来源引擎标识
         */
        async function locate(lng, lat, address, provider) {
            const commandResult = await execute('setViewCenter', { lng, lat, zoom: targetZoom });
            if (!commandResult.success) return commandResult;

            // 命中结果同时落图进 TOC：地图上一眼可见，也便于后续在图层树里继续操作。
            // 落图失败（引擎未就绪、坐标被拒、建层被拒等）不影响定位本身，只降级为提示信息。
            let layerName;
            try {
                const layerResult = await addSearchResultLayer({
                    name: address,
                    lng,
                    lat,
                    address,
                });
                if (layerResult?.success) layerName = layerResult.layerName;
            } catch (error) {
                console.warn(`[GISCommander] 搜索结果落图失败：${error?.message || 'unknown'}`);
            }

            return {
                ...commandResult,
                message: `Located "${address}" at (${lng.toFixed(6)}, ${lat.toFixed(6)}) [${provider}]${
                    layerName ? `; layer added to TOC: ${layerName}` : ''
                }`,
                location: { lng, lat, address, provider },
                ...(layerName ? { layerName } : {}),
            };
        }

        /** 当前视图中心（WGS-84）；运行时未就绪或 URL 无经纬度时返回 null */
        function readCurrentCenter() {
            const context = typeof getMapContext === 'function' ? getMapContext() : null;
            const lng = Number(context?.center?.lng);
            const lat = Number(context?.center?.lat);
            return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
        }

        /**
         * 高德侧的分级检索，逐级降级，任一命中即返回。
         *
         * 为什么不是一个接口打天下：高德把「地址」和「POI」拆成了不同服务，
         * 用错服务的表现是 `status=0 / infocode=30001 / ENGINE_RESPONSE_DATA_ERROR`
         * （本次线上 400 的来源）：
         *   - `/v3/geocode/geo` 只认地址与行政区，传「餐馆」这类类目词必然 30001；
         *   - `/v3/place/text` 认 POI 与类目词，但**没有位置偏置**，搜「餐馆」返回全国首条
         *     （实测是北京西单的火锅店）——这正是「搜索默认都落在北京」的原因；
         *   - `/v3/place/around` 以当前视图中心为圆心、按距离排序，才是「附近」的正确表达。
         *
         * 因此顺序是：地址编码 → 周边检索 → 城市限定文本检索 → 全国文本检索。
         * 地址排在最前，是因为「上海」「南京大学」这类查询必须落到城市/机构本身；
         * 若先走周边，会命中「上海xx银行」这类同名 POI。
         */

        /** 当前中心所在城市（用于文本检索的 city 限定），缓存由工厂作用域持有 */
        async function resolveCurrentCity() {
            const center = readCurrentCenter();
            if (!center) return '';
            const key = `${center.lng.toFixed(2)},${center.lat.toFixed(2)}`;
            if (cityCache.key === key) return cityCache.value;

            let cityName = '';
            try {
                const { data } = await apiReverseGeocodeWithFallback(center.lng, center.lat, { silent: true });
                // 直辖市的高德返回里 city 是空数组，需退回 province（如「北京市」）
                cityName = String(data?.city || data?.province || data?.adcode || '').trim();
            } catch (error) {
                console.warn(`[GISCommander] 解析当前城市失败：${error?.message || 'unknown'}`);
            }
            cityCache = { key, value: cityName };
            return cityName;
        }

        /**
         * 以当前视图中心做周边检索。
         * 半径先 5km（城市尺度），无结果再放宽到 50km（郊野/新区），
         * 避免一上来就把搜索范围撒到全国。
         */
        async function searchAmapAround(query) {
            const center = readCurrentCenter();
            if (!center) return null;
            const keyword = stripNearbyWords(query);
            // 纯「附近」而无类目词时，around 缺少 keywords/types 会被高德判为参数错误
            if (!keyword) return null;

            for (const radius of [5000, 50000]) {
                try {
                    const { items } = await searchWithAmapAround({
                        keywords: keyword,
                        lng: center.lng,
                        lat: center.lat,
                        radius,
                        pageSize: 1,
                    });
                    const hit = (items || [])[0];
                    if (hit) {
                        return {
                            lng: hit.lon,
                            lat: hit.lat,
                            address: hit.display_name || hit.name,
                            provider: 'amap-around',
                        };
                    }
                } catch (error) {
                    console.warn(`[GISCommander] 高德周边检索失败「${query}」(r=${radius})：${error?.message || 'unknown'}`);
                }
            }
            return null;
        }

        async function searchAmapGeocode(query, cityName) {
            try {
                const geocodeResult = await apiAddressGeocode(query, cityName, { silent: true });
                const result = geocodeResult?.data;
                if (result && Number.isFinite(result.lng) && Number.isFinite(result.lat)) {
                    return {
                        lng: result.lng,
                        lat: result.lat,
                        address: result.formattedAddress || query,
                        provider: 'amap',
                    };
                }
            } catch (error) {
                console.warn(`[GISCommander] 高德地理编码未命中「${query}」：${error?.message || 'unknown'}`);
            }
            return null;
        }

        async function searchAmapPoiText(query, cityName = '') {
            try {
                const { items } = await fetchLocationResultsByService({
                    service: 'amap',
                    keywords: query,
                    city: cityName,
                    pageSize: 5,
                });
                const hit = (items || []).find(
                    (item) => Number.isFinite(item.lon) && Number.isFinite(item.lat),
                );
                if (hit) {
                    return {
                        lng: hit.lon,
                        lat: hit.lat,
                        address: hit.display_name || hit.name,
                        provider: cityName ? 'amap-poi-city' : 'amap-poi',
                    };
                }
            } catch (error) {
                console.warn(`[GISCommander] 高德 POI 检索未命中「${query}」：${error?.message || 'unknown'}`);
            }
            return null;
        }

        try {
            // 引擎 1：高德 Amap（国内首选）
            if (engine === 'auto' || engine === 'amap') {
                // 文本检索不能带着「附近的」去匹配店名：高德会真的命中名字里含这三个字的 POI
                // （实测会跳到台湾一家店），因此类目词先剥离意图词再检索。
                const poiQuery = NEARBY_INTENT_PATTERN.test(normalizedQuery)
                    ? (stripNearbyWords(normalizedQuery) || normalizedQuery)
                    : normalizedQuery;
                const amapAttempts = [
                    () => searchAmapGeocode(normalizedQuery, city),
                    () => searchAmapAround(poiQuery),
                    async () => {
                        const cityName = await resolveCurrentCity();
                        return cityName ? searchAmapPoiText(poiQuery, cityName) : null;
                    },
                    () => searchAmapPoiText(poiQuery),
                ];
                for (const attempt of amapAttempts) {
                    const hit = await attempt();
                    if (hit) return await locate(hit.lng, hit.lat, hit.address, hit.provider);
                }
                if (engine === 'amap') {
                    return {
                        success: false,
                        code: 'GEOCODE_FAILED',
                        message: `Amap found no match for "${normalizedQuery}" (tried around / geocode / POI text search)`,
                    };
                }
                console.warn(`[GISCommander] Amap 三级检索均未命中 "${normalizedQuery}"，降级到 Nominatim`);
            }

            // 引擎 2：Nominatim / OpenStreetMap（国际兜底或强制指定）
            if (engine === 'auto' || engine === 'nominatim') {
                const nominatimResult = await geocodeWithNominatim(normalizedQuery);
                if (nominatimResult) {
                    return await locate(
                        nominatimResult.lng,
                        nominatimResult.lat,
                        nominatimResult.formattedAddress,
                        'nominatim',
                    );
                }
            }

            return {
                success: false,
                code: 'GEOCODE_NOT_FOUND',
                message: `No match found for "${normalizedQuery}" across available geocoding services; try a more specific query`,
            };
        } catch (error) {
            return {
                success: false,
                code: 'GEOCODE_FAILED',
                message: `Search failed for "${normalizedQuery}": ${error?.message || 'network or service error'}`,
            };
        }
    }

    function switchBasemap(params = {}) {
        return execute('switchBasemap', params);
    }

    /**
     * 把搜索命中的地点作为图层落到 TOC（符号化沿用各引擎的默认样式）。
     *
     * 刻意不做成独立的 LLM 工具：落图是 search_and_zoom 的附带效果，
     * 让模型自己决定「要不要建图层」只会多一轮 token，还容易漏。
     *
     * @param {Object} params
     * @param {string} params.name - 图层名（通常为地址或 POI 名）
     * @param {number} params.lng - WGS-84 经度
     * @param {number} params.lat - WGS-84 纬度
     * @param {string} [params.address] - 可选地址说明，写入要素属性
     * @returns {Promise<Object>}
     */
    function addSearchResultLayer(params = {}) {
        return execute('addSearchResultLayer', params);
    }

    /**
     * 查询中国境内城市的天气（实况 / 多日预报）。
     *
     * 与其它工具不同，本方法只读外部数据、不改动画布状态，因此**不走 MapCommandBus**，
     * 而是直接复用天气模块既有的解析链路，保证 Agent 与天气面板拿到同一份归一化结果：
     *   城市名 → 正地理编码取 adcode → 取不到时用逆地理编码兜底。
     * 高德天气接口只接受 6 位 adcode，不接受城市名，故这一步不可省。
     *
     * @param {Object} params
     * @param {string} [params.city=''] - 城市名或「省+市/区县」全称
     * @param {string} [params.adcode=''] - 6 位行政区划编码，与 city 二者至少其一
     * @param {'base'|'all'} [params.type='base'] - base=实况，all=未来 4 天预报
     * @returns {Promise<Object>} 结构化结果，失败时返回 success:false + code
     */
    async function getWeather({ city = '', adcode = '', type = 'base' } = {}) {
        const normalizedType = type === 'all' ? 'all' : 'base';
        const requestedCity = String(city || '').trim();
        let resolvedAdcode = String(adcode || '').trim();

        // 1) adcode 缺失时由城市名反解
        if (!/^\d{6}$/.test(resolvedAdcode)) {
            if (!requestedCity) {
                return {
                    success: false,
                    code: 'INVALID_ARGUMENT',
                    message: 'Missing both city and adcode: at least one is required to query weather',
                };
            }

            try {
                const geocodeResponse = await apiAddressGeocode(requestedCity, requestedCity, {
                    silent: true,
                });
                const geocode = geocodeResponse?.data || null;
                resolvedAdcode = String(geocode?.adcode || '').trim();

                // 正地理编码偶尔只回坐标不回 adcode，此时用逆地理编码补齐
                if (
                    !/^\d{6}$/.test(resolvedAdcode) &&
                    Number.isFinite(geocode?.lng) &&
                    Number.isFinite(geocode?.lat)
                ) {
                    const reverseResponse = await apiReverseGeocodeWithFallback(
                        geocode.lng,
                        geocode.lat,
                        { silent: true },
                    );
                    resolvedAdcode = String(reverseResponse?.data?.adcode || '').trim();
                }
            } catch (error) {
                return {
                    success: false,
                    code: 'GEOCODE_FAILED',
                    message: `Failed to resolve "${requestedCity}" to an adcode: ${error?.message || 'geocoding service error'}`,
                };
            }
        }

        if (!/^\d{6}$/.test(resolvedAdcode)) {
            return {
                success: false,
                code: 'ADCODE_NOT_FOUND',
                message: `Could not resolve "${requestedCity}" to a 6-digit adcode; ask the user for a more specific Chinese city/district name or a 6-digit adcode`,
            };
        }

        // 2) 查询天气。getWeather 内部已做 infocode 归类与归一化，失败会 throw
        try {
            const response = await apiWeather(resolvedAdcode, normalizedType);
            const payload = response?.data || null;
            const live = payload?.live || null;
            const forecastCasts = Array.isArray(payload?.forecast?.casts)
                ? payload.forecast.casts
                : [];

            const displayCity =
                String(payload?.city || '').trim() || requestedCity || resolvedAdcode;

            // 只回传 LLM 可读所需字段，raw 不上行（体积大且含 infocode 噪音）
            const weather = {
                city: displayCity,
                province: String(payload?.province || '').trim(),
                adcode: String(payload?.adcode || resolvedAdcode),
                type: normalizedType,
                live: live
                    ? {
                          weather: live.weather,
                          temperature: live.temperature,
                          humidity: live.humidity,
                          windDirection: live.windDirection,
                          windPower: live.windPowerText,
                          reportTime: live.reportTime,
                      }
                    : null,
                forecast: forecastCasts.slice(0, 4).map((cast) => ({
                    date: cast.date,
                    week: cast.week,
                    dayWeather: cast.dayWeather,
                    nightWeather: cast.nightWeather,
                    dayTemp: cast.dayTemp,
                    nightTemp: cast.nightTemp,
                    dayWind: cast.dayWind,
                    dayPower: cast.dayPowerText,
                })),
            };

            let message;
            if (normalizedType === 'all') {
                const brief = weather.forecast
                    .map((cast) => `${cast.date} ${cast.dayWeather} ${cast.dayTemp}~${cast.nightTemp}℃`)
                    .join('；');
                message = brief
                    ? `${displayCity} 未来 ${weather.forecast.length} 天预报：${brief}`
                    : `${displayCity} 未返回预报数据`;
            } else {
                message = live
                    ? `${displayCity} 实况：${live.weather} ${live.temperature}℃，湿度 ${live.humidity}%，${live.windDirection}风 ${live.windPowerText}（${live.reportTime}）`
                    : `${displayCity} 未返回实况数据`;
            }

            return {
                success: Boolean(live || weather.forecast.length > 0),
                code: 'WEATHER_OK',
                message,
                weather,
            };
        } catch (error) {
            return {
                success: false,
                code: 'WEATHER_QUERY_FAILED',
                message: `Weather query failed for adcode ${resolvedAdcode}: ${error?.message || 'upstream service error'}`,
            };
        }
    }

    function dispose() {}

    return {
        setMapView,
        setViewCenter,
        setCameraOrientation,
        zoomToExtent,
        searchAndZoom,
        switchBasemap,
        addSearchResultLayer,
        getWeather,
        dispose,
    };
}

/**
 * @typedef {Object} GISCommanderAPI
 * @property {Function} setMapView
 * @property {Function} setViewCenter
 * @property {Function} setCameraOrientation
 * @property {Function} zoomToExtent
 * @property {Function} searchAndZoom
 * @property {Function} switchBasemap
 * @property {Function} addSearchResultLayer
 * @property {Function} getWeather
 * @property {Function} dispose
 */
