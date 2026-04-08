/**
 * 标注内容验证工具
 * 用于验证地理位置、要素名称等标注信息的有效性
 * 
 * 应用场景：
 * - TOC 树节点中的标注显示
 * - 地图实际渲染标注前的预检
 * - CSV/GeoJSON 导出时的标注字段验证
 */

/**
 * 验证标注内容是否有效
 * 
 * 验证条件：
 * 1. 不为 null/undefined
 * 2. 不是空字符串
 * 3. 长度在合理范围内
 * 4. 不包含乱码（控制字符比例 < 50%）
 * 5. 不包含过多连续特殊符号
 * 
 * @param {string | null | undefined} label - 待验证的标注内容
 * @param {number} maxLength - 最大长度限制（默认100字符，为0表示不限制）
 * @param {number} specialCharThreshold - 特殊字符比例阈值（默认0.5，即50%）
 * 
 * @returns {Object} 验证结果
 * @returns {boolean} result.valid - 标注是否有效
 * @returns {string} result.reason - 不有效时的原因说明
 * 
 * @example
 * // 单纯检查有效性
 * const isValid = isValidLabel('北京市朝阳区', 100).valid;
 * 
 * @example
 * // 获取详细原因
 * const result = isValidLabel(featureName, 100);
 * if (!result.valid) {
 *   console.warn(`标注不予显示: ${result.reason}`);
 * }
 */
export function isValidLabel(
    label: string | null | undefined,
    maxLength: number = 100,
    specialCharThreshold: number = 0.5
): { valid: boolean; reason: string } {
    // 检查是否为 null 或 undefined
    if (label === null || label === undefined) {
        return { valid: false, reason: '标注为空值(null/undefined)' };
    }

    // 转换为字符串并trim
    const labelStr = String(label).trim();

    // 检查是否为空字符串
    if (!labelStr) {
        return { valid: false, reason: '标注为空字符串' };
    }

    // 检查是否为常见的无效值表示形式（NULL、null、None、<Null>等）
    // 这些在数据导入时可能被转换为字符串形式
    const invalidValuePatterns = [
        /^NULL$/i,           // NULL、null、Null等（不区分大小写）
        /^<null>$/i,         // <null>、<Null>等
        /^<Null>$/i,         // 特殊情况：<Null>
        /^None$/i,           // None
        /^\[NULL\]$/,        // [NULL]
        /^\(NULL\)$/,        // (NULL)
        /^-$/,               // 单个 - 通常表示无效
        /^\.$/,              // 单个 . 通常表示无效
        /^N\/A$/i,           // N/A
        /^n\/a$/i,           // n/a
        /^无/,               // 中文：无
        /^未知/               // 中文：未知
    ];

    for (const pattern of invalidValuePatterns) {
        if (pattern.test(labelStr)) {
            return { valid: false, reason: `标注为无效值表示(${labelStr})` };
        }
    }

    // 检查是否为常见的无意义文件名或扩展名
    const fileExtensionPatterns = [
        /^doc$/i,            // doc、Doc
        /^docx$/i,           // docx、Docx
        /^pdf$/i,            // pdf、Pdf
        /^txt$/i,            // txt、Txt
        /^file$/i,           // file、File
        /^image$/i,          // image、Image
        /^untitled$/i,       // untitled、Untitled
        /^new document$/i,   // 新文档通用名
    ];

    for (const pattern of fileExtensionPatterns) {
        if (pattern.test(labelStr)) {
            return { valid: false, reason: `标注为无意义文件名或扩展名(${labelStr})` };
        }
    }

    // 检查是否为URL编码的字符串（%XX 形式很多表示被编码过，通常是无效的显示值）
    // URL编码示例：%E4%BB%A5%E8%89%B2%E5%88%97%E7%87%83%E6%B0%94%E5%8F%91%E7%94%B5%E5%8E%82
    if (/%[0-9A-Fa-f]{2}/g.test(labelStr)) {
        // 检查编码字符比例
        const encodedChars = labelStr.match(/%[0-9A-Fa-f]{2}/g) || [];
        const encodedRatio = (encodedChars.length * 3) / labelStr.length;
        
        // 如果超过60%的字符是URL编码形式，则视为无效标注
        if (encodedRatio > 0.6) {
            return { valid: false, reason: `检测到URL编码字符串(编码比例${(encodedRatio * 100).toFixed(0)}%)` };
        }
    }

    // 检查长度是否过长
    if (maxLength > 0 && labelStr.length > maxLength) {
        return {
            valid: false,
            reason: `标注过长(${labelStr.length} > ${maxLength}字符)`
        };
    }

    // 检查是否为乱码（检查是否包含过多的特殊字符或控制字符）
    // 匹配控制字符、不可打印字符、代理对等
    const specialCharMatch = labelStr.match(/[\x00-\x1F\x7F-\x9F\uD800-\uDFFF]/g);
    const specialCharRatio = specialCharMatch ? specialCharMatch.length / labelStr.length : 0;

    if (specialCharRatio > specialCharThreshold) {
        return {
            valid: false,
            reason: `检测到乱码(控制字符比例${(specialCharRatio * 100).toFixed(1)}%)`
        };
    }

    // 检查是否包含过多的连续特殊符号或无效序列
    // 允许常见标点、中文、英文、数字，但连续的特殊符号超过2个视为异常
    const consecutiveSpecialMatch = labelStr.match(
        /[^\w\s\u4E00-\u9FA5\u3400-\u4DBF\.\,\?\!\！；:\-\(\)（）、，。？！；：\-—·ň\.]/g
    );

    if (consecutiveSpecialMatch && consecutiveSpecialMatch.length > 1) {
        return {
            valid: false,
            reason: '检测到过多特殊符号或乱码字符'
        };
    }

    return { valid: true, reason: '' };
}

