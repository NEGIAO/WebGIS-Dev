/**
 * 瓦片源工厂 — 请求生命周期管理
 *
 * 从 useTileSourceFactory.ts 拆分。
 * 负责瓦片请求优先级控制、错误标记、中断管理。
 *
 * 核心机制：
 * - 每个源绑定一个 AbortController，tileLoadFunction 通过 fetch() + signal 加载瓦片
 * - abort() 会真正中断浏览器底层 TCP 连接（而非仅标记）
 * - epoch 计数器防止过期请求的结果被采纳
 */

import { TILE_STATE_ERROR, TILE_REQUEST_TIMEOUT_MS } from './types';

// ==================== 内部工具函数 ====================

const TILE_PROXY_BASE_URL = String(
    import.meta.env.VITE_TILE_PROXY_BASE_URL ||
        import.meta.env.VITE_BACKEND_URL ||
        'https://negiao-webgis.hf.space',
).replace(/\/$/, '');
const TILE_PROXY_MODE = String(import.meta.env.VITE_TILE_PROXY_MODE || 'fallback').toLowerCase();

function markTileAsError(tile: any): void {
    if (tile && typeof tile.setState === 'function') {
        tile.setState(TILE_STATE_ERROR);
    }
}

function markAllSourceTilesAsError(source: any): void {
    if (!source || typeof source.getTileCache !== 'function') return;
    const cache = source.getTileCache();
    if (!cache) return;

    const keys: string[] = [];
    try {
        cache.forEach((value: any, key: string) => {
            keys.push(key);
        });
    } catch {
        // 某些 OL 版本的 tileCache 不支持 forEach（如 ol <7 的 LRUCache）
    }

    for (const key of keys) {
        try {
            const tile = cache.get(key);
            markTileAsError(tile);
        } catch {
            // best-effort
        }
    }
}

function getSourceEpoch(source: any): number {
    if (source && typeof source.get === 'function') {
        return Number(source.get('abortEpoch') || 0);
    }
    return 0;
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(String(value || '').trim());
}

function canProxyTileUrl(srcUrl: string): boolean {
    if (TILE_PROXY_MODE === 'off') return false;
    if (!isHttpUrl(srcUrl)) return false;

    try {
        const tileUrl = new URL(srcUrl);
        const backendUrl = new URL(TILE_PROXY_BASE_URL);
        if (tileUrl.origin === backendUrl.origin) return false;
        if (typeof window !== 'undefined' && tileUrl.origin === window.location.origin) return false;
        if (tileUrl.pathname.startsWith('/proxy/') || tileUrl.pathname.startsWith('/tiles/')) {
            return false;
        }
    } catch {
        return false;
    }

    return true;
}

// 复用既有后端 /proxy/{URL}，仅在 fallback/always 模式下处理第三方 CORS 问题。
function buildTileProxyUrl(srcUrl: string): string | null {
    if (!canProxyTileUrl(srcUrl)) return null;
    return `${TILE_PROXY_BASE_URL}/proxy/${srcUrl}`;
}

async function requestTileAsBlobUrl(
    requestUrl: string,
    signal: AbortSignal,
): Promise<string | null> {
    try {
        const resp = await fetch(requestUrl, {
            signal,
            mode: 'cors',
            credentials: 'omit',
        });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return URL.createObjectURL(blob);
    } catch {
        // AbortError / TypeError(CORS) / 网络错误 → 返回 null
        return null;
    }
}

/**
 * 用 fetch() 加载图片并绑定 AbortSignal，使 abort() 能真正中断 TCP 连接。
 * 成功时返回 blob URL，失败/中断时返回 null。
 *
 * 为什么不用 img.src？
 * - 浏览器对 <img> 的 HTTP 请求由内核管理，JS 无法中途取消
 * - 被墙的源会阻塞 30-60 秒占据并发连接槽位
 * - fetch() + AbortController 可以立即释放底层连接
 */
async function fetchTileAsBlobUrl(
    srcUrl: string,
    signal: AbortSignal,
): Promise<string | null> {
    const proxyUrl = buildTileProxyUrl(srcUrl);

    if (TILE_PROXY_MODE === 'always' && proxyUrl) {
        return requestTileAsBlobUrl(proxyUrl, signal);
    }

    const directUrl = await requestTileAsBlobUrl(srcUrl, signal);
    if (directUrl || TILE_PROXY_MODE === 'off' || !proxyUrl || signal.aborted) return directUrl;

    return requestTileAsBlobUrl(proxyUrl, signal);
}

// ==================== 公开 API ====================

