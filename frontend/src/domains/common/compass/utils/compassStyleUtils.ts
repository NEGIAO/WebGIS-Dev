/**
 * 罗盘背景 CSS 变量工具（纯函数）
 *
 * 将 hex 颜色转换为 CSS 渐变所需的 CSS 变量对象，用于罗盘背景渐变。
 */

/**
 * 将 hex 颜色转换为 CSS 渐变变量对象。
 * @param hex - 十六进制颜色字符串（如 '#FF5733'）
 * @returns CSS 自定义属性对象（--compass-bg-g1/g2/g3）
 */
export function compassBgVars(hex: string): Record<string, string> {
    const h = String(hex || '#000000').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return {
        '--compass-bg-g1': `rgba(${r},${g},${b},0.45)`,
        '--compass-bg-g2': `rgba(${r},${g},${b},0.25)`,
        '--compass-bg-g3': `rgba(${r},${g},${b},0.10)`,
    };
}
