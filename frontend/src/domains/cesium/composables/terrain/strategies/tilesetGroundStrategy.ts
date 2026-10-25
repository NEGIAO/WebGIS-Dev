/**
 * tilesetGroundStrategy.ts — 3D Tiles 贴地策略
 *
 * 3D Tiles 没有 `clampToGround` 这种官方机制，只能靠「叶子包围盒基底采样 × 地形逐点配对」
 * 求中位偏移后整体平移。配准逻辑本身复杂且已在 `tilesetLoader` 中打磨过，
 * 本策略**只做编排，不重写内部实现**（搬家而非重写，避免回归）。
 *
 * 高程滑杆语义：`currentBaseHeight`（模型底部目标海拔），由数据导入层记账。
 */

import { refitTilesetToTerrain } from '../../dataImport/loaders/tilesetLoader';
import {
    GROUND_REASON,
    groundFail,
    groundOk,
} from '../groundPlacementCapabilities';
import type { GroundCtx, GroundResult, GroundStrategy } from '../groundPlacementCapabilities';

export function createTilesetGroundStrategy(): GroundStrategy {
    return {
        types: ['3dtiles'],

        async fit(ctx: GroundCtx): Promise<GroundResult> {
            const tileset = ctx.record?.entity;
            if (!tileset) return groundFail(GROUND_REASON.NO_HANDLE);
            const ok = await refitTilesetToTerrain({
                record: ctx.record,
                tileset,
                viewer: ctx.viewer,
                Cesium: ctx.Cesium,
                // 区域化贴合：ctx.region 存在时只用视野内采样点估算
                region: ctx.region ?? null,
                fitQuantile: ctx.fitQuantile,
            });
            return ok ? groundOk() : groundFail(GROUND_REASON.SAMPLE_FAILED);
        },

        reset(ctx: GroundCtx): GroundResult {
            const tileset = ctx.record?.entity;
            if (!tileset || !ctx.Cesium) return groundFail(GROUND_REASON.NO_HANDLE);
            // 回到导入时的原始位姿：modelMatrix 复位单位矩阵，
            // 滑杆基准同步回到底部海拔，避免下次拖动跳变
            tileset.modelMatrix = ctx.Cesium.Matrix4.clone(ctx.Cesium.Matrix4.IDENTITY);
            tileset._originMatrix = ctx.Cesium.Matrix4.clone(ctx.Cesium.Matrix4.IDENTITY);
            const bottomH = Number(ctx.record?.tilesetGeo?.bottomH);
            ctx.record.currentBaseHeight = Number.isFinite(bottomH) ? bottomH : 0;
            if (ctx.record.tilesetGeo) {
                ctx.record.tilesetGeo.initialBaseHeight = ctx.record.currentBaseHeight;
            }
            ctx.viewer?.scene?.requestRender?.();
            return groundOk();
        },

        setOffset(ctx: GroundCtx, meters: number | null): GroundResult {
            // 3D Tiles 的偏移需数据导入层同步 tilesetGeo 记账，故经 dataImport 下发
            if (!ctx.dataImport?.setTilesetHeight) return groundFail(GROUND_REASON.NO_ADAPTER);
            ctx.dataImport.setTilesetHeight(ctx.record.id, Number(meters) || 0);
            return groundOk();
        },

        getOffset(ctx: GroundCtx): number {
            const current = Number(ctx.record?.currentBaseHeight);
            if (Number.isFinite(current)) return current;
            const base = Number(ctx.record?.baseHeight);
            return Number.isFinite(base) ? base : 0;
        },
    };
}
