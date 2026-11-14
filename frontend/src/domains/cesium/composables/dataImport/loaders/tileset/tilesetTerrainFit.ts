/**
 * 功能名称：3D Tiles 地形自适应（贴地 2.0）
 * 日    期：2026/11/13
 *
 * 从 tilesetLoader 拆出：叶子包围盒基底采样 × 地形逐点配对 → 中位数配准，
 * 含死区/上限保护与滑杆回填；fit/refit 为对外契约（useCesiumLayers / tilesetGroundStrategy）。
 */


import { sampleTerrainBatch } from '../../../terrain/terrainSampling';

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

/** 自动贴地死区（米）：基底与地形中位差在此范围内视为数据自身配准正确，不动它。
 *  为了提高贴地覆合率，默认将死区设为 0，使算法更积极地贴地（如果要保留 2m 死区，可改回 2）。 */
// (已移除) 自动贴地死区变量：原先用来避免小幅度调整。已改为积极贴地策略，若需恢复可重新定义并在代码中引用。

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
/**
 * 贴地估算的默认分位数。
 * 取 0.75 而非 0.5：单一刚性平移无法同时消除嵌入与悬空，而「被埋」比「略悬空」更刺眼。
 * 10 km² / 400 m 高差实测：p50 → 嵌入率 50% / 最大埋深 148 m；p75 → 25% / 84 m。
 */
const DEFAULT_FIT_QUANTILE = 0.75;
/** 区域化贴合的采样下限：低于该点数退回整幅估算，避免小框给出无统计依据的偏移 */
const MIN_REGION_SAMPLES = 8;
/** 残余高差告警阈值（米）：超过则认为「单一平移明显贴不齐」，主动告知用户 */
const RESIDUAL_WARN_SPAN = 50;
/** 瓦片树遍历节点数上限（防御超大内联树卡死主线程） */
const MAX_TREE_VISITS = 20000;

export interface TilesetBaseSample {
    lonRad: number;
    latRad: number;
    baseH: number;
    tight: boolean;
    weight?: number;
}

