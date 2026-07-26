/**
 * tilesetLoader.js
 * 3D Tiles 数据集加载器
 *
 * 支持：本地 file:// 路径、ZIP 压缩包、浏览器目录选择器（File System Access API）。
 * 核心思路：将所有文件映射为 blob URL → 改写 tileset.json 内部 content.url →
 * Cesium3DTileset.fromUrl() 加载。
 *
 * 地形自适应：加载后自动采样地形高度，如果 tileset 低于地形表面则抬升到地表上方。
 */

import { flyToEntity } from './utils.js';

/** @type {string} tileset.json 文件名标识 */
export const TILESET_JSON_INDICATOR = 'tileset.json';

// ============================================================
// 内部工具函数
// ============================================================

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

// ============================================================
// 地形自适应
// ============================================================

/**
 * 地形贴地失败时，切换回默认椭球（关掉地形让数据可见）
 */
function disableTerrain(viewer, Cesium) {
    try {
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        console.warn('[贴地] 已切换为默认椭球地形');
    } catch (e) {
        console.warn('[贴地] 切换地形失败:', e.message || e);
    }
}

/**
 * 自动将 tileset 抬升到地形表面上方
 *
 * @returns {Promise<boolean>} true=贴地成功或无需贴地; false=采样失败,需要关地形兜底
 */
async function adjustTilesetToTerrain(tileset, viewer, Cesium) {
    // 1. 检查地形是否有效
    if (!viewer.terrainProvider) {
        console.warn('[贴地] 无 terrainProvider，跳过');
        return true;
    }
    if (viewer.terrainProvider.constructor === Cesium.EllipsoidTerrainProvider) {
        // 已经是椭球地形，不需要贴地，也不需要关地形
        return true;
    }

    // 2. 获取瓦片集包围球：用球心高度 - 半径 = 模型底部高度
    const center = tileset.boundingSphere.center;
    const radius = tileset.boundingSphere.radius;
    const carto = Cesium.Cartographic.fromCartesian(center);
    const lng = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const centerH = carto.height;
    // 底部 ≈ 球心高度 - 球半径（在局部 up 方向上的分量近似等于球半径）
    const bottomH = centerH - radius;
    console.warn('[贴地] 瓦片集中心:', lng.toFixed(6), lat.toFixed(6),
        '中心高=', centerH.toFixed(1), 'm, 半径=', radius.toFixed(1), 'm, 底部高=', bottomH.toFixed(1), 'm');

    // 3. 采样地形高度
    let terrainH;
    try {
        const pos = Cesium.Cartographic.fromDegrees(lng, lat);
        console.warn('[贴地] 开始采样 terrainMostDetailed...');
        const results = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [pos]);
        console.warn('[贴地] 采样返回:', JSON.stringify(results?.map(r => ({ height: r?.height }))));
        if (results && results.length > 0 && results[0].height !== undefined) {
            terrainH = results[0].height;
        }
    } catch (e) {
        console.warn('[贴地] 采样异常:', e.message || e);
        return false;
    }

    if (terrainH === undefined || terrainH === null) {
        console.warn('[贴地] 采样结果为空，贴地失败');
        return false;
    }

    // 4. 计算偏移：让瓦片集底部贴到地形表面 + 10m 余量
    const diff = terrainH - bottomH;
    console.warn('[贴地] 地形高度=', terrainH.toFixed(1), 'm, 瓦片集底部=', bottomH.toFixed(1), 'm, 需抬升=', diff.toFixed(1), 'm');

    if (diff <= 0) {
        console.warn('[贴地] 瓦片集底部已在地表或之上，无需调整');
        return true;
    }

    const totalOffset = diff + 10; // 10m 余量
    console.warn('[贴地] 抬升量=', totalOffset.toFixed(1), 'm');

    // 5. 应用 modelMatrix：计算 ECEF 垂直偏移
    const origin = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0);
    const target = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, totalOffset);
    const translation = Cesium.Cartesian3.subtract(target, origin, new Cesium.Cartesian3());
    console.warn('[贴地] ECEF 偏移量级:', Cesium.Cartesian3.magnitude(translation).toFixed(1), 'm');
    tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
    console.warn('[贴地] modelMatrix 已设置 ✓');
    return true;
}

