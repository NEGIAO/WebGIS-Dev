/**
 * 功能名称：锚点弹层视口定位
 * 日    期：2026/11/13
 *
 * 抽取来源：`LayerControlPanel`（`layerContextMenuAnchor` / `layerContextMenuStyle` /
 *          `layerContextSubmenuStyle` / `anchorResizeObserver` / `availableRight` / `canOpenRight`）。
 *
 * 职责边界：把「锚点坐标 → 菜单内联样式」与「子菜单向左还是向右展开」两件事收敛为一处。
 *          不含菜单内容、不含开关状态，纯几何换算。
 *
 * 关键行为（与抽取前逐条对齐）：
 *   1. 主菜单贴锚点坐标（top/left）；
 *   2. 子菜单优先向右展开，容器右侧剩余宽度不足（主菜单 + 子菜单 + 20px 余量）时改为向左；
 *   3. 左右用 `left: 100%` / `right: 100%` 贴父项边缘，不按菜单宽度写死偏移——
 *      写死值比父项实际宽度多几像素，中间的缝会让 mouseleave 在指针移过去路上触发。
 */
import { computed, ref } from 'vue';

export interface UseAnchoredMenuOptions {
	/** 取承载容器的矩形（通常为 overlay 容器）；返回 null 时退化为视口宽度 */
	getContainerRect: () => DOMRect | { width: number } | null;
	/** 主菜单宽度（px） */
	menuWidth: number;
	/** 子菜单宽度（px） */
	submenuWidth?: number;
	/** 右侧展开的额外余量（px），默认 20 */
	gutter?: number;
}

export function useAnchoredMenu(options: UseAnchoredMenuOptions) {
	const submenuWidth = options.submenuWidth ?? 0;
	const gutter = options.gutter ?? 20;

	/** 锚点坐标（视口坐标系，与面板定位同一坐标系） */
	const anchor = ref({ top: 0, left: 0 });

	/** 主菜单内联样式 */
	const menuStyle = computed(() => ({
		top: `${anchor.value.top}px`,
		left: `${anchor.value.left}px`,
	}));

	/** 子菜单内联样式：容器右侧够宽则右展，否则左展 */
	const submenuStyle = computed(() => {
		if (typeof window === 'undefined') return { left: `${options.menuWidth - 4}px`, top: '0px' };

		const containerRect = options.getContainerRect();
		const containerWidth = containerRect?.width ?? window.innerWidth;
		const availableRight = containerWidth - anchor.value.left;
		const canOpenRight = availableRight > options.menuWidth + submenuWidth + gutter;

		return canOpenRight ? { left: '100%', top: '0px' } : { right: '100%', top: '0px' };
	});

	/** 落点：设置锚点坐标 */
	function place(top: number, left: number) {
		anchor.value = { top, left };
	}

	/** 复位 */
	function reset() {
		anchor.value = { top: 0, left: 0 };
	}

	return { anchor, menuStyle, submenuStyle, place, reset };
}
