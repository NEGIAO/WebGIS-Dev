/**
 * WMS / ArcGIS 取数通道
 *
 * 两类请求共用同一套健壮性策略：
 * - Capabilities 文本：直连失败（CORS / 自签证书）→ 后端 /proxy 兜底重试
 * - 点查 JSON：AbortController 硬超时保证 Promise 必然落地 + 代理兜底
 */

import { getCapabilitiesProxyBuilder } from '../capabilitiesProxy';
import type { ServiceRequestOptions } from './types';

const CAPABILITIES_FETCH_TIMEOUT_MS = 10000;

// ==================== 点查请求通道：超时 + 后端代理兜底 ====================
// 背景：目标服务常无 CORS 头（瓦片正是靠后端 /proxy/{url} 兜底才能加载）。
// 点查若裸直连，被拦/预检挂起时 Promise 永不 settle → UI 永久停留「查询中」。
// 因此所有点查请求统一走本通道：
//   1. AbortController 硬超时 —— 保证请求必然落地（成功/失败），UI 状态必然推进
//   2. 直连失败且调用方提供 buildProxyUrl 时 → 后端 /proxy/{url} 重试一次（与瓦片同通道）

/** 单次请求硬超时（毫秒） */
const POINT_QUERY_TIMEOUT_MS = 10000;

/**
 * 带超时的单次 JSON 请求；返回 { ok, status, text }，网络异常向上抛。
 * 失败仅 console.warn 留痕（含超时与原始错误），成功路径零日志。
 */
function toErrorInfo(error: unknown): { name?: string; message?: string } {
    if (typeof error === 'object' && error !== null) {
        return error as { name?: string; message?: string };
    }
    return {};
}

export async function fetchJsonText(
    url: string,
    timeoutMs: number,
): Promise<{ ok: boolean; status: number; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
    } catch (error: unknown) {
        const err = toErrorInfo(error);
        const reason = err.name === 'AbortError' ? `超时(${timeoutMs}ms)` : (err.message || '网络异常');
        console.warn('[Identify][fail]', reason, url);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 服务端 JSON 请求统一通道
 *
 * @param {string} url 完整请求地址
 * @param {{timeoutMs?:number, buildProxyUrl?:(url:string)=>string|null}} [options]
 *   - timeoutMs 单次请求超时（默认 10s）
 *   - buildProxyUrl 直连失败时的后端代理地址构造器（与瓦片 /proxy/{url} 同通道）；不传则直连失败即抛
 * @returns {Promise<Object>} 解析后的 JSON
 */
export async function requestServiceJson(url: string, options: ServiceRequestOptions = {}): Promise<any> {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : POINT_QUERY_TIMEOUT_MS;

    let direct;
    try {
        direct = await fetchJsonText(url, timeoutMs);
        if (!direct.ok) return Promise.reject(new Error(`服务响应异常（HTTP ${direct.status}）`));
        try {
            return JSON.parse(direct.text);
        } catch {
            // 响应可达但非 JSON（登录页/错误页等）→ 走代理重试通道
            throw new Error('响应非 JSON');
        }
    } catch (directError: unknown) {
        const directErr = toErrorInfo(directError);
        const proxiedUrl = options.buildProxyUrl?.(url);
        if (!proxiedUrl || proxiedUrl === url) {
            if (directErr.message === '响应非 JSON') throw directError;
            const reason = directErr.name === 'AbortError' ? '请求超时' : '网络不可达或跨域被拦截(CORS)';
            throw new Error(reason, { cause: directError });
        }
        const viaProxy = await fetchJsonText(proxiedUrl, timeoutMs).catch((proxyError: unknown) => {
            const proxyErr = toErrorInfo(proxyError);
            const reason = proxyErr.name === 'AbortError' ? '请求超时' : (proxyErr.message || '不可达');
            throw new Error(`直连失败且后端代理亦不可用（${reason}）`, { cause: proxyError });
        });
        if (!viaProxy.ok) throw new Error(`服务响应异常（HTTP ${viaProxy.status}，代理通道）`, { cause: directError });
        try {
            return JSON.parse(viaProxy.text);
        } catch {
            throw new Error('代理通道响应非 JSON');
        }
    }
}

export async function fetchCapabilitiesText(capabilitiesUrl: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CAPABILITIES_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(capabilitiesUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } catch (directError) {
        // 直连失败（自签证书 / CORS / 断网）→ 后端代理兜底重试一次（与瓦片同通道）
        const buildProxyUrl = getCapabilitiesProxyBuilder();
        const proxiedUrl = buildProxyUrl?.(capabilitiesUrl);
        if (!proxiedUrl || proxiedUrl === capabilitiesUrl) throw directError;
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), CAPABILITIES_FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(proxiedUrl, { signal: retryController.signal });
            if (!response.ok) throw directError; // 代理也失败 → 维持原始直连错误语义
            return await response.text();
        } finally {
            clearTimeout(retryTimeout);
        }
    } finally {
        clearTimeout(timeoutId);
    }
}
