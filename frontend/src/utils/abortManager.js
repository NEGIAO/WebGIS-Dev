/**
 * 通用请求中断管理器
 *
 * 核心能力：当同一通道发起新请求时，自动 abort 旧请求，立即释放浏览器 TCP 连接槽位。
 * 解决的痛点：用户快速操作（如连续搜索、快速切换 Tab）时，旧请求占据 6 个并发连接槽位，
 * 新请求排队等待，导致界面卡顿/白屏。
 *
 * 设计来源：tileLifecycle.ts 中 AbortController 中断瓦片请求的机制，
 * 封装为通用工具供全前端使用。
 *
 * 用法 1 — fetch 请求：
 *   const manager = new AbortManager()
 *   const data = await manager.fetch('search', '/api/search?q=hello')
 *
 * 用法 2 — axios 请求：
 *   const data = await manager.run('search', (signal) =>
 *     backendAPI.get('/api/search', { params: { q: 'hello' }, signal })
 *   )
 *
 * 用法 3 — 包装为可中断函数：
 *   const search = manager.wrap((signal, query) =>
 *     fetch(`/api/search?q=${query}`, { signal }).then(r => r.json())
 *   )
 *   search('hello')  // 自动 abort 上一次 search
 *
 * 用法 4 — 全局单例：
 *   import { globalAbortManager } from '@/utils/abortManager'
 *   await globalAbortManager.fetch('search', url)
 */

import { onUnmounted } from 'vue';

export class AbortManager {
    /**
     * @param {object} [options]
     * @param {(reason: string) => void} [options.onAbort] - 旧请求被中断时的回调（调试用）
     */
    constructor(options = {}) {
        /** @type {Map<string, AbortController>} */
        this._controllers = new Map();
        this._onAbort = options.onAbort || null;
    }

    /**
     * 获取指定 key 的 AbortController。
     * 如果已存在旧 controller，先 abort 它并创建新的。
     *
     * @param {string} key - 请求通道标识（如 'search', 'geocode', 'weather'）
     * @returns {{ controller: AbortController, signal: AbortSignal }}
     */
    _getOrCreate(key) {
        const normalizedKey = String(key || '').trim() || '__default__';

        // abort 旧请求
        const existing = this._controllers.get(normalizedKey);
        if (existing && !existing.signal.aborted) {
            const reason = `aborted-by-new-request [${normalizedKey}]`;
            existing.abort(reason);
            if (this._onAbort) {
                this._onAbort(reason);
            }
        }

        // 创建新 controller
        const controller = new AbortController();
        this._controllers.set(normalizedKey, controller);

        return { controller, signal: controller.signal };
    }

    /**
     * 发起可中断的 fetch 请求。
     * 同 key 的新请求会自动 abort 旧请求。
     *
     * @param {string} key - 请求通道标识
     * @param {string|URL} url - 请求 URL
     * @param {RequestInit} [init] - fetch 选项（signal 会被自动注入）
     * @returns {Promise<Response>} - 注意：如果请求被 abort，会抛出 AbortError
     *
     * @example
     * // 搜索框输入时，每次新输入自动取消上一次请求
     * async function onInput(query) {
     *   try {
     *     const resp = await manager.fetch('search', `/api/search?q=${query}`)
     *     const data = await resp.json()
     *     renderResults(data)
     *   } catch (e) {
     *     if (e.name === 'AbortError') return // 被新请求取代，静默忽略
     *     throw e
     *   }
     * }
     */
    async fetch(key, url, init = {}) {
        const { signal } = this._getOrCreate(key);
        return fetch(url, { ...init, signal });
    }

    /**
     * 运行可中断的异步操作（支持任意异步函数，不限于 fetch/axios）。
     * 同 key 的新调用会自动 abort 旧调用。
     *
     * @template T
     * @param {string} key - 请求通道标识
     * @param {(signal: AbortSignal) => Promise<T>} fn - 接收 signal 的异步函数
     * @returns {Promise<T>}
     *
     * @example
     * // axios 用法
     * const data = await manager.run('weather', (signal) =>
     *   backendAPI.get('/api/weather', { params: { city: '110000' }, signal })
     * )
     *
     * @example
     * // 任意异步操作
     * await manager.run('load-file', async (signal) => {
     *   const resp = await fetch('/data.json', { signal })
     *   return resp.json()
     * })
     */
    async run(key, fn) {
        const { signal } = this._getOrCreate(key);
        return fn(signal);
    }

