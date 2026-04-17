import { loadJsZip } from './loadJsZip';

export type FlattenedResource = {
    path: string;
    ext: string;
    content: ArrayBuffer;
};

function isArrayBufferLike(input: unknown): input is ArrayBuffer {
    return !!input && typeof input === 'object' && (input as ArrayBuffer).byteLength !== undefined;
}

function normalizePath(path = ''): string {
    return String(path || '').replace(/\\/g, '/').replace(/^\.?\//, '').trim();
}

function extOf(path: string): string {
    const normalized = normalizePath(path).toLowerCase();
    const idx = normalized.lastIndexOf('.');
    if (idx < 0 || idx === normalized.length - 1) return '';
    return normalized.slice(idx + 1);
}

function isArchive(ext: string): boolean {
    const normalized = String(ext || '').toLowerCase();
    return normalized === 'zip' || normalized === 'kmz';
}

async function readAsArrayBuffer(file: any): Promise<ArrayBuffer> {
    if (typeof file.arrayBuffer === 'function') {
        return file.arrayBuffer();
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result || new ArrayBuffer(0)) as ArrayBuffer);
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
    });
}

function isEntryLike(input: unknown): input is any {
    return !!input && typeof input === 'object' && ('isFile' in (input as Record<string, unknown>) || 'isDirectory' in (input as Record<string, unknown>));
}

function isBlobLike(input: unknown): input is any {
    return !!input && typeof input === 'object' && typeof (input as any).arrayBuffer === 'function';
}

async function readEntryFile(entry: any): Promise<File> {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryChildren(entry: any): Promise<any[]> {
    const reader = entry.createReader();
    const all: any[] = [];

    const readBatch = (): Promise<void> => new Promise((resolve, reject) => {
        reader.readEntries((entries: any[]) => {
            if (!entries || !entries.length) {
                resolve();
                return;
            }
            all.push(...entries);
            readBatch().then(resolve).catch(reject);
        }, reject);
    });

    await readBatch();
    return all;
}

async function flattenArchive(buffer: ArrayBuffer, basePath: string, archiveExt = 'zip'): Promise<FlattenedResource[]> {
    const JSZip = await loadJsZip();
    const zip = await JSZip.loadAsync(buffer);
    const output: FlattenedResource[] = [];
    const usedPaths = new Set<string>();

    function ensureUniquePath(path: string): string {
        const normalized = normalizePath(path);
        if (!usedPaths.has(normalized)) {
            usedPaths.add(normalized);
            return normalized;
        }

        const ext = extOf(normalized);
        const stem = ext ? normalized.slice(0, -(ext.length + 1)) : normalized;
        let suffix = 2;
        let candidate = `${stem}__${suffix}${ext ? `.${ext}` : ''}`;
        while (usedPaths.has(candidate)) {
            suffix += 1;
            candidate = `${stem}__${suffix}${ext ? `.${ext}` : ''}`;
        }
        usedPaths.add(candidate);
        return candidate;
    }

    const entries = Object.values(zip.files).filter((item) => !item.dir);
    for (const entry of entries) {
        const entryPath = normalizePath(entry.name);
        const entryExt = extOf(entryPath);
        const entryBuffer = await entry.async('arraybuffer');

        // KMZ 的主 KML 常见文件名为 doc.kml。这里将其映射为“容器基名.kml”，
        // 确保后续 TOC 图层名保持为原始 KMZ 文件名，而不是 doc/乱码名。
        const preferredPath = (String(archiveExt).toLowerCase() === 'kmz' && entryExt === 'kml')
            ? normalizePath(`${basePath}.kml`)
            : normalizePath(basePath ? `${basePath}/${entryPath}` : entryPath);
        const innerPath = ensureUniquePath(preferredPath);
        const ext = extOf(innerPath);

        if (isArchive(ext)) {
            const nestedBase = innerPath.replace(/\.[^/.]+$/, '');
            const nested = await flattenArchive(entryBuffer, nestedBase, ext);
            output.push(...nested);
            continue;
        }

        output.push({ path: innerPath, ext, content: entryBuffer });
    }

    return output;
}

async function flattenFile(file: any, preferredPath = ''): Promise<FlattenedResource[]> {
    const path = normalizePath(preferredPath || (file as any).webkitRelativePath || (file as any).name || 'unknown');
    const ext = extOf(path);
    const buffer = await readAsArrayBuffer(file);

    if (isArchive(ext)) {
        const basePath = path.replace(/\.[^/.]+$/, '');
        return flattenArchive(buffer, basePath, ext);
    }

    return [{ path, ext, content: buffer }];
}

async function flattenEntry(entry: any, basePath = ''): Promise<FlattenedResource[]> {
    if (!entry) return [];

    if (entry.isFile) {
        const file = await readEntryFile(entry);
        const path = normalizePath(basePath ? `${basePath}/${file.name}` : (entry.fullPath || file.webkitRelativePath || file.name));
        return flattenFile(file, path);
    }

    if (entry.isDirectory) {
        const nextBase = normalizePath(basePath ? `${basePath}/${entry.name}` : entry.name);
        const children = await readDirectoryChildren(entry);
        const output: FlattenedResource[] = [];

        for (const child of children) {
            const nested = await flattenEntry(child, nextBase);
            output.push(...nested);
        }

        return output;
    }

    return [];
}

export async function flattenResources(resources: any[]): Promise<FlattenedResource[]> {
    const output: FlattenedResource[] = [];

    for (const resource of resources || []) {
        if (!resource) continue;

        if (isEntryLike(resource)) {
            const flattened = await flattenEntry(resource, '');
            output.push(...flattened);
            continue;
        }

        if (isBlobLike(resource)) {
            const flattened = await flattenFile(resource, (resource as any).webkitRelativePath || (resource as any).name || 'unknown');
            output.push(...flattened);
        }
    }

    return output;
}

export async function flattenUploadInput(input: {
    resources?: any[];
    content?: unknown;
    name?: string;
}): Promise<FlattenedResource[]> {
    if (Array.isArray(input?.resources) && input.resources.length) {
        return flattenResources(input.resources);
    }

    if (isEntryLike(input?.content)) {
        return flattenResources([input.content as any]);
    }

    if (isBlobLike(input?.content)) {
        return flattenResources([input.content]);
    }

    if (isArrayBufferLike(input?.content)) {
        const path = normalizePath(input?.name || 'upload.bin');
        return [{ path, ext: extOf(path), content: input.content }];
    }

    if (typeof input?.content === 'string') {
        const encoded = new TextEncoder().encode(input.content);
        const path = normalizePath(input?.name || 'upload.txt');
        return [{ path, ext: extOf(path), content: encoded.buffer }];
    }

    return [];
}
