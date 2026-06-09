/**
 * useWeatherData.js
 * 天气数据获取与管理 Composable
 * - 封装所有天气 API 调用（实况 + 预报双请求）
 * - 管理 adcode 查询、城市名称解析、定位上下文联动
 * - 暴露响应式状态与操作方法供 WeatherChartPanel 消费
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMessage } from '../useMessage';
import { apiAddressGeocode, apiReverseGeocodeWithFallback, apiWeather } from '../../api';
import { globalAbortManager } from '@/utils/abortManager';
import {
    getGlobalUserLocationContext,
    USER_LOCATION_CONTEXT_CHANGE_EVENT,
} from '../../services/userLocationContext';
import { useWeatherStore } from '../../stores';
import {
    hasRainSignal,
    resolveWeatherIcon,
    formatDateLabel,
    toFixedNumber,
} from '../../utils/weather/weatherUtils';

/**
 * 天气数据管理 Composable
 *
 * @param {Object} chartCallbacks 图表操作回调（由 useWeatherCharts 提供）
 * @param {Function} chartCallbacks.ensureChartInstances 确保图表实例已创建
 * @param {Function} chartCallbacks.showChartsLoading 显示图表 loading
 * @param {Function} chartCallbacks.hideChartsLoading 隐藏图表 loading
 * @param {Function} chartCallbacks.resizeCharts 触发图表 resize
 * @param {Function} chartCallbacks.renderTrendChart 渲染气温趋势图
 * @param {Function} chartCallbacks.renderWindChart 渲染风力图表
 * @returns {Object} 响应式状态与操作方法
 */
