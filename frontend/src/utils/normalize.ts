/**
 * 规范化二值标记（0/1）
 * 统一处理 URL 参数中的布尔型标记值，支持字符串、数组、布尔值等多种输入。
 *
 * @param value - 原始标记值（可能来自 URLSearchParams.getAll() 返回数组）
 * @param fallback - 无法识别时的兜底值，默认 '0'
 * @returns 严格 '0' | '1'
 */
export function normalizeBinaryFlag(value: unknown, fallback: '0' | '1' = '0'): '0' | '1' {
    // URLSearchParams.getAll() 可能返回数组，取首个元素
    const first = Array.isArray(value) ? value[0] : value;
    const raw = String(first ?? '')
        .trim()
        .toLowerCase();
    if (raw === '1' || raw === 'true') return '1';
    if (raw === '0' || raw === 'false') return '0';
    return fallback;
}