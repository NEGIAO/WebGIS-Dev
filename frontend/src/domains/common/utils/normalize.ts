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

/**
 * 规范化定位来源标记
 * 处理 URL 参数中的 loc 标记，支持 'gps' | 'ip' | '0' (unknown/other)
 *
 * @param value - 原始标记值
 * @param fallback - 无法识别时的兜底值，默认 '0'
 * @returns 标准化后的定位来源标记
 */
export function normalizeLocationFlag(value: unknown, fallback: 'gps' | 'ip' | '0' = '0'): 'gps' | 'ip' | '0' {
    const first = Array.isArray(value) ? value[0] : value;
    const raw = String(first ?? '')
        .trim()
        .toLowerCase();
    if (raw === 'gps' || raw === '1') return 'gps';
    if (raw === 'ip') return 'ip';
    return fallback;
}

/**
 * 规范化文本值：null/undefined 归一为空串，其余 trim
 * 统一处理可能为 null/undefined 的上下文字段来源（如定位 source）
 *
 * @param value - 原始值
 * @returns 去除首尾空白后的字符串（null/undefined 返回 ''）
 */
export function normalizeText(value: unknown): string {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}