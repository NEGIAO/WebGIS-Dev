import { translate as t } from '@common/app/useLocale';

import { LocalPoint, axisAngleDifference, calculateSignedArea, normalizeAxisAngle, restorePoint, rotatePoint } from './geometry';
import { EPSILON, PlanarRouteOptions } from '../wayLineCalc';


export interface RotatedPoint {
	along: number;
	cross: number;
}


export interface ScanInterval {
	start: LocalPoint;
	end: LocalPoint;
	startAlong: number;
	endAlong: number;
	captureGroupId: number;
}


export interface ScanRow {
	cross: number;
	intervals: ScanInterval[];
}


/**
 * 根据相机覆盖宽度和旁向重叠率计算最大允许行距。
 */
export function calculateMaximumLineSpacing(minimumGroundClearance: number, horizontalFovDegrees: number, sideOverlapPercent: number): number {
	if (!Number.isFinite(minimumGroundClearance) || minimumGroundClearance <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.minGroundClearancePositive'));
	}
	if (!Number.isFinite(horizontalFovDegrees) || horizontalFovDegrees <= 0 || horizontalFovDegrees >= 180) {
		throw new Error(t('cesium.module.planarRoute.err.invalidHorizontalFov'));
	}
	if (!Number.isFinite(sideOverlapPercent) || sideOverlapPercent < 0 || sideOverlapPercent >= 100) {
		throw new Error(t('cesium.module.planarRoute.err.invalidSideOverlap'));
	}

	const halfFovRadians = (horizontalFovDegrees * Math.PI) / 360;
	const footprintWidth = 2 * minimumGroundClearance * Math.tan(halfFovRadians);
	return footprintWidth * (1 - sideOverlapPercent / 100);
}


/**
 * 根据相机纵向覆盖范围和航向重叠率计算自动拍照距离。
 */
export function calculatePhotoDistance(minimumGroundClearance: number, verticalFovDegrees: number, forwardOverlapPercent: number): number {
	if (!Number.isFinite(minimumGroundClearance) || minimumGroundClearance <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.minGroundClearancePositive'));
	}
	if (!Number.isFinite(verticalFovDegrees) || verticalFovDegrees <= 0 || verticalFovDegrees >= 180) {
		throw new Error(t('cesium.module.planarRoute.err.invalidVerticalFov'));
	}
	if (!Number.isFinite(forwardOverlapPercent) || forwardOverlapPercent < 0 || forwardOverlapPercent >= 100) {
		throw new Error(t('cesium.module.planarRoute.err.invalidForwardOverlap'));
	}

	const halfFovRadians = (verticalFovDegrees * Math.PI) / 360;
	const footprintLength = 2 * minimumGroundClearance * Math.tan(halfFovRadians);
	return footprintLength * (1 - forwardOverlapPercent / 100);
}


/**
 * 校验规划输入，阻止退化多边形进入扫描循环。
 */
export function validateOptions(options: PlanarRouteOptions): void {
	if (options.polygon.length < 3) {
		throw new Error(t('cesium.module.planarRoute.err.areaMinVertices'));
	}
	if (Math.abs(calculateSignedArea(options.polygon)) <= EPSILON) {
		throw new Error(t('cesium.module.planarRoute.err.invalidArea'));
	}
	if (!Number.isFinite(options.maximumLineSpacing) || options.maximumLineSpacing <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.invalidLineSpacing'));
	}
	if (!Number.isFinite(options.footprintWidth) || options.footprintWidth <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.invalidFootprintWidth'));
	}
}


/**
 * 收集多边形边的无向方位角，作为自动优化候选方向。
 */
export function collectCandidateAngles(polygon: LocalPoint[]): number[] {
	const angles: number[] = [];

	for (let index = 0; index < polygon.length; index++) {
		const nextIndex = (index + 1) % polygon.length;
		const deltaX = polygon[nextIndex].x - polygon[index].x;
		const deltaY = polygon[nextIndex].y - polygon[index].y;
		if (Math.hypot(deltaX, deltaY) <= EPSILON) {
			continue;
		}

		const heading = (Math.atan2(deltaX, deltaY) * 180) / Math.PI;
		const angle = normalizeAxisAngle(Math.round(heading));
		let duplicated = false;
		for (let angleIndex = 0; angleIndex < angles.length; angleIndex++) {
			if (axisAngleDifference(angles[angleIndex], angle) < 0.1) {
				duplicated = true;
				break;
			}
		}
		if (!duplicated) {
			angles.push(angle);
		}
	}

	return angles;
}


