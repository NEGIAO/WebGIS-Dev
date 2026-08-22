/**
 * 功能名称：面状航线工具类
 * 日    期：2025/06/11 17:59:20
 */
import Cesium from 'cesium';
import startPoint_icon from '../img/start_point.svg';
import globeConfig, { PLANAR_FALLBACK_POSITION_DEGREES } from '../config/planarConfig';
import { getImg } from './comm';
import { reactive } from 'vue';
import { translate as t } from '@common/app/useLocale';
import * as turf from '@turf/turf';

// 航线点数组
export const airLinePointData: any = reactive({
	startPoint: null, // 起飞点
	startPointList: [], // 存放生成的起飞点
	pointList: [], // 航线点
	activePointIndex: 0, // 当前选中的航线点索引
});

const START_POINT_TIP_CLASS = 'planar-start-point-tips';

/** 在 Viewer 宿主容器内显示起飞点拾取中心提示（浮层 UI 移除后自带内联样式） */
function showStartPointTip(viewer: Cesium.Viewer): void {
	const host = (viewer.container as HTMLElement | undefined) ?? document.body;
	hideStartPointTip();
	const tip = document.createElement('div');
	tip.className = START_POINT_TIP_CLASS;
	tip.textContent = t('cesium.module.planarRoute.msg.pickTakeoffTip');
	Object.assign(tip.style, {
		position: 'absolute',
		top: '96px',
		left: '50%',
		transform: 'translateX(-50%)',
		textAlign: 'center',
		pointerEvents: 'none',
		color: '#fff',
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		width: '800px',
		maxWidth: '80%',
		height: '64px',
		fontSize: '14px',
		lineHeight: '64px',
		zIndex: '20',
	});
	host.appendChild(tip);
}

/** 移除起飞点拾取中心提示 */
export function hideStartPointTip(): void {
	document.querySelector(`.${START_POINT_TIP_CLASS}`)?.remove();
}

/** 起飞点拾取光标（同步到 viewer.canvas 与其宿主容器） */
export function setStartPointCursor(viewer: Cesium.Viewer, enabled: boolean): void {
	const cursor = enabled ? `url(${startPoint_icon}) 32 32, auto` : '';
	viewer.canvas.style.cursor = cursor;
	if (viewer.container instanceof HTMLElement) {
		viewer.container.style.cursor = cursor;
	}
	if (enabled) {
		showStartPointTip(viewer);
	} else {
		hideStartPointTip();
	}
}

/** 起飞点拾取专用 handler（独立实例，销毁时不影响宿主其它左键逻辑） */
let startPointHandler: Cesium.ScreenSpaceEventHandler | null = null;

/**
 * 取消参考起飞点拾取：销毁专用 handler、恢复光标并移除提示。
 */
export function cancelStartPointPick(viewer: Cesium.Viewer): void {
	if (startPointHandler) {
		if (!startPointHandler.isDestroyed()) {
			startPointHandler.destroy();
		}
		startPointHandler = null;
	}
	setStartPointCursor(viewer, false);
}

/**
 * 进入参考起飞点拾取（共享 Viewer 安全版：使用专用 ScreenSpaceEventHandler，
 * 而非 viewer.screenSpaceEventHandler，避免 removeInputAction 清掉宿主左键逻辑）。
 */
