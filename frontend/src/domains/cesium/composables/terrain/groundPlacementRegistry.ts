/**
 * groundPlacementRegistry.ts — 类型 → 贴地策略 注册表
 *
 * 契约：策略只提供**行为**，能力元数据统一从 `groundPlacementCapabilities` 取，
 * 保证「菜单声明」与「实际实现」同源，不会出现「有按钮但点了没反应」。
 */

import {
    GROUND_MODE,
    getGroundCapability,
    listGroundPlacementCapabilities,
} from './groundPlacementCapabilities';
import type { GroundCapability, GroundStrategy } from './groundPlacementCapabilities';

/** 注册后的策略（能力已绑定） */
export interface RegisteredStrategy {
    capability: GroundCapability;
    fit: GroundStrategy['fit'];
    reset: GroundStrategy['reset'];
    setOffset?: GroundStrategy['setOffset'];
    getOffset?: GroundStrategy['getOffset'];
}

const registry = new Map<string, RegisteredStrategy>();

/**
 * 注册策略。重复注册会覆盖并告警（便于热更新与测试注入）。
 */
export function registerStrategy(strategy: GroundStrategy): void {
    const types = Array.isArray(strategy?.types) ? strategy.types : [];
    if (!types.length) {
        console.warn('[GroundPlacement] 策略缺少 types，已忽略');
        return;
    }
    types.forEach((type) => {
        const capability = getGroundCapability(type);
        if (!capability) {
            // 能力表没登记 → 菜单不会出现入口，注册了也没人调；显式告警避免静默失效
            console.warn('[GroundPlacement] 类型未在能力表登记，策略不会被使用:', type);
            return;
        }
        if (registry.has(type)) {
            console.warn('[GroundPlacement] 策略重复注册，后者覆盖前者:', type);
        }
        registry.set(type, {
            capability,
            fit: strategy.fit,
            reset: strategy.reset,
            setOffset: strategy.setOffset,
            getOffset: strategy.getOffset,
        });
    });
}

/** 取某类型的策略实现 */
export function getStrategy(type: string): RegisteredStrategy | null {
    return registry.get(String(type || '')) || null;
}

/** 已注册策略的类型 */
export function listRegisteredTypes(): string[] {
    return [...registry.keys()];
}

/**
 * 启动自检：能力表声明了「需要贴地」（mode !== none）但没有策略实现的类型 = 接入未完成。
 * @returns 缺失实现的类型
 */
export function findMissingStrategies(): string[] {
    const missing: string[] = [];
    listGroundPlacementCapabilities().forEach((capability) => {
        if (capability.mode === GROUND_MODE.NONE) return;
        capability.types.forEach((type) => {
            if (!registry.has(type)) missing.push(type);
        });
    });
    return [...new Set(missing)];
}
