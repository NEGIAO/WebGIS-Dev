/**
 * 文本解码工具 — 统一模块
 *
 * 合并自 archiveProcessor.js、vectorUtils.js、crsAware.js 中的
 * 重复 Buffer 解码函数。
 *
 * 支持多种编码自动检测：UTF-8、UTF-16LE、UTF-16BE、GBK，
 * 通过比较替换字符（U+FFFD）数量选择最佳解码结果。
 *
 * @module textDecoder
 */

/**
 * 解码 ArrayBuffer 或 string 为文本
 * - string 输入直接返回
 * - ArrayBuffer 输入尝试多种编码，选择替换字符最少的结果
 *
 * @param {string|ArrayBuffer} content - 待解码内容
 * @param {object} [options] - 配置项
 * @param {string} [options.label='textDecoder'] - 日志标签
 * @returns {string} 解码后的文本
 */
export function decodeTextContent(content, options = {}) {
    const { label = 'textDecoder' } = options;

    // string 直接返回
    if (typeof content === 'string') return content;

    if (!(content instanceof ArrayBuffer)) {
        return String(content || '');
    }

    const candidates = [];
    const encodings = ['utf-8', 'utf-16le', 'utf-16be', 'gbk'];

    for (const encoding of encodings) {
        try {
            const text = new TextDecoder(encoding, { fatal: false }).decode(content);
            const invalidCount = (text.match(/�/g) || []).length;
            candidates.push({ encoding, text, invalidCount });
        } catch {
            continue;
        }
    }

    if (!candidates.length) {
        console.warn(`[${label}] 所有编码尝试均失败，使用 UTF-8 降级`);
        return new TextDecoder('utf-8', { fatal: false }).decode(content);
    }

    candidates.sort((a, b) => a.invalidCount - b.invalidCount);
    const best = candidates[0];

    if (best.invalidCount > 0) {
        console.warn(
            `[${label}] 使用编码 ${best.encoding}，包含 ${best.invalidCount} 个替代字符`,
            `候选: ${candidates.map((c) => `${c.encoding}(${c.invalidCount})`).join(', ')}`,
        );
    }

    return best.text;
}

/**
 * 简化版 Buffer 解码（仅尝试 UTF-8 和 GBK）
 * 适用于对性能要求较高、编码种类有限的场景
 *
 * @param {ArrayBuffer} buffer - 待解码的 ArrayBuffer
 * @returns {string} 解码后的文本
 */
export function decodeBufferSimple(buffer) {
    if (!(buffer instanceof ArrayBuffer)) return '';

    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (!utf8.includes('�')) return utf8;

    try {
        return new TextDecoder('gbk', { fatal: false }).decode(buffer);
    } catch {
        return utf8;
    }
}
