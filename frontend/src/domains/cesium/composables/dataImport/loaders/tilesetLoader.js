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
                console.warn(`[3DTiles][readDir] 跳过 "${relPath}": ${itemError?.message || itemError}`);
            }
        }
    } catch (dirError) {
        // 目录迭代器本身失败（目录句柄过期等）
        console.warn(`[3DTiles][readDir] 目录迭代失败 "${currentPath || '(root)'}"：${dirError?.message || dirError}`);
        throw dirError;
    }
}

// ============================================================
// 地形自适应（贴地 2.0：叶子包围盒基底面 × 地形逐点配对 → 中位数配准）
//
// 旧算法为什么差：
// 1. 只认根 boundingVolume.region——box/sphere 根包围盒（CesiumLab、ion 导出常见）
//    直接判"不可信"，整条自动贴地永远不触发；
// 2. 根 region 的 minHeight 常是转换器写的松垮 padding，不等于真实基底；
// 3. 地形基准只取足迹中心一个点，坡地上必错（半边埋土半边悬空）；
// 4. 滑杆值域用最多 100×100=1 万点的网格采样，慢且层级粗。
//
// 新算法：
// 1. 遍历瓦片树（已解析 JSON > fetch 根 JSON > 运行时 header 树），
//    收集**叶子**包围盒的基底采样 {经纬, 底高}——叶子包围盒是渲染裁剪依据，
//    远比根包围盒紧、可信，且天然覆盖整个足迹；
// 2. 每个采样点与**该点**地形高配对，diff_i = terrain_i − base_i；
// 3. 取 diff 的中位数为整体垂直修正量——中位数是常数偏移的 L1 最优解，
//    对个别坏包围盒/地形空洞天然免疫，坡地上给出最优折中；
// 4. 死区/上限保护：|中位差|≤2m 视为数据自身配准正确不动它；
//    超 5km 视为坐标系错误不硬修；失败路径一律保持原位 + 提示滑杆。
// ============================================================

/** 自动贴地死区（米）：基底与地形中位差在此范围内视为数据自身配准正确，不动它 */
const TERRAIN_FIT_DEADBAND = 2;

/** 基底高合理性下限（米，死海以下视为转换器伪值） */
const MIN_SANE_BASE_HEIGHT = -450;
/** 基底高合理性上限（米，高于全球最高城市数据视为伪值） */
const MAX_SANE_BASE_HEIGHT = 9000;
/** region 垂直跨度合理性上限（米）：超过视为伪值 */
const MAX_SANE_VERTICAL_SPAN = 10000;
/** 自动贴地允许的最大修正量（米）：超过大概率是坐标系/投影错误，垂直平移修不了 */
const MAX_AUTO_FIT_OFFSET = 5000;
/** 参与地形配对的采样点上限（sampleTerrainMostDetailed 单批规模） */
const MAX_PAIR_SAMPLES = 256;
/** 瓦片树遍历节点数上限（防御超大内联树卡死主线程） */
const MAX_TREE_VISITS = 20000;