/**
 * 采样瓦片集外包矩形内的地形高程范围
 *
 * 参考 FluidSimulation 的 ENU 网格采样策略：
 * 1. 以 tileset 中心建立 ENU (East-North-Up) 参考系
 * 2. 在 ENU 水平面上生成均匀网格
 * 3. 每个点转换到世界坐标 → Cartographic → Cesium.sampleTerrain 批量查询
 * 4. 返回 min/max/centerHeight（用于滑杆阈值）
 *
 * @param {Cesium.Cesium3DTileset} tileset
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium
 * @returns {Promise<{min:number, max:number, centerHeight:number}|null>}
 */
async function sampleTerrainElevationRange(tileset, viewer, Cesium) {
    if (!viewer.terrainProvider || viewer.terrainProvider.constructor === Cesium.EllipsoidTerrainProvider) {
        return null;
    }

    try {
        const center = tileset.boundingSphere.center;
        const radius = tileset.boundingSphere.radius;
        const carto = Cesium.Cartographic.fromCartesian(center);
        const cLng = Cesium.Math.toDegrees(carto.longitude);
        const cLat = Cesium.Math.toDegrees(carto.latitude);
        const cH = carto.height;

        // ENU 参考系下的水平跨度：用包围球直径覆盖瓦片集的地面投影
        const spanX = radius * 2;
        const spanY = radius * 2;

        // 网格分辨率：参考 FluidSimulation 的 ~60m 间距，最小 16×16，最大 100×100
        const TARGET_SPACING = 60;
        const MIN_SIZE = 16;
        const MAX_SIZE = 100;
        let size = Math.ceil(Math.max(spanX, spanY) / TARGET_SPACING) + 1;
        size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));

        // 在 ENU 参考系下建立均匀网格
        const centerENU = Cesium.Cartesian3.fromDegrees(cLng, cLat, cH);
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(centerENU);
        const positions = [];
        const denom = Math.max(1, size - 1);

        for (let row = 0; row < size; row++) {
            const v = row / denom;
            const north = (0.5 - v) * spanY;
            for (let col = 0; col < size; col++) {
                const u = col / denom;
                const east = (u - 0.5) * spanX;
                const local = new Cesium.Cartesian3(east, north, 0);
                const world = Cesium.Matrix4.multiplyByPoint(enuMatrix, local, new Cesium.Cartesian3());
                positions.push(Cesium.Cartographic.fromCartesian(world));
            }
        }

        // 批量采样地形：优先用固定层级（速度快），回退到 mostDetailed
        let results;
        if (typeof Cesium.sampleTerrain === 'function') {
            const level = Math.min(viewer.terrainProvider?.maximumLevel ?? 12, 12);
            results = await Cesium.sampleTerrain(viewer.terrainProvider, level, positions);
        } else {
            results = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions);
        }

        // 提取高程范围
        let min = Infinity;
        let max = -Infinity;
        let centerHeight = null;

        for (const r of results) {
            const h = Number(r?.height);
            if (!Number.isFinite(h)) continue;
            if (h < min) min = h;
            if (h > max) max = h;
        }

        if (!isFinite(min) || !isFinite(max)) return null;

        // 中心点高度：取网格正中间那个采样点
        const centerIdx = Math.floor(size / 2) * size + Math.floor(size / 2);
        if (centerIdx < results.length && Number.isFinite(Number(results[centerIdx]?.height))) {
            centerHeight = results[centerIdx].height;
        } else {
            centerHeight = (min + max) / 2;
        }

        console.warn('[贴地] ENU网格采样: size=', size, '×', size,
            ', span=', spanX.toFixed(0), 'm×', spanY.toFixed(0), 'm',
            ', range=[', min.toFixed(1), ', ', max.toFixed(1), ']m, center=', centerHeight.toFixed(1), 'm');

        return { min, max, centerHeight };
    } catch (e) {
        console.warn('[贴地] 高程范围采样失败:', e.message || e);
        return null;
    }
}

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

    // Step 5.5: 先采样外包矩形内的高程范围（必须在放置模型之前完成）
    const terrainElevation = await sampleTerrainElevationRange(tileset, viewer, Cesium);

    // 记录贴地所需的几何参数
    const centerCarto = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
    const bottomH = centerCarto.height - tileset.boundingSphere.radius;
    const initialBaseHeight = terrainElevation
        ? (terrainElevation.min + terrainElevation.max) / 2
        : bottomH;
    const tilesetGeo = {
        lng: Cesium.Math.toDegrees(centerCarto.longitude),
        lat: Cesium.Math.toDegrees(centerCarto.latitude),
        bottomH,
        initialBaseHeight,
    };

    // Step 5.6: 设置初始高度 = 高程值域中值，让模型底部贴在中值高度
    if (terrainElevation) {
        const median = initialBaseHeight;
        const offset = median - bottomH;
        const origin = Cesium.Cartesian3.fromRadians(centerCarto.longitude, centerCarto.latitude, 0);
        const target = Cesium.Cartesian3.fromRadians(centerCarto.longitude, centerCarto.latitude, offset);
        const translation = Cesium.Cartesian3.subtract(target, origin, new Cesium.Cartesian3());
        tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
        console.warn('[贴地] 初始贴地: 高程中值=', median.toFixed(1), 'm, 底部高=', bottomH.toFixed(1), 'm, 偏移=', offset.toFixed(1), 'm');
    } else {
        // 无地形数据时回退：自动贴地到中心点地形
        const clamped = await adjustTilesetToTerrain(tileset, viewer, Cesium);
        if (!clamped) {
            disableTerrain(viewer, Cesium);
        }
    }

    const id = `tileset_${++nextId.current}`;
    viewer.scene.primitives.add(tileset);

    const record = {
        id,
        name: sourceName,
        type: '3dtiles',
        entity: tileset,
        blobUrls: allBlobUrls,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight: initialBaseHeight,
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    flyToEntity(viewer, Cesium, tileset, '3dtiles');
    message.success(`3D Tiles "${sourceName}" 加载成功 (${allPaths.length} 个文件)`);
    return record;
}

