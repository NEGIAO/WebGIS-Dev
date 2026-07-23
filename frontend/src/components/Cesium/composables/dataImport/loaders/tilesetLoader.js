/**
 * tilesetLoader.js
 * 3D Tiles 数据集加载器
 *
 * 支持：本地 file:// 路径、ZIP 压缩包、浏览器目录选择器（File System Access API）。
 * 核心思路：将所有文件映射为 blob URL → 改写 tileset.json 内部 content.url →
 * Cesium3DTileset.fromUrl() 加载。
 */

import { flyToEntity, calcTerrainOffset } from './utils.js';

/** @type {string} tileset.json 文件名标识 */
export const TILESET_JSON_INDICATOR = 'tileset.json';

// ---- 内部工具函数 ----

/**
 * 在 tileset 目录上下文中解析相对路径
 */
function resolveTilesetPath(baseDir, relativeUrl) {
    const path = String(relativeUrl || '').replace(/\\/g, '/');
    if (/^(blob|file|https?):/i.test(path)) return path;
    if (path.startsWith('/')) return path.slice(1);
    const combined = baseDir + path;
    const parts = combined.split('/');
    const result = [];
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
function rewriteTilesetContentUrls(node, baseDir, blobUrlMap) {
    if (!node || typeof node !== 'object') return;

    function rewriteItem(contentItem) {
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
function getTileLevel(path) {
    const name = path.split('/').pop();
    const m = name.match(/^(\d+)_\d+_\d+\.json$/);
    return m ? parseInt(m[1], 10) : -1;
}

/**
 * 递归读取目录句柄下的所有文件，构建相对路径→File 映射
 */
async function readDirRecursive(dirHandle, currentPath, fileMap) {
    for await (const [name, handle] of dirHandle.entries()) {
        const relPath = currentPath ? `${currentPath}/${name}` : name;
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            fileMap[relPath] = file;
        } else if (handle.kind === 'directory') {
            await readDirRecursive(handle, relPath, fileMap);
        }
    }
}

/**
 * 自动将 tileset 抬升到地形表面上方
 *
 * 通过统一的 calcTerrainOffset 异步采样地形高度，
 * 如果 tileset 低于地表则通过 modelMatrix 整体抬升。
 */
async function adjustTilesetToTerrain(tileset, viewer, Cesium) {
    const center = tileset.boundingSphere.center;
    const carto = Cesium.Cartographic.fromCartesian(center);
    const lng = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);

    const offset = await calcTerrainOffset({
        lng, lat,
        currentHeight: carto.height,
        viewer, Cesium,
    });
    if (offset === null) return;

    const origin = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0);
    const raised = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, offset);
    const translation = Cesium.Cartesian3.subtract(raised, origin, new Cesium.Cartesian3());
    tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
}

// ---- 导出加载函数 ----

