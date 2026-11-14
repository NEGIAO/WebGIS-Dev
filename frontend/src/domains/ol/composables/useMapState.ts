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
import { normalizeBinaryFlag, normalizeLocationFlag, normalizeText } from '@common/utils/normalize';
import { DEFAULT_SEARCH_ZOOM } from '@common/utils/mapDefaults';
import { getCurrentQuerySnapshot as getSnapshot, readQueryValue as readQueryFromSnapshot } from '@common/url-state/urlQueryReader';
import { debounce, formatNumber, formatZParam, isSameQuerySnapshot, parseInteger, parseNumber, resolvePreferredDefaultLayerIndex } from './useMapStateHelpers';
import { useMapDecorations } from './useMapDecorations';
import { useMapBasemapInstances } from './useMapBasemapInstances';

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
    resolveVisibleLayerIds?: ((...args: any[]) => any) | null;
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

    // ---------- 底图图层实例管理（见 ./useMapBasemapInstances） ----------
    const { refreshLayerInstances, switchLayerById } = useMapBasemapInstances(mapInstance, {
        layerListRef,
        layerInstances,
        layerConfigs,
        resolveVisibleLayerIds,
        satelliteLayers,
        vectorLayers,
    });

    const debouncedSyncUrlFromMap = debounce(() => {
        syncUrlFromMap();
    }, syncDebounceMs);

    function readQueryValue(key: any) {
        return readQueryFromSnapshot(key, route.query) || null;
    }

    function getCurrentQuerySnapshot() {
        return getSnapshot(route?.query);
    }

    function resolveLocationState() {
        const globalLocationContext = getGlobalUserLocationContext();
        const globalLng = parseNumber(globalLocationContext?.lon);
        const globalLat = parseNumber(globalLocationContext?.lat);
        const globalSource = normalizeText(globalLocationContext?.source) || 'unknown';
        const hasGlobalLocation = globalLng !== null && globalLat !== null;
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

    function resolvePositionCode() {
        const { hasGpsAuthorization, globalLng, globalLat } = resolveLocationState();
        if (!hasGpsAuthorization) return { code: '0', locSource: '0' };
        if (globalLng === null || globalLat === null) return { code: '0', locSource: '0' };

        const encoded = encodePos(globalLng, globalLat);
        const code = encoded && encoded !== '0' ? encoded : '0';
        const locSource = code !== '0' ? 'gps' : '0';

        return { code, locSource };
    }

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

    function bindLocationContextSync() {
        if (typeof window === 'undefined' || locationContextChangeHandler) return;
        locationContextChangeHandler = () => {
            debouncedSyncUrlFromMap();
        };
        window.addEventListener(USER_LOCATION_CONTEXT_CHANGE_EVENT, locationContextChangeHandler);
    }

    function stopLocationContextSync() {
        if (typeof window === 'undefined' || !locationContextChangeHandler) return;
        window.removeEventListener(
            USER_LOCATION_CONTEXT_CHANGE_EVENT,
            locationContextChangeHandler,
        );
        locationContextChangeHandler = null;
    }

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

    function bindMapViewSync() {
        const map = mapInstance?.value;
        if (!map || moveEndKey) return;
        bindLocationContextSync();
        moveEndKey = map.on('moveend', () => {
            debouncedSyncUrlFromMap();
        });
    }

    function stopMapViewSync() {
        if (!moveEndKey) return;
        unByKey(moveEndKey);
        moveEndKey = null;
        debouncedSyncUrlFromMap.cancel();
        stopLocationContextSync();
    }

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

    function getMapSize() {
        return mapInstance?.value?.getSize?.() || null;
    }

    function getOlView() {
        return mapInstance?.value?.getView?.() || null;
    }

    function updateMapView(params: any = {}) {
        flyToView(params);
    }

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

    onUnmounted(() => {
        stopMapViewSync();
        stopLocationContextSync();
        stopGraticule();
        stopCenterPoint();
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
