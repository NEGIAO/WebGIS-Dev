/**
 * 轻量 debounce，支持 .cancel() 取消待执行的调用
 * 替代 lodash-es/debounce，减少 ~25KB 依赖
 */
function debounce(fn, ms) {
    let timer = null;
    const debounced = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
    debounced.cancel = () => {
        clearTimeout(timer);
        timer = null;
    };
    return debounced;
}
import { onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Graticule from 'ol/layer/Graticule';
import { fromLonLat, toLonLat } from 'ol/proj';
import { unByKey } from 'ol/Observable';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { apiAddressGeocode } from '../api';
import {
    getGlobalUserLocationContext,
    USER_LOCATION_CONTEXT_CHANGE_EVENT,
} from '../utils/userLocationContext';
import { decodePos, encodePos } from '../utils/biz';
import { DEFAULT_BASEMAP_LAYER_INDEX, URL_LAYER_OPTIONS } from '../constants';
import { prioritizeTileSourceRequest } from './useTileSourceFactory';
// 新增：中心点标记所需导入
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';

const USER_PREFERENCE_BASEMAP_KEY = 'webgis_pref_default_basemap';

/**
 * 获取数组的第一个元素，如果不是数组则返回原值
 * @param {*} value - 待处理的值
 * @returns {*} 数组首元素或原值
 */
function getFirstValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

/**
 * 将值解析为有限的数字
 * @param {*} value - 待解析的值
 * @returns {number|null} 解析后的数字，或无法解析时返回 null
 */
function parseNumber(value) {
    const firstValue = getFirstValue(value);
    if (firstValue === null || firstValue === undefined) return null;
    if (typeof firstValue === 'string' && firstValue.trim() === '') return null;

    const raw = Number(firstValue);
    return Number.isFinite(raw) ? raw : null;
}

/**
 * 将值解析为整数
 * @param {*} value - 待解析的值
 * @returns {number|null} 解析后的整数，或无法解析时返回 null
 */
function parseInteger(value) {
    const raw = parseNumber(value);
    if (raw === null) return null;
    return Number.isInteger(raw) ? raw : null;
}

/**
 * 将数字格式化为指定小数位数的字符串
 * @param {*} value - 待格式化的值
 * @param {number} fractionDigits - 保留的小数位数
 * @returns {string|null} 格式化后的字符串，或无效时返回 null
 */
function formatNumber(value, fractionDigits) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    return numberValue.toFixed(fractionDigits);
}

/**
 * 规范化持久化二值标记（0/1）
 * @param {*} value - 原始标记值
 * @param {'0'|'1'} [fallback='0'] - 默认值
 * @returns {'0'|'1'} 规范化后的标记
 */
function normalizeBinaryFlag(value, fallback = '0') {
    const raw = String(getFirstValue(value) ?? '')
        .trim()
        .toLowerCase();
    if (raw === '1' || raw === 'true') return '1';
    if (raw === '0' || raw === 'false') return '0';
    return fallback === '1' ? '1' : '0';
}

/**
 * 从 URL hash 中解析查询参数
 * @returns {Object} 包含 lng、lat、z、l 的查询参数对象
 */
function parseHashQuery() {
    if (typeof window === 'undefined') return {};
    const hash = String(window.location.hash || '');
    const queryStart = hash.indexOf('?');
    if (queryStart < 0) return {};

    const params = new URLSearchParams(hash.slice(queryStart + 1));
    return {
        lng: params.get('lng'),
        lat: params.get('lat'),
        z: params.get('z'),
        l: params.get('l'),
        s: params.get('s'),
        loc: params.get('loc'),
        p: params.get('p'),
    };
}

function resolvePreferredDefaultLayerIndex() {
    if (typeof window === 'undefined') return DEFAULT_BASEMAP_LAYER_INDEX;

    const storage = window.localStorage;
    if (!storage) return DEFAULT_BASEMAP_LAYER_INDEX;

    const preferredBasemapId = String(storage.getItem(USER_PREFERENCE_BASEMAP_KEY) || '').trim();
    if (!preferredBasemapId) return DEFAULT_BASEMAP_LAYER_INDEX;

    const matchedIndex = Array.isArray(URL_LAYER_OPTIONS)
        ? URL_LAYER_OPTIONS.findIndex((item) => String(item || '').trim() === preferredBasemapId)
        : -1;

    if (matchedIndex >= 0) return matchedIndex;
    return DEFAULT_BASEMAP_LAYER_INDEX;
}