/** 已排序数组的分位数（线性插值） */
function sortedPercentile(sorted, p) {
    if (!sorted.length) return NaN;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** 等步长抽稀到不超过 max 个（瓦片树叶子多按空间块序排列，步长抽稀即保持空间分布） */
function decimate(arr, max) {
    if (arr.length <= max) return arr;
    const step = arr.length / max;
    const out = [];
    for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
    return out;
}

/**
 * 从单个 boundingVolume（3D Tiles JSON 原始结构）提取基底采样
 *
 * - region：[west,south,east,north,minH,maxH]（弧度/米），按规范**不受 transform 影响**，
 *   直接取中心经纬 + minH；
 * - box：中心+三半轴（12 数，受 transform 链影响），8 个角点变换到世界系后取最低椭球高；
 * - sphere：中心+半径（受 transform 影响），底高取 中心高−半径——对包住整块内容的球
 *   偏松，标记 tight=false，仅在没有紧包围盒采样时兜底使用。
 *
 * @param {Object} bv - boundingVolume JSON（{region}|{box}|{sphere}）
 * @param {Cesium.Matrix4} M - 累积 transform（含祖先链）
 * @param {Cesium} Cesium
 * @returns {{lonRad:number, latRad:number, baseH:number, tight:boolean}|null}
 */
function bvToBaseSample(bv, M, Cesium) {
    if (!bv || typeof bv !== 'object') return null;

    if (Array.isArray(bv.region) && bv.region.length >= 6) {
        const r = bv.region.map(Number);
        if (!r.slice(0, 5).every(Number.isFinite)) return null;
        return {
            lonRad: (r[0] + r[2]) / 2,
            latRad: (r[1] + r[3]) / 2,
            baseH: r[4],
            tight: true,
        };
    }

    if (Array.isArray(bv.box) && bv.box.length >= 12) {
        const b = bv.box.map(Number);
        if (!b.every(Number.isFinite)) return null;
        let minH = Infinity;
        const corner = new Cesium.Cartesian3();
        const world = new Cesium.Cartesian3();
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    corner.x = b[0] + sx * b[3] + sy * b[6] + sz * b[9];
                    corner.y = b[1] + sx * b[4] + sy * b[7] + sz * b[10];
                    corner.z = b[2] + sx * b[5] + sy * b[8] + sz * b[11];
                    Cesium.Matrix4.multiplyByPoint(M, corner, world);
                    const cc = Cesium.Cartographic.fromCartesian(world);
                    if (cc && cc.height < minH) minH = cc.height;
                }
            }
        }
        const centerWorld = Cesium.Matrix4.multiplyByPoint(
            M, new Cesium.Cartesian3(b[0], b[1], b[2]), new Cesium.Cartesian3());
        const cc = Cesium.Cartographic.fromCartesian(centerWorld);
        if (!cc || !Number.isFinite(minH)) return null;
        return { lonRad: cc.longitude, latRad: cc.latitude, baseH: minH, tight: true };
    }

    if (Array.isArray(bv.sphere) && bv.sphere.length >= 4) {
        const s = bv.sphere.map(Number);
        if (!s.every(Number.isFinite)) return null;
        const centerWorld = Cesium.Matrix4.multiplyByPoint(
            M, new Cesium.Cartesian3(s[0], s[1], s[2]), new Cesium.Cartesian3());
        const cc = Cesium.Cartographic.fromCartesian(centerWorld);
        if (!cc) return null;
        return { lonRad: cc.longitude, latRad: cc.latitude, baseH: cc.height - s[3], tight: false };
    }

    return null;
}

/**
 * 遍历 tileset JSON 树，收集所有叶子节点的基底采样（迭代式 + 访问上限，防爆栈/卡死）
 * transform 为列主序 16 数，沿祖先链累乘（region 不受其影响，box/sphere 受）。
 */
function collectJsonLeafSamples(rootNode, Cesium) {
    const out = [];
    const stack = [{ node: rootNode, M: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY) }];
    let visited = 0;

    while (stack.length && visited < MAX_TREE_VISITS) {
        const { node, M } = stack.pop();
        visited++;
        if (!node || typeof node !== 'object') continue;

        let M2 = M;
        if (Array.isArray(node.transform) && node.transform.length === 16) {
            M2 = Cesium.Matrix4.multiply(
                M, Cesium.Matrix4.fromColumnMajorArray(node.transform), new Cesium.Matrix4());
        }

        const kids = Array.isArray(node.children) ? node.children : [];
        if (kids.length === 0) {
            // content.boundingVolume 比 tile.boundingVolume 更紧（后者含子树余量），优先
            const contentBv = !Array.isArray(node.content) ? node.content?.boundingVolume : null;
            const sample = bvToBaseSample(contentBv || node.boundingVolume, M2, Cesium);
            if (sample) out.push(sample);
        } else {
            for (const k of kids) stack.push({ node: k, M: M2 });
        }
    }
    return out;
}

/**
 * 运行时瓦片树兜底：fromUrl 解析完成后 header 树即已就绪（无需等待任何瓦片内容下载）。
 * tile.children / tile.computedTransform 是公开 API；_header 为私有字段，受保护读取，
 * Cesium 版本变动时安全退化为空数组。
 */
