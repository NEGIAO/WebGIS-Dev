/**
 * 托管要素高亮功能库
 * 负责要素高亮样式生成、清除和高亮状态管理
 *
 * 导出：
 * - createManagedFeatureHighlightStyle(feature)
 * - clearManagedFeatureHighlight(feature)
 * - highlightManagedFeature(payload)
 */

import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';

/**
 * 工厂函数 - 返回要素高亮相关的导出函数
 * @param {Object} options 配置选项
 * @param {Function} options.findManagedFeature - 查找托管要素的函数
 * @returns {Object} 包含高亮相关函数的对象
 */
export function createManagedFeatureHighlightFeature({ findManagedFeature = () => null }) {
    // 当前被高亮的要素引用（闭包中维护）
    let currentHighlightedFeature = null;
    const originalStyleByFeature = new WeakMap();

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

    function saveManagedFeatureOriginalStyle(feature) {
        if (!feature || typeof feature.getStyle !== 'function') return;
        if (originalStyleByFeature.has(feature)) return;
        const currentStyle = feature.getStyle();
        originalStyleByFeature.set(feature, currentStyle === undefined ? null : currentStyle);
    }

    /**
     * 清除要素高亮
     * 还原之前保存的原始样式，避免 KML/自定义样式被丢失
     * @param {Feature} feature - 要清除高亮的 Feature
     */
    function clearManagedFeatureHighlight(feature) {
        if (!feature || typeof feature.setStyle !== 'function') return;

        if (originalStyleByFeature.has(feature)) {
            const originalStyle = originalStyleByFeature.get(feature);
            feature.setStyle(originalStyle === undefined ? null : originalStyle);
            originalStyleByFeature.delete(feature);
        } else {
            feature.setStyle(null);
        }

        if (feature === currentHighlightedFeature) {
            currentHighlightedFeature = null;
        }
    }

    /**
     * 高亮指定要素
     * 高亮显示指定的托管要素，确保同一时间只有一个要素被高亮
     * @param {Object} payload - { layerId, featureId }
     */
    function highlightManagedFeature({ layerId, featureId }) {
        const feature = findManagedFeature(layerId, featureId);
        if (!feature) return;

        if (feature === currentHighlightedFeature) {
            return;
        }

        clearManagedFeatureHighlight(currentHighlightedFeature);
        saveManagedFeatureOriginalStyle(feature);

        currentHighlightedFeature = feature;
        feature.setStyle(createManagedFeatureHighlightStyle(feature));
    }

    /**
     * 获取当前高亮的要素
     * @returns {Feature|null} 当前被高亮的要素或 null
     */
    function getCurrentHighlightedFeature() {
        return currentHighlightedFeature;
    }

    /**
     * 设置当前高亮的要素（内部使用）
     * @param {Feature} feature - 要设置为高亮的要素
     */
    function setCurrentHighlightedFeature(feature) {
        currentHighlightedFeature = feature;
    }

    return {
        createManagedFeatureHighlightStyle,
        clearManagedFeatureHighlight,
        highlightManagedFeature,
        getCurrentHighlightedFeature,
        setCurrentHighlightedFeature,
    };
}
