/**
 * 功能名称：拖拽排序状态机（鼠标 + 触摸）
 * 日    期：2026/11/13
 *
 * 抽取来源：
 *   - `LayerControlPanel`（`draggingIndex` / `touchDragActive` / `touchDragIndex` /
 *     `touchDropIndex` / `updateTouchDropIndex`）——纵向图层行排序；
 *   - `AdminControlPanel` / `useAdminTable`（`isDragging` / `dragStartX` / `scrollStartLeft`）——
 *     表头横向拖拽（滚动手势，不落序）。
 *
 * 职责边界：只维护「起点下标 / 当前落点下标 / 是否拖拽中」与「按指针纵坐标求落点」，
 *          落序提交由调用方 emit。不接触 DOM 结构、不接触业务数据。
 *
 * 为什么不做成「通用 DOM 拖拽」：两个消费方的触发方式（HTML5 drag / touch 手柄）与
 * 方向（纵向列表 / 横向滚动）不同，把 DOM 细节也抽象进来会变成万能胶水。
 * 收敛的正是重复的**下标状态机**，这才是两处真正各写一遍的部分。
 */
import { computed, ref } from 'vue';

export interface DropIndexResult {
	dragIndex: number;
	dropIndex: number;
}

export function useDragSort() {
	/** 当前被拖动项下标；-1 表示未拖动 */
	const dragIndex = ref(-1);
	/** 当前落点下标；-1 表示未进入列表 */
	const dropIndex = ref(-1);
	/** 触摸拖拽专用：是否由手柄发起（与长按菜单互斥） */
	const touchActive = ref(false);

	const isDragging = computed(() => dragIndex.value >= 0);
	/** 是否构成一次有效换位（下标不同且都合法） */
	const canCommit = computed(
		() =>
			Number.isInteger(dragIndex.value) &&
			Number.isInteger(dropIndex.value) &&
			dragIndex.value >= 0 &&
			dropIndex.value >= 0 &&
			dragIndex.value !== dropIndex.value
	);

	/** 开始拖拽 */
	function begin(index: number, options: { touch?: boolean } = {}) {
		dragIndex.value = index;
		dropIndex.value = index;
		touchActive.value = !!options.touch;
	}

	/** 更新落点 */
	function over(index: number) {
		dropIndex.value = index;
	}

	/** 复位（不提交） */
	function reset() {
		dragIndex.value = -1;
		dropIndex.value = -1;
		touchActive.value = false;
	}

	/**
	 * 提交本次排序；无有效换位时返回 null 并复位。
	 * @returns 换位下标对，供调用方 emit('update-order', { type: 'reorder', ... })
	 */
	function commit(): DropIndexResult | null {
		const result = canCommit.value ? { dragIndex: dragIndex.value, dropIndex: dropIndex.value } : null;
		reset();
		return result;
	}

	return { dragIndex, dropIndex, touchActive, isDragging, canCommit, begin, over, reset, commit };
}

/**
 * 按指针纵坐标求落点下标：首个「中点在指针下方」的行即插入位，尾部钳制为末行。
 * @param items 行元素列表（须按视觉顺序）
 * @param clientY 触点纵坐标
 * @returns 落点下标；无行时返回 -1
 */
export function resolveDropIndexByPointer(items: ArrayLike<Element> | null | undefined, clientY: number): number {
	if (!items || !items.length) return -1;
	for (let i = 0; i < items.length; i += 1) {
		const rect = items[i].getBoundingClientRect?.();
		if (!rect) continue;
		if (clientY < rect.top + rect.height / 2) return i;
	}
	return items.length - 1;
}
