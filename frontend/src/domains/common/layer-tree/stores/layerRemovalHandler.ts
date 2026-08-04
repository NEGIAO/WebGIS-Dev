/**
 * 图层移除回调注册表（跨域解耦）
 *
 * 供 common 域（useTOCStore）在移除图层时通知引擎域（OL featureStyleStore 等）
 * 联动清理，而无需 common 反向 import 引擎域模块。
 * 依赖方向：引擎域 → common 注册回调；common 零引擎域依赖。
 */

export type LayerRemovalHandler = (layerId: string) => void;

const layerRemovalHandlers: LayerRemovalHandler[] = [];

/**
 * 注册图层移除回调，返回注销函数。
 * @param handler 移除回调 (layerId) => void
 * @returns 注销函数（调用后不再接收后续通知）
 */
export function registerLayerRemovalHandler(handler: LayerRemovalHandler): () => void {
    layerRemovalHandlers.push(handler);
    return () => {
        const index = layerRemovalHandlers.indexOf(handler);
        if (index >= 0) layerRemovalHandlers.splice(index, 1);
    };
}

/**
 * 通知所有注册的回调：某图层已被移除。
 * @param layerId 被移除的图层 id
 */
export function notifyLayerRemoved(layerId: string): void {
    for (const handler of layerRemovalHandlers) {
        try {
            handler(layerId);
        } catch (error) {
            console.warn('[layerRemovalHandler] 图层移除回调执行失败:', error);
        }
    }
}
