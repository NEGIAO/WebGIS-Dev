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
 * - ArrayBuffer 输入尝试多种编码，选择最合理的解码结果
 *
 * 编码判定策略（V3.5.25 加固，修复 GBK 误判为 UTF-16 的缺陷）：
 * 1. BOM 权威判定：EF BB BF → UTF-8；FF FE → UTF-16LE；FE FF → UTF-16BE；
 * 2. 无 BOM 时按打分挑选：替换字符（U+FFFD）重罚；C0 控制字符（XML 合法集外的）
 *    计罚分；UTF-16 候选须有字节级 0x00 支撑——真 UTF-16 的 ASCII 标记在原始
 *    字节中必然产生 0x00（LE 在奇位、BE 在偶位），否则视为单字节编码误读重罚排除。
 *    此前任意字节流按 UTF-16 解码都不会产生替换字符，导致 GBK 文本被误判为
 *    UTF-16LE 而乱码。
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

    const bytes = new Uint8Array(content);

    // BOM 权威判定
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return new TextDecoder('utf-8').decode(content);
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(content);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(content);
    }

    // 字节级 0x00 分布分析（真 UTF-16 的 ASCII 标记必然在原始字节中产生 0x00，
    // 且 LE 的 0x00 位于奇位、BE 位于偶位——用于无 BOM 时判定/区分 LE 与 BE）
    let nulBytes = 0;
    let evenNul = 0;
    let oddNul = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0x00) {
            nulBytes++;
            if (i % 2 === 0) evenNul++;
            else oddNul++;
        }
    }
    const byteNullRatio = bytes.length ? nulBytes / bytes.length : 0;

    const candidates = [];
    const encodings = ['utf-8', 'utf-16le', 'utf-16be', 'gbk'];

    for (const encoding of encodings) {
        try {
            const text = new TextDecoder(encoding, { fatal: false }).decode(content);
            let invalidCount = 0;
            let nulCount = 0;
            let ctrlCount = 0;
            for (let i = 0; i < text.length; i++) {
                const code = text.charCodeAt(i);
                if (code === 0xfffd) {
                    invalidCount++;
                } else if (code === 0x0000) {
                    nulCount++;
                } else if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
                    ctrlCount++;
                }
            }

            let score = invalidCount * 10000 + ctrlCount * 100 + nulCount;
            const isUtf16 = encoding === 'utf-16le' || encoding === 'utf-16be';
            if (isUtf16) {
                // 原始字节几乎无 0x00 → UTF-16 候选实为单字节编码的误读，重罚排除
                if (byteNullRatio < 0.01) score += 1000;
                // 0x00 位置与字节序冲突 → 判错端序，轻罚（LE 数据 0x00 在奇位）
                if (encoding === 'utf-16le' && evenNul > oddNul) score += 50;
                if (encoding === 'utf-16be' && oddNul > evenNul) score += 50;
            }

            candidates.push({ encoding, text, invalidCount, score });
        } catch {
            continue;
        }
    }

    if (!candidates.length) {
        console.warn(`[${label}] 所有编码尝试均失败，使用 UTF-8 降级`);
        return new TextDecoder('utf-8', { fatal: false }).decode(content);
    }

    candidates.sort((a, b) => a.score - b.score);
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
