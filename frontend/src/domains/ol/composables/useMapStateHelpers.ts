/**
 * 功能名称：useMapState 纯工具（debounce / URL 参数解析格式化 / 默认底图序号解析）
 * 日    期：2026/11/13
 */

import { DEFAULT_BASEMAP_URL_LAYER_NUMBER, getUrlLayerNumberByBasemapId } from '@common/basemap/basemapOptions';
/**
 * 轻量 debounce，支持 .cancel() 取消待执行的调用
 * 替代 lodash-es/debounce，减少 ~25KB 依赖
 */
export function debounce(fn: (...args: any[]) => any, ms: number) {
    let timer: any = null;
    const debounced = (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
    debounced.cancel = () => {
        clearTimeout(timer);
        timer = null;
    };
    return debounced;
}
const USER_PREFERENCE_BASEMAP_KEY = 'webgis_pref_default_basemap';
/**
 * 获取数组的第一个元素，如果不是数组则返回原值
 * @param {*} value - 待处理的值
 * @returns {*} 数组首元素或原值
 */
function getFirstValue(value: any) {
    if (Array.isArray(value)) return value[0];
    return value;
}
/**
 * 将值解析为有限的数字
 * @param {*} value - 待解析的值
 * @returns {number|null} 解析后的数字，或无法解析时返回 null
 */
export function parseNumber(value: any) {
    const firstValue = getFirstValue(value);
    if (firstValue === null || firstValue === undefined) return null;
    if (typeof firstValue === 'string' && firstValue.trim() === '') return null;

    const raw = Number(firstValue);
    return Number.isFinite(raw) ? raw : null;
}
/**
 * 将值解析为整数
 * @param {*} value - 待解析的值
 * @returns {number|null} 解析后的整数，或无法解析时返回 null
 */
export function parseInteger(value: any) {
    const raw = parseNumber(value);
    if (raw === null) return null;
    return Number.isInteger(raw) ? raw : null;
}
/**
 * 将数字格式化为指定小数位数的字符串
 * @param {*} value - 待格式化的值
 * @param {number} fractionDigits - 保留的小数位数
 * @returns {string|null} 格式化后的字符串，或无效时返回 null
 */
export function formatNumber(value: any, fractionDigits: number) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    return numberValue.toFixed(fractionDigits);
}
/**
 * 将 URL 传输链路中的 z 参数格式化为统一两位小数字符串。
 * @param {*} value - OL zoom 或 Cesium height 数值
 * @returns {string|null} 两位小数字符串，或无效时返回 null
 */
export function formatZParam(value: any) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    return numberValue.toFixed(2);
}
/**
 * 判断两个 query 快照是否完全一致，用于避免因只比较 nextQuery 而跳过清理字段。
 * @param {Record<string, string>} currentQuery - 当前 URL query 快照
 * @param {Record<string, string>} nextQuery - 清洗后的目标 query
 * @returns {boolean}
 */
export function isSameQuerySnapshot(currentQuery: Record<string, any>, nextQuery: Record<string, any>) {
    const currentKeys = Object.keys(currentQuery).filter((key) => currentQuery[key] !== undefined && currentQuery[key] !== null && currentQuery[key] !== '');
    const nextKeys = Object.keys(nextQuery).filter((key) => nextQuery[key] !== undefined && nextQuery[key] !== null && nextQuery[key] !== '');
    if (currentKeys.length !== nextKeys.length) return false;
    return nextKeys.every((key) => String(currentQuery[key] ?? '') === String(nextQuery[key] ?? ''));
}
export function resolvePreferredDefaultLayerIndex() {
    if (typeof window === 'undefined') return DEFAULT_BASEMAP_URL_LAYER_NUMBER;

    const storage = window.localStorage;
    if (!storage) return DEFAULT_BASEMAP_URL_LAYER_NUMBER;

    const preferredBasemapId = String(storage.getItem(USER_PREFERENCE_BASEMAP_KEY) || '').trim();
    if (!preferredBasemapId) return DEFAULT_BASEMAP_URL_LAYER_NUMBER;

    return getUrlLayerNumberByBasemapId(preferredBasemapId)
        ?? DEFAULT_BASEMAP_URL_LAYER_NUMBER;
}