export function addStartPoint(viewer: Cesium.Viewer, cb?: (cartesian?: any, option?: any) => void) {
	cancelStartPointPick(viewer);
	setStartPointCursor(viewer, true);

	const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
	startPointHandler = handler;
	handler.setInputAction((e) => {
		// 从相机位置和鼠标事件位置生成射线
		const ray: any = viewer.camera.getPickRay(e.position);
		// 地球表面拾取点
		const cartesian: any = viewer.scene.globe.pick(ray, viewer.scene);
		// 绘制起飞轨迹
		drawFlyStartLine(viewer, cartesian);
		// 拾取完成即销毁专用 handler
		cancelStartPointPick(viewer);

		// 笛卡尔转为弧度（无拾取结果时用兜底经纬度，运行时惰性创建）
		const fallback = cartesian ?? Cesium.Cartesian3.fromDegrees(
			PLANAR_FALLBACK_POSITION_DEGREES.longitude,
			PLANAR_FALLBACK_POSITION_DEGREES.latitude,
			PLANAR_FALLBACK_POSITION_DEGREES.height,
		);
		const cartographic = Cesium.Cartographic.fromCartesian(fallback);
		// 获取到海拔高度
		const hb = viewer.scene.globe.getHeight(cartographic) || 0;

		// 初始高度设置
		const height = hb;
		if (globeConfig.heightType === 1) {
			globeConfig.lineHeight = Number(hb.toFixed(1)) + 100;
		}
		const position = Cesium.Cartesian3.fromDegrees(Cesium.Math.toDegrees(cartographic.longitude), Cesium.Math.toDegrees(cartographic.latitude), height);
		globeConfig.flyPosition = position as any;

		// 回调逻辑
		cb?.(position, globeConfig);
	}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

/**
 * 绘制航线起飞点+安全高度轨迹线
 * 优先写入面状航线托管数据源 drawDataSource（统一图层管理：随数据源显隐/移除），
 * 无托管源时退回 viewer 实体层（兼容模块未绑定场景）。
 */
export function drawFlyStartLine(viewer: Cesium.Viewer, cartesian: Cesium.Cartesian3) {
	const managed = viewer.dataSources.getByName('drawDataSource').at(-1);
	const container: any = managed ?? viewer;
	// 删除上一次绘制的起飞点
	if (airLinePointData.startPoint) {
		container.entities.remove(airLinePointData.startPoint);
	}

	const startPoint: Cesium.Entity.ConstructorOptions = {
		id: 'startPoint',
		position: cartesian,
		billboard: {
			image: startPoint_icon,
			scale: 0.8,
			horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
			verticalOrigin: Cesium.VerticalOrigin.CENTER,
			// 紧贴地形
			heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
			// 可见范围
			distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 200000),
			// 缩放比例
			scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1, 1.5e7, 0.3),
			// 半透明度
			translucencyByDistance: new Cesium.NearFarScalar(0, 0, 200, 0.6),
		},
	};
	const point = container.entities.add(startPoint);
	airLinePointData.startPoint = point;
	// 更改全局起飞点状态为已设置
	globeConfig.isSetTakeoffPoint = true;
}

/**
 * 绘制起始点
 * @param {Cesium.Cartesian3} point
 * @param {object} [container] 承载数据源（缺省退回 viewer 实体层）
 */
export function drawStartPoint(point, container?: { entities: any }) {
	const host: any = container ?? window.mainViewer;
	host?.entities?.removeById(`air_start_point`);
	const pointEntity: any = {
		name: 'point',
		id: `air_start_point`,
		position: point,
		billboard: {
			image: getImg(1),
			width: 30,
			height: 30,
			// 始终面向相机
			eyeOffset: new Cesium.Cartesian3(0, 0, 0),
			pixelOffset: new Cesium.Cartesian2(0, -15),
		},
		properties: globeConfig,
	};

	host?.entities?.add(pointEntity);
}

/**
 * 获取起飞点及起飞点地面坐标
 * @param {Cesium.Cartesian3} point
 */
export function getStartPointHeight(point): Array<Cesium.Cartesian3> {
	const points: Array<Cesium.Cartesian3> = [];

	const ellipsoid = window.mainViewer.scene.globe.ellipsoid;
	const cartographic = ellipsoid.cartesianToCartographic(point);

	const lon = Cesium.Math.toDegrees(cartographic.longitude);
	const lat = Cesium.Math.toDegrees(cartographic.latitude);

	points.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0));

	points.push(point);

	return points;
}

