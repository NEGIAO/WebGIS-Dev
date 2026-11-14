/**
 * 功能名称：lil-gui 控件渲染器（Cesium 面板通用）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：把声明式 controls 数组渲染为 lil-gui 控件；结构签名变化时重建 GUI，
 *          仅值变化时原地 updateDisplay，避免整块重绘导致的焦点丢失。
 */
import { defineComponent, nextTick, onBeforeUnmount, ref, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import GUI from 'lil-gui';

// 一、Emits
type EmitsType = ['change'];

// 二、Props
const propDefine = {
	title: { type: String, default: 'Parameters' },
	controls: { type: Array as PropType<any[]>, default: () : any => [] },
} as const;

export type LilGuiControlsProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'LilGuiControls',
	props: propDefine,
	emits: ['change'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];

	public containerRef = ref<HTMLElement | null>(null);

	private guiTarget: Record<string, any> = {};
	private controllers = new Map<string, any>();
	private gui: any = null;
	private currentSignature = '';
	private renderQueued = false;

	constructor(
		private props: LilGuiControlsProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.emit = this.ctx.emit;
		this.init();
	}

	//#region props 透传

	get title() {
		return this.props.title;
	}
	get controls() {
		return this.props.controls;
	}

	//#endregion

	//#region 生命周期

	private init() {
		// flush: post —— 等 DOM 就绪后再建 GUI
		watch(
			() => [this.props.title, this.props.controls],
			() => {
				this.queueRenderGui();
			},
			{ deep: true, flush: 'post', immediate: true }
		);

		onBeforeUnmount(() => {
			this.destroyGui();
		});
	}

	//#endregion

	//#region 渲染调度

	/** 合并同一 tick 内的多次触发，避免重复重建 */
	private queueRenderGui() {
		if (typeof window === 'undefined' || this.renderQueued) return;
		this.renderQueued = true;
		nextTick(() => {
			this.renderQueued = false;
			this.renderGui();
		});
	}

	private renderGui() {
		const container = this.containerRef.value;
		if (!container) return;

		const signature = this.getControlsSignature(this.props.controls);
		if (!this.gui || signature !== this.currentSignature) {
			this.destroyGui();
			this.createGui(container, signature);
		}
		this.syncGui();
	}

	private createGui(container: HTMLElement, signature: string) {
		this.gui = new GUI({
			container,
			autoPlace: false,
			title: this.props.title || 'Parameters',
			width: Math.max(260, Math.floor(container.clientWidth || 320)),
		});
		this.gui.domElement.classList.add('cesium-lil-gui');
		container.replaceChildren(this.gui.domElement);
		this.currentSignature = signature;

		for (const control of this.props.controls || []) {
			const controller = this.createController(control);
			if (controller) this.controllers.set(control.id, controller);
		}
	}

	private createController(control: any) {
		// info 类型是分隔符，跳过不渲染
		if (control.type === 'info') return null;

		this.guiTarget[control.id] = this.getControlValue(control);

		let controller: any;
		if (control.type === 'range') {
			controller = this.gui.add(
				this.guiTarget,
				control.id,
				this.toFiniteNumber(control.min, 0),
				this.toFiniteNumber(control.max, 1),
				this.toFiniteNumber(control.step, 0.01)
			);
		} else if (control.type === 'color') {
			controller = this.gui.addColor(this.guiTarget, control.id);
		} else if (control.type === 'select') {
			controller = this.gui.add(this.guiTarget, control.id, this.getControlOptions(control));
		} else {
			controller = this.gui.add(this.guiTarget, control.id);
		}

		controller.name(this.getControlLabel(control)).onChange((value: any) => {
			const latestControl = this.findControl(control.id) || control;
			if (latestControl.disabled) return;
			this.emit('change', { control: latestControl, controlId: latestControl.id, value });
		});

		this.decorateController(controller, control);
		return controller;
	}

	/** 原地同步：仅值变化时 updateDisplay，避免整块重绘 */
	private syncGui() {
		if (!this.gui) return;
		this.gui.title(this.props.title || 'Parameters');

		for (const control of this.props.controls || []) {
			const controller = this.controllers.get(control.id);
			if (!controller) continue;

			const nextValue = this.getControlValue(control);
			if (!this.areValuesEqual(this.guiTarget[control.id], nextValue)) {
				this.guiTarget[control.id] = nextValue;
				controller.updateDisplay();
			}

			controller.name(this.getControlLabel(control));
			controller.disable(!!control.disabled);
			this.decorateController(controller, control);
		}
	}

	private decorateController(controller: any, control: any) {
		controller.domElement.title = control.tooltip || '';
		controller.domElement.dataset.controlId = control.id || '';
		controller.domElement.dataset.controlType = control.type || '';
	}

	//#endregion

	//#region 结构签名与取值

	/** 结构签名：id/type/范围/步长/选项变化才需要重建 GUI */
	private getControlsSignature(controls: any[] = []) {
		return JSON.stringify(
			controls.map((control) => ({
				id: control.id,
				type: control.type,
				min: control.min,
				max: control.max,
				step: control.step,
				options: (control.options || []).map((option: any) => ({ label: option.label, value: option.value })),
			}))
		);
	}

	private getControlLabel(control: any) {
		if (!control.displayValue) return control.label || control.id;
		return `${control.label || control.id} (${control.displayValue})`;
	}

	private getControlValue(control: any) {
		if (control.type === 'range') {
			return this.toFiniteNumber(control.value, this.toFiniteNumber(control.min, 0));
		}
		if (control.type === 'toggle') return !!control.value;
		if (control.type === 'select') return control.value ?? control.options?.[0]?.value ?? '';
		if (control.type === 'color') {
			return typeof control.value === 'string' && control.value ? control.value : '#ffffff';
		}
		return control.value;
	}

	private getControlOptions(control: any) {
		const options: Record<string, any> = {};
		for (const option of control.options || []) options[option.label || option.value] = option.value;
		return options;
	}

	private findControl(controlId: string) {
		return (this.props.controls || []).find((control: any) => control.id === controlId) || null;
	}

	private areValuesEqual(left: any, right: any) {
		if (typeof left === 'number' || typeof right === 'number') {
			return Math.abs(Number(left) - Number(right)) < 1e-12;
		}
		return left === right;
	}

	private toFiniteNumber(value: any, fallback: number) {
		const number = Number(value);
		return Number.isFinite(number) ? number : fallback;
	}

	//#endregion

	/** 销毁 GUI 并清空控制器与目标对象 */
	private destroyGui() {
		if (this.gui) {
			try {
				this.gui.destroy();
			} catch (error) {
				console.warn('lil-gui destroy warning:', error);
			}
		}
		this.gui = null;
		this.currentSignature = '';
		this.controllers.clear();
		for (const key of Object.keys(this.guiTarget)) delete this.guiTarget[key];
	}
}
