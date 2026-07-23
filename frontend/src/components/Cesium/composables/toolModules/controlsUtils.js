/**
 * controlsUtils.js
 * 工具面板控件通用数值工具函数
 *
 * 被多个模块的控件创建函数共用。
 */

/**
 * 将值转为有限数字，非有限时返回 null
 * @param {*} value
 * @returns {number|null}
 */
export function toFiniteNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/**
 * 将值限制在 [min, max] 区间内
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * 格式化高程为 m 单位字符串（自动根据量级调节精度）
 * @param {number} value - 高程值（米）
 * @returns {string}
 */
export function formatElevation(value) {
    const absoluteValue = Math.abs(value);
    if (absoluteValue >= 1000) return value.toFixed(1);
    if (absoluteValue >= 10) return value.toFixed(2);
    return value.toFixed(3);
}