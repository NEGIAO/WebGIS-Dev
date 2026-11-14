/**
 * 功能名称：3D Tiles 地形自适应（贴地 2.0）
 * 日    期：2026/11/13
 *
 * 从 tilesetLoader 拆出：叶子包围盒基底采样 × 地形逐点配对 → 中位数配准，
 * 含死区/上限保护与滑杆回填；fit/refit 为对外契约（useCesiumLayers / tilesetGroundStrategy）。
 */

import { sampleTerrainBatch } from '../../../terrain/terrainSampling';
import {
    buildVerticalTranslation,
    collectTilesetBaseSamples,
    fetchTilesetJson,
    resolveTilesetBaseHeight,
    sortedPercentile,
    weightedQuantile,
    type CollectBaseSamplesParams,
    type TilesetBaseSample,
} from './tilesetLeafSampling';

export {
    buildVerticalTranslation,
    collectTilesetBaseSamples,
    fetchTilesetJson,
    resolveTilesetBaseHeight,
    type CollectBaseSamplesParams,
    type TilesetBaseSample,
};

/** 自动贴地允许的最大修正量（米）：超过大概率是坐标系/投影错误，垂直平移修不了 */
const MAX_AUTO_FIT_OFFSET = 5000;
/**
 * 贴地估算的默认分位数。
 * 取 0.75 而非 0.5：单一刚性平移无法同时消除嵌入与悬空，而「被埋」比「略悬空」更刺眼。
 */
const DEFAULT_FIT_QUANTILE = 0.75;
/** 区域化贴合的采样下限：低于该点数退回整幅估算，避免小框给出无统计依据的偏移 */
const MIN_REGION_SAMPLES = 8;
/** 残余高差告警阈值（米）：超过则认为「单一平移明显贴不齐」，主动告知用户 */
const RESIDUAL_WARN_SPAN = 50;

/**
 * 核心估计：叶子基底 × 地形逐点配对，返回分位数偏移 + MAD（离散度）+ 残余高差。
 */
