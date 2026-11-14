/**
 * 功能名称：3D Tiles 瓦片树叶子基底采样与统计分位数辅助
 * 说明：从 tilesetTerrainFit 拆出，承载 JSON/运行时瓦片树遍历、包围盒（region/box/sphere）
 *       基底提取、抽稀及加权分位数计算。
 */

/** 基底高合理性下限（米，死海以下视为转换器伪值） */
export const MIN_SANE_BASE_HEIGHT = -450;
/** 基底高合理性上限（米，高于全球最高城市数据视为伪值） */
export const MAX_SANE_BASE_HEIGHT = 9000;
/** region 垂直跨度合理性上限（米）：超过视为伪值 */
export const MAX_SANE_VERTICAL_SPAN = 10000;
/** 参与地形配对的采样点上限（sampleTerrainMostDetailed 单批规模） */
export const MAX_PAIR_SAMPLES = 256;
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
export function sortedPercentile(sorted: number[], p: number): number {
    if (!sorted.length) return NaN;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** 面积加权分位数（pairs 需已按 d 升序） */
export function weightedQuantile(pairs: Array<{ d: number; w: number }>, p: number): number {
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

/** 等步长抽稀到不超过 max 个 */
function decimate<T>(arr: T[], max: number): T[] {
    if (arr.length <= max) return arr;
    const step = arr.length / max;
    const out = [];
    for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
    return out;
}

/**
 * 从单个 boundingVolume（3D Tiles JSON 原始结构）提取基底采样
 */
function bvToBaseSample(bv: any, M: any, Cesium: any): TilesetBaseSample | null {
    if (!bv || typeof bv !== 'object') return null;

    if (Array.isArray(bv.region) && bv.region.length >= 6) {
        const r = bv.region.map(Number);
        if (!r.slice(0, 5).every(Number.isFinite)) return null;
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
            M,
            new Cesium.Cartesian3(b[0], b[1], b[2]),
            new Cesium.Cartesian3(),
        );
        const cc = Cesium.Cartographic.fromCartesian(centerWorld);
        if (!cc || !Number.isFinite(minH)) return null;
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
            M,
            new Cesium.Cartesian3(s[0], s[1], s[2]),
            new Cesium.Cartesian3(),
        );
        const cc = Cesium.Cartographic.fromCartesian(centerWorld);
        if (!cc) return null;
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
 * 遍历 tileset JSON 树，收集所有叶子节点的基底采样
 */
function collectJsonLeafSamples(rootNode: any, Cesium: any): TilesetBaseSample[] {
    const out: TilesetBaseSample[] = [];
    const stack: Array<{ node: any; M: any }> = [
        { node: rootNode, M: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY) },
    ];
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
                M,
                Cesium.Matrix4.fromColumnMajorArray(node.transform),
                new Cesium.Matrix4(),
            );
        }

        const kids = Array.isArray(node.children) ? node.children : [];
        if (kids.length === 0) {
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
 * 运行时瓦片树兜底
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
            const bv =
                (!Array.isArray(header?.content) ? header?.content?.boundingVolume : null) ||
                header?.boundingVolume;
            const M = tile.computedTransform || Cesium.Matrix4.IDENTITY;
            const sample = bvToBaseSample(bv, M, Cesium);
            if (sample) out.push(sample);
        }
    } catch (e) {
        console.warn('[贴地] 运行时瓦片树遍历失败:', e instanceof Error ? e.message : e);
    }
    return out;
}

/** 受保护地 fetch 并解析根 tileset.json */
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

    const tightOnly = raw.filter((s) => s.tight);
    let picked = tightOnly.length ? tightOnly : raw;

    picked = picked.filter(
        (s) =>
            Number.isFinite(s.lonRad) &&
            Number.isFinite(s.latRad) &&
            Number.isFinite(s.baseH) &&
            s.baseH > MIN_SANE_BASE_HEIGHT &&
            s.baseH < MAX_SANE_BASE_HEIGHT,
    );

    const samples = decimate(picked, MAX_PAIR_SAMPLES);
    console.warn(
        '[贴地] 基底采样: 叶子',
        raw.length,
        '个 → 参与配对',
        samples.length,
        '点（来源:',
        source,
        tightOnly.length ? ', 紧包围盒' : ', sphere兜底',
        '）',
    );
    return { samples, source };
}

/**
 * 根 region 单点退化路径
 */
export function resolveTilesetBaseHeight(tileset: any, Cesium: any, rootJson: any = null) {
    const region =
        rootJson?.root?.boundingVolume?.region ||
        tileset?.root?._header?.boundingVolume?.region ||
        null;
    if (Array.isArray(region) && region.length >= 6) {
        const minH = Number(region[4]);
        const maxH = Number(region[5]);
        const sane =
            Number.isFinite(minH) &&
            Number.isFinite(maxH) &&
            minH > MIN_SANE_BASE_HEIGHT &&
            maxH >= minH &&
            maxH - minH < MAX_SANE_VERTICAL_SPAN;
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
