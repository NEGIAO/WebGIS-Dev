/**
 * tilesetLoader.js
 * 3D Tiles 数据集加载器
 *
 * 支持：本地 file:// 路径、ZIP 压缩包、浏览器目录选择器（File System Access API）。
 * 核心思路：将所有文件映射为 blob URL → 改写 tileset.json 内部 content.url →
 * Cesium3DTileset.fromUrl() 加载。
 *
 * 地形自适应（贴地 2.0）：遍历瓦片树收集「叶子包围盒基底采样」（region/box/sphere
 * 全支持，含 transform 链），与地形逐点配对后取中位数偏移做配准——对松垮的根包围盒、
 * 坡地、个别坏瓦片均鲁棒。无地形时底部落到椭球 0；采样留存于 record，
 * 地形开启/切换时由 refitTilesetToTerrain 自动重贴（见 useCesiumDataImport 的监听）。
 * 解析/采样失败时保持原位并提示手动滑杆，不做全局性副作用（不关地形）。
 */

import { flyToEntity } from './utils';

/** @type {string} tileset.json 文件名标识 */
export const TILESET_JSON_INDICATOR = 'tileset.json';

import { getTileLevel, readDirRecursive, rewriteTilesetContentUrls } from './tileset/tilesetPath';
import { fitTilesetToTerrain } from './tileset/tilesetTerrainFit';
import { applyTilesetMaterial } from './tileset/tilesetMaterial';

// 对外契约再导出（useCesiumDataImport / tilesetGroundStrategy / useCesiumLayers 依赖）
export { fitTilesetToTerrain, refitTilesetToTerrain } from './tileset/tilesetTerrainFit';
export { MATERIAL_MODES, applyTilesetMaterial } from './tileset/tilesetMaterial';
export {
    loadSampleTileset,
    loadSampleBaimoTileset,
    loadSampleIonTileset,
    loadSampleI3sTileset,
    loadSampleDiscreteLODTileset,
} from './tileset/tilesetSampleLoaders';

// ============================================================
// 导出加载函数
// ============================================================

export interface TilesetLoaderBaseOptions {
    getCesium: () => any;
    getViewer: () => any;
    message: {
        success: (msg: string) => any;
        warning: (msg: string) => any;
        error: (msg: string) => any;
    };
    loadedDataSources: { value: any[] };
    nextId: { current: number };
}

