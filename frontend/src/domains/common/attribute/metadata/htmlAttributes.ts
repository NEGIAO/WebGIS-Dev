/**
 * HTML 片段 → 属性表（ECharts/Feishu/GeoServer 等服务的富文本属性）
 *
 * 从 useLayerMetadataNormalization 拆出：负责 table / dl 两种结构的解析、脚本与
 * inline 事件清洗、`<Null>` 占位归一。只依赖 DOMParser，不依赖图层与几何。
 */

import { isPlainObject } from './valueUtils';

function parseHtmlText(html: any): string {
    if (typeof html !== 'string') return String(html || '').trim();
    if (typeof DOMParser !== 'undefined') {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            // ★ 主动剥离 <script>/<style>/<noscript> 标签及 inline 事件属性，
            //    避免残留 JavaScript 代码进入属性表
            stripScriptsAndStyles(doc);
            return String(doc.body.textContent || '').trim();
        } catch {
            // fallback to regex
        }
    }
    return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * ★ 新增（2026-06-21）：主动剥离 DOM 中的 script/style/noscript 标签，
 *    并移除所有节点上的 inline 事件属性（onclick/onerror/onload 等）。
 *    DOMParser 解析 text/html 时不自动执行脚本，但节点对象仍保留在 DOM 中，
 *    通过 textContent 提取时不会包含 <script>，但需要显式移除以保证防御深度。
 * @param {Document} doc DOMParser 解析结果
 */
function stripScriptsAndStyles(doc: Document): void {
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    const removable = doc.querySelectorAll('script, style, noscript, iframe, object, embed');
    removable.forEach((node) => {
        try { node.parentNode?.removeChild(node); } catch { /* ignore */ }
    });
    // 移除 inline 事件属性
    const allElements = doc.querySelectorAll('*');
    allElements.forEach((el) => {
        if (!el.attributes) return;
        Array.from(el.attributes).forEach((attr: Attr) => {
            if (/^on[a-z]+/i.test(attr.name)) {
                try { el.removeAttribute(attr.name); } catch { /* ignore */ }
            }
            if (/^javascript:/i.test(attr.value || '')) {
                try { el.removeAttribute(attr.name); } catch { /* ignore */ }
            }
        });
    });
}

/**
 * ★ 新增（2026-06-21）：归一化 <Null> 占位符为 null
 * OSM Nominatim / Cesium FeatureDescription / GeoServer WFS 等 GIS 数据源
 * 习惯使用 <Null> 表示空值（XML 风格），属性表应识别此约定。
 */
const NULL_PATTERN = /^\s*<\s*Null\s*>\s*$/i;
function normalizeNullString(str: any): any {
    if (typeof str !== 'string') return str;
    return NULL_PATTERN.test(str) ? null : str;
}

function parseHtmlTableValue(value: any): Record<string, any> | null {
    if (typeof value !== 'string' || !/<table[\s>]/i.test(value)) return null;
    if (typeof DOMParser === 'undefined') return null;
    let doc;
    try {
        doc = new DOMParser().parseFromString(value, 'text/html');
    } catch {
        return null;
    }

    // ★ 增强：主动剥离脚本/样式/inline 事件
    stripScriptsAndStyles(doc);

    const table = doc.querySelector('table');
    if (!table) return null;

    const parsed: Record<string, any> = {};

    // ★ 重写：列索引驱动解析，识别 <thead> 表头或首行 <tr><th>...</th></tr>
    const thead = table.querySelector('thead');
    const headerRow = thead ? thead.querySelector('tr') : null;
    const headerCells: string[] | null = headerRow
        ? Array.from(headerRow.querySelectorAll('th,td')).map((c: Element) => String(c.textContent || '').trim())
        : null;
    let headerKeyIndex = 0;

    // 表头包含 "name/value" 风格的关键字时，按列索引解析
    const HEADER_KEY_HINTS = ['名称', 'name', '属性', 'field', 'property', 'key', 'detail', '字段', '参数'];
    const HEADER_VALUE_HINTS = ['值', 'value', 'value1', 'val', 'content', 'result', '取值', '字段值'];

    let useColumnIndex = false;
    if (headerCells && headerCells.length >= 2) {
        const lowerHeaders = headerCells.map((h) => h.toLowerCase());
        const hasKeyColumn = lowerHeaders.some((h) => HEADER_KEY_HINTS.includes(h));
        const hasValueColumn = lowerHeaders.some((h) => HEADER_VALUE_HINTS.includes(h));
        if (hasKeyColumn && hasValueColumn) {
            useColumnIndex = true;
            headerKeyIndex = lowerHeaders.findIndex((h) => HEADER_KEY_HINTS.includes(h));
        }
    }

    // 获取数据行（tbody > tr 或全部 tr 排除表头）
    let dataRows;
    if (thead) {
        const tbody = table.querySelector('tbody') || table;
        dataRows = Array.from(tbody.querySelectorAll('tr')).filter((tr) => !thead.contains(tr));
    } else {
        const allRows = Array.from(table.querySelectorAll('tr'));
        // 没有显式 thead：第一行若是 <th>，则当作表头跳过
        if (headerCells && allRows[0] === headerRow) {
            dataRows = allRows.slice(1);
        } else {
            dataRows = allRows;
        }
    }

    dataRows.forEach((row) => {
        const cells: Element[] = Array.from(row.querySelectorAll('th,td'));
        if (cells.length < 2) return;

        let rawKey;
        let valueCells;

        if (useColumnIndex) {
            rawKey = String(cells[headerKeyIndex]?.textContent || '').trim();
            valueCells = cells.filter((_, idx) => idx !== headerKeyIndex);
        } else {
            // 默认：cells[0] = key, cells[1+] = value
            rawKey = String(cells[0]?.textContent || '').trim();
            valueCells = cells.slice(1);
        }

        if (!rawKey) return;

        // ★ 处理 valueCells 中的嵌套表格 / <dl>
        const valueTexts = valueCells.map((cell) => {
            const nestedTable = cell.querySelector?.('table');
            if (nestedTable) {
                const nestedHtml = nestedTable.outerHTML;
                const nested = parseHtmlTableValue(nestedHtml);
                return nested || parseHtmlText(cell.innerHTML);
            }
            const nestedDl = cell.querySelector?.('dl');
            if (nestedDl) {
                const nested = parseDefinitionListValue(nestedDl.outerHTML);
                return nested || parseHtmlText(cell.innerHTML);
            }
            return parseHtmlText(cell.innerHTML || cell.textContent || '');
        }).filter((text) => text !== '');

        if (!valueTexts.length) return;

        const rawValue = valueTexts.join(' ').trim();
        const normalizedValue = normalizeNullString(rawValue);

        // ★ 同名 key 合并为数组
        if (Object.prototype.hasOwnProperty.call(parsed, rawKey)) {
            const existing = parsed[rawKey];
            if (Array.isArray(existing)) {
                parsed[rawKey].push(normalizedValue);
            } else {
                parsed[rawKey] = [existing, normalizedValue];
            }
        } else {
            parsed[rawKey] = normalizedValue;
        }
    });

    return Object.keys(parsed).length ? parsed : null;
}

