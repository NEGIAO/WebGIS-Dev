/**
 * 浏览器下载触发工具（DOM 副作用隔离模块）
 *
 * 职责：封装 Blob / URL 两种下载触发模式，避免业务组件内联 DOM 操作。
 * - triggerBrowserDownload：Blob → 创建临时锚点 → 触发下载 → 释放对象 URL
 * - triggerUrlDownload：直接 URL → 创建临时锚点 → 触发下载
 */

/**
 * 通过 Blob 触发浏览器下载。
 * @param blob 文件 Blob
 * @param filename 下载文件名
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // 延迟释放对象 URL，确保下载已开始
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 通过 URL 触发浏览器原生下载（适用于后端已生成文件的情形）。
 * @param downloadUrl 完整下载 URL
 */
export function triggerUrlDownload(downloadUrl: string): void {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
}
