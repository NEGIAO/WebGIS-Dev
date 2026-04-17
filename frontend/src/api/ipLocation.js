import { useMessage } from '@/composables/useMessage';
import { parseAmapRectangleToExtent } from '@/utils/amapRectangle';

const AMAP_IP_API_ENDPOINT = 'https://restapi.amap.com/v3/ip';

function normalizeText(value) {
    if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === 'string' && item.trim());
        return first ? first.trim() : '';
    }

    if (typeof value === 'string') {
        const normalized = value.trim();
        return normalized === '[]' ? '' : normalized;
    }

    return '';
}

function resolveAmapWebServiceKey() {
    const envKey = String(
        import.meta.env.VITE_AMAP_WEB_SERVICE_KEY
        || import.meta.env.VITE_AMAP_KEY
        || import.meta.env.VITE_GAODE_KEY
        || ''
    ).trim();

    if (envKey) return envKey;

    if (typeof window !== 'undefined') {
        const globalKey = String(
            window.__AMAP_WEB_SERVICE_KEY__
            || window.AMAP_WEB_SERVICE_KEY
            || ''
        ).trim();
        if (globalKey) return globalKey;
    }

    return '';
}

function buildNormalizedResult(raw = {}) {
    const requestStatus = String(raw?.status ?? '0');

    return {
        ok: requestStatus === '1',
        status: requestStatus,
        requestStatus,
        city: normalizeText(raw?.city),
        province: normalizeText(raw?.province),
        adcode: normalizeText(raw?.adcode),
        extent: parseAmapRectangleToExtent(normalizeText(raw?.rectangle)),
        info: normalizeText(raw?.info),
        infocode: normalizeText(raw?.infocode),
        raw
    };
}

/**
 * 调用高德 IP 定位 API，并标准化返回结构。
 *
 * @param {string} [ip=''] 可选 IP；为空时由高德自动识别请求来源 IP
 * @param {{silent?: boolean}} [options={}] 选项：silent=true 时不触发全局消息
 * @returns {Promise<{ok:boolean,status:string,requestStatus:string,city:string,province:string,adcode:string,extent:number[]|null,info:string,infocode:string,raw:any,errorMessage?:string}>}
 */
export async function getIpLocation(ip = '', options = {}) {
    const message = useMessage();
    const { silent = false } = options || {};
    const key = resolveAmapWebServiceKey();

    if (!key) {
        const errorMessage = '高德 Web 服务 Key 未配置，无法执行 IP 定位。';
        if (!silent) {
            message.warning(errorMessage, { closable: true, duration: 5000 });
        }
        return {
            ok: false,
            status: '0',
            requestStatus: '0',
            city: '',
            province: '',
            adcode: '',
            extent: null,
            info: '',
            infocode: '',
            raw: null,
            errorMessage
        };
    }

    const query = new URLSearchParams({ key });
    const normalizedIp = String(ip || '').trim();
    if (normalizedIp) {
        query.set('ip', normalizedIp);
    }

    try {
        const response = await fetch(`${AMAP_IP_API_ENDPOINT}?${query.toString()}`);
        if (!response.ok) {
            throw new Error(`高德 IP 定位请求失败（HTTP ${response.status}）`);
        }

        const raw = await response.json();
        const normalized = buildNormalizedResult(raw);

        if (!normalized.ok) {
            const reason = normalized.info || '未知错误';
            if (!silent) {
                message.warning(`IP 定位失败：${reason}`, { closable: true, duration: 5000 });
            }
            return {
                ...normalized,
                errorMessage: `IP 定位失败：${reason}`
            };
        }

        return normalized;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '网络异常';
        if (!silent) {
            message.error(`IP 定位网络异常：${errorMessage}`, { closable: true, duration: 6000 });
        }

        return {
            ok: false,
            status: '0',
            requestStatus: '0',
            city: '',
            province: '',
            adcode: '',
            extent: null,
            info: '',
            infocode: '',
            raw: null,
            errorMessage
        };
    }
}