/**
 * 从 文件路径→blob 映射中加载 3D Tiles
 *
 * @param {Object} ctx
 * @param {Object<string, Blob>} ctx.fileMap - { 相对路径: Blob }
 * @param {string} ctx.sourceName - 显示名称
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 */
export async function loadTilesetFromFileMap({ fileMap, sourceName, getCesium, getViewer, message, loadedDataSources, nextId }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    // Step 1: 将所有文件创建为 blob URL
    const blobUrlMap = {};
    const allBlobUrls = [];
    for (const [relPath, blob] of Object.entries(fileMap)) {
        const normalized = relPath.replace(/\\/g, '/');
        const url = URL.createObjectURL(blob);
        blobUrlMap[normalized] = url;
        allBlobUrls.push(url);
    }

    const allPaths = Object.keys(blobUrlMap);
    console.warn('[3DTiles][import] 文件总数:', allPaths.length, '路径示例:', allPaths.slice(0, 5));

    // Step 2: 找出所有候选 tileset JSON 文件
    const tilesetPaths = allPaths.filter((p) => {
        if (p.endsWith('tileset.json')) return true;
        if (!p.endsWith('.json')) return false;
        return !!fileMap[p];
    });

    // 按层级排序：深层优先，根 tileset.json 最后
    tilesetPaths.sort((a, b) => {
        const aIsRoot = a === 'tileset.json' || a.endsWith('/tileset.json');
        const bIsRoot = b === 'tileset.json' || b.endsWith('/tileset.json');
        if (aIsRoot !== bIsRoot) return aIsRoot ? 1 : -1;
        return getTileLevel(b) - getTileLevel(a);
    });

    console.warn('[3DTiles][import] 找到候选 tileset（已按层级排序）:', tilesetPaths);

    // Step 3: 处理 tileset JSON，改写 content URL
    for (const tsPath of tilesetPaths) {
        const rawKey = Object.keys(fileMap).find(
            (k) => k.replace(/\\/g, '/') === tsPath,
        ) || tsPath;
        const blob = fileMap[rawKey];
        let text;
        try { text = await blob.text(); } catch { continue; }

        let json;
        try { json = JSON.parse(text); } catch { continue; }

        if (!json.root) continue;

        const tsDir = tsPath.substring(0, tsPath.lastIndexOf('/') + 1);
        rewriteTilesetContentUrls(json.root, tsDir, blobUrlMap);

        const newBlob = new Blob([JSON.stringify(json)], { type: 'application/json' });
        const newUrl = URL.createObjectURL(newBlob);
        blobUrlMap[tsPath] = newUrl;
        allBlobUrls.push(newUrl);
        console.warn('[3DTiles][import] 已处理:', tsPath, '→ blob URL 已更新');
    }

    // Step 4: 找根 tileset.json
    const rootTsPath =
        tilesetPaths.find((p) => p === 'tileset.json' || p.endsWith('/tileset.json'))
        || tilesetPaths[0];

    if (!rootTsPath) throw new Error('未找到 tileset.json，请确认 ZIP 或目录包含有效的 3D Tiles 数据集');

    const tilesetUrl = blobUrlMap[rootTsPath];
    console.warn('[3DTiles][import] 根 tileset 路径:', rootTsPath, '→ 最终 URL:', tilesetUrl);

    // Step 5: 加载
    const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl);
    console.warn('[3DTiles][import] Cesium3DTileset.fromUrl 完成，boundingSphere:', tileset.boundingSphere);

    // Step 5.5: 地形自适应——如果 tileset 低于地形表面，自动抬升
    await adjustTilesetToTerrain(tileset, viewer, Cesium);

    const id = `tileset_${++nextId.current}`;
    viewer.scene.primitives.add(tileset);

    const record = {
        id,
        name: sourceName,
        type: '3dtiles',
        entity: tileset,
        blobUrls: allBlobUrls,
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    flyToEntity(viewer, Cesium, tileset, '3dtiles');
    message.success(`3D Tiles "${sourceName}" 加载成功 (${allPaths.length} 个文件)`);
    return record;
}

/**
 * 加载 tileset.json 文件
 * 优先使用 file:// 路径（Electron/桌面环境），浏览器环境回退到目录选择器。
 *
 * @param {Object} ctx
 * @param {File} ctx.file
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 */
export async function loadTilesetJSON({ file, getCesium, getViewer, message, loadedDataSources, nextId, heightSampler }) {
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

        // 地形自适应：如果 tileset 低于地形表面，自动抬升
        await adjustTilesetToTerrain(tileset, viewer, Cesium);

        const id = `tileset_${++nextId.current}`;
        viewer.scene.primitives.add(tileset);

        const record = { id, name: file.name, type: '3dtiles', entity: tileset };
        loadedDataSources.value = [...loadedDataSources.value, record];

        flyToEntity(viewer, Cesium, tileset, '3dtiles');
        message.success(`3D Tiles "${file.name}" 加载成功`);
        return record;
    }

    // 浏览器环境：引导用户选择完整目录
    message.warning('3D Tiles 是目录格式，需要选择包含所有文件的文件夹，即将打开目录选择器…');

    const result = await importTilesetFromDirectory({ getCesium, getViewer, message, loadedDataSources, nextId, heightSampler });
    if (!result) {
        throw new Error('用户取消了目录选择，3D Tiles 导入中止');
    }
    return result;
}