/**
 * ★ 新增（2026-06-21）：解析 HTML 定义列表 <dl>/<dt>/<dd>
 *  部分 GIS 元数据使用定义列表表达字段-值对：
 *  <dl><dt>name</dt><dd>foo</dd><dt>type</dt><dd>city</dd></dl>
 * @param {string} value HTML 字符串
 * @returns {Object|null} 解析结果
 */
function parseDefinitionListValue(value: any): Record<string, any> | null {
    if (typeof value !== 'string' || !/<dl[\s>]/i.test(value)) return null;
    if (typeof DOMParser === 'undefined') return null;
    let doc;
    try {
        doc = new DOMParser().parseFromString(value, 'text/html');
    } catch {
        return null;
    }
    stripScriptsAndStyles(doc);
    const dl = doc.querySelector('dl');
    if (!dl) return null;

    const parsed: Record<string, any> = {};
    const children: Element[] = Array.from(dl.children);
    let pendingKey = '';

    children.forEach((child) => {
        const tag = String(child.tagName || '').toLowerCase();
        const text = String(child.textContent || '').trim();
        const normalizedText = normalizeNullString(text);
        if (tag === 'dt') {
            pendingKey = text;
        } else if (tag === 'dd' && pendingKey) {
            if (Object.prototype.hasOwnProperty.call(parsed, pendingKey)) {
                const existing = parsed[pendingKey];
                parsed[pendingKey] = Array.isArray(existing) ? [...existing, normalizedText] : [existing, normalizedText];
            } else {
                parsed[pendingKey] = normalizedText;
            }
            pendingKey = '';
        }
    });

    return Object.keys(parsed).length ? parsed : null;
}

export function normalizeHtmlAttributes(attributes: any): any {
    if (!isPlainObject(attributes)) return attributes;

    let next = { ...attributes };
    Object.entries(attributes).forEach(([key, value]) => {
        if (typeof value !== 'string') return;

        // ★ 增强（2026-06-21）：先尝试 <dl>/<dt>/<dd> 定义列表
        if (/<dl[\s>]/i.test(value) && !/<table[\s>]/i.test(value)) {
            const dlParsed = parseDefinitionListValue(value);
            if (dlParsed && isPlainObject(dlParsed)) {
                // 解析结果优先，原 attributes 兜底：保留原始 key 在解析值缺失时仍可见
                next = { ...next, ...dlParsed };
                // 保留原始字段供调试
                next[key] = parseHtmlText(value);
                return;
            }
        }

        if (/<table[\s>]/i.test(value)) {
            const parsed = parseHtmlTableValue(value);
            if (parsed && isPlainObject(parsed)) {
                // 解析结果优先，原 attributes 兜底
                next = { ...next, ...parsed };
            }
            next[key] = parseHtmlText(value);
        }
    });

    return next;
}