import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import { fromLonLat } from 'ol/proj';
import {
    apiAddressGeocode,
    apiIpCountry,
    apiLocationIpLocate,
    apiLocationReverse
} from '@/api';
import { useMessage } from '@/composables/useMessage';
import { saveUserPositionToCache } from '../utils/userPositionCache';
import { setGlobalUserLocationContext } from '../utils/userLocationContext';
// import { useMessage } from './useMessage';

const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';

export function useUserLocation({
    mapInstance,
    userLocationSource,
    isDomestic,
    fitToLonLatExtent = null
}) {
    const message = useMessage();

    function toRad(value) {
        return Number(value) * Math.PI / 180;
    }

    function haversineMeters(lon1, lat1, lon2, lat2) {
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return 6371000 * c;
    }

    function getExtentCenter(extent) {
        if (!Array.isArray(extent) || extent.length < 4) return null;
        const nums = extent.slice(0, 4).map((item) => Number(item));
        if (!nums.every((item) => Number.isFinite(item))) return null;
        const minX = Math.min(nums[0], nums[2]);
        const minY = Math.min(nums[1], nums[3]);
        const maxX = Math.max(nums[0], nums[2]);
        const maxY = Math.max(nums[1], nums[3]);
        return {
            lon: (minX + maxX) / 2,
            lat: (minY + maxY) / 2
        };
    }

    function estimateExtentAccuracyMeters(extent) {
        if (!Array.isArray(extent) || extent.length < 4) return Number.POSITIVE_INFINITY;
        const nums = extent.slice(0, 4).map((item) => Number(item));
        if (!nums.every((item) => Number.isFinite(item))) return Number.POSITIVE_INFINITY;

        const minX = Math.min(nums[0], nums[2]);
        const minY = Math.min(nums[1], nums[3]);
        const maxX = Math.max(nums[0], nums[2]);
        const maxY = Math.max(nums[1], nums[3]);
        const centerLon = (minX + maxX) / 2;
        const centerLat = (minY + maxY) / 2;

        const widthMeters = haversineMeters(minX, centerLat, maxX, centerLat);
        const heightMeters = haversineMeters(centerLon, minY, centerLon, maxY);
        const diagonalMeters = Math.sqrt(widthMeters ** 2 + heightMeters ** 2);
        if (!Number.isFinite(diagonalMeters) || diagonalMeters <= 0) return Number.POSITIVE_INFINITY;

        return Math.max(1000, diagonalMeters / 2);
    }

    function toDisplayAccuracyMeters(value) {
        if (!Number.isFinite(value) || value <= 0) return 30;
        return Math.min(Math.max(value, 20), 5000);
    }

    function normalizeBinaryFlag(value, fallback = '0') {
        const text = String(value ?? '').trim().toLowerCase();
        if (text === '1' || text === 'true') return '1';
        if (text === '0' || text === 'false') return '0';
        return fallback === '1' ? '1' : '0';
    }

    function readQueryValueFromUrl(key) {
        if (typeof window === 'undefined') return '';

        const hash = String(window.location.hash || '');
        const queryStart = hash.indexOf('?');
        if (queryStart >= 0) {
            const hashParams = new URLSearchParams(hash.slice(queryStart + 1));
            const hashValue = String(hashParams.get(key) || '').trim();
            if (hashValue) return hashValue;
        }

        const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));
        return String(searchParams.get(key) || '').trim();
    }

    // 统一开发者模式开关：dev=1 时默认禁用高德 IP 定位，并预留后续细粒度 API 开关扩展。
    // 兼容旧参数 debug=1，避免已有调试链接失效。
    function resolveDeveloperModeSwitches() {
        const devModeRaw = readQueryValueFromUrl('dev') || readQueryValueFromUrl('debug');
        const devModeEnabled = normalizeBinaryFlag(devModeRaw, '0') === '1';
        const disableApiText = String(
            readQueryValueFromUrl('devApi')
            || readQueryValueFromUrl('devApis')
            || readQueryValueFromUrl('disableApi')
            || readQueryValueFromUrl('disableApis')
            || readQueryValueFromUrl('debugApi')
            || ''
        ).toLowerCase();

        const disableApiTokens = new Set(
            disableApiText
                .split(',')
                .map((token) => token.trim())
                .filter(Boolean)
        );

        return {
            devModeEnabled,
            disableAmapIpLocation: devModeEnabled
                || disableApiTokens.has('amap-ip')
                || disableApiTokens.has('amap-location')
                || disableApiTokens.has('amap-ip-location')
        };
    }

    function markLocationSuccessFlagInUrl() {
        if (typeof window === 'undefined') return;

        try {
            const hash = String(window.location.hash || '#/home');
            const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
            const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
            const hashPath = hashPathRaw || '/home';
            const params = new URLSearchParams(hashQueryRaw);

            params.set('s', normalizeBinaryFlag(params.get('s'), '0'));

            if (normalizeBinaryFlag(params.get('loc'), '0') === '1') return;

            params.set('loc', '1');
            const nextHashQuery = params.toString();
            const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
            const nextHash = nextHashQuery
                ? `#${normalizedHashPath}?${nextHashQuery}`
                : `#${normalizedHashPath}`;
            const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
            window.history.replaceState(window.history.state, '', nextUrl);
        } catch {
            // Ignore URL patch failures to avoid breaking locate flow.
        }
    }

    function isCoordinateInChina(lon, lat) {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
        return lon >= 73.0 && lon <= 135.0 && lat >= 18.0 && lat <= 54.0;
    }

    async function detectIPLocale(options = {}) {
        const { silent = false } = options || {};

        try {
            const response = await apiIpCountry('');
            const data = response?.data || {};
            const cc = data.country || data.country_code || data.country_name;
            const isDom = typeof cc === 'string' && (
                cc.toString().toUpperCase().includes('CN')
                || cc.toString().toLowerCase().includes('china')
            );
            isDomestic.value = isDom;
            return { isDomestic: isDom };
        } catch (e) {
            const detail = e instanceof Error ? e.message : 'unknown';
            if (!silent) {
                message.warning(`IP locale detect failed: ${detail}`);
            }
            isDomestic.value = false;
            return { isDomestic: false };
        }
    }

    async function zoomToUserCityByIp(ip = '', options = {}) {
        const { silent = false } = options || {};
        const { disableAmapIpLocation, devModeEnabled } = resolveDeveloperModeSwitches();

        // 如果开发者模式禁用了高德定位，则直接使用免费服务
        const preferFreeService = disableAmapIpLocation || devModeEnabled;

        try {
            // 调用后端统一定位 API（优先高德，失败则免费服务）
            const locationResponse = await apiLocationIpLocate(ip, { 
                preferFreeService,
                silent: true  // 后端错误由前端处理
            });

            const location = locationResponse || null;
            if (!location?.ok) {
                if (!silent) {
                    const errorMsg = location?.errorMessage || 'IP 定位失败';
                    message.warning(errorMsg);
                }
                return {
                    ...location,
                    didFit: false,
                    geocode: null,
                    reverseGeocode: null
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
                    reverseGeocode: null
                };
            }

            const didFit = typeof fitToLonLatExtent === 'function'
                ? fitToLonLatExtent(location.extent, {
                    duration: 900,
                    padding: [90, 90, 90, 90],
                    maxZoom: 11
                })
                : false;

            // 结合 IP 定位结果补充地理编码与逆地理编码信息，用于展示用户定位语义。
            const cityText = String(location.city || '').trim();
            const provinceText = String(location.province || '').trim();
            const roughAddress = `${provinceText}${cityText}`.trim();
            let geocode = null;
            let reverseGeocode = null;

            if (roughAddress) {
                try {
                    const geocodeResponse = await apiAddressGeocode(roughAddress, cityText, { silent: true });
                    geocode = geocodeResponse?.data || null;
                    if (geocode) {
                        // 使用后端代理的反向地理编码
                        const reverseResponse = await apiLocationReverse(geocode.lng, geocode.lat, {
                            preferService: 'auto',
                            silent: true
                        });
                        reverseGeocode = reverseResponse?.data || null;
                    }
                } catch {
                    // API 内部已通过消息系统提示，这里保持主流程可继续。
                }
            }

            if (didFit) {
                const estimatedAccuracy = toDisplayAccuracyMeters(estimateExtentAccuracyMeters(location.extent));
                const encodedLocation = reverseGeocode
                    ? {
                        ...reverseGeocode,
                        adcode: String(location.adcode || '')
                    }
                    : {
                        formattedAddress: roughAddress,
                        province: provinceText,
                        city: cityText,
                        district: '',
                        township: '',
                        adcode: String(location.adcode || ''),
                        businessAreas: []
                    };

                const globalLocationContext = setGlobalUserLocationContext({
                    lon: Number(geocode?.lng ?? getExtentCenter(location.extent)?.lon ?? 0),
                    lat: Number(geocode?.lat ?? getExtentCenter(location.extent)?.lat ?? 0),
                    accuracy: estimatedAccuracy,
                    accuracyMeters: estimatedAccuracy,
                    source: location.source || 'ip',
                    timestamp: Date.now(),
                    encodedLocation
                });

                if (globalLocationContext) {
                    markLocationSuccessFlagInUrl();
                }

                const cityLabel = reverseGeocode?.city || location.city || location.province || '当前城市';
                const districtLabel = reverseGeocode?.district ? ` ${reverseGeocode.district}` : '';
                const formattedAddress = reverseGeocode?.formattedAddress ? `（${reverseGeocode.formattedAddress}）` : '';
                const serviceLabel = location.source === 'amap' ? '高德' : '免费定位';
                if (!silent) {
                    message.info(`已使用 IP 定位（${serviceLabel}）：${cityLabel}${districtLabel}${formattedAddress}`);
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
                reverseGeocode
            };
        } catch (error) {
            if (!silent) {
                const errorMsg = error?.message || 'IP 定位请求失败';
                message.warning(errorMsg);
            }
            console.error('[zoomToUserCityByIp] 错误:', error);
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
                errorMessage: error?.message || '定位失败'
            };
        }
    }

    async function buildIpCandidate(ip = '', options = {}) {
        const { disableAmapIpLocation = false } = options || {};
        if (disableAmapIpLocation) return null;

        try {
            // 使用后端统一定位 API
            const locationResponse = await apiLocationIpLocate(ip, { 
                preferFreeService: false,  // 优先高德
                silent: true
            });
            
            const ipResult = locationResponse || null;
            if (!ipResult?.ok) return null;

            const center = getExtentCenter(ipResult.extent);
            if (!center || !Number.isFinite(center.lon) || !Number.isFinite(center.lat)) return null;

            const accuracyMeters = estimateExtentAccuracyMeters(ipResult.extent);
            return {
                source: 'ip',
                lon: center.lon,
                lat: center.lat,
                accuracyMeters,
                ipResult
            };
        } catch (error) {
            // 如果是配额用完，向上层抛出，不返回 null
            if (error?.isQuotaExceeded) {
                throw error;
            }
            // 其他错误返回 null（静默失败）
            return null;
        }
    }

    function getCurrentLocation(enableHighAccuracy = true) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));

            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    lon: pos.coords.longitude,
                    lat: pos.coords.latitude,
                    accuracy: pos.coords.accuracy
                }),
                (err) => reject(err),
                { enableHighAccuracy, timeout: 5000 }
            );
        });
    }

    function updateUserPosition(pos, animate = true) {
        if (!pos || !mapInstance.value) return;
        const coord = fromLonLat([pos.lon, pos.lat]);

        saveUserPositionToCache(pos);

        userLocationSource.clear();
        userLocationSource.addFeature(new Feature({
            geometry: new CircleGeom(coord, pos.accuracy || 30),
            type: 'accuracy'
        }));
        userLocationSource.addFeature(new Feature({
            geometry: new Point(coord),
            type: 'position'
        }));

        if (animate && mapInstance.value) {
            mapInstance.value.getView().animate({ center: coord, zoom: 18, duration: 1000 });
        }
    }

    async function zoomToUser(options = {}) {
        const {
            animate = true,
            silent = false
        } = options || {};
        const { disableAmapIpLocation } = resolveDeveloperModeSwitches();

        try {
            const gpsTask = getCurrentLocation(true)
                .then((pos) => ({
                    source: 'gps',
                    lon: Number(pos.lon),
                    lat: Number(pos.lat),
                    accuracyMeters: Number.isFinite(Number(pos.accuracy))
                        ? Math.max(1, Number(pos.accuracy))
                        : 25,
                    raw: pos
                }))
                .catch(() => null);

            const ipTask = disableAmapIpLocation
                ? Promise.resolve(null)
                : buildIpCandidate('', { disableAmapIpLocation }).catch((error) => {
                    // 配额用完时不能隐藏，让外层处理
                    if (error?.isQuotaExceeded) throw error;
                    return null;
                });

            const [gpsCandidate, ipCandidate] = await Promise.all([gpsTask, ipTask]);
            const candidates = [gpsCandidate, ipCandidate].filter((item) => (
                item
                && Number.isFinite(item.lon)
                && Number.isFinite(item.lat)
                && Number.isFinite(item.accuracyMeters)
            ));

            if (!candidates.length) {
                if (!silent) {
                    message.error('定位失败：系统定位与 IP 定位均不可用。', { closable: true, duration: 6000 });
                }
                return null;
            }

            const selected = candidates.reduce((best, current) => {
                if (!best) return current;
                return current.accuracyMeters < best.accuracyMeters ? current : best;
            }, null);

            if (!selected) {
                if (!silent) {
                    message.error('定位失败：未能选择有效定位结果。', { closable: true, duration: 6000 });
                }
                return null;
            }

            updateUserPosition({
                lon: selected.lon,
                lat: selected.lat,
            accuracy: toDisplayAccuracyMeters(selected.accuracyMeters)
        }, !!animate);

        if (selected.source === 'gps') {
            isDomestic.value = isCoordinateInChina(selected.lon, selected.lat);
        } else if (selected.ipResult?.adcode) {
            isDomestic.value = true;
        }

        let reverseAddress = null;
        try {
            // 使用后端代理的反向地理编码
            const reverseResponse = await apiLocationReverse(selected.lon, selected.lat, {
                preferService: 'auto',
                silent: true
            });
            reverseAddress = reverseResponse?.data || null;
        } catch {
            // 逆地理编码失败时保留坐标提示，不中断定位成功主流程。
        }

        const sourceLabel = selected.source === 'gps' ? '系统定位' : 'IP定位';
        const accuracyLabel = `精度约 ${Math.round(selected.accuracyMeters)}m`;
        const fallbackAddress = selected.source === 'ip'
            ? `${selected.ipResult?.province || ''}${selected.ipResult?.city || ''}`.trim()
            : '';
        const resolvedAddress = String(reverseAddress?.formattedAddress || fallbackAddress).trim();
        const detailText = resolvedAddress || `${selected.lon.toFixed(6)}, ${selected.lat.toFixed(6)}`;

        const encodedLocation = reverseAddress
            ? {
                ...reverseAddress,
                adcode: String(selected.ipResult?.adcode || '')
            }
            : {
                formattedAddress: fallbackAddress,
                province: String(selected.ipResult?.province || ''),
                city: String(selected.ipResult?.city || ''),
                district: '',
                township: '',
                adcode: String(selected.ipResult?.adcode || ''),
                businessAreas: []
            };

        const globalLocationContext = setGlobalUserLocationContext({
            lon: selected.lon,
            lat: selected.lat,
            accuracy: toDisplayAccuracyMeters(selected.accuracyMeters),
            accuracyMeters: selected.accuracyMeters,
            source: selected.source,
            timestamp: Date.now(),
            encodedLocation
        });

        if (globalLocationContext) {
            markLocationSuccessFlagInUrl();
        }

        if (!silent) {
            message.success(`定位成功（${sourceLabel}，${accuracyLabel}）：${detailText}`, {
                closable: true,
                duration: 5000
            });
        }

        return {
            ...selected,
            reverseAddress,
            globalLocationContext
        };
        } catch (error) {
            // 处理配额用完的错误
            if (error?.isQuotaExceeded) {
                message.warning(error.message || 'IP 定位：API 调用额度已用完，部分功能受限', {
                    closable: true,
                    duration: 0
                });
            } else {
                console.error('[useUserLocation] 定位异常:', error);
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
        updateUserPosition
    };
}