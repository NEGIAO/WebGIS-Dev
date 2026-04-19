import { useMessage } from '@/composables/useMessage';
import { parseAmapRectangleToExtent } from '@/utils/amapRectangle';
import backendAPI, { handleApiError } from './backend';

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
    const normalizedIp = String(ip || '').trim();

    try {
        const raw = await backendAPI.get('/api/proxy/amap/ip', {
            params: normalizedIp ? { ip: normalizedIp } : {}
        });
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
        let errorMessage = '网络异常';
        if (error?.isQuotaExceeded) {
            // 配额用完：使用友好提示
            handleApiError(error, message, 'IP 定位：API 调用额度已用完');
            errorMessage = String(error?.message || 'IP 定位：API 调用额度已用完');
        } else {
            errorMessage = error instanceof Error ? error.message : '网络异常';
            if (!silent) {
                message.error(`IP 定位网络异常：${errorMessage}`, { closable: true, duration: 6000 });
            }
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
