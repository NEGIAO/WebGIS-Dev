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


// ============================================================
// 导出加载函数
// ============================================================

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

    // Step 1: 将所有文件创建为 blob URL
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

    // Step 3: 处理 tileset JSON，改写 content URL（顺带保留解析结果，供根 JSON 读取 region 基座高）
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

    // Step 4: 找根 tileset.json
    const rootTsPath =
        tilesetPaths.find((p) => p === 'tileset.json' || p.endsWith('/tileset.json'))
        || tilesetPaths[0];

    if (!rootTsPath) throw new Error('未找到 tileset.json，请确认 ZIP 或目录包含有效的 3D Tiles 数据集');

    const tilesetUrl = blobUrlMap[rootTsPath];
    const rootJson = parsedTilesetJson[rootTsPath] || null;
    console.warn('[3DTiles][import] 根 tileset 路径:', rootTsPath, '→ 最终 URL:', tilesetUrl);

    // Step 5: 加载
    const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl);
    console.warn('[3DTiles][import] Cesium3DTileset.fromUrl 完成，boundingSphere:', tileset.boundingSphere);

    // Step 5.5: 初始贴地（叶子基底采样 × 地形逐点配对 + 死区判定）
    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, rootJson, rootJsonUrl: tilesetUrl, message,
    });

    const id = `tileset_${++nextId.current}`;
    viewer.scene.primitives.add(tileset);

    // 默认白膜贴图材质（与 CesiumToolPanel UI 默认值 'baimo' 一致）
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
 * Electron/桌面环境：通过 file:// 路径加载。
 * 浏览器环境：file:// 会被 CORS 拦截，直接引导用户选择完整目录。
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

        // 初始贴地（file:// 路径无已解析 JSON：优先 fetch 根 JSON 收集叶子基底采样，
        // fetch 被浏览器策略拦截时退化为运行时瓦片树遍历）
        const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
            tileset, viewer, Cesium, rootJsonUrl: tilesetUrl, message,
        });

        const id = `tileset_${++nextId.current}`;
        viewer.scene.primitives.add(tileset);

        // 默认白膜贴图材质
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

    // 浏览器环境：file:// 会被 CORS 拦截，必须选择完整目录
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
// 加载内置样例 3D Tiles
// ============================================================

/**
 * 加载内置样例 3D Tiles（public/tileset/city/tileset.json）
 * 默认应用白膜贴图材质
 */
export async function loadSampleTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const tileset = await Cesium.Cesium3DTileset.fromUrl(
        './tileset/city/tileset.json',
        { maximumScreenSpaceError: 10, maximumMemoryUsage: 5120 },
    );

    viewer.scene.primitives.add(tileset);

    // 默认白膜贴图材质
    applyTilesetMaterial(tileset, 'baimo', Cesium);

    // 初始贴地（样例路径：fetch 根 JSON 收集叶子基底采样，失败退化运行时瓦片树）
    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, rootJsonUrl: './tileset/city/tileset.json', message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '腾讯建筑高度',
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

    await viewer.flyTo(tileset, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
            0,
            Cesium.Math.toRadians(-45),
            tileset.boundingSphere.radius * 0.4,
        ),
    });
    message.success('样例 3D Tiles 加载成功');
    return record;
}

/**
 * 加载内置样例 3D Tiles：武汉建筑数据（public/tileset/baimo/tileset.json）
 * 默认应用白膜贴图材质
 */
export async function loadSampleBaimoTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const tileset = await Cesium.Cesium3DTileset.fromUrl(
        'https://3dtiles.negiao.cc.cd/baimo/tileset.json',
        { maximumScreenSpaceError: 10, maximumMemoryUsage: 5120 },
    );

    viewer.scene.primitives.add(tileset);

    // 默认白膜贴图材质
    applyTilesetMaterial(tileset, 'baimo', Cesium);

    // 初始贴地（样例路径：fetch 根 JSON 收集叶子基底采样，失败退化运行时瓦片树）
    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, rootJsonUrl: './tileset/baimo/tileset.json', message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '武汉建筑数据',
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

    await viewer.flyTo(tileset, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
            0,
            Cesium.Math.toRadians(-45),
            tileset.boundingSphere.radius * 0.4,
        ),
    });
    message.success('武汉建筑 3D Tiles 加载成功');
    return record;
}

