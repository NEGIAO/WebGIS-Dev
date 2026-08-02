/**
 * 高德天气「业务封装」（前端直连高德，含 infocode 解析/风力归一化/消息提示）。
 * ⚠️ 与 `api/backend/weather.js`（后端天气代理接口）同名不同义：
 *   - 本文件：第三方高德天气的前端业务层
 *   - backend/weather.js：走后端 FastAPI 的天气代理
 * 消费方经 api/index.js barrel 导入，请勿混用两者。
 */
import { translate as t } from '@common/app/useLocale';
import backendAPI from './backend';
import { getAmapErrorMessage } from './httpStatusMap';

const AMAP_SUCCESS_STATUS = '1';
const AMAP_SUCCESS_INFOCODE = '10000';

function normalizeWindPower(value) {
    const text = String(value ?? '').trim();
    const matched = text.match(/\d+(?:\.\d+)?/);
    const numeric = matched ? Number(matched[0]) : 0;
    return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeLive(live = {}) {
    return {
        province: String(live?.province || '').trim(),
        city: String(live?.city || '').trim(),
        adcode: String(live?.adcode || '').trim(),
        weather: String(live?.weather || '').trim(),
        temperature: Number(live?.temperature),
        windDirection: String(live?.winddirection || '').trim(),
        windPowerText: String(live?.windpower || '').trim(),
        windPower: normalizeWindPower(live?.windpower),
        humidity: Number(live?.humidity),
        reportTime: String(live?.reporttime || '').trim(),
    };
}

function normalizeForecast(forecast = {}) {
    const casts = Array.isArray(forecast?.casts) ? forecast.casts : [];

    return {
        province: String(forecast?.province || '').trim(),
        city: String(forecast?.city || '').trim(),
        adcode: String(forecast?.adcode || '').trim(),
        reportTime: String(forecast?.reporttime || '').trim(),
        casts: casts.map((item) => ({
            date: String(item?.date || '').trim(),
            week: String(item?.week || '').trim(),
            dayWeather: String(item?.dayweather || '').trim(),
            nightWeather: String(item?.nightweather || '').trim(),
            dayTemp: Number(item?.daytemp),
            nightTemp: Number(item?.nighttemp),
            dayWind: String(item?.daywind || '').trim(),
            nightWind: String(item?.nightwind || '').trim(),
            dayPowerText: String(item?.daypower || '').trim(),
            nightPowerText: String(item?.nightpower || '').trim(),
            dayPower: normalizeWindPower(item?.daypower),
            nightPower: normalizeWindPower(item?.nightpower),
        })),
    };
}

/**
 * 高德天气查询（实况 / 预报）
 * @param {string|number} adcode 城市行政区划编码（6位）
 * @param {'base'|'all'} [type='base'] base=实况，all=4天预报
 * @returns {Promise<{
 *   ok: boolean,
 *   type: 'base'|'all',
 *   status: string,
 *   count: string,
 *   info: string,
 *   infocode: string,
 *   adcode: string,
 *   city: string,
 *   province: string,
 *   live: any|null,
 *   forecast: any|null,
 *   raw: any
 * }>} 标准化结果
 */
export async function getWeather(adcode, type = 'base', options = {}) {
    const normalizedAdcode = String(adcode ?? '').trim();
    const normalizedType = type === 'all' ? 'all' : 'base';

    if (!/^\d{6}$/.test(normalizedAdcode)) {
        const error = new Error(t('weather.queryFailedAdcode'));
        console.warn(error.message);
        throw error;
    }

    try {
        const response = await backendAPI.get('/api/proxy/amap/weather', {
            params: {
                city: normalizedAdcode,
                extensions: normalizedType,
            },
            signal: options?.signal,
        });

        const data = response || {};
        const status = String(data?.status ?? '0');
        const infocode = String(data?.infocode ?? '');
        const isSuccess =
            status === AMAP_SUCCESS_STATUS && (!infocode || infocode === AMAP_SUCCESS_INFOCODE);

        if (!isSuccess) {
            const mapped = getAmapErrorMessage(infocode);
            const reason =
                !mapped || mapped.includes('未知') || /unknown/i.test(mapped)
                    ? data?.info || data?.message || t('weather.amapFailed')
                    : mapped;
            throw new Error(`${reason} (status=${status}, infocode=${infocode || 'unknown'})`);
        }

        const lives = Array.isArray(data?.lives) ? data.lives : [];
        const forecasts = Array.isArray(data?.forecasts) ? data.forecasts : [];
        const count = String(data?.count ?? '0');
        const info = String(data?.info || data?.message || '');
        const normalizedInfocode = String(data?.infocode ?? '');

        const live = lives[0] ? normalizeLive(lives[0]) : null;
        const forecast = forecasts[0] ? normalizeForecast(forecasts[0]) : null;

        return {
            ok: true,
            type: normalizedType,
            status,
            count,
            info,
            infocode: normalizedInfocode,
            adcode: String(live?.adcode || forecast?.adcode || normalizedAdcode),
            city: String(live?.city || forecast?.city || ''),
            province: String(live?.province || forecast?.province || ''),
            live,
            forecast,
            raw: data,
        };
    } catch (error) {
        // AbortError 表示被新请求取代，静默传递（不弹通知）
        if (error?.name === 'AbortError') throw error;
        if (error?.isQuotaExceeded) {
            // 配额用完：仅记录日志
            console.warn(t('weather.quotaExceeded'));
        } else {
            const detail = error instanceof Error ? error.message : t('weather.networkError');
            const statusTag = error?.status ? ` [${error.status}]` : '';
            console.warn(t('weather.queryFailed', { detail: `${detail}${statusTag}` }));
        }
        throw error instanceof Error ? error : new Error(t('weather.queryFailedShort'));
    }
}
