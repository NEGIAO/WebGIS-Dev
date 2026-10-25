/**
 * vectorGroundStrategy.ts — 矢量类（geojson / kml / kmz / czml / shp / wayline）贴地策略
 *
 * 职责：把「矢量怎么贴地」收敛到一处。
 * - 加载期：loader 使用 `VECTOR_GROUND_LOAD_OPTIONS`（官方 clampToGround）
 * - 加载后：本策略做实体级强制钳制（兜住 KML `altitudeMode=absolute` 等绕过加载选项的情形）
 * - 恢复：取消实体级 clamp，图元回到数据自带坐标高度
 */

import { clampDataSourceToGround } from '../terrainClampService';
import { forceDataSourceClampToGround } from '../../dataImport/loaders/utils';
import {
    GROUND_REASON,
    groundFail,
    groundOk,
} from '../groundPlacementCapabilities';
import type { GroundCtx, GroundResult, GroundStrategy } from '../groundPlacementCapabilities';

/** 本策略负责的类型（与能力表同名条目对应） */
const TYPES = ['geojson', 'kml', 'kmz', 'czml', 'shp', 'wayline'];

/**
 * 取消矢量数据源的贴地（恢复数据自带坐标高度）。
 * @returns 被改动的实体数
 */
function unclampDataSource(Cesium: any, dataSource: any): number {
    const entities = dataSource?.entities?.values;
    if (!Cesium || !Array.isArray(entities)) return 0;
    let touched = 0;
    for (const entity of entities) {
        try {
            if (entity.polyline) {
                entity.polyline.clampToGround = false;
                touched += 1;
            }
            if (entity.polygon) {
                entity.polygon.heightReference = Cesium.HeightReference.NONE;
                touched += 1;
            }
            if (entity.point) {
                entity.point.heightReference = Cesium.HeightReference.NONE;
                touched += 1;
            }
            if (entity.label) {
                entity.label.heightReference = Cesium.HeightReference.NONE;
                touched += 1;
            }
            if (entity.billboard) {
                entity.billboard.heightReference = Cesium.HeightReference.NONE;
                touched += 1;
            }
        } catch {
            /* 单个实体失败不影响其余 */
        }
    }
    return touched;
}

export function createVectorGroundStrategy(): GroundStrategy {
    return {
        types: TYPES,

        async fit(ctx: GroundCtx): Promise<GroundResult> {
            const dataSource = ctx.record?.entity;
            if (!dataSource) return groundFail(GROUND_REASON.NO_HANDLE);

            /**
             * 两步合并在策略内完成（过去散落在各 loader）：
             * ① 结构级兜底：清掉显式高度 / perPositionHeight，点线面统一声明贴地语义
             *    —— 兜住 KML `altitudeMode=absolute`、GeoJSON 显式 height 绕过加载选项的情形；
             * ② 通用级兜底：补齐 corridor / rectangle / ellipse / label / billboard 等图元。
             * 两步均幂等，可反复调用。
             */
            forceDataSourceClampToGround(dataSource, ctx.Cesium);
            const result = clampDataSourceToGround(ctx.viewer, ctx.Cesium, dataSource);
            return groundOk(result);
        },

        reset(ctx: GroundCtx): GroundResult {
            const dataSource = ctx.record?.entity;
            if (!dataSource) return groundFail(GROUND_REASON.NO_HANDLE);
            const touched = unclampDataSource(ctx.Cesium, dataSource);
            ctx.viewer?.scene?.requestRender?.();
            return groundOk({ touched });
        },
    };
}
