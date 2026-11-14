/**
 * 功能名称：用户定位 composable（GPS + IP 双通道，含竞态取消与错误分类）
 * 日    期：2026/11/13
 *
 * 纯几何估算 / URL 标记 / 开发者开关见 ./userLocationMath；
 * 本文件负责地图实例交互、定位请求编排与消息提示。
 */
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import type Map from 'ol/Map';
import type VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';
import type { Ref } from 'vue';
import { apiAddressGeocode, apiIpCountry, apiLocationIpLocate, apiLocationReverse } from '@/api';
import { getPublicIp } from '@/api/backend/client';
import { useMessage } from '@common/shell/useMessage';
import { saveUserPositionToCache } from '@common/map-view/services/userPositionCache';
import { setGlobalUserLocationContext } from '@common/map-view/services/userLocationContext';
import { gcj02ToWgs84 } from '@common/data-import/crs/coordTransform';
import {
    estimateExtentAccuracyMeters,
    getExtentCenter,
    isCoordinateInChina,
    markLocationSuccessFlagInUrl,
    resolveDeveloperModeSwitches,
    toDisplayAccuracyMeters,
} from './userLocationMath';

/** GPS 定位结果 */
export interface GpsPosition {
    lon: number;
    lat: number;
    accuracy: number;
}

/** 参与优选的定位候选（GPS / IP 统一形状） */
export interface LocationCandidate {
    source: 'gps' | 'ip';
    lon: number;
    lat: number;
    accuracyMeters: number;
    raw?: GpsPosition;
    ipResult?: any;
}

/** useUserLocation 宿主依赖 */
export interface UseUserLocationOptions {
    /** OL 地图实例（响应式） */
    mapInstance: Ref<Map | null>;
    /** 用户位置图层 VectorSource（写入精度圈 + 点位要素） */
    userLocationSource: VectorSource;
    /** 是否国内（响应式） */
    isDomestic: Ref<boolean>;
    /** 视口适配回调（由宿主提供），缺省视为适配失败 */
    fitToLonLatExtent?: ((extent: number[], options?: Record<string, unknown>) => any) | null;
}

// [Fix] 单个定位流程的 AbortController，用于取消上一次请求
let activeLocateController: AbortController | null = null;

