/**
 * groundPlacementService.ts — 贴地统一门面（**唯一对外入口**）
 *
 * 调用方（导入主流程 / TOC 动作 / 容器 adapter）只认本门面，不认数据类型：
 * ```
 * applyOnImport(ctx)     导入期自动贴地（地形未就绪 → 入队，返回 deferred）
 * fitGroundPlacement(ctx) 用户显式「贴合地形」
 * resetGroundPlacement(ctx) 用户显式「恢复原始高程」
 * setGroundOffset(ctx, m) 高程滑杆
 * getGroundOffset(ctx)    滑杆当前值
 * reapplyAllOnTerrainChange(...) 地形切换统一补做
 * flushPendingGroundFits(...)    地形就绪后冲刷队列
 * ```
 *
 * 设计约束：
 * - 类型差异只在 `strategies/*` 里；
 * - 能力声明只在 `groundPlacementCapabilities` 里；
 * - 时序判断只在 `terrainReadiness` 里。
 * 本文件只做编排与结果归一。
 */

import {
    GROUND_MODE,
    GROUND_REASON,
    groundFail,
    groundOk,
    getGroundCapability,
} from './groundPlacementCapabilities';
import type {
    GroundCapability,
    GroundCtx,
    GroundResult,
} from './groundPlacementCapabilities';
import {
    findMissingStrategies,
    getStrategy,
    registerStrategy,
} from './groundPlacementRegistry';
import {
    deferGroundFit,
    isTerrainReady,
    pendingGroundFitCount,
    takePendingGroundFits,
} from './terrainReadiness';
import { createVectorGroundStrategy } from './strategies/vectorGroundStrategy';
import { createTilesetGroundStrategy } from './strategies/tilesetGroundStrategy';
import { createModelGroundStrategy } from './strategies/modelGroundStrategy';

// ────────────────────────── 策略注册（模块加载即完成） ──────────────────────────
registerStrategy(createVectorGroundStrategy());
registerStrategy(createTilesetGroundStrategy());
registerStrategy(createModelGroundStrategy());

/**
 * 启动自检：能力表声明「需要贴地」但没有策略实现的类型。
 * 供容器初始化时调用一次，把「接入未完成」暴露成 warn 而不是运行时静默。
 * @returns 缺失实现的类型
 */
export function assertGroundPlacementRegistry(): string[] {
    const missing = findMissingStrategies();
    if (missing.length) {
        console.warn('[GroundPlacement] 以下类型在能力表中声明需要贴地，但缺少策略实现:', missing);
    }
    return missing;
}

/**
 * 取某类型的贴地能力（TOC 菜单 / 样式页签用）。
 * 未登记类型返回 null，调用方据此不渲染入口。
 */
export function getGroundPlacementCapability(type: string): GroundCapability | null {
    return getGroundCapability(type);
}

/**
 * 导入期自动贴地。
 * 地形未就绪时**入队**并返回 `deferred`，等地形就绪后由 flush 统一补做——
 * 这是「导入成功却看不见」的历史根因所在，必须由门面统一处理。
 */
export async function applyOnImport(ctx: GroundCtx): Promise<GroundResult> {
    const strategy = getStrategy(ctx?.record?.type);
    if (!strategy) return groundFail(GROUND_REASON.UNSUPPORTED);
    if (strategy.capability.mode === GROUND_MODE.NONE) {
        return groundOk({ skipped: true });
    }
    if (!isTerrainReady(ctx.viewer, ctx.Cesium)) {
        deferGroundFit(ctx);
        return groundFail(GROUND_REASON.DEFERRED);
    }
    return strategy.fit(ctx);
}

/**
 * 用户显式「贴合地形」。
 * 与 applyOnImport 的差别：地形未就绪时**不入队**，直接返回 `terrain-off`
 * 让宿主立刻提示「请先开启真实地形」。
 */
export async function fitGroundPlacement(ctx: GroundCtx): Promise<GroundResult> {
    const strategy = getStrategy(ctx?.record?.type);
    if (!strategy) return groundFail(GROUND_REASON.UNSUPPORTED);
    if (!strategy.capability.supportsFit) return groundFail(GROUND_REASON.UNSUPPORTED);
    if (!isTerrainReady(ctx.viewer, ctx.Cesium)) return groundFail(GROUND_REASON.TERRAIN_OFF);
    return strategy.fit(ctx);
}