/**
 * 加载 Cesium Ion 样例：河南大学摄影测量数据 (Asset 5115505)
 */
export async function loadSampleIonTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const assetId = 5115505;
    const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId, {
        maximumScreenSpaceError: 4,
        enableCollision: true,
    });

    viewer.scene.primitives.add(tileset);

    // 贴地 + 注册数据源
    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: 'Cesium Ion 河南大学',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'none',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    // 飞行定位到河南大学
    await viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(114.302537, 34.813816, 158.50),
        orientation: {
            heading: Cesium.Math.toRadians(356.554),
            pitch: Cesium.Math.toRadians(-28.061),
            roll: 0,
        },
        duration: 1.5,
    });
    message.success(`已加载 Cesium Ion 样例 (Asset ${assetId})`);
    return record;
}

/**
 * 加载 Cesium Ion 样例：美国摄影测量数据 (Asset 354759)
 */
export async function loadSampleI3sTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const assetId = 354759;
    const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId, {
        maximumScreenSpaceError: 4,
        enableCollision: true,
    });

    viewer.scene.primitives.add(tileset);

    // 贴地 + 注册数据源
    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '美国摄影测量数据',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'none',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    // 飞行定位
    await viewer.camera.flyTo({
        destination: tileset.boundingSphere.center,
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
        },
        duration: 1.5,
    });
    message.success(`已加载 Cesium Ion 样例 (Asset ${assetId})`);
    return record;
}

/**
 * 加载 Cesium 官方离散 LOD 样例（TilesetWithDiscreteLOD）
 * 源自 3d-tiles-samples 仓库，验证 LOD 切换效果
 */
export async function loadSampleDiscreteLODTileset({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const url = 'https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/master/1.0/TilesetWithDiscreteLOD/tileset.json';

    const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
    viewer.scene.primitives.add(tileset);

    // 贴地 + 注册数据源
    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples, fitResidual } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '美国Dragon 3d Tiles (离散 LOD)',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
        fitResidual,
        terrainFitSamples: baseSamples,
        materialMode: 'none',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    await viewer.flyTo(tileset, {
        duration: 2,
        offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0.0),
            Cesium.Math.toRadians(-25.0),
            tileset.boundingSphere.radius * 2.5,
        ),
    });
    message.success('已加载离散 LOD 样例 (TilesetWithDiscreteLOD)');
    return record;
}

// ============================================================
// 内部：目录选择器
// ============================================================

/**
 * 使用传统 <input webkitdirectory> 方式选取文件夹（降级方案）
 * 适用于不支持 File System Access API 的浏览器
 */
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
            const fileMap: Record<string, Blob> = {};
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
                    getCesium, getViewer, message, loadedDataSources, nextId,
                });
                resolve(result);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                message.error(`导入 3D Tiles 目录失败: ${msg}`);
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
 */
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
        // 目录迭代器本身失败（句柄过期）：如果已收集到部分文件，继续处理；否则抛出
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

/**
 * 打开系统目录选择器，选取 3D Tiles 文件夹后加载
 * 优先使用 File System Access API，不支持时降级为传统 webkitdirectory 方式
 *
 * @returns {Promise<Object|null>}
 */
export async function importTilesetFromDirectory({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    nextId,
}: TilesetLoaderBaseOptions) {
    try {
        // 检测是否支持 File System Access API
        if (typeof (window as any).showDirectoryPicker === 'function') {
            return await importTilesetFromDirectoryNative({ getCesium, getViewer, message, loadedDataSources, nextId });
        }
        // 降级方案：使用传统 webkitdirectory 方式
        return await importTilesetFromDirectoryFallback({ getCesium, getViewer, message, loadedDataSources, nextId });
    } catch (error) {
        const errObj = error && typeof error === 'object' ? (error as { name?: unknown; message?: unknown }) : null;
        const errName = typeof errObj?.name === 'string' ? errObj.name : '';
        if (errName === 'AbortError' || errName === 'SecurityError') {
            return null;
        }
        // NotFoundError（句柄过期）且已收集到部分文件时不视为致命错误
        if (errName === 'NotFoundError') {
            console.warn('[3DTiles][import] File System Access API 句柄过期，部分文件可能未加载');
            return null;
        }
        const errMsg = typeof errObj?.message === 'string' ? errObj.message : String(error);
        message.error(`导入 3D Tiles 目录失败: ${errMsg}`);
        throw error;
    }
}