/**
 * 在旋转坐标系中生成覆盖测区的平行扫描行。
 */
export function createScanRows(polygon: LocalPoint[], angle: number, maximumLineSpacing: number): { rows: ScanRow[]; lineSpacing: number } {
	const rotatedPolygon: RotatedPoint[] = [];
	for (let index = 0; index < polygon.length; index++) {
		rotatedPolygon.push(rotatePoint(polygon[index], angle));
	}

	let minimumCross = Number.POSITIVE_INFINITY;
	let maximumCross = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < rotatedPolygon.length; index++) {
		minimumCross = Math.min(minimumCross, rotatedPolygon[index].cross);
		maximumCross = Math.max(maximumCross, rotatedPolygon[index].cross);
	}

	const positionsResult = calculateScanLinePositions(minimumCross, maximumCross, maximumLineSpacing);
	const rows: ScanRow[] = [];

	for (let index = 0; index < positionsResult.positions.length; index++) {
		const cross = positionsResult.positions[index];
		const intervals = clipScanLine(rotatedPolygon, angle, cross);
		if (intervals.length > 0) {
			rows.push({ cross, intervals });
		}
	}
	assignCaptureGroups(rows);

	return {
		rows,
		lineSpacing: positionsResult.lineSpacing,
	};
}


/**
 * 根据相邻扫描行区间的沿线重叠关系划分独立拍照块。
 */
export function assignCaptureGroups(rows: ScanRow[]): void {
	const parents: number[] = [];
	const rowNodeIndexes: number[][] = [];
	const intervals: ScanInterval[] = [];
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const nodeIndexes: number[] = [];
		for (let intervalIndex = 0; intervalIndex < rows[rowIndex].intervals.length; intervalIndex++) {
			const nodeIndex = intervals.length;
			intervals.push(rows[rowIndex].intervals[intervalIndex]);
			parents.push(nodeIndex);
			nodeIndexes.push(nodeIndex);
		}
		rowNodeIndexes.push(nodeIndexes);
	}

	for (let rowIndex = 0; rowIndex + 1 < rows.length; rowIndex++) {
		const currentIndexes = rowNodeIndexes[rowIndex];
		const nextIndexes = rowNodeIndexes[rowIndex + 1];
		for (let currentIndex = 0; currentIndex < currentIndexes.length; currentIndex++) {
			const currentInterval = intervals[currentIndexes[currentIndex]];
			for (let nextIndex = 0; nextIndex < nextIndexes.length; nextIndex++) {
				const nextInterval = intervals[nextIndexes[nextIndex]];
				const overlapStart = Math.max(currentInterval.startAlong, nextInterval.startAlong);
				const overlapEnd = Math.min(currentInterval.endAlong, nextInterval.endAlong);
				if (overlapEnd >= overlapStart - EPSILON) {
					unionCaptureGroups(parents, currentIndexes[currentIndex], nextIndexes[nextIndex]);
				}
			}
		}
	}

	const compactGroupIds = new Map<number, number>();
	for (let intervalIndex = 0; intervalIndex < intervals.length; intervalIndex++) {
		const root = findCaptureGroupRoot(parents, intervalIndex);
		let groupId = compactGroupIds.get(root);
		if (groupId === undefined) {
			groupId = compactGroupIds.size;
			compactGroupIds.set(root, groupId);
		}
		intervals[intervalIndex].captureGroupId = groupId;
	}
}


/**
 * 查找拍照块并查集根节点并压缩路径。
 */
export function findCaptureGroupRoot(parents: number[], index: number): number {
	let root = index;
	while (parents[root] !== root) {
		root = parents[root];
	}
	let current = index;
	while (parents[current] !== current) {
		const next = parents[current];
		parents[current] = root;
		current = next;
	}
	return root;
}


