import { translate as t } from '@common/app/useLocale';

import { LocalPoint, calculatePolylineLength, clamp, countTurns, cross, distance, dot, flattenRoutePoints, interpolate, isPointInsidePolygon, subtract } from './geometry';
import { ScanInterval, createScanRows, orderScanIntervals } from './scan';
import { EPSILON, MIN_TURN_PENALTY, PlanarRouteOptions, PlanarRoutePlan, PlanarRouteSegment } from '../wayLineCalc';


/**
 * 生成指定方向的扫描行，并比较四种往返起始方式。
 */
export function calculatePlanForAngle(options: PlanarRouteOptions, angle: number): PlanarRoutePlan | null {
	const rowsResult = createScanRows(options.polygon, angle, options.maximumLineSpacing);
	if (rowsResult.rows.length === 0) {
		return null;
	}

	let bestPlan: PlanarRoutePlan | null = null;
	const rowDirections = [false, true];
	const initialDirections = [false, true];

	for (let rowIndex = 0; rowIndex < rowDirections.length; rowIndex++) {
		for (let directionIndex = 0; directionIndex < initialDirections.length; directionIndex++) {
			const orderedIntervals = orderScanIntervals(rowsResult.rows, rowDirections[rowIndex], initialDirections[directionIndex]);
			const plan = assembleRoute(options, orderedIntervals, angle, rowsResult.lineSpacing);
			if (!bestPlan || plan.score < bestPlan.score) {
				bestPlan = plan;
			}
		}
	}

	return bestPlan;
}


/**
 * 使用测区内最短路径连接扫描区间，并计算方向评分。
 */
export function assembleRoute(options: PlanarRouteOptions, intervals: ScanInterval[], angle: number, lineSpacing: number): PlanarRoutePlan {
	const segments: PlanarRouteSegment[] = [];
	let scanLength = 0;
	let transitLength = 0;
	let previousEnd: LocalPoint | null = null;
	let previousCaptureGroupId: number | undefined;

	for (let index = 0; index < intervals.length; index++) {
		const interval = intervals[index];
		if (previousEnd) {
			const transitPoints = findShortestPathInsidePolygon(previousEnd, interval.start, options.polygon);
			const length = calculatePolylineLength(transitPoints);
			if (length > EPSILON) {
				const captureGroupId = previousCaptureGroupId === interval.captureGroupId ? interval.captureGroupId : undefined;
				segments.push({ type: 'transit', points: transitPoints, captureGroupId });
				transitLength += length;
			}
		}

		const scanPoints = [interval.start, interval.end];
		segments.push({ type: 'scan', points: scanPoints, captureGroupId: interval.captureGroupId });
		scanLength += distance(interval.start, interval.end);
		previousEnd = interval.end;
		previousCaptureGroupId = interval.captureGroupId;
	}

	const routePoints = flattenRoutePoints(segments);
	const turnCount = countTurns(routePoints);
	const firstPoint = routePoints[0];
	const entryDistance = options.takeoffPoint && firstPoint ? distance(options.takeoffPoint, firstPoint) : 0;
	const totalLength = scanLength + transitLength;
	const turnPenalty = Math.max(lineSpacing, MIN_TURN_PENALTY);
	const score = totalLength + entryDistance + turnCount * turnPenalty;

	return {
		angle,
		lineSpacing,
		scanLength,
		transitLength,
		totalLength,
		turnCount,
		entryDistance,
		score,
		segments,
	};
}


/**
 * 在简单多边形可见图上计算两个点之间的最短内部路径。
 */
export function findShortestPathInsidePolygon(start: LocalPoint, end: LocalPoint, polygon: LocalPoint[]): LocalPoint[] {
	if (distance(start, end) <= EPSILON) {
		return [start];
	}
	if (isSegmentInsidePolygon(start, end, polygon)) {
		return [start, end];
	}

	const nodes: LocalPoint[] = [start, end];
	for (let index = 0; index < polygon.length; index++) {
		nodes.push(polygon[index]);
	}

	const nodeCount = nodes.length;
	const graph: number[][] = [];
	for (let row = 0; row < nodeCount; row++) {
		const graphRow: number[] = [];
		for (let column = 0; column < nodeCount; column++) {
			graphRow.push(Number.POSITIVE_INFINITY);
		}
		graph[row] = graphRow;
	}

	for (let left = 0; left < nodeCount; left++) {
		graph[left][left] = 0;
		for (let right = left + 1; right < nodeCount; right++) {
			if (!isSegmentInsidePolygon(nodes[left], nodes[right], polygon)) {
				continue;
			}
			const length = distance(nodes[left], nodes[right]);
			graph[left][right] = length;
			graph[right][left] = length;
		}
	}

	const previous = runDijkstra(graph, 0);
	if (previous[1] === -1) {
		throw new Error(t('cesium.module.planarRoute.err.routeSegmentsDisconnected'));
	}

	const pathIndexes: number[] = [];
	let current = 1;
	while (current !== -1) {
		pathIndexes.push(current);
		if (current === 0) {
			break;
		}
		current = previous[current];
	}
	pathIndexes.reverse();

	const path: LocalPoint[] = [];
	for (let index = 0; index < pathIndexes.length; index++) {
		path.push(nodes[pathIndexes[index]]);
	}
	return path;
}