/**
 * 加载 tileset.json 文件
 * 优先使用 file:// 路径（Electron/桌面环境），浏览器环境回退到目录选择器。
 */
export async function loadTilesetJSON({ file, getCesium, getViewer, message, loadedDataSources, nextId }) {
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

        // 先采样外包矩形内的高程范围（必须在放置模型之前完成）
        const terrainElevation = await sampleTerrainElevationRange(tileset, viewer, Cesium);
        const centerCarto = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
        const bottomH = centerCarto.height - tileset.boundingSphere.radius;
        const initialBaseHeight = terrainElevation
            ? (terrainElevation.min + terrainElevation.max) / 2
            : bottomH;
        const tilesetGeo = {
            lng: Cesium.Math.toDegrees(centerCarto.longitude),
            lat: Cesium.Math.toDegrees(centerCarto.latitude),
            bottomH,
            initialBaseHeight,
        };

        // 设置初始高度 = 高程值域中值
        if (terrainElevation) {
            const median = initialBaseHeight;
            const offset = median - bottomH;
            const origin = Cesium.Cartesian3.fromRadians(centerCarto.longitude, centerCarto.latitude, 0);
            const target = Cesium.Cartesian3.fromRadians(centerCarto.longitude, centerCarto.latitude, offset);
            const translation = Cesium.Cartesian3.subtract(target, origin, new Cesium.Cartesian3());
            tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
            console.warn('[贴地] 初始贴地: 高程中值=', median.toFixed(1), 'm, 底部高=', bottomH.toFixed(1), 'm, 偏移=', offset.toFixed(1), 'm');
        } else {
            const clamped = await adjustTilesetToTerrain(tileset, viewer, Cesium);
            if (!clamped) {
                disableTerrain(viewer, Cesium);
            }
        }

        const id = `tileset_${++nextId.current}`;
        viewer.scene.primitives.add(tileset);

        const record = {
            id,
            name: file.name,
            type: '3dtiles',
            entity: tileset,
            terrainElevation,
            tilesetGeo,
            currentBaseHeight: initialBaseHeight,
        };
        loadedDataSources.value = [...loadedDataSources.value, record];

        flyToEntity(viewer, Cesium, tileset, '3dtiles');
        message.success(`3D Tiles "${file.name}" 加载成功`);
        return record;
    }

    // 浏览器环境：引导用户选择完整目录
    message.warning('3D Tiles 是目录格式，需要选择包含所有文件的文件夹，即将打开目录选择器…');

    const result = await importTilesetFromDirectory({ getCesium, getViewer, message, loadedDataSources, nextId });
    if (!result) {
        throw new Error('用户取消了目录选择，3D Tiles 导入中止');
    }
    return result;
}

