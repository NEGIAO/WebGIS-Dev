import { useMessage } from '@/composables/useMessage';
import backendAPI, { handleApiError } from './backend';

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
        reportTime: String(live?.reporttime || '').trim()
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
            nightPower: normalizeWindPower(item?.nightpower)
        }))
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
export async function getWeather(adcode, type = 'base') {
    const message = useMessage();
    const normalizedAdcode = String(adcode ?? '').trim();
    const normalizedType = type === 'all' ? 'all' : 'base';

    if (!/^\d{6}$/.test(normalizedAdcode)) {
        const error = new Error('天气查询失败：adcode 必须是 6 位数字');
        message.warning(error.message, { closable: true, duration: 4500 });
        throw error;
    }

    try {
        const response = await backendAPI.get('/api/proxy/amap/weather', {
            params: {
                city: normalizedAdcode,
                extensions: normalizedType
            }
        });

        const data = response || {};
        const status = String(data?.status ?? '0');
        if (status !== '1') {
            const reason = data?.info || data?.message || '高德天气接口返回失败';
            throw new Error(`${reason} (status=${status})`);
        }

        const lives = Array.isArray(data?.lives) ? data.lives : [];
        const forecasts = Array.isArray(data?.forecasts) ? data.forecasts : [];
        const count = String(data?.count ?? '0');
        const info = String(data?.info || data?.message || '');
        const infocode = String(data?.infocode ?? '');

        const live = lives[0] ? normalizeLive(lives[0]) : null;
        const forecast = forecasts[0] ? normalizeForecast(forecasts[0]) : null;

        return {
            ok: true,
            type: normalizedType,
            status,
            count,
            info,
            infocode,
            adcode: String(live?.adcode || forecast?.adcode || normalizedAdcode),
            city: String(live?.city || forecast?.city || ''),
            province: String(live?.province || forecast?.province || ''),
            live,
            forecast,
            raw: data
        };
    } catch (error) {
        if (error?.isQuotaExceeded) {
            // 配额用完：使用友好提示
            handleApiError(error, message, '天气查询：API 调用额度已用完');
        } else {
            const detail = error instanceof Error ? error.message : '网络异常';
            message.error(`天气查询失败：${detail}`, { closable: true, duration: 6000 });
        }
        throw error instanceof Error ? error : new Error('天气查询失败');
    }
}