export async function loadTilesetFromFileMap({
    fileMap,
    sourceName,
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions & { fileMap: Record<string, Blob>; sourceName: string }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const blobUrlMap: Record<string, string> = {};
    const allBlobUrls: string[] = [];
    for (const [relPath, blob] of Object.entries(fileMap)) {
        const normalized = relPath.replace(/\\/g, '/');
        const url = URL.createObjectURL(blob as Blob);
        blobUrlMap[normalized] = url;
        allBlobUrls.push(url);
    }

    const allPaths = Object.keys(blobUrlMap);
    console.warn('[3DTiles][import] 文件总数:', allPaths.length,
        '| tileset.json:', allPaths.filter(p => p.includes('tileset.json')).length,
        '| b3dm:', allPaths.filter(p => p.endsWith('.b3dm')).length);

    const tilesetPaths = allPaths.filter((p) => {
        if (p.endsWith('tileset.json')) return true;
        if (!p.endsWith('.json')) return false;
        return !!fileMap[p];
    });

    tilesetPaths.sort((a, b) => {
        const aIsRoot = a === 'tileset.json' || a.endsWith('/tileset.json');
        const bIsRoot = b === 'tileset.json' || b.endsWith('/tileset.json');
        if (aIsRoot !== bIsRoot) return aIsRoot ? 1 : -1;
        return getTileLevel(b) - getTileLevel(a);
    });

    console.warn('[3DTiles][import] 找到候选 tileset（已按层级排序）:', tilesetPaths);

    const parsedTilesetJson: Record<string, any> = {};
    for (const tsPath of tilesetPaths) {
        const rawKey = Object.keys(fileMap).find(
            (k) => k.replace(/\\/g, '/') === tsPath,
        ) || tsPath;
        const blob = fileMap[rawKey];
        let text: string;
        try { text = await blob.text(); } catch { continue; }

        let json: any;
        try { json = JSON.parse(text); } catch { continue; }

        if (!json.root) continue;
        parsedTilesetJson[tsPath] = json;

        const tsDir = tsPath.substring(0, tsPath.lastIndexOf('/') + 1);
        rewriteTilesetContentUrls(json.root, tsDir, blobUrlMap);

        const newBlob = new Blob([JSON.stringify(json)], { type: 'application/json' });
        const newUrl = URL.createObjectURL(newBlob);
        blobUrlMap[tsPath] = newUrl;
        allBlobUrls.push(newUrl);
        console.warn('[3DTiles][import] 已处理:', tsPath, '→ blob URL 已更新');
    }

    const rootTsPath =
        tilesetPaths.find((p) => p === 'tileset.json' || p.endsWith('/tileset.json'))
        || tilesetPaths[0];

    if (!rootTsPath) throw new Error('未找到 tileset.json，请确认 ZIP 或目录包含有效的 3D Tiles 数据集');

    const tilesetUrl = blobUrlMap[rootTsPath];
    const rootJson = parsedTilesetJson[rootTsPath] || null;
    console.warn('[3DTiles][import] 根 tileset 路径:', rootTsPath, '→ 最终 URL:', tilesetUrl);

    const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl);
    console.warn('[3DTiles][import] Cesium3DTileset.fromUrl 完成，boundingSphere:', tileset.boundingSphere);

    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, rootJson, rootJsonUrl: tilesetUrl, message,
    });

    const id = `tileset_${++nextId.current}`;
    viewer.scene.primitives.add(tileset);
    applyTilesetMaterial(tileset, 'baimo', Cesium);

    const record = {
        id,
        name: sourceName,
        type: '3dtiles',
        entity: tileset,
        blobUrls: allBlobUrls,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'baimo',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    flyToEntity(viewer, Cesium, tileset, '3dtiles');
    message.success(`3D Tiles "${sourceName}" 加载成功 (${allPaths.length} 个文件)`);
    return record;
}

/**
 * 加载 tileset.json 文件
 */
export async function loadTilesetJSON({
    file,
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions & { file: File & { path?: string } }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const filePath = file.path || '';
    const hasLocalPath = /^[a-zA-Z]:\\/.test(filePath) || filePath.startsWith('/');

    if (hasLocalPath) {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const tilesetUrl = normalizedPath.startsWith('/')
            ? `file://${normalizedPath}`
            : `file:///${normalizedPath}`;

        const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl);

        const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
            tileset, viewer, Cesium, rootJsonUrl: tilesetUrl, message,
        });

        const id = `tileset_${++nextId.current}`;
        viewer.scene.primitives.add(tileset);
        applyTilesetMaterial(tileset, 'baimo', Cesium);

        const record = {
            id,
            name: file.name,
            type: '3dtiles',
            entity: tileset,
            terrainElevation,
            tilesetGeo,
            currentBaseHeight,
            fitResidual,
            terrainFitSamples: baseSamples,
            materialMode: 'baimo',
        };
        loadedDataSources.value = [...loadedDataSources.value, record];

        flyToEntity(viewer, Cesium, tileset, '3dtiles');
        message.success(`3D Tiles "${file.name}" 加载成功`);
        return record;
    }

    message.warning('浏览器安全策略限制，直接拖入 tileset.json 无法加载子瓦片。即将打开目录选择器，请选择包含 tileset.json 的文件夹。');

    const result = await importTilesetFromDirectory({ getCesium, getViewer, message, loadedDataSources, nextId });
    if (!result) {
        throw new Error('用户取消了目录选择，3D Tiles 导入中止');
    }
    return result;
}

/**
 * 从 ZIP 文件中加载 3D Tiles
 */
