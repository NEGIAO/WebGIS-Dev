import Cesium from 'cesium';
import { translate as t } from '@common/app/useLocale';
import { CaptureRange, ExportRouteData, ExportWaypoint, PlanarKmzExportOptions, PlanarKmzRoute } from './types';

export const DEFAULT_TAKEOFF_SECURITY_HEIGHT = 20;

export const DEFAULT_RTH_HEIGHT = 100;


/**
 * 校验导出所需的测区、航线和飞行参数。
 */
export function validateExportOptions(options: PlanarKmzExportOptions): void {
	if (options.polygonPositions.length < 3) {
		throw new Error(t('cesium.module.planarRoute.err.drawAreaFirst'));
	}
	const expectedRouteCount = options.isOblique ? 5 : 1;
	if (options.routes.length !== expectedRouteCount) {
		throw new Error(options.isOblique ? t('cesium.module.planarRoute.err.obliqueNeedsFiveRoutes') : t('cesium.module.planarRoute.err.orthoNeedsOneRoute'));
	}
	if (!Number.isFinite(options.flightSpeed) || options.flightSpeed <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.invalidSpeed'));
	}
	if (!Number.isFinite(options.photoDistance) || options.photoDistance <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.invalidPhotoInterval'));
	}
	if (![1, 2, 3].includes(options.heightType)) {
		throw new Error(t('cesium.module.planarRoute.err.invalidHeightMode'));
	}
	for (let routeIndex = 0; routeIndex < options.routes.length; routeIndex++) {
		if (options.routes[routeIndex].segments.length === 0) {
			throw new Error(t('cesium.module.planarRoute.err.routeNoWaypoints', { n: routeIndex + 1 }));
		}
	}
}


/**
 * 将一组 Cesium 航段转换为去重航点、拍摄区间和航线长度。
 */
export function createExportRouteData(route: PlanarKmzRoute, options: PlanarKmzExportOptions): ExportRouteData {
	const waypoints: ExportWaypoint[] = [];
	const captureRangeMap = new Map<number, CaptureRange>();
	let previousPosition: Cesium.Cartesian3 | null = null;
	let distance = 0;

	for (let segmentIndex = 0; segmentIndex < route.segments.length; segmentIndex++) {
		const segment = route.segments[segmentIndex];
		let segmentStartIndex = -1;
		let segmentEndIndex = -1;
		for (let pointIndex = 0; pointIndex < segment.positions.length; pointIndex++) {
			const position = segment.positions[pointIndex];
			if (previousPosition) {
				distance += Cesium.Cartesian3.distance(previousPosition, position);
			}
			if (!previousPosition || Cesium.Cartesian3.distanceSquared(previousPosition, position) > Cesium.Math.EPSILON7) {
				waypoints.push(toRouteExportWaypoint(position, options));
				previousPosition = position;
			}
			const waypointIndex = waypoints.length - 1;
			if (segmentStartIndex === -1) {
				segmentStartIndex = waypointIndex;
			}
			segmentEndIndex = waypointIndex;
		}

		if (segment.captureGroupId !== undefined && segmentStartIndex >= 0 && segmentEndIndex >= segmentStartIndex) {
			const currentRange = captureRangeMap.get(segment.captureGroupId);
			if (currentRange) {
				currentRange.startIndex = Math.min(currentRange.startIndex, segmentStartIndex);
				currentRange.endIndex = Math.max(currentRange.endIndex, segmentEndIndex);
			} else {
				captureRangeMap.set(segment.captureGroupId, {
					id: segment.captureGroupId,
					startIndex: segmentStartIndex,
					endIndex: segmentEndIndex,
				});
			}
		}
	}

	if (waypoints.length < 2) {
		throw new Error(t('cesium.module.planarRoute.err.routeMinTwoWaypoints', { n: route.id }));
	}
	const captureRanges = Array.from(captureRangeMap.values());
	captureRanges.sort((left, right) => left.startIndex - right.startIndex);
	if (captureRanges.length === 0) {
		throw new Error(t('cesium.module.planarRoute.err.routeNoScanSegment', { n: route.id }));
	}
	return {
		id: route.id,
		headingDegrees: route.headingDegrees,
		gimbalPitchDegrees: route.gimbalPitchDegrees,
		waypoints,
		captureRanges,
		distance,
	};
}


/**
 * 将 Cesium 世界坐标转换为 WPML 使用的经纬度和椭球高度。
 */
export function toExportWaypoint(position: Cesium.Cartesian3): ExportWaypoint {
	const cartographic = Cesium.Cartographic.fromCartesian(position);
	if (!cartographic) {
		throw new Error(t('cesium.module.planarRoute.err.waypointTransformFailed'));
	}
	return {
		longitude: Cesium.Math.toDegrees(cartographic.longitude),
		latitude: Cesium.Math.toDegrees(cartographic.latitude),
		height: cartographic.height,
	};
}


