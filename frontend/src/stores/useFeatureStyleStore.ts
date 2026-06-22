/**
 * @fileoverview 要素高亮样式 Pinia Store
 *
 * ★ 设计目的
 *   把"要素高亮"涉及的样式数据集中管理：
 *   - 当前高亮要素集合（多选）
 *   - 各要素的原始样式备份（避免 setStyle(null) 兜底丢失 KML/自定义样式）
 *   - 与 TOC 图层生命周期绑定（removeLayerMeta → clearHighlightsByLayer）
 *
 * ★ 关键约束
 *   - 不直接持久化 OL Style 实例（不可序列化），仅存 OL Feature 的 WeakRef 引用 + Style 对象引用
 *   - 备份按 FeatureKey（`${layerId}::${featureId}`）寻址，避免 WeakMap key 必须是 object 的限制
 *   - 跨 store 联动：useTOCStore / useLayerStore 在删除/同步图层时调用本 store 的清理方法
 *
 * ┌──────────── 状态机 ────────────┐
 * │  idle: 无高亮                              │
 * │  highlighting: 1+ 要素处于高亮态           │
 * │  restoring: clearHighlightsByLayer 进行中   │
 * └────────────────────────────────┘
 *
 * @author Claude (2026-06-21)
 */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
    buildFeatureKey,
    getFeatureIdFromFeatureKey,
    getLayerIdFromFeatureKey,
    isValidFeatureKey,
} from '../utils/map/featureKey';

/**
 * 高亮模式（与点击事件修饰键对应）
 * - replace: 单击替换（清空旧高亮 → 高亮新要素）
 * - toggle:  Ctrl+点击切换（已高亮则取消，否则追加）
 * - range:   Shift+点击区间选择（从 anchor 到 target 全选）
 */
export type HighlightMode = 'replace' | 'toggle' | 'range';

/**
 * 元素高亮上下文（用于 UI 展示当前高亮统计）
 */
export type HighlightContext = {
    layerId: string;
    featureId: string;
};

/**
 * Feature 引用 WeakRef 安全包装（提供降级到普通引用的能力）
 * 老浏览器（<Chrome 84 / Safari 14.1）不支持 WeakRef，降级为 Map 直接引用
 */
type FeatureRef = { ref: WeakRef<any> | null; fallback: any };

const WeakRefSupported = typeof WeakRef !== 'undefined';

/**
 * 创建 Feature 引用（优先 WeakRef，降级 fallback）
 * @param {any} feature OL Feature 实例
 * @returns {FeatureRef}
 */
function createFeatureRef(feature) {
    if (WeakRefSupported) {
        return { ref: new WeakRef(feature), fallback: null };
    }
    return { ref: null, fallback: feature };
}

/**
 * 解引用 Feature（WeakRef.deref 或直接返回 fallback）
 * @param {FeatureRef} featureRef
 * @returns {any|null}
 */
function derefFeature(featureRef) {
    if (!featureRef) return null;
    if (featureRef.ref) {
        const f = featureRef.ref.deref();
        return f || null;
    }
    return featureRef.fallback || null;
}

