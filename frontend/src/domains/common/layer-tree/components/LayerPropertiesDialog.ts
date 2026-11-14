/**
 * 功能名称：图层属性详情弹窗（LayerPropertiesDialog）实例层
 * 日    期：2026/11/14
 * 说    明：展示图层要素统计、几何类型、范围与坐标系，并在存在原始几何快照时支持就地重设源坐标系重新投影。
 */
import {
	computed,
	defineComponent,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import {
	CircleDot,
	Crosshair,
	Eye,
	EyeOff,
	FileType,
	Globe,
	Hash,
	Hexagon,
	Info,
	Layers,
	Percent,
	Route,
	Ruler,
	Shapes,
	Table,
	Tag,
	X,
} from '@lucide/vue';
import {
	BASIC_CRS_PRESETS,
	listCgcs2000Presets,
	listUtmPresets,
} from '@common/data-import/crs/crsPresets';
import { getSourceSnapshot, hasSourceSnapshot } from '@common/data-import/crs/sourceSnapshot';

type EmitsType = ('close' | 'reproject')[];

const propDefine = {
	visible: { type: Boolean, default: false },
	layer: { type: Object as PropType<any>, default: null },
} as const;

export type LayerPropertiesDialogProps = ExtractPropTypes<typeof propDefine>;

const SOURCE_TYPE_LABELS: Record<string, string> = {
	draw: '绘制',
	upload: '上传/导入',
	search: '搜索结果',
	'district-boundary': '行政区划',
};

const GEOMETRY_META: Record<string, { label: string; icon: any }> = {
	Point: { label: '点要素', icon: CircleDot },
	MultiPoint: { label: '点要素', icon: CircleDot },
	LineString: { label: '线要素', icon: Route },
	MultiLineString: { label: '线要素', icon: Route },
	Polygon: { label: '面要素', icon: Hexagon },
	MultiPolygon: { label: '面要素', icon: Hexagon },
};

export default defineComponent({
	name: 'LayerPropertiesDialog',
	components: {
		Crosshair,
		Eye,
		EyeOff,
		FileType,
		Globe,
		Hash,
		Info,
		Percent,
		Ruler,
		Shapes,
		// eslint-disable-next-line vue/no-reserved-component-names
		Table,
		Tag,
		X,
	},
	props: propDefine,
	emits: ['close', 'reproject'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public Eye = Eye;
	public EyeOff = EyeOff;
	public BASIC_CRS_PRESETS = BASIC_CRS_PRESETS;
	public cgcsPresets = listCgcs2000Presets(3);
	public utmPresets = listUtmPresets({ zoneFrom: 43, zoneTo: 53 });

	public crsDraft = ref('');
	public crsCustom = ref('');

	get visible() {
		return this.props.visible;
	}
	get layer() {
		return this.props.layer;
	}

	public sourceTypeLabel = computed(() => {
		const st = this.props.layer?.sourceType;
		return SOURCE_TYPE_LABELS[st] || st || '未知';
	});

	public geometryRaw = computed(() =>
		String(this.props.layer?.layerType || this.props.layer?.raw?.type || '').trim(),
	);
	public geometryMeta = computed(() => GEOMETRY_META[this.geometryRaw.value] || null);
	public geometryLabel = computed(
		() => this.geometryMeta.value?.label || this.geometryRaw.value || '未知',
	);
	public geometryIcon = computed(() => this.geometryMeta.value?.icon || Layers);

	public nodeId = computed(() => String(this.props.layer?.id || '').trim());
	public snapshotKey = computed(() => {
		const raw = String(this.props.layer?.raw?.id || '').trim();
		if (raw) return raw;
		const id = this.nodeId.value;
		return id.startsWith('cesium:') ? id.slice('cesium:'.length) : id;
	});

	public canResetCrs = computed(
		() => !!(this.props.visible && this.snapshotKey.value && hasSourceSnapshot(this.snapshotKey.value)),
	);
	public crsNext = computed(() => this.crsCustom.value.trim() || this.crsDraft.value);

	public crsLabel = computed(() => {
		const raw = this.props.layer?.raw || {};
		const item = this.props.layer?.standardTocItem || {};
		const meta = raw.metadata || item.metadata || {};
		return (
			raw.crs ||
			item.crs ||
			meta.sourceCrs ||
			getSourceSnapshot(this.snapshotKey.value)?.sourceCrs ||
			'EPSG:4326'
		);
	});

	public centerLongitude = computed(
		() => this.props.layer?.raw?.longitude ?? this.props.layer?.standardTocItem?.longitude ?? null,
	);
	public centerLatitude = computed(
		() => this.props.layer?.raw?.latitude ?? this.props.layer?.standardTocItem?.latitude ?? null,
	);
	public opacityPercent = computed(() => Math.round((this.props.layer?.opacity ?? 1) * 100));
	public extent = computed(() => {
		const meta = this.props.layer?.raw?.metadata || this.props.layer?.standardTocItem?.metadata;
		const ext = meta?.extent || this.props.layer?.raw?.extent;
		if (!Array.isArray(ext) || ext.length < 4) return null;
		return ext.map((v) => Number(v).toFixed(4)).join(', ');
	});

	constructor(
		private props: LayerPropertiesDialogProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		this.init();
	}

	private init() {
		watch(
			() => [this.props.visible, this.snapshotKey.value],
			() => {
				this.crsDraft.value = '';
				this.crsCustom.value = '';
			},
		);

		onMounted(() => {
			document.addEventListener('keydown', this.handleKeydown);
		});

		onBeforeUnmount(() => {
			document.removeEventListener('keydown', this.handleKeydown);
		});
	}

	public applyCrsReset = () => {
		if (!this.crsNext.value || !this.nodeId.value) return;
		this.emit('reproject', { layerId: this.nodeId.value, crs: this.crsNext.value });
	};

	private handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && this.props.visible) {
			this.emit('close');
		}
	};
}
