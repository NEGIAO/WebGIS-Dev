/**
 * 功能名称：航线绘制地图工具
 * 日    期：2025/06/11 16:17:13
 */
import Cesium from 'cesium';
import { translate as t } from '@common/app/useLocale';

let handler: Cesium.ScreenSpaceEventHandler;

/**
 * 飞行到指定区域
 * @param viewer Cesium Viewer 实例
 */
export const flyToBoundingBox = (viewer: Cesium.Viewer, bbox: any[], cb?: () => void): void => {
	const rectangle = Cesium.Rectangle.fromDegrees(+bbox[0], +bbox[1], +bbox[2], +bbox[3]);
	viewer.camera.flyTo({
		destination: rectangle,
		duration: 0,
		orientation: {
			heading: Cesium.Math.toRadians(0),
			pitch: Cesium.Math.toRadians(-90),
			roll: 0.0,
		},
		pitchAdjustHeight: -45,
		maximumHeight: 5000,
		flyOverLongitude: 108,
		complete: function () {
			cb?.();
		},
	});
};

/**
 * 主地图相机定位到指定航点（列表点击定位，无动画直接跳转）
 * @param viewer 主地图 Viewer
 * @param position 航点笛卡尔坐标
 */
export function flyMainCameraToWaypoint(viewer: Cesium.Viewer | null | undefined, position: Cesium.Cartesian3) {
	if (!viewer || viewer.isDestroyed?.() || !position) return;
	try {
		viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
		const range = 450;
		const pitch = Cesium.Math.toRadians(-45);
		const heading = viewer.camera.heading;
		viewer.camera.viewBoundingSphere(new Cesium.BoundingSphere(position, 1), new Cesium.HeadingPitchRange(heading, pitch, range));
		// 解除 lookAt 锁定，保证后续缩放/平移可用
		viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
	} catch (e) {
		console.error('[AirlineEdit] flyMainCameraToWaypoint', e);
	}
}

export function setViewer(viewer: Cesium.Viewer, option?: any) {
	viewer.camera.setView(option);
}
/**
 * 向地图添加事件
 * @param viewer Cesium Viewer 实例
 * @param callback 事件回调函数
 */
export function addMapEvent(viewer: Cesium.Viewer, type: Cesium.ScreenSpaceEventType, callback: (pick) => void) {
	// 注册事件处理器
	handler = viewer.screenSpaceEventHandler;

	// 为鼠标左键点击事件添加处理函数
	handler.setInputAction((event: any) => {
		callback(event);
	}, type);
}

/**
 * 删除注册的事件
 */
export function removeMapEvent(type: Cesium.ScreenSpaceEventType) {
	if (handler) {
		handler.removeInputAction(type);
		// handler.destroy();
	}
}

/**
 * 在更新相机状态之前执行的函数，用于获取并保存相机的位置信息。
 * @param {Object} viewer Cesium的视图对象，用于获取相机位置。
 * @param {Object} cameraState 用于存储相机位置状态的对象，包括经度、纬度和高度。
 */
export const preUpdate = (viewer, cameraState) => {
	const direct = viewer.scene.camera;
	const cameraPos = viewer.scene.camera.positionCartographic;
	const height = cameraPos.height;
	cameraState.h = height;
	cameraState.heading = 360 - Cesium.Math.toDegrees(direct.heading);
	cameraState.pitch = Cesium.Math.toDegrees(direct.pitch);
	cameraState.roll = Cesium.Math.toDegrees(direct.roll);
};

/**
 * 根据鼠标移动事件更新DOM元素中的相机状态。
 * 此函数计算鼠标事件结束位置对应的地理坐标，并更新DOM元素中的相机状态（经度、纬度、高度）。
 *
 * @param {Object} e 鼠标移动事件对象，包含事件的结束位置。
 * @param {Object} viewer Cesium的观众对象，用于获取相机和场景信息。
 * @param {Object} dom 包含相机状态的DOM元素，其cameraState属性将被更新。
 */
export function moveEvent(e, viewer, cameraState) {
	// 从相机位置和鼠标事件位置生成射线
	const ray = viewer.camera.getPickRay(e.endPosition);
	// 尝试在地球表面拾取点
	const cartesian = viewer.scene.globe.pick(ray, viewer.scene);

	if (cartesian) {
		// 笛卡尔转为弧度
		const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
		// 弧度转化为经纬度
		cameraState.x = Cesium.Math.toDegrees(cartographic.longitude);
		cameraState.y = Cesium.Math.toDegrees(cartographic.latitude);
		// 获取地理坐标的海拔高度
		cameraState.hb = viewer.scene.globe.getHeight(cartographic);
	}
}

