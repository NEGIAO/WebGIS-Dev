/**
 * 功能名称：面状航线规划核心（测区 → 正射 / 五向航线）
 * 日    期：2026/11/13
 *
 * 从 planarRouteController.recalculateRoute 抽出：本文件只做纯计算，
 * 不持有控制器状态、不渲染、不弹 toast（失败一律 throw Error，文案由调用方展示）。
 * 副作用仅限写共享参数 globeConfig（自动线角度 / 线间距 / 建议限速）。
 */
import Cesium from 'cesium';
import { translate as t } from '@common/app/useLocale';
import { calculateCameraFieldOfView, M3TD_WIDE_CAMERA } from '../config/cameraConfig';
import globeConfig, { applyFlightSpeedLimit } from '../config/planarConfig';
import { calculateFiveDirectionRoutes, FiveDirectionRoutePlan } from '../utils/obliqueRoute';
import { roundPlanarRouteSegments } from '../utils/planarRouteTurn';
import {
	calculateCartesianRouteLength,
	createCartesianRouteSegments,
	createLocalCoordinateFrame,
	LocalRouteSegment,
	sampleMaximumTerrainHeightAlongSegments,
} from '../utils/planarTerrain';
import { calculateMaximumLineSpacing, calculatePhotoDistance, calculatePlanarRoute, LocalPoint } from '../utils/wayLineCalc';
import {
	calculateRoutePhotoCount,
	connectTakeoffToFirstWaypoint,
	flattenRouteCoordinates,
	getFirstCartesianRoutePoint,
	getFirstLocalRoutePoint,
	resolveFlightHeight,
} from '../composables/useRouteCalc';
import type { PlannedRouteData } from '../composables/useKmzImport';

/** 一次规划请求 */
export interface PlanarRoutePlanRequest {
	/** 宿主 Viewer（地形采样用） */
	viewer: Cesium.Viewer;
	/** 测区顶点（世界坐标） */
	polygonPositions: Cesium.Cartesian3[];
	/** 是否五向倾斜采集 */
	isObliqueMode: boolean;
	/** 线角度是否被用户手动锁定 */
	isLineAngleManual: boolean;
	/** 上一次的拍照间距（用于判断是否需要同步建议限速） */
	previousPhotoDistance: number;
	/** 版本是否已过期（用户再次触发规划 / 清空 / 销毁） */
	isStale: () => boolean;
}

/** 一次规划结果 */
export interface PlanarRoutePlanResult {
	routes: PlannedRouteData[];
	photoDistance: number;
}

/**
 * 按当前测区与面板参数生成航线（含地形校验与航点笛卡尔化）。
 * @param request 规划请求
 * @returns 规划结果；版本过期返回 null，业务失败抛出带本地化文案的 Error
 */