/**
 * 将执行航点转换为符合当前执行高度模式的 WPML 高度。
 */
export function toRouteExportWaypoint(position: Cesium.Cartesian3, options: PlanarKmzExportOptions): ExportWaypoint {
	const waypoint = toExportWaypoint(position);
	if (options.heightType === 2) {
		// 页面中的相对起飞点高度就是任务高度参数，不能用可能受地形采样误差影响的椭球高差反推。
		return { ...waypoint, height: options.lineHeight };
	}
	// M3TD 不支持 realTimeFollowSurface；仿地航点已完成地形采样，按逐点 WGS84 椭球高执行。
	return waypoint;
}


/**
 * 去除测区连续重复点和重复闭环点，并统一为司空样例使用的顺时针顺序。
 */
export function getNormalizedPolygonPositions(positions: Cesium.Cartesian3[]): ExportWaypoint[] {
	const polygon: ExportWaypoint[] = [];
	for (let positionIndex = 0; positionIndex < positions.length; positionIndex++) {
		const point = toExportWaypoint(positions[positionIndex]);
		if (point.longitude < -180 || point.longitude > 180 || point.latitude < -90 || point.latitude > 90) {
			throw new Error(t('cesium.module.planarRoute.err.polygonInvalidCoords'));
		}
		const previous = polygon[polygon.length - 1];
		if (!previous || !areSameCoordinates(previous, point)) {
			polygon.push(point);
		}
	}
	if (polygon.length > 1 && areSameCoordinates(polygon[0], polygon[polygon.length - 1])) {
		polygon.pop();
	}
	if (polygon.length < 3) {
		throw new Error(t('cesium.module.planarRoute.err.polygonNeedDistinctVertices'));
	}
	if (calculatePolygonSignedArea(polygon) > 0) {
		polygon.reverse();
	}
	return polygon;
}


/**
 * 判断两个经纬度点是否可视为同一个测区顶点。
 */
export function areSameCoordinates(left: ExportWaypoint, right: ExportWaypoint): boolean {
	return Math.abs(left.longitude - right.longitude) <= Cesium.Math.EPSILON10 && Math.abs(left.latitude - right.latitude) <= Cesium.Math.EPSILON10;
}


/**
 * 计算经纬度平面上的测区有符号面积，用于统一顶点绕序。
 */
export function calculatePolygonSignedArea(polygon: ExportWaypoint[]): number {
	let doubledArea = 0;
	for (let pointIndex = 0; pointIndex < polygon.length; pointIndex++) {
		const nextIndex = (pointIndex + 1) % polygon.length;
		doubledArea += polygon[pointIndex].longitude * polygon[nextIndex].latitude - polygon[nextIndex].longitude * polygon[pointIndex].latitude;
	}
	return doubledArea / 2;
}


/**
 * 计算正射模式某航点指向下一航点的地理方位角。
 */
export function calculateWaypointHeading(waypoints: ExportWaypoint[], waypointIndex: number): number {
	const startIndex = waypointIndex < waypoints.length - 1 ? waypointIndex : waypointIndex - 1;
	const endIndex = waypointIndex < waypoints.length - 1 ? waypointIndex + 1 : waypointIndex;
	const start = waypoints[startIndex];
	const end = waypoints[endIndex];
	const startLatitude = Cesium.Math.toRadians(start.latitude);
	const endLatitude = Cesium.Math.toRadians(end.latitude);
	const longitudeDelta = Cesium.Math.toRadians(end.longitude - start.longitude);
	const east = Math.sin(longitudeDelta) * Math.cos(endLatitude);
	const north = Math.cos(startLatitude) * Math.sin(endLatitude) - Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta);
	return normalizeHeading(Cesium.Math.toDegrees(Math.atan2(east, north)));
}


/**
 * 将有向航向角归一化到 -180°~180°。
 */
export function normalizeHeading(angle: number): number {
	const normalized = ((angle % 360) + 360) % 360;
	return normalized > 180 ? normalized - 360 : normalized;
}


/**
 * 将主航线无向角归一化到 DJI 模板接受的 0°~360°。
 */
export function normalizeDirection(angle: number): number {
	return ((angle % 360) + 360) % 360;
}


/**
 * 限制 XML 数字精度并移除无意义的尾随零。
 */
export function formatNumber(value: number): string {
	if (!Number.isFinite(value)) {
		throw new Error(t('cesium.module.planarRoute.err.kmzInvalidNumber'));
	}
	return Number(value.toFixed(8)).toString();
}
