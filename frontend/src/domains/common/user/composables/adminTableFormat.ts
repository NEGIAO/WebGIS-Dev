/**
 * 功能名称：管理后台表格纯函数工具
 * 日    期：2026/11/13
 * 说    明：从 AdminControlPanel 抽出的无副作用格式化 / 定位键 / CSV 构建逻辑，
 *          不依赖 Vue 响应式，可单独复用与单测。
 */

/** 格式化单元格显示值：null → '-'；对象/数组 → 紧凑 JSON；其他 → 字符串 */
export function formatCellValue(value: unknown): string {
	if (value == null) return '-';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/** HTML 实体转义（高亮渲染前必须调用，防止搜索词/数据注入 HTML） */
export function escapeHtmlText(value: unknown): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	};
	return String(value).replace(/[&<>"']/g, (ch) => map[ch]);
}

/**
 * 搜索命中高亮：无关键词走转义纯文本；命中则对每段命中包 <mark>
 * 参数：text 原始文本；keyword 搜索词（已 trim）
 * 返回：可直接 v-html 的安全字符串
 * 核心逻辑：构建 lower→text 索引映射，处理 toLowerCase 长度变化（如 İ→i̇ 一变二）
 */
export function highlightText(text: string, keyword: string): string {
	if (!keyword) return escapeHtmlText(text);
	const kwLower = keyword.toLowerCase();
	const lower = text.toLowerCase();
	if (!lower.includes(kwLower)) return escapeHtmlText(text);

	const charMap: number[] = new Array(lower.length);
	let li = 0;
	let ti = 0;
	while (li < lower.length && ti < text.length) {
		const lc = text[ti].toLowerCase();
		for (let j = 0; j < lc.length && li < lower.length; j++) {
			charMap[li] = ti;
			li++;
		}
		ti++;
	}
	while (li < lower.length) {
		charMap[li] = text.length;
		li++;
	}

	let result = '';
	let cursor = 0;
	let idx = lower.indexOf(kwLower, cursor);
	while (idx !== -1) {
		const textStart = charMap[idx];
		const textEnd = charMap[idx + kwLower.length - 1] + 1;
		result += escapeHtmlText(text.slice(cursor, textStart));
		result += `<mark class="search-hit">${escapeHtmlText(text.slice(textStart, Math.min(textEnd, text.length)))}</mark>`;
		cursor = idx + kwLower.length;
		idx = lower.indexOf(kwLower, cursor);
	}
	const textCursor = charMap[cursor] !== undefined ? charMap[cursor] : text.length;
	result += escapeHtmlText(text.slice(textCursor));
	return result;
}

/** 行定位键：优先 __rowid → id → token → 指定表的 username → 整行 JSON 兜底 */
export function resolveWhere(row: Record<string, any>, tableName: string): Record<string, any> | null {
	if (row && row.__rowid != null) return { __rowid: row.__rowid };
	if (row && row.id != null) return { id: row.id };
	if (row && row.token != null) return { token: row.token };
	if (row && row.username != null && tableName === 'user_metrics') return { username: row.username };
	return null;
}

/** 行唯一键（用于 v-for key 与行内编辑互斥判定） */
export function getRowKey(row: Record<string, any>): string {
	return String(row.__rowid || row.id || row.token || row.username || JSON.stringify(row));
}

/** 转为可编辑 payload：剔除内部字段 __rowid */
export function toEditablePayload(row: Record<string, any>): Record<string, any> {
	const payload = { ...(row || {}) };
	delete payload.__rowid;
	return payload;
}

/** CSV 单元格转义：对象走 JSON、引号翻倍、公式注入前缀加单引号 */
function escapeCsvValue(value: unknown): string {
	if (value == null) return '';
	const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
	return `"${text.replace(/"/g, '""').replace(/^(=|\+|-|@)/, "'$1")}"`;
}

/**
 * 构建 CSV 文本
 * 参数：columns 列元数据 [{ name }]；rows 数据行
 * 返回：带 UTF-8 BOM 的 CSV 字符串（Excel 可正确识别中文）
 */
export function buildCsv(columns: { name: string }[], rows: Record<string, any>[]): string {
	const header = columns.map((col) => escapeCsvValue(col.name)).join(',');
	const lines = rows.map((row) => columns.map((col) => escapeCsvValue(row[col.name])).join(','));
	return `\uFEFF${header}\r\n${lines.join('\r\n')}`;
}

/** 触发浏览器下载（Blob → a[download] → 回收 URL） */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