    /**
     * 包装一个异步函数为可中断版本。
     * 返回的新函数每次调用时自动 abort 上一次同 key 的调用。
     *
     * @template {(...args: any[]) => Promise<any>} T
     * @param {string} key - 请求通道标识
     * @param {(signal: AbortSignal, ...args: Parameters<T>) => ReturnType<T>} fn
     * @returns {T} 包装后的函数（参数不含 signal）
     *
     * @example
     * const searchLocations = manager.wrap('search', async (signal, query, page) => {
     *   const resp = await fetch(`/api/search?q=${query}&page=${page}`, { signal })
     *   return resp.json()
     * })
     *
     * // 使用时无需关心 signal
     * searchLocations('西南大学', 1)  // 自动 abort 上一次
     * searchLocations('北京大学', 1)  // 自动 abort 上一次
     */
    wrap(key, fn) {
        return (...args) => this.run(key, (signal) => fn(signal, ...args));
    }

    /**
     * 手动中断指定 key 的请求。
     *
     * @param {string} key - 请求通道标识
     * @param {string} [reason] - 中断原因
     */
    abort(key, reason = 'manual-abort') {
        const normalizedKey = String(key || '').trim() || '__default__';
        const controller = this._controllers.get(normalizedKey);
        if (controller && !controller.signal.aborted) {
            controller.abort(reason);
        }
    }

    /**
     * 中断所有正在进行的请求。
     *
     * @param {string} [reason] - 中断原因
     */
    abortAll(reason = 'abort-all') {
        for (const [, controller] of this._controllers) {
            if (!controller.signal.aborted) {
                controller.abort(reason);
            }
        }
    }

    /**
     * 检查指定 key 的请求是否已被中断。
     *
     * @param {string} key
     * @returns {boolean}
     */
    isAborted(key) {
        const normalizedKey = String(key || '').trim() || '__default__';
        const controller = this._controllers.get(normalizedKey);
        return controller ? controller.signal.aborted : true;
    }

    /**
     * 获取指定 key 的 AbortSignal（只读）。
     * 适用于需要将 signal 传递给第三方库的场景。
     *
     * @param {string} key
     * @returns {AbortSignal|null}
     */
    getSignal(key) {
        const normalizedKey = String(key || '').trim() || '__default__';
        const controller = this._controllers.get(normalizedKey);
        return controller ? controller.signal : null;
    }

    /**
     * 清理已完成/已中断的 controller，释放内存。
     * 建议在组件卸载时调用。
     */
    dispose() {
        this.abortAll('dispose');
        this._controllers.clear();
    }

    /**
     * 获取当前活跃（未中断）的请求数量。
     * @returns {number}
     */
    get activeCount() {
        let count = 0;
        for (const controller of this._controllers.values()) {
            if (!controller.signal.aborted) count++;
        }
        return count;
    }
}

// ==================== 全局单例 ====================

/**
 * 全局请求中断管理器单例。
 * 适用于跨组件共享的请求通道（如搜索、地理编码）。
 *
 * @example
 * import { globalAbortManager } from '@/utils/abortManager'
 *
 * // 搜索组件中
 * const data = await globalAbortManager.fetch('poi-search', url)
 */
export const globalAbortManager = new AbortManager({
    onAbort: (reason) => {
        if (import.meta.env.DEV) {
            console.warn(`[AbortManager] ${reason}`);
        }
    },
});

// ==================== Vue 组合式 API 便捷方法 ====================

/**
 * 在 Vue 组件中创建带自动清理的 AbortManager。
 * 组件卸载时自动 abort 所有请求并清理资源。
 *
 * 注意：必须在 Vue 组件 setup 上下文中调用（即 <script setup> 内）。
 *
 * @returns {AbortManager}
 *
 * @example
 * <script setup>
 * import { useAbortManager } from '@/utils/abortManager'
 *
 * const abortManager = useAbortManager()
 *
 * async function onSearch(query) {
 *   const data = await abortManager.fetch('search', `/api/search?q=${query}`)
 *   // ...
 * }
 * </script>
 */
export function useAbortManager() {
    const manager = new AbortManager();

    onUnmounted(() => manager.dispose());

    return manager;
}
