import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { isLabelValid } from '@common/utils/labelValidator';
import {
    applyDrawingFeatureStyle,
    isDrawingStyledFeature,
} from '@ol/drawing/composables/useDrawingFeatureStyle';

const DEFAULT_STYLE_TEMPLATE = {
    fillColor: '#5fbf7a',
    fillOpacity: 0.24,
    strokeColor: '#2f7d3c',
    strokeWidth: 2,
    pointRadius: 6,
};

/**
 * 标签候选回退时应排除的元数据字段。
 * KML/KMZ 解析的要素属性包含 styleUrl('#样式ID')、description(超长 HTML) 等
 * 非业务字段，若被当作标签内容会显示 '#LineStyle00' 之类的垃圾文字
 * （HENU 系列 KMZ 实测：name 为 NULL 的要素回退到 styleUrl 显示为 '#LineStyle00'）。
 */
const IGNORED_LABEL_KEYS = new Set([
    'geometry',
    'style',
    '_style',
    'ol_uid',
    'styleUrl',
    'description',
    'address',
    'snippet',
    'phoneNumber',
    'open',
    'visibility',
    'extrude',
    'tessellate',
    'altitudeMode',
]);

/**
 * 托管图层样式功能库
 * 职责：样式归一化、标签生成、样式函数构建与应用。
 */