/**
 * 执行可见图最短路径搜索并返回前驱节点。
 */
export function runDijkstra(graph: number[][], source: number): number[] {
	const distances: number[] = [];
	const previous: number[] = [];
	const visited: boolean[] = [];

	for (let index = 0; index < graph.length; index++) {
		distances[index] = Number.POSITIVE_INFINITY;
		previous[index] = -1;
		visited[index] = false;
	}
	distances[source] = 0;

	for (let count = 0; count < graph.length; count++) {
		let current = -1;
		let minimumDistance = Number.POSITIVE_INFINITY;
		for (let index = 0; index < graph.length; index++) {
			if (!visited[index] && distances[index] < minimumDistance) {
				minimumDistance = distances[index];
				current = index;
			}
		}
		if (current === -1) {
			break;
		}

		visited[current] = true;
		for (let neighbor = 0; neighbor < graph.length; neighbor++) {
			const edgeLength = graph[current][neighbor];
			if (!Number.isFinite(edgeLength) || visited[neighbor]) {
				continue;
			}
			const candidateDistance = distances[current] + edgeLength;
			if (candidateDistance < distances[neighbor]) {
				distances[neighbor] = candidateDistance;
				previous[neighbor] = current;
			}
		}
	}

	return previous;
}


/**
 * 通过边界交点分段检查线段是否始终位于多边形内部或边界上。
 */
export function isSegmentInsidePolygon(start: LocalPoint, end: LocalPoint, polygon: LocalPoint[]): boolean {
	const parameters: number[] = [0, 1];
	for (let index = 0; index < polygon.length; index++) {
		const nextIndex = (index + 1) % polygon.length;
		const edgeParameters = collectIntersectionParameters(start, end, polygon[index], polygon[nextIndex]);
		for (let parameterIndex = 0; parameterIndex < edgeParameters.length; parameterIndex++) {
			parameters.push(edgeParameters[parameterIndex]);
		}
	}

	parameters.sort((left, right) => left - right);
	const uniqueParameters: number[] = [];
	for (let index = 0; index < parameters.length; index++) {
		const parameter = clamp(parameters[index], 0, 1);
		const previous = uniqueParameters[uniqueParameters.length - 1];
		if (uniqueParameters.length === 0 || Math.abs(parameter - previous) > EPSILON) {
			uniqueParameters.push(parameter);
		}
	}

	for (let index = 0; index + 1 < uniqueParameters.length; index++) {
		const middle = (uniqueParameters[index] + uniqueParameters[index + 1]) / 2;
		const point = interpolate(start, end, middle);
		if (!isPointInsidePolygon(point, polygon)) {
			return false;
		}
	}

	return true;
}


/**
 * 收集两条线段在第一条线段上的交点参数，包含共线重叠端点。
 */
export function collectIntersectionParameters(start: LocalPoint, end: LocalPoint, edgeStart: LocalPoint, edgeEnd: LocalPoint): number[] {
	const direction = subtract(end, start);
	const edgeDirection = subtract(edgeEnd, edgeStart);
	const offset = subtract(edgeStart, start);
	const denominator = cross(direction, edgeDirection);

	if (Math.abs(denominator) > EPSILON) {
		const parameter = cross(offset, edgeDirection) / denominator;
		const edgeParameter = cross(offset, direction) / denominator;
		if (parameter >= -EPSILON && parameter <= 1 + EPSILON && edgeParameter >= -EPSILON && edgeParameter <= 1 + EPSILON) {
			return [parameter];
		}
		return [];
	}

	if (Math.abs(cross(offset, direction)) > EPSILON) {
		return [];
	}

	const squaredLength = dot(direction, direction);
	if (squaredLength <= EPSILON) {
		return [];
	}
	const startParameter = dot(subtract(edgeStart, start), direction) / squaredLength;
	const endParameter = dot(subtract(edgeEnd, start), direction) / squaredLength;
	return [startParameter, endParameter];
}