/** 已排序数组的分位数（线性插值） */
function sortedPercentile(sorted: number[], p: number): number {
    if (!sorted.length) return NaN;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** 等步长抽稀到不超过 max 个（瓦片树叶子多按空间块序排列，步长抽稀即保持空间分布） */
function decimate<T>(arr: T[], max: number): T[] {
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
function bvToBaseSample(bv: any, M: any, Cesium: any): TilesetBaseSample | null {
    if (!bv || typeof bv !== 'object') return null;

    if (Array.isArray(bv.region) && bv.region.length >= 6) {
        const r = bv.region.map(Number);
        if (!r.slice(0, 5).every(Number.isFinite)) return null;
        // weight = 水平足迹面积（弧度²×cos(lat)），供面积加权分位数使用
        const area = Math.abs((r[2] - r[0]) * (r[3] - r[1])) * Math.cos((r[1] + r[3]) / 2);
        return {
            lonRad: (r[0] + r[2]) / 2,
            latRad: (r[1] + r[3]) / 2,
            baseH: r[4],
            tight: true,
            weight: Number.isFinite(area) && area > 0 ? area : undefined,
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
        // 水平足迹面积 ≈ 4·|hX|·|hY|（忽略倾斜，仅作相对权重）
        const hx = Math.hypot(b[3], b[4], b[5]);
        const hy = Math.hypot(b[6], b[7], b[8]);
        const area = 4 * hx * hy;
        return {
            lonRad: cc.longitude,
            latRad: cc.latitude,
            baseH: minH,
            tight: true,
            weight: Number.isFinite(area) && area > 0 ? area : undefined,
        };
    }

    if (Array.isArray(bv.sphere) && bv.sphere.length >= 4) {
        const s = bv.sphere.map(Number);
        if (!s.every(Number.isFinite)) return null;
        const centerWorld = Cesium.Matrix4.multiplyByPoint(
            M, new Cesium.Cartesian3(s[0], s[1], s[2]), new Cesium.Cartesian3());
        const cc = Cesium.Cartographic.fromCartesian(centerWorld);
        if (!cc) return null;
        // 球兜底仅作相对权重：水平投影面积 ≈ πr²
        const area = Math.PI * s[3] * s[3];
        return {
            lonRad: cc.longitude,
            latRad: cc.latitude,
            baseH: cc.height - s[3],
            tight: false,
            weight: Number.isFinite(area) && area > 0 ? area : undefined,
        };
    }

    return null;
}

/**
 * 遍历 tileset JSON 树，收集所有叶子节点的基底采样（迭代式 + 访问上限，防爆栈/卡死）
 * transform 为列主序 16 数，沿祖先链累乘（region 不受其影响，box/sphere 受）。
 */
function collectJsonLeafSamples(rootNode: any, Cesium: any): TilesetBaseSample[] {
    const out: TilesetBaseSample[] = [];
    const stack: Array<{ node: any; M: any }> = [{ node: rootNode, M: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY) }];
    let visited = 0;

    while (stack.length && visited < MAX_TREE_VISITS) {
        const item = stack.pop();
        if (!item) break;
        const { node, M } = item;
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
function collectRuntimeLeafSamples(tileset: any, Cesium: any): TilesetBaseSample[] {
    const out: TilesetBaseSample[] = [];
    try {
        if (!tileset?.root) return out;
        const stack: any[] = [tileset.root];
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
        console.warn('[贴地] 运行时瓦片树遍历失败:', e instanceof Error ? e.message : e);
    }
    return out;
}

/** 受保护地 fetch 并解析根 tileset.json（file://、http(s)、blob 均可尝试；失败返回 null） */
export async function fetchTilesetJson(url: any) {
    if (!url) return null;
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

export interface CollectBaseSamplesParams {
    tileset: any;
    Cesium: any;
    rootJson?: any;
    rootJsonUrl?: string | null;
}

/**
 * 汇总基底采样：JSON 树（已解析 > fetch）→ 运行时树；紧包围盒优先、合理性过滤、抽稀。
 * @returns {Promise<{samples:Array, source:string}>}
 */
export async function collectTilesetBaseSamples({
    tileset,
    Cesium,
    rootJson,
    rootJsonUrl,
}: CollectBaseSamplesParams) {
    let raw: TilesetBaseSample[] = [];
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
 * 批量地形采样已收编至共享网关 terrainSampling.js（含 availability 兼容链与
 * 层级阶梯降级），本文件仅作转发引用，保持调用点不变。
 * 详见 Docs/Architecture/2026-08-22-clamp-to-ground-strategy.md
 */

/**
 * 核心估计：叶子基底 × 地形逐点配对，返回分位数偏移 + MAD（离散度）+ 残余高差。
 *
 * **为什么不再是中位数**：单一刚性平移无法同时满足「不嵌入」与「不悬空」，
 * 二者下界由 d = terrain − baseH 的跨度决定。中位数最小化的是平均绝对误差，
 * 会把误差均分两侧 → 一半基底埋在坡里（10 km²/400 m 高差场景实测嵌入率 50%、
 * 最大埋深 148 m）。人眼对「被埋」远比对「略悬空」敏感，故默认取 **p75**：
 * 嵌入率降到 25%，代价是谷地出现可见悬空。可按需调 `fitQuantile`。
 *
 * @param {Array} samples 基底采样 [{ lonRad, latRad, baseH, weight? }]
 * @param {object} viewer
 * @param {object} Cesium
 * @param {object} [options]
 * @param {number} [options.quantile] 分位数（0~1），默认 DEFAULT_FIT_QUANTILE
 * @param {{west:number,south:number,east:number,north:number}|null} [options.region]
 *        目标区域（**度**）；给定时只用落在框内的采样点估算（区域化贴合）
 * @returns {Promise<{offset:number, mad:number, count:number, terrainElevation:Object,
 *   residual:Object, quantile:number, regionApplied:boolean}|null>}
 */
export async function estimateTerrainOffset(samples: any, viewer: any, Cesium: any, options: any = {}) {
    const quantile = Number.isFinite(Number(options?.quantile))
        ? Math.min(1, Math.max(0, Number(options.quantile)))
        : DEFAULT_FIT_QUANTILE;
    const region = options?.region || null;

    // ── 区域过滤（区域化贴合）：只保留落在目标框内的基底采样 ──
    let usable = samples;
    let regionApplied = false;
    if (region && Cesium?.Math) {
        const w = Cesium.Math.toRadians(Number(region.west));
        const e = Cesium.Math.toRadians(Number(region.east));
        const s = Cesium.Math.toRadians(Number(region.south));
        const n = Cesium.Math.toRadians(Number(region.north));
        if ([w, e, s, n].every(Number.isFinite)) {
            const inRegion = samples.filter(
                (it: any) => it.lonRad >= w && it.lonRad <= e && it.latRad >= s && it.latRad <= n,
            );
            // 命中过少（框太小 / 数据不在框内）→ 退回全量，避免给出无统计依据的偏移
            if (inRegion.length >= MIN_REGION_SAMPLES) {
                usable = inRegion;
                regionApplied = true;
            } else {
                console.warn('[贴地] 目标区域内基底采样不足（', inRegion.length,
                    '点 <', MIN_REGION_SAMPLES, '），退回整幅估算');
            }
        }
    }

    const cartos = usable.map((s: any) => new Cesium.Cartographic(s.lonRad, s.latRad, 0));
    const results = await sampleTerrainBatch(viewer, Cesium, cartos);
    if (!results) return null;

    /** 配对结果：d = 地形高 − 基底高；w = 该叶子的水平足迹面积（缺省等权） */
    const pairs: Array<{ d: number; w: number }> = [];
    const terrainHs: number[] = [];
    for (let i = 0; i < results.length; i++) {
        const t = Number(results[i]?.height);
        if (!Number.isFinite(t)) continue;
        terrainHs.push(t);
        pairs.push({
            d: t - usable[i].baseH,
            w: Math.max(1e-6, Number(usable[i].weight) || 1),
        });
    }
    if (!pairs.length) return null;

    /**
     * 「整批地形高程全为 0」防御：地形瓦片尚未就绪时，部分 provider（含自定义
     * GeoTerrainProvider / 刚切换地形的窗口期）会以椭球 0 占位返回。若此时数据基底
     * 明显不在地表 0（如倾斜摄影底部 50 m），据此配对得到的 offset ≈ −50 m 会把整栋
     * 模型下压到真实地表以下——即用户看到的「导入后沉到地形下面」。
     * 判据：全部采样 ≈ 0 且基底显著非 0 → 视为采样不可用，保持原始位置。
     */
    const allTerrainZero = terrainHs.every((h) => Math.abs(h) < 1e-6);
    const baseSignificantlyNonZero = usable.some(
        (s: any) => Number.isFinite(s?.baseH) && Math.abs(s.baseH) > 1,
    );
    if (allTerrainZero && baseSignificantlyNonZero) {
        console.warn(
            '[贴地] 地形采样全为 0（疑似地形瓦片未就绪），跳过自动贴地以保持数据原始位置；',
            '可在地形加载完成后用「贴合地形」或高程滑杆手动校正',
        );
        return null;
    }

    pairs.sort((a, b) => a.d - b.d);
    terrainHs.sort((a, b) => a - b);

    // 面积加权分位数：让大块叶子（真实占地面积大）主导，避免高密度小瓦片拉偏结果
    const offset = weightedQuantile(pairs, quantile);
    const absDev = pairs.map((it) => Math.abs(it.d - offset)).sort((a, b) => a - b);
    const mad = sortedPercentile(absDev, 0.5);

    // 残余高差画像：把「单一平移贴不齐」的事实量化出来，供 UI 显式告知用户
    const dMin = pairs[0].d;
    const dMax = pairs[pairs.length - 1].d;
    const embedded = pairs.filter((it) => it.d - offset > 0);
    const residual = {
        min: dMin,
        max: dMax,
        span: dMax - dMin,
        quantile,
        /** 估算嵌入率（基底低于地形的采样占比） */
        embedRate: embedded.length / pairs.length,
        /** 估算最大埋深（米） */
        maxEmbed: embedded.length ? embedded[embedded.length - 1].d - offset : 0,
        /** 估算最大悬空（米） */
        maxFloat: Math.max(0, offset - dMin),
        regionApplied,
    };

    return {
        offset,
        mad,
        count: pairs.length,
        quantile,
        residual,
        regionApplied,
        terrainElevation: {
            min: terrainHs[0],
            max: terrainHs[terrainHs.length - 1],
            centerHeight: sortedPercentile(terrainHs, 0.5),
        },
    };
}

/**
 * 面积加权分位数（pairs 需已按 d 升序）。
 * @param {Array<{d:number,w:number}>} pairs 配对结果
 * @param {number} p 分位（0~1）
 * @returns {number} 该分位对应的 d 值
 */
function weightedQuantile(pairs: Array<{ d: number; w: number }>, p: number) {
    if (!pairs.length) return NaN;
    const total = pairs.reduce((acc: number, it) => acc + it.w, 0);
    if (!(total > 0)) return pairs[Math.floor((pairs.length - 1) * p)]?.d ?? NaN;
    const target = total * p;
    let acc = 0;
    for (const it of pairs) {
        acc += it.w;
        if (acc >= target) return it.d;
    }
    return pairs[pairs.length - 1].d;
}

/**
 * 根 region 单点退化路径（叶子采样全军覆没时）：等价旧算法精度，仍走统一配对管线。
 * 不可信时回退包围球心高（**不减半径**——城市级瓦片集球半径由水平跨度主导，
 * 减半径会得到比真实基底低数千米的伪值），且仅供滑杆参照、不触发自动平移。
 *
 * @returns {{ baseHeight:number, reliable:boolean, source:string }}
 */
export function resolveTilesetBaseHeight(tileset: any, Cesium: any, rootJson: any = null) {
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

/** 构造沿模型中心点径向方向（地心→模型中心）的垂直平移矩阵 */
export function buildVerticalTranslation(Cesium: any, modelCenter: any, offsetMeters: number) {
    const up = Cesium.Cartesian3.normalize(modelCenter, new Cesium.Cartesian3());
    const translation = Cesium.Cartesian3.multiplyByScalar(up, offsetMeters, new Cesium.Cartesian3());
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
export interface FitTilesetToTerrainParams {
    tileset: any;
    viewer: any;
    Cesium: any;
    rootJson?: any;
    rootJsonUrl?: string | null;
    message?: { warning?: (msg: string) => any } | null;
    region?: { west: number; south: number; east: number; north: number } | null;
    fitQuantile?: number;
}

export async function fitTilesetToTerrain({
    tileset,
    viewer,
    Cesium,
    rootJson = null,
    rootJsonUrl = null,
    message = null,
    region = null,
    fitQuantile = DEFAULT_FIT_QUANTILE,
}: FitTilesetToTerrainParams) {
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
    const baseHs = samples.map((s) => s.baseH).sort((a: number, b: number) => a - b);
    // 滑杆参照的"模型底部海拔"：p5 而非绝对最小，抗个别坏包围盒
    const bottomH = reliable ? sortedPercentile(baseHs, 0.05) : carto.height;

    // ---- 2. 逐点配对 + 中位数配准 ----
    let appliedOffset = 0;
    let terrainElevation: any = null;
    /** 残余高差画像（单一平移的固有限制），随记录保存供 UI 提示 */
    let fitResidual: any = null;

    if (!hasRealTerrain) {
        // 无真实地形时不做任何平移：数据自带海拔即它应该在的位置，椭球 0 ≠ 数据真实海拔，
        // 强制拉到 0 会让模型偏离真实位置，并污染 modelMatrix 导致后续滑杆坐标系漂移。
        // 用户切换真实地形时由 refitTilesetToTerrain 自动重贴到正确地表。
        console.warn('[贴地] 无真实地形，保持数据原始位置（底部海拔', bottomH.toFixed(1), 'm）');
    } else if (!reliable) {
        console.warn('[贴地] 无可用基底采样，跳过自动贴地，可用高程滑杆手动调整');
        message?.warning?.('无法解析数据基底高度，已按原始位置放置，可用卡片高程滑杆微调');
    } else {
        const est = await estimateTerrainOffset(samples, viewer, Cesium, { region, quantile: fitQuantile });
        if (!est) {
            console.warn('[贴地] 地形采样不可用，保持数据原始位置');
            message?.warning?.('地形高程采样失败，已按数据原始高度放置，可用卡片高程滑杆微调');
        } else {
            terrainElevation = est.terrainElevation;
            fitResidual = est.residual;
            if (est.residual?.span > RESIDUAL_WARN_SPAN) {
                // 单一刚性平移的固有局限：把残余高差显式告知，避免用户误以为是"没贴好"
                console.warn('[贴地] 区域高差', est.residual.span.toFixed(0),
                    'm，分位 p', (est.quantile * 100).toFixed(0),
                    '→ 估算嵌入率', (est.residual.embedRate * 100).toFixed(0),
                    '%，最大埋深', est.residual.maxEmbed.toFixed(0),
                    'm，最大悬空', est.residual.maxFloat.toFixed(0), 'm');
                message?.warning?.(
                    `区域高差约 ${est.residual.span.toFixed(0)} m，单一平移无法完全贴合：`
                    + `约 ${(est.residual.embedRate * 100).toFixed(0)}% 区域最大埋深 ${est.residual.maxEmbed.toFixed(0)} m。`
                    + '可用「贴合到当前视野」分区校正，或用高程滑杆微调',
                );
            }
            if (Math.abs(est.offset) > MAX_AUTO_FIT_OFFSET) {
                console.warn('[贴地] 修正量', est.offset.toFixed(0), 'm 超出上限，疑似坐标系错误，跳过自动贴地');
                message?.warning?.('数据与地形高差异常，已按原始位置放置，请检查数据坐标系');
            } else {
                // 积极贴地：即便偏差小（<= 原先死区），也尝试施加分位数偏移，使模型更贴合地形
                appliedOffset = est.offset;
                tileset.modelMatrix = buildVerticalTranslation(
                    Cesium, tileset.boundingSphere.center, appliedOffset,
                );
                // 同步更新 _originMatrix 使后续 setTilesetHeight 基于新的基准矩阵（避免累积偏移）
                tileset._originMatrix = Cesium.Matrix4.clone(tileset.modelMatrix);
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
        /** 残余高差 { min, max, span, quantile, embedRate, maxEmbed, maxFloat, regionApplied } */
        fitResidual,
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
 * - 切回椭球地形：保持数据原始位置（椭球 0 ≠ 数据真实海拔，强制归零反而漂移）；
 * - 采样失败/修正量超限：保持当前位置，不做破坏性移动。
 *
 * @param {Object} p
 * @param {Object} p.record - loadedDataSources 中的 3dtiles 记录（就地更新高度字段）
 * @param {Cesium.Cesium3DTileset} p.tileset - 已 toRaw 的 tileset 实例
 * @param {Cesium.Viewer} p.viewer
 * @param {Cesium} p.Cesium
 * @returns {Promise<boolean>} 是否施加了新的贴地平移
 */
export interface RefitTilesetToTerrainParams {
    record: any;
    tileset: any;
    viewer: any;
    Cesium: any;
    region?: { west: number; south: number; east: number; north: number } | null;
    fitQuantile?: number;
}

export async function refitTilesetToTerrain({
    record,
    tileset,
    viewer,
    Cesium,
    region = null,
    fitQuantile = DEFAULT_FIT_QUANTILE,
}: RefitTilesetToTerrainParams) {
    const samples = record?.terrainFitSamples;
    const geo = record?.tilesetGeo;
    if (!Array.isArray(samples) || !samples.length || !geo || !tileset) {
        console.warn('[贴地] 重贴地跳过: 记录缺少基底采样（导入时解析失败的数据请用高程滑杆）');
        return false;
    }

    const hasRealTerrain = !!viewer.terrainProvider
        && viewer.terrainProvider.constructor !== Cesium.EllipsoidTerrainProvider;

    // 两个值都只在「有真实地形」分支内被赋值与使用；椭球分支提前 return，
    // 故不设初值（避免 no-useless-assignment）
    let offset: number;
    let terrainElevation: { min: number; max: number; centerHeight: number } | null;

    if (hasRealTerrain) {
        const est = await estimateTerrainOffset(samples, viewer, Cesium, { region, quantile: fitQuantile });
        if (!est) {
            console.warn('[贴地] 重贴地: 新地形采样失败，保持当前位置');
            return false;
        }
        if (Math.abs(est.offset) > MAX_AUTO_FIT_OFFSET) {
            console.warn('[贴地] 重贴地: 修正量', est.offset.toFixed(0), 'm 超出上限，疑似坐标系错误，跳过');
            return false;
        }
        // 积极贴地：直接采用分位数偏移（如需保留死区逻辑，可将 TERRAIN_FIT_DEADBAND 恢复为 >0）
        offset = est.offset;
        terrainElevation = est.terrainElevation;
        record.fitResidual = est.residual;
        console.warn('[贴地] 地形切换重贴:', est.count, '点配对, p', (est.quantile * 100).toFixed(0),
            '分位差', est.offset.toFixed(1), 'm (MAD=', est.mad.toFixed(1),
            'm, 区域高差', Number(est.residual?.span || 0).toFixed(0),
            'm) → 施加', offset.toFixed(1), 'm');
    } else {
        // 切回椭球地形：保持数据原始位置，不做破坏性移动。
        // 椭球 0 ≠ 数据真实海拔，强制归零会污染 modelMatrix 导致后续滑杆坐标系漂移。
        // 同时必须跳过 _originMatrix 重置——否则下次拖动滑杆时会基于 identity 复合偏移，
        // 导致模型高度跳跃（_originMatrix 应始终基于原始导入位姿，地形切换不改变它）。
        console.warn('[贴地] 切回椭球地形，保持数据原始位置（底部海拔', geo.bottomH.toFixed(1), 'm）');
        record.currentBaseHeight = geo.bottomH;
        geo.initialBaseHeight = geo.bottomH;
        return true;
    }

    tileset.modelMatrix = offset === 0
        ? Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY)
        : buildVerticalTranslation(Cesium, tileset.boundingSphere.center, offset);

    // 同步更新 _originMatrix：setTilesetHeight 左乘平移矩阵时以它为基准，
    // 地形切换后基准必须刷新，否则下次拖动会基于旧基准复合，产生累积漂移。
    if (tileset._originMatrix) {
        tileset._originMatrix = Cesium.Matrix4.clone(tileset.modelMatrix);
    }

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
export async function sampleTerrainElevationRange(tileset: any, viewer: any, Cesium: any) {
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
        const positions: any[] = [];
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
        let centerHeight: number;

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
        console.warn('[贴地] 高程范围采样失败:', e instanceof Error ? e.message : e);
        return null;
    }
}
