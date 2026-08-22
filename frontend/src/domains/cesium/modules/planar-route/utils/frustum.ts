/**
 * 功能名称：航点视锥体可视化
 * 日    期：2026/07/20
 * 原文件名 frustm.ts，重构后更正为 frustum.ts
 */
import Cesium from 'cesium';

/** 是否已挂载 Model 穿地可见补丁（全局仅一次） */
let airlineModelDepthPatched = false;

/**
 * Cesium 内部 RenderState（公开类型未导出，运行时存在）
 */
function getCesiumRenderState(): { fromCache: (opts: Record<string, unknown>) => unknown } | null {
	const rs = (Cesium as any).RenderState;
	if (rs && typeof rs.fromCache === 'function') {
		return rs;
	}
	return null;
}

/**
 * 关闭本帧 Model 绘制命令的深度检测（不可改写只读 RenderState，需 fromCache 换新）
 * @param commandList 帧命令列表
 * @param start 本模型 update 前 commandList 长度
 * @param end 本模型 update 后 commandList 长度
 */
function disableModelDepthTestOnCommands(commandList: any[], start: number, end: number) {
	const RenderState = getCesiumRenderState();
	if (!RenderState || !commandList) return;
	for (let i = start; i < end; i++) {
		const command = commandList[i];
		const rs = command?.renderState;
		if (!rs) continue;
		try {
			command.renderState = RenderState.fromCache({
				frontFace: rs.frontFace,
				cull: rs.cull,
				lineWidth: rs.lineWidth,
				polygonOffset: rs.polygonOffset,
				scissorTest: rs.scissorTest,
				depthRange: rs.depthRange,
				depthTest: { enabled: false },
				colorMask: rs.colorMask,
				depthMask: false,
				stencilTest: rs.stencilTest,
				stencilMask: rs.stencilMask,
				blending: rs.blending,
				sampleCoverage: rs.sampleCoverage,
			});
		} catch (e) {
			console.error('[AirlineEdit] disableModelDepthTestOnCommands', e);
		}
	}
}

/**
 * 判断是否为航线编辑需穿地可见的 Model（无人机 / 航点云台）
 * @param model Cesium.Model
 */
function isAirlineAlwaysVisibleModel(model: any): boolean {
	if (!model) return false;
	if (model._airlineAlwaysVisible === true) return true;
	const entityId = model.id?.id != null ? String(model.id.id) : '';
	return entityId.startsWith('air_point_all_');
}

/**
 * 挂载一次 Model.update 补丁：无人机与航点云台穿地可见
 */
export function ensureAirlineModelDepthPatch() {
	if (airlineModelDepthPatched) return;
	airlineModelDepthPatched = true;
	const proto = Cesium.Model.prototype as any;
	const originalUpdate = proto.update;
	if (typeof originalUpdate !== 'function') return;
	proto.update = function (frameState: any) {
		const list = frameState?.commandList;
		const startLen = Array.isArray(list) ? list.length : 0;
		originalUpdate.call(this, frameState);
		if (!isAirlineAlwaysVisibleModel(this) || !Array.isArray(list)) return;
		disableModelDepthTestOnCommands(list, startLen, list.length);
	};
}

/**
 * 标记无人机 Model 穿地始终可见
 * @param model 无人机 glTF 模型
 */
export function markModelAlwaysVisible(model: Cesium.Model) {
	if (!model) return;
	(model as any)._airlineAlwaysVisible = true;
	ensureAirlineModelDepthPatch();
}

