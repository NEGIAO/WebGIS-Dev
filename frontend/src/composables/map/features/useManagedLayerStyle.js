import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { isLabelValid } from '../../../utils/labelValidator';

const DEFAULT_STYLE_TEMPLATE = {
    fillColor: '#5fbf7a',
    fillOpacity: 0.24,
    strokeColor: '#2f7d3c',
    strokeWidth: 2,
    pointRadius: 6
};

/**
 * 托管图层样式功能库
 * 职责：样式归一化、标签生成、样式函数构建与应用。
 */
export function createManagedLayerStyleFeature({
    styleTemplates,
    maxLabelLength = 100
} = {}) {
    const defaultStyleTemplate = {
        ...DEFAULT_STYLE_TEMPLATE,
        ...(styleTemplates?.classic || {})
    };

    const normalizeStyleConfig = (styleCfg = {}) => {
        const base = { ...defaultStyleTemplate, ...(styleCfg || {}) };
        return {
            fillColor: base.fillColor,
            fillOpacity: Math.min(1, Math.max(0, Number(base.fillOpacity ?? 0.2))),
            strokeColor: base.strokeColor,
            strokeWidth: Math.max(0.5, Number(base.strokeWidth ?? 2)),
            pointRadius: Math.max(3, Number(base.pointRadius ?? 6))
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
                stroke: new Stroke({ color: cfg.strokeColor, width: Math.max(1, cfg.strokeWidth / 2) })
            }),
            text: labelText
                ? new Text({
                    // =======================
                    // 已改成你要的样式 ✅
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
                    textAlign: 'center'
                })
                : undefined
        });
    };

    const mergeStyleConfig = (prevCfg, newCfg) => {
        return normalizeStyleConfig({ ...(prevCfg || {}), ...(newCfg || {}) });
    };

    const getLayerLabelText = (layerItem) => {
        if (!layerItem?.autoLabel) return '';
        if (!layerItem?.labelVisible) return '';

        const labelText = String(layerItem.name || '').trim();
        if (!isLabelValid(labelText, maxLabelLength)) return '';
        return labelText;
    };

    const getFeatureLabelText = (feature, layerItem) => {
        if (!layerItem?.autoLabel || !layerItem?.labelVisible) return '';

        const props = typeof feature?.getProperties === 'function' ? feature.getProperties() : null;
        if (!props) return getLayerLabelText(layerItem);

        const preferredField = String(layerItem?.metadata?.labelField || '').trim();
        if (preferredField) {
            const preferredValue = props[preferredField];
            if (preferredValue !== null && preferredValue !== undefined && isLabelValid(preferredValue, maxLabelLength)) {
                return String(preferredValue).trim();
            }
        }

        const candidateKeys = ['name', 'Name', 'NAME', '名称', 'title', 'Title', 'TITLE', 'label', 'Label'];
        for (const key of candidateKeys) {
            const value = props[key];
            if (value !== null && value !== undefined && isLabelValid(value, maxLabelLength)) {
                return String(value).trim();
            }
        }

        const firstUsableEntry = Object.entries(props).find(([key, value]) => (
            key !== 'geometry'
            && key !== 'style'
            && !String(key).startsWith('_')
            && value !== null
            && value !== undefined
            && isLabelValid(value, maxLabelLength)
            && String(value).trim()
        ));
        if (firstUsableEntry) {
            return String(firstUsableEntry[1]).trim();
        }

        return getLayerLabelText(layerItem);
    };

    const buildManagedLayerStyle = (layerItem) => {
        const baseStyleConfig = layerItem?.styleConfig || defaultStyleTemplate;
        if (!layerItem?.autoLabel || !layerItem?.labelVisible) {
            return createStyleFromConfig(baseStyleConfig, { labelText: '' });
        }

        layerItem.labelStyleCache = layerItem.labelStyleCache || new globalThis.Map();
        return (feature) => {
            const rawLabel = getFeatureLabelText(feature, layerItem);
            const labelText = String(rawLabel || '').trim();
            const cacheKey = labelText || '__empty__';
            if (layerItem.labelStyleCache.has(cacheKey)) {
                return layerItem.labelStyleCache.get(cacheKey);
            }

            const style = createStyleFromConfig(baseStyleConfig, { labelText });
            layerItem.labelStyleCache.set(cacheKey, style);
            return style;
        };
    };

    const applyManagedLayerStyle = (layerItem) => {
        if (!layerItem || typeof layerItem.layer?.setStyle !== 'function') return;
        layerItem.labelStyleCache = new globalThis.Map();
        layerItem.layer.setStyle(buildManagedLayerStyle(layerItem));
    };

    return {
        normalizeStyleConfig,
        createStyleFromConfig,
        mergeStyleConfig,
        buildManagedLayerStyle,
        applyManagedLayerStyle
    };
}
