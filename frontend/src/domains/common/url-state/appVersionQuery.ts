/**
 * URL 版本参数注入（V3.7.12）。
 *
 * 把构建期从 README 提取的版本号（__APP_VERSION__，形如 `V3.7.12`）写入 URL search 的
 * `v` 参数，供缓存标识与人工排查：访问 `webgis.negiao.cn` → `webgis.negiao.cn/?v=3.7.12#/`。
 *
 * 设计约束：
 * - 只写 search，不碰 hash：hash 内的 s/p/loc/ut 由 URL 参数 store 与分享逻辑管理，
 *   混入 `v` 会污染分享链接语义；
 * - 用 history.replaceState：版本是展示元数据，不产生历史记录条目、不触发路由守卫；
 * - 幂等：值与当前版本一致时不动，避免重复写 URL；
 * - 保留其它 search 参数与 hash 全部内容。
 */

declare const __APP_VERSION__: string;

/** URL search 中承载版本号的参数名 */
const VERSION_QUERY_KEY = 'v';

/**
 * 从构建期版本常量提取纯数字版本：`V3.7.12` → `3.7.12`。
 *
 * @returns 数字版本串；无法提取时返回空串（调用方据此跳过注入）
 */
export function extractNumericAppVersion(): string {
    try {
        const raw = String(typeof __APP_VERSION__ === 'undefined' ? '' : __APP_VERSION__);
        const matched = /V?(\d+\.\d+\.\d+)/.exec(raw.trim());
        return matched ? matched[1] : '';
    } catch {
        return '';
    }
}

/**
 * 把当前版本注入 URL search 的 `v` 参数（幂等，保留其余参数与 hash）。
 *
 * @returns 是否实际改动了 URL（false 表示已存在相同版本或环境不支持）
 */
export function injectAppVersionToUrl(): boolean {
    if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') {
        return false;
    }

    const version = extractNumericAppVersion();
    if (!version) return false;

    try {
        const current = new URLSearchParams(window.location.search);
        const hash = String(window.location.hash || '');

        // V3.7.13：清理历史写回路径残留在 hash query 内的 v（版本只应存在于根 search）
        let nextHash = hash;
        const queryStart = hash.indexOf('?');
        if (queryStart >= 0) {
            const hashPath = hash.slice(0, queryStart);
            const hashParams = new URLSearchParams(hash.slice(queryStart + 1));
            if (hashParams.has(VERSION_QUERY_KEY)) {
                hashParams.delete(VERSION_QUERY_KEY);
                const cleaned = hashParams.toString();
                nextHash = cleaned ? `${hashPath}?${cleaned}` : hashPath;
            }
        }

        const searchNeedsUpdate = current.get(VERSION_QUERY_KEY) !== version;
        if (!searchNeedsUpdate && nextHash === hash) return false;

        if (searchNeedsUpdate) current.set(VERSION_QUERY_KEY, version);
        const path = String(window.location.pathname || '/');
        const nextUrl = `${path}?${current.toString()}${nextHash}`;

        window.history.replaceState(window.history.state, '', nextUrl);
        return true;
    } catch {
        // URL 构造失败时静默跳过，不阻断应用启动
        return false;
    }
}
