export type KmlParsed = {
    kind: 'kml';
    content: string;
};

/**
 * 解析 KML Buffer，支持多种编码
 * 优先级：UTF-8 > UTF-16LE > UTF-16BE > GBK
 */
export function parseKmlBuffer(buffer: ArrayBuffer): KmlParsed {
    if (!(buffer instanceof ArrayBuffer)) {
        return { kind: 'kml', content: '' };
    }
    
    // 尝试多种编码，选择替代字符最少的那个
    const candidates: Array<{ encoding: string; text: string; invalidCount: number }> = [];
    const encodings = ['utf-8', 'utf-16le', 'utf-16be', 'gbk'];
    
    for (const encoding of encodings) {
        try {
            const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
            const invalidCount = (text.match(/\uFFFD/g) || []).length;
            candidates.push({ encoding, text, invalidCount });
        } catch (err) {
            continue;
        }
    }
    
    if (!candidates.length) {
        console.warn('[kmlParser] 所有编码尝试均失败，返回空内容');
        return { kind: 'kml', content: '' };
    }
    
    // 按替代字符数量排序，选择最少的那个
    candidates.sort((a, b) => a.invalidCount - b.invalidCount);
    const best = candidates[0];
    
    if (best.invalidCount > 0) {
        console.warn(
            `[kmlParser] 使用编码 ${best.encoding}，包含 ${best.invalidCount} 个替代字符`
        );
    }
    
    return {
        kind: 'kml',
        content: best.text,
    };
}
