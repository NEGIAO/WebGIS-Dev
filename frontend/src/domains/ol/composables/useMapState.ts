import { onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fromLonLat, toLonLat } from 'ol/proj';
import { unByKey } from 'ol/Observable';
import { apiAddressGeocode } from '@/api';
import {
    getGlobalUserLocationContext,
    USER_LOCATION_CONTEXT_CHANGE_EVENT,
} from '@common/map-view/services/userLocationContext';
import { decodePos, encodePos } from '@ol/utils/biz/index';
import {
    DEFAULT_BASEMAP_URL_LAYER_NUMBER,
    getBasemapIdByUrlLayerNumber,
    getUrlLayerNumberByBasemapId,
} from '@common/basemap/basemapOptions';
import { buildRasterBasemapSource, applyBasemapSourceToLayer } from '@ol/basemap/composables/basemapLayerFactory';
import { Z_BAND } from '@ol/layer/zIndexBands';
import { normalizeBinaryFlag, normalizeLocationFlag, normalizeText } from '@common/utils/normalize';
import { DEFAULT_SEARCH_ZOOM } from '@common/utils/mapDefaults';
import { getCurrentQuerySnapshot as getSnapshot, readQueryValue as readQueryFromSnapshot } from '@common/url-state/urlQueryReader';
import { debounce, formatNumber, formatZParam, isSameQuerySnapshot, parseInteger, parseNumber, resolvePreferredDefaultLayerIndex } from './useMapStateHelpers';
import { useMapDecorations } from './useMapDecorations';



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
/** useMapState 宿主装配选项 */
export interface UseMapStateOptions {
    /** 默认缩放级别 */
    defaultZoom?: number;
    /** 飞行动画时长（ms） */
    flyDuration?: number;
    /** URL 同步防抖（ms） */
    syncDebounceMs?: number;
    /** 当前底图序号读取器 */
    getLayerIndex?: () => any;
    /** 当前底图 id 读取器 */
    getLayerId?: () => any;
    /** 自定义底图 URL 读取器 */
    getCustomUrl?: () => any;
    /** 底图序号变化回调 */
    onLayerIndexChange?: (...args: any[]) => void;
    /** 图层列表 ref */
    layerListRef?: any;
    /** 图层实例映射 */
    layerInstances?: any;
    /** 图层配置数组 */
    layerConfigs?: any;
    /** option id → 可见图层 id 列表 */
    resolveVisibleLayerIds?: (...args: any[]) => any;
    /** 卫星底图 id 列表 */
    satelliteLayers?: string[];
    /** 矢量底图 id 列表 */
    vectorLayers?: string[];
}

