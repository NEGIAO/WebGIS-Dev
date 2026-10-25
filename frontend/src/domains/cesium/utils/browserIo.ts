/**
 * browserIo.ts — 浏览器侧文本剪贴与文件落盘（Cesium 域内共用）
 *
 * 抽出原因：绘制面板（导出 GeoJSON / 复制坐标）与 TOC 右键（复制坐标 / 导出坐标）
 * 需要同一套兜底逻辑——剪贴板 API 在非安全上下文（http / 局域网 IP）不可用，
 * 必须退回 textarea + execCommand，否则局域网调试环境点了没反应。
 */

/**
 * 复制文本到剪贴板。
 * @param text 待复制文本（非字符串会被 String() 归一化）
 * @returns 是否成功；空内容直接返回 false
 */
export async function copyTextToClipboard(text: unknown): Promise<boolean> {
    const content = String(text ?? '');
    if (!content) return false;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(content);
            return true;
        }
    } catch {
        /* 落到下方兜底 */
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

/**
 * 以文本形式触发浏览器下载。
 * @param text 文件内容
 * @param filename 文件名（含扩展名）
 * @param mime MIME 类型，默认 text/plain
 */
export function downloadTextFile(text: unknown, filename: string, mime = 'text/plain'): void {
    const blob = new Blob([String(text ?? '')], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 文件名净化：去掉路径分隔符与非法字符，限制长度。
 * @param raw 原始名称（通常是图层名）
 * @param fallback 净化后为空时的兜底名
 * @returns 可直接用于 download 属性的文件名（不含扩展名）
 */
export function sanitizeFileName(raw: unknown, fallback = 'layer'): string {
    const cleaned = String(raw || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 60)
        .trim();
    return cleaned || fallback;
}
