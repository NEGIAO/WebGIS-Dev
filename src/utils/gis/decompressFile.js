function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function getExtension(path) {
    const normalized = normalizePath(path).toLowerCase();
    const idx = normalized.lastIndexOf('.');
    if (idx < 0 || idx === normalized.length - 1) return '';
    return normalized.slice(idx + 1);
}

function detectMagicTypeFromBytes(bytes) {
    if (!bytes?.length) return 'unknown';

    if (bytes.length >= 4) {
        const b0 = bytes[0];
        const b1 = bytes[1];
        const b2 = bytes[2];
        const b3 = bytes[3];

        if (b0 === 0x50 && b1 === 0x4b && (
            (b2 === 0x03 && b3 === 0x04)
            || (b2 === 0x05 && b3 === 0x06)
            || (b2 === 0x07 && b3 === 0x08)
        )) {
            return 'zip';
        }

        if ((b0 === 0x49 && b1 === 0x49 && b2 === 0x2a && b3 === 0x00)
            || (b0 === 0x4d && b1 === 0x4d && b2 === 0x00 && b3 === 0x2a)) {
            return 'tiff';
        }
    }

    const textHead = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const head = textHead.trimStart();
    if (head.startsWith('{') || head.startsWith('[')) return 'json';
    if (head.startsWith('<')) return 'xml';

    return 'unknown';
}

async function toArrayBuffer(input) {
    if (input instanceof ArrayBuffer) return input;

    if (typeof input === 'string') {
        const response = await fetch(input);
        if (!response.ok) {
            throw new Error(`下载文件失败: ${response.status} ${response.statusText}`);
        }
        return response.arrayBuffer();
    }

    if (input instanceof Blob) {
        return input.arrayBuffer();
    }

    throw new Error('decompressBuffer 输入类型不支持，请传入 File/Blob/URL/ArrayBuffer');
}

export function detectMagicType(buffer) {
    if (!(buffer instanceof ArrayBuffer)) return 'unknown';
    const bytes = new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength));
    return detectMagicTypeFromBytes(bytes);
}

export async function decompressBuffer(input) {
    const rawBuffer = await toArrayBuffer(input);
    const topMagicType = detectMagicType(rawBuffer);

    if (topMagicType !== 'zip') {
        throw new Error('压缩包校验失败：文件头不是 ZIP/KMZ');
    }

    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(new Uint8Array(rawBuffer));

    const entries = [];
    for (const zipEntry of Object.values(zip.files)) {
        if (zipEntry.dir) continue;

        const path = normalizePath(zipEntry.name);
        const extension = getExtension(path);
        const buffer = await zipEntry.async('arraybuffer');
        const magicType = detectMagicType(buffer);

        entries.push({
            name: zipEntry.name,
            path,
            extension,
            magicType,
            buffer,
            size: buffer.byteLength
        });
    }

    if (!entries.length) {
        throw new Error('空压缩包：未检测到任何文件');
    }

    const fileEntryMap = new Map(entries.map((item) => [item.path, item]));

    return {
        topMagicType,
        entries,
        fileEntryMap,
        hasNestedPath: entries.some((item) => item.path.includes('/')),
        findByExtension(ext) {
            const normalizedExt = String(ext || '').toLowerCase().replace(/^\./, '');
            return entries.filter((item) => item.extension === normalizedExt);
        }
    };
}

export const decompressFile = decompressBuffer;
