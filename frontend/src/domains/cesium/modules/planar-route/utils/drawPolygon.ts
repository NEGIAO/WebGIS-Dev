import Cesium from 'cesium';
import globeConfig from '../config/planarConfig';
import { calculateArea } from './planarLine';
import { translate as t } from '@common/app/useLocale';
import * as turf from '@turf/turf';

export interface PolygonDrawingResult {
	polygonEntity: Cesium.Entity;
	lineEntity: Cesium.Entity;
	pointLast: Cesium.Entity;
	lineLast: Cesium.Entity;
	polygonPositions: Cesium.Cartesian3[];
	pointEntityList: Cesium.Entity[];
	entityLabelList: Cesium.Entity[];
	pointTndex?: number;
}

/** 测区多边形填充透明度（0~1），修改此处即可全局生效 */
const POLYGON_FILL_ALPHA = 0.3;
/** 测区自相交警告时填充透明度 */
const POLYGON_KINKS_FILL_ALPHA = 0.2;

/** 测区自相交警告浮层元素 ID（挂到 Viewer 容器，无头模式自管理） */
const KINKS_TIP_ID = 'planar-kinks-tip';

/**
 * 显示/隐藏测区自相交警告浮层（浮层由本模块按需创建于 Viewer 容器内）。
 * @param viewer 当前 Viewer
 * @param visible 是否显示
 */
function toggleKinksTip(viewer: Cesium.Viewer, visible: boolean): void {
	const host = (viewer.container as HTMLElement | undefined) ?? document.body;
	let tip = document.getElementById(KINKS_TIP_ID);
	if (!visible) {
		tip?.remove();
		return;
	}
	if (!tip) {
		tip = document.createElement('div');
		tip.id = KINKS_TIP_ID;
		tip.textContent = t('cesium.module.planarRoute.msg.kinksTip');
		Object.assign(tip.style, {
			position: 'absolute',
			top: '10px',
			left: '50%',
			transform: 'translateX(-50%)',
			background: 'rgba(255, 0, 0, 0.5)',
			color: '#fff',
			padding: '5px',
			borderRadius: '6px',
			fontSize: '13px',
			transition: 'all 0.5s ease-in-out',
			zIndex: '20',
			pointerEvents: 'none',
			whiteSpace: 'nowrap',
		});
		host.appendChild(tip);
	}
}

/** 格式化测区边长标签文本（本地化单位） */
function formatEdgeLabel(distanceMeters: number): string {
	return `${distanceMeters.toFixed(2)}${t('cesium.module.planarRoute.unit.meter')}`;
}

/**
 * 创建测区多边形填充材质。
 */
function createPolygonFillMaterial(alpha: number = POLYGON_FILL_ALPHA): Cesium.Color {
	return Cesium.Color.DODGERBLUE.withAlpha(alpha);
}

/** 图形自相交数量 */
let isKinks = false;

/** 多边形点位 */
let polygonPositions: any = [];

let entity: any = null;

let drawDataSource: any = null;

