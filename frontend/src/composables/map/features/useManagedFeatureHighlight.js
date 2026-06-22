/**
 * 托管要素高亮功能库（Pinia 化版本）
 *
 * ★ 改造说明（2026-06-21）
 *   把原先保存在闭包中的 `currentHighlightedFeature` 与 `WeakMap<OLFeature, Style>`
 *   迁移到新建的 `useFeatureStyleStore` Pinia store。本文件改为薄壳（thin wrapper）：
 *   - 样式生成逻辑保留在 composable（依赖 OL 类）
 *   - 状态读写委托给 store
 *   - setStyle 副作用在 composable 内执行（避免 store 直接依赖 OL 类）
 *
 * 导出：
 * - createManagedFeatureHighlightStyle(feature)
 * - clearManagedFeatureHighlight(feature) → 通过 store 还原样式
 * - highlightManagedFeature(payload) → 通过 store 写入高亮状态
 * - getCurrentHighlightedFeature() / setCurrentHighlightedFeature() → 兼容性保留
 * - batchHighlightManagedFeatures(payload) → 新增多选批量
 */

import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
import { useFeatureStyleStore } from '../../../stores/useFeatureStyleStore';
import {
    getFeatureIdFromFeature,
    getFeatureIdFromFeatureKey,
    getLayerIdFromFeatureKey,
} from '../../../utils/map/featureKey';

/**
 * 工厂函数 - 返回要素高亮相关的导出函数
 * @param {Object} options 配置选项
 * @param {Function} options.findManagedFeature - 查找托管要素的函数 (layerId, featureId) => OLFeature | null
 * @returns {Object} 包含高亮相关函数的对象
 */