export class CreateFrustum {
	position: any;
	heading: 0; // 偏航角（左右旋转），0表示正北
	miniHeading: 0; // 云台偏航角（左右旋转），0表示正北
	pitch: 0; // 俯仰角（上下倾斜），0表示水平，-π/2表示垂直向下
	miniPitch: 0; // 云台俯仰角（上下倾斜），0表示水平，-π/2表示垂直向下
	roll: 0; // 滚转角（侧倾）
	orientation: any;
	hpr: any;
	fov: any;
	near: any;
	far: any;
	aspectRatio: any;
	frustumPrimitive: any;
	outlinePrimitive: any;
	arrowLinePrimitive: any;
	flyModel: any;
	/** 飞行模型异步加载 Promise，避免并发 fromGltf 产生多个无人机 */
	flyModelLoading: Promise<void> | null = null;
	/** 飞行模型加载令牌，clear 时递增以丢弃过期加载结果 */
	flyModelLoadToken = 0;
	viewer: Cesium.Viewer;
	flyToGroundLine: any;
	flyPoint: any;
	isAddModel: boolean = true;
	isUpdateModel?: boolean = true;
	polygonColor: string;
	polylineColor: string;
	constructor(options) {
		this.viewer = options.viewer;
		this.position = options.position;
		this.heading = options.heading;
		this.miniHeading = options.miniHeading;
		this.miniPitch = options.miniPitch;
		this.pitch = options.pitch;
		this.roll = options.roll;
		this.orientation = options.orientation;
		this.hpr = options.hpr;
		this.fov = options.fov || 30;
		this.near = options.near || 10;
		this.far = options.far || 100;
		this.aspectRatio = options.aspectRatio;
		this.isAddModel = options.isAddModel;
		this.isUpdateModel = options.isUpdateModel == undefined ? true : options.isUpdateModel;
		this.polygonColor = options.polygonColor || 'rgba(63.0, 211,145, 0.2)';
		this.polylineColor = options.polylineColor || 'rgba(63.0, 211,145, 1)';

		// 航点云台 Entity Model 依赖此补丁穿地可见
		ensureAirlineModelDepthPatch();
		this.add();
	}

	// 更新视锥体的姿态
	update(option) {
		this.position = option.position;
		this.heading = option.heading;
		this.miniHeading = option.miniHeading;
		this.miniPitch = option.miniPitch;
		this.pitch = option.pitch;
		this.roll = option.roll;
		if (option.orientation) {
			this.orientation = option.orientation;
		}
		this.fov = option.fov;
		this.add();
	}

	// 创建视锥体和轮廓线
	add() {
		this.clear();
		if (this.isAddModel && this.isUpdateModel) {
			this.addFlyModel();
		}
		this.addArrowLine();
		this.addOutline();
		this.addFrustum();
		this.addFlyToGroundLine();
		this.addFlyPoint();
	}

	// 清除视锥体和轮廓线
	clear() {
		this.clearFrustum();
		this.clearOutline();
		this.clearArrow();
		this.clearFlyToGroundLine();
		this.clearFlyPoint();
	}
	// 清除所有
	removeAll() {
		this.clear();
		this.clearFlyModel();
	}

	// 清除视锥体
	clearFrustum() {
		if (this.frustumPrimitive) {
			this.viewer.scene.primitives.remove(this.frustumPrimitive);
			this.frustumPrimitive = null;
		}
	}

	// 清除轮廓线
	clearOutline() {
		if (this.outlinePrimitive) {
			this.viewer.scene.primitives.remove(this.outlinePrimitive);
			this.outlinePrimitive = null;
		}
	}

	// 清除箭头线
	clearArrow() {
		if (this.arrowLinePrimitive) {
			this.viewer.scene.primitives.remove(this.arrowLinePrimitive);
			this.arrowLinePrimitive = null;
		}
	}

	// 清除模型
	clearFlyModel() {
		// 使进行中的异步加载失效，防止清除后仍把旧模型挂到场景
		this.flyModelLoadToken += 1;
		this.flyModelLoading = null;
		if (this.flyModel) {
			this.viewer.scene.primitives.remove(this.flyModel);
			this.flyModel = null;
		}
	}

