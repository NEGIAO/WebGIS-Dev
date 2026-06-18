/**
 * URL 查询参数统一读取工具。
 * 所有 OL / Cesium / UI 组件通过此模块读取 hash query 和 route query，
 * 避免三处独立实现导致的行为不一致和快照分裂。
 *
 * 约定：
 * - hash query (#/home?key=val) 优先级高于 route.query
 * - 返回值去 trim、空字符串转换为空串（由调用方决定如何使用）
 */

/**
 * 读取 URL hash 后的单个查询参数值。
 * @param {string} key - 参数键名
 * @returns {string} 参数值（trim 后），无值时返回空字符串 ''
 */
export function readHashQueryValue(key) {
    if (typeof window === 'undefined') return '';
    const hash = String(window.location.hash || '');
    const queryStart = hash.indexOf('?');
    if (queryStart < 0) return '';
    return String(new URLSearchParams(hash.slice(queryStart + 1)).get(key) || '').trim();
}

/**
 * 获取当前 URL 查询参数的完整快照（合并 route.query 与 location.hash）。
 * hash query 参数优先级高于 route.query。
 *
 * @param {Object} [routeQuery={}] - Vue Router 的 route.query 对象
 * @returns {Record<string, string>} 合并后的参数快照
 */
export function getCurrentQuerySnapshot(routeQuery = {}) {
    const snapshot = {};

    // 第一层：route.query
    Object.keys(routeQuery).forEach((key) => {
        const raw = Array.isArray(routeQuery[key]) ? routeQuery[key][0] : routeQuery[key];
        if (raw !== undefined && raw !== null && raw !== '') {
            snapshot[key] = String(raw);
        }
    });

    // 第二层：location.hash query（覆盖同名字段）
    if (typeof window !== 'undefined') {
        const hash = String(window.location.hash || '');
        const queryStart = hash.indexOf('?');
        if (queryStart >= 0) {
            const params = new URLSearchParams(hash.slice(queryStart + 1));
            params.forEach((value, key) => {
                if (value !== undefined && value !== null && value !== '') {
                    snapshot[key] = String(value);
                }
            });
        }
    }

    return snapshot;
}

/**
 * 读取单个查询参数值（优先 hash，其次 route.query）。
 *
 * @param {string} key - 参数键名
 * @param {Object} [routeQuery={}] - Vue Router 的 route.query 对象
 * @returns {string} 参数值（trim 后），无值时返回空字符串 ''
 */
export function readQueryValue(key, routeQuery = {}) {
    const hashValue = readHashQueryValue(key);
    if (hashValue !== '') return hashValue;

    const routeValue = Array.isArray(routeQuery[key]) ? routeQuery[key][0] : routeQuery[key];
    return String(routeValue ?? '').trim();
}