export const useFeatureStyleStore = defineStore('featureStyleStore', () => {
    // ============ 核心状态 ============
    /**
     * 当前高亮要素（key: FeatureKey, value: FeatureRef）
     * 使用 Map 而非 WeakMap 是因为 key 是字符串
     */
    const highlightedFeatures = ref(new Map());

    /**
     * 各要素的原始样式备份（key: FeatureKey, value: Style | null）
     * 高亮前先把 feature.getStyle() 写入此处，clear 时还原
     */
    const originalStylesByFeature = ref(new Map());

    /**
     * 上次选中的 FeatureKey（用于 Shift 区间选择的锚点）
     */
    const lastSelectedFeatureKey = ref('');

    /**
     * 各图层高亮计数（key: layerId, value: count）—— 快速判定是否有高亮
     */
    const layerHighlightCount = ref(new Map());

    // ============ Getters ============
    /**
     * 当前高亮要素总数
     */
    const totalHighlightedCount = computed(() => highlightedFeatures.value.size);

    /**
     * 当前高亮涉及的图层 ID 列表
     */
    const highlightedLayerIds = computed(() => {
        const ids = new Set();
        highlightedFeatures.value.forEach((_, key) => {
            const layerId = getLayerIdFromFeatureKey(key);
            if (layerId) ids.add(layerId);
        });
        return Array.from(ids);
    });

    /**
     * 当前高亮要素列表（用于 UI 展示）
     */
    const highlightedList = computed(() => {
        const list = [];
        highlightedFeatures.value.forEach((featureRef, key) => {
            const feature = derefFeature(featureRef);
            if (!feature) return; // 已 GC
            const layerId = getLayerIdFromFeatureKey(key);
            const featureId = key.slice(layerId.length + 2);
            list.push({ layerId, featureId, feature, featureKey: key });
        });
        return list;
    });

    /**
     * 判定要素是否被高亮
     */
    function isHighlighted(layerId, featureId) {
        const key = buildFeatureKey(layerId, featureId);
        return key ? highlightedFeatures.value.has(key) : false;
    }

    /**
     * 获取某图层的高亮要素数
     */
    function getLayerHighlightCount(layerId) {
        return layerHighlightCount.value.get(String(layerId)) || 0;
    }

    /**
     * 获取备份的原始样式
     */
    function getOriginalStyle(layerId, featureId) {
        const key = buildFeatureKey(layerId, featureId);
        if (!key) return undefined;
        return originalStylesByFeature.value.has(key)
            ? originalStylesByFeature.value.get(key)
            : undefined;
    }

    /**
     * 获取某图层所有高亮要素的 featureKey
     */
    function getHighlightedFeatureKeysInLayer(layerId) {
        const targetLayerId = String(layerId);
        const result = [];
        highlightedFeatures.value.forEach((_, key) => {
            if (getLayerIdFromFeatureKey(key) === targetLayerId) {
                result.push(key);
            }
        });
        return result;
    }

    // ============ 备份 / 还原样式 ============
    /**
     * 保存要素的原始样式到 store
     * @param {string} layerId
     * @param {string} featureId
     * @param {any} style OL Style 实例或 null/undefined
     */
    function saveOriginalStyle(layerId, featureId, style) {
        const key = buildFeatureKey(layerId, featureId);
        if (!key) return;
        // 仅首次备份（已存在则保留最早的备份，避免被覆盖）
        if (!originalStylesByFeature.value.has(key)) {
            originalStylesByFeature.value.set(key, style ?? null);
        }
    }

    /**
     * 从 store 删除原始样式备份（返回被删除的值）
     * @param {string} layerId
     * @param {string} featureId
     * @returns {any|null|undefined} 被删除的备份值；无备份返回 undefined
     */
    function consumeOriginalStyle(layerId, featureId) {
        const key = buildFeatureKey(layerId, featureId);
        if (!key) return undefined;
        const value = originalStylesByFeature.value.get(key);
        originalStylesByFeature.value.delete(key);
        return value;
    }

    // ============ 核心 Actions ============
    /**
     * 高亮要素（统一入口，支持单选/多选/区间）
     *
     * @param {Object} options
     * @param {string} options.layerId
     * @param {string} options.featureId
     * @param {HighlightMode} [options.mode='replace']
     * @param {any} [options.feature] OL Feature 实例（用于建立 WeakRef）
     * @param {Function} [options.applyHighlight] 实际的 setStyle 应用函数 (feature) => void
     * @param {Function} [options.restoreStyle] 实际的 setStyle 还原函数 (feature, originalStyle) => void
     * @param {Function} [options.resolveRangeTargets] range 模式下计算区间要素列表，返回 [{layerId, featureId, feature?}]
     */
    function highlightFeature({
        layerId,
        featureId,
        mode = 'replace',
        feature = null,
        applyHighlight = null,
        restoreStyle = null,
        resolveRangeTargets = null,
    }) {
        const targetLayerId = String(layerId ?? '').trim();
        const targetFeatureId = String(featureId ?? '').trim();
        if (!targetLayerId || !targetFeatureId) return { added: 0, removed: 0 };

        // range 模式：先解析区间要素列表
        const targets: Array<{ layerId: string; featureId: string; feature: any }> = [
            { layerId: targetLayerId, featureId: targetFeatureId, feature },
        ];
        if (mode === 'range' && typeof resolveRangeTargets === 'function') {
            const resolved = resolveRangeTargets({
                anchorFeatureKey: lastSelectedFeatureKey.value,
                layerId: targetLayerId,
                featureId: targetFeatureId,
            });
            if (Array.isArray(resolved) && resolved.length) {
                targets.length = 0;
                resolved.forEach((t: any) => {
                    if (!t || !t.layerId || !t.featureId) return;
                    targets.push({
                        layerId: String(t.layerId),
                        featureId: String(t.featureId),
                        feature: t.feature ?? null,
                    });
                });
            }
        }

        let addedCount = 0;
        let removedCount = 0;

        targets.forEach((target) => {
            const tKey = buildFeatureKey(target.layerId, target.featureId);
            if (!tKey) return;

            if (mode === 'toggle') {
                if (highlightedFeatures.value.has(tKey)) {
                    // 取消高亮：先还原样式
                    _clearSingle(tKey, restoreStyle);
                    removedCount += 1;
                } else {
                    _addSingle(tKey, target.feature || feature, applyHighlight);
                    addedCount += 1;
                }
                return;
            }

            if (mode === 'replace') {
                // replace 模式：第一个 target 之前清空所有旧高亮
                if (target === targets[0]) {
                    clearAll(restoreStyle);
                }
                _addSingle(tKey, target.feature || feature, applyHighlight);
                addedCount += 1;
                return;
            }

            if (mode === 'range') {
                // range 模式：保留旧高亮，只追加新区间
                if (!highlightedFeatures.value.has(tKey)) {
                    _addSingle(tKey, target.feature || feature, applyHighlight);
                    addedCount += 1;
                }
            }
        });

        lastSelectedFeatureKey.value = buildFeatureKey(targetLayerId, targetFeatureId);
        return { added: addedCount, removed: removedCount };
    }

    /**
     * 内部：添加单个高亮
     * @private
     */
    function _addSingle(featureKey, feature, applyHighlight) {
        if (!isValidFeatureKey(featureKey)) return;
        if (highlightedFeatures.value.has(featureKey)) return;

        if (feature) {
            const featureRef = createFeatureRef(feature);
            highlightedFeatures.value.set(featureKey, featureRef);
            const layerId = getLayerIdFromFeatureKey(featureKey);

            // 备份原始样式（如果还没有）
            if (!originalStylesByFeature.value.has(featureKey)) {
                try {
                    const currentStyle = typeof feature.getStyle === 'function'
                        ? feature.getStyle()
                        : null;
                    originalStylesByFeature.value.set(featureKey, currentStyle ?? null);
                } catch {
                    originalStylesByFeature.value.set(featureKey, null);
                }
            }

            // 更新计数
            layerHighlightCount.value.set(
                layerId,
                (layerHighlightCount.value.get(layerId) || 0) + 1,
            );

            // 触发实际样式应用
            if (typeof applyHighlight === 'function') {
                try {
                    applyHighlight(feature);
                } catch (error) {
                    console.warn('[featureStyleStore] applyHighlight failed:', error);
                }
            }
        }
    }

    /**
     * 清除单个高亮（内部使用）
     * @private
     */
    function _clearSingle(featureKey, restoreStyle) {
        if (!isValidFeatureKey(featureKey)) return;
        if (!highlightedFeatures.value.has(featureKey)) return;

        const featureRef = highlightedFeatures.value.get(featureKey);
        const feature = derefFeature(featureRef);
        const layerId = getLayerIdFromFeatureKey(featureKey);

        highlightedFeatures.value.delete(featureKey);

        // 还原样式
        const originalStyle = originalStylesByFeature.value.get(featureKey);
        if (feature && typeof restoreStyle === 'function') {
            try {
                restoreStyle(feature, originalStyle);
            } catch (error) {
                console.warn('[featureStyleStore] restoreStyle failed:', error);
            }
        }
        originalStylesByFeature.value.delete(featureKey);

        // 更新计数
        if (layerId) {
            const count = layerHighlightCount.value.get(layerId) || 0;
            if (count <= 1) {
                layerHighlightCount.value.delete(layerId);
            } else {
                layerHighlightCount.value.set(layerId, count - 1);
            }
        }
    }

    /**
     * 清除指定要素的高亮
     * @param {string} [layerId] 不传则清全部
     * @param {string} [featureId] 不传则清该图层全部
     * @param {Function} [restoreStyle] 还原样式的回调
     */
    function clearHighlight(layerId, featureId, restoreStyle) {
        if (!layerId) {
            return clearAll(restoreStyle);
        }
        if (!featureId) {
            return clearHighlightsByLayer(layerId, restoreStyle);
        }
        const key = buildFeatureKey(layerId, featureId);
        _clearSingle(key, restoreStyle);
    }

    /**
     * 清除所有高亮
     * @param {Function} [restoreStyle] 还原样式的回调 (feature, originalStyle) => void
     */
    function clearAll(restoreStyle) {
        const keys = Array.from(highlightedFeatures.value.keys());
        keys.forEach((key) => _clearSingle(key, restoreStyle));
        layerHighlightCount.value.clear();
    }

    /**
     * 清除某图层所有高亮（TOC 移除图层时联动调用）
     * @param {string} layerId
     * @param {Function} [restoreStyle]
     */
    function clearHighlightsByLayer(layerId, restoreStyle) {
        const targetLayerId = String(layerId ?? '').trim();
        if (!targetLayerId) return 0;

        const keysToRemove = [];
        highlightedFeatures.value.forEach((_, key) => {
            if (getLayerIdFromFeatureKey(key) === targetLayerId) {
                keysToRemove.push(key);
            }
        });

        keysToRemove.forEach((key) => _clearSingle(key, restoreStyle));
        layerHighlightCount.value.delete(targetLayerId);
        return keysToRemove.length;
    }

    /**
     * 差量同步图层高亮（外部已计算好当前应有的 featureId 列表）
     * @param {string} layerId
     * @param {string[]} currentFeatureIds 当前应保留高亮的 featureId 列表
     * @param {{applyHighlight?: Function, restoreStyle?: Function, lookupFeature?: Function}} [callbacks]
     */
    function syncLayerHighlights(layerId, currentFeatureIds, callbacks) {
        const cb = callbacks || {};
        const targetLayerId = String(layerId ?? '').trim();
        if (!targetLayerId) return { added: 0, removed: 0 };

        const targetSet = new Set((currentFeatureIds || []).map((id) => String(id)));
        const existingKeys = getHighlightedFeatureKeysInLayer(targetLayerId);

        let added = 0;
        let removed = 0;

        // 移除不在目标集中的
        existingKeys.forEach((key) => {
            const featureId = getFeatureIdFromFeatureKey(key);
            if (!targetSet.has(featureId)) {
                _clearSingle(key, cb.restoreStyle);
                removed += 1;
            }
        });

        // 添加新目标集中的
        targetSet.forEach((featureId) => {
            const key = buildFeatureKey(targetLayerId, featureId);
            if (!key || highlightedFeatures.value.has(key)) return;
            const feature = typeof cb.lookupFeature === 'function'
                ? cb.lookupFeature(featureId)
                : null;
            _addSingle(key, feature, cb.applyHighlight);
            if (feature) added += 1;
        });

        return { added, removed };
    }

    /**
     * 清理已被 GC 回收的 WeakRef 引用（定期调用，避免 Map 膨胀）
     * @returns {number} 清理的数量
     */
    function cleanup() {
        if (!WeakRefSupported) return 0;
        let removed = 0;
        const staleKeys = [];
        highlightedFeatures.value.forEach((featureRef, key) => {
            if (!derefFeature(featureRef)) {
                staleKeys.push(key);
            }
        });
        staleKeys.forEach((key) => {
            highlightedFeatures.value.delete(key);
            originalStylesByFeature.value.delete(key);
            removed += 1;
        });

        // 重新计算计数
        layerHighlightCount.value.clear();
        highlightedFeatures.value.forEach((_, key) => {
            const layerId = getLayerIdFromFeatureKey(key);
            if (layerId) {
                layerHighlightCount.value.set(
                    layerId,
                    (layerHighlightCount.value.get(layerId) || 0) + 1,
                );
            }
        });
        return removed;
    }

    return {
        // state
        highlightedFeatures,
        originalStylesByFeature,
        lastSelectedFeatureKey,
        layerHighlightCount,
        // getters
        totalHighlightedCount,
        highlightedLayerIds,
        highlightedList,
        // queries
        isHighlighted,
        getLayerHighlightCount,
        getOriginalStyle,
        getHighlightedFeatureKeysInLayer,
        // style backup
        saveOriginalStyle,
        consumeOriginalStyle,
        // core actions
        highlightFeature,
        clearHighlight,
        clearAll,
        clearHighlightsByLayer,
        syncLayerHighlights,
        cleanup,
    };
});

// 重新导出类型供外部消费
export type { FeatureRef };
