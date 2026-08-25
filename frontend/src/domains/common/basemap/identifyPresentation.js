/**
 * identifyPresentation.js — 要素点查结果的属性展示渲染（OL / Cesium 双引擎共用）
 *
 * 数据契约：wmsService.queryCandidateAtPoint → { hits:[{ layerName, attributes }] }
 * 引擎侧仅负责把 hits 映射为分组数组；标题组合规则与 HTML 渲染由本模块唯一产出，
 * 杜绝两引擎样式、转义、截断逻辑各自漂移。
 */

/** 单元格值最大字符数（超长截断，防止 InfoBox/DOM 被超长字段撑爆） */
const CELL_VALUE_MAX_LENGTH = 500;

export function escapeHtmlText(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/**
 * 分组标题统一组合：`服务标题 · 图层名`（任一为空自动省略）
 * 两引擎候选结构不同（注册表候选带 subLayerName / 自定义通道用服务端 layerName），
 * 但最终展示一律经此函数产出，保证格式一致且不会重复拼接。
 */
export function composeIdentifyHeading(serviceTitle, layerName) {
    return [String(serviceTitle || '').trim(), String(layerName || '').trim()]
        .filter(Boolean)
        .join(' · ');
}

/** 单个分组的属性键值表 HTML（内联样式，两引擎容器差异由外层兜底） */
export function buildAttributeTableHtml(attributes, maxRows = 20) {
    const entries = Object.entries(
        attributes && typeof attributes === 'object' ? attributes : {},
    ).slice(0, maxRows);
    if (!entries.length) {
        return '<table style="width:100%;border-collapse:collapse;font-size:12px"></table>';
    }
    const rows = entries
        .map(([key, value]) => {
            const text = String(value ?? '');
            const display =
                text.length > CELL_VALUE_MAX_LENGTH
                    ? `${text.slice(0, CELL_VALUE_MAX_LENGTH)}…`
                    : text;
            return (
                `<tr><th style="color:#777;padding:2px 6px 2px 0;text-align:left;white-space:nowrap;vertical-align:top;font-weight:normal">${escapeHtmlText(key)}</th>` +
                `<td style="word-break:break-all">${escapeHtmlText(display)}</td></tr>`
            );
        })
        .join('');
    return `<table style="width:100%;border-collapse:collapse;font-size:12px">${rows}</table>`;
}

/**
 * 分组列表 → 完整 HTML（引擎无关的唯一产出）
 *
 * @param {Array<{heading:string, attributes:Object}>} groups 分组数组
 * @param {{maxGroups?:number, emptyText?:string}} [options] maxGroups 默认 8；emptyText 为无命中文案
 * @returns {string} HTML 字符串（内容均经 escapeHtmlText 转义）
 */
export function buildIdentifyGroupsHtml(groups, options = {}) {
    const list = Array.isArray(groups) ? groups : [];
    if (!list.length) {
        return `<p style="margin:4px 0">${escapeHtmlText(options.emptyText ?? '该处未查询到要素')}</p>`;
    }
    return list
        .slice(0, options.maxGroups ?? 8)
        .map(
            (group) =>
                `<div style="font-weight:600;margin:6px 0 2px;color:#1d4ed8">${escapeHtmlText(group.heading)}</div>` +
                buildAttributeTableHtml(group.attributes),
        )
        .join('');
}

// ==================== 卡片式渲染（OL 点查弹层专用，对齐 eco-query-panel 设计语言） ====================
// HomeView 的 eco-query-panel 样式为 scoped，动态创建的 Overlay DOM 拿不到；
// 此处以全局 class 前缀 idc-* 复刻同一视觉：渐变顶栏 / 白卡片 / 圆角阴影毛玻璃。

const IDENTIFY_CARD_STYLE_ID = 'identify-card-style';

/** 一次性注入卡片样式（幂等）；返回 false 表示已存在 */
export function ensureIdentifyCardStyle() {
    if (typeof document === 'undefined') return false;
    if (document.getElementById(IDENTIFY_CARD_STYLE_ID)) return false;
    const style = document.createElement('style');
    style.id = IDENTIFY_CARD_STYLE_ID;
    style.textContent = `
.idc-group { padding: 8px 10px; border: 2px solid #e8f0e8; border-radius: 8px; background: white; display: flex; flex-direction: column; gap: 4px; transition: border-color .2s; margin-bottom: 6px; }
.idc-group:hover { border-color: var(--brand-accent, #3a7d44); background: var(--bg-hover, #f4faf5); }
.idc-heading { font-size: 12px; font-weight: 600; color: var(--brand-accent-muted, #2c5e34); word-break: break-all; border-bottom: 1px dashed #e8f0e8; padding-bottom: 4px; }
.idc-row { display: flex; gap: 8px; align-items: baseline; }
.idc-key { flex-shrink: 0; max-width: 45%; font-size: 11px; color: var(--text-muted, #7a8a7d); text-transform: uppercase; font-weight: 600; word-break: break-all; }
.idc-val { font-size: 12px; color: #33443a; font-weight: 500; word-break: break-all; }
.idc-empty { text-align: center; color: var(--text-muted, #7a8a7d); font-size: 12px; padding: 18px 0; }
`;
    document.head.appendChild(style);
    return true;
}

/**
 * 分组列表 → 卡片式 HTML（OL 弹层消费；键值行样式对齐 eco-item/eco-key/eco-val）
 *
 * @param {Array<{heading:string, attributes:Object}>} groups 分组数组
 * @param {{maxGroups?:number, emptyText?:string}} [options]
 * @returns {string} HTML 字符串
 */
export function buildIdentifyCardHtml(groups, options = {}) {
    ensureIdentifyCardStyle();
    const list = Array.isArray(groups) ? groups : [];
    if (!list.length) {
        return `<div class="idc-empty">${escapeHtmlText(options.emptyText ?? '该处未查询到要素')}</div>`;
    }
    return list
        .slice(0, options.maxGroups ?? 5)
        .map((group) => {
            const rows = Object.entries(group.attributes && typeof group.attributes === 'object' ? group.attributes : {})
                .slice(0, 20)
                .map(
                    ([key, value]) =>
                        `<div class="idc-row"><span class="idc-key">${escapeHtmlText(key)}</span>` +
                        `<span class="idc-val">${escapeHtmlText(value)}</span></div>`,
                )
                .join('');
            return (
                `<div class="idc-group"><div class="idc-heading">${escapeHtmlText(group.heading)}</div>${rows}</div>`
            );
        })
        .join('');
}