/**
 * 地图状态管理组合式函数
 * 负责 URL 同步、图层切换、地形线渲染与视图动画
 *
 * @param {Object} mapInstance - ShallowRef 包装的 OpenLayers Map 实例
 * @param {Object} options - 配置选项
 * @param {number} [options.defaultZoom=17] - 默认缩放级别
 * @param {number} [options.flyDuration=700] - 飞行动画持续时间（毫秒）
 * @param {number} [options.syncDebounceMs=500] - URL 同步防抖时间（毫秒）
 * @param {Function} [options.getLayerIndex] - 获取当前图层索引的回调函数
 * @param {Function} [options.onLayerIndexChange] - 图层索引变化的回调函数
 * @param {Object} [options.layerListRef] - 图层列表的 ref 对象
 * @param {Object} [options.layerInstances] - 图层实例映射表
 * @param {Array} [options.layerConfigs] - 图层配置数组
 * @param {Function} [options.resolveVisibleLayerIds] - 根据 option id 解析需要显示的图层列表
 * @param {Array} [options.satelliteLayers] - 卫星图层 ID 列表
 * @param {Array} [options.vectorLayers] - 矢量图层 ID 列表
 * @returns {Object} 返回公共 API 集合
 */
export function useMapState(mapInstance, options = {}) {
    const route = useRoute();
    const router = useRouter();

    const {
        defaultZoom = 17,
        flyDuration = 700,
        syncDebounceMs = 500,
        getLayerIndex = () => null,
        onLayerIndexChange = () => {},
        layerListRef = null,
        layerInstances = null,
        layerConfigs = null,
        resolveVisibleLayerIds = null,
        satelliteLayers = ['tianDiTu', 'Google', 'esri', 'google'],
        vectorLayers = ['tianDiTu_vec'],
    } = options;

    let moveEndKey = null;
    let graticuleLayer = null;
    let graticuleActive = false;
    let locationContextChangeHandler = null;

    // ---------- 新增：中心点标记相关变量 ----------
    let centerPointLayer = null;      // 中心点矢量图层
    let centerPointMoveEndKey = null; // 地图移动事件监听句柄

    const debouncedSyncUrlFromMap = debounce(() => {
        syncUrlFromMap();
    }, syncDebounceMs);

    /**
     * 读取查询参数值（同时支持 router.query 和 hash 查询）
     * @param {string} key - 参数键名
     * @returns {string|null} 参数值
     * @private
     */
    function readQueryValue(key) {
        const hashQuery = parseHashQuery();
        const hashValue = getFirstValue(hashQuery[key]);
        if (hashValue !== undefined && hashValue !== null && hashValue !== '') {
            return hashValue;
        }

        const routeValue = getFirstValue(route.query?.[key]);
        if (routeValue !== undefined && routeValue !== null && routeValue !== '') {
            return routeValue;
        }
        return null;
    }

    /**
     * 读取当前 URL 的完整查询参数快照（保留未知参数）
     * hash 查询参数优先级高于 route.query。
     * @returns {Record<string, string>}
     * @private
     */
    function getCurrentQuerySnapshot() {
        const snapshot = {};

        const routeQuery = route?.query || {};
        Object.keys(routeQuery).forEach((key) => {
            const value = getFirstValue(routeQuery[key]);
            if (value === undefined || value === null || value === '') return;
            snapshot[key] = String(value);
        });

        if (typeof window !== 'undefined') {
            const hash = String(window.location.hash || '');
            const queryStart = hash.indexOf('?');
            if (queryStart >= 0) {
                const hashParams = new URLSearchParams(hash.slice(queryStart + 1));
                hashParams.forEach((value, key) => {
                    if (value === undefined || value === null || value === '') return;
                    snapshot[key] = String(value);
                });
            }
        }

        return snapshot;
    }

    /**
     * 解析定位状态（loc 标记或全局定位上下文）
     * @returns {{
     *   hasLocationCondition: boolean,
     *   hasGlobalLocation: boolean,
     *   globalLng: number|null,
     *   globalLat: number|null
     * }}
     * @private
     */
    function resolveLocationState() {
        const locateFlagReady = normalizeBinaryFlag(readQueryValue('loc'), '0') === '1';
        const globalLocationContext = getGlobalUserLocationContext();
        const globalLng = parseNumber(globalLocationContext?.lon);
        const globalLat = parseNumber(globalLocationContext?.lat);
        const hasGlobalLocation = globalLng !== null && globalLat !== null;

        return {
            hasLocationCondition: locateFlagReady || hasGlobalLocation,
            hasGlobalLocation,
            globalLng,
            globalLat,
        };
    }

    /**
     * 生成 p 参数（定位满足时写短码，不满足写 0）
     * @param {number|null} fallbackLng
     * @param {number|null} fallbackLat
     * @returns {string}
     * @private
     */
    function resolvePositionCode(fallbackLng = null, fallbackLat = null) {
        const { hasLocationCondition, hasGlobalLocation, globalLng, globalLat } =
            resolveLocationState();

        if (!hasLocationCondition) return '0';

        const sourceLng = hasGlobalLocation ? globalLng : parseNumber(fallbackLng);
        const sourceLat = hasGlobalLocation ? globalLat : parseNumber(fallbackLat);
        if (sourceLng === null || sourceLat === null) return '0';

        const encoded = encodePos(sourceLng, sourceLat);
        return encoded && encoded !== '0' ? encoded : '0';
    }

    /**
     * 解析 URL 为地图状态对象
     * @returns {Object} 包含 lng、lat、zoom、layerIndex 的状态对象
     */
    function parseUrlToState() {
        let lng = parseNumber(readQueryValue('lng'));
        let lat = parseNumber(readQueryValue('lat'));
        const zoom = parseNumber(readQueryValue('z'));
        // 默认底图索引统一由 DEFAULT_BASEMAP_LAYER_INDEX 控制。
        const layerIndex =
            parseInteger(readQueryValue('l') ?? readQueryValue('layer')) ??
            resolvePreferredDefaultLayerIndex();

        //修复URL错误
        const compactPosCode = String(readQueryValue('p') ?? '').trim();

        if ((lng === null || lat === null) && compactPosCode && compactPosCode !== '0') {
            const { hasLocationCondition } = resolveLocationState();

            if (hasLocationCondition) {
                const decodedPos = decodePos(compactPosCode);

                if (
                    decodedPos &&
                    Number.isFinite(decodedPos.lng) &&
                    Number.isFinite(decodedPos.lat)
                ) {
                    lng = decodedPos.lng;
                    lat = decodedPos.lat;
                }
            }
        }

        return {
            lng,
            lat,
            zoom: zoom === null ? defaultZoom : zoom,
            layerIndex,
        };
    }

    /**
     * 构建查询参数对象
     * @param {Object} params - 地图参数 { lng, lat, zoom, layerIndex }
     * @returns {Object} 格式化的查询参数 { lng, lat, z, l }
     * @private
     */
    function buildQuery({ lng, lat, zoom, layerIndex }) {
        const shareFlag = normalizeBinaryFlag(readQueryValue('s'), '0');
        const locateFlag = normalizeBinaryFlag(readQueryValue('loc'), '0');
        const normalizedLayerIndex = Number.isInteger(layerIndex)
            ? layerIndex
            : DEFAULT_BASEMAP_LAYER_INDEX;
        const compactPosCode = resolvePositionCode(lng, lat);

        return {
            lng: formatNumber(lng, 6),
            lat: formatNumber(lat, 6),
            z: formatNumber(zoom, 2),
            l: String(normalizedLayerIndex),
            s: shareFlag,
            loc: locateFlag,
            p: compactPosCode || '0',
        };
    }

    /**
     * 判断新查询参数是否与当前 URL 参数相同
     * @param {Object} nextQuery - 新查询参数
     * @returns {boolean} 是否相同
     * @private
     */
    function isSameQuery(nextQuery) {
        const currentLng = String(readQueryValue('lng') ?? '');
        const currentLat = String(readQueryValue('lat') ?? '');
        const currentZoom = String(readQueryValue('z') ?? '');
        const currentLayer = String(readQueryValue('l') ?? readQueryValue('layer') ?? '');
        const currentShareFlag = normalizeBinaryFlag(readQueryValue('s'), '0');
        const currentLocateFlag = normalizeBinaryFlag(readQueryValue('loc'), '0');
        const currentPosCode = String(readQueryValue('p') ?? '0');

        return (
            currentLng === String(nextQuery.lng ?? '') &&
            currentLat === String(nextQuery.lat ?? '') &&
            currentZoom === String(nextQuery.z ?? '') &&
            currentLayer === String(nextQuery.l ?? '') &&
            currentShareFlag === String(nextQuery.s ?? '0') &&
            currentLocateFlag === String(nextQuery.loc ?? '0') &&
            currentPosCode === String(nextQuery.p ?? '0')
        );
    }

    /**
     * 更新 URL 查询参数，通过 router 或直接修改 location
     * @param {Object} nextQuery - 新查询参数
     * @private
     */
    function replaceUrlQuery(nextQuery) {
        if (
            !nextQuery?.lng ||
            !nextQuery?.lat ||
            !nextQuery?.z ||
            !nextQuery?.l ||
            !nextQuery?.s ||
            !nextQuery?.loc ||
            !nextQuery?.p
        )
            return;

        const mergedQuery = {
            ...getCurrentQuerySnapshot(),
            ...nextQuery,
        };

        Object.keys(mergedQuery).forEach((key) => {
            const value = mergedQuery[key];
            if (value === undefined || value === null || value === '') {
                delete mergedQuery[key];
                return;
            }
            mergedQuery[key] = String(value);
        });

        if (isSameQuery(nextQuery)) return;

        if (router && route) {
            void router
                .replace({
                    path: route.path || '/home',
                    query: mergedQuery,
                })
                .catch(() => {});
            return;
        }

        if (typeof window === 'undefined') return;

        const hashPath = String(window.location.hash || '#/home').split('?')[0] || '#/home';
        const params = new URLSearchParams(mergedQuery);
        const nextUrl = `${window.location.pathname}${window.location.search}${hashPath}?${params.toString()}`;
        window.location.replace(nextUrl);
    }

    /**
     * 监听全局定位上下文变化，触发 URL 中 p 参数同步
     * @private
     */
    function bindLocationContextSync() {
        if (typeof window === 'undefined' || locationContextChangeHandler) return;
        locationContextChangeHandler = () => {
            debouncedSyncUrlFromMap();
        };
        window.addEventListener(USER_LOCATION_CONTEXT_CHANGE_EVENT, locationContextChangeHandler);
    }

    /**
     * 停止全局定位上下文监听
     * @private
     */
    function stopLocationContextSync() {
        if (typeof window === 'undefined' || !locationContextChangeHandler) return;
        window.removeEventListener(
            USER_LOCATION_CONTEXT_CHANGE_EVENT,
            locationContextChangeHandler,
        );
        locationContextChangeHandler = null;
    }

    /**
     * 从当前地图状态同步 URL 查询参数
     * 提取地图中心和缩放级别，构建新查询参数并更新 URL
     */
    function syncUrlFromMap() {
        const map = mapInstance?.value;
        if (!map) return;

        const view = map.getView?.();
        const center = view?.getCenter?.();
        const zoom = view?.getZoom?.();
        if (!Array.isArray(center) || center.length < 2 || !Number.isFinite(zoom)) return;

        const [lng, lat] = toLonLat(center);
        const layerIndex = getLayerIndex();
        const nextQuery = buildQuery({ lng, lat, zoom, layerIndex });
        replaceUrlQuery(nextQuery);
    }

    /**
     * 绑定地图视图变化监听，自动同步 URL
     * 监听 moveend 事件，防抖调用 syncUrlFromMap
     */
    function bindMapViewSync() {
        const map = mapInstance?.value;
        if (!map || moveEndKey) return;
        bindLocationContextSync();
        moveEndKey = map.on('moveend', () => {
            debouncedSyncUrlFromMap();
        });
    }

    /**
     * 停止地图视图同步，清除事件监听和防抖定时器
     */
    function stopMapViewSync() {
        if (!moveEndKey) return;
        unByKey(moveEndKey);
        moveEndKey = null;
        debouncedSyncUrlFromMap.cancel();
        stopLocationContextSync();
    }

    /**
     * 地图飞行到指定视角
     * @param {Object} params - 目标参数
     * @param {number} [params.lng] - 经度（或 lng）
     * @param {number} [params.lat] - 纬度（或 lat）
     * @param {number} [params.zoom] - 缩放级别（或 z）
     * @param {number} [params.z] - 缩放级别（备选）
     * @param {number} [params.layerIndex] - 图层索引（或 l）
     * @param {number} [params.l] - 图层索引（备选）
     * @param {number} [params.duration] - 动画持续时间（毫秒）
     */
    function flyToView({ lng, lat, zoom, z, layerIndex, l, duration } = {}) {
        const normalizedLayerIndex = parseInteger(layerIndex ?? l);
        if (normalizedLayerIndex !== null) {
            onLayerIndexChange(normalizedLayerIndex);
        }

        const map = mapInstance?.value;
        const view = map?.getView?.();

        const normalizedLng = parseNumber(lng);
        const normalizedLat = parseNumber(lat);
        const normalizedZoom = parseNumber(zoom ?? z);

        if (view && normalizedLng !== null && normalizedLat !== null) {
            const targetZoom =
                normalizedZoom === null ? Number(view.getZoom?.() ?? defaultZoom) : normalizedZoom;

            if (typeof view.animate === 'function') {
                view.animate({
                    center: fromLonLat([normalizedLng, normalizedLat]),
                    zoom: targetZoom,
                    duration: Number(duration) > 0 ? Number(duration) : flyDuration,
                });
            } else {
                view.setCenter?.(fromLonLat([normalizedLng, normalizedLat]));
                view.setZoom?.(targetZoom);
            }
        }

        const finalLayerIndex =
            normalizedLayerIndex !== null ? normalizedLayerIndex : parseInteger(getLayerIndex());
        let finalLng = normalizedLng;
        let finalLat = normalizedLat;
        let finalZoom = normalizedZoom;

        if ((finalLng === null || finalLat === null || finalZoom === null) && view) {
            const currentCenter = view.getCenter?.();
            if (Array.isArray(currentCenter) && currentCenter.length >= 2) {
                const [currentLng, currentLat] = toLonLat(currentCenter);
                finalLng = finalLng === null ? currentLng : finalLng;
                finalLat = finalLat === null ? currentLat : finalLat;
            }
            const currentZoom = parseNumber(view.getZoom?.());
            finalZoom = finalZoom === null ? currentZoom : finalZoom;
        }

        if (
            finalLng === null ||
            finalLat === null ||
            finalZoom === null ||
            finalLayerIndex === null
        ) {
            return;
        }

        replaceUrlQuery(
            buildQuery({
                lng: finalLng,
                lat: finalLat,
                zoom: finalZoom,
                layerIndex: finalLayerIndex,
            }),
        );
    }

    /**
     * 更新地图视图（flyToView 的别名）
     * @param {Object} params - 目标参数
     */
    function updateMapView(params = {}) {
        flyToView(params);
    }

    /**
     * 地址定位：地址解析 -> 地图动画定位
     * @param {string} address - 地址文本
     * @param {Object} [options={}] - 可选参数
     * @param {string} [options.city=''] - 城市限定
     * @param {number} [options.zoom=16] - 动画缩放级别
     * @param {number} [options.duration=flyDuration] - 动画时长（毫秒）
     * @returns {Promise<null|{lng:number,lat:number,adcode:string,level:string,formattedAddress:string}>}
     */
    async function locateAddress(address, { city = '', zoom = 16, duration = flyDuration } = {}) {
        const normalizedAddress = String(address || '').trim();
        if (!normalizedAddress) return null;

        const map = mapInstance?.value;
        const view = map?.getView?.();
        if (!map || !view) return null;

        const geocodeResponse = await apiAddressGeocode(normalizedAddress, city);
        const result = geocodeResponse?.data || null;
        if (!result) return null;

        const targetZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 16;
        const targetDuration = Number(duration) > 0 ? Number(duration) : flyDuration;
        view.animate({
            center: fromLonLat([result.lng, result.lat]),
            zoom: targetZoom,
            duration: targetDuration,
        });

        return result;
    }

    /**
     * 按经纬度范围缩放地图视图
     * @param {number[]} extentLonLat - [minLng, minLat, maxLng, maxLat]
     * @param {Object} [options={}] - 缩放配置
     * @param {number} [options.duration=flyDuration] - 动画时长（毫秒）
     * @param {number[]} [options.padding=[80,80,80,80]] - 视图边距
     * @param {number} [options.maxZoom=11] - 最大缩放级别
     * @returns {boolean} 是否执行成功
     */
    function fitToLonLatExtent(
        extentLonLat,
        { duration = flyDuration, padding = [80, 80, 80, 80], maxZoom = 11 } = {},
    ) {
        const map = mapInstance?.value;
        const view = map?.getView?.();
        if (!map || !view || !Array.isArray(extentLonLat) || extentLonLat.length < 4) {
            return false;
        }

        const values = extentLonLat.slice(0, 4).map((item) => Number(item));
        if (!values.every((item) => Number.isFinite(item))) {
            return false;
        }

        const minLng = Math.min(values[0], values[2]);
        const minLat = Math.min(values[1], values[3]);
        const maxLng = Math.max(values[0], values[2]);
        const maxLat = Math.max(values[1], values[3]);

        const lowerLeft = fromLonLat([minLng, minLat]);
        const upperRight = fromLonLat([maxLng, maxLat]);
        const extent = [
            Math.min(lowerLeft[0], upperRight[0]),
            Math.min(lowerLeft[1], upperRight[1]),
            Math.max(lowerLeft[0], upperRight[0]),
            Math.max(lowerLeft[1], upperRight[1]),
        ];

        if (!extent.every((item) => Number.isFinite(item))) {
            return false;
        }

        const width = Math.abs(extent[2] - extent[0]);
        const height = Math.abs(extent[3] - extent[1]);
        const normalizedDuration = Number(duration) > 0 ? Number(duration) : flyDuration;
        const normalizedPadding =
            Array.isArray(padding) && padding.length === 4 ? padding : [80, 80, 80, 80];
        const normalizedMaxZoom = Number.isFinite(Number(maxZoom)) ? Number(maxZoom) : 11;

        if (width < 1e-6 || height < 1e-6) {
            const center = fromLonLat([(minLng + maxLng) / 2, (minLat + maxLat) / 2]);
            view.animate({ center, zoom: normalizedMaxZoom, duration: normalizedDuration });
            return true;
        }

        view.fit(extent, {
            duration: normalizedDuration,
            padding: normalizedPadding,
            maxZoom: normalizedMaxZoom,
        });

        return true;
    }

    /**
     * 根据图层 ID 查找图层配置
     * @param {string} layerId - 图层 ID
     * @param {Array} configs - 图层配置数组
     * @returns {Object|null} 找到的配置对象，或未找到时返回 null
     * @private
     */
    function findLayerConfigById(layerId, configs = layerConfigs) {
        if (!Array.isArray(configs)) return null;
        return configs.find((cfg) => cfg?.id === layerId) || null;
    }

    /**
     * 确保指定图层的数据源已初始化
     * @param {string} layerId - 图层 ID
     * @param {Object} instanceMap - 图层实例映射
     * @param {Array} configs - 图层配置数组
     * @private
     */
    function ensureLayerSourceById(layerId, instanceMap = layerInstances, configs = layerConfigs) {
        if (!instanceMap || !layerId) return;
        const layer = instanceMap[layerId];
        if (!layer || layer.getSource?.()) return;
        const cfg = findLayerConfigById(layerId, configs);
        if (!cfg || typeof cfg.createSource !== 'function') return;
        layer.setSource(prioritizeTileSourceRequest(cfg.createSource()));
    }

    /**
     * 刷新所有图层实例的显示状态和层级
     * @param {Object} options - 配置对象
     * @param {Array} [options.layerList] - 图层列表（来自 layerListRef.value）
     * @param {Object} [options.instanceMap] - 图层实例映射
     * @param {Array} [options.configs] - 图层配置数组
     */
    function refreshLayerInstances({
        layerList = layerListRef?.value,
        instanceMap = layerInstances,
        configs = layerConfigs,
    } = {}) {
        if (!Array.isArray(layerList) || !instanceMap) return;

        layerList.forEach((item, index) => {
            const layer = instanceMap[item.id];
            if (!layer) return;

            if (item.visible) {
                ensureLayerSourceById(item.id, instanceMap, configs);
            }

            layer.setVisible(!!item.visible);
            layer.setZIndex(layerList.length - index);

            // 应用透明度设置
            if (typeof item.opacity === 'number' && item.opacity >= 0 && item.opacity <= 1) {
                layer.setOpacity(item.opacity);
            }
        });
    }

    /**
     * 强制清除指定图层的 source，防止其后台继续请求
     * 彻底清空 OL 内部瓦片缓存和待处理队列
     * @param {string} layerId - 图层 ID
     */
    function clearLayerSourceForced(layerId) {
        if (!layerInstances || !layerId) return;
        const layer = layerInstances[layerId];
        if (!layer) return;
        const source = layer.getSource?.();
        if (!source) return;
        // 清空 OL 内部瓦片缓存和待处理队列
        if (typeof source.clear === 'function') {
            try {
                source.clear();
            } catch (e) {
                console.debug('[OL-Queue-Clear] Error clearing source:', e);
            }
        }
        // 断开 layer 与 source 的关联
        if (typeof layer.setSource === 'function') {
            layer.setSource(null);
        }
    }

    /**
     * 按 ID 切换图层（设置为可见/不可见）
     * 自动处理卫星图和矢量图标注的显示/隐藏
     * @param {string} layerId - 目标图层 ID
     * @param {Object} options - 配置对象
     * @param {Array} [options.layerList] - 图层列表
     * @param {Object} [options.instanceMap] - 图层实例映射
     * @param {Array} [options.configs] - 图层配置数组
     * @param {Array} [options.satelliteIds] - 卫星图层 ID 列表
     * @param {Array} [options.vectorIds] - 矢量图层 ID 列表
     * @param {Function} [options.onUpdated] - 更新完成的回调函数
     */
    function switchLayerById(
        layerId,
        {
            layerList = layerListRef?.value,
            instanceMap = layerInstances,
            configs = layerConfigs,
            visibleLayerResolver = resolveVisibleLayerIds,
            satelliteIds = satelliteLayers,
            vectorIds = vectorLayers,
            onUpdated,
        } = {},
    ) {
        if (!Array.isArray(layerList) || !layerId) return;
        let normalizedResolvedIds = null;

        const resolvedIds =
            typeof visibleLayerResolver === 'function'
                ? visibleLayerResolver(layerId, { layerList, instanceMap, configs })
                : null;

        const visibleIdSet = new Set();

        if (Array.isArray(resolvedIds) && resolvedIds.length) {
            normalizedResolvedIds = resolvedIds.map((id) => String(id));
            normalizedResolvedIds.forEach((id) => visibleIdSet.add(id));
            let matchedCount = 0;

            layerList.forEach((item) => {
                const visible = visibleIdSet.has(item.id);
                if (visible) matchedCount += 1;
                item.visible = visible;
            });

            // 若解析结果未匹配任何图层，则退回到单图层切换模式。
            if (matchedCount === 0) {
                layerList.forEach((item) => {
                    if (item.id === 'label' || item.id === 'label_vector') return;
                    item.visible = item.id === layerId;
                });

                const needsSatelliteLabel = satelliteIds.includes(layerId);
                const labelItem = layerList.find((item) => item.id === 'label');
                if (labelItem) labelItem.visible = needsSatelliteLabel;

                const needsVectorLabel = vectorIds.includes(layerId);
                const vectorLabelItem = layerList.find((item) => item.id === 'label_vector');
                if (vectorLabelItem) vectorLabelItem.visible = needsVectorLabel;
            }
        } else {
            layerList.forEach((item) => {
                if (item.id === 'label' || item.id === 'label_vector') return;
                item.visible = item.id === layerId;
            });

            const needsSatelliteLabel = satelliteIds.includes(layerId);
            const labelItem = layerList.find((item) => item.id === 'label');
            if (labelItem) labelItem.visible = needsSatelliteLabel;

            const needsVectorLabel = vectorIds.includes(layerId);
            const vectorLabelItem = layerList.find((item) => item.id === 'label_vector');
            if (vectorLabelItem) vectorLabelItem.visible = needsVectorLabel;
        }

        // 关键修复：在 refreshLayerInstances 之前，先强制清除所有即将隐藏的底图图层源。
        // 这样能彻底消除 OL 内部队列的阻塞和后台请求占槽。
        layerList.forEach((item) => {
            if (!item.visible) {
                const cfg = configs.find((c) => c.id === item.id);
                const category = cfg?.category;
                const isBasemap =
                    category === 'label' ||
                    category === 'imagery' ||
                    category === 'vector' ||
                    category === 'terrain' ||
                    category === 'theme' ||
                    category === 'custom';
                if (isBasemap) {
                    clearLayerSourceForced(item.id);
                }
            }
        });

        refreshLayerInstances({ layerList, instanceMap, configs });

        // 组合图层模式下，按配置顺序（从下到上）强制设置层级。
        if (Array.isArray(normalizedResolvedIds) && normalizedResolvedIds.length && instanceMap) {
            const zIndexBase = layerList.length + 10;
            normalizedResolvedIds.forEach((id, index) => {
                const layer = instanceMap[id];
                if (!layer || typeof layer.setZIndex !== 'function') return;
                layer.setZIndex(zIndexBase + index);
            });
        }

        if (typeof onUpdated === 'function') {
            onUpdated(layerId);
        }
    }

    /**
     * 确保经纬网图层已创建
     * 使用 OpenLayers 内置 Graticule 类以获得最佳性能和平滑渲染
     * @returns {Graticule|null} 经纬网图层
     * @private
     */
    function ensureGraticuleLayer() {
        const map = mapInstance?.value;
        if (!map) return null;
        if (graticuleLayer) return graticuleLayer;

        graticuleLayer = new Graticule({
            strokeStyle: new Stroke({
                color: 'rgba(200, 200, 200, 0.6)',
                width: 1.5,
                lineDash: [5, 5],
            }),
            showLabels: true,
            lonLabelStyle: new Text({
                font: 'bold 14px "Segoe UI", Arial, sans-serif',
                fill: new Fill({ color: '#fff' }),
                stroke: new Stroke({ color: '#000', width: 3 }),
                backgroundFill: new Fill({ color: 'rgba(0, 0, 0, 0.5)' }),
                backgroundStroke: new Stroke({ color: '#999', width: 1 }),
                padding: [3, 5, 3, 5],
                offsetY: -55,
                textAlign: 'center',
            }),
            latLabelStyle: new Text({
                font: 'bold 14px "Segoe UI", Arial, sans-serif',
                fill: new Fill({ color: '#fff' }),
                stroke: new Stroke({ color: '#000', width: 3 }),
                backgroundFill: new Fill({ color: 'rgba(0, 0, 0, 0.5)' }),
                backgroundStroke: new Stroke({ color: '#999', width: 1 }),
                padding: [3, 5, 3, 5],
                offsetX: -75,
                textAlign: 'center',
            }),
            zIndex: 1080,
        });
        map.addLayer(graticuleLayer);
        return graticuleLayer;
    }

    // ========== 新增：中心点标记相关函数 ==========

    /**
     * 确保中心点矢量图层已创建
     * 创建一个带 '+' 符号的矢量点图层
     * @returns {VectorLayer|null} 中心点图层实例
     * @private
     */
    function ensureCenterPointLayer() {
        const map = mapInstance?.value;
        if (!map) return null;
        if (centerPointLayer) return centerPointLayer;

        // 创建矢量源并添加一个初始要素（坐标先设为原点，后续更新）
        const source = new VectorSource();
        const feature = new Feature({
            geometry: new Point([0, 0]),
        });
        // 设置 '+' 样式（半透金黄加黑色描边）
        feature.setStyle(
            new Style({
                text: new Text({
                    text: '+',
                    font: '700 30px "Segoe UI", "Arial", sans-serif',
                    fill: new Fill({ color: 'rgba(255, 235, 130, 0.98)' }),
                    stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.78)', width: 3 }),
                    textAlign: 'center',
                    textBaseline: 'middle',
                }),
            }),
        );
        source.addFeature(feature);

        centerPointLayer = new VectorLayer({
            source: source,
            zIndex: 1090,      // 高于经纬网，确保显示在地图元素之上
            visible: graticuleActive, // 初始可见性与经纬网保持一致
        });
        map.addLayer(centerPointLayer);
        return centerPointLayer;
    }

    /**
     * 更新中心点位置到当前地图视图的中心
     * @private
     */
    function updateCenterPointPosition() {
        const map = mapInstance?.value;
        if (!centerPointLayer || !graticuleActive || !map) return; // 只有激活时才更新

        const view = map.getView();
        if (!view) return;

        const centerCoord = view.getCenter(); // 投影坐标系坐标
        if (!centerCoord) return;

        const source = centerPointLayer.getSource();
        if (!source) return;

        const feature = source.getFeatures()[0];
        if (feature) {
            feature.getGeometry().setCoordinates(centerCoord);
        }
    }

    /**
     * 绑定地图移动事件，实时更新中心点位置
     * @private
     */
    function bindCenterPointMoveListener() {
        if (centerPointMoveEndKey) return;
        const map = mapInstance?.value;
        if (!map) return;

        centerPointMoveEndKey = map.on('moveend', () => {
            if (graticuleActive) {
                updateCenterPointPosition();
            }
        });
    }

    /**
     * 解绑中心点移动监听
     * @private
     */
    function unbindCenterPointMoveListener() {
        if (!centerPointMoveEndKey) return;
        unByKey(centerPointMoveEndKey);
        centerPointMoveEndKey = null;
    }

    /**
     * 清理中心点图层（卸载时调用）
     * @private
     */
    function stopCenterPoint() {
        if (centerPointLayer && mapInstance?.value) {
            mapInstance.value.removeLayer(centerPointLayer);
            centerPointLayer = null;
        }
        unbindCenterPointMoveListener();
    }

    // ========== 修改：设置经纬网的激活状态，同时联动中心点 ==========
    /**
     * 设置经纬网的激活状态，同时联动控制中心点标记的显示/隐藏
     * @param {boolean} active - 是否激活
     * @returns {boolean} 设置后的激活状态
     */
    function setGraticuleActive(active) {
        graticuleActive = !!active;
        const map = mapInstance?.value;
        if (!map) return graticuleActive;

        // 处理经纬网图层
        const layer = ensureGraticuleLayer();
        if (layer) {
            layer.setVisible(graticuleActive);
        }

        // 处理中心点图层（联动）
        if (graticuleActive) {
            // 激活时：确保中心点图层存在，更新当前位置，绑定移动监听
            ensureCenterPointLayer();
            if (centerPointLayer) {
                updateCenterPointPosition();
                centerPointLayer.setVisible(true);
            }
            bindCenterPointMoveListener();
        } else {
            // 关闭时：隐藏中心点图层，解绑移动监听
            if (centerPointLayer) {
                centerPointLayer.setVisible(false);
            }
            unbindCenterPointMoveListener();
        }

        return graticuleActive;
    }

    /**
     * 切换经纬网的显示/隐藏状态（同时切换中心点）
     * @returns {boolean} 切换后的激活状态
     */
    function toggleGraticule() {
        return setGraticuleActive(!graticuleActive);
    }

    /**
     * 停止经纬网和中心点，隐藏并清理资源
     */
    function stopGraticule() {
        if (graticuleLayer && mapInstance?.value) {
            mapInstance.value.removeLayer(graticuleLayer);
            graticuleLayer = null;
        }
        if (centerPointLayer) {
            centerPointLayer.setVisible(false);
        }
        unbindCenterPointMoveListener();
        graticuleActive = false;
    }

    // 组件卸载时清理所有资源
    onUnmounted(() => {
        stopMapViewSync();
        stopLocationContextSync();
        stopGraticule();
        stopCenterPoint(); // 彻底移除中心点图层
    });

    return {
        parseUrlToState,
        flyToView,
        updateMapView,
        locateAddress,
        fitToLonLatExtent,
        syncUrlFromMap,
        bindMapViewSync,
        stopMapViewSync,
        refreshLayerInstances,
        switchLayerById,
        setGraticuleActive,
        toggleGraticule,
        stopGraticule,
    };
}