/**
 * useVirtualRows —— 定高行虚拟滚动窗口
 * 功能：按固定行高把「可视区 + 上下 overscan」换算为渲染区间，避免长表全量渲染。
 * 参数：
 *   rowCount          总行数 getter（响应式）
 *   rows              数据行 getter（与 rowCount 同源）
 *   rowHeight         行高（px，必须恒定，否则定位会漂移）
 *   overscan          可视区外预渲染行数，默认 10
 *   minViewportHeight 视口高度下限，默认 120
 * 返回：scrollTop / viewportHeight / startIndex / endIndex / totalHeight / virtualRows
 *       + handleScroll / scrollToTop / clampToContent / syncViewportHeight
 * 核心逻辑：所有换算纯函数化，DOM 读写只发生在传入的滚动容器上。
 */
import { computed, ref } from 'vue';

export interface UseVirtualRowsOptions {
	rowCount: () => number;
	rows: () => any[];
	rowHeight: number;
	overscan?: number;
	minViewportHeight?: number;
}

export function useVirtualRows(options: UseVirtualRowsOptions) {
	const { rowHeight, overscan = 10, minViewportHeight = 120 } = options;

	const scrollTop = ref(0);
	const viewportHeight = ref(220);

	const totalHeight = computed(() => options.rowCount() * rowHeight);

	const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight) - overscan));

	const endIndex = computed(() => {
		const safeEnd = Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight) + overscan;
		return Math.min(options.rowCount(), safeEnd);
	});

	/** 渲染窗口：附带行在总高中的绝对 top 偏移，供 absolute 定位 */
	const virtualRows = computed(() => {
		const start = startIndex.value;
		const end = endIndex.value;
		return options.rows().slice(start, end).map((row: any, idx: number) => {
			const index = start + idx;
			return { row, index, top: index * rowHeight };
		});
	});

	/** 滚动事件：只读取 scrollTop，不写 DOM */
	function handleScroll(el: HTMLElement | null) {
		scrollTop.value = Number(el?.scrollTop || 0);
	}

	function scrollToTop(el: HTMLElement | null) {
		scrollTop.value = 0;
		if (el) el.scrollTop = 0;
	}

	/** 行数变少时把滚动位置钳到内容末尾，避免停在空白虚拟区域 */
	function clampToContent(el: HTMLElement | null) {
		const maxTop = Math.max(0, totalHeight.value - viewportHeight.value);
		if (scrollTop.value <= maxTop) return;
		scrollTop.value = maxTop;
		if (el) el.scrollTop = maxTop;
	}

	/** 同步视口高度（容器尺寸变化后调用） */
	function syncViewportHeight(el: HTMLElement | null) {
		viewportHeight.value = Math.max(minViewportHeight, Number(el?.clientHeight || 220));
	}

	return { scrollTop, viewportHeight, totalHeight, startIndex, endIndex, virtualRows, handleScroll, scrollToTop, clampToContent, syncViewportHeight };
}
