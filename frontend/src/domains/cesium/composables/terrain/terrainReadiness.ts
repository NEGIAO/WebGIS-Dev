/**
 * terrainReadiness.ts — 地形就绪判定与「补做队列」的**唯一时序权威**
 *
 * 背景：Cesium 的 terrainProvider 是异步就绪的。在 provider 仍是
 * `EllipsoidTerrainProvider` 时，`clampToGround` 不产生任何效果，
 * 各调用点若各自 try，就会出现「导入成功但看不见」的静默失败。
 *
 * 约定：
 * - 全局只允许本模块调用 `isTerrainEnabled`；
 * - 地形未就绪时，贴地请求一律进 pending 队列，由
 *   `groundPlacementService.flushPendingGroundFits()` 在地形就绪后统一补做；
 * - 队列按 `record.id` 去重，同一图层反复请求只保留最后一次上下文。
 */

import { isTerrainEnabled } from './terrainClampService';
import type { GroundCtx } from './groundPlacementCapabilities';

/**
 * 地形是否就绪（真实地形，非椭球）。
 */
export function isTerrainReady(viewer: any, Cesium: any): boolean {
    return !!isTerrainEnabled(viewer, Cesium);
}

/** 待补做队列：recordId → ctx */
const pending = new Map<string, GroundCtx>();

/**
 * 登记一次待补做的贴地请求。
 * @returns 是否入队（无 record.id 时返回 false）
 */
export function deferGroundFit(ctx: GroundCtx): boolean {
    const id = String(ctx?.record?.id || '').trim();
    if (!id) return false;
    pending.set(id, ctx);
    return true;
}

/** 队列长度 */
export function pendingGroundFitCount(): number {
    return pending.size;
}

/** 取出并清空队列（调用方负责执行） */
export function takePendingGroundFits(): GroundCtx[] {
    const list = [...pending.values()];
    pending.clear();
    return list;
}

/** 丢弃某图层的待补做请求（图层被移除时调用，避免队列持有已销毁句柄） */
export function dropPendingGroundFit(recordId: string): void {
    pending.delete(String(recordId || ''));
}

/** 清空队列（容器卸载 / viewer 重建） */
export function clearPendingGroundFits(): void {
    pending.clear();
}
