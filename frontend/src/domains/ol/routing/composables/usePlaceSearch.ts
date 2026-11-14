/**
 * usePlaceSearch —— 地名联想搜索（防抖 + 请求中断 + 下拉高亮）
 * 功能：把「输入 → 400ms 防抖 → 天地图检索 → 下拉列表 → 键盘上下/回车选择」封装为一组状态与处理器。
 * 参数：getToken 取天地图 tk 的 getter；onSelect 选中结果回调
 * 返回：keyword / results / searching / showDropdown / highlightIdx + 各事件处理器
 * 核心逻辑：每次新输入先 abort 在途请求，避免慢响应覆盖新结果（乱序保护）。
 */
import { ref } from 'vue';
import { fetchLocationResultsByService } from '@/api/locationSearch';

export interface PlaceSearchItem {
	display_name: string;
	lon: number;
	lat: number;
	[key: string]: any;
}

export interface UsePlaceSearchOptions {
	getToken: () => string;
	onSelect: (payload: { lng: number; lat: number; address: string }) => void;
	/** 防抖时长（毫秒），默认 400 */
	debounceMs?: number;
	/** 结果条数，默认 10 */
	pageSize?: number;
}

export function usePlaceSearch(options: UsePlaceSearchOptions) {
	const { getToken, onSelect, debounceMs = 400, pageSize = 10 } = options;

	const keyword = ref('');
	const results = ref<PlaceSearchItem[]>([]);
	const searching = ref(false);
	const showDropdown = ref(false);
	const highlightIdx = ref(-1);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let abortController: AbortController | null = null;

	/** 发起一次检索；空关键词直接收起下拉 */
	async function runSearch() {
		const kw = keyword.value.trim();
		if (!kw) {
			results.value = [];
			showDropdown.value = false;
			return;
		}
		// 中断前一个请求，避免乱序覆盖
		if (abortController) abortController.abort();
		abortController = new AbortController();

		searching.value = true;
		try {
			const result: any = await fetchLocationResultsByService({
				service: 'tianditu',
				keywords: kw,
				page: 1,
				pageSize,
				tiandituTk: getToken(),
				signal: abortController.signal,
			});
			results.value = result.items || [];
			showDropdown.value = true;
		} catch (e: any) {
			if (e?.name === 'AbortError') return;
			results.value = [];
		} finally {
			searching.value = false;
		}
	}

	/** 输入：重置高亮、中断在途请求、重新计时 */
	function onInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		if (abortController) abortController.abort();
		highlightIdx.value = -1;
		debounceTimer = setTimeout(runSearch, debounceMs);
	}

	/** 失焦：延迟收起下拉，让 mousedown 有机会先触发选中 */
	function onBlur() {
		setTimeout(() => {
			if (highlightIdx.value < 0) showDropdown.value = false;
		}, 200);
	}

	function select(item: PlaceSearchItem | undefined | null) {
		if (!item) return;
		showDropdown.value = false;
		keyword.value = item.display_name;
		onSelect({ lng: item.lon, lat: item.lat, address: item.display_name });
	}

	function onKeyDown(e: KeyboardEvent) {
		if (!showDropdown.value || !results.value.length) return;
		e.preventDefault();
		const next = highlightIdx.value + 1;
		highlightIdx.value = next >= results.value.length ? 0 : next;
	}

	function onKeyUp() {
		if (!showDropdown.value || !results.value.length) return;
		const prev = highlightIdx.value - 1;
		highlightIdx.value = prev < 0 ? results.value.length - 1 : prev;
	}

	/** 回车：优先选高亮项；只有一条结果时直接选中 */
	function onKeyEnter() {
		if (highlightIdx.value >= 0 && results.value[highlightIdx.value]) {
			select(results.value[highlightIdx.value]);
		} else if (results.value.length === 1) {
			select(results.value[0]);
		}
	}

	/** 组件卸载时清理定时器与在途请求 */
	function dispose() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = null;
		if (abortController) abortController.abort();
		abortController = null;
	}

	return { keyword, results, searching, showDropdown, highlightIdx, runSearch, onInput, onBlur, select, onKeyDown, onKeyUp, onKeyEnter, dispose };
}