export async function loadTilesetFromZip({
    zipFile,
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions & { zipFile: File }) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(zipFile);

    const fileMap: Record<string, Blob> = {};
    const entries: string[] = [];
    zip.forEach((relPath, entry) => {
        if (!entry.dir) entries.push(relPath);
    });

    for (const relPath of entries) {
        const zipEntry = zip.file(relPath);
        if (!zipEntry) continue;
        const blob = await zipEntry.async('blob');
        fileMap[relPath] = blob;
    }

    return await loadTilesetFromFileMap({
        fileMap,
        sourceName: zipFile.name || '3D Tiles',
        getCesium, getViewer, message, loadedDataSources, nextId,
    });
}

// ============================================================
// 内部：目录选择器
// ============================================================

function importTilesetFromDirectoryFallback({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        (input as any).directory = true;
        input.multiple = true;
        input.style.display = 'none';
        document.body.appendChild(input);

        function cleanup() {
            if (input.parentNode) {
                document.body.removeChild(input);
            }
        }

        input.onchange = async () => {
            const files = Array.from(input.files || []);
            cleanup();

            if (files.length === 0) {
                resolve(null);
                return;
            }

            const firstPath = files[0].webkitRelativePath || files[0].name;
            const dirName = firstPath.split('/')[0] || '3D Tiles';

            const fileMap: Record<string, Blob> = {};
            for (const file of files) {
                const relPath = file.webkitRelativePath || file.name;
                const innerPath = relPath.includes('/')
                    ? relPath.substring(relPath.indexOf('/') + 1)
                    : relPath;
                fileMap[innerPath] = file;
            }

            try {
                const result = await loadTilesetFromFileMap({
                    fileMap,
                    sourceName: dirName,
                    getCesium, getViewer, message, loadedDataSources, nextId,
                });
                resolve(result);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                message.error(`导入 3D Tiles 目录失败: ${msg}`);
                reject(error);
            }
        };

        const onFocus = () => {
            window.removeEventListener('focus', onFocus);
            setTimeout(() => {
                if (!input.files || input.files.length === 0) {
                    cleanup();
                    resolve(null);
                }
            }, 300);
        };
        window.addEventListener('focus', onFocus);

        input.click();
    });
}

async function importTilesetFromDirectoryNative({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
    const fileMap: Record<string, Blob> = {};
    try {
        await readDirRecursive(dirHandle, '', fileMap);
    } catch (dirError) {
        const collected = Object.keys(fileMap).length;
        if (collected === 0) {
            throw dirError;
        }
        console.warn(`[3DTiles][import] 目录遍历中断，已收集 ${collected} 个文件，继续加载`);
    }
    const totalFiles = Object.keys(fileMap).length;
    if (totalFiles === 0) {
        throw new Error('未能读取目录中的任何文件，请确认目录非空且包含 tileset.json');
    }
    console.warn(`[3DTiles][import] 目录读取完成: ${totalFiles} 个文件`);
    return await loadTilesetFromFileMap({
        fileMap,
        sourceName: dirHandle.name,
        getCesium, getViewer, message, loadedDataSources, nextId,
    });
}

export async function importTilesetFromDirectory({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    try {
        if (typeof (window as any).showDirectoryPicker === 'function') {
            return await importTilesetFromDirectoryNative({ getCesium, getViewer, message, loadedDataSources, nextId });
        }
        return await importTilesetFromDirectoryFallback({ getCesium, getViewer, message, loadedDataSources, nextId });
    } catch (error) {
        const errObj = error && typeof error === 'object' ? (error as { name?: unknown; message?: unknown }) : null;
        const errName = typeof errObj?.name === 'string' ? errObj.name : '';
        if (errName === 'AbortError' || errName === 'SecurityError') {
            return null;
        }
        if (errName === 'NotFoundError') {
            console.warn('[3DTiles][import] File System Access API 句柄过期，部分文件可能未加载');
            return null;
        }
        const errMsg = typeof errObj?.message === 'string' ? errObj.message : String(error);
        message.error(`导入 3D Tiles 目录失败: ${errMsg}`);
        throw error;
    }
}
