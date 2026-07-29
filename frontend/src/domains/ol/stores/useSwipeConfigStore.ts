/**
 * 地图卷帘（Map Swipe/Roller）配置 Store
 * 从 useLayerStore 拆分而来，专门管理卷帘对比功能的状态与持久化
 *
 * @example
 * ```ts
 * const swipeStore = useSwipeConfigStore()
 * swipeStore.enableSwipe(['layer-1', 'layer-2'])
 * swipeStore.updateSwipePosition(0.6)
 * ```
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';

const PERSIST_KEY = 'webgis_swipe_config_v1';

type SwipeMode = 'horizontal' | 'vertical';
type SwipeConfig = {
    enabled: boolean;
    position: number;
    mode: SwipeMode;
    targetLayerIds: string[];
    leftLayerIds: string[];
    rightLayerIds: string[];
};

function normalizeLayerIdList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === 'string');
}

/** 从 localStorage 恢复持久化的卷帘配置 */
function loadPersistedConfig(): Record<string, any> | null {
    try {
        if (typeof window === 'undefined') return null;
        const raw = localStorage.getItem(PERSIST_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/** 将当前配置持久化到 localStorage */
function persistConfig(config: SwipeConfig): void {
    try {
        if (typeof window !== 'undefined') {
            localStorage.setItem(PERSIST_KEY, JSON.stringify(config));
        }
    } catch {
        // 忽略存储错误
    }
}

export const useSwipeConfigStore = defineStore('swipeConfigStore', () => {
    const persisted = loadPersistedConfig();

    const swipeConfig = ref<SwipeConfig>({
        enabled: persisted?.enabled === true || false,
        position:
            typeof persisted?.position === 'number'
                ? Math.max(0.05, Math.min(0.95, persisted.position))
                : 0.5,
        mode: (persisted?.mode === 'vertical' ? 'vertical' : 'horizontal') as SwipeMode,
        targetLayerIds: normalizeLayerIdList(persisted?.targetLayerIds),
        leftLayerIds: normalizeLayerIdList(persisted?.leftLayerIds),
        rightLayerIds: normalizeLayerIdList(persisted?.rightLayerIds),
    });

    /**
     * 批量更新卷帘配置（自动持久化）
     * @param config - 部分配置对象，将与现有配置合并
     */
    function setSwipeConfig(config: Partial<typeof swipeConfig.value>): void {
        if (config.enabled !== undefined) swipeConfig.value.enabled = config.enabled;
        if (config.position !== undefined) swipeConfig.value.position = config.position;
        if (config.mode !== undefined) swipeConfig.value.mode = config.mode;
        if (config.targetLayerIds !== undefined) {
            swipeConfig.value.targetLayerIds = normalizeLayerIdList(config.targetLayerIds);
        }
        if (config.leftLayerIds !== undefined) {
            swipeConfig.value.leftLayerIds = normalizeLayerIdList(config.leftLayerIds);
        }
        if (config.rightLayerIds !== undefined) {
            swipeConfig.value.rightLayerIds = normalizeLayerIdList(config.rightLayerIds);
        }
        if (
            config.targetLayerIds === undefined &&
            (config.leftLayerIds !== undefined || config.rightLayerIds !== undefined)
        ) {
            swipeConfig.value.targetLayerIds = [
                ...swipeConfig.value.leftLayerIds,
                ...swipeConfig.value.rightLayerIds,
            ];
        }
        persistConfig(swipeConfig.value);
    }

    /**
     * 更新卷帘滑块位置（自动限制在 0.05-0.95 范围内并持久化）
     * 拖拽时高频调用，持久化操作已防抖（300ms）
     * @param position - 新位置值
     */
    let persistPositionTimer: ReturnType<typeof setTimeout> | null = null;
    function updateSwipePosition(position: number): void {
        const clamped = Math.max(0.05, Math.min(0.95, position));
        swipeConfig.value.position = clamped;
        if (persistPositionTimer) clearTimeout(persistPositionTimer);
        persistPositionTimer = setTimeout(() => persistConfig(swipeConfig.value), 300);
    }

    /**
     * 更新卷帘方向模式并持久化
     * @param mode - 'horizontal' | 'vertical'
     */
    function updateSwipeMode(mode: SwipeMode): void {
        swipeConfig.value.mode = mode;
        persistConfig(swipeConfig.value);
    }

    /**
     * 启用卷帘功能并指定目标图层
     * @param layerIds - 参与卷帘对比的图层 ID 列表
     */
    function enableSwipe(layerIds: string[] = []): void {
        swipeConfig.value.enabled = true;
        swipeConfig.value.targetLayerIds = normalizeLayerIdList(layerIds);
        swipeConfig.value.leftLayerIds = [];
        swipeConfig.value.rightLayerIds = [];
        persistConfig(swipeConfig.value);
    }

    /**
     * 禁用卷帘功能并持久化
     */
    function disableSwipe(): void {
        swipeConfig.value.enabled = false;
        persistConfig(swipeConfig.value);
    }

    return {
        swipeConfig,
        setSwipeConfig,
        updateSwipePosition,
        updateSwipeMode,
        enableSwipe,
        disableSwipe,
    };
});
