/**
 * 功能名称：面状航线协调转弯
 * 日    期：2026/07/17
 */
import { LocalPoint, PlanarRouteSegment, PlanarRouteSegmentType } from './wayLineCalc';
import { translate as t } from '@common/app/useLocale';

const EPSILON = 1e-7;
const DEFAULT_DAMPING_DISTANCE = 10;
const MINIMUM_DAMPING_DISTANCE = 1;
const MAXIMUM_EDGE_DAMPING_RATIO = 0.45;
const MAXIMUM_ARC_STEP = 1;
const MAXIMUM_ARC_ANGLE_STEP = (10 * Math.PI) / 180;
const MINIMUM_TURN_ANGLE = Math.PI / 180;

interface RouteEdge {
	start: LocalPoint;
	end: LocalPoint;
	type: PlanarRouteSegmentType;
	captureGroupId?: number;
}

interface RoundedCorner {
	entry: LocalPoint;
	exit: LocalPoint;
	points: LocalPoint[];
}

export interface RouteTurnOptions {
	dampingDistance?: number;
	minimumDampingDistance?: number;
}

/**
 * 按司空 coordinateTurn 规则生成前端预览圆弧，不作为真实导出航点。
 */
export function roundPlanarRouteSegments(segments: PlanarRouteSegment[], options: RouteTurnOptions = {}): PlanarRouteSegment[] {
	const dampingDistance = options.dampingDistance ?? DEFAULT_DAMPING_DISTANCE;
	const minimumDampingDistance = options.minimumDampingDistance ?? MINIMUM_DAMPING_DISTANCE;
	if (!Number.isFinite(dampingDistance) || dampingDistance <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.turnBufferPositive'));
	}
	if (!Number.isFinite(minimumDampingDistance) || minimumDampingDistance <= 0 || minimumDampingDistance > dampingDistance) {
		throw new Error(t('cesium.module.planarRoute.err.invalidTurnBuffer'));
	}

	const edges = createRouteEdges(segments);
	if (edges.length < 2) {
		return cloneSegments(segments);
	}

	const vertices: LocalPoint[] = [edges[0].start];
	for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
		if (edgeIndex > 0 && distance(edges[edgeIndex - 1].end, edges[edgeIndex].start) > EPSILON) {
			throw new Error(t('cesium.module.planarRoute.err.routeSegmentsNotContiguous'));
		}
		vertices.push(edges[edgeIndex].end);
	}

	const corners: Array<RoundedCorner | null> = new Array(vertices.length).fill(null);
	for (let vertexIndex = 1; vertexIndex + 1 < vertices.length; vertexIndex++) {
		corners[vertexIndex] = createAvailableRoundedCorner(
			vertices[vertexIndex - 1],
			vertices[vertexIndex],
			vertices[vertexIndex + 1],
			dampingDistance,
			minimumDampingDistance,
		);
	}

	return rebuildRoundedSegments(edges, corners);
}

/**
 * 将原航段拆分为带类型的连续边。
 */
function createRouteEdges(segments: PlanarRouteSegment[]): RouteEdge[] {
	const edges: RouteEdge[] = [];
	for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
		const segment = segments[segmentIndex];
		for (let pointIndex = 0; pointIndex + 1 < segment.points.length; pointIndex++) {
			const start = segment.points[pointIndex];
			const end = segment.points[pointIndex + 1];
			if (distance(start, end) <= EPSILON) {
				continue;
			}
			edges.push({ start, end, type: segment.type, captureGroupId: segment.captureGroupId });
		}
	}
	return edges;
}

/**
 * 优先使用 10 米缓冲，短航段按可用长度缩小圆弧。
 */
function createAvailableRoundedCorner(
	previous: LocalPoint,
	corner: LocalPoint,
	next: LocalPoint,
	requestedDamping: number,
	minimumDamping: number,
): RoundedCorner | null {
	const previousLength = distance(previous, corner);
	const nextLength = distance(corner, next);
	const maximumDamping = Math.min(requestedDamping, previousLength * MAXIMUM_EDGE_DAMPING_RATIO, nextLength * MAXIMUM_EDGE_DAMPING_RATIO);
	if (maximumDamping < minimumDamping) {
		return null;
	}

	return createRoundedCorner(previous, corner, next, maximumDamping);
}

/**
 * 根据拐点前后缓冲距离构造相切圆弧。
 */