/**
 * 获取一个点的地形高度
 */
export async function getTerrainHeight(viewer: Cesium.Viewer, longitude, latitude) {
	// 1. 将经纬度转换为Cartographic（弧度制）
	const position = Cesium.Cartographic.fromDegrees(longitude, latitude);

	// 2. 调用sampleTerrain获取高度（需传入地形提供器和层级）
	const terrainProvider = viewer.terrainProvider;
	const positions = await Cesium.sampleTerrainMostDetailed(terrainProvider, [position]); // 11是地形细节层级

	// 3. 返回高度（若地形加载失败，可能返回undefined）
	return positions[0]?.height;
}

/**
 * 计算一个点高度加固定高度的点
 * @param point 输入点
 * @param distance 输入距离
 */
export function calcDestPoint(cartesian: Cesium.Cartesian3, distance: number) {
	// 将笛卡尔坐标转换为地理坐标（弧度制）
	const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
	// 增加高度300米（注意单位是米）
	cartographic.height += distance;
	// 转换回笛卡尔坐标
	const newPoint = Cesium.Cartographic.toCartesian(cartographic);
	return newPoint;
}

/**
 * 获取cesium坐标点高度
 * @param cartesian
 * @returns height
 */
export function getCartesianHeight(cartesian: Cesium.Cartesian3) {
	const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
	return cartographic.height;
}

/**
 * cesium坐标点修改高度
 * @param cartesian
 * @param height 高度
 * @returns cartesian
 */
export function modifyCartesianHeight(cartesian: Cesium.Cartesian3, height: number) {
	const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
	cartographic.height = height;
	const newCartesian = Cesium.Cartographic.toCartesian(cartographic);
	return newCartesian;
}

/**
 * 笛卡尔转经纬度
 */
export function cartesian2LngLat(cartesian: Cesium.Cartesian3) {
	const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
	const longitude = Cesium.Math.toDegrees(cartographic.longitude);
	const latitude = Cesium.Math.toDegrees(cartographic.latitude);
	return [longitude, latitude, cartographic.height];
}

/**
 * 经纬度转笛卡尔
 */
export function lngLat2Cartesian(lngLat: number[]) {
	const cartesian = Cesium.Cartesian3.fromDegrees(lngLat[0], lngLat[1], lngLat[2]);
	return cartesian;
}

/**
 * 根据两个坐标点,获取Heading(朝向)
 * @param { Cesium.Cartesian3 } startPoint
 * @param { Cesium.Cartesian3 } endPoint
 * @returns
 */
export function getHeading(startPoint, endPoint) {
	const startCartographic = Cesium.Cartographic.fromCartesian(startPoint);
	const endCartographic = Cesium.Cartographic.fromCartesian(endPoint);
	const startLongitude = Cesium.Math.toDegrees(startCartographic.longitude);
	const startLatitude = Cesium.Math.toDegrees(startCartographic.latitude);
	const endLongitude = Cesium.Math.toDegrees(endCartographic.longitude);
	const endLatitude = Cesium.Math.toDegrees(endCartographic.latitude);

	let angle = Math.atan2(endLongitude - startLongitude, endLatitude - startLatitude);
	angle = Cesium.Math.toDegrees(angle);
	angle = (angle + 360) % 360; // 将角度转换为0-360度的范围
	return angle;
}

/**
 * Cesium 截图（防崩溃：校验 viewer、postRender 内 try/catch、只回调一次）
 * @param viewer
 * @param cb 回调 base64 或 null（viewer 无效/截图失败时）
 */
export function takeScreenshot(viewer: Cesium.Viewer, cb: (data: string | null) => void) {
	if (!viewer || !viewer.scene || !viewer.scene.canvas) {
		cb(null);
		return;
	}
	let fired = false;
	const postRenderHandler = function () {
		if (fired) return;
		try {
			if (!viewer.scene || !viewer.scene.canvas) {
				cb(null);
				fired = true;
				return;
			}
			const screenshot = viewer.scene.canvas.toDataURL('image/png');
			fired = true;
			viewer.scene.postRender.removeEventListener(postRenderHandler);
			cb(screenshot);
		} catch (_e) {
			fired = true;
			try {
				viewer.scene?.postRender?.removeEventListener(postRenderHandler);
			} catch (_) {
				// 监听器可能已被移除，忽略
			}
			cb(null);
		}
	};
	try {
		viewer.scene.postRender.addEventListener(postRenderHandler);
	} catch (_e) {
		cb(null);
	}
}