function collectRuntimeLeafSamples(tileset, Cesium) {
    const out = [];
    try {
        if (!tileset?.root) return out;
        const stack = [tileset.root];
        let visited = 0;
        while (stack.length && visited < MAX_TREE_VISITS) {
            const tile = stack.pop();
            visited++;
            if (!tile) continue;
            const kids = tile.children;
            if (kids && kids.length) {
                for (const k of kids) stack.push(k);
                continue;
            }
            const header = tile._header;
            const bv = (!Array.isArray(header?.content) ? header?.content?.boundingVolume : null)
                || header?.boundingVolume;
            const M = tile.computedTransform || Cesium.Matrix4.IDENTITY;
            const sample = bvToBaseSample(bv, M, Cesium);
            if (sample) out.push(sample);
        }
    } catch (e) {
        console.warn('[贴地] 运行时瓦片树遍历失败:', e.message || e);
    }
    return out;
}

/** 受保护地 fetch 并解析根 tileset.json（file://、http(s)、blob 均可尝试；失败返回 null） */
async function fetchTilesetJson(url) {
    if (!url) return null;
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

/**
 * 汇总基底采样：JSON 树（已解析 > fetch）→ 运行时树；紧包围盒优先、合理性过滤、抽稀。
 * @returns {Promise<{samples:Array, source:string}>}
 */
async function collectTilesetBaseSamples({ tileset, Cesium, rootJson, rootJsonUrl }) {
    let raw = [];
    let source = 'none';

    if (rootJson?.root) {
        raw = collectJsonLeafSamples(rootJson.root, Cesium);
        source = 'leaf-json';
    }
    if (!raw.length && rootJsonUrl) {
        const fetched = await fetchTilesetJson(rootJsonUrl);
        if (fetched?.root) {
            raw = collectJsonLeafSamples(fetched.root, Cesium);
            source = 'leaf-json-fetch';
        }
    }
    if (!raw.length) {
        raw = collectRuntimeLeafSamples(tileset, Cesium);
        source = raw.length ? 'leaf-runtime' : 'none';
    }

    // sphere 底高偏松：只要有紧包围盒（region/box）采样就弃用 sphere 采样
    const tightOnly = raw.filter((s) => s.tight);
    let picked = tightOnly.length ? tightOnly : raw;

    picked = picked.filter((s) => Number.isFinite(s.lonRad) && Number.isFinite(s.latRad)
        && Number.isFinite(s.baseH)
        && s.baseH > MIN_SANE_BASE_HEIGHT && s.baseH < MAX_SANE_BASE_HEIGHT);

    const samples = decimate(picked, MAX_PAIR_SAMPLES);
    console.warn('[贴地] 基底采样: 叶子', raw.length, '个 → 参与配对', samples.length,
        '点（来源:', source, tightOnly.length ? ', 紧包围盒' : ', sphere兜底', '）');
    return { samples, source };
}

/**
 * 提供方感知的批量地形采样（与 FluidSimulation 的采样策略同源）
 *
 * - Cesium World Terrain 等带 availability 的提供方：sampleTerrainMostDetailed，精度最高
 *   （配对点数已抽稀至 ≤MAX_PAIR_SAMPLES，无瓦片过载问题）；
 * - **ArcGIS**（ArcGISTiledElevationTerrainProvider）：availability 为 undefined，
 *   mostDetailed 会直接抛 DeveloperError——走显式层级 sampleTerrain（12 起）；
 * - **天地图/国测局** GeoTerrainProvider：同样无 availability，且服务最深只有
 *   _bottomLevel（=11），显式层级取 _bottomLevel−1；
 * - 层级阶梯逐级降粗重试：所选层级瓦片缺失（老版 Cesium 单瓦片失败会拒绝整批、
 *   新版返回 undefined 高度）时降 3 级再试，直到取得足量有效高程。
 *
 * @returns {Promise<Array|null>} 与入参同序的采样结果（height 可能含 NaN/undefined），全失败返回 null
 */
async function sampleTerrainBatch(viewer, Cesium, cartographics) {
    const provider = viewer.terrainProvider;
    // 有效高程门槛：≥30%（上限 8 点）——容忍地形空洞，但拒绝几乎全空的批次
    const threshold = Math.max(1, Math.min(8, Math.ceil(cartographics.length * 0.3)));
    const enough = (arr) => Array.isArray(arr)
        && arr.filter((c) => Number.isFinite(Number(c?.height))).length >= threshold;

    // 1) 带 availability（Cesium World Terrain 等）→ mostDetailed
    if (provider?.availability) {
        try {
            const results = await Cesium.sampleTerrainMostDetailed(provider, cartographics);
            if (enough(results)) return results;
            console.warn('[贴地] mostDetailed 有效高程不足，转显式层级');
        } catch (e) {
            console.warn('[贴地] mostDetailed 采样异常，转显式层级:', e.message || e);
        }
    }

    // 2) 显式层级阶梯：天地图 _bottomLevel−1 > maximumLevel > 12，失败每次降 3 级
    if (typeof Cesium.sampleTerrain !== 'function') return null;
    const bottomLevel = Number(provider?._bottomLevel);
    const preferred = Number.isFinite(bottomLevel)
        ? Math.max(0, bottomLevel - 1)
        : Math.min(Number(provider?.maximumLevel) || 12, 12);
    const ladder = [...new Set([preferred, Math.max(preferred - 3, 0), Math.max(preferred - 6, 0)])];

    for (const level of ladder) {
        try {
            const fresh = cartographics.map(
                (c) => new Cesium.Cartographic(c.longitude, c.latitude, 0));
            const results = await Cesium.sampleTerrain(provider, level, fresh);
            if (enough(results)) {
                console.warn('[贴地] 显式层级采样成功: level', level);
                return results;
            }
            console.warn('[贴地] level', level, '有效高程不足，降级重试');
        } catch (e) {
            console.warn('[贴地] level', level, '采样失败，降级重试:', e.message || e);
        }
    }
    console.warn('[贴地] 全部层级采样失败');
    return null;
}

/**
 * 核心估计：叶子基底 × 地形逐点配对，返回中位数偏移 + MAD（离散度）+ 地形值域
 * @returns {Promise<{offset:number, mad:number, count:number, terrainElevation:Object}|null>}
 */
async function estimateTerrainOffset(samples, viewer, Cesium) {
    const cartos = samples.map((s) => new Cesium.Cartographic(s.lonRad, s.latRad, 0));
    const results = await sampleTerrainBatch(viewer, Cesium, cartos);
    if (!results) return null;

    const diffs = [];
    const terrainHs = [];
    for (let i = 0; i < results.length; i++) {
        const t = Number(results[i]?.height);
        if (!Number.isFinite(t)) continue;
        terrainHs.push(t);
        diffs.push(t - samples[i].baseH);
    }
    if (!diffs.length) return null;

    diffs.sort((a, b) => a - b);
    terrainHs.sort((a, b) => a - b);

    const offset = sortedPercentile(diffs, 0.5);
    const absDev = diffs.map((d) => Math.abs(d - offset)).sort((a, b) => a - b);
    const mad = sortedPercentile(absDev, 0.5);

    return {
        offset,
        mad,
        count: diffs.length,
        terrainElevation: {
            min: terrainHs[0],
            max: terrainHs[terrainHs.length - 1],
            centerHeight: sortedPercentile(terrainHs, 0.5),
        },
    };
}

/**
 * 根 region 单点退化路径（叶子采样全军覆没时）：等价旧算法精度，仍走统一配对管线。
 * 不可信时回退包围球心高（**不减半径**——城市级瓦片集球半径由水平跨度主导，
 * 减半径会得到比真实基底低数千米的伪值），且仅供滑杆参照、不触发自动平移。
 *
 * @returns {{ baseHeight:number, reliable:boolean, source:string }}
 */
function resolveTilesetBaseHeight(tileset, Cesium, rootJson = null) {
    const region = rootJson?.root?.boundingVolume?.region
        || tileset?.root?._header?.boundingVolume?.region
        || null;
    if (Array.isArray(region) && region.length >= 6) {
        const minH = Number(region[4]);
        const maxH = Number(region[5]);
        const sane = Number.isFinite(minH) && Number.isFinite(maxH)
            && minH > MIN_SANE_BASE_HEIGHT
            && maxH >= minH
            && (maxH - minH) < MAX_SANE_VERTICAL_SPAN;
        if (sane) {
            return { baseHeight: minH, reliable: true, source: 'region' };
        }
        console.warn('[贴地] region 高度可疑，弃用: min=', minH, 'max=', maxH);
    }

    const carto = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
    return { baseHeight: carto.height, reliable: false, source: 'sphere-center' };
}

/** 构造沿地表法线的垂直平移矩阵（与 setTilesetHeight 手动滑杆同一几何口径） */
function buildVerticalTranslation(Cesium, lngRad, latRad, offsetMeters) {
    const origin = Cesium.Cartesian3.fromRadians(lngRad, latRad, 0);
    const target = Cesium.Cartesian3.fromRadians(lngRad, latRad, offsetMeters);
    const translation = Cesium.Cartesian3.subtract(target, origin, new Cesium.Cartesian3());
    return Cesium.Matrix4.fromTranslation(translation);
}

/**
 * 初始贴地（三条加载路径共用）：
 * 1. 收集叶子基底采样（JSON 树 > fetch > 运行时树 > 根 region 单点退化）；
 * 2. 逐点配对地形，中位数 diff 为修正量（MAD 记录离散度，坡地失配时仅告警）；
 * 3. 死区内不动（倾斜摄影自带地表，别替它"纠正"）；超上限视为坐标系错误不硬修；
 * 4. 任何失败路径都保持原位、不做全局副作用（不关地形），提示卡片高程滑杆。
 *
 * 返回契约与滑杆约定不变：bottomH 为模型底部海拔（取基底采样 p5，抗单块坏包围盒），
 * setTilesetHeight 按 target − bottomH 平移；currentBaseHeight = bottomH + 已施加偏移。
 *
 * @returns {Promise<{terrainElevation:Object|null, tilesetGeo:Object, currentBaseHeight:number,
 *   baseSamples:Array}>} baseSamples 存入 record 后供地形切换时 refitTilesetToTerrain 复用
 */
async function fitTilesetToTerrain({ tileset, viewer, Cesium, rootJson = null, rootJsonUrl = null, message = null }) {
    const carto = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
    const lng = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);

    const hasRealTerrain = !!viewer.terrainProvider
        && viewer.terrainProvider.constructor !== Cesium.EllipsoidTerrainProvider;

    // ---- 1. 基底面采样 ----
    let { samples, source } = await collectTilesetBaseSamples({ tileset, Cesium, rootJson, rootJsonUrl });
    if (!samples.length) {
        const legacy = resolveTilesetBaseHeight(tileset, Cesium, rootJson);
        if (legacy.reliable) {
            samples = [{ lonRad: carto.longitude, latRad: carto.latitude, baseH: legacy.baseHeight, tight: true }];
            source = legacy.source;
        }
    }
    const reliable = samples.length > 0;
    const baseHs = samples.map((s) => s.baseH).sort((a, b) => a - b);
    // 滑杆参照的"模型底部海拔"：p5 而非绝对最小，抗个别坏包围盒
    const bottomH = reliable ? sortedPercentile(baseHs, 0.05) : carto.height;

    // ---- 2. 逐点配对 + 中位数配准 ----
    let appliedOffset = 0;
    let terrainElevation = null;

    if (!hasRealTerrain) {
        // 椭球地形：地表即高 0。旧行为"无地形就什么都不做"，带真实海拔的数据会悬空
        // 数百米——这正是"先导入、后开地形"链路里模型飘在空中的直观来源。
        // 现在把底部落到 0；用户切换真实地形时由 refitTilesetToTerrain 自动重贴。
        if (reliable && Math.abs(bottomH) > TERRAIN_FIT_DEADBAND) {
            appliedOffset = -bottomH;
            tileset.modelMatrix = buildVerticalTranslation(
                Cesium, carto.longitude, carto.latitude, appliedOffset,
            );
            console.warn('[贴地] 椭球地形: 底部', bottomH.toFixed(1), 'm → 0 m（来源:', source,
                '），切换真实地形后将自动重贴');
        } else {
            console.warn('[贴地] 椭球地形: 底部', bottomH.toFixed(1), 'm（死区内或不可信），不调整');
        }
    } else if (!reliable) {
        console.warn('[贴地] 无可用基底采样，跳过自动贴地，可用高程滑杆手动调整');
        message?.warning?.('无法解析数据基底高度，已按原始位置放置，可用卡片高程滑杆微调');
    } else {
        const est = await estimateTerrainOffset(samples, viewer, Cesium);
        if (!est) {
            console.warn('[贴地] 地形采样不可用，保持数据原始位置');
            message?.warning?.('地形高程采样失败，已按数据原始高度放置，可用卡片高程滑杆微调');
        } else {
            terrainElevation = est.terrainElevation;
            if (est.mad > 25) {
                console.warn('[贴地] 基底与地形形态差异较大（MAD=', est.mad.toFixed(1),
                    'm），单一垂直平移取中位最优贴合，局部仍可能悬空/嵌入');
            }
            if (Math.abs(est.offset) <= TERRAIN_FIT_DEADBAND) {
                console.warn('[贴地]', est.count, '点配对中位差', est.offset.toFixed(2),
                    'm（死区内），数据自身配准正确，不调整');
            } else if (Math.abs(est.offset) > MAX_AUTO_FIT_OFFSET) {
                console.warn('[贴地] 修正量', est.offset.toFixed(0), 'm 超出上限，疑似坐标系错误，跳过自动贴地');
                message?.warning?.('数据与地形高差异常，已按原始位置放置，请检查数据坐标系');
            } else {
                appliedOffset = est.offset;
                tileset.modelMatrix = buildVerticalTranslation(
                    Cesium, carto.longitude, carto.latitude, appliedOffset,
                );
                console.warn('[贴地] 中位配准:', est.count, '点, 底部', bottomH.toFixed(1), 'm',
                    est.offset > 0 ? '抬升' : '下沉', Math.abs(est.offset).toFixed(1),
                    'm (MAD=', est.mad.toFixed(1), 'm, 来源:', source, ')');
            }
        }
    }

    // 滑杆值域兜底：配对未产出地形值域时退回足迹网格采样
    if (hasRealTerrain && !terrainElevation) {
        terrainElevation = await sampleTerrainElevationRange(tileset, viewer, Cesium);
    }

    const currentBaseHeight = bottomH + appliedOffset;
    return {
        terrainElevation,
        tilesetGeo: { lng, lat, bottomH, initialBaseHeight: currentBaseHeight },
        currentBaseHeight,
        baseSamples: samples,
    };
}