/**
 * 计算面积
 * @param {Cesium.Cartesian3} positions
 * @returns {number} 单位：平方米
 */
export function calculateArea(positions: Array<Cesium.Cartesian3>) {
	const outPoint: any = positions.map((e) => {
		const ellipsoid = window.mainViewer.scene.globe.ellipsoid;
		const cartographic = ellipsoid.cartesianToCartographic(e);
		return [Cesium.Math.toDegrees(cartographic.longitude), Cesium.Math.toDegrees(cartographic.latitude)];
	});

	outPoint.push(outPoint[0]);

	const polygon = turf.polygon([outPoint]);

	return turf.area(polygon);
}

/**
 * 处理两点之间连线是否超出边界 // 待完善
 * @param {Cesium.Cartesian3} points
 * @param sidePoint
 */
export function handleLineOutOfBoundary(points: Array<[]>, sidePoint) {
	const outPoint: any[] = [];

	const polygon = turf.polygon([sidePoint]);

	const np = [...sidePoint];

	np.pop();

	const line = turf.lineString(np);

	for (let i = 0; i < points.length - 1; i++) {
		const start = turf.point(points[i]);

		const stop = turf.point(points[i + 1]);

		const sliced = turf.lineSlice(start, stop, line);

		const nowLine = turf.lineString([points[i], points[i + 1]]);

		// console.log('边缘计算', sliced);
		const booleanContains = turf.booleanContains(polygon, nowLine);

		if (sliced.geometry.coordinates.length >= 3 && !booleanContains) {
			// 判断方向
			let slicedPoint = sliced.geometry.coordinates;

			const dis1 = turf.distance(turf.point(slicedPoint[0]), points[i], { units: 'meters' });
			const dis2 = turf.distance(turf.point(slicedPoint[slicedPoint.length - 1]), points[i], { units: 'meters' });

			if (dis1 > dis2) {
				slicedPoint = slicedPoint.reverse();
			}

			outPoint.push(...slicedPoint);
			// console.log('外部');
		} else {
			outPoint.push(points[i]);
			// console.log('内部');
		}

		// console.log('交点数', sliced.geometry.coordinates.length);
	}
	outPoint.push(points[points.length - 1]);

	return outPoint;
}

/**
 * 将 linesArrs 转换为经纬度格式
 */
export function convertToPositions(flatArray) {
	let positions: any = [];
	let i = 0;
	while (i < flatArray.length) {
		positions.push(flatArray.slice(i, i + 3));
		i += 3;
	}

	positions = positions.map((res) => {
		let height = 0;
		if (globeConfig.heightType == 1) {
			height = globeConfig.lineHeight;
		} else if (globeConfig.heightType == 2) {
			height = getRelativeHeight(globeConfig.flyPosition as any, globeConfig.lineHeight);
		} else {
			height = getHeight(res[0], res[1]);
		}
		return Cesium.Cartesian3.fromDegrees(res[0], res[1], height);
	});
	return positions;
}

/**
 * 相对地形高度
 * @param {number} longitude
 * @param {number} latitude
 * @returns {number} 高度
 */
function getHeight(longitude, latitude) {
	const c3 = Cesium.Cartesian3.fromDegrees(longitude, latitude);

	// 笛卡尔转为弧度
	const cartographic = Cesium.Cartographic.fromCartesian(c3);
	// 获取到海拔高度
	const hb: any = window.mainViewer.scene.globe.getHeight(cartographic);

	return hb + globeConfig.lineHeight;
}

/**
 * 相对起飞点高度
 * @param {Cesium.Cartesian3} position 相对起飞点
 * @param {number} height 相对高度
 */
function getRelativeHeight(position: Cesium.Cartesian3, height: number) {
	// 笛卡尔转为弧度
	const cartographic = Cesium.Cartographic.fromCartesian(position);

	// 获取到海拔高度
	const hb: any = window.mainViewer.scene.globe.getHeight(cartographic);

	return hb + height;
}