export function createManagedLayerStyleFeature({ styleTemplates, maxLabelLength = 100 } = {}) {
    const defaultStyleTemplate = {
        ...DEFAULT_STYLE_TEMPLATE,
        ...(styleTemplates?.classic || {}),
    };

    const normalizeStyleConfig = (styleCfg = {}) => {
        const base = { ...defaultStyleTemplate, ...(styleCfg || {}) };
        return {
            fillColor: base.fillColor,
            fillOpacity: Math.min(1, Math.max(0, Number(base.fillOpacity ?? 0.2))),
            strokeColor: base.strokeColor,
            strokeWidth: Math.max(0.5, Number(base.strokeWidth ?? 2)),
            pointRadius: Math.max(3, Number(base.pointRadius ?? 6)),
        };
    };

    const createStyleFromConfig = (styleCfg, options = {}) => {
        const cfg = normalizeStyleConfig(styleCfg);
        const hex = cfg.fillColor?.replace('#', '') || '5fbf7a';
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const labelText = String(options.labelText || '').trim();

        return new Style({
            stroke: new Stroke({ color: cfg.strokeColor, width: cfg.strokeWidth }),
            fill: new Fill({ color: `rgba(${r}, ${g}, ${b}, ${cfg.fillOpacity})` }),
            image: new CircleStyle({
                radius: cfg.pointRadius,
                fill: new Fill({ color: cfg.fillColor }),
                stroke: new Stroke({
                    color: cfg.strokeColor,
                    width: Math.max(1, cfg.strokeWidth / 2),
                }),
            }),
            text: labelText
                ? new Text({
                      // =======================
                      // 已改成要的样式 ✅
                      // =======================
                      text: labelText.length > 48 ? `${labelText.slice(0, 48)}...` : labelText,
                      font: '600 14px "Microsoft YaHei", "PingFang SC", sans-serif',
                      fill: new Fill({ color: '#ffffff' }),
                      stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.72)', width: 3 }),
                      overflow: true,

                      // 清理旧样式
                      backgroundFill: undefined,
                      padding: [0, 0, 0, 0],
                      offsetY: 0,
                      textAlign: 'center',
                  })
                : undefined,
        });
    };

    const mergeStyleConfig = (prevCfg, newCfg) => {
        return normalizeStyleConfig({ ...(prevCfg || {}), ...(newCfg || {}) });
    };

    const getLayerLabelText = (layerItem) => {
        if (!layerItem?.autoLabel) return '';
        if (!layerItem?.labelVisible) return '';

        let labelText = String(layerItem.name || '').trim();
        // URL 编码的图层名（共享链接/压缩包内部名等）先解码再校验
        try {
            labelText = decodeURIComponent(labelText);
        } catch {
            // 非编码名保持原样
        }
        if (!isLabelValid(labelText, maxLabelLength)) return '';
        return labelText;
    };

    const getFeatureLabelText = (feature, layerItem) => {
        if (!layerItem?.autoLabel || !layerItem?.labelVisible) return '';

        const props = typeof feature?.getProperties === 'function' ? feature.getProperties() : null;
        if (!props) return getLayerLabelText(layerItem);

        const preferredField = String(layerItem?.metadata?.labelField || '').trim();
        if (preferredField) {
            const preferredValue =
                props[preferredField] ??
                (typeof feature?.get === 'function' ? feature.get(preferredField) : undefined);
            if (
                preferredValue !== null &&
                preferredValue !== undefined &&
                isLabelValid(preferredValue, maxLabelLength)
            ) {
                return String(preferredValue).trim();
            }
        }

        const candidateKeys = [
            'name',
            'Name',
            'NAME',
            '名称',
            'title',
            'Title',
            'TITLE',
            'label',
            'Label',
            'labelText',
            'text',
            'address',
        ];
        for (const key of candidateKeys) {
            const value = props[key];
            if (value !== null && value !== undefined && isLabelValid(value, maxLabelLength)) {
                return String(value).trim();
            }
        }

        const firstUsableEntry = Object.entries(props).find(
            ([key, value]) =>
                !IGNORED_LABEL_KEYS.has(key) &&
                !String(key).startsWith('_') &&
                value !== null &&
                value !== undefined &&
                isLabelValid(value, maxLabelLength) &&
                String(value).trim(),
        );
        if (firstUsableEntry) {
            return String(firstUsableEntry[1]).trim();
        }

        return '';
    };

    /**
     * 解析 feature 样式：优先 feature 自带 style，其次高级绘制 styleParams，最后返回 null 交给图层默认样式。
     * @param {Feature} feature
     * @returns {Style|Style[]|null}
     */
    const resolveFeatureStyle = (feature) => {
        const existingStyle = feature?.getStyle?.();
        if (
            existingStyle &&
            !(existingStyle instanceof Function) &&
            !(Array.isArray(existingStyle) && existingStyle.length === 0)
        ) {
            return existingStyle;
        }

        // 高级绘制要素：根据 drawType/styleParams 重建样式（避免序列化/刷新后丢失）
        if (isDrawingStyledFeature(feature)) {
            const rebuilt = applyDrawingFeatureStyle(feature);
            if (rebuilt) return rebuilt;
        }

        return null;
    };

    /**
     * 克隆 Style 并去掉 Text（几何层专用）
     * @param {Style|Style[]} style
     * @returns {Style|Style[]}
     */
    const stripTextFromStyle = (style) => {
        if (!style) return style;
        if (Array.isArray(style)) return style.map((s) => stripTextFromStyle(s));
        if (typeof style.clone === 'function') {
            const cloned = style.clone();
            try {
                cloned.setText?.(undefined);
            } catch {
                /* ignore */
            }
            return cloned;
        }
        return style;
    };

    /**
     * 几何样式：优先还原导入时备份的 KML/GeoJSON 原样式（去 Text），
     * 保证「KMZ 原有色块/描边 + 可开关标注」同时成立。
     * 备份在 managedLayerState.originalFeatureStyles（feature → Style）。
     */
    const buildGeometryStyle = (layerItem) => {
        const baseStyleConfig = layerItem?.styleConfig || defaultStyleTemplate;
        return (feature) => {
            const original = layerItem?.originalFeatureStyles?.get?.(feature);
            if (original) return stripTextFromStyle(original);
            const existing = resolveFeatureStyle(feature);
            if (existing) return stripTextFromStyle(existing);
            return createStyleFromConfig(baseStyleConfig, { labelText: '' });
        };
    };

    /**
     * 标注样式：仅 Text（用于 DATA_LABEL 带标注层）
     * 依赖 feature 属性 name 等字段；feature 须已清掉自身 Style 才会走本函数。
     */
    const buildLabelOnlyStyle = (layerItem) => {
        const baseStyleConfig = layerItem?.styleConfig || defaultStyleTemplate;
        if (!layerItem?.autoLabel || !layerItem?.labelVisible) {
            return () => undefined;
        }
        layerItem.labelStyleCache = layerItem.labelStyleCache || new globalThis.Map();
        return (feature) => {
            const labelText = String(getFeatureLabelText(feature, layerItem) || '').trim();
            if (!labelText) return undefined;
            if (layerItem.labelStyleCache.has(labelText)) {
                return layerItem.labelStyleCache.get(labelText);
            }
            const full = createStyleFromConfig(baseStyleConfig, { labelText });
            const text = full.getText?.();
            if (!text) return undefined;
            const style = new Style({ text });
            layerItem.labelStyleCache.set(labelText, style);
            return style;
        };
    };

    const buildManagedLayerStyle = (layerItem) => {
        const baseStyleConfig = layerItem?.styleConfig || defaultStyleTemplate;
        if (!layerItem?.autoLabel || !layerItem?.labelVisible) {
            return (feature) => resolveFeatureStyle(feature) || createStyleFromConfig(baseStyleConfig, { labelText: '' });
        }

        layerItem.labelStyleCache = layerItem.labelStyleCache || new globalThis.Map();
        return (feature) => {
            const rawLabel = getFeatureLabelText(feature, layerItem);
            const labelText = String(rawLabel || '').trim();
            const existingStyle = resolveFeatureStyle(feature);

            if (existingStyle) {
                if (!labelText) return existingStyle;
                const labelOnly = createStyleFromConfig(baseStyleConfig, { labelText });
                return Array.isArray(existingStyle)
                    ? [...existingStyle, labelOnly]
                    : [existingStyle, labelOnly];
            }

            // 空标签不缓存：首个无效要素若污染 '__empty__'，后续要素将全部命中
            // 空样式导致整个图层无标注（历史 bug：HENU 系列 KMZ 全图层无标签）
            if (!labelText) {
                return createStyleFromConfig(baseStyleConfig, { labelText: '' });
            }
            if (layerItem.labelStyleCache.has(labelText)) {
                return layerItem.labelStyleCache.get(labelText);
            }

            const style = createStyleFromConfig(baseStyleConfig, { labelText });
            layerItem.labelStyleCache.set(labelText, style);
            return style;
        };
    };

    /**
     * 应用托管图层样式
     * 双层架构：geometry 层只画几何，label 层只画文字（DATA_LABEL 带）
     * 单层兼容：无 labelLayer 时回落旧 buildManagedLayerStyle
     */
    const applyManagedLayerStyle = (layerItem) => {
        if (!layerItem || typeof layerItem.layer?.setStyle !== 'function') return;
        if (!layerItem.labelStyleCache) {
            layerItem.labelStyleCache = new globalThis.Map();
        }
        if (layerItem.labelLayer && typeof layerItem.labelLayer.setStyle === 'function') {
            layerItem.layer.setStyle(buildGeometryStyle(layerItem));
            layerItem.labelLayer.setStyle(buildLabelOnlyStyle(layerItem));
            return;
        }
        layerItem.layer.setStyle(buildManagedLayerStyle(layerItem));
    };

    /**
     * 强制重建图层样式（清空缓存）
     * 仅在样式配置真正变化时调用，如用户修改了填充色、边框色等
     */
    const forceRebuildStyle = (layerItem) => {
        if (!layerItem || typeof layerItem.layer?.setStyle !== 'function') return;
        layerItem.labelStyleCache = new globalThis.Map();
        applyManagedLayerStyle(layerItem);
    };

    return {
        normalizeStyleConfig,
        createStyleFromConfig,
        mergeStyleConfig,
        buildManagedLayerStyle,
        buildGeometryStyle,
        buildLabelOnlyStyle,
        applyManagedLayerStyle,
        forceRebuildStyle,
    };
}