/**
 * 地形切换后的重贴地（真正贴地的关键：贴地不是导入时刻的一次性动作）
 *
 * 由 useCesiumDataImport 挂载的 terrainProviderChanged 监听调用。复用导入时保存在
 * record.terrainFitSamples 的叶子基底采样（数据**原始**坐标，不含任何已施加偏移），
 * 因此每次重贴都是相对原始位置的绝对平移——幂等，反复切换地形不累积误差。
 *
 * - 切到真实地形：重新逐点配对 → 中位数配准；
 * - 切回椭球地形：底部落到 0（地表即高 0）；
 * - 采样失败/修正量超限：保持当前位置，不做破坏性移动。
 *
 * @param {Object} p
 * @param {Object} p.record - loadedDataSources 中的 3dtiles 记录（就地更新高度字段）
 * @param {Cesium.Cesium3DTileset} p.tileset - 已 toRaw 的 tileset 实例
 * @param {Cesium.Viewer} p.viewer
 * @param {Cesium} p.Cesium
 * @returns {Promise<boolean>} 是否施加了新的贴地平移
 */
export async function refitTilesetToTerrain({ record, tileset, viewer, Cesium }) {
    const samples = record?.terrainFitSamples;
    const geo = record?.tilesetGeo;
    if (!Array.isArray(samples) || !samples.length || !geo || !tileset) {
        console.warn('[贴地] 重贴地跳过: 记录缺少基底采样（导入时解析失败的数据请用高程滑杆）');
        return false;
    }

    const lonRad = Cesium.Math.toRadians(geo.lng);
    const latRad = Cesium.Math.toRadians(geo.lat);
    const hasRealTerrain = !!viewer.terrainProvider
        && viewer.terrainProvider.constructor !== Cesium.EllipsoidTerrainProvider;

    let offset = 0;
    let terrainElevation = null;

    if (hasRealTerrain) {
        const est = await estimateTerrainOffset(samples, viewer, Cesium);
        if (!est) {
            console.warn('[贴地] 重贴地: 新地形采样失败，保持当前位置');
            return false;
        }
        if (Math.abs(est.offset) > MAX_AUTO_FIT_OFFSET) {
            console.warn('[贴地] 重贴地: 修正量', est.offset.toFixed(0), 'm 超出上限，疑似坐标系错误，跳过');
            return false;
        }
        offset = Math.abs(est.offset) <= TERRAIN_FIT_DEADBAND ? 0 : est.offset;
        terrainElevation = est.terrainElevation;
        console.warn('[贴地] 地形切换重贴:', est.count, '点配对, 中位差', est.offset.toFixed(1),
            'm (MAD=', est.mad.toFixed(1), 'm) → 施加', offset.toFixed(1), 'm');
    } else {
        offset = Math.abs(geo.bottomH) <= TERRAIN_FIT_DEADBAND ? 0 : -geo.bottomH;
        console.warn('[贴地] 切回椭球地形: 底部', geo.bottomH.toFixed(1), 'm → 0 m');
    }

    tileset.modelMatrix = offset === 0
        ? Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY)
        : buildVerticalTranslation(Cesium, lonRad, latRad, offset);

    record.currentBaseHeight = geo.bottomH + offset;
    geo.initialBaseHeight = record.currentBaseHeight;
    if (terrainElevation) record.terrainElevation = terrainElevation;
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

        // 网格分辨率：~60m 间距，最小 8×8，最大 48×48
        //（此函数已降级为滑杆值域兜底，主链路用叶子配对采样，无需 1 万点大网格）
        const TARGET_SPACING = 60;
        const MIN_SIZE = 8;
        const MAX_SIZE = 48;
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

        // 批量采样地形：走提供方感知采样（ArcGIS/天地图无 availability 也能取到）
        const results = await sampleTerrainBatch(viewer, Cesium, positions);
        if (!results) return null;

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
    const parsedTilesetJson = {};
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
    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, rootJson, rootJsonUrl: tilesetUrl, message,
    });

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
        currentBaseHeight,
        terrainFitSamples: baseSamples,
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

        // 初始贴地（file:// 路径无已解析 JSON：优先 fetch 根 JSON 收集叶子基底采样，
        // fetch 被浏览器策略拦截时退化为运行时瓦片树遍历）
        const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples } = await fitTilesetToTerrain({
            tileset, viewer, Cesium, rootJsonUrl: tilesetUrl, message,
        });

        const id = `tileset_${++nextId.current}`;
        viewer.scene.primitives.add(tileset);

        const record = {
            id,
            name: file.name,
            type: '3dtiles',
            entity: tileset,
            terrainElevation,
            tilesetGeo,
            currentBaseHeight,
            terrainFitSamples: baseSamples,
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
 * 对 tileset 应用「材质模式 × 透明度」合成外观（P1-2 单点合成，互不覆盖）。
 *
 * @param {Cesium.Cesium3DTileset} tileset
 * @param {string} mode - MATERIAL_MODES 的 key
 * @param {Cesium} Cesium
 * @param {number} [alpha=1] - 透明度 0~1（统一图层管理注入；1 = 完全不透明）
 */
export function applyTilesetMaterial(tileset, mode, Cesium, alpha = 1) {
    const safeAlpha = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1));

    // 清空之前的状态（style 与 customShader 均由本函数统一重建）
    tileset.customShader = null;
    tileset.style = undefined;

    if (mode === 'heightStyle') {
        tileset.style = buildHeightStyle(Cesium, safeAlpha);
    } else if (mode !== 'none') {
        tileset.customShader = buildCustomShader(mode, Cesium, safeAlpha);
    } else if (safeAlpha < 1) {
        // 原始材质 + 半透明：白色乘 alpha 的 style（不改变色相）
        tileset.style = new Cesium.Cesium3DTileStyle({
            color: `color('#ffffff', ${safeAlpha.toFixed(3)})`,
        });
    }
    // 'none' 且 alpha=1：保持无 shader + 无 style
}

