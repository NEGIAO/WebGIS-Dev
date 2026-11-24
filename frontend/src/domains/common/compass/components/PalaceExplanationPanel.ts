/**
 * 功能名称：罗盘宫位释义面板（PalaceExplanationPanel）实例层
 * 日    期：2026/11/14
 * 说    明：根据当前罗盘主题（polygon/compass/circle/dark/simple）与选中宫位查询并展示风水释义。
 */
import {
	computed,
	defineComponent,
	watch,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import type { SelectedPalace } from '@common/compass/stores/useCompassStore';
import { getThemeExplanationByConfig } from '@common/compass/utils/themeExplanationMapper';
import { ExplanationLookup, type ExplanationResult } from '@common/compass/utils/explanationLookup';
import { useLocale } from '@common/app/useLocale';
import { useChatStore } from '@common/chat/stores/useChatStore';
import { consumeCompassAnalysis } from '@common/chat/agent/compassAnalysisSession';
import { useCompassStore } from '@/stores';
import { apiReverseGeocodeWithFallback } from '@/api';

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
	public chatStore: ReturnType<typeof useChatStore>;
	public compassStore: ReturnType<typeof useCompassStore>;

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
		this.chatStore = useChatStore();
		this.compassStore = useCompassStore();

		// Agent 调用 enable_compass 后会武装一次性「等待卦象选择」会话（V3.7.10）。
		// 用户点卦象 → selectedPalace 变化 → 自动投递区域分析提问，无需再点面板按钮。
		// 2D / 3D 两个容器可能各挂一个面板实例，consume 的一次性语义保证只投递一次。
		watch(
			() => this.props.selectedPalace,
			(palace) => {
				if (palace && consumeCompassAnalysis()) {
					void this.dispatchAskAgent(true);
				}
			},
		);
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

	/**
	 * 解析当前宫位所在层的名称。
	 * 层 name 可能是字符串或数组（如 ['后先天八卦','先天八卦','龙上八煞']），数组按 · 连接。
	 * @returns 层名称；取不到时返回空串
	 */
	private resolveLayerName(): string {
		const index = Number(this.props.selectedPalace?.layerIndex ?? -1);
		if (index < 0) return '';
		const layer = this.themeDataLayers.value?.[index];
		if (!layer) return '';
		if (Array.isArray(layer.name)) return layer.name.filter(Boolean).join(' · ');
		return String(layer.name || '');
	}

	/**
	 * 组装向 Agent 提问的文本。
	 *
	 * 把「主题 / 第几层 / 层名 / 宫位名」四个锚点写进问题，让模型无需猜测盘面位置；
	 * 并逆地理解析罗盘中心点坐标，附上省市区与详细地址，让模型能结合实地地理环境分析。
	 * @returns 提问文本；缺宫位名时返回空串
	 */
	private async buildAgentQuestion(areaAnalysis = false): Promise<string> {
		const palace = String(this.palaceName.value || '').trim();
		if (!palace) return '';

		const layerNo = Number(this.props.selectedPalace?.layerIndex ?? 0) + 1;
		const layerName = this.resolveLayerName();
		const themeName = this.currentThemeConfig.value?.themeName || this.themeId.value;

		const base = this.t(
			areaAnalysis ? 'compass.askAgentAreaAnalysis' : 'compass.askAgentPrompt',
			{
				theme: themeName,
				layer: layerNo,
				layerName: layerName ? `「${layerName}」` : '',
				palace,
			},
		);
		const locationContext = await this.buildLocationContext();
		const radiusContext = areaAnalysis
			? this.t('compass.askAgentAreaRadius', {
				radius: Math.round(Number(this.compassStore?.physicalRadiusMeters) || 0),
			})
			: '';
		return base + locationContext + radiusContext;
	}

	/**
	 * 解析罗盘中心点的地名上下文。
	 *
	 * 走统一逆地理入口（高德优先、天地图兜底，内部自动 WGS-84→GCJ-02）；
	 * 失败或坐标无效时降级为仅附坐标，**不阻塞提问主流程**。
	 * @returns 形如「。罗盘中心点位于…」的句子；完全无坐标时返回空串
	 */
	private async buildLocationContext(): Promise<string> {
		const position = this.compassStore?.position;
		const lng = Number(position?.lng);
		const lat = Number(position?.lat);
		// (0,0) 落在几内亚湾，视为「从未设置过位置」的默认值
		if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) {
			return '';
		}

		const coords = `${lng.toFixed(6)}, ${lat.toFixed(6)}`;
		try {
			const response: any = await apiReverseGeocodeWithFallback(lng, lat, { silent: true });
			const data = response?.data || {};
			const region = [data.province, data.city, data.district, data.township]
				.map((part: any) => String(part || '').trim())
				.filter(Boolean)
				.join('');
			const address = String(data.formattedAddress || '').trim();
			if (!region && !address) {
				return this.t('compass.askAgentLocationCoord', { coords });
			}
			return this.t('compass.askAgentLocationNamed', {
				region: region || address,
				address: address || region,
				coords,
			});
		} catch {
			// 服务不可用 / 配额耗尽 / 网络异常：仅带坐标，提问照常发出
			return this.t('compass.askAgentLocationCoord', { coords });
		}
	}

	/**
	 * 「问 AI 解释」：展开聊天侧栏并投递预置提问。
	 *
	 * 走 chatStore 队列而非直接调用聊天面板，原因：侧栏是懒加载的，
	 * 用户可能从未打开过聊天面板（组件尚未挂载）。队列由 ChatPanelContent
	 * 在挂载/空闲时消费，消息不会因时序问题丢失。
	 *
	 * 顺序上**先展开侧栏、再等逆地理解析**：后者有数百毫秒网络延迟，
	 * 先开面板让用户立刻看到反馈，避免「点了没反应」的观感；
	 * 提问稍后经队列投递，由聊天面板消费，时序上天然安全。
	 */
	private async dispatchAskAgent(areaAnalysis: boolean) {
		this.chatStore.requestOpenChat();
		const question = await this.buildAgentQuestion(areaAnalysis);
		if (!question) return;
		this.chatStore.requestPrompt(question);
	}

	/** 面板按钮：通用宫位释义提问（模板直接绑定，保持无参签名避免收到 MouseEvent） */
	public handleAskAgent = () => {
		void this.dispatchAskAgent(false);
	};
}
