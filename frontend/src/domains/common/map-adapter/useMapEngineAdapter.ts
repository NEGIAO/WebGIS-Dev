/**
 * 跨引擎适配器注册中心与响应式状态 (useMapEngineAdapter)
 *
 * 职责：
 * 1. 维护当前运行时的地图适配器实例注册表（支持 OL 2D 与 Cesium 3D 并存注册）；
 * 2. 追踪当前主视口处于激活态的引擎（activeEngineType）；
 * 3. 向 Vue 组件层暴露实时的当前适配器与能力状态（capabilities），用于驱动统一面板的动态表现。
 */

import { computed, ref, shallowReactive } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type { EngineCapabilities, EngineType } from './types';
import type { IMapEngineAdapter } from './IMapEngineAdapter';

/** 默认空能力兜底常量（防止未挂载时产生空指针） */
const EMPTY_CAPABILITIES: EngineCapabilities = Object.freeze({
    supports3D: false,
    supportsTerrain: false,
    supportsViewshed: false,
    supportsShadows: false,
    supportsDrawing2D: false,
    supportsSwipe: false,
});

/** 适配器实例运行时注册表（单例） */
const registeredAdapters = shallowReactive(new Map<EngineType, IMapEngineAdapter>());

/** 当前激活的引擎类型（默认为 2D OpenLayers） */
const activeEngineTypeState: Ref<EngineType> = ref<EngineType>('openlayers');

/** 注册特定引擎的适配器实例 */
export function registerMapEngineAdapter(adapter: IMapEngineAdapter): void {
    registeredAdapters.set(adapter.engineType, adapter);
}

/** 注销特定引擎的适配器实例 */
export function unregisterMapEngineAdapter(engineType: EngineType): void {
    const existing = registeredAdapters.get(engineType);
    if (existing) {
        existing.destroy?.();
        registeredAdapters.delete(engineType);
    }
}

/** 切换当前全局活跃的地图引擎 */
export function setActiveEngineType(engineType: EngineType): void {
    if (activeEngineTypeState.value !== engineType) {
        activeEngineTypeState.value = engineType;
    }
}

/** 静态获取当前激活的适配器（非响应式场景使用） */
export function getActiveMapEngineAdapter(): IMapEngineAdapter | null {
    return registeredAdapters.get(activeEngineTypeState.value) ?? null;
}

/** 静态获取指定引擎的适配器 */
export function getMapEngineAdapter(engineType: EngineType): IMapEngineAdapter | null {
    return registeredAdapters.get(engineType) ?? null;
}

/** 响应式组合式函数接口 */
export interface UseMapEngineAdapterReturn {
    /** 当前激活的引擎类型 ('openlayers' | 'cesium') */
    activeEngineType: Ref<EngineType>;
    /** 当前激活的引擎适配器实例（响应式计算属性） */
    activeAdapter: ComputedRef<IMapEngineAdapter | null>;
    /** 当前引擎具备的动态能力（响应式计算属性，驱动 UI 显隐） */
    capabilities: ComputedRef<EngineCapabilities>;
    /** 底层所有已注册适配器映射表 */
    registeredAdapters: Map<EngineType, IMapEngineAdapter>;
    /** 切换活跃引擎 */
    setActiveEngineType: (type: EngineType) => void;
    /** 快捷命令分发辅助 */
    flyTo: (options: import('./types').CameraViewOptions) => Promise<void>;
}

/**
 * 跨引擎适配器 Vue 组合式函数
 */
export function useMapEngineAdapter(): UseMapEngineAdapterReturn {
    const activeAdapter = computed<IMapEngineAdapter | null>(() => {
        return registeredAdapters.get(activeEngineTypeState.value) ?? null;
    });

    const capabilities = computed<EngineCapabilities>(() => {
        return activeAdapter.value?.capabilities ?? EMPTY_CAPABILITIES;
    });

    const flyTo = async (options: import('./types').CameraViewOptions): Promise<void> => {
        const adapter = activeAdapter.value;
        if (!adapter || !adapter.isReady()) return;
        await adapter.flyTo(options);
    };

    return {
        activeEngineType: activeEngineTypeState,
        activeAdapter,
        capabilities,
        registeredAdapters,
        setActiveEngineType,
        flyTo,
    };
}