export async function planPlanarRoutes(request: PlanarRoutePlanRequest): Promise<PlanarRoutePlanResult | null> {
	const { viewer, polygonPositions, isObliqueMode, isLineAngleManual, previousPhotoDistance, isStale } = request;

	const frame = createLocalCoordinateFrame(polygonPositions);
	const localPolygon: LocalPoint[] = [];
	for (let index = 0; index < polygonPositions.length; index++) {
		localPolygon.push(frame.toLocal(polygonPositions[index]));
	}

	const heightResult = await resolveFlightHeight(viewer, frame, localPolygon);
	if (isStale()) {
		return null;
	}

	const minimumGroundClearance = heightResult.minimumGroundClearance;
	if (minimumGroundClearance <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.insufficientFlightHeight'));
	}

	const cameraFieldOfView = calculateCameraFieldOfView(M3TD_WIDE_CAMERA);
	const crossTrackFov = cameraFieldOfView.horizontalDegrees;
	const halfFovRadians = (crossTrackFov * Math.PI) / 360;
	const footprintWidth = 2 * minimumGroundClearance * Math.tan(halfFovRadians);
	const maximumLineSpacing = calculateMaximumLineSpacing(minimumGroundClearance, crossTrackFov, Number(globeConfig.overlapW));
	const photoDistance = calculatePhotoDistance(minimumGroundClearance, cameraFieldOfView.verticalDegrees, Number(globeConfig.overlapH));
	// 建议限速随拍照间距更新；仅间距变化时同步为建议值，手动调速（最高 15）不被压回
	const syncToSuggested = !(previousPhotoDistance > 0 && Math.abs(previousPhotoDistance - photoDistance) < 1e-6);
	applyFlightSpeedLimit(photoDistance, syncToSuggested);
	const takeoffPoint = globeConfig.flyPosition ? frame.toLocal(globeConfig.flyPosition) : undefined;
	let localRoutes: FiveDirectionRoutePlan[];
	if (isObliqueMode) {
		const manualAngle = isLineAngleManual ? Number(globeConfig.lineAngle) : undefined;
		const result = calculateFiveDirectionRoutes({
			polygon: localPolygon,
			maximumLineSpacing,
			footprintWidth,
			minimumGroundClearance,
			gimbalPitchDegrees: Number(globeConfig.smartObliqueGimbalPitch),
			takeoffPoint,
			manualAngle,
		});
		localRoutes = result.routes;
		if (!isLineAngleManual) {
			globeConfig.lineAngle = Number(result.angle.toFixed(1));
		}
		globeConfig.spacing = Number(result.lineSpacing.toFixed(2));
	} else {
		const manualAngle = isLineAngleManual ? Number(globeConfig.lineAngle) : undefined;
		const plan = calculatePlanarRoute({
			polygon: localPolygon,
			maximumLineSpacing,
			footprintWidth,
			takeoffPoint,
			manualAngle,
		});
		if (!isLineAngleManual) {
			globeConfig.lineAngle = Number(plan.angle.toFixed(1));
		}
		globeConfig.spacing = Number(plan.lineSpacing.toFixed(2));
		localRoutes = [
			{
				id: 1,
				key: 'nadir',
				label: t('cesium.module.planarRoute.option.nadir'),
				gimbalPitchDegrees: -90,
				segments: plan.segments,
			},
		];
	}

	if (Number(globeConfig.heightType) !== 3) {
		const allSegments: LocalRouteSegment[] = [];
		for (let routeIndex = 0; routeIndex < localRoutes.length; routeIndex++) {
			for (let segmentIndex = 0; segmentIndex < localRoutes[routeIndex].segments.length; segmentIndex++) {
				allSegments.push(localRoutes[routeIndex].segments[segmentIndex]);
			}
			const firstLocalWaypoint = getFirstLocalRoutePoint(localRoutes[routeIndex].segments);
			if (takeoffPoint && firstLocalWaypoint) {
				allSegments.push({ type: 'transit', points: [takeoffPoint, firstLocalWaypoint] });
			}
		}
		const maximumRouteTerrainHeight = await sampleMaximumTerrainHeightAlongSegments(viewer, frame, allSegments);
		if (isStale()) {
			return null;
		}
		if (!Number.isFinite(heightResult.absoluteFlightHeight) || heightResult.absoluteFlightHeight! <= maximumRouteTerrainHeight) {
			throw new Error(t('cesium.module.planarRoute.err.terrainTooHighForPlan'));
		}
	}

	const plannedRoutes: PlannedRouteData[] = [];
	for (let routeIndex = 0; routeIndex < localRoutes.length; routeIndex++) {
		const localRoute = localRoutes[routeIndex];
		const rawCartesianSegments = await createCartesianRouteSegments(viewer, frame, localRoute.segments, {
			heightType: Number(globeConfig.heightType),
			lineHeight: Number(globeConfig.lineHeight),
			absoluteFlightHeight: heightResult.absoluteFlightHeight,
		});
		if (isStale()) {
			return null;
		}
		const previewLocalSegments = roundPlanarRouteSegments(localRoute.segments);
		const roundedCartesianSegments = await createCartesianRouteSegments(viewer, frame, previewLocalSegments, {
			heightType: Number(globeConfig.heightType),
			lineHeight: Number(globeConfig.lineHeight),
			absoluteFlightHeight: heightResult.absoluteFlightHeight,
		});
		if (isStale()) {
			return null;
		}
		if (Number(globeConfig.heightType) === 3 && takeoffPoint) {
			const firstLocalWaypoint = getFirstLocalRoutePoint(localRoute.segments);
			const firstCartesianWaypoint = getFirstCartesianRoutePoint(rawCartesianSegments);
			if (firstLocalWaypoint && firstCartesianWaypoint) {
				const maximumEntryTerrainHeight = await sampleMaximumTerrainHeightAlongSegments(viewer, frame, [
					{ type: 'transit', points: [takeoffPoint, firstLocalWaypoint] },
				]);
				if (isStale()) {
					return null;
				}
				const firstWaypointCartographic = Cesium.Cartographic.fromCartesian(firstCartesianWaypoint);
				if (!firstWaypointCartographic || firstWaypointCartographic.height <= maximumEntryTerrainHeight) {
					throw new Error(t('cesium.module.planarRoute.err.entryTerrainTooHigh'));
				}
			}
		}
		// 圆角仅用于地图预览；导出使用原始折线航点，由司空 coordinateTurn 在转弯处平滑过点。
		const exportConnection = connectTakeoffToFirstWaypoint(rawCartesianSegments);
		const previewConnection = connectTakeoffToFirstWaypoint(roundedCartesianSegments);
		const totalLength = calculateCartesianRouteLength(exportConnection.segments);
		plannedRoutes.push({
			id: localRoute.id,
			key: localRoute.key,
			label: localRoute.label,
			headingDegrees: localRoute.headingDegrees,
			gimbalPitchDegrees: localRoute.gimbalPitchDegrees,
			segments: previewConnection.segments,
			exportSegments: rawCartesianSegments,
			coordinates: flattenRouteCoordinates(previewConnection.segments),
			totalLength,
			climbLength: exportConnection.climbLength,
			photoCount: calculateRoutePhotoCount(rawCartesianSegments, photoDistance, isObliqueMode),
		});
	}
	if (plannedRoutes.length === 0) {
		throw new Error(t('cesium.module.planarRoute.err.noValidRouteGenerated'));
	}

	return { routes: plannedRoutes, photoDistance };
}
