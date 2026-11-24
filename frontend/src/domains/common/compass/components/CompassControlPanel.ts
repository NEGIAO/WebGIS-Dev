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

/** 地理半径手动输入的可调区间（km），与面板滑杆 100 m ~ 20,000 km 对齐 */
const RADIUS_MIN_KM = 0.1;
const RADIUS_MAX_KM = 20000;

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

	/** 半径输入框文本（单位 km）。独立于 store，避免输入过程中被格式化打断 */
	public radiusKmInput = ref('');
	/** 输入框是否处于编辑态：编辑时暂停 store → 输入框的单向同步 */
	private radiusEditing = false;

	public readonly radiusMinKm = RADIUS_MIN_KM;
	public readonly radiusMaxKm = RADIUS_MAX_KM;

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

		// 半径：store（米）→ 输入框（km）单向同步；编辑中跳过，避免覆盖用户正在输入的文本。
		// 滑杆拖动、坐标定位、URL 恢复等任何改动 physicalRadiusMeters 的路径都会经由这里回显。
		this.radiusKmInput.value = this.toRadiusKmText(this.compassStore.physicalRadiusMeters);
		watch(
			() => this.compassStore.physicalRadiusMeters,
			(nextMeters) => {
				if (this.radiusEditing) return;
				this.radiusKmInput.value = this.toRadiusKmText(nextMeters);
			},
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

	/**
	 * 米 → 输入框文本（km，最多 3 位小数并去掉尾随零）。
	 * @param meters 存储层使用的物理半径（米）
	 * @returns 可直接填入 number 输入框的字符串；非法值返回空串
	 */
	private toRadiusKmText(meters: any): string {
		const numeric = Number(meters);
		if (!Number.isFinite(numeric) || numeric <= 0) return '';
		return String(Number((numeric / 1000).toFixed(3)));
	}

	/** 聚焦：进入编辑态，暂停 store → 输入框的同步，避免回写打断用户输入 */
	public handleRadiusKmFocus = () => {
		this.radiusEditing = true;
	};

	/**
	 * 输入框实时输入。合法正数立即写入 store（滑杆与地图随之更新），
	 * 但不回写输入框文本 —— 否则输入「1.」会被格式化成「1」而跳光标。
	 */
	public handleRadiusKmInput = (event: Event) => {
		const raw = String((event.target as HTMLInputElement | null)?.value ?? '');
		this.radiusKmInput.value = raw;

		const km = Number(raw);
		if (!raw || !Number.isFinite(km) || km <= 0) return;
		this.compassStore.setPhysicalRadiusMeters(km * 1000);
	};

	/**
	 * 提交（失焦 / 回车 / change）。钳制到 [RADIUS_MIN_KM, RADIUS_MAX_KM] 并回写规范化文本；
	 * 空值或非法输入回退到 store 当前值。
	 */
	public handleRadiusKmCommit = (event: Event) => {
		this.radiusEditing = false;

		const raw = String((event.target as HTMLInputElement | null)?.value ?? '').trim();
		const km = Number(raw);
		if (!raw || !Number.isFinite(km) || km <= 0) {
			this.radiusKmInput.value = this.toRadiusKmText(this.compassStore.physicalRadiusMeters);
			return;
		}

		const clampedKm = Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, km));
		this.compassStore.setPhysicalRadiusMeters(clampedKm * 1000);
		this.radiusKmInput.value = this.toRadiusKmText(this.compassStore.physicalRadiusMeters);
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
