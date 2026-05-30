/**
 * 瓦片源工厂 — 请求生命周期管理
 *
 * 从 useTileSourceFactory.ts 拆分。
 * 负责瓦片请求优先级控制、错误标记、中断管理。
 */

import { TILE_STATE_ERROR } from './types';

function markTileAsError(tile: any): void {
    if (tile && typeof tile.setState === 'function') {
        tile.setState(TILE_STATE_ERROR);
    }
}

function markAllSourceTilesAsError(source: any): void {
    if (!source || typeof source.getTileCache !== 'function') return;
    const cache = source.getTileCache();
    if (!cache) return;

    // 遍历缓存中的所有 tile 并标记为错误
    const keys: string[] = [];
    try {
        cache.forEach((value: any, key: string) => {
            keys.push(key);
        });
    } catch {
        // 某些 OL 版本的 cache 不支持 forEach
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

/**
 * 给瓦片源的 tileLoadFunction 注入 AbortController，
 * 使浏览器优先发送瓦片请求，并支持中断。
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
                img.addEventListener('error', () => markTileAsError(tile), { once: true });
                img.src = srcUrl;
            } else {
                originalTileLoadFn(tile, srcUrl);
            }
        });
    }

    return source;
}

/**
 * 阻断该图源所有正在进行的网络请求
 * 三层级联释放：(1) 发送 abort signal，(2) 标记所有缓存/loading 的 tiles，(3) clear 源
 */
export function abortTileSourceRequests(source: any): void {
    if (!source || typeof source.get !== 'function') return;

    const currentEpoch = getSourceEpoch(source);
    if (typeof source.set === 'function') {
        source.set('abortEpoch', currentEpoch + 1);
    }

    const controller = source.get('abortController');
    if (controller instanceof AbortController) {
        controller.abort();
        source.set('abortController', new AbortController());
    }

    try {
        markAllSourceTilesAsError(source);
    } catch {
        // best-effort only
    }

    if (typeof source.clear === 'function') {
        try {
            source.clear();
        } catch {
            // ignore
        }
    }
}