/**
 * 给瓦片源的 tileLoadFunction 注入 AbortController，
 * 通过 fetch() + signal 实现真正的网络级中断。
 *
 * 工作流程：
 * 1. 每次 tile 加载前检查 epoch（防止过期请求的结果被采纳）
 * 2. 检查 signal.aborted（已被 abort 的请求直接标记错误）
 * 3. 用 fetch() + signal 加载图片（abort 时立即释放 TCP 连接）
 * 4. 成功后创建 blob URL 赋给 img.src
 */
export function prioritizeTileSourceRequest<T>(source: T): T {
    const src = source as any;
    if (!src || typeof src.set !== 'function') return source;

    const controller = new AbortController();
    src.set('abortController', controller);

    const originalTileLoadFn = src.getTileLoadFunction?.();
    if (typeof originalTileLoadFn === 'function') {
        src.setTileLoadFunction((tile: any, srcUrl: string) => {
            const currentEpoch = getSourceEpoch(src);
            const tileEpoch = Number(tile.get?.('epoch') || 0);
            if (tileEpoch < currentEpoch) {
                markTileAsError(tile);
                return;
            }

            const signal = controller.signal;
            if (signal.aborted) {
                markTileAsError(tile);
                return;
            }

            const img = tile.getImage?.();
            if (img instanceof HTMLImageElement) {
                // 用 fetch() + AbortSignal 加载，使 abort() 能中断底层连接
                let blobUrl: string | null = null;

                // 监听 abort 信号：释放 blob URL 防止内存泄漏
                const onAbort = () => {
                    if (blobUrl) {
                        URL.revokeObjectURL(blobUrl);
                        blobUrl = null;
                    }
                    markTileAsError(tile);
                };
                signal.addEventListener('abort', onAbort, { once: true });

                // 带超时的 fetch（防止被墙请求无限挂起）
                const timeoutMs = TILE_REQUEST_TIMEOUT_MS;
                const timeoutId = setTimeout(() => {
                    // 超时后不主动 abort（由上层 abortTileSourceRequests 统一管理）
                    // 仅标记 tile 为错误状态
                    markTileAsError(tile);
                }, timeoutMs);

                fetchTileAsBlobUrl(srcUrl, signal)
                    .then((url) => {
                        clearTimeout(timeoutId);
                        signal.removeEventListener('abort', onAbort);

                        // 再次检查 epoch 和 signal（fetch 期间可能已 abort）
                        const latestEpoch = getSourceEpoch(src);
                        const tileEpochNow = Number(tile.get?.('epoch') || 0);
                        if (tileEpochNow < latestEpoch || signal.aborted) {
                            if (url) URL.revokeObjectURL(url);
                            markTileAsError(tile);
                            return;
                        }

                        if (url) {
                            blobUrl = url;
                            img.addEventListener('error', () => {
                                markTileAsError(tile);
                                URL.revokeObjectURL(url);
                            }, { once: true });
                            img.src = url;
                        } else {
                            markTileAsError(tile);
                        }
                    })
                    .catch(() => {
                        clearTimeout(timeoutId);
                        signal.removeEventListener('abort', onAbort);
                        markTileAsError(tile);
                    });
            } else {
                // 非 HTMLImageElement（如 Canvas），回退到原始 loadFunction
                // 仍然检查 epoch 防止过期结果
                originalTileLoadFn(tile, srcUrl);
            }
        });
    }

    return source;
}

/**
 * 阻断该图源所有正在进行的网络请求
 *
 * 四层级联释放：
 *   1. epoch++：所有进行中的 tileLoadFunction 在 fetch 回调时发现 epoch 过期，丢弃结果
 *   2. controller.abort()：中断所有正在进行的 fetch() 请求，立即释放 TCP 连接
 *   3. 标记所有缓存 tile 为 ERROR 状态
 *   4. source.clear()：清空 OL 内部瓦片缓存
 */
export function abortTileSourceRequests(source: any): void {
    if (!source || typeof source.get !== 'function') return;

    // ① epoch 递增：使进行中的异步回调失效
    const currentEpoch = getSourceEpoch(source);
    if (typeof source.set === 'function') {
        source.set('abortEpoch', currentEpoch + 1);
    }

    // ② AbortController：中断所有 fetch() 请求，释放 TCP 连接
    const controller = source.get('abortController');
    if (controller instanceof AbortController) {
        controller.abort('tile-source-aborted');
        source.set('abortController', new AbortController());
    }

    // ③ 标记缓存 tile 为错误
    try {
        markAllSourceTilesAsError(source);
    } catch {
        // best-effort
    }

    // ④ 清空源缓存
    if (typeof source.clear === 'function') {
        try {
            source.clear();
        } catch {
            // ignore
        }
    }
}
