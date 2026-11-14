/**
 * 功能名称：罗盘宫位释义面板（PalaceExplanationPanel）实例层
 * 日    期：2026/11/14
 * 说    明：根据当前罗盘主题（polygon/compass/circle/dark/simple）与选中宫位查询并展示风水释义。
 */
import {
	computed,
	defineComponent,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import type { SelectedPalace } from '@common/compass/stores/useCompassStore';
import { getThemeExplanationByConfig } from '@common/compass/utils/themeExplanationMapper';
import { ExplanationLookup, type ExplanationResult } from '@common/compass/utils/explanationLookup';
import { useLocale } from '@common/app/useLocale';

type EmitsType = 'close'[];

const propDefine = {
	selectedPalace: {
		type: Object as PropType<SelectedPalace | null>,
		default: null,
	},
	themeConfig: {
		type: Object as PropType<any>,
		default: undefined,
	},
} as const;

export type PalaceExplanationPanelProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'PalaceExplanationPanel',
	props: propDefine,
	emits: ['close'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t: ReturnType<typeof useLocale>['t'];

	get selectedPalace() {
		return this.props.selectedPalace;
	}
	get themeConfig() {
		return this.props.themeConfig;
	}

	public currentThemeConfig = computed(() => getThemeExplanationByConfig(this.props.themeConfig));
	public explanationData = computed(() => this.currentThemeConfig.value.data);
	public themeId = computed(() => this.currentThemeConfig.value.cid);
	public themeDataLayers = computed(() => {
		if (this.props.themeConfig && Array.isArray(this.props.themeConfig.data)) {
			return this.props.themeConfig.data;
		}
		return [];
	});

	public polygonExplanation = computed(() => {
		if (!this.props.selectedPalace || this.themeId.value !== 'polygon') return null;
		return this.getExplanationByPalace(
			this.props.selectedPalace,
			this.themeDataLayers.value,
			this.explanationData.value,
		);
	});

	public compassExplanation = computed(() => {
		if (!this.props.selectedPalace || this.themeId.value !== 'compass') return null;
		return this.getExplanationByPalace(
			this.props.selectedPalace,
			this.themeDataLayers.value,
			this.explanationData.value,
		);
	});

	public circleExplanation = computed(() => {
		if (!this.props.selectedPalace || this.themeId.value !== 'circle') return null;
		return this.getExplanationByPalace(
			this.props.selectedPalace,
			this.themeDataLayers.value,
			this.explanationData.value,
		);
	});

	public darkExplanation = computed(() => {
		if (!this.props.selectedPalace || this.themeId.value !== 'dark') return null;
		return this.getExplanationByPalace(
			this.props.selectedPalace,
			this.themeDataLayers.value,
			this.explanationData.value,
		);
	});

	public simpleExplanation = computed(() => {
		if (!this.props.selectedPalace || this.themeId.value !== 'simple') return null;
		return this.getExplanationByPalace(
			this.props.selectedPalace,
			this.themeDataLayers.value,
			this.explanationData.value,
		);
	});

	public palaceName = computed(() => {
		if (!this.props.selectedPalace) return '';
		if (typeof this.props.selectedPalace.data === 'string') {
			return this.props.selectedPalace.data;
		}
		if (Array.isArray(this.props.selectedPalace.data)) {
			return this.props.selectedPalace.data.filter(Boolean).join('') || '';
		}
		return '';
	});

	constructor(
		private props: PalaceExplanationPanelProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		const { t } = useLocale();
		this.t = t;
	}

	private getExplanationByPalace(palace: SelectedPalace, themeLayers: any, explanationJson: any) {
		if (!palace || !themeLayers) return null;
		const { layerIndex, segmentIndex, data } = palace;
		const palaceName =
			typeof data === 'string'
				? data
				: Array.isArray(data)
					? data.filter(Boolean).join('')
					: '';
		const exactResult = ExplanationLookup.lookupThemeLayer(themeLayers, explanationJson, {
			layerIndex,
			_segmentIndex: segmentIndex,
			palaceName,
		});
		if (exactResult) return exactResult;
		return this.generateDefaultExplanation(palaceName, this.themeId.value, layerIndex);
	}

	private generateDefaultExplanation(
		palaceName: string,
		theme: string,
		layerIndex: number,
	): ExplanationResult | null {
		if (!palaceName) return null;
		const themeKey = ['polygon', 'compass', 'circle', 'dark', 'simple'].includes(theme)
			? theme
			: null;
		const themeDesc = themeKey ? this.t(`compass.themes.${themeKey}`) : this.t('compass.unknownTheme');
		const themeForMeaning = themeKey
			? this.t(`compass.themes.${themeKey}`)
			: this.t('compass.currentTheme');
		return {
			category: this.t('compass.defaultCategory', { theme: themeDesc, layer: layerIndex + 1 }),
			title: palaceName,
			meaning: this.t('compass.defaultMeaning', { palace: palaceName, theme: themeForMeaning }),
		};
	}

	public handleClose = () => {
		this.emit('close');
	};
}