//此函数用来绘制多边形
export function drawPolygon(viewer, callback, cancelCallback: () => void): () => void {
	drawDataSource = window.mainViewer.dataSources.getByName('drawDataSource').at(-1);
	const mapContainer = document.querySelector<HTMLElement>('.wayMap');
	if (mapContainer) {
		// 设置自定义光标样式
		mapContainer.style.cursor = 'crosshair';
	} else {
		console.warn('未找到地图容器');
	}
	// 外部复用地图时悬停在 canvas 上，需同步十字光标
	viewer.canvas.style.cursor = 'crosshair';
	// callback('123')
	// console.log('用来控制多边形的绘制')
	const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
	const handler2 = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
	polygonPositions = [];
	resetKinksState();
	let polygonEntity = null;
	let lineEntity = null;
	let index = -1;
	const pointEntityList: any = [];
	const entityLabelist: any = [];

	/** 销毁本轮未完成绘制使用的事件监听。 */
	const cleanupDrawing = (): void => {
		document.removeEventListener('keydown', handleKeyDown);
		if (!handler.isDestroyed()) {
			handler.destroy();
		}
		if (!handler2.isDestroyed()) {
			handler2.destroy();
		}
		if (mapContainer) {
			mapContainer.style.cursor = 'default';
		}
		viewer.canvas.style.cursor = 'default';
	};

	/** 按 Esc 放弃未完成测区并立即重新进入绘制。 */
	const handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key !== 'Escape') {
			return;
		}
		event.preventDefault();
		cleanupDrawing();
		cancelCallback();
	};

	document.addEventListener('keydown', handleKeyDown);
	handler.setInputAction((click) => {
		/**点击位置笛卡尔坐标 */
		const cartesian = pickTerrainPosition(viewer, click.position);
		if (!cartesian) {
			return;
		}
		// return
		const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
		const lng = Cesium.Math.toDegrees(cartographic.longitude);
		const lat = Cesium.Math.toDegrees(cartographic.latitude);
		polygonPositions.push(cartesian);
		index++;
		const pointEntity = drawDataSource.entities.add({
			name: `polygonPoint`,
			position: new Cesium.CallbackProperty(function () {
				return Cesium.Cartesian3.fromDegrees(lng, lat);
			}, false),
			point: {
				pixelSize: 8.0,
				color: Cesium.Color.WHITE.withAlpha(0.8),
				outlineWidth: 1,
				outlineColor: Cesium.Color.WHITE,
				heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
				disableDepthTestDistance: Number.POSITIVE_INFINITY,
			},
			customData: index,
		});
		pointEntityList.push(pointEntity);

		entityLabelist.push(
			drawDataSource.entities.add({
				position: cartesian,
				label: {
					text: '0', // 显示的文本
					font: '14px sans-serif', // 字体
					fillColor: Cesium.Color.WHITE, // 字体颜色
					outlineWidth: 2, // 字体轮廓宽度
					clampToGround: true,
					showBackground: true,
					backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
					heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
					disableDepthTestDistance: Number.POSITIVE_INFINITY,
					horizontalOrigin: Cesium.HorizontalOrigin.CENTER, // 水平对齐
					verticalOrigin: Cesium.VerticalOrigin.CENTER, // 垂直对齐
					pixelOffset: new Cesium.Cartesian2(0, -20), // 向上偏移10像素
				},
				customData: Date.now(),
			}),
		);
		// console.log(entityLabel,'查看当前label的信息1')

		handler2.setInputAction((event) => {
			const currentPosition = pickTerrainPosition(viewer, event.endPosition);
			if (!currentPosition) {
				return;
			}
			if (polygonPositions.length === 1) {
				polygonPositions.push(currentPosition);
			}
			if (polygonPositions.length >= 2) {
				if (lineEntity === null) {
					lineEntity = drawDataSource.entities.add({
						polyline: {
							positions: new Cesium.CallbackProperty(function () {
								return polygonPositions;
							}, false),
							material: Cesium.Color.DODGERBLUE,
							width: 5, // 设置线段宽度
							clampToGround: true,
						},
					});
				}
				polygonPositions[polygonPositions.length - 1] = currentPosition;
			}

			// 获取当前鼠标移动对应的左键点击点坐标
			const clickIndex = polygonPositions.length - 2;
			const clickPointForLabel = polygonPositions[clickIndex];

			updateDistanceLabel(entityLabelist[clickIndex], clickPointForLabel, currentPosition);

			if (polygonPositions.length > 2) {
				iskinksBoolean();
				upEntityColor(polygonEntity, lineEntity);
			}
		}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

		// //绘制多边形
		if (polygonPositions.length >= 3) {
			if (polygonEntity === null) {
				polygonEntity = drawDataSource.entities.add({
					name: `polygon`,
					polygon: {
						hierarchy: new Cesium.CallbackProperty(function () {
							return new Cesium.PolygonHierarchy(polygonPositions);
						}, false),
						material: createPolygonFillMaterial(),
						outline: POLYGON_FILL_ALPHA > 0,
						outlineColor: Cesium.Color.BLACK,
						outlineWidth: 12,
					},
				});
			}
		}
	}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

	//鼠标右击事件结束
	handler.setInputAction((click) => {
		if (polygonPositions.length < 3) {
			return;
		}
		// 恢复鼠标样式
		if (mapContainer) {
			mapContainer.style.cursor = 'default';
		}
		viewer.canvas.style.cursor = 'default';
		const cartesian = pickTerrainPosition(viewer, click.position);
		if (!cartesian) {
			return;
		}
		polygonPositions[polygonPositions.length - 1] = cartesian;
		const previousEdgeIndex = polygonPositions.length - 2;
		updateDistanceLabel(entityLabelist[previousEdgeIndex], polygonPositions[previousEdgeIndex], cartesian);
		iskinksBoolean();
		upEntityColor(polygonEntity, lineEntity);
		if (isKinks) {
			return;
		}
		const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
		const lng = Cesium.Math.toDegrees(cartographic.longitude);
		const lat = Cesium.Math.toDegrees(cartographic.latitude);
		const pointLast = drawDataSource.entities.add({
			name: `polygonPoint`,
			position: new Cesium.CallbackProperty(function () {
				return Cesium.Cartesian3.fromDegrees(lng, lat);
			}, false),
			point: {
				pixelSize: 8.0,
				color: Cesium.Color.WHITE,
				outlineWidth: 1,
				outlineColor: Cesium.Color.WHITE,
				heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
				disableDepthTestDistance: Number.POSITIVE_INFINITY,
			},
			customData: index + 1,
		});
		pointEntityList.push(pointLast);
		const lineLast = drawDataSource.entities.add({
			polyline: {
				positions: new Cesium.CallbackProperty(function () {
					return [polygonPositions[polygonPositions.length - 1], polygonPositions[0]];
				}, false),
				material: Cesium.Color.DODGERBLUE,
				width: 5, // 设置线段宽度
				clampToGround: true,
			},
		});
		const closingMetrics = calculateEdgeMetrics(polygonPositions[polygonPositions.length - 1], polygonPositions[0]);
		entityLabelist.push(
			drawDataSource.entities.add({
				position: closingMetrics.middlePosition,
 				label: {
					text: formatEdgeLabel(closingMetrics.distance), // 显示的文本
					font: '16px sans-serif', // 字体
					fillColor: Cesium.Color.WHITE, // 字体颜色
					clampToGround: true,
					showBackground: true,
					backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
					heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
					disableDepthTestDistance: Number.POSITIVE_INFINITY,
					horizontalOrigin: Cesium.HorizontalOrigin.CENTER, // 水平对齐
					verticalOrigin: Cesium.VerticalOrigin.CENTER, // 垂直对齐
					pixelOffset: new Cesium.Cartesian2(0, -20), // 向上偏移10像素
				},
				customData: Date.now(),
			}),
		);
		cleanupDrawing();
		const params = {
			polygonEntity: polygonEntity,
			lineEntity: lineEntity,
			pointLast: pointLast,
			lineLast: lineLast,
			polygonPositions: polygonPositions,
			pointEntityList: pointEntityList,
			entityLabelList: entityLabelist,
		};

		globeConfig.polygonPositions = polygonPositions;

		globeConfig.area = Number(calculateArea(params.polygonPositions).toFixed(2));

		callback(params);
	}, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

	return cleanupDrawing;
}

/**
 * 使用导入坐标恢复可继续拖拽编辑的测区实体。
 */
export function drawImportedPolygon(viewer: Cesium.Viewer, importedPositions: Cesium.Cartesian3[]): PolygonDrawingResult {
	if (importedPositions.length < 3) {
		throw new Error(t('cesium.module.planarRoute.err.importedPolygonMinVertices'));
	}
	const drawSources = viewer.dataSources.getByName('drawDataSource');
	const dataSource = drawSources.at(-1);
	if (!(dataSource instanceof Cesium.CustomDataSource)) {
		throw new Error(t('cesium.module.planarRoute.err.dataSourceNotReady'));
	}

	polygonPositions = [];
	for (let index = 0; index < importedPositions.length; index++) {
		polygonPositions.push(Cesium.Cartesian3.clone(importedPositions[index]));
	}
	resetKinksState();

	const polygonEntity = dataSource.entities.add({
		name: 'polygon',
		polygon: {
			hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(polygonPositions), false),
			material: createPolygonFillMaterial(),
			outline: POLYGON_FILL_ALPHA > 0,
			outlineColor: Cesium.Color.BLACK,
			outlineWidth: 12,
			heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
			perPositionHeight: false,
		},
	});
	const lineEntity = dataSource.entities.add({
		polyline: {
			positions: new Cesium.CallbackProperty(() => polygonPositions, false),
			material: Cesium.Color.DODGERBLUE,
			width: 5,
			clampToGround: true,
		},
	});
	const lineLast = dataSource.entities.add({
		polyline: {
			positions: new Cesium.CallbackProperty(() => [polygonPositions[polygonPositions.length - 1], polygonPositions[0]], false),
			material: Cesium.Color.DODGERBLUE,
			width: 5,
			clampToGround: true,
		},
	});

	const pointEntityList: Cesium.Entity[] = [];
	const entityLabelList: Cesium.Entity[] = [];
	for (let index = 0; index < polygonPositions.length; index++) {
		const position = polygonPositions[index];
		const pointEntity = dataSource.entities.add({
			name: 'polygonPoint',
			position,
			point: {
				pixelSize: 8,
				color: Cesium.Color.WHITE.withAlpha(0.8),
				outlineWidth: 1,
				outlineColor: Cesium.Color.WHITE,
				heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
				disableDepthTestDistance: Number.POSITIVE_INFINITY,
			},
		});
		const editablePoint = pointEntity as Cesium.Entity & { customData?: number };
		editablePoint.customData = index;
		pointEntityList.push(pointEntity);

		const nextIndex = (index + 1) % polygonPositions.length;
 			const metrics = calculateEdgeMetrics(position, polygonPositions[nextIndex]);
 		entityLabelList.push(
 			dataSource.entities.add({
 				position: metrics.middlePosition,
 				label: {
 					text: formatEdgeLabel(metrics.distance),
					font: '16px sans-serif',
					fillColor: Cesium.Color.WHITE,
					outlineWidth: 2,
					showBackground: true,
					backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
					heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
					disableDepthTestDistance: Number.POSITIVE_INFINITY,
					horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
					verticalOrigin: Cesium.VerticalOrigin.CENTER,
					pixelOffset: new Cesium.Cartesian2(0, -20),
				},
			}),
		);
	}

	globeConfig.polygonPositions = polygonPositions;
	globeConfig.area = Number(calculateArea(polygonPositions).toFixed(2));
	viewer.scene.requestRender();
	return {
		polygonEntity,
		lineEntity,
		pointLast: pointEntityList[pointEntityList.length - 1],
		lineLast,
		polygonPositions,
		pointEntityList,
		entityLabelList,
	};
}

//移动多边形的各个边
export function movePolygon(entityObjPolygonObj, viewer, callback) {
	entity = entityObjPolygonObj;
	const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
	handler.setInputAction((event) => {
		const currentPosition = pickTerrainPosition(viewer, event.endPosition);
		if (!currentPosition) {
			return;
		}
		const pointIndex = entityObjPolygonObj.pointTndex;
		if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= entityObjPolygonObj.polygonPositions.length) {
			return;
		}

		entityObjPolygonObj.polygonPositions[pointIndex] = currentPosition;
		const pointCount = entityObjPolygonObj.polygonPositions.length;
		const previousEdgeIndex = (pointIndex - 1 + pointCount) % pointCount;
		updatePolygonEdgeLabel(entityObjPolygonObj, previousEdgeIndex);
		updatePolygonEdgeLabel(entityObjPolygonObj, pointIndex);

		entityObjPolygonObj.polygonEntity.polygon.hierarchy = new Cesium.CallbackProperty(() => {
			return new Cesium.PolygonHierarchy(entityObjPolygonObj.polygonPositions);
		}, false);
		entityObjPolygonObj.lineEntity.polyline.positions = new Cesium.CallbackProperty(() => {
			return entityObjPolygonObj.polygonPositions;
		}, false);
		entityObjPolygonObj.lineLast.polyline.positions = new Cesium.CallbackProperty(() => {
			return [entityObjPolygonObj.polygonPositions[pointCount - 1], entityObjPolygonObj.polygonPositions[0]];
		}, false);
		entityObjPolygonObj.pointEntityList[pointIndex].position = new Cesium.CallbackProperty(() => {
			return currentPosition;
		}, false);

		polygonPositions = entityObjPolygonObj.polygonPositions;
		if (polygonPositions.length > 2) {
			iskinksBoolean();
			upEntityColor(entity.polygonEntity, entity.lineEntity, entity.lineLast);
		}
	}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

	handler.setInputAction(() => {
		if (isKinks) {
			return;
		}
		handler.destroy();
		const params = {
			polygonEntity: entityObjPolygonObj.polygonEntity,
			lineEntity: entityObjPolygonObj.lineEntity,
			pointLast: entityObjPolygonObj.pointLast,
			lineLast: entityObjPolygonObj.lineLast,
			polygonPositions: entityObjPolygonObj.polygonPositions,
			pointEntityList: entityObjPolygonObj.pointEntityList,
			entityLabelList: entityObjPolygonObj.entityLabelList,
		};
		callback(params);
	}, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
}

/**
 * 更新移动顶点影响到的指定边标签。
 */
function updatePolygonEdgeLabel(entityObjPolygonObj, edgeIndex: number) {
	const positions = entityObjPolygonObj.polygonPositions;
	const nextIndex = (edgeIndex + 1) % positions.length;
	updateDistanceLabel(entityObjPolygonObj.entityLabelList[edgeIndex], positions[edgeIndex], positions[nextIndex]);
}

/**
 * 使用椭球表面距离更新边长标签和标签位置。
 */
function updateDistanceLabel(labelEntity, start: Cesium.Cartesian3, end: Cesium.Cartesian3) {
	if (!labelEntity) {
		return;
	}
	const metrics = calculateEdgeMetrics(start, end);
	labelEntity.position = new Cesium.ConstantPositionProperty(metrics.middlePosition);
	labelEntity.label.text = formatEdgeLabel(metrics.distance);
}

/**
 * 计算边的椭球表面距离及地理中点。
 */
function calculateEdgeMetrics(start: Cesium.Cartesian3, end: Cesium.Cartesian3): { distance: number; middlePosition: Cesium.Cartesian3 } {
	const startCartographic = Cesium.Cartographic.fromCartesian(start);
	const endCartographic = Cesium.Cartographic.fromCartesian(end);
	const geodesic = new Cesium.EllipsoidGeodesic(startCartographic, endCartographic);
	const middleCartographic = geodesic.interpolateUsingFraction(0.5);
	const middlePosition = Cesium.Cartographic.toCartesian(middleCartographic);
	return {
		distance: geodesic.surfaceDistance,
		middlePosition,
	};
}

/**
 * 仅拾取 Cesium 地形表面，避免测区顶点落到 3D Tiles 或无深度区域。
 */
function pickTerrainPosition(viewer: Cesium.Viewer, windowPosition: Cesium.Cartesian2): Cesium.Cartesian3 | undefined {
	const ray = viewer.camera.getPickRay(windowPosition);
	if (!ray) {
		return undefined;
	}
	return viewer.scene.globe.pick(ray, viewer.scene);
}

function iskinksBoolean() {
	// if(polygonPositions.length == 0) return

	const outPoint = polygonPositions.map((e) => {
		const ellipsoid = window.mainViewer.scene.globe.ellipsoid;
		const cartographic = ellipsoid.cartesianToCartographic(e);
		return [Cesium.Math.toDegrees(cartographic.longitude), Cesium.Math.toDegrees(cartographic.latitude)];
	});

	outPoint.push(outPoint[0]);

	const polygon = turf.polygon([outPoint]);
	const kinks = turf.kinks(polygon);

	isKinks = kinks.features.length > 0;

	if (window.mainViewer) {
		toggleKinksTip(window.mainViewer, isKinks);
	}
}

/**
 * 重置测区自相交状态和错误提示。
 */
function resetKinksState(): void {
	isKinks = false;
	document.getElementById(KINKS_TIP_ID)?.remove();
}

function upEntityColor(polygonEntity, lineEntity, lastLineEntity?) {
	if (isKinks) {
		polygonEntity.polygon.material = Cesium.Color.RED.withAlpha(POLYGON_KINKS_FILL_ALPHA);
		lineEntity.polyline.material = Cesium.Color.RED;
		if (lastLineEntity) {
			lastLineEntity.polyline.material = Cesium.Color.RED;
		}
	} else {
		polygonEntity.polygon.material = createPolygonFillMaterial();
		lineEntity.polyline.material = Cesium.Color.DODGERBLUE;
		if (lastLineEntity) {
			lastLineEntity.polyline.material = Cesium.Color.DODGERBLUE;
		}
	}
}