/** 用户显式「恢复原始高程」 */
export function resetGroundPlacement(ctx: GroundCtx): GroundResult {
    const strategy = getStrategy(ctx?.record?.type);
    if (!strategy) return groundFail(GROUND_REASON.UNSUPPORTED);
    if (!strategy.capability.supportsReset) return groundFail(GROUND_REASON.UNSUPPORTED);
    return strategy.reset(ctx);
}

/** 高程滑杆：写入偏移（null = 复位） */
export function setGroundOffset(ctx: GroundCtx, meters: number | null): GroundResult {
    const strategy = getStrategy(ctx?.record?.type);
    if (!strategy) return groundFail(GROUND_REASON.UNSUPPORTED);
    if (!strategy.capability.supportsOffset || !strategy.setOffset) {
        return groundFail(GROUND_REASON.UNSUPPORTED);
    }
    return strategy.setOffset(ctx, meters);
}

/** 高程滑杆：读取当前值（TOC 节点 baseHeight） */
export function getGroundOffset(ctx: GroundCtx): number {
    const strategy = getStrategy(ctx?.record?.type);
    if (strategy?.getOffset) return strategy.getOffset(ctx);
    // 无策略实现时回落到 record 上的通用字段
    const value = Number(ctx?.record?.modelHeightOffset ?? ctx?.record?.baseHeight);
    return Number.isFinite(value) ? value : 0;
}

/** 待补做队列长度（调试 / 状态展示用） */
export function pendingGroundPlacementCount(): number {
    return pendingGroundFitCount();
}

export interface ReapplySummary {
    /** 成功贴地的图层数 */
    fitted: number;
    /** 仍失败的图层数 */
    failed: number;
    /** 地形未就绪，未执行 */
    skipped: boolean;
}

/**
 * 地形切换后统一补做：遍历记录，按策略重新贴地。
 * 替代原先「只重贴 3D Tiles、矢量靠 watcher 偶然补到」的分散逻辑。
 *
 * @param params.records loadedDataSources 记录数组
 * @param params.onApplied 每个图层贴地成功后的回调（用于 UI 计数/刷新）
 */
export async function reapplyAllOnTerrainChange(params: {
    records: any[];
    viewer: any;
    Cesium: any;
    dataImport?: any;
    onApplied?: (record: any, result: GroundResult) => void;
}): Promise<ReapplySummary> {
    const { records, viewer, Cesium, dataImport, onApplied } = params;
    if (!isTerrainReady(viewer, Cesium)) return { fitted: 0, failed: 0, skipped: true };

    let fitted = 0;
    let failed = 0;

    for (const record of records || []) {
        const strategy = getStrategy(record?.type);
        // 只处理「导入即需要贴地」的类型；3D Tiles 为 manual，重配准同样需要（地形变了）
        if (!strategy || !strategy.capability.supportsFit) continue;
        try {
            const result = await strategy.fit({ record, viewer, Cesium, dataImport });
            if (result.ok) {
                fitted += 1;
                onApplied?.(record, result);
            } else {
                failed += 1;
            }
        } catch (error) {
            failed += 1;
            console.warn('[GroundPlacement] 地形切换重贴失败:', record?.id, error);
        }
    }

    return { fitted, failed, skipped: false };
}

/**
 * 冲刷「地形未就绪」期间累积的贴地请求。
 * 由地形就绪事件调用；未就绪时直接返回，不清队列（等地形真的起来再补）。
 */
export async function flushPendingGroundFits(params: {
    viewer: any;
    Cesium: any;
    dataImport?: any;
    onApplied?: (record: any, result: GroundResult) => void;
}): Promise<ReapplySummary> {
    const { viewer, Cesium, dataImport, onApplied } = params;
    if (!isTerrainReady(viewer, Cesium)) return { fitted: 0, failed: 0, skipped: true };

    const list = takePendingGroundFits();
    let fitted = 0;
    let failed = 0;

    for (const ctx of list) {
        const strategy = getStrategy(ctx?.record?.type);
        if (!strategy) continue;
        try {
            const result = await strategy.fit({ ...ctx, viewer, Cesium, dataImport });
            if (result.ok) {
                fitted += 1;
                onApplied?.(ctx.record, result);
            } else {
                failed += 1;
            }
        } catch (error) {
            failed += 1;
            console.warn('[GroundPlacement] 队列补做失败:', ctx?.record?.id, error);
        }
    }

    return { fitted, failed, skipped: false };
}