/** 高度分层样式（alpha 融入各分层颜色，避免与透明度互写 style） */
function buildHeightStyle(Cesium, alpha = 1) {
    const a = Math.min(1, Math.max(0, alpha)).toFixed(3);
    const tint = (rgb) => `color('rgb(${rgb})', ${a})`;
    return new Cesium.Cesium3DTileStyle({
        color: {
            conditions: [
                ["${height} === null", tint('44, 49, 88')],
                ["${height} === undefined", tint('44, 49, 88')],
                ["isNaN(Number(${height}))", tint('44, 49, 88')],
                ["Number(${height}) >= 130", tint('195, 21, 21')],
                ["Number(${height}) >= 60", tint('195, 83, 0')],
                ["Number(${height}) >= 30", tint('73, 52, 140')],
                ["true", tint('44, 49, 88')],
            ],
        },
    });
}

/** 构建 CustomShader（纯白膜 / 白膜贴图 / 高度渐变；alpha 注入 shader 并按需切半透明渲染通道） */
function buildCustomShader(mode, Cesium, alpha = 1) {
    const a = Math.min(1, Math.max(0, alpha)).toFixed(3);
    // alpha<1 必须显式声明 TRANSLUCENT，否则不透明通道下 material.alpha 不生效
    const translucencyMode = alpha < 1
        ? Cesium.CustomShaderTranslucencyMode.TRANSLUCENT
        : Cesium.CustomShaderTranslucencyMode.INHERIT;

    if (mode === 'pureWhite') {
        return new Cesium.CustomShader({
            lightingModel: Cesium.LightingModel.UNLIT,
            translucencyMode,
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    material.diffuse = vec3(0.95, 0.95, 0.95);
                    material.alpha = ${a};
                }`,
        });
    }

    if (mode === 'baimo') {
        return new Cesium.CustomShader({
            lightingModel: Cesium.LightingModel.UNLIT,
            translucencyMode,
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
                    material.alpha = ${a};
                }`,
        });
    }

    if (mode === 'gradient') {
        return new Cesium.CustomShader({
            translucencyMode,
            vertexShaderText: `
                void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {}`,
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    float bottomHeight = 560.0, topHeight = 750.0;
                    float heightRatio = clamp(
                        (fsInput.attributes.positionMC.z - bottomHeight) / (topHeight - bottomHeight),
                        0.0, 1.0);
                    material.diffuse = mix(vec3(0.0, 0.8, 0.0), vec3(0.8, 0.0, 0.0), heightRatio);
                    material.alpha = ${a};
                }`,
        });
    }

    return null;
}

// ============================================================
// 加载内置样例 3D Tiles
// ============================================================

/**
 * 加载内置样例 3D Tiles（public/tileset/city/tileset.json）
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

    // 初始贴地（样例路径：fetch 根 JSON 收集叶子基底采样，失败退化运行时瓦片树）
    const { terrainElevation, tilesetGeo, currentBaseHeight, baseSamples } = await fitTilesetToTerrain({
        tileset, viewer, Cesium, rootJsonUrl: './tileset/city/tileset.json', message,
    });

    const id = `tileset_${++nextId.current}`;
    const record = {
        id,
        name: '样例城市',
        type: '3dtiles',
        entity: tileset,
        terrainElevation,
        tilesetGeo,
        currentBaseHeight,
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
        // NotFoundError（句柄过期）且已收集到部分文件时不视为致命错误
        if (error.name === 'NotFoundError') {
            console.warn('[3DTiles][import] File System Access API 句柄过期，部分文件可能未加载');
            return null;
        }
        message.error(`导入 3D Tiles 目录失败: ${error.message || error}`);
        throw error;
    }
}
