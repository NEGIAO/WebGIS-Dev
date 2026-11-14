/**
 * 功能名称：罗盘控制面板（CompassControlPanel）实例层
 * 日    期：2026/11/14
 * 说    明：控制罗盘启用、布设模式、传感器联动、矢量/HUD 模式切换、主题切换、半径/透明度/背景色及坐标定位。
 */
import {
	computed,
	defineComponent,
	ref,
	watch,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import { ArrowLeft, Compass, MapPin, Palette, Satellite } from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useCompassStore } from '@/stores';

type EmitsType = 'close'[];

const propDefine = {
	getUserLocation: {
		type: Function as PropType<((force?: boolean) => Promise<any>) | null>,
		default: null,
	},
} as const;

export type CompassControlPanelProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'CompassControlPanel',
	components: { ArrowLeft, Compass, MapPin, Palette, Satellite },
	props: propDefine,
	emits: ['close'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t: ReturnType<typeof useLocale>['t'];
	private message: ReturnType<typeof useMessage>;
	public compassStore = useCompassStore();

	public lngInput = ref(String(this.compassStore.position?.lng ?? ''));
	public latInput = ref(String(this.compassStore.position?.lat ?? ''));

	get getUserLocation() {
		return this.props.getUserLocation;
	}

	public sensorStatusText = computed(() => {
		if (this.compassStore.sensorPermission === 'granted') return this.t('compass.sensorGranted');
		if (this.compassStore.sensorPermission === 'denied') return this.t('compass.sensorDenied');
		if (this.compassStore.sensorPermission === 'unsupported') return this.t('compass.sensorUnsupported');
		return this.t('compass.sensorUnknown');
	});

	constructor(
		private props: CompassControlPanelProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		const { t } = useLocale();
		this.t = t;
		this.message = useMessage();

		this.init();
	}

	private init() {
		watch(
			() => this.compassStore.position,
			(nextPosition) => {
				this.lngInput.value = Number.isFinite(Number(nextPosition?.lng))
					? String(nextPosition.lng)
					: '';
				this.latInput.value = Number.isFinite(Number(nextPosition?.lat))
					? String(nextPosition.lat)
					: '';
			},
			{ deep: true, immediate: true },
		);
	}

	public formatMeters = (value: any) => {
		const n = Number(value) || 0;
		if (n >= 1000) {
			const digits = n >= 100000 ? 0 : 1;
			return `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: digits })} km`;
		}
		return `${n} m`;
	};

	public handleRadiusInput = (event: Event) => {
		this.compassStore.setPhysicalRadiusMeters(
			Number((event.target as HTMLInputElement | null)?.value),
		);
	};

	public handleOpacityInput = (event: Event) => {
		this.compassStore.setOpacity(Number((event.target as HTMLInputElement | null)?.value));
	};

	public handleHudSizeInput = (event: Event) => {
		this.compassStore.setHudSize(Number((event.target as HTMLInputElement | null)?.value));
	};

	public handleBgColorInput = (event: Event) => {
		this.compassStore.setBgColor(String((event.target as HTMLInputElement | null)?.value || ''));
	};

	public handleEnabledChange = (event: any) => {
		const checked = Boolean(event?.target?.checked);
		this.compassStore.setEnabled(checked);
	};

	public handlePlacementModeChange = (event: any) => {
		const checked = Boolean(event?.target?.checked);
		this.compassStore.setPlacementMode(checked);
	};

	public handleThemeChange = async (event: any) => {
		const nextCid = String(event?.target?.value || '').trim();
		if (!nextCid) return;
		await this.compassStore.setCidAndLoad(nextCid);
	};

	public handleSensorToggle = async (event: any) => {
		const checked = Boolean(event?.target?.checked);
		if (!checked) {
			this.compassStore.setSensorEnabled(false);
			return;
		}
		const granted = await this.compassStore.requestOrientationPermission();
		if (!granted) {
			this.compassStore.setSensorEnabled(false);
			this.message.warning(this.t('compass.noHeadingPermission'));
			return;
		}
		this.compassStore.setSensorEnabled(true);
	};

	public applyLonLat = () => {
		const lng = Number(this.lngInput.value);
		const lat = Number(this.latInput.value);
		if (
			!Number.isFinite(lng) ||
			!Number.isFinite(lat) ||
			lng < -180 ||
			lng > 180 ||
			lat < -90 ||
			lat > 90
		) {
			this.message.warning(this.t('compass.invalidLonLat'));
			return;
		}
		this.compassStore.setPosition(lng, lat);
		this.compassStore.setEnabled(true);
	};

	public useGps = async () => {
		if (typeof this.props.getUserLocation !== 'function') return;
		try {
			const gps = await this.props.getUserLocation(true);
			const lng = Number(gps?.lng);
			const lat = Number(gps?.lat);
			if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
				this.message.warning(this.t('compass.noGps'));
				return;
			}
			this.compassStore.setPosition(lng, lat);
			this.compassStore.setEnabled(true);
		} catch (error: any) {
			this.message.warning(
				this.t('compass.gpsFailed', { error: String(error?.message || error || 'unknown') }),
			);
		}
	};
}
