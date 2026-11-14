/**
 * 功能名称：地名联想搜索（服务源可切换 + 分页 + 配额反推）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：输入 500ms 防抖后检索；服务源切换即时重查并持久化；
 *          搜索消耗由 /me 配额差值反推（搜索与 /me 共用同一配额池）。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import { isAuthenticated } from '@common/user/services/auth';
import { Search as SearchIcon } from '@lucide/vue';
import { globalAbortManager } from '@common/utils/abortManager';
import { apiAuthMe } from '@/api/backend';

// 一、Emits
type EmitsType = ['select-result'];

// 二、Props
const propDefine = {
	fetcher: { type: Function as PropType<any>, required: true },
	placeholder: { type: String, default: '搜索地名，如：郑州' },
	pageSize: { type: Number, default: 10 },
	storageKey: { type: String, default: '' },
	defaultService: { type: String, default: 'tianditu' },
	services: {
		type: Array as PropType<any[]>,
		default: () => [
			{ value: 'tianditu', label: '天地图' },
			{ value: 'nominatim', label: '国际（Nominatim）' },
			{ value: 'amap', label: '高德（Amap）' },
		],
	},
} as const;

export type LocationSearchProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'LocationSearch',
	components: { SearchIcon },
	props: propDefine,
	emits: ['select-result'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	public emit!: (event: 'select-result', ...args: any[]) => void;
	public t!: (key: string, params?: Record<string, any>) => string;

	public rootRef = ref<HTMLElement | null>(null);
	public keywords = ref('');
	public page = ref(1);
	public loading = ref(false);
	public searched = ref(false);
	public items = ref<any[]>([]);
	public total = ref(0);
	public service = ref('');
	public showServiceMenu = ref(false);

	// 搜索扣费状态：本次消耗由 /me 配额差值实时反推，剩余为当日可用额度
	public lastSearchCost = ref(0);
	public quotaRemaining = ref('—');
	public quotaUsed = ref<number | null>(null);

	private message: ReturnType<typeof useMessage>;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private props: LocationSearchProps,
		private ctx: SetupContext<EmitsType>
	) {
		const { t } = useLocale();
		this.t = t;
		this.message = useMessage();
		this.emit = this.ctx.emit;
		this.service.value = this.props.defaultService;
		this.init();
	}

	//#region props 透传

	get fetcher() {
		return this.props.fetcher;
	}
	get placeholder() {
		return this.props.placeholder;
	}
	get pageSize() {
		return this.props.pageSize;
	}
	get storageKey() {
		return this.props.storageKey;
	}
	get defaultService() {
		return this.props.defaultService;
	}
	get services() {
		return this.props.services;
	}

	//#endregion

	//#region 派生

	public totalPages = computed(() => {
		const totalVal = Number(this.total.value || 0);
		const pageSize = Math.max(1, Number(this.props.pageSize || 10));
		return Math.max(1, Math.ceil(totalVal / pageSize));
	});

	//#endregion

	//#region 生命周期

	private init() {
		// 输入防抖 500ms；清空时立即收起结果
		watch(this.keywords, (val) => {
			this.clearDebounceTimer();
			if (!String(val || '').trim()) {
				this.items.value = [];
				this.total.value = 0;
				this.searched.value = false;
				return;
			}
			this.debounceTimer = setTimeout(() => {
				this.runSearch(1);
			}, 500);
		});

		// 服务源切换：持久化 + 有词则立即重查
		watch(this.service, (val) => {
			if (this.props.storageKey) {
				try {
					window.localStorage.setItem(this.props.storageKey, val);
				} catch {
					/* localStorage 写入失败 */
				}
			}
			if (String(this.keywords.value || '').trim()) {
				this.clearDebounceTimer();
				this.runSearch(1);
			}
		});

		onMounted(() => {
			if (this.props.storageKey) {
				try {
					const val = window.localStorage.getItem(this.props.storageKey);
					if (val && this.props.services.some((item: any) => item.value === val)) this.service.value = val;
				} catch {
					/* localStorage 读取失败 */
				}
			}
			document.addEventListener('click', this.handleOutsideClick);
			this.refreshQuota();
		});

		onBeforeUnmount(() => {
			this.clearDebounceTimer();
			document.removeEventListener('click', this.handleOutsideClick);
		});
	}

	//#endregion

	//#region 检索

	private clearDebounceTimer() {
		if (!this.debounceTimer) return;
		clearTimeout(this.debounceTimer);
		this.debounceTimer = null;
	}

	public runSearch = async (targetPage = 1) => {
		const q = String(this.keywords.value || '').trim();
		if (!q) {
			this.items.value = [];
			this.total.value = 0;
			this.searched.value = false;
			return;
		}

		this.loading.value = true;
		this.searched.value = true;
		this.page.value = targetPage;

		// 搜索前快照当日已用额度，用于最终用差值反推本次搜索的真实消耗
		const preSearchUsed = this.quotaUsed.value;

		try {
			// 使用 AbortManager：新搜索自动 abort 上一次，释放浏览器连接槽位
			const result: any = await globalAbortManager.run('location-search', (signal: AbortSignal) =>
				this.props.fetcher({
					service: this.service.value,
					keywords: q,
					page: targetPage,
					pageSize: this.props.pageSize,
					signal,
				})
			);
			this.items.value = Array.isArray(result?.items) ? result.items : [];
			this.total.value = Number(result?.total || 0);
		} catch (error: any) {
			// AbortError 表示被新请求取代，静默忽略
			if (error?.name === 'AbortError') return;
			this.message.warning('地点搜索失败，请稍后重试');
			this.items.value = [];
			this.total.value = 0;
		} finally {
			this.loading.value = false;
			await this.refreshQuota();
			// 用 /me 配额差值反推本次搜索消耗
			if (preSearchUsed != null && this.quotaUsed.value != null) {
				this.lastSearchCost.value = Math.max(0, this.quotaUsed.value - preSearchUsed);
			}
		}
	};

	/** 仅登录用户有 /me 权限；游客直接跳过，避免每次搜索触发 401 toast 轰炸 */
	public refreshQuota = async () => {
		if (!isAuthenticated()) return;
		try {
			const data: any = await apiAuthMe();
			const q = data?.quota || {};
			this.quotaRemaining.value = q?.remaining == null ? '∞' : String(q.remaining);
			this.quotaUsed.value = q?.used == null ? null : Number(q.used);
		} catch {
			// 配额查询失败不影响搜索功能
		}
	};

	//#endregion

	//#region 交互

	public handleSubmit = () => {
		const q = String(this.keywords.value || '').trim();
		if (!q) {
			this.items.value = [];
			this.total.value = 0;
			this.searched.value = false;
			return;
		}
		this.showServiceMenu.value = !this.showServiceMenu.value;
	};

	public handleServicePick = (nextService: string) => {
		this.service.value = nextService;
		this.showServiceMenu.value = false;
		this.clearDebounceTimer();
		this.runSearch(1);
	};

	public handleOutsideClick = (event: MouseEvent) => {
		if (!this.showServiceMenu.value) return;
		if (this.rootRef.value?.contains(event.target as Node)) return;
		this.showServiceMenu.value = false;
	};

	public changePage = (nextPage: number) => {
		if (nextPage < 1 || nextPage > this.totalPages.value) return;
		this.runSearch(nextPage);
	};

	public handleSelectResult = (item: any) => {
		this.emit('select-result', { ...(item || {}), _service: this.service.value });
	};

	//#endregion

	//#region POI ID

	public resolvePoiId = (item: any) => {
		return String(item?.id ?? item?.poiid ?? '').trim();
	};

	public copyPoiId = async (item: any) => {
		const poiId = this.resolvePoiId(item);
		if (!poiId) {
			this.message.warning('该结果不包含可复制的 POI ID');
			return;
		}

		try {
			if (navigator?.clipboard?.writeText) {
				await navigator.clipboard.writeText(poiId);
			} else {
				const textarea = document.createElement('textarea');
				textarea.value = poiId;
				textarea.style.position = 'fixed';
				textarea.style.opacity = '0';
				document.body.appendChild(textarea);
				textarea.focus();
				textarea.select();
				document.execCommand('copy');
				document.body.removeChild(textarea);
			}
			this.message.success(`已复制 POI ID：${poiId}`);
		} catch {
			this.message.error('复制失败，请稍后重试');
		}
	};

	//#endregion
}