/**
 * 根据 kmzToJson 解析结果绘制线
 * 支持传入 Document / { Placemark } / Placemark 数组
 */
export const drawKmzPolyline = (viewer: Cesium.Viewer, kmzData: any, cb) => {
	if (!viewer || !kmzData) {
		cb?.([]);
		return;
	}

	let placemarks: any[] = [];
	if (Array.isArray(kmzData)) {
		placemarks = kmzData;
	} else if (kmzData.Placemark) {
		placemarks = Array.isArray(kmzData.Placemark) ? kmzData.Placemark : [kmzData.Placemark];
	} else if (kmzData.Folder) {
		const folders = Array.isArray(kmzData.Folder) ? kmzData.Folder : [kmzData.Folder];
		for (let i = 0; i < folders.length; i++) {
			const pm = folders[i]?.Placemark;
			if (!pm) continue;
			if (Array.isArray(pm)) {
				placemarks.push(...pm);
			} else {
				placemarks.push(pm);
			}
		}
	}

	const list = placemarks;
	let firstEntity: Cesium.Entity | undefined;
	const lonlatList: any[] = [];
	list.forEach((pm: any) => {
		const coordStr = pm?.LineString?.coordinates;
		if (!coordStr) return;
		const positions: Cesium.Cartesian3[] = [];

		const segments = coordStr
			.trim()
			.split(/\s+/)
			.map((s: string) => s.split(',').map((n) => Number(n)));

		segments.forEach((arr: number[]) => {
			const [lng, lat, height] = arr;
			if (isNaN(lng) || isNaN(lat)) return;
			const h = isNaN(height) ? 0 : height;
			positions.push(Cesium.Cartesian3.fromDegrees(lng, lat, h));
			lonlatList.push([lng, lat, h]);
		});

		if (!positions.length) return;

		// 解析颜色（KML 颜色格式 AABBGGRR，例如 ff0000ff 表示不透明红色）
		let material: Cesium.Color = Cesium.Color.RED;
		const colorStr: string | undefined = pm?.Style?.LineStyle?.color;
		if (colorStr && colorStr.length === 8) {
			const a = parseInt(colorStr.slice(0, 2), 16);
			const b = parseInt(colorStr.slice(2, 4), 16);
			const g = parseInt(colorStr.slice(4, 6), 16);
			const r = parseInt(colorStr.slice(6, 8), 16);
			material = Cesium.Color.fromBytes(r, g, b, a);
		}

		const width = Number(pm?.Style?.LineStyle?.width) || Number(pm?.OvStyle?.TrackStyle?.width) || 4;

 		const entity = viewer.entities.add({
 			name: pm?.name || kmzData?.name || t('cesium.module.planarRoute.entity.importedPipeline'),
			polyline: {
				positions,
				width,
				material,
				clampToGround: true,
			},
		});

		if (!firstEntity) {
			firstEntity = entity;
		}
	});

	if (firstEntity) {
		viewer.flyTo(firstEntity).then(() => {
			cb(lonlatList);
		});
	} else {
		// 解析结果无有效实体时也触发回调，避免 loading 永久挂起
		cb(lonlatList);
	}
};

/**
 * 航点动作反解析已迁至 wpml/actionCodec.ts，此处保留兼容导出
 */
export { buildUavActionListFromTemplateWaypoint } from '../wpml/actionCodec';

/**
 * 向地图添加事件
 * @param viewer Cesium Viewer 实例
 * @param callback 事件回调函数
 */

export function addMouseOverEvent(viewer: Cesium.Viewer, type: Cesium.ScreenSpaceEventType) {
	const scene = viewer.scene;
	addMapEvent(viewer, type, (movement) => {
		if (scene.mode !== Cesium.SceneMode.MORPHING) {
			const pickedObject = scene.pick(movement.endPosition);
			if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id instanceof Cesium.Entity && pickedObject.collection instanceof Cesium.BillboardCollection) {
				const entity = pickedObject.id;
				if (entity.billboard && entity._name === 'point') {
					document.body.style.cursor = 'move';
				}
			} else {
				document.body.style.cursor = 'default';
			}
		}
	});
}
