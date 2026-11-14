/**
 * 功能名称：地图取点卡片（起终点设置 + 地名联想搜索）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：起点与终点的联想搜索共用 usePlaceSearch，仅选择回调与事件名不同。
 */
import { computed, defineComponent, onBeforeUnmount, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { useLocale } from '@common/app/useLocale';
import { usePlaceSearch } from '../composables/usePlaceSearch';

// 一、Emits
type EmitsType = ['pick-start', 'pick-end', 'select-start-result', 'select-end-result'];

// 二、Props
const propDefine = {
	pickMode: { type: String, default: '' },
	startPoint: { type: Object as PropType<any>, default: null },
	endPoint: { type: Object as PropType<any>, default: null },
	startAddress: { type: String, default: '' },
	endAddress: { type: String, default: '' },
	startLabel: { type: String, default: '' },
	endLabel: { type: String, default: '' },
	startPickingText: { type: String, default: '' },
	endPickingText: { type: String, default: '' },
	startTitle: { type: String, default: '' },
	endTitle: { type: String, default: '' },
	theme: { type: String, default: 'bus' },
	tiandituTk: { type: String, default: '' },
	searchPlaceholder: { type: String, default: '' },
} as const;

export type MapPointPickerCardProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'MapPointPickerCard',
	props: propDefine,
	emits: ['pick-start', 'pick-end', 'select-start-result', 'select-end-result'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t!: (key: string, params?: Record<string, any>) => string;

	// ── 起点搜索（由 usePlaceSearch 注入） ──
	public startKeyword: any;
	public startResults: any;
	public startSearching: any;
	public showStartDropdown: any;
	public startHighlightIdx: any;
	public onStartSearchInput: any;
	public onStartSearchBlur: any;
	public selectStartResult: any;
	public onStartKeyDown: any;
	public onStartKeyUp: any;
	public onStartKeyEnter: any;

	// ── 终点搜索（由 usePlaceSearch 注入） ──
	public endKeyword: any;
	public endResults: any;
	public endSearching: any;
	public showEndDropdown: any;
	public endHighlightIdx: any;
	public onEndSearchInput: any;
	public onEndSearchBlur: any;
	public selectEndResult: any;
	public onEndKeyDown: any;
	public onEndKeyUp: any;
	public onEndKeyEnter: any;

	private startSearch: ReturnType<typeof usePlaceSearch>;
	private endSearch: ReturnType<typeof usePlaceSearch>;

	constructor(
		private props: MapPointPickerCardProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.emit = this.ctx.emit;

		this.startSearch = usePlaceSearch({
			getToken: () => this.props.tiandituTk,
			onSelect: (payload) => this.ctx.emit('select-start-result', payload),
		});
		this.endSearch = usePlaceSearch({
			getToken: () => this.props.tiandituTk,
			onSelect: (payload) => this.ctx.emit('select-end-result', payload),
		});

		// 平铺为实例自有属性，保证模板变量名与改造前一致（且 v-model 可写）
		this.startKeyword = this.startSearch.keyword;
		this.startResults = this.startSearch.results;
		this.startSearching = this.startSearch.searching;
		this.showStartDropdown = this.startSearch.showDropdown;
		this.startHighlightIdx = this.startSearch.highlightIdx;
		this.onStartSearchInput = this.startSearch.onInput;
		this.onStartSearchBlur = this.startSearch.onBlur;
		this.selectStartResult = this.startSearch.select;
		this.onStartKeyDown = this.startSearch.onKeyDown;
		this.onStartKeyUp = this.startSearch.onKeyUp;
		this.onStartKeyEnter = this.startSearch.onKeyEnter;

		this.endKeyword = this.endSearch.keyword;
		this.endResults = this.endSearch.results;
		this.endSearching = this.endSearch.searching;
		this.showEndDropdown = this.endSearch.showDropdown;
		this.endHighlightIdx = this.endSearch.highlightIdx;
		this.onEndSearchInput = this.endSearch.onInput;
		this.onEndSearchBlur = this.endSearch.onBlur;
		this.selectEndResult = this.endSearch.select;
		this.onEndKeyDown = this.endSearch.onKeyDown;
		this.onEndKeyUp = this.endSearch.onKeyUp;
		this.onEndKeyEnter = this.endSearch.onKeyEnter;

		onBeforeUnmount(() => {
			this.startSearch.dispose();
			this.endSearch.dispose();
		});
	}

	//#region props 透传

	get pickMode() {
		return this.props.pickMode;
	}
	get startPoint() {
		return this.props.startPoint;
	}
	get endPoint() {
		return this.props.endPoint;
	}
	get startAddress() {
		return this.props.startAddress;
	}
	get endAddress() {
		return this.props.endAddress;
	}
	get startLabel() {
		return this.props.startLabel;
	}
	get endLabel() {
		return this.props.endLabel;
	}
	get startPickingText() {
		return this.props.startPickingText;
	}
	get endPickingText() {
		return this.props.endPickingText;
	}
	get startTitle() {
		return this.props.startTitle;
	}
	get endTitle() {
		return this.props.endTitle;
	}
	get theme() {
		return this.props.theme;
	}
	get tiandituTk() {
		return this.props.tiandituTk;
	}
	get searchPlaceholder() {
		return this.props.searchPlaceholder;
	}

	//#endregion

	//#region 派生

	private isPointValid(point: any) {
		return Number.isFinite(Number(point?.lng)) && Number.isFinite(Number(point?.lat));
	}

	public hasStart = computed(() => this.isPointValid(this.props.startPoint));
	public hasEnd = computed(() => this.isPointValid(this.props.endPoint));
	public hasStartAddress = computed(() => Boolean(String(this.props.startAddress || '').trim()));
	public hasEndAddress = computed(() => Boolean(String(this.props.endAddress || '').trim()));
	public themeClass = computed(() => (this.props.theme === 'drive' ? 'theme-drive' : 'theme-bus'));

	public resolvedStartLabel = computed(() => this.props.startLabel || this.t('routing.setStart'));
	public resolvedEndLabel = computed(() => this.props.endLabel || this.t('routing.setEnd'));
	public resolvedStartPickingText = computed(() => this.props.startPickingText || this.t('routing.startHint'));
	public resolvedEndPickingText = computed(() => this.props.endPickingText || this.t('routing.endHint'));
	public resolvedStartTitle = computed(() => this.props.startTitle || this.t('routing.startPoint'));
	public resolvedEndTitle = computed(() => this.props.endTitle || this.t('routing.endPoint'));
	public resolvedSearchPlaceholder = computed(() => this.props.searchPlaceholder || this.t('routing.searchPlaceholder'));

	//#endregion
}