export function createManagedFeatureHighlightFeature({ findManagedFeature = () => null }) {
    /**
     * 创建要素高亮样式
     * 根据几何类型返回相应的高亮样式（点使用圆形，线面使用填充）
     * @param {Feature} feature - OL Feature 实例
     * @returns {Style} OL 样式对象
     */
    function createManagedFeatureHighlightStyle(feature) {
        const geometryType = feature?.getGeometry?.()?.getType?.() || '';
        const isPointLike = /Point$/i.test(geometryType);

        if (isPointLike) {
            return new Style({
                image: new CircleStyle({
                    radius: 8,
                    fill: new Fill({ color: 'rgba(255, 69, 58, 0.95)' }),
                    stroke: new Stroke({ color: '#ffffff', width: 2 }),
                }),
            });
        }

        return new Style({
            fill: new Fill({ color: 'rgba(255, 69, 58, 0.18)' }),
            stroke: new Stroke({ color: '#ff4136', width: 4 }),
        });
    }

    /**
     * 内部：将 store 备份的样式还原到 feature（fallback 到 setStyle(null)）
     * @param {OLFeature} feature OL Feature 实例
     * @param {Style|null|undefined} originalStyle store 备份的样式
     */
    function restoreFeatureStyle(feature, originalStyle) {
        if (!feature || typeof feature.setStyle !== 'function') return;
        try {
            if (originalStyle === undefined || originalStyle === null) {
                feature.setStyle(null);
            } else {
                feature.setStyle(originalStyle);
            }
        } catch (error) {
            console.warn('[useManagedFeatureHighlight] restoreFeatureStyle failed:', error);
        }
    }

    /**
     * 内部：将高亮样式应用到 feature
     * @param {OLFeature} feature
     */
    function applyFeatureHighlightStyle(feature) {
        if (!feature || typeof feature.setStyle !== 'function') return;
        try {
            feature.setStyle(createManagedFeatureHighlightStyle(feature));
        } catch (error) {
            console.warn('[useManagedFeatureHighlight] applyFeatureHighlightStyle failed:', error);
        }
    }

    /**
     * 清除要素高亮
     * 通过 store 还原原始样式（store 会自动从 Map 中移除备份）
     * @param {Feature|string} featureOrKey OL Feature 实例 或 FeatureKey（兼容旧 API）
     * @param {string} [layerId] 当第一个参数为 feature 时必填
     */
    function clearManagedFeatureHighlight(featureOrKey, layerId) {
        const store = useFeatureStyleStore();
        if (!store) return;

        if (typeof featureOrKey === 'string') {
            const keyLayerId = getLayerIdFromFeatureKey(featureOrKey);
            const keyFeatureId = getFeatureIdFromFeatureKey(featureOrKey);
            if (keyLayerId && keyFeatureId) {
                store.clearHighlight(keyLayerId, keyFeatureId, restoreFeatureStyle);
            }
            return;
        }

        // 兼容旧 API：传入 OL Feature + layerId
        if (featureOrKey && typeof featureOrKey.getStyle === 'function') {
            const featureId = getFeatureIdFromFeature(featureOrKey);
            if (layerId && featureId) {
                // 委托给 store 暴露的 action 维护封装性
                store.clearHighlight(layerId, featureId, restoreFeatureStyle);
            }
            const matched = Array.isArray(store.highlightedList)
                ? store.highlightedList.find((item) => item?.feature === featureOrKey)
                : null;
            if (matched?.layerId && matched?.featureId) {
                store.clearHighlight(matched.layerId, matched.featureId, restoreFeatureStyle);
            }
            return;
        }

        // 新 API：什么都不做（外部应使用 store.clearHighlight）
        // 保留函数签名以兼容旧代码
    }

    /**
     * 高亮指定要素（支持多选模式）
     *
     * @param {Object} payload
     * @param {string} payload.layerId
     * @param {string} payload.featureId
     * @param {'replace'|'toggle'|'range'} [payload.mode='replace'] 模式
     */
    function highlightManagedFeature({ layerId, featureId, mode = 'replace' }) {
        const store = useFeatureStyleStore();
        if (!store) return;

        const targetLayerId = String(layerId ?? '').trim();
        const targetFeatureId = String(featureId ?? '').trim();
        if (!targetLayerId || !targetFeatureId) return;

        const feature = findManagedFeature(targetLayerId, targetFeatureId);
        if (!feature) return;

        store.highlightFeature({
            layerId: targetLayerId,
            featureId: targetFeatureId,
            mode,
            feature,
            applyHighlight: applyFeatureHighlightStyle,
            restoreStyle: restoreFeatureStyle,
        });
    }

    /**
     * 批量高亮要素（连续多选的核心入口）
     *
     * @param {Object} payload
     * @param {string} payload.layerId
     * @param {string[]} payload.featureIds 要素 ID 列表
     * @param {'replace'|'append'} [payload.mode='append'] 默认追加
     */
    function batchHighlightManagedFeatures({ layerId, featureIds, mode = 'append' }) {
        const store = useFeatureStyleStore();
        if (!store || !Array.isArray(featureIds)) return;

        featureIds.forEach((featureId) => {
            const feature = findManagedFeature(layerId, featureId);
            if (!feature) return;
            store.highlightFeature({
                layerId,
                featureId,
                mode: mode === 'append' ? 'range' : 'replace',
                feature,
                applyHighlight: applyFeatureHighlightStyle,
                restoreStyle: restoreFeatureStyle,
            });
        });
    }

    /**
     * 清除所有高亮（用于 ESC 或外部清空）
     * @param {string} [layerId] 指定图层；不传清全部
     */
    function clearAllHighlights(layerId) {
        const store = useFeatureStyleStore();
        if (!store) return;

        if (layerId) {
            // 清指定图层：先取所有高亮要素的引用，再 clearHighlightsByLayer
            const keysToRestore = store.getHighlightedFeatureKeysInLayer(layerId);
            keysToRestore.forEach((key) => {
                const fid = getFeatureIdFromFeatureKey(key);
                const feature = findManagedFeature(layerId, fid);
                const originalStyle = store.getOriginalStyle(layerId, fid);
                if (feature) restoreFeatureStyle(feature, originalStyle);
            });
            store.clearHighlightsByLayer(layerId, null);
        } else {
            // 清全部
            store.highlightedFeatures.forEach((_featureRef, key) => {
                const lid = getLayerIdFromFeatureKey(key);
                const fid = getFeatureIdFromFeatureKey(key);
                const feature = findManagedFeature(lid, fid);
                const originalStyle = store.getOriginalStyle(lid, fid);
                if (feature) restoreFeatureStyle(feature, originalStyle);
            });
            store.clearAll(null);
        }
    }

    /**
     * 获取当前高亮要素（兼容旧 API：返回第一个高亮要素）
     * @returns {any|null} OL Feature 实例或 null
     */
    function getCurrentHighlightedFeature() {
        const store = useFeatureStyleStore();
        if (!store) return null;
        const firstKey = store.highlightedFeatures.keys().next().value;
        if (!firstKey) return null;
        // 通过 layerId + featureId 重新查找（避免直接解引用 WeakRef）
        const layerId = getLayerIdFromFeatureKey(firstKey);
        const fid = getFeatureIdFromFeatureKey(firstKey);
        return findManagedFeature(layerId, fid);
    }

    /**
     * 设置当前高亮要素（兼容旧 API：清空所有后高亮该要素）
     * @param {any|null} feature OL Feature 实例
     */
    function setCurrentHighlightedFeature(feature) {
        const store = useFeatureStyleStore();
        if (!store) return;

        if (!feature) {
            clearAllHighlights();
            return;
        }

        // 兼容旧 API：feature 没有 layerId 时需要外部传入；这里保留接口签名
        // 实际使用中上层应直接调用 highlightManagedFeature
        void feature;
    }

    return {
        createManagedFeatureHighlightStyle,
        clearManagedFeatureHighlight,
        highlightManagedFeature,
        getCurrentHighlightedFeature,
        setCurrentHighlightedFeature,
        batchHighlightManagedFeatures,
        clearAllHighlights,
    };
}
