/**
 * 属性表 CSV 导出工具（独立纯函数模块，不依赖组件与 store）。
 *
 * 职责：
 * - buildAttributeCsv：将行数据 + 字段定义序列化为 CSV 文本（RFC 4180 转义 + UTF-8 BOM，Excel 中文兼容）
 * - buildCsvFilename：生成 `{图层名}_属性表_{时间戳}.csv` 安全文件名
 * - downloadCsv：Blob 触发浏览器下载
 *
 * 输入输出均为普通数据结构，便于单测与复用（如后续 TOC 图层级导出）。
 */

export type AttributeCsvField = {
    key: string;
    alias?: string;
};

export type AttributeCsvRow = {
    properties: Record<string, unknown>;
};

/**
 * 单元格转义：null/undefined → 空串；对象 JSON 化；
 * 含逗号/双引号/换行时按 RFC 4180 包裹双引号并将内部双引号翻倍。
 */
function escapeCsvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    let text: string;
    if (typeof value === 'object') {
        try {
            text = JSON.stringify(value);
        } catch {
            text = String(value);
        }
    } else {
        text = String(value);
    }
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/**
 * 构建 CSV 文本。
 * @param rows 行数据（通常传入属性表当前视图 displayRows：已筛选 + 已排序）
 * @param fields 字段定义（通常传入可见列，表头使用别名回退原始名）
 * @param options.includeIndex 是否附加首列序号（默认 true，与表格 OID 列对应）
 * @returns 带 UTF-8 BOM 的 CSV 文本（CRLF 行分隔）
 */
export function buildAttributeCsv(
    rows: AttributeCsvRow[],
    fields: AttributeCsvField[],
    options: { includeIndex?: boolean } = {},
): string {
    const includeIndex = options.includeIndex !== false;
    const headerCells = [
        ...(includeIndex ? ['OID'] : []),
        ...fields.map((field) => field.alias || field.key),
    ];
    const lines: string[] = [headerCells.map(escapeCsvCell).join(',')];

    rows.forEach((row, index) => {
        const cells = [
            ...(includeIndex ? [String(index + 1)] : []),
            ...fields.map((field) => escapeCsvCell(row.properties?.[field.key])),
        ];
        lines.push(cells.join(','));
    });

    // 显式 UTF-8 BOM 前缀：Excel 打开含中文的 CSV 不乱码
    const utf8Bom = String.fromCharCode(0xfeff);
    return `${utf8Bom}${lines.join('\r\n')}`;
}

/** 生成安全导出文件名：过滤非法字符、截断超长图层名、附加分钟级时间戳。 */
export function buildCsvFilename(layerName: string): string {
    const now = new Date();
    const pad = (num: number) => String(num).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const safeName = String(layerName || '图层')
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 60);
    return `${safeName}_属性表_${stamp}.csv`;
}

/** 通过 Blob + 临时锚点触发浏览器下载，并释放对象 URL。 */
export function downloadCsv(filename: string, csvText: string): void {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