export function useWeatherData(chartCallbacks = {}) {
    const message = useMessage();
    const weatherStore = useWeatherStore();
    const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '';

    /* ------------------------------------------------------------ */
    /*  响应式状态                                                     */
    /* ------------------------------------------------------------ */

    /** adcode 输入框值 */
    const adcodeInput = ref(weatherStore.currentAdcode || '410202');
    /** 城市名称输入框值 */
    const cityInput = ref('');
    /** 是否正在加载天气数据 */
    const isBusy = ref(false);
    /** 实况天气数据 */
    const liveWeather = ref(null);
    /** 预报天气数据 */
    const forecastWeather = ref(null);
    /** base 接口元信息 */
    const baseApiMeta = ref({ status: '--', count: '--', info: '--', infocode: '--' });
    /** all 接口元信息 */
    const forecastApiMeta = ref({ status: '--', count: '--', info: '--', infocode: '--' });
    /** base 原始返回载荷 */
    const baseRawPayload = ref(null);
    /** all 原始返回载荷 */
    const forecastRawPayload = ref(null);

    /* ------------------------------------------------------------ */
    /*  内部状态（非响应式）                                             */
    /* ------------------------------------------------------------ */

    /** 请求序列号（防止旧请求覆盖新数据） */
    let lastWeatherRequestId = 0;
    /** 上次成功加载的 adcode（避免重复请求） */
    let lastLoadedAdcode = '';

    /* ------------------------------------------------------------ */
    /*  计算属性                                                       */
    /* ------------------------------------------------------------ */

    /** 预报 casts（最多 4 天） */
    const casts = computed(() => {
        const list = Array.isArray(forecastWeather.value?.casts)
            ? forecastWeather.value.casts
            : [];
        return list.slice(0, 4);
    });

    /** 当前天气 Emoji 图标 */
    const weatherIcon = computed(() => {
        const weatherText = String(liveWeather.value?.weather || '').trim();
        return resolveWeatherIcon(weatherText);
    });

    /** 城市显示标签（省 + 市） */
    const liveCityLabel = computed(() => {
        const province = String(
            liveWeather.value?.province ||
                forecastWeather.value?.province ||
                weatherStore.currentProvince ||
                '',
        ).trim();
        const city = String(
            liveWeather.value?.city ||
                forecastWeather.value?.city ||
                weatherStore.currentCity ||
                '',
        ).trim();
        return `${province}${city}`.trim() || '未知城市';
    });

    /** 实况天气文本 */
    const liveWeatherText = computed(
        () => String(liveWeather.value?.weather || '天气未知').trim() || '天气未知',
    );

    /** 实况温度文本 */
    const liveTemperatureText = computed(() => {
        const temp = toFixedNumber(liveWeather.value?.temperature, '--');
        return temp === '--' ? '--°C' : `${temp}°C`;
    });

    /** 实况湿度文本 */
    const liveHumidityText = computed(() => {
        const humidity = toFixedNumber(liveWeather.value?.humidity, '--');
        return humidity === '--' ? '--' : `${humidity}%`;
    });

    /** 实况风向文本 */
    const liveWindDirectionText = computed(
        () => String(liveWeather.value?.windDirection || '--').trim() || '--',
    );

    /** 实况风力文本 */
    const liveWindPowerText = computed(
        () => String(liveWeather.value?.windPowerText || '--').trim() || '--',
    );

    /** 数据上报时间文本 */
    const liveReportTimeText = computed(
        () =>
            String(
                liveWeather.value?.reportTime || forecastWeather.value?.reportTime || '--',
            ).trim() || '--',
    );

    /** base 原始 JSON 字符串 */
    const baseRawJson = computed(() => JSON.stringify(baseRawPayload.value || {}, null, 2));

    /** all 原始 JSON 字符串 */
    const forecastRawJson = computed(() =>
        JSON.stringify(forecastRawPayload.value || {}, null, 2),
    );

    /** 降雨聚焦面板数据 */
    const rainFocus = computed(() => {
        const liveText = String(liveWeather.value?.weather || '').trim();
        const liveHasRain = hasRainSignal(liveText);

        const hits = [];
        casts.value.forEach((cast) => {
            const date = formatDateLabel(cast?.date || '');

            if (hasRainSignal(cast?.dayWeather)) {
                hits.push({
                    date,
                    period: '白天',
                    weather: String(cast?.dayWeather || '--'),
                    icon: resolveWeatherIcon(cast?.dayWeather),
                });
            }

            if (hasRainSignal(cast?.nightWeather)) {
                hits.push({
                    date,
                    period: '夜间',
                    weather: String(cast?.nightWeather || '--'),
                    icon: resolveWeatherIcon(cast?.nightWeather),
                });
            }
        });

        const hasRain = liveHasRain || hits.length > 0;
        const hasAnyText =
            !!liveText ||
            casts.value.some(
                (cast) => String(cast?.dayWeather || cast?.nightWeather || '').trim(),
            );

        if (!hasAnyText) {
            return {
                hasRain: false,
                level: 'unknown',
                icon: '🌫️',
                badge: '待判定',
                title: '暂未获取到可判定的天气文本',
                subtitle: '请刷新或切换 adcode 后重试',
                hits,
            };
        }

        if (hasRain) {
            return {
                hasRain: true,
                level: 'rain',
                icon: '🌧️',
                badge: '降雨信号',
                title: liveHasRain
                    ? `当前实况：${resolveWeatherIcon(liveText)} ${liveText}`
                    : '未来 4 日预报存在降雨时段',
                subtitle: hits.length
                    ? `未来 4 日识别到 ${hits.length} 个可能降雨时段`
                    : '当前天气文本中包含降雨关键词',
                hits,
            };
        }

        return {
            hasRain: false,
            level: 'clear',
            icon: '☀️',
            badge: '无雨信号',
            title: '当前与未来 4 日未识别到降雨关键词',
            subtitle: '如需更精细的降雨概率，建议接入分钟级降水或雷达数据',
            hits,
        };
    });

    /* ------------------------------------------------------------ */
    /*  图表回调代理（延迟调用，避免循环依赖）                              */
    /* ------------------------------------------------------------ */

    /** 安全调用图表回调 */
    function invokeChartCallback(name, ...args) {
        const fn = chartCallbacks[name];
        if (typeof fn === 'function') {
            return fn(...args);
        }
    }

    /* ------------------------------------------------------------ */
    /*  数据加载核心方法                                                 */
    /* ------------------------------------------------------------ */

    /**
     * 根据 adcode 加载天气数据（实况 base + 预报 all 双请求）
     * @param {string} adcode 6 位行政区划编码
     * @param {Object} options
     * @param {boolean} options.force 是否强制刷新（忽略缓存）
     * @param {string} options.source 请求来源标识
     */
    async function loadWeatherByAdcode(adcode, options = {}) {
        const normalizedAdcode = String(adcode || '').trim();
        const force = !!options.force;

        if (!/^\d{6}$/.test(normalizedAdcode)) {
            message.warning('请输入有效的 6 位 adcode');
            return;
        }

        // 非强制模式下，如果 adcode 未变化则跳过请求，仅刷新图表
        if (!force && normalizedAdcode === lastLoadedAdcode) {
            await nextTick();
            invokeChartCallback('resizeCharts');
            invokeChartCallback('renderTrendChart');
            invokeChartCallback('renderWindChart');
            return;
        }

        const requestId = ++lastWeatherRequestId;
        isBusy.value = true;

        try {
            await invokeChartCallback('ensureChartInstances');
            invokeChartCallback('showChartsLoading');

            // 并行请求实况与预报（AbortManager：新 adcode 自动 abort 上一次，释放连接槽位）
            const [baseResponse, allResponse] = await globalAbortManager.run('weather', (signal) =>
                Promise.all([
                    apiWeather(normalizedAdcode, 'base', { signal }),
                    apiWeather(normalizedAdcode, 'all', { signal }),
                ]),
            );
            const baseResult = baseResponse?.data || null;
            const allResult = allResponse?.data || null;

            // 请求竞态保护：丢弃过期请求的结果
            if (requestId !== lastWeatherRequestId) return;

            // 更新响应式状态
            liveWeather.value = baseResult?.live || null;
            forecastWeather.value = allResult?.forecast || null;
            baseApiMeta.value = {
                status: String(baseResult?.status || baseResult?.raw?.status || '--'),
                count: String(baseResult?.count || baseResult?.raw?.count || '--'),
                info: String(baseResult?.info || baseResult?.raw?.info || '--'),
                infocode: String(baseResult?.infocode || baseResult?.raw?.infocode || '--'),
            };
            forecastApiMeta.value = {
                status: String(allResult?.status || allResult?.raw?.status || '--'),
                count: String(allResult?.count || allResult?.raw?.count || '--'),
                info: String(allResult?.info || allResult?.raw?.info || '--'),
                infocode: String(allResult?.infocode || allResult?.raw?.infocode || '--'),
            };
            baseRawPayload.value = baseResult?.raw || null;
            forecastRawPayload.value = allResult?.raw || null;
            lastLoadedAdcode = normalizedAdcode;

            // 同步到全局 store
            weatherStore.setAdcode(normalizedAdcode, {
                city: baseResult?.city || allResult?.city || weatherStore.currentCity,
                province:
                    baseResult?.province || allResult?.province || weatherStore.currentProvince,
                source: String(options.source || 'weather-fetch'),
            });

            // 数据就绪后刷新图表
            await nextTick();
            invokeChartCallback('resizeCharts');
            invokeChartCallback('renderTrendChart');
            invokeChartCallback('renderWindChart');
        } catch (error) {
            // AbortError 表示被新 adcode 请求取代，静默忽略
            if (error?.name === 'AbortError') return;
            // getWeather 内部已完成错误提示，这里吞掉异常以避免 watcher 链路产生未处理拒绝
        } finally {
            if (requestId === lastWeatherRequestId) {
                isBusy.value = false;
                invokeChartCallback('hideChartsLoading');
            }
        }
    }

    /**
     * 从定位上下文中提取 adcode 并更新 store
     * @param {Object|null} context 定位上下文对象
     * @param {string} source 来源标识
     * @returns {boolean} 是否成功应用了 adcode
     */
    function applyAdcodeFromLocationContext(context, source = 'location-context') {
        const currentContext = context || getGlobalUserLocationContext();
        const adcode = String(currentContext?.encodedLocation?.adcode || '').trim();
        if (!/^\d{6}$/.test(adcode)) return false;

        weatherStore.setAdcode(adcode, {
            city: currentContext?.encodedLocation?.city || weatherStore.currentCity,
            province: currentContext?.encodedLocation?.province || weatherStore.currentProvince,
            source,
        });
        adcodeInput.value = adcode;
        return true;
    }

    /**
     * 根据经纬度反向解析 adcode 并更新 store
     * @param {number} lon 经度
     * @param {number} lat 纬度
     * @param {string} source 来源标识
     */
    async function resolveAdcodeByLonLat(lon, lat, source = 'map-event') {
        const longitude = Number(lon);
        const latitude = Number(lat);
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;

        try {
            const reverseResponse = await apiReverseGeocodeWithFallback(longitude, latitude, {
                tiandituTk: TIANDITU_TK,
                silent: true,
            });
            const reverseResult = reverseResponse?.data || null;

            const nextAdcode = String(reverseResult?.adcode || '').trim();
            if (!/^\d{6}$/.test(nextAdcode)) return;

            weatherStore.setAdcode(nextAdcode, {
                city: reverseResult?.city || weatherStore.currentCity,
                province: reverseResult?.province || weatherStore.currentProvince,
                source,
            });
            adcodeInput.value = nextAdcode;
        } catch {
            // 地图联动解析失败时不打断主流程
        }
    }

    /**
     * 手动 adcode 查询（输入框触发）
     */
    async function applyAdcodeQuery() {
        const nextAdcode = String(adcodeInput.value || '').trim();
        if (!/^\d{6}$/.test(nextAdcode)) {
            message.warning('请输入有效的 6 位 adcode');
            return;
        }

        await loadWeatherByAdcode(nextAdcode, { force: true, source: 'manual-adcode' });
    }

    /**
     * 城市名称解析并查询天气
     * 流程：城市名 → 正地理编码获取 adcode → 加载天气
     * 仅当正地理编码缺少 adcode 时，才使用逆地理编码兜底。
     */
    async function resolveCityAndQuery() {
        const cityText = String(cityInput.value || '').trim();
        if (!cityText) {
            message.warning('请输入城市或区县名称');
            return;
        }

        isBusy.value = true;
        try {
            const geocodeResponse = await apiAddressGeocode(cityText, cityText, { silent: true });
            const geocode = geocodeResponse?.data || null;
            let nextAdcode = String(geocode?.adcode || '').trim();

            if (
                !/^\d{6}$/.test(nextAdcode) &&
                Number.isFinite(geocode?.lng) &&
                Number.isFinite(geocode?.lat)
            ) {
                const reverseResponse = await apiReverseGeocodeWithFallback(
                    geocode.lng,
                    geocode.lat,
                    { tiandituTk: TIANDITU_TK, silent: true },
                );
                const reverseResult = reverseResponse?.data || null;
                nextAdcode = String(reverseResult?.adcode || '').trim();
            }

            if (!/^\d{6}$/.test(nextAdcode)) {
                message.warning('未解析到有效 adcode，请尝试更详细的地名');
                return;
            }

            adcodeInput.value = nextAdcode;
            await loadWeatherByAdcode(nextAdcode, { force: true, source: 'city-input' });
        } finally {
            isBusy.value = false;
        }
    }

    /**
     * 手动刷新天气（使用当前 store 中的 adcode）
     */
    async function refreshWeather() {
        await loadWeatherByAdcode(weatherStore.currentAdcode || adcodeInput.value || '410202', {
            force: true,
            source: 'manual-refresh',
        });
    }

    /* ------------------------------------------------------------ */
    /*  事件监听与 Store 监听                                           */
    /* ------------------------------------------------------------ */

    /** 定位上下文变更事件处理器 */
    function handleLocationContextChange(event) {
        const context = event?.detail?.context || null;
        const changed = applyAdcodeFromLocationContext(context, 'location-context-change');
        if (!changed) return;

        void loadWeatherByAdcode(weatherStore.currentAdcode, {
            force: true,
            source: 'location-context-change',
        });
    }

    // 监听 store 中 adcode 变化，自动加载天气
    watch(
        () => weatherStore.currentAdcode,
        (nextAdcode) => {
            const normalized = String(nextAdcode || '').trim();
            if (!/^\d{6}$/.test(normalized)) return;
            adcodeInput.value = normalized;
            void loadWeatherByAdcode(normalized, { source: 'store-watch' });
        },
    );

    // 监听地图点击触发（经纬度 → adcode → 天气）
    watch(
        () => weatherStore.mapPointTrigger?.timestamp,
        () => {
            const payload = weatherStore.mapPointTrigger;
            if (!payload) return;
            void resolveAdcodeByLonLat(payload.lon, payload.lat, payload.source || 'map-event');
        },
    );

    /* ------------------------------------------------------------ */
    /*  生命周期                                                       */
    /* ------------------------------------------------------------ */

    onMounted(async () => {
        const loadedFromContext = applyAdcodeFromLocationContext(
            null,
            'location-context-initial',
        );
        const initAdcode = loadedFromContext
            ? weatherStore.currentAdcode
            : weatherStore.currentAdcode || '410202';

        await loadWeatherByAdcode(initAdcode, {
            force: true,
            source: 'component-mounted',
        });

        if (typeof window !== 'undefined') {
            window.addEventListener(
                USER_LOCATION_CONTEXT_CHANGE_EVENT,
                handleLocationContextChange,
            );
        }
    });

    onBeforeUnmount(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener(
                USER_LOCATION_CONTEXT_CHANGE_EVENT,
                handleLocationContextChange,
            );
        }
    });

    /* ------------------------------------------------------------ */
    /*  暴露                                                          */
    /* ------------------------------------------------------------ */

    return {
        // 输入状态
        adcodeInput,
        cityInput,
        // 加载状态
        isBusy,
        // 天气数据
        liveWeather,
        forecastWeather,
        baseApiMeta,
        forecastApiMeta,
        baseRawPayload,
        forecastRawPayload,
        // 计算属性
        casts,
        weatherIcon,
        liveCityLabel,
        liveWeatherText,
        liveTemperatureText,
        liveHumidityText,
        liveWindDirectionText,
        liveWindPowerText,
        liveReportTimeText,
        baseRawJson,
        forecastRawJson,
        rainFocus,
        // 操作方法
        loadWeatherByAdcode,
        applyAdcodeQuery,
        resolveCityAndQuery,
        refreshWeather,
        applyAdcodeFromLocationContext,
        resolveAdcodeByLonLat,
    };
}