function createRoundedCorner(previous: LocalPoint, corner: LocalPoint, next: LocalPoint, dampingDistance: number): RoundedCorner | null {
	const incomingRay = normalize(subtract(previous, corner));
	const outgoingRay = normalize(subtract(next, corner));
	if (!incomingRay || !outgoingRay) {
		return null;
	}

	const cornerAngle = Math.acos(clamp(dot(incomingRay, outgoingRay), -1, 1));
	const turnAngle = Math.PI - cornerAngle;
	const turnDirection = cross(subtract(corner, previous), subtract(next, corner));
	if (turnAngle < MINIMUM_TURN_ANGLE || cornerAngle < MINIMUM_TURN_ANGLE || Math.abs(turnDirection) <= EPSILON) {
		return null;
	}

	const bisector = normalize(add(incomingRay, outgoingRay));
	const cosineHalfAngle = Math.cos(cornerAngle / 2);
	if (!bisector || cosineHalfAngle <= EPSILON) {
		return null;
	}

	const entry = add(corner, multiply(incomingRay, dampingDistance));
	const exit = add(corner, multiply(outgoingRay, dampingDistance));
	const radius = dampingDistance * Math.tan(cornerAngle / 2);
	const centerDistance = dampingDistance / cosineHalfAngle;
	const center = add(corner, multiply(bisector, centerDistance));
	const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
	const endAngle = Math.atan2(exit.y - center.y, exit.x - center.x);
	const angleDelta = calculateDirectedAngleDelta(startAngle, endAngle, turnDirection);
	const sampleCount = Math.max(2, Math.ceil(Math.max(Math.abs(angleDelta) / MAXIMUM_ARC_ANGLE_STEP, (Math.abs(angleDelta) * radius) / MAXIMUM_ARC_STEP)));
	const points: LocalPoint[] = [];
	for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex++) {
		const ratio = sampleIndex / sampleCount;
		const angle = startAngle + angleDelta * ratio;
		points.push({
			x: center.x + radius * Math.cos(angle),
			y: center.y + radius * Math.sin(angle),
		});
	}
	points[0] = entry;
	points[points.length - 1] = exit;
	return { entry, exit, points };
}

/**
 * 根据左右转方向计算圆弧角增量。
 */
function calculateDirectedAngleDelta(startAngle: number, endAngle: number, turnDirection: number): number {
	let delta = endAngle - startAngle;
	if (turnDirection > 0) {
		while (delta <= 0) {
			delta += Math.PI * 2;
		}
	} else {
		while (delta >= 0) {
			delta -= Math.PI * 2;
		}
	}
	return delta;
}

/**
 * 使用缩短后的直线和圆弧重建连续航段。
 */
function rebuildRoundedSegments(edges: RouteEdge[], corners: Array<RoundedCorner | null>): PlanarRouteSegment[] {
	const result: PlanarRouteSegment[] = [];
	for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
		const start = corners[edgeIndex]?.exit ?? edges[edgeIndex].start;
		const end = corners[edgeIndex + 1]?.entry ?? edges[edgeIndex].end;
		if (distance(start, end) > EPSILON) {
			appendSegment(result, edges[edgeIndex].type, [start, end], edges[edgeIndex].captureGroupId);
		}

		const roundedCorner = corners[edgeIndex + 1];
		if (roundedCorner) {
			const nextEdge = edges[edgeIndex + 1];
			const captureGroupId = nextEdge && nextEdge.captureGroupId === edges[edgeIndex].captureGroupId ? edges[edgeIndex].captureGroupId : undefined;
			appendSegment(result, 'transit', roundedCorner.points, captureGroupId);
		}
	}
	return result;
}

/**
 * 合并相邻同类型航段，减少 Cesium 实体和重复轨迹点。
 */
function appendSegment(result: PlanarRouteSegment[], type: PlanarRouteSegmentType, points: LocalPoint[], captureGroupId?: number): void {
	const previousSegment = result[result.length - 1];
	if (
		previousSegment &&
		previousSegment.type === type &&
		previousSegment.captureGroupId === captureGroupId &&
		distance(previousSegment.points[previousSegment.points.length - 1], points[0]) <= EPSILON
	) {
		for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
			previousSegment.points.push(points[pointIndex]);
		}
		return;
	}
	result.push({ type, points: [...points], captureGroupId });
}

/**
 * 复制无需圆弧处理的航段。
 */
function cloneSegments(segments: PlanarRouteSegment[]): PlanarRouteSegment[] {
	const result: PlanarRouteSegment[] = [];
	for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
		result.push({ type: segments[segmentIndex].type, points: [...segments[segmentIndex].points], captureGroupId: segments[segmentIndex].captureGroupId });
	}
	return result;
}

/** 计算二维向量单位方向。 */
function normalize(vector: LocalPoint): LocalPoint | null {
	const length = Math.hypot(vector.x, vector.y);
	if (length <= EPSILON) {
		return null;
	}
	return { x: vector.x / length, y: vector.y / length };
}

/** 计算二维向量相加。 */
function add(left: LocalPoint, right: LocalPoint): LocalPoint {
	return { x: left.x + right.x, y: left.y + right.y };
}

/** 计算二维向量相减。 */
function subtract(left: LocalPoint, right: LocalPoint): LocalPoint {
	return { x: left.x - right.x, y: left.y - right.y };
}

/** 计算二维向量数乘。 */
function multiply(vector: LocalPoint, scalar: number): LocalPoint {
	return { x: vector.x * scalar, y: vector.y * scalar };
}

/** 计算二维向量点积。 */
function dot(left: LocalPoint, right: LocalPoint): number {
	return left.x * right.x + left.y * right.y;
}

/** 计算二维向量叉积标量。 */
function cross(left: LocalPoint, right: LocalPoint): number {
	return left.x * right.y - left.y * right.x;
}

/** 计算二维点距离。 */
function distance(left: LocalPoint, right: LocalPoint): number {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

/** 将数值限制在闭区间内。 */
function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
