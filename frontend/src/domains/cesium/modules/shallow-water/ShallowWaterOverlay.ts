/**
 * 功能名称：热带浅水场景叠加层组件（ShallowWaterOverlay）实例层
 * 日    期：2026/11/14
 * 说    明：在 Cesium canvas 上方叠加 Three.js 渲染的热带浅水效果，通过 CesiumToolPanel 控制开关与参数。
 */
import {
	defineComponent,
	onMounted,
	onUnmounted,
	ref,
	watch,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';
import { useShallowWater } from './composables/useShallowWater';

type EmitsType = ('ready' | 'error' | 'fps-update')[];

const propDefine = {
	visible: { type: Boolean, default: false },
	elevation: { type: Number, default: 30 },
	azimuth: { type: Number, default: 150 },
	clarity: { type: Number, default: 0.085 },
	causticStrength: { type: Number, default: 0.9 },
	waterColor: { type: String, default: '#2bb3c4' },
	waveHeight: { type: Number, default: 0.5 },
	foamWidth: { type: Number, default: 2.4 },
	reflection: { type: Number, default: 0.38 },
	cloudCoverage: { type: Number, default: 0.58 },
	lightningEnabled: { type: Boolean, default: true },
	lightningInterval: { type: Number, default: 2.0 },
} as const;

export type ShallowWaterOverlayProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'ShallowWaterOverlay',
	props: propDefine,
	emits: ['ready', 'error', 'fps-update'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public canvasContainerRef = ref<HTMLElement | null>(null);

	public isReady: ReturnType<typeof useShallowWater>['isReady'];
	public fps: ReturnType<typeof useShallowWater>['fps'];
	public start: ReturnType<typeof useShallowWater>['start'];
	public pause: ReturnType<typeof useShallowWater>['pause'];
	private initShallowWater: ReturnType<typeof useShallowWater>['init'];
	private disposeShallowWater: ReturnType<typeof useShallowWater>['dispose'];
	private handleResize: ReturnType<typeof useShallowWater>['handleResize'];
	private updateParams: ReturnType<typeof useShallowWater>['updateParams'];

	get visible() {
		return this.props.visible;
	}

	constructor(
		private props: ShallowWaterOverlayProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		const sw = useShallowWater({
			onReady: () => this.emit('ready'),
			onError: (err) => this.emit('error', err),
			onFpsUpdate: (val) => this.emit('fps-update', val),
		});
		this.isReady = sw.isReady;
		this.fps = sw.fps;
		this.start = sw.start;
		this.pause = sw.pause;
		this.initShallowWater = sw.init;
		this.disposeShallowWater = sw.dispose;
		this.handleResize = sw.handleResize;
		this.updateParams = sw.updateParams;

		this.init();
	}

	private init() {
		watch(
			() => this.props.visible,
			async (visible) => {
				if (visible) {
					await this.initScene();
					this.start();
				} else {
					this.pause();
				}
			},
		);

		watch(
			() => [
				this.props.elevation,
				this.props.azimuth,
				this.props.clarity,
				this.props.causticStrength,
				this.props.waterColor,
				this.props.waveHeight,
				this.props.foamWidth,
				this.props.reflection,
				this.props.cloudCoverage,
				this.props.lightningEnabled,
				this.props.lightningInterval,
			],
			() => {
				this.syncParams();
			},
		);

		onMounted(() => {
			window.addEventListener('resize', this.onResize);
			if (this.props.visible) {
				void this.initScene();
			}
		});

		onUnmounted(() => {
			window.removeEventListener('resize', this.onResize);
			this.disposeShallowWater();
		});
	}

	public initScene = async () => {
		if (!this.canvasContainerRef.value || this.isReady.value) return;
		await this.initShallowWater(this.canvasContainerRef.value);
		this.syncParams();
	};

	public syncParams = () => {
		this.updateParams({
			elevation: this.props.elevation,
			azimuth: this.props.azimuth,
			clarity: this.props.clarity,
			causticStrength: this.props.causticStrength,
			waterColor: this.props.waterColor,
			waveHeight: this.props.waveHeight,
			foamWidth: this.props.foamWidth,
			reflection: this.props.reflection,
			cloudCoverage: this.props.cloudCoverage,
			lightningEnabled: this.props.lightningEnabled,
			lightningInterval: this.props.lightningInterval,
		});
	};

	public onResize = () => {
		this.handleResize();
	};
}
