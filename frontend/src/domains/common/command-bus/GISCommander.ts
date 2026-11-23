/**
 * GISCommander - Agent-facing GIS tool facade.
 *
 * It owns geocoding and fixed tool-to-command mappings while all map mutations
 * go through MapCommandBus. No arbitrary URL or command path is exposed.
 */

import { apiAddressGeocode, apiReverseGeocodeWithFallback, apiWeather } from '@/api/index';
import {
    fetchLocationResultsByService,
    searchWithAmapAround,
    searchWithNominatim,
} from '@/api/locationSearch';
import { DEFAULT_SEARCH_ZOOM, MAX_SEARCH_ZOOM } from '@common/utils/mapDefaults';

/**
 * @param {Object} deps
 * @param {Object} deps.commandBus 地图命令总线
 * @param {Function} [deps.getMapContext] 返回当前地图上下文快照（含 center），
 *   用于「附近的餐馆」这类需要圆心的周边检索；缺省时该类查询退化为文本检索。
 */
// ────────────────── 「附近」意图识别 ──────────────────
/** 「附近」类意图：命中后必须用周边检索，否则会退化成全国范围的首条结果 */
const NEARBY_INTENT_PATTERN = /(附近|周边|周围|最近的)/;
/** 周边检索前需剔除的意图词与动词/助词，只留可检索的类目词 */
const NEARBY_STRIP_PATTERN = /(附近|周边|周围|最近的|搜索|查找|查询|寻找|看看|显示|一下|找|的)/g;

/** 去掉「附近/周边」等意图词与动词，留下可检索的类目词（「搜索附近的餐馆」→「餐馆」） */
function stripNearbyWords(query: any) {
    return String(query || '').replace(NEARBY_STRIP_PATTERN, '').trim();
}

/** 判断查询是否属于周边检索意图 */
function isNearbyIntent(query: any) {
    return NEARBY_INTENT_PATTERN.test(String(query || ''));
}

export interface GISCommanderDeps {
    /** 地图命令总线（所有地图变更都经它下发） */
    commandBus?: any;
    /** 返回当前地图上下文快照（含 center），用于「附近的餐馆」这类周边检索 */
    getMapContext?: () => any;
    /**
     * 只读图层清单（V3.7.9）。由宿主注入，聚合 2D 受管图层与 3D 图层记录；
     * 缺失时 `list_layers` / `get_layer_info` 返回结构化失败，不谎报空列表。
     */
    getLayers?: () => Array<Record<string, any>>;
    /**
     * 只读测量结果（V3.7.9 引入，V3.7.10 补齐 2D）。
     * 2D 与 3D 均有落库，返回值带 `view` 说明来源引擎。
     */
    getMeasureResult?: () => Record<string, any>;
}

