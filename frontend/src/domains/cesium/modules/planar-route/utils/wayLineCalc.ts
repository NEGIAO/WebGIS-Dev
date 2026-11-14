/**
 * 面状航线（扫描式摄影测量）规划计算 — 公共入口
 *
 * 输入多边形 + 相机/重叠参数，输出按「扫描行 → 往返串接 → 区内避障」生成的航线。
 * 实现按职责分层在同目录 `wayLine/` 下：
 * - `wayLine/geometry`  相交/面积/旋转还原/长度折点等几何原语（含 dot/cross/distance/clamp）
 * - `wayLine/scan`      相机间距、候选角、扫描行与区间排序
 * - `wayLine/path`      单角度方案、区间串接、区内最短路（Dijkstra）
 *
 * 本文件保留：对外类型与 `calculatePlanarRoute` 主流程，以及原先由本模块直接导出的
 * `calculateMaximumLineSpacing` / `calculatePhotoDistance` / `isPointInsidePolygon`。
 */

import { translate as t } from '@common/app/useLocale';
import type { LocalPoint } from './wayLine/geometry';
import { normalizeAxisAngle } from './wayLine/geometry';
import { calculatePlanForAngle } from './wayLine/path';
import { collectCandidateAngles, validateOptions } from './wayLine/scan';


export const EPSILON = 1e-7;

export const MIN_TURN_PENALTY = 5;


export type PlanarRouteSegmentType = 'scan' | 'transit';


export interface PlanarRouteSegment {
	type: PlanarRouteSegmentType;
	points: LocalPoint[];
	captureGroupId?: number;
}


export interface PlanarRoutePlan {
	angle: number;
	lineSpacing: number;
	scanLength: number;
	transitLength: number;
	totalLength: number;
	turnCount: number;
	entryDistance: number;
	score: number;
	segments: PlanarRouteSegment[];
}


export interface PlanarRouteOptions {
	polygon: LocalPoint[];
	maximumLineSpacing: number;
	footprintWidth: number;
	takeoffPoint?: LocalPoint;
	manualAngle?: number;
}


/**
 * 生成正射面状航线。自动模式比较多边形边方向，手动模式固定使用传入角度。
 */
export function calculatePlanarRoute(options: PlanarRouteOptions): PlanarRoutePlan {
	validateOptions(options);

	const angles = options.manualAngle === undefined ? collectCandidateAngles(options.polygon) : [normalizeAxisAngle(options.manualAngle)];
	let bestPlan: PlanarRoutePlan | null = null;

	for (let index = 0; index < angles.length; index++) {
		const angle = angles[index];
		const plan = calculatePlanForAngle(options, angle);
		if (!plan) {
			continue;
		}
		if (!bestPlan || plan.score < bestPlan.score) {
			bestPlan = plan;
		}
	}

	if (!bestPlan) {
		throw new Error(t('cesium.module.planarRoute.err.noValidRouteForArea'));
	}

	return bestPlan;
}

export { calculateMaximumLineSpacing, calculatePhotoDistance } from './wayLine/scan';
export { isPointInsidePolygon } from './wayLine/geometry';
export type { LocalPoint } from './wayLine/geometry';
