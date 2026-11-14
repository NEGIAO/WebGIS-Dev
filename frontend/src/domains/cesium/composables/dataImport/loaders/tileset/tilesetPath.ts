/**
 * 功能名称：3D Tiles 路径与目录递归工具
 * 日    期：2026/11/13
 *
 * 从 tilesetLoader 拆出：tileset.json 相对路径解析、内容 URL 重写（Blob 映射）、
 * 瓦片层级推断与 FileSystemDirectoryHandle 递归读取。
 */

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 在 tileset 目录上下文中解析相对路径
 */
export function resolveTilesetPath(baseDir: string, relativeUrl: string): string {
    const path = String(relativeUrl || '').replace(/\\/g, '/');
    if (/^(blob|file|https?):/i.test(path)) return path;
    if (path.startsWith('/')) return path.slice(1);
    const combined = baseDir + path;
    const parts = combined.split('/');
    const result: string[] = [];
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') { result.pop(); continue; }
        result.push(part);
    }
    return result.join('/');
}

/**
 * 递归遍历 tileset JSON 树节点，将所有 content.url / content.uri 替换为 blob URL
 */
export function rewriteTilesetContentUrls(
    node: any,
    baseDir: string,
    blobUrlMap: Record<string, string>,
): void {
    if (!node || typeof node !== 'object') return;

    function rewriteItem(contentItem: any) {
        if (!contentItem || typeof contentItem !== 'object') return;
        for (const key of ['url', 'uri']) {
            const val = contentItem[key];
            if (typeof val !== 'string') continue;
            if (/^(blob|file|https?|data):/i.test(val)) continue;
            const resolved = resolveTilesetPath(baseDir, val);
            if (blobUrlMap[resolved]) {
                contentItem[key] = blobUrlMap[resolved];
            } else {
                console.warn(
                    '[3DTiles][rewrite] 未解析到对应的文件:',
                    val, '→ 已解析为:', resolved,
                    '(可用路径:', Object.keys(blobUrlMap).slice(0, 8), '...)',
                );
            }
        }
    }

    const content = node.content;
    if (content) {
        if (Array.isArray(content)) {
            for (const item of content) rewriteItem(item);
        } else {
            rewriteItem(content);
        }
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            rewriteTilesetContentUrls(child, baseDir, blobUrlMap);
        }
    }

    if (node.extensions && typeof node.extensions === 'object') {
        for (const extVal of Object.values(node.extensions)) {
            if (extVal && typeof extVal === 'object') rewriteItem(extVal);
        }
    }
}

/**
 * 从文件路径中提取瓦片层级（用于排序）
 */
export function getTileLevel(path: string): number {
    const name = path.split('/').pop() || '';
    const m = name.match(/^(\d+)_\d+_\d+\.json$/);
    return m ? parseInt(m[1], 10) : -1;
}

/**
 * 递归读取目录句柄下的所有文件，构建相对路径→File 映射
 */
export async function readDirRecursive(
    dirHandle: any,
    currentPath: string,
    fileMap: Record<string, Blob>,
): Promise<void> {
    try {
        for await (const [name, handle] of dirHandle.entries()) {
            const relPath = currentPath ? `${currentPath}/${name}` : name;
            try {
                if (handle.kind === 'file') {
                    const file = await handle.getFile();
                    fileMap[relPath] = file;
                } else if (handle.kind === 'directory') {
                    await readDirRecursive(handle, relPath, fileMap);
                }
            } catch (itemError) {
                // 单个文件/目录访问失败（句柄过期、权限丢失等），跳过并记录
                const msg = itemError instanceof Error ? itemError.message : itemError;
                console.warn(`[3DTiles][readDir] 跳过 "${relPath}": ${msg}`);
            }
        }
    } catch (dirError) {
        // 目录迭代器本身失败（目录句柄过期等）
        const msg = dirError instanceof Error ? dirError.message : dirError;
        console.warn(`[3DTiles][readDir] 目录迭代失败 "${currentPath || '(root)'}"：${msg}`);
        throw dirError;
    }
}
