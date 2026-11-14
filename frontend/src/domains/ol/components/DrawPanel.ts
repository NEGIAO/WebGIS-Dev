/**
 * 功能名称：二维矢量绘制面板（DrawPanel）实例层
 * 日    期：2026/11/14
 * 说    明：提供基础几何、形状、箭头/风向/军标及要素选择编辑工具切换与样式参数同步。
 */
import {
	computed,
	defineComponent,
	reactive,
	ref,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';
import {
	X,
	Info,
	Trash2,
	Undo2,
	Eraser,
	CircleDot,
	PenLine,
	Pentagon,
	Square,
	Circle,
	Move,
	MousePointer2,
	ArrowUpRight,
	Wind,
	Crosshair,
} from '@lucide/vue';
import {
	DRAWING_PRESET_COLORS,
	DEFAULT_DRAWING_STYLE_PARAMS,
	hasFill,
	hasRadius,
	hasStrokeDash,
	isArrowTool,
	isBattleArrowTool,
	normalizeDrawingStyleParams,
} from '@ol/drawing/registry/drawingToolRegistry';
import { useLocale } from '@common/app/useLocale';

type EmitsType = ('draw-type' | 'edit-action' | 'style-change' | 'clear' | 'close')[];

const propDefine = {} as const;
export type DrawPanelProps = ExtractPropTypes<typeof propDefine>;

const ICON_MAP = {
	Point: CircleDot,
	LineString: PenLine,
	Polygon: Pentagon,
	Rectangle: Square,
	Ellipse: Move,
	CircleOutline: Circle,
	Arrow: ArrowUpRight,
	WindArrow: Wind,
	BattleArrow: Crosshair,
	SelectEdit: MousePointer2,
};

export default defineComponent({
	name: 'DrawPanel',
	components: {
		X,
		Info,
		Trash2,
		Undo2,
		Eraser,
	},
	props: propDefine,
	emits: ['draw-type', 'edit-action', 'style-change', 'clear', 'close'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t: ReturnType<typeof useLocale>['t'];
	public activeType = ref('');
	public presetColors = DRAWING_PRESET_COLORS;
	public styleForm = reactive(normalizeDrawingStyleParams({ ...DEFAULT_DRAWING_STYLE_PARAMS }));

	public toolGroups = computed(() => [
		{
			id: 'basic',
			label: this.t('draw.groups.basic'),
			tools: [
				{ type: 'Point', label: this.t('draw.tools.Point'), hint: this.t('draw.hints.Point'), icon: ICON_MAP.Point },
				{ type: 'LineString', label: this.t('draw.tools.LineString'), hint: this.t('draw.hints.LineString'), icon: ICON_MAP.LineString },
				{ type: 'Polygon', label: this.t('draw.tools.Polygon'), hint: this.t('draw.hints.Polygon'), icon: ICON_MAP.Polygon },
			],
		},
		{
			id: 'shape',
			label: this.t('draw.groups.shapes'),
			tools: [
				{ type: 'Rectangle', label: this.t('draw.tools.Rectangle'), hint: this.t('draw.hints.Rectangle'), icon: ICON_MAP.Rectangle },
				{ type: 'Ellipse', label: this.t('draw.tools.Ellipse'), hint: this.t('draw.hints.Ellipse'), icon: ICON_MAP.Ellipse },
				{ type: 'CircleOutline', label: this.t('draw.tools.CircleOutline'), hint: this.t('draw.hints.CircleOutline'), icon: ICON_MAP.CircleOutline },
			],
		},
		{
			id: 'arrow',
			label: this.t('draw.groups.arrows'),
			tools: [
				{ type: 'Arrow', label: this.t('draw.tools.Arrow'), hint: this.t('draw.hints.Arrow'), icon: ICON_MAP.Arrow },
				{ type: 'WindArrow', label: this.t('draw.tools.WindArrow'), hint: this.t('draw.hints.WindArrow'), icon: ICON_MAP.WindArrow },
				{ type: 'BattleArrow', label: this.t('draw.tools.BattleArrow'), hint: this.t('draw.hints.BattleArrow'), icon: ICON_MAP.BattleArrow },
			],
		},
		{
			id: 'edit',
			label: this.t('draw.groups.edit'),
			tools: [
				{
					type: 'SelectEdit',
					label: this.t('draw.tools.SelectEdit'),
					hint: this.t('draw.hints.SelectEdit'),
					icon: ICON_MAP.SelectEdit,
				},
			],
		},
	]);

	public currentStyleType = computed(() => this.activeType.value || 'Polygon');
	public showFill = computed(() => hasFill(this.currentStyleType.value));
	public showRadius = computed(() => hasRadius(this.currentStyleType.value));
	public showStrokeDash = computed(() => hasStrokeDash(this.currentStyleType.value));
	public showArrow = computed(() => isArrowTool(this.currentStyleType.value));
	public showBattleGradient = computed(() => isBattleArrowTool(this.currentStyleType.value));
	public radiusLabel = computed(() =>
		this.currentStyleType.value === 'CircleOutline'
			? this.t('draw.circleRadius')
			: this.t('draw.pointSize'),
	);
	public hint = computed(() => {
		const type = this.activeType.value;
		if (type && this.t(`draw.hints.${type}`) !== `draw.hints.${type}`) {
			return this.t(`draw.hints.${type}`);
		}
		return this.t('draw.hints.default');
	});

	constructor(
		_props: DrawPanelProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		const { t } = useLocale();
		this.t = t;
	}

	public selectTool = (type: string) => {
		this.activeType.value = type;
		this.emit('draw-type', type);
	};

	public emitStyleChange = () => {
		this.emit('style-change', normalizeDrawingStyleParams({ ...this.styleForm }));
	};

	public selectPreset = (color: string, target: 'stroke' | 'fill') => {
		if (target === 'stroke') this.styleForm.strokeColor = color;
		if (target === 'fill') this.styleForm.fillColor = color;
		this.emitStyleChange();
	};

	public handleDeleteSelected = () => {
		this.emit('edit-action', 'delete-selected');
	};

	public handleUndoLast = () => {
		this.emit('edit-action', 'undo-last');
	};

	public handleClear = () => {
		this.activeType.value = '';
		this.emit('clear');
	};
}