/**
 * 合并两个相邻扫描区间所属的拍照块。
 */
export function unionCaptureGroups(parents: number[], left: number, right: number): void {
	const leftRoot = findCaptureGroupRoot(parents, left);
	const rightRoot = findCaptureGroupRoot(parents, right);
	if (leftRoot !== rightRoot) {
		parents[rightRoot] = leftRoot;
	}
}


/**
 * 以测区横向中心为基准，按照相机计算行距向两侧固定间隔展开扫描行。
 */
export function calculateScanLinePositions(minimumCross: number, maximumCross: number, lineSpacing: number): { positions: number[]; lineSpacing: number } {
	const center = (minimumCross + maximumCross) / 2;
	const positions: number[] = [center];

	for (let offset = lineSpacing; ; offset += lineSpacing) {
		const lower = center - offset;
		const upper = center + offset;
		let added = false;

		if (lower > minimumCross + EPSILON) {
			positions.push(lower);
			added = true;
		}
		if (upper < maximumCross - EPSILON) {
			positions.push(upper);
			added = true;
		}
		if (!added) {
			break;
		}
	}

	positions.sort((left, right) => left - right);
	return { positions, lineSpacing };
}


/**
 * 将一条无限扫描线裁剪为简单多边形内部的若干区间。
 */
export function clipScanLine(rotatedPolygon: RotatedPoint[], angle: number, cross: number): ScanInterval[] {
	const intersections: number[] = [];

	for (let index = 0; index < rotatedPolygon.length; index++) {
		const nextIndex = (index + 1) % rotatedPolygon.length;
		const start = rotatedPolygon[index];
		const end = rotatedPolygon[nextIndex];
		const crosses = (start.cross <= cross && end.cross > cross) || (end.cross <= cross && start.cross > cross);
		if (!crosses) {
			continue;
		}

		const ratio = (cross - start.cross) / (end.cross - start.cross);
		const along = start.along + (end.along - start.along) * ratio;
		intersections.push(along);
	}

	intersections.sort((left, right) => left - right);
	const uniqueIntersections: number[] = [];
	for (let index = 0; index < intersections.length; index++) {
		const previous = uniqueIntersections[uniqueIntersections.length - 1];
		if (uniqueIntersections.length === 0 || Math.abs(intersections[index] - previous) > EPSILON) {
			uniqueIntersections.push(intersections[index]);
		}
	}

	const intervals: ScanInterval[] = [];
	for (let index = 0; index + 1 < uniqueIntersections.length; index += 2) {
		const startAlong = uniqueIntersections[index];
		const endAlong = uniqueIntersections[index + 1];
		if (endAlong - startAlong <= EPSILON) {
			continue;
		}
		intervals.push({
			start: restorePoint(startAlong, cross, angle),
			end: restorePoint(endAlong, cross, angle),
			startAlong,
			endAlong,
			captureGroupId: -1,
		});
	}

	return intervals;
}


/**
 * 按扫描行顺序和往返方向排列所有拍摄区间。
 */
export function orderScanIntervals(rows: ScanRow[], reverseRows: boolean, initialReverse: boolean): ScanInterval[] {
	const orderedRows = [...rows];
	if (reverseRows) {
		orderedRows.reverse();
	}

	const result: ScanInterval[] = [];
	for (let rowIndex = 0; rowIndex < orderedRows.length; rowIndex++) {
		const reverse = rowIndex % 2 === 0 ? initialReverse : !initialReverse;
		const intervals = [...orderedRows[rowIndex].intervals];
		intervals.sort((left, right) => left.startAlong - right.startAlong);
		if (reverse) {
			intervals.reverse();
		}

		for (let intervalIndex = 0; intervalIndex < intervals.length; intervalIndex++) {
			const interval = intervals[intervalIndex];
			if (reverse) {
				result.push({
					start: interval.end,
					end: interval.start,
					startAlong: interval.endAlong,
					endAlong: interval.startAlong,
					captureGroupId: interval.captureGroupId,
				});
			} else {
				result.push(interval);
			}
		}
	}

	return result;
}
