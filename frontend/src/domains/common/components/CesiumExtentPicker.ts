/**
 * 功能名称：三维范围框选器（Cesium）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：左键拖拽在椭球上框出经纬度范围，实时红色预览、完成后转蓝色覆盖层。
 *          拾取期间禁用相机旋转，结束/卸载时恢复，避免交互状态残留。
 */
import { defineComponent, onUnmounted, ref, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { Crosshair, Eraser } from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';

// 一、Emits
type EmitsType = ['extent-change', 'extent-clear'];

// 二、Props
const propDefine = {
	/** 返回 Cesium Viewer 实例 */
	getViewer: { type: Function as PropType<any>, default: null },
	/** 返回 Cesium 命名空间 */
	getCesium: { type: Function as PropType<any>, default: null },
	/** 框选完成后是否保留蓝色覆盖层（默认 true） */
	showOverlay: { type: Boolean, default: true },
	/** 按钮禁用状态 */
	disabled: { type: Boolean, default: false },
} as const;

export type CesiumExtentPickerProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'CesiumExtentPicker',
	components: { Crosshair, Eraser },
	props: propDefine,
	emits: ['extent-change', 'extent-clear'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t!: (key: string, params?: Record<string, any>) => string;

	public picking = ref(false);
	public hasExtent = ref(false);
	public extentLabel = ref('');

	private message: ReturnType<typeof useMessage>;

	// ── 三维拾取实例（非响应式） ──
	private pickHandler: any = null;
	private previewEntity: any = null;
	private dragStart: any = null;
	private savedEnableRotate: any = null;

	constructor(
		private props: CesiumExtentPickerProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.message = useMessage();
		this.emit = this.ctx.emit;

		onUnmounted(() => {
			const viewer = this.props.getViewer?.();
			const Cesium = this.props.getCesium?.();
			if (viewer && Cesium) this.finishPick(viewer, Cesium, false);
			this.removePreviewEntity(viewer);
		});
	}

	//#region props 透传

	get getViewer() {
		return this.props.getViewer;
	}
	get getCesium() {
		return this.props.getCesium;
	}
	get showOverlay() {
		return this.props.showOverlay;
	}
	get disabled() {
		return this.props.disabled;
	}

	//#endregion

	//#region 几何换算

	/** 屏幕点转经纬度（椭球拾取，框选用途足够；取不到返回 null） */
	private screenToLonLat(viewer: any, Cesium: any, position: any): [number, number] | null {
		try {
			const cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
			if (!cartesian) return null;
			const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
			if (!cartographic) return null;
			return [Cesium.Math.toDegrees(cartographic.longitude), Cesium.Math.toDegrees(cartographic.latitude)];
		} catch {
			return null;
		}
	}

	/** 由两屏点算归一化 bbox，非法返回 null（过小视为误触） */
	private boxFromScreenPoints(viewer: any, Cesium: any, a: any, b: any): number[] | null {
		const pa = this.screenToLonLat(viewer, Cesium, a);
		const pb = this.screenToLonLat(viewer, Cesium, b);
		if (!pa || !pb) return null;
		const minLng = Math.min(pa[0], pb[0]);
		const maxLng = Math.max(pa[0], pb[0]);
		const minLat = Math.min(pa[1], pb[1]);
		const maxLat = Math.max(pa[1], pb[1]);
		if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
		if (maxLng - minLng < 1e-6 || maxLat - minLat < 1e-6) return null;
		return [minLng, minLat, maxLng, maxLat];
	}

	//#endregion

	//#region 预览实体

	/** 红色预览样式 / 蓝色完成样式切换 */
	private stylePreviewEntity(entity: any, Cesium: any, done: boolean) {
		if (!entity) return;
		if (done) {
			entity.rectangle.material = Cesium.Color.fromCssColorString('#0e77b8').withAlpha(0.15);
			entity.rectangle.outlineColor = Cesium.Color.fromCssColorString('#0e77b8');
		} else {
			entity.rectangle.material = Cesium.Color.fromCssColorString('#e74c3c').withAlpha(0.12);
			entity.rectangle.outlineColor = Cesium.Color.fromCssColorString('#e74c3c');
		}
	}

	private ensurePreviewEntity(viewer: any, Cesium: any) {
		if (this.previewEntity && viewer.entities.contains(this.previewEntity)) return this.previewEntity;
		this.previewEntity = viewer.entities.add({
			rectangle: {
				coordinates: Cesium.Rectangle.fromDegrees(0, 0, 0, 0),
				material: Cesium.Color.fromCssColorString('#e74c3c').withAlpha(0.12),
				outline: true,
				outlineColor: Cesium.Color.fromCssColorString('#e74c3c'),
				outlineWidth: 2,
			},
		});
		return this.previewEntity;
	}

	private removePreviewEntity(viewer: any) {
		if (!this.previewEntity) return;
		try {
			viewer?.entities?.remove?.(this.previewEntity);
		} catch {
			// 视图已销毁时忽略
		}
		this.previewEntity = null;
	}

	//#endregion

	//#region 拾取生命周期

	/** 结束拾取：销交互、恢复旋转（覆盖层按需保留） */
	private finishPick(viewer: any, Cesium: any, keepOverlay: boolean) {
		if (this.pickHandler) {
			try {
				this.pickHandler.destroy();
			} catch {
				// 忽略
			}
			this.pickHandler = null;
		}
		const controller = viewer?.scene?.screenSpaceCameraController;
		if (controller && this.savedEnableRotate !== null) controller.enableRotate = this.savedEnableRotate;
		this.savedEnableRotate = null;
		this.dragStart = null;
		this.picking.value = false;
		if (!keepOverlay) this.removePreviewEntity(viewer);
		else if (this.previewEntity) this.stylePreviewEntity(this.previewEntity, Cesium, true);
	}

	/** 开始拖拽框选 */
	public startPick = () => {
		const viewer = this.props.getViewer?.();
		const Cesium = this.props.getCesium?.();
		if (!viewer || !Cesium) {
			this.message.warning(this.t('shell.buildings.viewEmpty'));
			return;
		}

		// 清上一次残留（覆盖层按 ExtentPicker 习惯先清）
		this.finishPick(viewer, Cesium, false);
		this.removePreviewEntity(viewer);
		this.hasExtent.value = false;
		this.extentLabel.value = '';

		this.picking.value = true;
		const controller = viewer.scene.screenSpaceCameraController;
		if (controller) {
			this.savedEnableRotate = controller.enableRotate;
			controller.enableRotate = false;
		}

		this.pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
		this.pickHandler.setInputAction((movement: any) => {
			this.dragStart = movement.position?.clone?.() || movement.position;
			this.ensurePreviewEntity(viewer, Cesium);
		}, Cesium.ScreenSpaceEventType.LEFT_DOWN);

		this.pickHandler.setInputAction((movement: any) => {
			if (!this.picking.value || !this.dragStart) return;
			const bbox = this.boxFromScreenPoints(viewer, Cesium, this.dragStart, movement.endPosition);
			if (!bbox || !this.previewEntity) return;
			this.previewEntity.rectangle.coordinates = Cesium.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3]);
		}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

		this.pickHandler.setInputAction((movement: any) => {
			const bbox = this.dragStart ? this.boxFromScreenPoints(viewer, Cesium, this.dragStart, movement.position) : null;
			const keep = this.props.showOverlay && !!bbox;
			this.finishPick(viewer, Cesium, keep);
			if (!keep) this.removePreviewEntity(viewer);
			if (!bbox) return;
			this.hasExtent.value = true;
			this.extentLabel.value = `${bbox[0].toFixed(4)},${bbox[1].toFixed(4)} → ${bbox[2].toFixed(4)},${bbox[3].toFixed(4)}`;
			this.emit('extent-change', { extent: bbox, crs: 'EPSG:4326' });
		}, Cesium.ScreenSpaceEventType.LEFT_UP);
	};

	/** 清除选区 */
	public clearExtent = () => {
		const viewer = this.props.getViewer?.();
		const Cesium = this.props.getCesium?.();
		if (viewer && Cesium) this.finishPick(viewer, Cesium, false);
		this.removePreviewEntity(viewer);
		this.hasExtent.value = false;
		this.extentLabel.value = '';
		this.emit('extent-clear');
	};

	//#endregion
}
