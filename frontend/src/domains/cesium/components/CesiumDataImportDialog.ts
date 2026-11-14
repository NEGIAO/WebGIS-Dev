/**
 * 功能名称：Cesium 3D 模型放置坐标输入弹窗（CesiumDataImportDialog）实例层
 * 日    期：2026/11/14
 * 说    明：为无内嵌地理坐标的 GLTF/GLB 模型提供首次导入放置坐标输入或已加载模型位置重调。
 */
import {
	computed,
	defineComponent,
	onBeforeUnmount,
	ref,
	watch,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import { Box, Send, TriangleAlert } from '@lucide/vue';

type EmitsType = ('confirm' | 'cancel')[];

const propDefine = {
	visible: { type: Boolean, default: false },
	fileName: { type: String, default: '' },
	initialCoords: { type: Object as PropType<any>, default: null },
	mode: { type: String, default: 'import' },
	busy: { type: Boolean, default: false },
	loadError: { type: String, default: '' },
} as const;

export type CesiumDataImportDialogProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'CesiumDataImportDialog',
	components: { Box, Send, TriangleAlert },
	props: propDefine,
	emits: ['confirm', 'cancel'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public lngStr = ref('');
	public latStr = ref('');
	public heightStr = ref('0');
	public lngInputRef = ref<HTMLInputElement | null>(null);

	public lngError = ref('');
	public latError = ref('');
	public heightError = ref('');

	get visible() {
		return this.props.visible;
	}
	get fileName() {
		return this.props.fileName;
	}
	get initialCoords() {
		return this.props.initialCoords;
	}
	get mode() {
		return this.props.mode;
	}
	get busy() {
		return this.props.busy;
	}
	get loadError() {
		return this.props.loadError;
	}

	public valid = computed(
		() =>
			this.lngStr.value !== '' &&
			this.latStr.value !== '' &&
			!this.lngError.value &&
			!this.latError.value &&
			!this.heightError.value,
	);

	constructor(
		private props: CesiumDataImportDialogProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		this.init();
	}

	private init() {
		watch(
			() => this.props.visible,
			(isVisible) => {
				if (isVisible) {
					window.addEventListener('keydown', this.onGlobalKeydown);
				} else {
					window.removeEventListener('keydown', this.onGlobalKeydown);
				}

				this.lngError.value = '';
				this.latError.value = '';
				this.heightError.value = '';
				if (!isVisible) return;

				if (this.props.initialCoords && this.props.mode === 'reposition') {
					this.lngStr.value = String(this.props.initialCoords.lng ?? '');
					this.latStr.value = String(this.props.initialCoords.lat ?? '');
					this.heightStr.value = String(this.props.initialCoords.height ?? '0');
				} else {
					this.lngStr.value = '';
					this.latStr.value = '';
					this.heightStr.value = '0';
				}

				setTimeout(() => {
					this.lngInputRef.value?.focus();
				}, 60);
			},
		);

		onBeforeUnmount(() => {
			window.removeEventListener('keydown', this.onGlobalKeydown);
		});
	}

	public validate = () => {
		const lng = parseFloat(this.lngStr.value);
		const lat = parseFloat(this.latStr.value);
		const height = parseFloat(this.heightStr.value);

		this.lngError.value = '';
		this.latError.value = '';
		this.heightError.value = '';

		if (this.lngStr.value !== '' && (isNaN(lng) || lng < -180 || lng > 180)) {
			this.lngError.value = '经度范围: -180 ~ 180';
		}
		if (this.latStr.value !== '' && (isNaN(lat) || lat < -90 || lat > 90)) {
			this.latError.value = '纬度范围: -90 ~ 90';
		}
		if (this.heightStr.value !== '' && (isNaN(height) || height < 0)) {
			this.heightError.value = '高度必须 ≥ 0';
		}
	};

	public handleConfirm = () => {
		if (!this.valid.value) {
			this.validate();
			return;
		}
		const lng = parseFloat(this.lngStr.value);
		const lat = parseFloat(this.latStr.value);
		const height = parseFloat(this.heightStr.value) || 0;
		this.emit('confirm', { lng, lat, height });
	};

	private onGlobalKeydown = (event: KeyboardEvent) => {
		if (this.props.busy) return;
		if (event.key === 'Escape') {
			this.emit('cancel');
		}
	};
}
