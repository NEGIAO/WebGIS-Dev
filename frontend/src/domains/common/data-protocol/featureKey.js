/**
 * @fileoverview FeatureKey 工具库
 *
 * ★ 设计目的
 *   统一"图层 + 要素"复合主键的生成与解析，避免在不同 store / composable 中拼接字符串格式不一致。
 *
 * ┌──────────── 格式定义 ────────────┐
 * │ FeatureKey = `${layerId}::${featureId}` │
 * │ 分隔符固定为 `::`（双冒号），避免与 URL、UUID 中的单冒号冲突 │
 * └────────────────────────────────┘
 *
 * 使用场景：
 *   - useFeatureStyleStore Map<FeatureKey, Style> 备份原始样式
 *   - 多选高亮 Map<FeatureKey, WeakRef<OLFeature>> 跟踪引用
 *   - TOC/Layer store 联动清理时按 layerId 前缀过滤
 *
 * @author Claude (2026-06-21)
 */

/**
 * 复合主键分隔符
 * @constant {string}
 */
export const FEATURE_KEY_SEPARATOR = '::';

/**
 * 生成 FeatureKey（复合主键）
 * @param {string} layerId - 图层 ID
 * @param {string|number|null|undefined} featureId - 要素 ID（OL Feature 的 getId() 或 _gid）
 * @returns {string} FeatureKey；输入无效时返回空字符串
 */
export function buildFeatureKey(layerId, featureId) {
    const layer = String(layerId ?? '').trim();
    const feature = String(featureId ?? '').trim();
    if (!layer || !feature) return '';
    return `${layer}${FEATURE_KEY_SEPARATOR}${feature}`;
}

/**
 * 解析 FeatureKey
 * @param {string} featureKey - 复合主键
 * @returns {{layerId: string, featureId: string}} 解析结果；无效输入返回空字段
 */
export function parseFeatureKey(featureKey) {
    const key = String(featureKey ?? '');
    const idx = key.indexOf(FEATURE_KEY_SEPARATOR);
    if (idx < 0) return { layerId: '', featureId: '' };
    return {
        layerId: key.slice(0, idx),
        featureId: key.slice(idx + FEATURE_KEY_SEPARATOR.length),
    };
}

/**
 * 提取 layerId（不分配新对象，性能更好）
 * @param {string} featureKey
 * @returns {string}
 */
export function getLayerIdFromFeatureKey(featureKey) {
    const key = String(featureKey ?? '');
    const idx = key.indexOf(FEATURE_KEY_SEPARATOR);
    return idx < 0 ? '' : key.slice(0, idx);
}

/**
 * 提取 featureId（不分配新对象，性能更好）
 * @param {string} featureKey
 * @returns {string}
 */
export function getFeatureIdFromFeatureKey(featureKey) {
    const key = String(featureKey ?? '');
    const idx = key.indexOf(FEATURE_KEY_SEPARATOR);
    return idx < 0 ? '' : key.slice(idx + FEATURE_KEY_SEPARATOR.length);
}

/**
 * 校验 FeatureKey 格式是否合法
 * @param {string} featureKey
 * @returns {boolean}
 */
export function isValidFeatureKey(featureKey) {
    const key = String(featureKey ?? '');
    const idx = key.indexOf(FEATURE_KEY_SEPARATOR);
    return idx > 0 && idx < key.length - FEATURE_KEY_SEPARATOR.length;
}

/**
 * 从 OL Feature 实例中提取稳定的 featureId
 *
 * ★ 抽取理由
 *   `feature.getId() ?? feature.get('_gid') ?? feature.get('id')` 三段回退
 *   在 useCreateManagedVectorLayer / useUserLayerActions / useMapEventHandlers
 *   / useManagedFeatureHighlight 四处重复，散落各处容易出现回退顺序不一致
 *   导致同一要素在不同位置被识别为不同 ID。统一抽到此函数。
 *
 * @param {any} feature OL Feature 实例或 null
 * @returns {string} 标准化后的 featureId；无 ID 返回空字符串
 */
export function getFeatureIdFromFeature(feature) {
    if (!feature || typeof feature !== 'object') return '';
    const directId = typeof feature.getId === 'function' ? feature.getId() : null;
    if (directId !== null && directId !== undefined && directId !== '') {
        return String(directId);
    }
    const gid = typeof feature.get === 'function' ? feature.get('_gid') : null;
    if (gid !== null && gid !== undefined && gid !== '') {
        return String(gid);
    }
    const idProp = typeof feature.get === 'function' ? feature.get('id') : null;
    return idProp !== null && idProp !== undefined && idProp !== ''
        ? String(idProp)
        : '';
}