	/** 删除飞机至地面连接线 */
	clearFlyToGroundLine() {
		if (!this.flyToGroundLine) return;
		this.viewer.scene.primitives.remove(this.flyToGroundLine);
		this.flyToGroundLine = null;
	}
	/** 删除飞机至地面连接线 */
	clearFlyPoint() {
		if (!this.flyPoint) return;
		this.viewer.scene.primitives.remove(this.flyPoint);
		this.flyPoint = null;
	}

	/**
	 * 获取指定方向和长度的点
	 * @param {Cesium.Cartesian3} position
	 * @param {number} angle
	 * @param {number} len
	 * @return {Cesium.Cartesian3}
	 */
	// GetByDircAndLen(position, angle, len) {
	// 	const ange = -Cesium.Math.toDegrees(angle);
	// 	let matrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
	// 	let mz = Cesium.Matrix3.fromRotationZ(ange);
	// 	let rotationZ = Cesium.Matrix4.fromRotationTranslation(mz);
	// 	Cesium.Matrix4.multiply(matrix, rotationZ, matrix);
	// 	let result = Cesium.Matrix4.multiplyByPoint(matrix, new Cesium.Cartesian3(0, len, 0), new Cesium.Cartesian3());
	// 	return result;
	// }
	GetByDircAndLen(position, angle, len) {
		const matrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
		const mz = Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(0));
		const rotationZ = Cesium.Matrix4.fromRotationTranslation(mz);
		Cesium.Matrix4.multiply(matrix, rotationZ, matrix);
		const result = Cesium.Matrix4.multiplyByPoint(matrix, new Cesium.Cartesian3(0, len, 0), new Cesium.Cartesian3());
		return result;
	}
	computePointAtDistance(start, heading, pitch, distance) {
		// 1. 将起点转换为Cartographic格式(经纬度高程)
		const cartographic = Cesium.Cartographic.fromCartesian(start);

		// 2. 计算水平距离和垂直距离分量
		const horizontalDistance = distance * Math.cos(pitch);
		const verticalDistance = distance * Math.sin(pitch);

		// 3. 计算水平方向的经纬度变化
		const earthRadius = 6378137; // 地球半径(米)
		const deltaLon = (horizontalDistance * Math.sin(heading)) / (earthRadius * Math.cos(cartographic.latitude));
		const deltaLat = (horizontalDistance * Math.cos(heading)) / earthRadius;

		// 4. 计算终点坐标
		const endLon = cartographic.longitude + deltaLon;
		const endLat = cartographic.latitude + deltaLat;
		const endHeight = cartographic.height + verticalDistance;

		// 5. 转换回Cartesian3坐标
		return Cesium.Cartesian3.fromRadians(endLon, endLat, endHeight);
	}
	// 创建视锥体
	addFrustum() {
		const frustum = new Cesium.PerspectiveFrustum({
			// 查看的视场角，绕Z轴旋转，以弧度方式输入
			fov: Cesium.Math.toRadians(this.fov),
			// 视锥的宽高比
			aspectRatio: this.aspectRatio,
			// 近面距视点的距离
			near: this.near,
			// 远面距视点的距离
			far: this.far,
		});
		const geometry = new Cesium.FrustumGeometry({
			frustum: frustum,
			origin: this.position,
			orientation: this.orientation,
			vertexFormat: Cesium.VertexFormat.POSITION_ONLY,
		});
		const instance = new Cesium.GeometryInstance({
			geometry: geometry,
			attributes: {
				color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(this.polygonColor)),
			},
		});
		const primitive = new Cesium.Primitive({
			geometryInstances: instance,
			appearance: new Cesium.PerInstanceColorAppearance({
				closed: true,
				flat: true,
			}),
			asynchronous: false,
		});

		this.frustumPrimitive = this.viewer.scene.primitives.add(primitive);
	}

	// 创建轮廓线
	addOutline() {
		const frustum = new Cesium.PerspectiveFrustum({
			// 查看的视场角度，绕Z轴旋转，以弧度方式输入
			fov: Cesium.Math.toRadians(this.fov),
			// 视锥体的宽度/高度
			aspectRatio: this.aspectRatio,
			// 近面距视点的距离
			near: this.near,
			// 远面距视点的距离
			far: this.far,
		});
		const geometry = new Cesium.FrustumOutlineGeometry({
			frustum: frustum,
			origin: this.position,
			orientation: this.orientation,
			// vertexFormat: Cesium.VertexFormat.POSITION_ONLY,
		});
		const instance = new Cesium.GeometryInstance({
			geometry: geometry,
			attributes: {
				color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(this.polylineColor)),
			},
		});
		const primitive = new Cesium.Primitive({
			geometryInstances: [instance],
			appearance: new Cesium.PerInstanceColorAppearance({
				closed: true,
				flat: true,
			}),
			asynchronous: false,
		});
		this.outlinePrimitive = this.viewer.scene.primitives.add(primitive);
	}
	/**
	 * 绘制虚线
	 * @param start 起点
	 * @param end 终点
	 */
	addArrowLine() {
		const endPosition = this.computePointAtDistance(
			this.position,
			this.miniHeading != 0 ? this.miniHeading - Cesium.Math.toRadians(90) : this.heading - Cesium.Math.toRadians(90),
			this.miniPitch != 0
				? this.miniPitch == 0
					? Cesium.Math.toRadians(90)
					: this.miniPitch < 0
						? -this.miniPitch + Cesium.Math.toRadians(90)
						: Cesium.Math.toRadians(90) - this.miniPitch
				: this.pitch - Cesium.Math.toRadians(90),
			this.far,
		);

		const arrowLine = new Cesium.Primitive({
			geometryInstances: new Cesium.GeometryInstance({
				geometry: new Cesium.PolylineGeometry({
					positions: [this.position, endPosition],
					width: 1,
				}),
			}),
			appearance: new Cesium.PolylineMaterialAppearance({
				material: Cesium.Material.fromType(Cesium.Material.PolylineDashType, {
					color: Cesium.Color.fromCssColorString(this.polylineColor),
					dashLength: 10,
					dashPattern: 255,
				}),
			}),
			asynchronous: false,
		});
		this.arrowLinePrimitive = this.viewer.scene.primitives.add(arrowLine);
	}
	/** 添加飞机到地面连线 */
	addFlyToGroundLine() {
		// 笛卡尔转为弧度
		const cartographic = Cesium.Cartographic.fromCartesian(this.position);
		const groundPosition = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0);
		// 虚线
		// let arrowLine = new Cesium.Primitive({
		// 	geometryInstances: new Cesium.GeometryInstance({
		// 		geometry: new Cesium.PolylineGeometry({
		// 			positions: [this.position, groundPosition],
		// 			width: 1,
		// 		}),
		// 	}),
		// 	appearance: new Cesium.PolylineMaterialAppearance({
		// 		material: Cesium.Material.fromType(Cesium.Material.PolylineDashType, {
		// 			color: Cesium.Color.WHITE,
		// 			dashLength: 10,
		// 			dashPattern: 255,
		// 		}),
		// 	}),
		// 	asynchronous: false,
		// });
		const arrowLine = new Cesium.Primitive({
			geometryInstances: new Cesium.GeometryInstance({
				geometry: new Cesium.PolylineGeometry({
					positions: [this.position, groundPosition],
					width: 0.5,
					vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
				}),
				attributes: {
					color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString('#d4d00b')),
				},
			}),
			appearance: new Cesium.PolylineColorAppearance({
				// 是否半透明
				translucent: false,
			}),
			asynchronous: false,
		});
		this.flyToGroundLine = this.viewer.scene.primitives.add(arrowLine);
	}
	/**
	 * 创建贴地点
	 */
	addFlyPoint() {
		// 笛卡尔转为弧度
		const cartographic = Cesium.Cartographic.fromCartesian(this.position);
		// 获取某点的高度
		const hb = this.viewer.scene.globe.getHeight(cartographic);
		const groundPosition2 = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, hb || 0);
		const pointPrimitives = new Cesium.PointPrimitiveCollection();
		pointPrimitives.add({
			show: true,
			position: groundPosition2,
			pixelSize: 7.0,
			color: Cesium.Color.fromCssColorString('#d4d00b'),
			distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000),
			// 贴地点随对地线正常参与地形遮挡
		});
		this.flyPoint = this.viewer.scene.primitives.add(pointPrimitives);
	}
	/**
	 * 将飞行模型姿态同步到当前位置/航向
	 */
	private applyFlyModelMatrix() {
		if (!this.flyModel) return;
		this.flyModel.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(this.position, new Cesium.HeadingPitchRoll(this.heading, 0, this.roll), Cesium.Ellipsoid.WGS84);
	}

	/**
	 * 创建飞行模型（并发调用只加载一次，避免导入航线时出现两个无人机）
	 */
	async addFlyModel() {
		if (this.flyModel) {
			this.applyFlyModelMatrix();
			return;
		}
		// 已有加载中的任务：等待完成后只更新矩阵，不再二次 fromGltf
		if (this.flyModelLoading) {
			await this.flyModelLoading;
			this.applyFlyModelMatrix();
			return;
		}

		const token = ++this.flyModelLoadToken;
		this.flyModelLoading = (async () => {
			const model = await Cesium.Model.fromGltfAsync({
				url: './model/CesiumDrone.gltf',
				modelMatrix: Cesium.Transforms.headingPitchRollToFixedFrame(this.position, new Cesium.HeadingPitchRoll(this.heading, 0, this.roll), Cesium.Ellipsoid.WGS84),
				asynchronous: false,
				// 紧贴地形
				// heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
				// scene: this.viewer.scene,
				// 固定屏幕像素大小：世界尺度极小，由 minimumPixelSize 撑到目标像素，缩放地图时视觉大小基本不变
				scale: 0.001,
				minimumPixelSize: 48,
				maximumScale: 100000,
			});
			// 加载期间被 clear / removeAll，丢弃本次结果
			if (token !== this.flyModelLoadToken || this.flyModel) {
				return;
			}
			if (!this.viewer || this.viewer.isDestroyed()) {
				return;
			}
			// 穿地时无人机模型始终可见（对地线仍正常遮挡）
			markModelAlwaysVisible(model);
			this.flyModel = this.viewer.scene.primitives.add(model);
			this.applyFlyModelMatrix();
		})()
			.catch((error: unknown) => {
				console.error('[AirlineEdit] addFlyModel', error);
			})
			.finally(() => {
				this.flyModelLoading = null;
			});

		await this.flyModelLoading;
	}

	/**
	 * 绘制箭头
	 */
	drawArrow() {
		// 箭头绘制逻辑已注释停用，保留方法骨架
		// const endPosition = this.GetByDircAndLen(this.position, this.heading, this.far);
		// const billboards = this.viewer.scene.primitives.add(
		// 	new Cesium.BillboardCollection({
		// 		scene: this.viewer.scene,
		// 	}),
		// );
		// const point = {
		// 	position: endPosition,
		// 	image: arrow,
		// 	scale: 1,
		// 	// rotation: Cesium.Math.toRadians(0),
		// 	// alignedAxis: Cesium.Cartesian3.ZERO, // 关键：禁用自动旋转
		// 	disableDepthTestDistance: Number.POSITIVE_INFINITY, // 始终可见
		// 	alignedAxis: Cesium.Cartesian3.UNIT_Z, // 固定方向为 Z 轴
		// 	// Example 2.
		// 	rotation: -Cesium.Math.PI_OVER_TWO,
		// 	// pixelOffset: new Cesium.Cartesian2(0, 0),
		// 	// eyeOffset: Cesium.Cartesian3.ZERO,
		// };
		// billboards.add(point);
	}
}
