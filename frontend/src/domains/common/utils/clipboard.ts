/**
 * 剪贴板工具函数
 */

/**
 * 复制文本到剪贴板（优先使用现代 API，降级到 execCommand）
 * @param text 要复制的文本
 * @returns Promise<void>
 */
export async function copyToClipboard(text: string): Promise<void> {
    const value = String(text || '').trim();
    if (!value) return;
    try {
        await navigator.clipboard.writeText(value);
    } catch {
        // 降级方案：使用 textarea + execCommand
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}
