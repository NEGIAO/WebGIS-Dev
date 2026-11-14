import { RotatedPoint } from './scan';
import { EPSILON, PlanarRouteSegment } from '../wayLineCalc';


export interface LocalPoint {
	x: number;
	y: number;
}


/**
 * 判断点是否位于简单多边形内部或边界上。
 */
export function isPointInsidePolygon(point: LocalPoint, polygon: LocalPoint[]): boolean {
	let inside = false;

	for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index++) {
		const currentPoint = polygon[index];
		const previousPoint = polygon[previous];
		if (isPointOnSegment(point, previousPoint, currentPoint)) {
			return true;
		}

		const crossesLatitude = currentPoint.y > point.y !== previousPoint.y > point.y;
		if (!crossesLatitude) {
			continue;
		}

		const xAtLatitude = ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
		if (point.x < xAtLatitude) {
			inside = !inside;
		}
	}

	return inside;
}


/**
 * 将航段合并为连续点列，用于统计转弯。
 */
export function flattenRoutePoints(segments: PlanarRouteSegment[]): LocalPoint[] {
	const points: LocalPoint[] = [];
	for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
		const segment = segments[segmentIndex];
		for (let pointIndex = 0; pointIndex < segment.points.length; pointIndex++) {
			const point = segment.points[pointIndex];
			const previous = points[points.length - 1];
			if (!previous || distance(previous, point) > EPSILON) {
				points.push(point);
			}
		}
	}
	return points;
}


/**
 * 统计大于五度的方向变化次数。
 */
export function countTurns(points: LocalPoint[]): number {
	let turns = 0;
	const threshold = (5 * Math.PI) / 180;

	for (let index = 1; index + 1 < points.length; index++) {
		const incoming = subtract(points[index], points[index - 1]);
		const outgoing = subtract(points[index + 1], points[index]);
		const incomingLength = Math.hypot(incoming.x, incoming.y);
		const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
		if (incomingLength <= EPSILON || outgoingLength <= EPSILON) {
			continue;
		}
		const cosine = clamp(dot(incoming, outgoing) / (incomingLength * outgoingLength), -1, 1);
		if (Math.acos(cosine) > threshold) {
			turns++;
		}
	}

	return turns;
}


/**
 * 计算折线路径长度。
 */
export function calculatePolylineLength(points: LocalPoint[]): number {
	let length = 0;
	for (let index = 0; index + 1 < points.length; index++) {
		length += distance(points[index], points[index + 1]);
	}
	return length;
}


/**
 * 将 ENU 点旋转到扫描线的沿线/横线坐标系。
 */
export function rotatePoint(point: LocalPoint, angle: number): RotatedPoint {
	const radians = (angle * Math.PI) / 180;
	const directionX = Math.sin(radians);
	const directionY = Math.cos(radians);
	const crossX = Math.cos(radians);
	const crossY = -Math.sin(radians);
	return {
		along: point.x * directionX + point.y * directionY,
		cross: point.x * crossX + point.y * crossY,
	};
}


/**
 * 将扫描线坐标恢复为 ENU 平面点。
 */
export function restorePoint(along: number, crossValue: number, angle: number): LocalPoint {
	const radians = (angle * Math.PI) / 180;
	const directionX = Math.sin(radians);
	const directionY = Math.cos(radians);
	const crossX = Math.cos(radians);
	const crossY = -Math.sin(radians);
	return {
		x: directionX * along + crossX * crossValue,
		y: directionY * along + crossY * crossValue,
	};
}


/**
 * 将方位角归一化为无向扫描轴角度 0~180。
 */
export function normalizeAxisAngle(angle: number): number {
	const normalized = ((angle % 180) + 180) % 180;
	return normalized >= 180 - EPSILON ? 0 : normalized;
}


/**
 * 计算两个无向扫描轴之间的最小角差。
 */
export function axisAngleDifference(left: number, right: number): number {
	const difference = Math.abs(left - right) % 180;
	return Math.min(difference, 180 - difference);
}


/**
 * 计算简单多边形有符号面积。
 */
export function calculateSignedArea(polygon: LocalPoint[]): number {
	let doubledArea = 0;
	for (let index = 0; index < polygon.length; index++) {
		const nextIndex = (index + 1) % polygon.length;
		doubledArea += polygon[index].x * polygon[nextIndex].y - polygon[nextIndex].x * polygon[index].y;
	}
	return doubledArea / 2;
}


/**
 * 判断点是否位于线段上。
 */
export function isPointOnSegment(point: LocalPoint, start: LocalPoint, end: LocalPoint): boolean {
	const segment = subtract(end, start);
	const offset = subtract(point, start);
	if (Math.abs(cross(segment, offset)) > EPSILON) {
		return false;
	}
	const projection = dot(offset, segment);
	const squaredLength = dot(segment, segment);
	return projection >= -EPSILON && projection <= squaredLength + EPSILON;
}


/**
 * 线性插值二维点。
 */
export function interpolate(start: LocalPoint, end: LocalPoint, parameter: number): LocalPoint {
	return {
		x: start.x + (end.x - start.x) * parameter,
		y: start.y + (end.y - start.y) * parameter,
	};
}


/**
 * 二维向量相减。
 */
export function subtract(left: LocalPoint, right: LocalPoint): LocalPoint {
	return { x: left.x - right.x, y: left.y - right.y };
}


/**
 * 二维向量点积。
 */
export function dot(left: LocalPoint, right: LocalPoint): number {
	return left.x * right.x + left.y * right.y;
}


/**
 * 二维向量叉积标量。
 */
export function cross(left: LocalPoint, right: LocalPoint): number {
	return left.x * right.y - left.y * right.x;
}


/**
 * 计算二维点距离。
 */
export function distance(left: LocalPoint, right: LocalPoint): number {
	return Math.hypot(left.x - right.x, left.y - right.y);
}


/**
 * 将数值限制在闭区间内。
 */
export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