export function useUserLocation({
    mapInstance,
    userLocationSource,
    isDomestic,
    fitToLonLatExtent = null,
}: UseUserLocationOptions) {
    const message = useMessage();

    async function detectIPLocale(options: { silent?: boolean } = {}): Promise<{ isDomestic: boolean }> {
        const { silent = false } = options || {};

        try {
            // 等公网 IP 就绪，避免后端收到私有 IP 返回 400
            await getPublicIp();

            const response = await apiIpCountry('');
            const data: any = response?.data || {};
            const cc = data.country || data.country_code || data.country_name;
            const isDom =
                typeof cc === 'string' &&
                (cc.toString().toUpperCase().includes('CN') ||
                    cc.toString().toLowerCase().includes('china'));
            isDomestic.value = isDom;
            return { isDomestic: isDom };
        } catch (e: any) {
            // 国内外判定是辅助逻辑，失败时静默处理（不弹 toast），避免首屏加载时干扰用户
            if (!silent) {
                console.warn('[detectIPLocale] 国内外判定失败:', e instanceof Error ? e.message : 'unknown');
            }
            isDomestic.value = false;
            return { isDomestic: false };
        }
    }

    async function zoomToUserCityByIp(ip = '', options: { silent?: boolean } = {}) {
        const { silent = false } = options || {};
        const { disableAmapIpLocation, devModeEnabled } = resolveDeveloperModeSwitches();
        const preferFreeService = disableAmapIpLocation || devModeEnabled;

        try {
            const locationResponse: any = await apiLocationIpLocate(ip, {
                preferFreeService,
                silent: true,
            });

            const location: any = locationResponse || null;
            if (!location?.ok) {
                if (!silent) {
                    const errorMsg = location?.errorMessage || 'IP 定位失败';
                    message.warning(errorMsg);
                }
                return {
                    ...location,
                    didFit: false,
                    geocode: null,
                    reverseGeocode: null,
                };
            }

            if (location.adcode) {
                isDomestic.value = true;
            }

            const canFitExtent = Array.isArray(location.extent) && location.extent.length >= 4;
            if (!canFitExtent) {
                if (!silent) {
                    message.warning('IP 定位未返回可用的城市范围。');
                }
                return {
                    ...location,
                    didFit: false,
                    geocode: null,
                    reverseGeocode: null,
                };
            }

            const didFit =
                typeof fitToLonLatExtent === 'function'
                    ? fitToLonLatExtent(location.extent, {
                          duration: 900,
                          padding: [90, 90, 90, 90],
                          maxZoom: 11,
                      })
                    : false;

            const cityText = String(location.city || '').trim();
            const provinceText = String(location.province || '').trim();
            const roughAddress = `${provinceText}${cityText}`.trim();
            let geocode: any = null;
            let reverseGeocode: any = null;

            if (roughAddress) {
                try {
                    const geocodeResponse: any = await apiAddressGeocode(roughAddress, cityText, {
                        silent: true,
                    });
                    geocode = geocodeResponse?.data || null;
                    if (geocode) {
                        // apiLocationReverse 统一接受 WGS-84 坐标（后端内部转换为 GCJ-02）
                        const reverseResponse: any = await apiLocationReverse(geocode.lng, geocode.lat, {
                            preferService: 'auto',
                            silent: true,
                        });
                        reverseGeocode = reverseResponse?.data || null;
                    }
                } catch {
                    // API 内部已通过消息系统提示，这里保持主流程可继续。
                }
            }

            if (didFit) {
                const estimatedAccuracy = toDisplayAccuracyMeters(
                    estimateExtentAccuracyMeters(location.extent),
                );
                // [Fix] 当 geocode 失败时，使用 IP extent 中心作为坐标回退
                // 高德 IP 定位 extent 为 GCJ-02，需转换为 WGS-84
                const rawCenter = getExtentCenter(location.extent);
                const center = rawCenter
                    ? (() => { const [cLon, cLat] = gcj02ToWgs84(rawCenter.lon, rawCenter.lat); return { lon: cLon, lat: cLat }; })()
                    : null;
                const encodedLocation = reverseGeocode
                    ? {
                          ...reverseGeocode,
                          adcode: String(location.adcode || ''),
                      }
                    : {
                          formattedAddress: roughAddress || `${location.city || ''}`,
                          province: provinceText,
                          city: cityText,
                          district: '',
                          township: '',
                          adcode: String(location.adcode || ''),
                          businessAreas: [],
                      };

                const globalLocationContext = setGlobalUserLocationContext({
                    lon: Number(geocode?.lng ?? center?.lon ?? 0),
                    lat: Number(geocode?.lat ?? center?.lat ?? 0),
                    accuracy: estimatedAccuracy,
                    accuracyMeters: estimatedAccuracy,
                    source: location.source || 'ip',
                    timestamp: Date.now(),
                    encodedLocation,
                });

                if (
                    globalLocationContext &&
                    (globalLocationContext.source === 'gps' || globalLocationContext.source === 'ip')
                ) {
                    markLocationSuccessFlagInUrl(globalLocationContext.source);
                }

                const cityLabel =
                    reverseGeocode?.city || location.city || location.province || '当前城市';
                const districtLabel = reverseGeocode?.district ? ` ${reverseGeocode.district}` : '';
                const formattedAddress = reverseGeocode?.formattedAddress
                    ? `（${reverseGeocode.formattedAddress}）`
                    : '';
                const serviceLabel = location.source === 'amap' ? '高德' : '免费定位';
                if (!silent) {
                    message.info(
                        `已使用 IP 定位（${serviceLabel}）：${cityLabel}${districtLabel}${formattedAddress}`,
                    );
                }
            } else {
                if (!silent) {
                    message.warning('IP 城市范围获取成功，但地图缩放失败。');
                }
            }

            return {
                ...location,
                didFit,
                geocode,
                reverseGeocode,
            };
        } catch (error: any) {
            if (!silent) {
                const errorMsg = error?.message || 'IP 定位请求失败';
                message.warning(errorMsg);
            }
            // 上方 message.warning 已提示用户,此处不再重复 console.error
            // console.error('[zoomToUserCityByIp] 错误:', error);
            return {
                ok: false,
                status: '0',
                city: '',
                province: '',
                adcode: '',
                extent: null,
                didFit: false,
                geocode: null,
                reverseGeocode: null,
                errorMessage: error?.message || '定位失败',
            };
        }
    }

    async function buildIpCandidate(ip = '', options: { disableAmapIpLocation?: boolean } = {}): Promise<LocationCandidate | null> {
        const { disableAmapIpLocation = false } = options || {};
        if (disableAmapIpLocation) return null;

        try {
            const locationResponse: any = await apiLocationIpLocate(ip, {
                preferFreeService: false,
                silent: true,
            });

            const ipResult: any = locationResponse || null;
            if (!ipResult?.ok) return null;

            const center = getExtentCenter(ipResult.extent);
            if (!center || !Number.isFinite(center.lon) || !Number.isFinite(center.lat))
                return null;

            const accuracyMeters = estimateExtentAccuracyMeters(ipResult.extent);
            // 高德 IP 定位返回 GCJ-02 坐标，统一转换为 WGS-84 以保持坐标系一致性
            const [wgsLon, wgsLat] = gcj02ToWgs84(center.lon, center.lat);
            return {
                source: 'ip',
                lon: wgsLon,
                lat: wgsLat,
                accuracyMeters,
                ipResult,
            };
        } catch (error: any) {
            if (error?.isQuotaExceeded) {
                throw error;
            }
            return null;
        }
    }

    /**
     * [Fix] GPS 定位，带错误分类和有意义的提示
     */
    function getCurrentLocation(enableHighAccuracy = true): Promise<GpsPosition> {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                const err: any = new Error('浏览器不支持定位功能');
                err.code = 'UNSUPPORTED';
                return reject(err);
            }

            navigator.geolocation.getCurrentPosition(
                (pos) =>
                    resolve({
                        lon: pos.coords.longitude,
                        lat: pos.coords.latitude,
                        accuracy: pos.coords.accuracy,
                    }),
                (err) => {
                    // [Fix] 分类 GPS 错误，给用户有意义的提示
                    const error: any = new Error(err.message);
                    switch (err.code) {
                        case 1: // PERMISSION_DENIED
                            error.code = 'PERMISSION_DENIED';
                            error.userMessage = '定位权限被拒绝，请在浏览器设置中允许定位';
                            break;
                        case 2: // POSITION_UNAVAILABLE
                            error.code = 'POSITION_UNAVAILABLE';
                            error.userMessage = '无法获取位置信息，可能处于室内或信号弱的环境';
                            break;
                        case 3: // TIMEOUT
                            error.code = 'TIMEOUT';
                            error.userMessage = 'GPS 定位超时，将使用 IP 定位';
                            break;
                        default:
                            error.code = 'UNKNOWN';
                            error.userMessage = 'GPS 定位失败';
                    }
                    reject(error);
                },
                { enableHighAccuracy, timeout: 5000, maximumAge: 60000 },
            );
        });
    }

    function updateUserPosition(pos: { lon: number; lat: number; accuracy?: number }, animate = true): void {
        if (!pos || !mapInstance.value) return;
        const coord = fromLonLat([pos.lon, pos.lat]);

        saveUserPositionToCache(pos);

        userLocationSource.clear();
        userLocationSource.addFeature(
            new Feature({
                geometry: new CircleGeom(coord, pos.accuracy || 30),
                type: 'accuracy',
            }),
        );
        userLocationSource.addFeature(
            new Feature({
                geometry: new Point(coord),
                type: 'position',
            }),
        );

        if (animate && mapInstance.value) {
            mapInstance.value.getView().animate({ center: coord, zoom: 18, duration: 1000 });
        }
    }

    async function zoomToUser(options: { animate?: boolean; silent?: boolean } = {}) {
        const { animate = true, silent = false } = options || {};
        const { disableAmapIpLocation } = resolveDeveloperModeSwitches();

        // [Fix] 取消上一次进行中的定位请求，防止竞态
        if (activeLocateController) {
            activeLocateController.abort();
        }
        activeLocateController = new AbortController();
        const { signal } = activeLocateController;

        try {
            // 确保公网 IP 就绪后再发起定位，避免后端收到 Docker 网关 IP 导致定位失败
            if (!disableAmapIpLocation) {
                await getPublicIp();
            }

            // [Fix] GPS 定位：带超时和错误分类
            const gpsTask = getCurrentLocation(true)
                .then((pos): LocationCandidate => ({
                    source: 'gps',
                    lon: Number(pos.lon),
                    lat: Number(pos.lat),
                    accuracyMeters: Number.isFinite(Number(pos.accuracy))
                        ? Math.max(1, Number(pos.accuracy))
                        : 25,
                    raw: pos,
                }))
                .catch((err: any) : any => {
                    // [Fix] GPS 错误分类提示（非静默）
                    if (!silent && err?.userMessage && err.code !== 'TIMEOUT') {
                        message.warning(err.userMessage);
                    }
                    return null;
                });

            const ipTask = disableAmapIpLocation
                ? Promise.resolve(null)
                : buildIpCandidate('', { disableAmapIpLocation }).catch((error: any) : any => {
                      if (error?.isQuotaExceeded) throw error;
                      return null;
                  });

            // [Fix] Promise.allSettled：GPS 和 IP 互不阻塞，任一失败不影响另一个
            const [gpsResult, ipResult] = await Promise.allSettled([gpsTask, ipTask]);

            if (signal.aborted) return null;

            const gpsCandidate: LocationCandidate | null =
                gpsResult.status === 'fulfilled' ? gpsResult.value : null;
            const ipCandidate: LocationCandidate | null =
                ipResult.status === 'fulfilled' ? ipResult.value : null;

            // 如果 IP 抛出了配额用完的错误，向上层传递
            if (ipResult.status === 'rejected' && ipResult.reason?.isQuotaExceeded) {
                throw ipResult.reason;
            }

            const candidates = [gpsCandidate, ipCandidate].filter(
                (item): item is LocationCandidate =>
                    !!item &&
                    Number.isFinite(item.lon) &&
                    Number.isFinite(item.lat) &&
                    Number.isFinite(item.accuracyMeters),
            );

            if (!candidates.length) {
                if (!silent) {
                    message.error('定位失败：系统定位与 IP 定位均不可用。', {
                        closable: true,
                        duration: 6000,
                    });
                }
                return null;
            }

            const selected = candidates.reduce<LocationCandidate | null>((best, current) => {
                if (!best) return current;
                return current.accuracyMeters < best.accuracyMeters ? current : best;
            }, null);

            if (!selected) {
                if (!silent) {
                    message.error('定位失败：未能选择有效定位结果。', {
                        closable: true,
                        duration: 6000,
                    });
                }
                return null;
            }

            if (signal.aborted) return null;

            updateUserPosition(
                {
                    lon: selected.lon,
                    lat: selected.lat,
                    accuracy: toDisplayAccuracyMeters(selected.accuracyMeters),
                },
                !!animate,
            );

            if (selected.source === 'gps') {
                isDomestic.value = isCoordinateInChina(selected.lon, selected.lat);
            } else if (selected.ipResult?.adcode) {
                isDomestic.value = true;
            }

            // [Fix] 逆地理编码：带独立超时（8s），失败不阻断主流程
            let reverseAddress: any = null;
            try {
                const reverseController = new AbortController();
                const reverseTimeout = setTimeout(() => reverseController.abort(), 8000);

                // apiLocationReverse 统一接受 WGS-84 坐标（后端内部转换为 GCJ-02）
                const reverseResponse: any = await apiLocationReverse(selected.lon, selected.lat, {
                    preferService: 'auto',
                    silent: true,
                    signal: reverseController.signal,
                });
                clearTimeout(reverseTimeout);
                reverseAddress = reverseResponse?.data || null;
            } catch {
                // 逆地理编码失败时保留坐标提示，不中断定位成功主流程。
            }

            if (signal.aborted) return null;

            const sourceLabel = selected.source === 'gps' ? '系统定位' : 'IP定位';
            const accuracyLabel = `精度约 ${Math.round(selected.accuracyMeters)}m`;
            const fallbackAddress =
                selected.source === 'ip'
                    ? `${selected.ipResult?.province || ''}${selected.ipResult?.city || ''}`.trim()
                    : '';
            const resolvedAddress = String(
                reverseAddress?.formattedAddress || fallbackAddress,
            ).trim();
            const detailText =
                resolvedAddress || `${selected.lon.toFixed(6)}, ${selected.lat.toFixed(6)}`;

            const encodedLocation = reverseAddress
                ? {
                      ...reverseAddress,
                      adcode: String(selected.ipResult?.adcode || ''),
                  }
                : {
                      formattedAddress: fallbackAddress,
                      province: String(selected.ipResult?.province || ''),
                      city: String(selected.ipResult?.city || ''),
                      district: '',
                      township: '',
                      adcode: String(selected.ipResult?.adcode || ''),
                      businessAreas: [],
                  };

            const globalLocationContext = setGlobalUserLocationContext({
                lon: selected.lon,
                lat: selected.lat,
                accuracy: toDisplayAccuracyMeters(selected.accuracyMeters),
                accuracyMeters: selected.accuracyMeters,
                source: selected.source,
                timestamp: Date.now(),
                encodedLocation,
            });

            if (globalLocationContext && (selected.source === 'gps' || selected.source === 'ip')) {
                markLocationSuccessFlagInUrl(selected.source);
            }

            if (!silent) {
                message.success(`定位成功（${sourceLabel}，${accuracyLabel}）：${detailText}`, {
                    closable: true,
                    duration: 5000,
                });
            }

            return {
                ...selected,
                reverseAddress,
                globalLocationContext,
            };
        } catch (error: any) {
            if (signal.aborted) return null;

            if (error?.isQuotaExceeded) {
                message.warning(error.message || 'IP 定位：API 调用额度已用完，部分功能受限', {
                    closable: true,
                    duration: 0,
                });
            } else if (!silent) {
                // console.error('[useUserLocation] 定位异常:', error);
                message.error(`定位失败: ${error?.message || '未知错误'}`);
            }
            return null;
        }
    }

    return {
        isCoordinateInChina,
        detectIPLocale,
        zoomToUserCityByIp,
        getCurrentLocation,
        zoomToUser,
        updateUserPosition,
    };
}
