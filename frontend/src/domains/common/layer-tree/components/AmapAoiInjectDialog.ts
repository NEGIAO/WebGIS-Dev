/**
 * 功能名称：高德 AOI 边界注入弹窗（AmapAoiInjectDialog）实例层
 * 日    期：2026/11/14
 * 说    明：提供高德官方详情页解析与 v5 AOI 边界接口请求两种方式获取并注入 AOI 多边形 JSON。
 */
import {
	computed,
	defineComponent,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { getRuntimeMapTokensSync } from '@common/services/runtimeMapTokens';

type EmitsType = ('close' | 'open-detail' | 'submit' | 'update:poiId' | 'update:jsonText')[];

const propDefine = {
	visible: { type: Boolean, default: false },
	poiId: { type: String, default: '' },
	jsonText: { type: String, default: '' },
	detailUrl: { type: String, default: 'https://restapi.amap.com/' },
	sourceLayerName: { type: String, default: '' },
	errorMessage: { type: String, default: '' },
} as const;

export type AmapAoiInjectDialogProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'AmapAoiInjectDialog',
	props: propDefine,
	emits: ['close', 'open-detail', 'submit', 'update:poiId', 'update:jsonText'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t: ReturnType<typeof useLocale>['t'];
	private message: ReturnType<typeof useMessage>;

	get visible() {
		return this.props.visible;
	}
	get poiId() {
		return this.props.poiId;
	}
	get jsonText() {
		return this.props.jsonText;
	}
	get detailUrl() {
		return this.props.detailUrl;
	}
	get sourceLayerName() {
		return this.props.sourceLayerName;
	}
	get errorMessage() {
		return this.props.errorMessage;
	}

	public officialDetailUrl = computed(() => {
		const id = this.props.poiId || 'B0IB27UANM';
		return `https://www.amap.com/detail/get/detail?id=${id}`;
	});

	public aoiRequestUrl = computed(() => {
		const id = this.props.poiId || 'B0IB27UANM';
		const tokens = getRuntimeMapTokensSync();
		const key = tokens.amapKey || '';
		if (!key) return '';
		return `https://restapi.amap.com/v5/aoi/polyline?id=${id}&key=${key}`;
	});

	constructor(
		private props: AmapAoiInjectDialogProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		this.message = useMessage();
		const { t } = useLocale();
		this.t = t;
	}

	public onPoiIdInput = (event: Event) => {
		this.emit('update:poiId', (event.target as HTMLInputElement | null)?.value || '');
	};

	public onJsonTextInput = (event: Event) => {
		this.emit('update:jsonText', (event.target as HTMLTextAreaElement | null)?.value || '');
	};

	public openOfficialDetail = async () => {
		if (!this.props.poiId) {
			this.message.warning(this.t('layer.pleaseInputPoiId'));
			return;
		}
		const url = this.officialDetailUrl.value;
		try {
			const response = await fetch(url, {
				method: 'GET',
				referrerPolicy: 'no-referrer',
			});
			if (!response.ok) throw new Error('network');
			const res = await response.json();
			if (res.status === '1' || (res.data && res.data.status === '1')) {
				const jsonStr = JSON.stringify(res, null, 2);
				this.emit('update:jsonText', jsonStr);
				this.message.success(this.t('layer.aoiParseSuccess'));
			} else {
				throw new Error(res.info || 'api');
			}
		} catch (e) {
			console.warn('后台解析官方接口失败:', e);
			this.message.info(this.t('layer.aoiParseFailed'));
			setTimeout(() => {
				window.open(url, '_blank');
			}, 2000);
		}
	};

	public getAoiBoundarySafe = async () => {
		if (!this.props.poiId) {
			this.message.warning(this.t('layer.pleaseInputPoiId'));
			return;
		}
		if (!this.aoiRequestUrl.value) {
			this.message.warning('高德 API Key 未配置，请联系管理员');
			return;
		}
		try {
			const response = await fetch(this.aoiRequestUrl.value, {
				referrer: '',
				referrerPolicy: 'no-referrer',
				mode: 'cors',
				credentials: 'omit',
			});
			if (!response.ok) throw new Error('network');
			const realData = await response.json();
			if (realData.status === '1' && realData.aois && realData.aois.length > 0) {
				const jsonStr = JSON.stringify(realData, null, 2);
				this.emit('update:jsonText', jsonStr);
				this.message.success(this.t('layer.aoiFetchSuccess'));
			} else {
				this.message.error(
					this.t('layer.aoiFetchFailed', {
						info: realData.info || this.t('layer.aoiUnknownError'),
					}),
				);
				this.emit('update:jsonText', JSON.stringify(realData, null, 2));
			}
		} catch {
			this.message.error(this.t('layer.aoiRequestFailed'));
		}
	};

	public handlePasteJson = async () => {
		try {
			if (navigator?.clipboard?.readText) {
				const text = await navigator.clipboard.readText();
				this.emit('update:jsonText', String(text || ''));
				return;
			}
		} catch {
			/* ignored */
		}
		if (typeof window.prompt === 'function') {
			const fallbackText = window.prompt(this.t('layer.aoiPastePrompt'), this.props.jsonText || '');
			if (fallbackText !== null) {
				this.emit('update:jsonText', fallbackText);
			}
		}
	};
}