/**
 * 从 ZIP 文件中加载 3D Tiles
 *
 * @param {Object} ctx
 * @param {File} ctx.zipFile
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 */
export async function loadTilesetFromZip({ zipFile, getCesium, getViewer, message, loadedDataSources, nextId, heightSampler }) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(zipFile);

    const fileMap = {};
    const entries = [];
    zip.forEach((relPath, entry) => {
        if (!entry.dir) entries.push(relPath);
    });

    for (const relPath of entries) {
        const blob = await zip.file(relPath).async('blob');
        fileMap[relPath] = blob;
    }

    return await loadTilesetFromFileMap({
        fileMap,
        sourceName: zipFile.name || '3D Tiles',
        getCesium, getViewer, message, loadedDataSources, nextId, heightSampler,
    });
}

/**
 * 使用传统 <input webkitdirectory> 方式选取文件夹（降级方案）
 * 适用于不支持 File System Access API 的浏览器
 *
 * @param {Object} ctx
 * @returns {Promise<Object|null>}
 */
function importTilesetFromDirectoryFallback({ getCesium, getViewer, message, loadedDataSources, nextId, heightSampler }) {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.directory = true;
        input.multiple = true;
        input.style.display = 'none';
        document.body.appendChild(input);

        /** 清理 DOM 中的 input 元素 */
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

            // 从文件列表中提取目录名（取第一个文件的相对路径前缀）
            const firstPath = files[0].webkitRelativePath || files[0].name;
            const dirName = firstPath.split('/')[0] || '3D Tiles';

            // 构建 fileMap：去掉目录前缀，保留内部相对路径
            const fileMap = {};
            for (const file of files) {
                const relPath = file.webkitRelativePath || file.name;
                // 去掉顶层目录名前缀
                const innerPath = relPath.includes('/')
                    ? relPath.substring(relPath.indexOf('/') + 1)
                    : relPath;
                fileMap[innerPath] = file;
            }

            try {
                const result = await loadTilesetFromFileMap({
                    fileMap,
                    sourceName: dirName,
                    getCesium, getViewer, message, loadedDataSources, nextId, heightSampler,
                });
                resolve(result);
            } catch (error) {
                message.error(`导入 3D Tiles 目录失败: ${error.message || error}`);
                reject(error);
            }
        };

        // 用户取消选择：通过 window focus 事件检测
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

/**
 * 使用 File System Access API 选取目录（原生方案）
 *
 * @param {Object} ctx
 * @returns {Promise<Object|null>}
 */
async function importTilesetFromDirectoryNative({ getCesium, getViewer, message, loadedDataSources, nextId, heightSampler }) {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    const fileMap = {};
    await readDirRecursive(dirHandle, '', fileMap);
    return await loadTilesetFromFileMap({
        fileMap,
        sourceName: dirHandle.name,
        getCesium, getViewer, message, loadedDataSources, nextId, heightSampler,
    });
}

/**
 * 打开系统目录选择器，选取 3D Tiles 文件夹后加载
 * 优先使用 File System Access API，不支持时降级为传统 webkitdirectory 方式
 *
 * @param {Object} ctx
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 * @returns {Promise<Object|null>}
 */
export async function importTilesetFromDirectory({ getCesium, getViewer, message, loadedDataSources, nextId, heightSampler }) {
    try {
        // 检测是否支持 File System Access API
        if (typeof window.showDirectoryPicker === 'function') {
            return await importTilesetFromDirectoryNative({ getCesium, getViewer, message, loadedDataSources, nextId, heightSampler });
        }
        // 降级方案：使用传统 webkitdirectory 方式
        return await importTilesetFromDirectoryFallback({ getCesium, getViewer, message, loadedDataSources, nextId, heightSampler });
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'SecurityError') {
            return null;
        }
        message.error(`导入 3D Tiles 目录失败: ${error.message || error}`);
        throw error;
    }
}