export function useMapState(mapInstance: any, options: UseMapStateOptions = {} as UseMapStateOptions) {
    const route = useRoute();
    const router = useRouter();

    const {
        defaultZoom = 17,
        flyDuration = 700,
        syncDebounceMs = 500,
        getLayerIndex = () => null,
        getLayerId = () => '',
        getCustomUrl = () => '',
        onLayerIndexChange = () => {},
        layerListRef = null,
        layerInstances = null,
        layerConfigs = null,
        resolveVisibleLayerIds = null,
        satelliteLayers = ['tianDiTu', 'Google', 'esri', 'google'],
        vectorLayers = ['tianDiTu_vec'],
    } = options;

    let moveEndKey: any = null;
    let locationContextChangeHandler: any = null;
    let suppressNextUrlSync = false;

    // ---------- 地图装饰图层（经纬网 + 中心点，见 ./useMapDecorations） ----------
    const { setGraticuleActive, toggleGraticule, stopGraticule, stopCenterPoint } = useMapDecorations(mapInstance);

    const debouncedSyncUrlFromMap = debounce(() => {
        syncUrlFromMap();
    }, syncDebounceMs);

    /**
     * 读取查询参数值（同时支持 router.query 和 hash 查询）
     * @param {string} key - 参数键名
     * @returns {string|null} 参数值
     * @private
     */
    function readQueryValue(key: any) {
        return readQueryFromSnapshot(key, route.query) || null;
    }

    /**
     * 读取当前 URL 的完整查询参数快照（保留未知参数）
     * hash 查询参数优先级高于 route.query。
     * @returns {Record<string, string>}
     * @private
     */
    function getCurrentQuerySnapshot() {
        return getSnapshot(route?.query);
    }

    /**
     * 解析定位授权状态
     * 核心原则：只有用户明确授权 GPS 定位（source === 'gps'）时，才允许写入 loc=gps 和 p=编码坐标
     * URL 中的 loc 只是同步标记，不是授权来源；真正的授权来源是 globalLocationContext.source === 'gps'
     * IP 定位（source === 'ip'）虽然有全局上下文，但不写入 loc 和 p 参数，避免粗略坐标泄漏到 URL
     * @returns {{
     *   hasGpsAuthorization: boolean,     // 是否有 GPS 授权（仅 source==='gps' 才为 true，不含 ip）
     *   hasGlobalLocation: boolean,       // 是否有全局定位上下文（GPS/IP等）
     *   globalLng: number|null,
     *   globalLat: number|null,
     *   globalSource: 'gps'|'ip'|'unknown'|null, // 定位来源
     *   urlHasLocFlag: boolean            // URL 中是否有 loc=gps/loc=ip 标记
     * }}
     * @private
     */
    function resolveLocationState() {
        const globalLocationContext = getGlobalUserLocationContext();
        const globalLng = parseNumber(globalLocationContext?.lon);
        const globalLat = parseNumber(globalLocationContext?.lat);
        const globalSource = normalizeText(globalLocationContext?.source) || 'unknown';
        const hasGlobalLocation = globalLng !== null && globalLat !== null;
        // 仅 GPS 授权写入 p 编码与 loc=gps；IP 定位不写入 URL，避免坐标泄漏
        const hasGpsAuthorization = hasGlobalLocation && globalSource === 'gps';

        const urlLocSource = normalizeLocationFlag(readQueryValue('loc'), '0');
        const urlHasLocFlag = urlLocSource === 'gps' || urlLocSource === 'ip';

        return {
            hasGpsAuthorization,
            hasGlobalLocation,
            globalLng,
            globalLat,
            globalSource,
            urlHasLocFlag,
        };
    }

    /**
     * 生成 p 参数与 loc 来源标记
     * 核心原则：仅当用户明确授权 GPS 定位（hasGpsAuthorization）时，才写入 p 编码坐标与 loc=gps
     * IP 定位不写入 p 与 loc，避免粗略坐标泄漏到 URL（IP 坐标仅供内部上下文使用）
     * @returns {{code: string, locSource: 'gps'|'0'}} code=p 编码('0' 表示无坐标)，locSource=loc 标记
     * @private
     */
    function resolvePositionCode() {
        const { hasGpsAuthorization, globalLng, globalLat } = resolveLocationState();
        if (!hasGpsAuthorization) return { code: '0', locSource: '0' };
        if (globalLng === null || globalLat === null) return { code: '0', locSource: '0' };

        const encoded = encodePos(globalLng, globalLat);
        const code = encoded && encoded !== '0' ? encoded : '0';
        const locSource = code !== '0' ? 'gps' : '0';

        return { code, locSource };
    }

    /**
     * 解析 URL 为地图状态对象
     * 仅当 URL 中有 loc=gps 或 loc=ip 时才解码 p 参数
     * @returns {Object} 包含 lng、lat、zoom、layerIndex 的状态对象
     */
    function parseUrlToState() {
        let lng = parseNumber(readQueryValue('lng'));
        let lat = parseNumber(readQueryValue('lat'));
        const zoom = parseNumber(readQueryValue('z'));
        const requestedLayerIndex = parseInteger(
            readQueryValue('l') ?? readQueryValue('layer'),
        );
        const numericLayerId = requestedLayerIndex === null
            ? ''
            : String(getBasemapIdByUrlLayerNumber(requestedLayerIndex) || '').trim();
        const legacyLayerId = String(readQueryValue('layerId') || '').trim();
        const legacyLayerIndex = numericLayerId || !legacyLayerId
            ? null
            : getUrlLayerNumberByBasemapId(legacyLayerId);
        let layerIndex: number | null = resolvePreferredDefaultLayerIndex();
        if (numericLayerId) layerIndex = requestedLayerIndex;
        else if (legacyLayerIndex !== null) layerIndex = legacyLayerIndex;
        const layerId = String(getBasemapIdByUrlLayerNumber(layerIndex) || '').trim();
        const customUrl = layerId === 'custom'
            ? String(getCustomUrl?.() || '').trim()
            : '';

        const compactPosCode = String(readQueryValue('p') ?? '').trim();
        const { urlHasLocFlag } = resolveLocationState();

        if ((lng === null || lat === null) && compactPosCode && compactPosCode !== '0' && urlHasLocFlag) {
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

        return {
            lng,
            lat,
            zoom: zoom === null ? defaultZoom : zoom,
            layerIndex,
            layerId,
            customUrl,
        };
    }

    /**
     * 构建查询参数对象
     * @param {Object} params - 地图参数 { lng, lat, zoom, layerIndex }
     * @returns {Object} 格式化的查询参数 { lng, lat, z, l }
     * @private
     */
    function buildQuery({ lng, lat, zoom, layerIndex }: { lng?: any; lat?: any; zoom?: any; layerIndex?: any }) {
        const shareFlag = normalizeBinaryFlag(readQueryValue('s'), '0');
        const normalizedLayerIndex = getBasemapIdByUrlLayerNumber(layerIndex)
            ? Number(layerIndex)
            : DEFAULT_BASEMAP_URL_LAYER_NUMBER;
        const { code: compactPosCode, locSource } = resolvePositionCode();

        return {
            lng: formatNumber(lng, 6),
            lat: formatNumber(lat, 6),
            z: formatZParam(zoom),
            l: String(normalizedLayerIndex),
            layerId: '',
            customUrl: '',
            s: shareFlag,
            loc: locSource,
            p: compactPosCode,
            view: 'ol',
        };
    }

    /**
     * 更新 URL 查询参数，通过 router 或直接修改 location
     * @param {Object} nextQuery - 新查询参数
     * @private
     */
    function replaceUrlQuery(nextQuery: any) {
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

        const mergedQuery: Record<string, any> = {
            ...getCurrentQuerySnapshot(),
            ...nextQuery,
        };

        // 仅在当前是 OL 视图时才清除 Cesium 专属参数
        // 避免在 Cesium 模式下 OL 残留调用抹掉相机编码状态
        if (nextQuery.view === 'ol') {
            delete mergedQuery.cv;
            delete mergedQuery.heading;
            delete mergedQuery.pitch;
            delete mergedQuery.roll;
        }

        Object.keys(mergedQuery).forEach((key) => {
            const value = mergedQuery[key];
            if (value === undefined || value === null || value === '') {
                delete mergedQuery[key];
                return;
            }
            mergedQuery[key] = String(value);
        });

        const currentSnapshot = getCurrentQuerySnapshot();
        if (isSameQuerySnapshot(currentSnapshot, mergedQuery)) return;

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
        if (suppressNextUrlSync) {
            suppressNextUrlSync = false;
            debouncedSyncUrlFromMap.cancel();
            return;
        }

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
    function flyToView({ lng, lat, zoom, z, layerIndex, l, duration } = {} as any) {
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
     * 获取当前 OL 视图状态，供 2D→3D 切换时换算 Cesium 相机高度。
     * @returns {{lng:number,lat:number,zoom:number,layerIndex:number|null,size:number[]|null,resolution:number|null,view:Object|null}|null}
     */
    function getCurrentViewState() {
        const map = mapInstance?.value;
        const view = map?.getView?.();
        const center = view?.getCenter?.();
        const zoom = parseNumber(view?.getZoom?.());
        if (!map || !view || !Array.isArray(center) || center.length < 2 || zoom === null) return null;

        const [lng, lat] = toLonLat(center);
        return {
            lng,
            lat,
            zoom,
            layerIndex: parseInteger(getLayerIndex()),
            layerId: String(getLayerId?.() || '').trim(),
            customUrl: String(getLayerId?.() || '').trim() === 'custom'
                ? String(getCustomUrl?.() || '').trim()
                : '',
            size: map.getSize?.() || null,
            resolution: parseNumber(view.getResolution?.()),
            view,
        };
    }

    /**
     * 静默同步 Cesium 等效视图到 OL，避免隐藏 2D 面板下一次 moveend 覆盖 Cesium URL。
     * @param {{lng:number, lat:number, zoom:number}} state - Cesium 相机换算得到的 OL 中心与 zoom
     * @returns {boolean} 是否应用成功
     */
    function syncViewFromCesium({ lng, lat, zoom } = {} as any) {
        const map = mapInstance?.value;
        const view = map?.getView?.();
        const normalizedLng = parseNumber(lng);
        const normalizedLat = parseNumber(lat);
        const normalizedZoom = parseNumber(zoom);
        if (!view || normalizedLng === null || normalizedLat === null || normalizedZoom === null) {
            return false;
        }

        suppressNextUrlSync = true;
        debouncedSyncUrlFromMap.cancel();
        view.setCenter?.(fromLonLat([normalizedLng, normalizedLat]));
        view.setZoom?.(normalizedZoom);
        return true;
    }

    /**
     * 返回当前 OL 地图视口尺寸，供 Cesium 高度换算使用。
     * @returns {number[]|null}
     */
    function getMapSize() {
        return mapInstance?.value?.getSize?.() || null;
    }

    /**
     * 返回当前 OL View 实例，供 Cesium 高度换算使用。
     * @returns {Object|null}
     */
    function getOlView() {
        return mapInstance?.value?.getView?.() || null;
    }

    /**
     * 更新地图视图（flyToView 的别名）
     * @param {Object} params - 目标参数
     */
    function updateMapView(params: any = {}) {
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
    async function locateAddress(address: any, { city = '', zoom = DEFAULT_SEARCH_ZOOM, duration = flyDuration } = {}) {
        const normalizedAddress = String(address || '').trim();
        if (!normalizedAddress) return null;

        const map = mapInstance?.value;
        const view = map?.getView?.();
        if (!map || !view) return null;

        const geocodeResponse = await apiAddressGeocode(normalizedAddress, city);
        const result = geocodeResponse?.data || null;
        if (!result) return null;

        const targetZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : DEFAULT_SEARCH_ZOOM;
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
        extentLonLat: number[],
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
    function findLayerConfigById(layerId: any, configs = layerConfigs) {
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
    function ensureLayerSourceById(layerId: any, instanceMap = layerInstances, configs = layerConfigs, isVisible = true) {
        if (!instanceMap || !layerId) return null;
        const layer = instanceMap[layerId];
        if (!layer || layer.getSource?.()) return layer;
        const cfg = findLayerConfigById(layerId, configs);
        if (!cfg || typeof cfg.createSource !== 'function') return layer;
        // cfg.createSource() 已内含 prioritizeTileSourceRequest，再走 buildRasterBasemapSource 套 zDirection
        const newSource = buildRasterBasemapSource(cfg.createSource());
        if (!newSource) return layer;

        // 类型安全挂载：启动引导期不可见图层以 TileLayer(null) 占位，若配置产出
        // VectorTileSource（如 HENU 边界矢量/天地图 MVT），直接 setSource 会因图层类型错配渲染空白，
        // 需整体重建图层实例并同步 instanceMap
        const replacedLayer = applyBasemapSourceToLayer({
            layer,
            source: newSource,
            map: mapInstance?.value ?? null,
            visible: isVisible,
        });
        if (replacedLayer) {
            instanceMap[layerId] = replacedLayer;
            return replacedLayer;
        }
        return layer;
    }

    /**
     * 刷新所有图层实例的显示状态和层级
     * [性能优化] 值未变化时跳过 OL 方法调用，减少不必要的内部重排序
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
            let layer = instanceMap[item.id];
            if (!layer) return;

            if (item.visible) {
                layer = ensureLayerSourceById(item.id, instanceMap, configs, true) || instanceMap[item.id] || layer;
            }

            // 只在值实际变化时才调用 OL 方法，避免触发内部重排序
            const targetVisible = !!item.visible;
            if (layer.getVisible() !== targetVisible) {
                layer.setVisible(targetVisible);
            }

            // zIndex 按显示带分配（见 @ol/layer/zIndexBands）：标注类底图恒置顶于数据带，
            // 其余底图瓦片落最低带。带基准固定、与底图数量无关 → 底图源增加不会压过数据层。
            // 带内顺序与面板 UI 对齐：layerList 顶部（index 0）= 面板"置顶"目标 → 反向映射拿带内最高 z。
            const category = configs.find((cfg: any) => cfg?.id === item.id)?.category;
            const zBand = category === 'label' ? Z_BAND.LABEL : Z_BAND.BASEMAP;
            const targetZIndex = zBand + (layerList.length - 1 - index);
            if (layer.getZIndex() !== targetZIndex) {
                layer.setZIndex(targetZIndex);
            }

            if (typeof item.opacity === 'number' && item.opacity >= 0 && item.opacity <= 1) {
                if (Math.abs((layer.getOpacity() ?? 1) - item.opacity) > 0.001) {
                    layer.setOpacity(item.opacity);
                }
            }
        });
    }

    /**
     * 强制清除指定图层的 source，防止其后台继续请求
     * 彻底清空 OL 内部瓦片缓存和待处理队列
     * @param {string} layerId - 图层 ID
     */
    function clearLayerSourceForced(layerId: any) {
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
                console.warn('[OL-Queue-Clear] Error clearing source:', e);
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
        layerId: string,
        {
            layerList = layerListRef?.value,
            instanceMap = layerInstances,
            configs = layerConfigs,
            visibleLayerResolver = resolveVisibleLayerIds,
            satelliteIds = satelliteLayers,
            vectorIds = vectorLayers,
            onUpdated,
        } = {} as {
            layerList?: any;
            instanceMap?: any;
            configs?: any;
            visibleLayerResolver?: any;
            satelliteIds?: string[];
            vectorIds?: string[];
            onUpdated?: (...args: any[]) => void;
        },
    ) {
        if (!Array.isArray(layerList) || !layerId) return;
        let normalizedResolvedIds: any = null;

        const resolvedIds =
            typeof visibleLayerResolver === 'function'
                ? visibleLayerResolver(layerId, { layerList, instanceMap, configs })
                : null;

        const visibleIdSet = new Set();

        if (Array.isArray(resolvedIds) && resolvedIds.length) {
            normalizedResolvedIds = resolvedIds.map((id) => String(id));
            normalizedResolvedIds.forEach((id: any) => visibleIdSet.add(id));
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
        // 例外：custom 层不清理 —— 其 source 由用户输入动态构建（WMS/ArcGIS export 模板），
        // 清除后 ensureLayerSourceById 无法再生（工厂仅支持 XYZ 且无 customUrl 上下文），
        // 导致「排序与显隐」重新勾选后图层永久空白。隐藏时保留 source 仅暂停渲染即可。
        layerList.forEach((item) => {
            if (!item.visible && item.id !== 'custom') {
                const cfg = configs.find((c: any) => c.id === item.id);
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

        // 组合图层模式下，按显示带与配置顺序（从下到上）强制设置层级：
        // 标注类底图归标注带（数据之上），其余底图瓦片归底图带（数据之下）。
        if (Array.isArray(normalizedResolvedIds) && normalizedResolvedIds.length && instanceMap) {
            normalizedResolvedIds.forEach((id, index) => {
                const layer = instanceMap[id];
                if (!layer || typeof layer.setZIndex !== 'function') return;
                const category = configs.find((cfg: any) => cfg?.id === id)?.category;
                const zBand = category === 'label' ? Z_BAND.LABEL : Z_BAND.BASEMAP;
                layer.setZIndex(zBand + index);
            });
        }

        if (typeof onUpdated === 'function') {
            onUpdated(layerId);
        }
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
        getCurrentViewState,
        syncViewFromCesium,
        getMapSize,
        getOlView,
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