/**
 * datetime.js — 日期时间格式化单源工具
 *
 * 收敛此前散落在 6 处的重复实现：
 * 完整日期时间（toLocaleString）、聊天短时(HH:MM)、WMS 属性表固定格式。
 * 各调用方通过参数声明自己的空值/非法回退与 locale，格式逻辑只维护一份。
 */

const DATETIME_OPTS = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
};
const DATETIME_OPTS_WITH_SECONDS = { ...DATETIME_OPTS, second: '2-digit' };

/**
 * 任意输入 → Date：epoch 毫秒（number 或纯数字字符串）、ISO 字符串、Date。
 * 解析失败返回 null。
 */
export function parseDateValue(value) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? new Date(value) : null;
    }
    const text = String(value ?? '').trim();
    if (!text) return null;
    // 纯数字按 epoch 毫秒处理（ISO 字符串不会是纯数字）
    if (/^\d+$/.test(text)) {
        const ms = Number(text);
        return Number.isFinite(ms) ? new Date(ms) : null;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 完整日期时间（YYYY/MM/DD HH:mm[:ss]，具体分隔符随 locale）。
 * @param {*} input epoch 毫秒或可被 Date 解析的字符串
 * @param {object} [o]
 * @param {string} [o.locale] BCP-47 locale；缺省用浏览器默认
 * @param {boolean} [o.withSeconds=false] 是否含秒
 * @param {string} [o.emptyText=''] 空输入返回值
 * @param {string|null} [o.invalidText=''] 非法输入返回值；传 null 表示原样返回输入字符串
 */
export function formatDateTime(input, {
    locale,
    withSeconds = false,
    emptyText = '',
    invalidText = '',
} = {}) {
    const rawText = typeof input === 'string' ? input.trim() : input;
    if (rawText === '' || rawText === null || rawText === undefined) return emptyText;

    const date = parseDateValue(input);
    if (!date) {
        return invalidText === null ? String(rawText) : invalidText;
    }
    try {
        return date.toLocaleString(locale || undefined, {
            hour12: false,
            ...(withSeconds ? DATETIME_OPTS_WITH_SECONDS : DATETIME_OPTS),
        });
    } catch (_e) {
        // locale 标签非法时回退浏览器默认
        return date.toLocaleString(undefined, { hour12: false });
    }
}

/** 24 小时制短时 HH:MM（聊天气泡等）；空或非法返回 '' */
export function formatTimeShort(input) {
    const date = parseDateValue(input);
    if (!date) return '';
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

/** epoch 毫秒 → 本地固定格式 YYYY-MM-DD HH:mm:ss（WMS 属性表日期字段）；非法值原样字符串返回 */
export function formatDateEpoch(value) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return String(value ?? '');
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return String(value ?? '');
    const pad = (n) => String(n).padStart(2, '0');
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
}
