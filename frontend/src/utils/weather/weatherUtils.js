/**
 * weatherUtils.js
 * 天气面板纯工具函数集合
 * - 无副作用、无 Vue 依赖、无 API 调用
 * - 所有函数均为纯函数，可独立单测
 */

/* ------------------------------------------------------------------ */
/*  常量映射表                                                          */
/* ------------------------------------------------------------------ */

/**
 * 天气文本 → Emoji 图标映射
 * @type {Record<string, string>}
 */
export const WEATHER_ICON_MAP = {
    '晴': '☀️',
    '多云': '⛅',
    '阴': '☁️',
    '阵雨': '🌦️',
    '雷阵雨': '⛈️',
    '小雨': '🌧️',
    '中雨': '🌧️',
    '大雨': '🌧️',
    '暴雨': '🌧️',
    '小雪': '🌨️',
    '中雪': '🌨️',
    '大雪': '❄️',
    '雾': '🌫️',
    '霾': '🌫️',
    '有风': '🌬️',
    '大风': '🌬️',
    '台风': '🌪️',
    '沙尘暴': '🌪️',
};

/**
 * 星期数字 → 中文标签映射
 * @type {Record<string, string>}
 */
export const WEEK_LABEL_MAP = {
    '1': '周一',
    '2': '周二',
    '3': '周三',
    '4': '周四',
    '5': '周五',
    '6': '周六',
    '7': '周日',
};

/**
 * 降雨关键词正则（匹配天气文本中的雨/雷相关关键词）
 * @type {RegExp}
 */
export const RAIN_KEYWORD_REGEXP = /雨|雷|暴雨|阵雨|冻雨|雨夹雪|毛毛雨|强对流/;

/* ------------------------------------------------------------------ */
/*  工具函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 根据天气文本返回对应的 Emoji 图标
 * 优先精确匹配，失败则模糊包含匹配，最终兜底 '🌤️'
 *
 * @param {string} weatherText 天气描述文本（如 "小雨"、"晴转多云"）
 * @returns {string} 对应的天气 Emoji 图标
 */
export function resolveWeatherIcon(weatherText) {
    const text = String(weatherText || '').trim();
    if (!text) return '🌤️';

    // 精确匹配
    const exact = WEATHER_ICON_MAP[text];
    if (exact) return exact;

    // 模糊包含匹配
    const matchedKey = Object.keys(WEATHER_ICON_MAP).find((key) => text.includes(key));
    return matchedKey ? WEATHER_ICON_MAP[matchedKey] : '🌤️';
}

/**
 * 检测天气文本中是否包含降雨信号关键词
 *
 * @param {string} weatherText 天气描述文本
 * @returns {boolean} 是否包含降雨关键词
 */
export function hasRainSignal(weatherText) {
    return RAIN_KEYWORD_REGEXP.test(String(weatherText || '').trim());
}

/**
 * 标准化风力描述，提取数字部分
 * 例如 "≤3级" → 3，"3-4级" → 3，"微风" → 0
 *
 * @param {string|number|null|undefined} value 风力描述文本
 * @returns {number} 数字风力值，解析失败返回 0
 */
export function normalizeWindPower(value) {
    const text = String(value ?? '').trim();
    const matched = text.match(/\d+(?:\.\d+)?/);
    const numeric = matched ? Number(matched[0]) : 0;
    return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * 格式化星期标签（数字/文本 → 中文星期）
 *
 * @param {string|number|null|undefined} weekValue 星期值（1-7 或文本）
 * @returns {string} 中文星期标签，无效值返回 '--'
 */
export function formatWeekLabel(weekValue) {
    const text = String(weekValue || '').trim();
    if (!text) return '--';
    return WEEK_LABEL_MAP[text] || text;
}

/**
 * 安全的数字格式化（非有限数字返回 fallback）
 *
 * @param {*} value 待格式化的值
 * @param {string} fallback 非数字时的替代文本
 * @returns {number|string} 数字或 fallback 文本
 */
export function toFixedNumber(value, fallback = '--') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return numeric;
}

/**
 * 转换为数字或 null（用于图表数据）
 *
 * @param {*} value 待转换的值
 * @returns {number|null} 数字或 null
 */
export function toNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

/**
 * 格式化日期文本为 MM-DD 短格式
 *
 * @param {string} dateText 日期字符串（如 "2026-06-02"）
 * @returns {string} 格式化后的日期标签，无效值返回 '--'
 */
export function formatDateLabel(dateText) {
    const text = String(dateText || '').trim();
    if (!text) return '--';

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
}

/**
 * 数值区间钳制
 *
 * @param {number} value 输入值
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {number} 钳制后的值
 */
export function clampValue(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}