/**
 * 快速判断标注是否有效（仅返回布尔值）
 * 用于条件判断时的便利函数
 * 
 * @param {string | null | undefined} label - 待验证的标注内容
 * @param {number} maxLength - 最大长度限制（默认100字符）
 * 
 * @returns {boolean} 标注是否有效
 * 
 * @example
 * if (isLabelValid(featureName)) {
 *   renderLabel(featureName);
 * }
 */
export function isLabelValid(
    label: string | null | undefined,
    maxLength: number = 100
): boolean {
    return isValidLabel(label, maxLength).valid;
}

/**
 * 清理和规范化标注信息
 * 如果标注无效，返回默认值或空字符串
 * 
 * @param {string | null | undefined} label - 原始标注内容
 * @param {string} defaultValue - 标注无效时返回的默认值（默认为空字符串）
 * @param {number} maxLength - 最大长度限制
 * 
 * @returns {string} 清理后的标注或默认值
 * 
 * @example
 * const displayLabel = sanitizeLabel(rawLabel, '未命名', 100);
 */
export function sanitizeLabel(
    label: string | null | undefined,
    defaultValue: string = '',
    maxLength: number = 100
): string {
    const { valid } = isValidLabel(label, maxLength);
    if (!valid) {
        return defaultValue;
    }
    return String(label).trim();
}

/**
 * 验证多个标注字段
 * 用于批量检查图层的多个标注字段
 * 
 * @param {Object} labels - 标注字段集合 { fieldName: fieldValue, ... }
 * @param {number} maxLength - 最大长度限制
 * 
 * @returns {Object} 验证结果 { fieldName: boolean, ... }
 * 
 * @example
 * const labels = {
 *   name: feature.properties.name,
 *   description: feature.properties.description,
 *   category: feature.properties.category
 * };
 * const valid = validateLabels(labels);
 * // { name: true, description: false, category: true }
 */
export function validateLabels(
    labels: Record<string, any>,
    maxLength: number = 100
): Record<string, boolean> {
    const result: Record<string, boolean> = {};

    for (const [fieldName, fieldValue] of Object.entries(labels)) {
        result[fieldName] = isLabelValid(fieldValue, maxLength);
    }

    return result;
}

/**
 * 获取第一个有效的标注字段
 * 用于从多个备选标注字段中选择最优标注
 * 
 * @param {string[]} candidates - 标注候选值列表
 * @param {number} maxLength - 最大长度限制
 * 
 * @returns {string | null} 第一个有效的标注，如果全部无效返回 null
 * 
 * @example
 * const label = getFirstValidLabel([
 *   feature.properties.name,
 *   feature.properties.title,
 *   feature.properties.description
 * ]);
 */
export function getFirstValidLabel(
    candidates: (string | null | undefined)[],
    maxLength: number = 100
): string | null {
    for (const candidate of candidates) {
        if (isLabelValid(candidate, maxLength)) {
            return String(candidate).trim();
        }
    }
    return null;
}
