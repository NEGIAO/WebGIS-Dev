/**
 * modelGroundStrategy.ts — glTF / GLB 模型贴地策略
 *
 * 语义：`RELATIVE_TO_GROUND + 偏移`。
 * - 为什么不用 CLAMP_TO_GROUND：它把**模型原点**钉在地表，
 *   原点在几何中心的 GLB 必然「半截入土」，且无法整体抬升；
 * - `RELATIVE_TO_GROUND + height` 既保留随地形起伏跟随，又能用滑杆整体抬升。
 */

import { setModelHeightOffset } from '../../dataImport/loaders/gltfLoader';
import {
    GROUND_REASON,
    groundFail,
    groundOk,
} from '../groundPlacementCapabilities';
import type { GroundCtx, GroundResult, GroundStrategy } from '../groundPlacementCapabilities';

export function createModelGroundStrategy(): GroundStrategy {
    return {
        types: ['gltf'],

        async fit(ctx: GroundCtx): Promise<GroundResult> {
            const offset = Number(ctx.record?.modelHeightOffset) || 0;
            const applied = setModelHeightOffset(ctx.Cesium, ctx.record, offset);
            ctx.viewer?.scene?.requestRender?.();
            return applied ? groundOk({ offset }) : groundFail(GROUND_REASON.NO_HANDLE);
        },

        reset(ctx: GroundCtx): GroundResult {
            const applied = setModelHeightOffset(ctx.Cesium, ctx.record, null);
            ctx.viewer?.scene?.requestRender?.();
            return applied ? groundOk() : groundFail(GROUND_REASON.NO_HANDLE);
        },

        setOffset(ctx: GroundCtx, meters: number | null): GroundResult {
            const applied = setModelHeightOffset(ctx.Cesium, ctx.record, meters);
            ctx.viewer?.scene?.requestRender?.();
            return applied ? groundOk({ offset: Number(meters) || 0 }) : groundFail(GROUND_REASON.NO_HANDLE);
        },

        getOffset(ctx: GroundCtx): number {
            const offset = Number(ctx.record?.modelHeightOffset);
            return Number.isFinite(offset) ? offset : 0;
        },
    };
}