/**
 * 从 ZIP 文件中加载 3D Tiles
 */
export async function loadTilesetFromZip({ zipFile, getCesium, getViewer, message, loadedDataSources, nextId }) {
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
        getCesium, getViewer, message, loadedDataSources, nextId,
    });
}

// ============================================================
// 材质切换（5 种模式）
// ============================================================

/** 5 种材质模式的显示名称映射 */
export const MATERIAL_MODES = {
    pureWhite: '纯白膜',
    baimo: '白膜贴图',
    heightStyle: '高度分层',
    gradient: '高度渐变',
    none: '原始材质',
};

/**
 * 对 tileset 应用指定材质模式
 * @param {Cesium.Cesium3DTileset} tileset
 * @param {string} mode - MATERIAL_MODES 的 key
 * @param {Cesium} Cesium
 */
export function applyTilesetMaterial(tileset, mode, Cesium) {
    // 清空之前的状态
    tileset.customShader = null;
    tileset.style = undefined;

    if (mode === 'heightStyle') {
        tileset.style = buildHeightStyle(Cesium);
    } else if (mode !== 'none') {
        tileset.customShader = buildCustomShader(mode, Cesium);
    }
    // 'none': 保持无 shader + 无 style
}

/** 高度分层样式 */
function buildHeightStyle(Cesium) {
    return new Cesium.Cesium3DTileStyle({
        color: {
            conditions: [
                ["${height} === null", "color('rgb(44, 49, 88)')"],
                ["${height} === undefined", "color('rgb(44, 49, 88)')"],
                ["isNaN(Number(${height}))", "color('rgb(44, 49, 88)')"],
                ["Number(${height}) >= 130", "color('rgb(195, 21, 21)')"],
                ["Number(${height}) >= 60", "color('rgb(195, 83, 0)')"],
                ["Number(${height}) >= 30", "color('rgb(73, 52, 140)')"],
                ["true", "color('rgb(44, 49, 88)')"],
            ],
        },
    });
}

