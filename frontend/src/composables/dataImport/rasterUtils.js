/**
 * 栅格数据处理工具函数
 * 纯函数，不依赖外部状态
 */

/**
 * 计算波段数据的最小最大值
 * @param {Array|TypedArray} data - 波段数据
 * @returns {{ min: number, max: number }} 最小最大值
 */
export function getBandMinMax(data) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return { min: 0, max: 1 };
    }
    return { min, max };
}

/**
 * 将值拉伸到 0-255 范围
 * @param {number} value - 原始值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 0-255 的值
 */
export function stretchToByte(value, min, max) {
    if (!Number.isFinite(value)) return 0;
    const n = (value - min) / (max - min);
    return Math.max(0, Math.min(255, Math.round(n * 255)));
}

/**
 * 判断是否为 NoData 值
 * @param {number} value - 像元值
 * @param {number|null} nodataValue - NoData 值
 * @returns {boolean} 是否为 NoData
 */
export function isNoDataValue(value, nodataValue) {
    if (nodataValue === null || nodataValue === undefined || !Number.isFinite(value))
        return false;
    const eps = Math.max(1e-9, Math.abs(nodataValue) * 1e-9);
    return Math.abs(value - nodataValue) <= eps;
}

/**
 * 计算百分比拉伸范围
 * @param {Array|TypedArray} data - 波段数据
 * @param {number|null} nodataValue - NoData 值
 * @param {number} lowPct - 低百分位
 * @param {number} highPct - 高百分位
 * @returns {{ min: number, max: number }} 拉伸范围
 */
export function computePercentileStretch(data, nodataValue, lowPct = 2, highPct = 98) {
    if (!data?.length) return { min: 0, max: 1 };

    const maxSamples = 200000;
    const step = Math.max(1, Math.floor(data.length / maxSamples));
    const values = [];

    for (let i = 0; i < data.length; i += step) {
        const v = data[i];
        if (!Number.isFinite(v) || isNoDataValue(v, nodataValue)) continue;
        values.push(v);
    }

    if (!values.length) return { min: 0, max: 1 };

    values.sort((a, b) => a - b);
    const lowIndex = Math.max(0, Math.floor((values.length - 1) * (lowPct / 100)));
    const highIndex = Math.max(0, Math.floor((values.length - 1) * (highPct / 100)));

    let min = values[lowIndex];
    let max = values[highIndex];
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        min = values[0];
        max = values[values.length - 1];
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return { min: 0, max: 1 };
    }
    return { min, max };
}

/**
 * 推断回退 NoData 值
 * @param {Array|TypedArray} data - 波段数据
 * @param {number|null} explicitNoDataValue - 显式 NoData 值
 * @returns {number|null} 推断的 NoData 值
 */
export function inferFallbackNoDataValue(data, explicitNoDataValue) {
    if (Number.isFinite(explicitNoDataValue)) return explicitNoDataValue;
    if (!data?.length) return null;

    const sentinelCandidates = [0, -9999, -32768, 32767, 65535];
    const counts = new Map(sentinelCandidates.map((v) => [v, 0]));

    const maxSamples = 200000;
    const step = Math.max(1, Math.floor(data.length / maxSamples));
    let sampled = 0;

    for (let i = 0; i < data.length; i += step) {
        const v = data[i];
        if (!Number.isFinite(v)) continue;
        sampled += 1;
        if (counts.has(v)) {
            counts.set(v, counts.get(v) + 1);
        }
    }

    if (!sampled) return null;

    let bestValue = null;
    let bestCount = 0;
    for (const [value, count] of counts.entries()) {
        if (count > bestCount) {
            bestValue = value;
            bestCount = count;
        }
    }

    return bestCount / sampled >= 0.05 ? bestValue : null;
}

/**
 * 判断是否为栅格上传图层
 * @param {Object} item - 图层对象
 * @returns {boolean}
 */
export function isRasterUploadLayer(item) {
    const t = String(item?.type || '').toLowerCase();
    return item?.sourceType === 'upload' && (t === 'tif' || t === 'tiff');
}

/**
 * 判断是否为 TIF 类型
 * @param {string} type - 类型字符串
 * @returns {boolean}
 */
export function isTiffType(type) {
    const normalized = String(type || '').toLowerCase();
    return normalized === 'tif' || normalized === 'tiff';
}
