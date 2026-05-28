/**
 * 属性表状态管理 Store
 * 从 useLayerStore 拆分而来，管理属性表的可见性、要素选择与高亮
 * 不直接依赖 useLayerStore，避免循环引用
 *
 * @example
 * ```ts
 * const attrStore = useAttributeTableStore()
 * attrStore.showAttributeTable('layer-1')
 * attrStore.highlightFeature('feature-123')
 * ```
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';

/** 属性表操作回调处理器类型 */
type AttributeTableHandlers = {
    onHighlightFeature?: (payload: { layerId: string; featureId: string; feature?: any }) => void;
    onZoomFeature?: (payload: { layerId: string; featureId: string; feature?: any }) => void;
    onViewFeature?: (payload: { layerId: string; featureId: string; feature?: any }) => void;
    onZoom?: (layerId: string) => void;
    onView?: (layerId: string) => void;
};

export const useAttributeTableStore = defineStore('attributeTableStore', () => {
    const attributeTableLayerId = ref('');
    const attributeTableVisible = ref(false);
    const selectedAttributeFeatureId = ref('');
    const handlers = ref<AttributeTableHandlers>({});

    /**
     * 绑定外部回调处理器（由 MapContainer 等组件注入）
     * @param nextHandlers - 回调处理器对象
     */
    function bindAttributeTableHandlers(nextHandlers: AttributeTableHandlers = {}): void {
        handlers.value = nextHandlers;
    }

    /**
     * 打开指定图层的属性表
     * @param layerId - 目标图层 ID
     */
    function showAttributeTable(layerId: string): void {
        attributeTableLayerId.value = layerId;
        attributeTableVisible.value = true;
        selectedAttributeFeatureId.value = '';
    }

    /**
     * 关闭属性表并清除选中状态
     */
    function closeAttributeTable(): void {
        attributeTableVisible.value = false;
        selectedAttributeFeatureId.value = '';
    }

    /**
     * 高亮指定要素（通知地图端渲染高亮效果）
     * @param layerId - 图层 ID
     * @param featureId - 要素 ID
     * @param feature - 要素数据对象
     */
    function highlightFeature(layerId: string, featureId: string, feature?: any): void {
        selectedAttributeFeatureId.value = String(featureId);
        handlers.value.onHighlightFeature?.({
            layerId,
            featureId: String(featureId),
            feature,
        });
    }

    /**
     * 缩放到指定要素位置（依次尝试 onZoomFeature → onViewFeature → onZoom → onView）
     * @param layerId - 图层 ID
     * @param featureId - 要素 ID
     * @param feature - 要素数据对象
     */
    function zoomToFeature(layerId: string, featureId: string, feature?: any): void {
        selectedAttributeFeatureId.value = String(featureId);
        const payload = { layerId, featureId: String(featureId), feature };
        if (handlers.value.onZoomFeature) {
            handlers.value.onZoomFeature(payload);
            return;
        }
        if (handlers.value.onViewFeature) {
            handlers.value.onViewFeature(payload);
            return;
        }
        if (handlers.value.onZoom) {
            handlers.value.onZoom(layerId);
            return;
        }
        handlers.value.onView?.(layerId);
    }

    return {
        attributeTableLayerId,
        attributeTableVisible,
        selectedAttributeFeatureId,
        bindAttributeTableHandlers,
        showAttributeTable,
        closeAttributeTable,
        highlightFeature,
        zoomToFeature,
    };
});