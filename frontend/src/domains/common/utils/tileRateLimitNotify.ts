/**
 * 瓦片 429 限流提示（OpenLayers / Cesium 共用）。
 * 模块级防抖：短时间内大量瓦片失败时只弹一次 toast。
 */

import { useMessage } from '@common/shell/useMessage';

let lastNotifyAt = 0;
const NOTIFY_DEBOUNCE_MS = 15000;

/**
 * 功能：弹出瓦片限流 warning；15s 内只弹一次。
 * 参数：detail — 可选后端 detail/message 文案片段。
 * 返回：void。
 */
export function notifyTileRateLimited(detail?: string): void {
    const now = Date.now();
    if (now - lastNotifyAt < NOTIFY_DEBOUNCE_MS) return;
    lastNotifyAt = now;
    const text = detail?.trim()
        ? `瓦片请求受限：${detail}`
        : '瓦片请求过于频繁，已被限流，请稍后再试或缩小缩放级别';
    try {
        const { warning } = useMessage();
        warning(text, { duration: 6000 });
    } catch {
        // 非 Vue 上下文静默
    }
}

/**
 * 功能：从 HTTP 响应尝试提取限流/错误 detail 文案。
 * 参数：resp — fetch Response。
 * 返回：detail 字符串（可能为空）。
 */
export async function extractTileErrorDetail(resp: Response): Promise<string> {
    try {
        if (resp.status === 429) {
            const text = await resp.text();
            if (!text) return '';
            try {
                const json = JSON.parse(text) as { detail?: unknown; message?: unknown };
                return String(json?.detail || json?.message || '').trim();
            } catch {
                return text.slice(0, 120).trim();
            }
        }
    } catch {
        // ignore
    }
    return '';
}
