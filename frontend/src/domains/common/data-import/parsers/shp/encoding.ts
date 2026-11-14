/**
 * SHP 头部校验与文本编码探测（.shp 签名 / .cpg / GBK 回退）
 * 日    期：2026/11/13
 */

const SUPPORTED_SHP_TYPES = new Set([0, 1, 3, 5, 8, 11, 13, 15, 18, 21, 23, 25, 28]);
const SHP_TYPE_NAMES: Record<number, string> = {
    0: 'Null Shape',
    1: 'Point',
    3: 'Polyline',
    5: 'Polygon',
    8: 'MultiPoint',
    11: 'PointZ',
    13: 'PolylineZ',
    15: 'PolygonZ',
    18: 'MultiPointZ',
    21: 'PointM',
    23: 'PolylineM',
    25: 'PolygonM',
    28: 'MultiPointM',
};
export function decodeMaybeText(buffer?: ArrayBuffer): string {
    if (!(buffer instanceof ArrayBuffer)) return '';
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (!utf8.includes('\uFFFD')) return utf8;
    try {
        return new TextDecoder('gbk', { fatal: false }).decode(buffer);
    } catch {
        return utf8;
    }
}
export function inspectShpHeader(shpBuffer: ArrayBuffer): {
    shapeType: number;
    version: number;
    declaredByteLength: number;
} {
    if (!(shpBuffer instanceof ArrayBuffer) || shpBuffer.byteLength < 100) {
        throw new Error('无效的 .shp 文件：头部长度不足（< 100 bytes）');
    }

    const view = new DataView(shpBuffer);
    const signature = view.getInt32(0, false);
    if (signature !== 9994) {
        throw new Error(`无效的 .shp 文件：文件签名异常（${signature}）`);
    }

    const declaredByteLength = view.getInt32(24, false) * 2;
    const version = view.getInt32(28, true);
    const shapeType = view.getInt32(32, true);

    if (!SUPPORTED_SHP_TYPES.has(shapeType)) {
        const shapeTypeName = SHP_TYPE_NAMES[shapeType] || 'Unknown';
        throw new Error(`暂不支持的 SHP 几何类型：${shapeType} (${shapeTypeName})`);
    }

    return {
        shapeType,
        version,
        declaredByteLength,
    };
}
function normalizeEncodingName(raw = ''): string {
    const text = String(raw || '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
    if (!text) return '';
    return text.toUpperCase().replace(/[^A-Z0-9_-]+/g, '');
}
export function detectDbfEncodingHint(cpgText = '', dbfBuffer?: ArrayBuffer): string {
    const normalizedCpg = normalizeEncodingName(cpgText);
    if (normalizedCpg) return normalizedCpg;
    if (!(dbfBuffer instanceof ArrayBuffer) || dbfBuffer.byteLength < 32) return '';

    const ldid = new DataView(dbfBuffer).getUint8(29);
    const map: Record<number, string> = {
        0x03: 'CP1252',
        0x4d: 'CP936',
        0x4f: 'CP950',
        0x57: 'CP1252',
        0x78: 'CP950',
        0x7a: 'CP936',
    };
    return map[ldid] || '';
}
export async function toArrayBuffer(input?: ArrayBuffer | Blob): Promise<ArrayBuffer | undefined> {
    if (!input) return undefined;
    if (input instanceof ArrayBuffer) return input;
    if (input instanceof Blob && typeof (input as any).arrayBuffer === 'function') {
        try {
            return await (input as any).arrayBuffer();
        } catch (err) {
            console.warn('[SHP] Blob 转换为 ArrayBuffer 失败:', err);
            return undefined;
        }
    }
    return undefined;
}