/** 构建 CustomShader（纯白膜 / 白膜贴图 / 高度渐变） */
function buildCustomShader(mode, Cesium) {
    if (mode === 'pureWhite') {
        return new Cesium.CustomShader({
            lightingModel: Cesium.LightingModel.UNLIT,
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    material.diffuse = vec3(0.95, 0.95, 0.95);
                    material.alpha = 1.0;
                }`,
        });
    }

    if (mode === 'baimo') {
        return new Cesium.CustomShader({
            lightingModel: Cesium.LightingModel.UNLIT,
            varyings: { v_normalMC: Cesium.VaryingType.VEC3 },
            uniforms: {
                u_texture: {
                    value: new Cesium.TextureUniform({
                        url: './textures/building7.png',
                    }),
                    type: Cesium.UniformType.SAMPLER_2D,
                },
            },
            vertexShaderText: `
                void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
                    v_normalMC = vsInput.attributes.normalMC;
                }`,
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    vec3 positionMC = fsInput.attributes.positionMC;
                    if (dot(vec3(0.0, 0.0, 1.0), v_normalMC) > 0.95) {
                        material.diffuse = vec3(0.079, 0.107, 0.111);
                    } else {
                        float width = 100.0, height = 100.0;
                        float dotXAxis = dot(vec3(0.0, 1.0, 0.0), v_normalMC);
                        float textureX = (dotXAxis > 0.52 || dotXAxis < -0.52)
                            ? mod(positionMC.x, width) / width
                            : mod(positionMC.y, width) / width;
                        float textureY = mod(positionMC.z, height) / height;
                        material.diffuse = texture(u_texture, vec2(textureX, textureY)).rgb;
                    }
                }`,
        });
    }

    if (mode === 'gradient') {
        return new Cesium.CustomShader({
            vertexShaderText: `
                void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {}`,
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    float bottomHeight = 560.0, topHeight = 750.0;
                    float heightRatio = clamp(
                        (fsInput.attributes.positionMC.z - bottomHeight) / (topHeight - bottomHeight),
                        0.0, 1.0);
                    material.diffuse = mix(vec3(0.0, 0.8, 0.0), vec3(0.8, 0.0, 0.0), heightRatio);
                }`,
        });
    }

    return null;
}

// ============================================================
// 加载内置样例 3D Tiles
// ============================================================

/**
 * 加载内置的样例城市 3D Tiles（public/tileset/city/tileset.json）
 * 默认应用白膜贴图材质
 */
export async function loadSampleTileset({ getCesium, getViewer, message, loadedDataSources, nextId }) {
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

    // 采样外包矩形高程范围
    const terrainElevation = await sampleTerrainElevationRange(tileset, viewer, Cesium);
    const centerCarto = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
    const bottomH = centerCarto.height - tileset.boundingSphere.radius;
    const initialBaseHeight = terrainElevation
        ? (terrainElevation.min + terrainElevation.max) / 2
        : bottomH;
    const tilesetGeo = {
        lng: Cesium.Math.toDegrees(centerCarto.longitude),
        lat: Cesium.Math.toDegrees(centerCarto.latitude),
        bottomH,
        initialBaseHeight,
    };

    // 贴地：有高程数据→中值贴地；无数据→自动采样贴地兜底；都失败→关地形
    if (terrainElevation) {
        const median = initialBaseHeight;
        const offset = median - bottomH;
        const origin = Cesium.Cartesian3.fromRadians(centerCarto.longitude, centerCarto.latitude, 0);
        const target = Cesium.Cartesian3.fromRadians(centerCarto.longitude, centerCarto.latitude, offset);
        const translation = Cesium.Cartesian3.subtract(target, origin, new Cesium.Cartesian3());
        tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
    } else {
        const clamped = await adjustTilesetToTerrain(tileset, viewer, Cesium);
        if (!clamped) {
            disableTerrain(viewer, Cesium);
        }
    }

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '样例城市',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight: initialBaseHeight,
        materialMode: 'baimo',
    };
    loadedDataSources.value = [...loadedDataSources.value, record];

    await viewer.zoomTo(tileset);
    message.success('样例 3D Tiles 加载成功');
    return record;
}

// ============================================================
// 内部：目录选择器
// ============================================================

/**
 * 使用传统 <input webkitdirectory> 方式选取文件夹（降级方案）
 * 适用于不支持 File System Access API 的浏览器
 */
function importTilesetFromDirectoryFallback({ getCesium, getViewer, message, loadedDataSources, nextId }) {
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
                    getCesium, getViewer, message, loadedDataSources, nextId,
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
 */
async function importTilesetFromDirectoryNative({ getCesium, getViewer, message, loadedDataSources, nextId }) {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    const fileMap = {};
    await readDirRecursive(dirHandle, '', fileMap);
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
export async function importTilesetFromDirectory({ getCesium, getViewer, message, loadedDataSources, nextId }) {
    try {
        // 检测是否支持 File System Access API
        if (typeof window.showDirectoryPicker === 'function') {
            return await importTilesetFromDirectoryNative({ getCesium, getViewer, message, loadedDataSources, nextId });
        }
        // 降级方案：使用传统 webkitdirectory 方式
        return await importTilesetFromDirectoryFallback({ getCesium, getViewer, message, loadedDataSources, nextId });
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'SecurityError') {
            return null;
        }
        message.error(`导入 3D Tiles 目录失败: ${error.message || error}`);
        throw error;
    }
}
