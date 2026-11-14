/**
 * 功能名称：单元格就地编辑状态机
 * 日    期：2026/11/13
 *
 * 抽取来源：
 *   - `AttributeTable`（`editingCell` / `editingValue` / `isEditing` / `startCellEdit` /
 *     `cancelCellEdit` / `commitCellEdit` / `focusCellEditor`）；
 *   - `AdminControlPanel` 的 `useAdminTable`（`editingCell` / `editingCellValue` /
 *     `startEditCell` / `cancelEditCell` / `saveEditCell`）。
 *
 * 两处的**提交语义不同**（前者改本地行并 emit，后者走 API 并重载），因此本模块只收敛
 * 二者真正重复的部分：编辑目标 + 草稿值 + 聚焦全选 + 防重入 + 取消复位。
 * 提交动作由调用方通过 `takeDraft()` 取走草稿后自行处理，不在此处做类型转换或网络请求。
 *
 * 状态归属判定（对齐 `2026-11-13-vue-component-refactor-plan.md` §3.2）：
 *   「正在编辑哪一格」属于交互过程态 → composable 内部 ref，随调用方销毁。
 */
import { nextTick, ref } from 'vue';

export interface CellEditingTarget {
	/** 行标识（由调用方决定取值口径：行主键 / 复合键） */
	rowKey: string;
	/** 列标识 */
	columnKey: string;
}

export interface UseCellEditingOptions {
	/**
	 * 取行标识。
	 * AttributeTable 传 `(row) => String(row.id)`；后台表格传 `getRowKey`。
	 */
	getRowKey: (row: any) => string;
	/** 进入编辑前的守卫（只读模式 / 行编辑模式互斥 / 提交中）返回 true 表示禁止 */
	isBlocked?: () => boolean;
	/** 编辑器输入框 getter，用于聚焦与全选 */
	inputRef?: () => HTMLInputElement | HTMLTextAreaElement | null;
}

export function useCellEditing(options: UseCellEditingOptions) {
	const target = ref<CellEditingTarget | null>(null);
	const draft = ref('');

	/** 是否正在编辑指定单元格 */
	function isEditing(row: any, columnKey: string): boolean {
		const current = target.value;
		if (!current) return false;
		return current.rowKey === options.getRowKey(row) && current.columnKey === columnKey;
	}

	/** 聚焦并全选旧值：键入即覆盖 */
	function focusEditor() {
		const el = options.inputRef?.();
		el?.focus();
		el?.select();
	}

	/**
	 * 进入编辑态。
	 * @param row 目标行
	 * @param columnKey 目标列
	 * @param initialValue 草稿初值（省略时由调用方在进入前自行决定，这里用空串）
	 * @returns 是否成功进入（被守卫拦截或重复进入同一格时返回 false，且不重置草稿）
	 */
	function begin(row: any, columnKey: string, initialValue?: string): boolean {
		if (options.isBlocked?.()) return false;
		// 防重入：正在编辑同一格时不重置草稿
		if (isEditing(row, columnKey)) return false;
		target.value = { rowKey: options.getRowKey(row), columnKey };
		draft.value = initialValue ?? '';
		nextTick(focusEditor);
		return true;
	}

	/** 取消编辑并清空草稿 */
	function cancel() {
		target.value = null;
		draft.value = '';
	}

	/**
	 * 取走草稿并退出编辑态。
	 * 调用方据此做类型转换 / 本地回写 / 远端提交；不取草稿等于放弃本次编辑。
	 * @returns 编辑目标与原始文本；无编辑态时返回 null
	 */
	function takeDraft(): (CellEditingTarget & { raw: string }) | null {
		const current = target.value;
		if (!current) return null;
		const raw = String(draft.value ?? '');
		target.value = null;
		draft.value = '';
		return { ...current, raw };
	}

	return { target, draft, isEditing, begin, cancel, takeDraft, focusEditor };
}
