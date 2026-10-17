/**
 * unifiedActionRouter.js — 统一图层操作路由器（OL / Cesium 双引擎）
 *
 * 设计（详见 Docs/TODO/unified-layer-management-refactor-plan.md §P1）：
 * - 每引擎注册一张 { method: fn } 处理器表，由各 Container 挂载时注入
 * - action = { method, payload, engine? }；engine 缺省回落到当前引擎
 * - 处理器返回 false 视为未处理（调用方可降级）；其余视为已处理
 *
 * 边界：本模块只做分发，不持有任何引擎对象——引擎句柄生命周期归 Container。
 */

const handlers = new Map(); // engine → { methodName: fn }

/** 引擎挂载时注入处理器表（后注册覆盖先注册） */
export function registerEngineHandlers(engine, api) {
    if (!engine || !api || typeof api !== 'object') return;
    handlers.set(String(engine).toLowerCase(), api);
}

/** 引擎卸载时反注册，避免 stale closure 被再次调度 */
export function unregisterEngineHandlers(engine) {
    handlers.delete(String(engine || '').toLowerCase());
}

/**
 * 最近一次分发失败的原因（引擎未注册 / 处理器缺失 / 执行抛错），供调用方展示诊断。
 * 成功分发后清零，避免旧错误误导。
 */
export let lastDispatchError = null;

/**
 * 分发一个图层操作
 * @param {{method:string, payload?:object, engine?:string}} action
 * @returns {boolean} 是否被某引擎处理器消费
 */
export function dispatchLayerAction(action) {
    const method = String(action?.method || '').trim();
    if (!method) {
        lastDispatchError = new Error('空 method');
        return false;
    }
    const engine = String(action?.engine || 'ol').toLowerCase();
    const api = handlers.get(engine);
    if (!api || typeof api[method] !== 'function') {
        lastDispatchError = new Error(
            `引擎 [${engine}] 未注册或不支持 ${method}（可能容器未挂载/已卸载）`,
        );
        console.warn(`[ActionRouter] ${engine} 引擎不支持 ${method}`);
        return false;
    }
    try {
        const result = api[method](action.payload || {});
        // handler 可能返回 Promise：同步 catch 捕不到 rejection，
        // 这里吞掉 rejection 并视为未处理，同时避免 unhandledrejection 逃逸
        if (result && typeof result.then === 'function') {
            result.then(
                () => {
                    lastDispatchError = null;
                },
                (error) => {
                    lastDispatchError = error;
                    console.warn(`[ActionRouter] ${engine}.${method} 异步执行失败:`, error);
                },
            );
            return true;
        }
        lastDispatchError = null;
        return result !== false;
    } catch (error) {
        lastDispatchError = error;
        console.warn(`[ActionRouter] ${engine}.${method} 执行失败:`, error);
        return false;
    }
}