export async function estimateTerrainOffset(samples: any, viewer: any, Cesium: any, options: any = {}) {
    const quantile = Number.isFinite(Number(options?.quantile))
        ? Math.min(1, Math.max(0, Number(options.quantile)))
        : DEFAULT_FIT_QUANTILE;
    const region = options?.region || null;

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
            if (inRegion.length >= MIN_REGION_SAMPLES) {
                usable = inRegion;
                regionApplied = true;
            } else {
                console.warn(
                    '[贴地] 目标区域内基底采样不足（',
                    inRegion.length,
                    '点 <',
                    MIN_REGION_SAMPLES,
                    '），退回整幅估算',
                );
            }
        }
    }

    const cartos = usable.map((s: any) => new Cesium.Cartographic(s.lonRad, s.latRad, 0));
    const results = await sampleTerrainBatch(viewer, Cesium, cartos);
    if (!results) return null;

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

    const offset = weightedQuantile(pairs, quantile);
    const absDev = pairs.map((it) => Math.abs(it.d - offset)).sort((a, b) => a - b);
    const mad = sortedPercentile(absDev, 0.5);

    const dMin = pairs[0].d;
    const dMax = pairs[pairs.length - 1].d;
    const embedded = pairs.filter((it) => it.d - offset > 0);
    const residual = {
        min: dMin,
        max: dMax,
        span: dMax - dMin,
        quantile,
        embedRate: embedded.length / pairs.length,
        maxEmbed: embedded.length ? embedded[embedded.length - 1].d - offset : 0,
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

    const hasRealTerrain =
        !!viewer.terrainProvider &&
        viewer.terrainProvider.constructor !== Cesium.EllipsoidTerrainProvider;

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
    const bottomH = reliable ? sortedPercentile(baseHs, 0.05) : carto.height;

    let appliedOffset = 0;
    let terrainElevation: any = null;
    let fitResidual: any = null;

    if (!hasRealTerrain) {
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
                console.warn(
                    '[贴地] 区域高差',
                    est.residual.span.toFixed(0),
                    'm，分位 p',
                    (est.quantile * 100).toFixed(0),
                    '→ 估算嵌入率',
                    (est.residual.embedRate * 100).toFixed(0),
                    '%，最大埋深',
                    est.residual.maxEmbed.toFixed(0),
                    'm，最大悬空',
                    est.residual.maxFloat.toFixed(0),
                    'm',
                );
                message?.warning?.(
                    `区域高差约 ${est.residual.span.toFixed(0)} m，单一平移无法完全贴合：` +
                        `约 ${(est.residual.embedRate * 100).toFixed(0)}% 区域最大埋深 ${est.residual.maxEmbed.toFixed(0)} m。` +
                        '可用「贴合到当前视野」分区校正，或用高程滑杆微调',
                );
            }
            if (Math.abs(est.offset) > MAX_AUTO_FIT_OFFSET) {
                console.warn('[贴地] 修正量', est.offset.toFixed(0), 'm 超出上限，疑似坐标系错误，跳过自动贴地');
                message?.warning?.('数据与地形高差异常，已按原始位置放置，请检查数据坐标系');
            } else {
                appliedOffset = est.offset;
                tileset.modelMatrix = buildVerticalTranslation(
                    Cesium,
                    tileset.boundingSphere.center,
                    appliedOffset,
                );
                tileset._originMatrix = Cesium.Matrix4.clone(tileset.modelMatrix);
                console.warn(
                    '[贴地] 中位配准:',
                    est.count,
                    '点, 底部',
                    bottomH.toFixed(1),
                    'm',
                    est.offset > 0 ? '抬升' : '下沉',
                    Math.abs(est.offset).toFixed(1),
                    'm (MAD=',
                    est.mad.toFixed(1),
                    'm, 来源:',
                    source,
                    ')',
                );
            }
        }
    }

    if (hasRealTerrain && !terrainElevation) {
        terrainElevation = await sampleTerrainElevationRange(tileset, viewer, Cesium);
    }

    const currentBaseHeight = bottomH + appliedOffset;
    return {
        terrainElevation,
        tilesetGeo: { lng, lat, bottomH, initialBaseHeight: currentBaseHeight },
        currentBaseHeight,
        baseSamples: samples,
        fitResidual,
    };
}

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

    const hasRealTerrain =
        !!viewer.terrainProvider &&
        viewer.terrainProvider.constructor !== Cesium.EllipsoidTerrainProvider;

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
        offset = est.offset;
        terrainElevation = est.terrainElevation;
        record.fitResidual = est.residual;
        console.warn(
            '[贴地] 地形切换重贴:',
            est.count,
            '点配对, p',
            (est.quantile * 100).toFixed(0),
            '分位差',
            est.offset.toFixed(1),
            'm (MAD=',
            est.mad.toFixed(1),
            'm, 区域高差',
            Number(est.residual?.span || 0).toFixed(0),
            'm) → 施加',
            offset.toFixed(1),
            'm',
        );
    } else {
        console.warn('[贴地] 切回椭球地形，保持数据原始位置（底部海拔', geo.bottomH.toFixed(1), 'm）');
        record.currentBaseHeight = geo.bottomH;
        geo.initialBaseHeight = geo.bottomH;
        return true;
    }

    tileset.modelMatrix =
        offset === 0
            ? Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY)
            : buildVerticalTranslation(Cesium, tileset.boundingSphere.center, offset);

    if (tileset._originMatrix) {
        tileset._originMatrix = Cesium.Matrix4.clone(tileset.modelMatrix);
    }

    record.currentBaseHeight = geo.bottomH + offset;
    geo.initialBaseHeight = record.currentBaseHeight;
    if (terrainElevation) record.terrainElevation = terrainElevation;
    return true;
}

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

        const spanX = radius * 2;
        const spanY = radius * 2;

        const TARGET_SPACING = 60;
        const MIN_SIZE = 8;
        const MAX_SIZE = 48;
        let size = Math.ceil(Math.max(spanX, spanY) / TARGET_SPACING) + 1;
        size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));

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

        const results = await sampleTerrainBatch(viewer, Cesium, positions);
        if (!results) return null;

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

        const centerIdx = Math.floor(size / 2) * size + Math.floor(size / 2);
        if (centerIdx < results.length && Number.isFinite(Number(results[centerIdx]?.height))) {
            centerHeight = results[centerIdx].height;
        } else {
            centerHeight = (min + max) / 2;
        }

        console.warn(
            '[贴地] ENU网格采样: size=',
            size,
            '×',
            size,
            ', span=',
            spanX.toFixed(0),
            'm×',
            spanY.toFixed(0),
            'm',
            ', range=[',
            min.toFixed(1),
            ', ',
            max.toFixed(1),
            ']m, center=',
            centerHeight.toFixed(1),
            'm',
        );

        return { min, max, centerHeight };
    } catch (e) {
        console.warn('[贴地] 高程范围采样失败:', e instanceof Error ? e.message : e);
        return null;
    }
}
