/**
 * 统一地图命令总线 (MapCommandBus)
 *
 * 职责：解耦 UI 面板与地图引擎适配器之间的显式依赖。
 * 面板发出业务意图命令（如 'camera:flyTo'、'tool:activate'、'layer:toggle'），
 * 由适配器订阅并翻译为底层原生调用；同时适配器发出状态变更事件，供面板被动监听。
 */

import type { MapCommand, MapEventListener } from './types';

export class MapCommandBus {
    private listeners = new Map<string, Set<MapEventListener>>();

    /**
     * 向总线派发指令
     * @param type 命令动词标识（如 'camera:flyTo', 'layer:toggle'）
     * @param payload 命令附带参数载荷
     */
    dispatch<T = unknown>(type: string, payload?: T): void {
        const handlers = this.listeners.get(type);
        if (!handlers || handlers.size === 0) return;

        const cmd: MapCommand<T> = {
            type,
            payload,
            timestamp: Date.now(),
        };

        handlers.forEach((handler) => {
            try {
                handler(cmd);
            } catch (err) {
                console.error(`[MapCommandBus] Error handling command "${type}":`, err);
            }
        });
    }

    /**
     * 订阅指定命令
     * @param type 命令动词
     * @param handler 回调处理函数（入参为完整 MapCommand 对象）
     * @returns 用于取消订阅的无参销毁函数
     */
    subscribe<T = unknown>(type: string, handler: (cmd: MapCommand<T>) => void): () => void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        const set = this.listeners.get(type)!;
        set.add(handler as MapEventListener);

        return () => {
            set.delete(handler as MapEventListener);
            if (set.size === 0) {
                this.listeners.delete(type);
            }
        };
    }

    /**
     * 便捷别名：与 subscribe 语义一致
     */
    on<T = unknown>(type: string, handler: (cmd: MapCommand<T>) => void): () => void {
        return this.subscribe(type, handler);
    }

    /**
     * 手动移除指定监听器
     */
    off(type: string, handler: MapEventListener): void {
        const set = this.listeners.get(type);
        if (set) {
            set.delete(handler);
            if (set.size === 0) {
                this.listeners.delete(type);
            }
        }
    }

    /**
     * 清理所有已注册的命令监听器
     */
    clear(): void {
        this.listeners.clear();
    }
}

/** 全局单例命令总线 */
export const mapCommandBus = new MapCommandBus();
