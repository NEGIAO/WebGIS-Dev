/**
 * 功能名称：面状航线主航线角度方向指示
 * 日    期：2026/07/22
 *
 * 单张贴在测区切平面上的圆盘贴图（含平面白线），用于主航线角度交互反馈。
 */
import Cesium from 'cesium';
import { translate as t } from '@common/app/useLocale';

const INDICATOR_ENTITY_ID = 'planar_line_angle_indicator';

const CIRCLE_RADIUS_RATIO = 0.18;
const CIRCLE_RADIUS_MIN = 30;
const CIRCLE_RADIUS_MAX = 280;
const HEIGHT_ABOVE_ROUTE = 25;
const CANVAS_SIZE = 256;

let cachedCanvas: HTMLCanvasElement | null = null;

interface LineAngleIndicatorState {
	stRotation: number;
}

const indicatorStates = new WeakMap<Cesium.CustomDataSource, LineAngleIndicatorState>();

/**
 * 滑块角度 → 贴图 stRotation。
 * 贴图水平白线在 stRotation=0 时对应正东(90°)；wayLineCalc 为自北顺时针。
 * 观测关系：displayed ≈ 90° + stRotationDeg，故 stRotationDeg = angle - 90。
 */
function angleToStRotation(angleDegrees: number): number {
	return Cesium.Math.toRadians(angleDegrees) - Cesium.Math.PI_OVER_TWO;
}

/**
 * 在测区几何中心、航线上方显示/更新平面方向指示。
 */
export function updateLineAngleIndicator(dataSource: Cesium.CustomDataSource, polygonPositions: Cesium.Cartesian3[], angleDegrees: number, absoluteHeight: number): void {
	if (polygonPositions.length < 3 || !Number.isFinite(absoluteHeight)) {
		clearLineAngleIndicator(dataSource);
		return;
	}
	const stRotation = angleToStRotation(angleDegrees);
	const existing = dataSource.entities.getById(INDICATOR_ENTITY_ID);
	const existingState = indicatorStates.get(dataSource);
	if (existing?.ellipse && existingState) {
		existingState.stRotation = stRotation;
		return;
	}

	const centroid = computePolygonGeometricCentroid(polygonPositions);
	if (!centroid) {
		clearLineAngleIndicator(dataSource);
		return;
	}

	const radius = computeIndicatorRadius(polygonPositions, centroid);
	const centerOnEllipsoid = Cesium.Cartesian3.fromRadians(centroid.longitude, centroid.latitude, 0);
	const state: LineAngleIndicatorState = { stRotation };
	indicatorStates.set(dataSource, state);

	dataSource.entities.add({
		id: INDICATOR_ENTITY_ID,
		name: t('cesium.module.planarRoute.entity.lineAngleIndicator'),
		position: centerOnEllipsoid,
		ellipse: {
			semiMajorAxis: radius,
			semiMinorAxis: radius,
			height: absoluteHeight,
			heightReference: Cesium.HeightReference.NONE,
			material: new Cesium.ImageMaterialProperty({
				image: getIndicatorCanvas(),
				transparent: true,
			}),
			rotation: 0,
			stRotation: new Cesium.CallbackProperty(() => state.stRotation, false),
			outline: false,
		},
	});
}

/**
 * 由航线采样高度得到指示器绝对高度（略高于航线）。
 */
export function resolveIndicatorHeightFromSegments(segments: Array<{ positions: Cesium.Cartesian3[] }>): number | null {
	let maximumHeight = Number.NEGATIVE_INFINITY;
	for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
		const positions = segments[segmentIndex].positions;
		for (let pointIndex = 0; pointIndex < positions.length; pointIndex++) {
			const cartographic = Cesium.Cartographic.fromCartesian(positions[pointIndex]);
			if (!cartographic) {
				continue;
			}
			maximumHeight = Math.max(maximumHeight, cartographic.height);
		}
	}
	if (!Number.isFinite(maximumHeight)) {
		return null;
	}
	return maximumHeight + HEIGHT_ABOVE_ROUTE;
}

/**
 * 移除方向指示。
 */
export function clearLineAngleIndicator(dataSource: Cesium.CustomDataSource | null | undefined): void {
	if (!dataSource) {
		return;
	}
	dataSource.entities.removeById(INDICATOR_ENTITY_ID);
	indicatorStates.delete(dataSource);
}

/**
 * 测区多边形几何质心（经纬度平均，忽略闭合重复点）。
 */
function computePolygonGeometricCentroid(polygonPositions: Cesium.Cartesian3[]): Cesium.Cartographic | null {
	let sumLongitude = 0;
	let sumLatitude = 0;
	let count = 0;
	const lastIndex = polygonPositions.length - 1;
	for (let index = 0; index < polygonPositions.length; index++) {
		if (index === lastIndex && count > 0) {
			const first = polygonPositions[0];
			const last = polygonPositions[lastIndex];
			if (Cesium.Cartesian3.equalsEpsilon(first, last, Cesium.Math.EPSILON7)) {
				break;
			}
		}
		const cartographic = Cesium.Cartographic.fromCartesian(polygonPositions[index]);
		if (!cartographic) {
			continue;
		}
		sumLongitude += cartographic.longitude;
		sumLatitude += cartographic.latitude;
		count++;
	}
	if (count < 3) {
		return null;
	}
	return new Cesium.Cartographic(sumLongitude / count, sumLatitude / count, 0);
}

/**
 * 以质心到各顶点的最大水平距离估算指示圆半径。
 */
function computeIndicatorRadius(polygonPositions: Cesium.Cartesian3[], centroid: Cesium.Cartographic): number {
	const center = Cesium.Cartesian3.fromRadians(centroid.longitude, centroid.latitude, 0);
	let maximumDistance = 0;
	for (let index = 0; index < polygonPositions.length; index++) {
		const cartographic = Cesium.Cartographic.fromCartesian(polygonPositions[index]);
		if (!cartographic) {
			continue;
		}
		const vertex = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0);
		maximumDistance = Math.max(maximumDistance, Cesium.Cartesian3.distance(center, vertex));
	}
	return Math.min(CIRCLE_RADIUS_MAX, Math.max(CIRCLE_RADIUS_MIN, maximumDistance * CIRCLE_RADIUS_RATIO));
}

/**
 * 生成半透明圆 + 平面圆角白线贴图（无文字）。
 */
function getIndicatorCanvas(): HTMLCanvasElement {
	if (cachedCanvas) {
		return cachedCanvas;
	}

	const canvas = document.createElement('canvas');
	canvas.width = CANVAS_SIZE;
	canvas.height = CANVAS_SIZE;
	const context = canvas.getContext('2d');
	if (!context) {
		return canvas;
	}

	const center = CANVAS_SIZE / 2;
	const radius = center - 2;
	const backgroundColor = Cesium.Color.BLACK.withAlpha(0.5);
	const lineColor = Cesium.Color.WHITE;

	context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
	context.beginPath();
	context.arc(center, center, radius, 0, Math.PI * 2);
	context.fillStyle = backgroundColor.toCssColorString();
	context.fill();

	context.beginPath();
	context.moveTo(40, center);
	context.lineTo(CANVAS_SIZE - 40, center);
	context.strokeStyle = lineColor.toCssColorString();
	context.lineWidth = 12;
	context.lineCap = 'round';
	context.stroke();

	cachedCanvas = canvas;
	return canvas;
}
