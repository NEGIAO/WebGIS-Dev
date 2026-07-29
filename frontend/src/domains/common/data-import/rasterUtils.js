/**
 * 栅格数据处理工具函数
 * 纯函数，不依赖外部状态
 */

/**
 * 计算波段数据的最小最大值
 * 对大数据集自动采样以避免全量遍历的性能开销
 * @param {Array|TypedArray} data - 波段数据
 * @param {number} [maxSamples=200000] - 最大采样数，与 computePercentileStretch 保持一致
 * @returns {{ min: number, max: number }} 最小最大值
 */
export function getBandMinMax(data, maxSamples = 200000) {
    if (!data?.length) return { min: 0, max: 1 };

    const step = Math.max(1, Math.floor(data.length / maxSamples));
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < data.length; i += step) {
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
 * 智能检测单波段栅格数据的有效范围和 nodata 值
 *
 * 核心算法：
 * 1. 采样并排除非有限值，计算基础统计量
 * 2. 哨兵值检测：常见 nodata 候选值（0/-9999/-32768/32767/65535）若远离主数据分布则标记
 * 3. GAP 离群检测：排序后寻找最大间隔，若远超中位间隔则小端为离群值
 * 4. 返回 nodata 值和有效数据的 min/max
 *
 * @param {Array|TypedArray} data - 单波段像素数据
 * @param {Object} [options] - 可选参数
 * @param {number|null} [options.nodataValue] - 显式 nodata 值（GDAL 标记）
 * @returns {{ nodataValue: number|null, min: number, max: number }}
 */
export function detectDataRange(data, options = {}) {
    if (!data?.length) return { nodataValue: null, min: 0, max: 1 };

    const MAX_SAMPLES = 200000;
    const step = Math.max(1, Math.floor(data.length / MAX_SAMPLES));
    const SENTINEL_CANDIDATES = [0, -9999, -32768, 32767, 65535];

    // ── 阶段 1：采样 + 基础统计 ──
    const finite = [];
    const explicitNodata = Number.isFinite(options.nodataValue) ? options.nodataValue : null;

    for (let i = 0; i < data.length; i += step) {
        const v = data[i];
        if (Number.isFinite(v)) finite.push(v);
    }
    if (!finite.length) return { nodataValue: explicitNodata, min: 0, max: 1 };

    finite.sort((a, b) => a - b);
    const total = finite.length;
    const dataMin = finite[0];
    const dataMax = finite[total - 1];

    // 全部值相同 → 无离群可言
    if (dataMin === dataMax) {
        return { nodataValue: explicitNodata, min: dataMin, max: dataMax };
    }

    let sum = 0;
    for (let i = 0; i < total; i++) sum += finite[i];
    const mean = sum / total;
    let varianceSum = 0;
    for (let i = 0; i < total; i++) varianceSum += (finite[i] - mean) ** 2;
    const stdDev = Math.sqrt(varianceSum / total);

    // ── 阶段 2：哨兵 nodata 检测 ──
    // 规则：候选值在数据中出现且远离主分布（距均值 > 3σ）
    let sentinelNodata = null;
    if (explicitNodata === null) {
        const sentinelCounts = new Map(SENTINEL_CANDIDATES.map((v) => [v, 0]));
        for (let i = 0; i < total; i++) {
            if (sentinelCounts.has(finite[i])) {
                sentinelCounts.set(finite[i], sentinelCounts.get(finite[i]) + 1);
            }
        }

        for (const [value, count] of sentinelCounts) {
            if (count === 0) continue;
            // 占比 ≥ 5% → 极可能是合法数据（如大面积 0 值），跳过
            if (count / total >= 0.05) continue;
            // 占比 < 1% → 太稀疏，不像 nodata 标记
            if (count / total < 0.01) continue;
            // 距均值 > 3σ → 明显偏离主分布，视为 nodata
            if (stdDev > 0 && Math.abs(value - mean) > 3 * stdDev) {
                sentinelNodata = value;
                break;
            }
        }
    }

    const nodataValue = explicitNodata ?? sentinelNodata;

    // ── 阶段 3：排除 nodata 后重新计算 ──
    const validValues = [];
    for (let i = 0; i < total; i++) {
        const v = finite[i];
        if (nodataValue !== null && Math.abs(v - nodataValue) <= Math.max(1e-9, Math.abs(nodataValue) * 1e-9)) {
            continue;
        }
        validValues.push(v);
    }
    if (!validValues.length) {
        return { nodataValue, min: 0, max: 1 };
    }

    const vTotal = validValues.length;
    const vMin = validValues[0];
    const vMax = validValues[vTotal - 1];
    if (vMin === vMax) return { nodataValue, min: vMin, max: vMin + 1 };

    // ── 阶段 4：GAP 离群检测（仅在哨兵检测未找到 nodata 时） ──
    // 有效数据应连续分布；nodata 值会产生大间隔
    let validMin = vMin;
    let validMax = vMax;

    if (nodataValue === null && vTotal >= 10) {
        // 计算相邻值间隔（仅正值，即排序后严格递增处）
        const gapEntries = [];
        for (let i = 1; i < vTotal; i++) {
            const gap = validValues[i] - validValues[i - 1];
            if (gap > 0) gapEntries.push({ gap, splitIdx: i });
        }

        if (gapEntries.length >= 3) {
            gapEntries.sort((a, b) => a.gap - b.gap);
            const medianGap = gapEntries[Math.floor(gapEntries.length / 2)].gap;
            const maxGap = gapEntries[gapEntries.length - 1].gap;

            // 最大间隔 > 中位间隔 10 倍 → 存在明显离群
            if (medianGap > 0 && maxGap / medianGap > 10) {
                // 收集所有与最大间隔相等的候选位置，选取少数端占比最小的
                let bestCandidate = null;
                let bestMinorityRatio = Infinity;
                for (const entry of gapEntries) {
                    if (entry.gap < maxGap) break; // 已排序，后续更小
                    const lowerCount = entry.splitIdx;
                    const upperCount = vTotal - entry.splitIdx;
                    const minorityRatio = Math.min(lowerCount, upperCount) / vTotal;
                    if (minorityRatio < bestMinorityRatio) {
                        bestMinorityRatio = minorityRatio;
                        bestCandidate = entry.splitIdx;
                    }
                }

                if (bestCandidate !== null && bestMinorityRatio < 0.20) {
                    if (bestCandidate < vTotal - bestCandidate) {
                        validMin = validValues[bestCandidate]; // 跳过小端离群
                    } else {
                        validMax = validValues[bestCandidate - 1]; // 跳过大端离群
                    }
                }
            }
        }
    }

    return { nodataValue, min: validMin, max: validMax };
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
