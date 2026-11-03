/**
 * @file 二进制响应体错误解析（blob / Blob 兜底文案）
 *
 * 背景：axios 请求设置 `responseType: 'blob'` 时，非 2xx 的响应体同样是 Blob，
 * 拦截器里 `response.data.detail` 恒为 `undefined`，错误提示会退化成语义空洞的
 * `Request failed with status code 4xx`，用户无法判断是额度不足、参数错误还是鉴权失败。
 *
 * 本模块把「从二进制错误体还原后端文案」收敛为单一实现，供两个互不共享拦截器的
 * 客户端复用：
 *   - `api/backend/client.js`（主站通用客户端）
 *   - `api/download.js`（独立下载节点客户端，刻意不复用主站拦截器）
 */
import { getHttpStatusMessage } from './httpStatusMap';

/** 解析结果：可直接用于构造 Error 的文案与业务错误码 */
export interface ErrorPayload {
    /** 面向用户的错误文案；解析失败时退回「请求失败 [状态码]」 */
    message: string;
    /** 后端业务错误码（如 DOWNLOAD_QUOTA_INSUFFICIENT）；无则为空串 */
    detailCode: string;
}

/** 从已解析的 JSON 错误体中提取 detail / message / detail_code */
function extractFromJson(json: unknown): ErrorPayload {
    let message = '';
    let detailCode = '';

    // 入参来自 JSON.parse / axios，形态不可信：先收窄成对象再逐层判型，
    // 不引入 any —— 否则「外部数据」等于绕过整个类型系统。
    const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
    const detail = root.detail;

    if (typeof detail === 'string') {
        message = detail;
    } else if (detail && typeof detail === 'object') {
        const d = detail as Record<string, unknown>;
        message = String(d.message || d.detail || root.message || '');
        detailCode = String(d.code || '');
    } else if (root.message) {
        message = String(root.message);
    }
    if (!detailCode && root.detail_code) {
        detailCode = String(root.detail_code);
    }

    return { message, detailCode };
}

/**
 * 从响应体中提取后端错误文案与业务错误码。
 *
 * @param data 响应体，可能是 Blob（responseType: 'blob'）、JSON 对象或空值
 * @param status HTTP 状态码，用于兜底文案
 * @returns 文案与业务错误码；永不为 null
 * @remarks 只读不抛：任何解析异常都退回状态码文案，避免「解析错误」覆盖「真实错误」
 */
export async function readErrorPayload(data: unknown, status: number): Promise<ErrorPayload> {
    const fallbackMessage = `请求失败 [${status}] ${getHttpStatusMessage(status)}`;

    // 分支一：JSON 类型的 Blob —— 读文本后按 detail 契约解析
    if (data instanceof Blob && /json/i.test(data.type || '')) {
        try {
            const { message, detailCode } = extractFromJson(JSON.parse(await data.text()));
            return { message: message || fallbackMessage, detailCode };
        } catch {
            return { message: fallbackMessage, detailCode: '' };
        }
    }

    // 分支二：非 JSON 的 Blob（如 HTML 错误页 / 网关提示图）—— 取前 200 字符辅助定位
    if (data instanceof Blob) {
        try {
            const snippet = (await data.text()).slice(0, 200).trim();
            return {
                message: snippet ? `[${status}] ${snippet}` : fallbackMessage,
                detailCode: '',
            };
        } catch {
            return { message: fallbackMessage, detailCode: '' };
        }
    }

    // 分支三：普通 JSON 响应体（下载节点部分接口不返回 blob）
    if (data && typeof data === 'object') {
        const { message, detailCode } = extractFromJson(data);
        return { message: message || fallbackMessage, detailCode };
    }

    return { message: fallbackMessage, detailCode: '' };
}
