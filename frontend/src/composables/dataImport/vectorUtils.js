/**
 * 矢量数据处理工具函数
 * 纯函数，不依赖外部状态
 */

/** 标签字段候选列表 */
const LABEL_FIELD_CANDIDATES = [
    'name',
    'Name',
    'NAME',
    '名称',
    'title',
    'Title',
    'TITLE',
    'label',
    'Label',
];

/**
 * 改进的文本内容解码函数，支持多种编码
 * 对于 KML/KMZ 等可能包含非 UTF-8 编码的文件进行处理
 * @param {string|ArrayBuffer} content - 待解码内容
 * @returns {string} 解码后的文本
 */
export function decodeTextContent(content) {
    if (typeof content === 'string') return content;
    if (content instanceof ArrayBuffer) {
        const candidates = [];
        const encodings = ['utf-8', 'utf-16le', 'utf-16be', 'gbk'];

        for (const encoding of encodings) {
            try {
                const text = new TextDecoder(encoding, { fatal: false }).decode(content);
                const invalidCount = (text.match(/�/g) || []).length;
                candidates.push({ encoding, text, invalidCount });
            } catch { /* ignored */

                continue;
            }
        }

        if (!candidates.length) {
            console.warn('[vectorUtils] 所有编码尝试均失败，使用 UTF-8 降级');
            return new TextDecoder('utf-8', { fatal: false }).decode(content);
        }

        candidates.sort((a, b) => a.invalidCount - b.invalidCount);
        const best = candidates[0];

        if (best.invalidCount > 0) {
            console.warn(
                `[vectorUtils] 使用编码 ${best.encoding}，包含 ${best.invalidCount} 个替代字符`
            );
        }

        return best.text;
    }
    return String(content || '');
}

/**
 * 标准化上传文件类型
 * @param {string} type - 原始类型
 * @param {string} name - 文件名
 * @returns {string} 标准化后的类型
 */
export function getNormalizedUploadType(type, name = '') {
    const normalizedType = String(type || '').toLowerCase();
    const filename = String(name || '')
        .trim()
        .toLowerCase();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';

    if (ext === 'kmz') return 'kmz';
    if (ext === 'kml') return 'kml';
    if (ext === 'geojson' || ext === 'json') return ext;
    if (ext === 'tif' || ext === 'tiff') return ext;
    if (ext === 'zip' || ext === 'shp') return ext;
    return normalizedType;
}

/**
 * 从条目名称获取图层名称
 * @param {string} entryName - 条目名称
 * @param {string} fallbackName - 回退名称
 * @returns {string} 图层名称
 */
export function getLayerNameFromEntry(entryName, fallbackName = '上传图层') {
    const normalized = String(entryName || '')
        .replace(/\\/g, '/')
        .trim();
    if (!normalized) return fallbackName;

    const filename = normalized.split('/').pop() || normalized;
    const idx = filename.lastIndexOf('.');
    const stem = idx > 0 ? filename.slice(0, idx) : filename;
    return stem || fallbackName;
}

/**
 * 选择要素标签字段
 * @param {Array} features - OpenLayers 要素数组
 * @returns {string|null} 标签字段名
 */
export function pickFeatureLabelField(features = []) {
    if (!Array.isArray(features) || !features.length) return null;

    for (const key of LABEL_FIELD_CANDIDATES) {
        const hasValue = features.some((feature) => {
            const v = feature?.get?.(key);
            return v !== null && v !== undefined && String(v).trim();
        });
        if (hasValue) return key;
    }

    const firstFeature = features[0];
    const props =
        typeof firstFeature?.getProperties === 'function' ? firstFeature.getProperties() : null;
    if (!props) return null;

    const firstUsableKey = Object.keys(props).find((key) => {
        if (key === 'geometry' || key === 'style' || String(key).startsWith('_')) return false;
        const value = props[key];
        return value !== null && value !== undefined && String(value).trim();
    });

    return firstUsableKey || null;
}