export function createGISCommander({ commandBus, getMapContext, getLayers, getMeasureResult }: GISCommanderDeps = {}) {
    /**
     * 当前视图中心所在城市（用于文本检索的 city 限定），按约 1km 网格缓存。
     *
     * 必须声明在工厂作用域而非 searchAndZoom 内部：放在函数体内时每次调用都会重建，
     * 而单次调用里 resolveCurrentCity() 最多执行一次，缓存永远不会命中（等于没有）。
     */
    let cityCache = { key: '', value: '' };

    function getErrorMessage(error: unknown, fallback = 'unknown'): string {
        if (error instanceof Error && error.message) return error.message;
        if (typeof error === 'object' && error !== null && 'message' in error) {
            const msg = (error as { message?: unknown }).message;
            if (typeof msg === 'string' && msg) return msg;
        }
        return fallback;
    }

    function execute(command: string, params?: Record<string, any>) {
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

    function setMapView(params: any = {}) {
        return execute('setMapView', params);
    }

    function setViewCenter(params: any = {}) {
        return execute('setViewCenter', params);
    }

    function setCameraOrientation(params: any = {}) {
        return execute('setCameraOrientation', params);
    }

    function zoomToExtent(params: any = {}) {
        return execute('zoomToExtent', params);
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
    /** 通过 Nominatim（OpenStreetMap）地理编码：国外地名 / POI，Amap 覆盖不到时的降级路径 */
    async function geocodeWithNominatim(query: any) {
        const { items } = await searchWithNominatim({ keywords: query, pageSize: 1 });
        const best = Array.isArray(items) && items[0];
        if (!best) return null;
        const lng = Number(best.lon);
        const lat = Number(best.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return { lng, lat, formattedAddress: best.display_name || best.name || query };
    }

    async function searchAndZoom({
        query,
        city = '',
        zoom = DEFAULT_SEARCH_ZOOM,
        engine = 'auto',
    }: { query?: string; city?: string; zoom?: number; engine?: string } = {}) {
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
        async function locate(lng: number, lat: number, address: string, provider: string) {
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
            } catch (error: unknown) {
                console.warn(`[GISCommander] 搜索结果落图失败：${getErrorMessage(error)}`);
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
            } catch (error: unknown) {
                console.warn(`[GISCommander] 解析当前城市失败：${getErrorMessage(error)}`);
            }
            cityCache = { key, value: cityName };
            return cityName;
        }

        /**
         * 以当前视图中心做周边检索。
         * 半径先 5km（城市尺度），无结果再放宽到 50km（郊野/新区），
         * 避免一上来就把搜索范围撒到全国。
         */
        async function searchAmapAround(query: any) {
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
                } catch (error: unknown) {
                    console.warn(`[GISCommander] 高德周边检索失败「${query}」(r=${radius})：${getErrorMessage(error)}`);
                }
            }
            return null;
        }

        async function searchAmapGeocode(query: string, cityName = '') {
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
            } catch (error: unknown) {
                console.warn(`[GISCommander] 高德地理编码未命中「${query}」：${getErrorMessage(error)}`);
            }
            return null;
        }

        async function searchAmapPoiText(query: any, cityName = '') {
            try {
                const { items } = await fetchLocationResultsByService({
                    service: 'amap',
                    keywords: query,
                    city: cityName,
                    pageSize: 5,
                });
                const hit = (items || []).find(
                    (item: any) => Number.isFinite(item.lon) && Number.isFinite(item.lat),
                );
                if (hit) {
                    return {
                        lng: hit.lon,
                        lat: hit.lat,
                        address: hit.display_name || hit.name,
                        provider: cityName ? 'amap-poi-city' : 'amap-poi',
                    };
                }
            } catch (error: unknown) {
                console.warn(`[GISCommander] 高德 POI 检索未命中「${query}」：${getErrorMessage(error)}`);
            }
            return null;
        }

        try {
            // 引擎 1：高德 Amap（国内首选）
            if (engine === 'auto' || engine === 'amap') {
                // 文本检索不能带着「附近的」去匹配店名：高德会真的命中名字里含这三个字的 POI
                // （实测会跳到台湾一家店），因此类目词先剥离意图词再检索。
                const poiQuery = isNearbyIntent(normalizedQuery)
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
        } catch (error: unknown) {
            return {
                success: false,
                code: 'GEOCODE_FAILED',
                message: `Search failed for "${normalizedQuery}": ${getErrorMessage(error, 'network or service error')}`,
            };
        }
    }

    function switchBasemap(params: any = {}) {
        return execute('switchBasemap', params);
    }

    // ────────────────── 图层管理（V3.7.9） ──────────────────

    /** 读取宿主注入的图层清单；宿主未提供时返回 null 由调用方判定失败 */
    function readLayers(): Array<Record<string, any>> | null {
        if (typeof getLayers !== 'function') return null;
        try {
            return getLayers() || [];
        } catch (error: unknown) {
            console.warn(`[GISCommander] 图层清单读取失败：${getErrorMessage(error)}`);
            return null;
        }
    }

    /**
     * 读取当前地图状态（引擎、中心、缩放/相机、底图、图层计数）。
     * 纯读，不改画布，因此不走 commandBus。
     *
     * @param {Object} params
     * @param {boolean} [params.includeLayerNames=false] - 是否附带图层名称清单（图层多时会变长）
     */
    function getMapState({ includeLayerNames = false } = {} as { includeLayerNames?: boolean }) {
        const context = typeof getMapContext === 'function' ? getMapContext() : null;
        if (!context) {
            return {
                success: false,
                code: 'MAP_CONTEXT_UNAVAILABLE',
                message: 'Map context is not available yet',
            };
        }

        const layers = readLayers();
        const list = layers || [];
        const cameraHeight = Number(context?.cesium?.cameraHeight);

        return {
            success: true,
            code: 'OK',
            message: `${context.view === 'cesium' ? '3D' : '2D'} 视图，当前图层 ${
                layers ? list.length : '未知'
            } 个`,
            view: context.view,
            center: context.center,
            zoom: Number.isFinite(Number(context?.ol?.zoom)) ? Number(context.ol.zoom) : null,
            camera: Number.isFinite(cameraHeight)
                ? {
                      height: cameraHeight,
                      heading: context.cesium.heading,
                      pitch: context.cesium.pitch,
                      roll: context.cesium.roll,
                  }
                : null,
            basemap: context.basemap || null,
            layerCount: layers ? list.length : null,
            visibleLayerCount: layers ? list.filter((l) => l?.visible !== false).length : null,
            ...(includeLayerNames ? { layerNames: list.map((l) => l?.name).filter(Boolean) } : {}),
        };
    }

    /**
     * 列出可被操作的图层（只读）。
     *
     * @param {Object} params
     * @param {'all'|'ol'|'cesium'} [params.engine='all'] - 按引擎过滤
     * @param {boolean} [params.visibleOnly=false] - 仅返回可见图层
     * @param {string} [params.keyword=''] - 按名称/id 模糊匹配
     * @param {number} [params.limit=50] - 返回条数上限（1~200），超出部分用 total 提示
     */
    function listLayers({
        engine = 'all',
        visibleOnly = false,
        keyword = '',
        limit = 50,
    } = {} as { engine?: string; visibleOnly?: boolean; keyword?: string; limit?: number }) {
        const layers = readLayers();
        if (!layers) {
            return {
                success: false,
                code: 'LAYER_LIST_UNAVAILABLE',
                message: 'Layer listing is not available in the current runtime',
            };
        }

        let filtered = layers;
        if (engine === 'ol' || engine === 'cesium') {
            filtered = filtered.filter((l) => l?.engine === engine);
        }
        if (visibleOnly) {
            filtered = filtered.filter((l) => l?.visible !== false);
        }
        const kw = String(keyword || '').trim().toLowerCase();
        if (kw) {
            filtered = filtered.filter(
                (l) =>
                    String(l?.name || '').toLowerCase().includes(kw) ||
                    String(l?.id || '').toLowerCase().includes(kw),
            );
        }

        const total = filtered.length;
        const cap = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 50;
        return {
            success: true,
            code: 'OK',
            message: `共 ${total} 个图层${total > cap ? `，返回前 ${cap} 个` : ''}`,
            total,
            returned: Math.min(total, cap),
            truncated: total > cap,
            layers: filtered.slice(0, cap),
        };
    }

    /**
     * 读取单个图层的详情（只读）。
     * @param {Object} params
     * @param {string} params.layerId - 图层 id（`list_layers` 返回的 id 或 rawId）
     */
    function getLayerInfo({ layerId } = {} as { layerId?: string }) {
        const id = String(layerId || '').trim();
        if (!id) {
            return { success: false, code: 'INVALID_ARGUMENT', message: 'layerId is required' };
        }
        const layers = readLayers();
        if (!layers) {
            return {
                success: false,
                code: 'LAYER_LIST_UNAVAILABLE',
                message: 'Layer listing is not available in the current runtime',
            };
        }
        const hit = layers.find((l) => l?.id === id || l?.rawId === id);
        if (!hit) {
            return {
                success: false,
                code: 'LAYER_NOT_FOUND',
                message: `No layer matches id "${id}"`,
            };
        }
        return { success: true, code: 'OK', message: `图层「${hit.name || hit.id}」详情已读取`, layer: hit };
    }

    /** 读取 3D 最近一次测量结果（只读） */
    function readMeasureResult() {
        if (typeof getMeasureResult !== 'function') {
            return {
                success: false,
                code: 'MEASURE_UNAVAILABLE',
                message: 'Measurement results are not available in the current runtime',
            };
        }
        try {
            return getMeasureResult() || {
                success: false,
                code: 'NO_MEASUREMENT',
                message: 'No measurement result recorded yet',
            };
        } catch (error: unknown) {
            return {
                success: false,
                code: 'MEASURE_UNAVAILABLE',
                message: `Failed to read measurement result: ${getErrorMessage(error)}`,
            };
        }
    }

    /**
     * 设置图层可见性（走 commandBus）。
     * @param {Object} params
     * @param {string} params.layerId - 图层 id
     * @param {boolean} params.visible - 目标可见性
     */
    async function setLayerVisibility(params: any = {}) {
        const result = await execute('setLayerVisibility', params);
        if (result?.success && !result.message) {
            result.message = `图层「${result.layerId}」已${result.visible ? '显示' : '隐藏'}`;
        }
        return result;
    }

    /**
     * 设置图层透明度（走 commandBus）。
     * @param {Object} params
     * @param {string} params.layerId - 图层 id
     * @param {number} params.opacity - 0~1
     */
    async function setLayerOpacity(params: any = {}) {
        const result = await execute('setLayerOpacity', params);
        if (result?.success && !result.message) {
            const pct = Math.round(Number(result.opacity ?? params?.opacity ?? 0) * 100);
            result.message = `图层「${result.layerId}」透明度已设为 ${pct}%`;
        }
        return result;
    }

    /**
     * 缩放到指定图层范围（走 commandBus）。
     * @param {Object} params
     * @param {string} params.layerId - 图层 id
     */
    async function zoomToLayer(params: any = {}) {
        const result = await execute('zoomToLayer', params);
        if (result?.success && !result.message) {
            result.message = `已缩放到图层「${result.layerId}」范围`;
        }
        return result;
    }

    /**
     * 单独显示指定图层（隐藏其余用户图层，走 commandBus；仅 2D）。
     * @param {Object} params
     * @param {string} params.layerId - 图层 id
     */
    async function soloLayer(params: any = {}) {
        const result = await execute('soloLayer', params);
        if (result?.success && !result.message) {
            const hidden = Array.isArray(result.hiddenLayers) ? result.hiddenLayers : [];
            result.message = hidden.length
                ? `已只显示图层「${result.layerId}」，隐藏了 ${hidden.length} 个图层：${hidden.join('、')}`
                : `已只显示图层「${result.layerId}」`;
        }
        return result;
    }

    /**
     * 删除图层（不可撤销，走 commandBus）。
     * @param {Object} params
     * @param {string} params.layerId - 图层 id
     */
    async function removeLayer(params: any = {}) {
        const result = await execute('removeLayer', params);
        if (result?.success && !result.message) {
            const name = result.name || result.layerId;
            const count = Number(result.featureCount ?? 0);
            // 3D 场景未挂载时只删了记录，数据源可能残留在 dataSources 里，必须说明
            const sceneNote =
                result.sceneApplied === false ? '（3D 场景未挂载，仅移除了图层记录，场景数据可能残留）' : '';
            result.message = `已删除图层「${name}」${count > 0 ? `（${count} 个要素）` : ''}${sceneNote}`;
        }
        return result;
    }

    /**
     * 导出图层要素为 GeoJSON 文本（不写文件，走 commandBus；仅 2D）。
     * @param {Object} params
     * @param {string} params.layerId - 图层 id
     * @param {number} [params.limit=500] - 最大返回要素数（1~2000）
     */
    async function exportLayerGeoJson(params: any = {}) {
        const result = await execute('exportLayerGeoJson', params);
        if (result?.success && !result.message) {
            const total = Number(result.featureCount ?? 0);
            const returned = Number(result.returnedFeatures ?? 0);
            result.message = result.truncated
                ? `图层「${result.layerName || result.layerId}」共 ${total} 个要素，已返回前 ${returned} 个（已截断）`
                : `图层「${result.layerName || result.layerId}」共 ${returned} 个要素，已全部返回`;
        }
        return result;
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
    function addSearchResultLayer(params: any = {}) {
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
            } catch (error: unknown) {
                return {
                    success: false,
                    code: 'GEOCODE_FAILED',
                    message: `Failed to resolve "${requestedCity}" to an adcode: ${getErrorMessage(error, 'geocoding service error')}`,
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
        } catch (error: unknown) {
            return {
                success: false,
                code: 'WEATHER_QUERY_FAILED',
                message: `Weather query failed for adcode ${resolvedAdcode}: ${getErrorMessage(error, 'upstream service error')}`,
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
        // 只读图层与测量（V3.7.9）
        getMapState,
        listLayers,
        getLayerInfo,
        readMeasureResult,
        // 图层变更（V3.7.9，经 commandBus）
        setLayerVisibility,
        setLayerOpacity,
        zoomToLayer,
        soloLayer,
        exportLayerGeoJson,
        removeLayer,
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

