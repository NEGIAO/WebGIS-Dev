/**
 * 功能名称：管理后台数据表逻辑（列表 / 分页 / 排序 / 搜索 / 行内编辑 / 增删 / 导出）
 * 日    期：2026/11/13
 * 说    明：从 AdminControlPanel.vue 抽出的表格能力层，不持有组件生命周期，
 *          仅通过 deps 注入 message / t / 变更回调，便于独立复用与测试。
 */
import { computed, ref, watch } from 'vue';
import { useCellEditing } from '@common/composables/useCellEditing';
import { useRequestToken } from '@common/composables/useRequestToken';
import {
	apiAdminDeleteRows,
	apiAdminGetTableRows,
	apiAdminInsertRow,
	apiAdminListTables,
	apiAdminUpdateRows,
} from '@/api/backend';
import { buildCsv, downloadTextFile, formatCellValue, getRowKey, highlightText, resolveWhere, toEditablePayload } from './adminTableFormat';

export interface AdminTableDeps {
	message: {
		success: (msg: string) => void;
		error: (msg: string) => void;
		warning: (msg: string) => void;
	};
	t: (key: string, params?: Record<string, any>) => string;
	/** 数据变更后的外部刷新（如概览指标），可选 */
	onMutated?: () => void | Promise<void>;
}

export function useAdminTable(deps: AdminTableDeps) {
	const { message, t, onMutated } = deps;

	// ── 表清单与选择 ──
	const tables = ref<any[]>([]);
	const selectedTable = ref('');
	const selectedTableMeta = computed(() => tables.value.find((item) => item.name === selectedTable.value) || null);

	// ── 行数据与分页 ──
	const tableRows = ref<any[]>([]);
	const tableTotal = ref(0);
	/** 每页行数：30 / 100 / 200 / 0（0 = All，前端循环拉全量） */
	const tablePageSize = ref(30);
	const tablePage = ref(1);

	// ── 排序与搜索 ──
	const dbSortKey = ref('');
	const dbSortDir = ref('desc');
	const dbSearch = ref('');

	// ── 加载态 ──
	const loadingTables = ref(false);
	const loadingRows = ref(false);
	const submittingTable = ref(false);
	const exportingCsv = ref(false);

	// ── 新增行表单 ──
	const insertRowData = ref<Record<string, string>>({});
	const showInsertRow = ref(false);

	// ── 行级 JSON 编辑 ──
	const editingRowKey = ref<string | null>(null);
	const editingJsonText = ref('');

	// ── 单元格就地编辑（状态机在 common/composables/useCellEditing） ──
	/** 函数 ref：避免 v-for 中模板 ref 被覆盖 */
	let cellInputElement: any = null;
	function setCellInputRef(el: any) {
		cellInputElement = el;
	}
	const cellEditor = useCellEditing({
		getRowKey: (row: Record<string, any>) => getRowKey(row),
		// 行展开编辑模式下禁止单元格编辑，二者互斥
		isBlocked: () => editingRowKey.value !== null,
		inputRef: () => cellInputElement,
	});
	/** 模板沿用 `${rowKey}:${columnKey}` 复合键形式 */
	const editingCell = computed(() => {
		const target = cellEditor.target.value;
		return target ? `${target.rowKey}:${target.columnKey}` : null;
	});
	/** 与 composable 草稿同源（v-model 直接写该 ref） */
	const editingCellValue = cellEditor.draft;

	/** 请求令牌：翻页/搜索竞态时丢弃过期响应（逻辑在 common/composables/useRequestToken） */
	const rowRequestToken = useRequestToken();
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	//#region 派生

	/** 行数文本：无搜索词显示全表总数，有搜索词显示后端过滤后的匹配数 */
	const filteredRowCount = computed(() => {
		if (dbSearch.value.trim()) return t('admin.searchResultCount', { count: tableTotal.value });
		return t('admin.rowCountText', { count: tableTotal.value });
	});

	/** 后端已按 sort_key/sort_dir 与 search 过滤排序，此处仅透传当前页数据 */
	const sortedTableRows = computed(() => tableRows.value);

	/** 分页总页数；All 模式下恒为 1 */
	const totalPages = computed(() => {
		if (!tablePageSize.value) return 1;
		return Math.max(1, Math.ceil((tableTotal.value || 0) / tablePageSize.value));
	});

	/** 当前浏览的行号区间（1 起）；无数据显示 null */
	const rowRange = computed(() => {
		const count = tableRows.value.length;
		if (!count) return null;
		const start = tablePageSize.value ? (tablePage.value - 1) * tablePageSize.value + 1 : 1;
		return { start, end: start + count - 1 };
	});

	/** 表格首行行号列起始值（配合 v-for index 渲染连续序号） */
	const rowStartIndex = computed(() => rowRange.value?.start || 1);

	//#endregion

	//#region 渲染辅助

	/** 单元格渲染：命中搜索词时对每段命中包 <mark> */
	function highlightCell(row: Record<string, any>, columnKey: string) {
		const raw = row[columnKey];
		if (raw == null) return '-';
		return highlightText(formatCellValue(raw), dbSearch.value.trim());
	}

	/** 当前行是否命中搜索词（整行弱高亮用） */
	function isRowHit(row: Record<string, any>) {
		const keyword = dbSearch.value.trim().toLowerCase();
		if (!keyword) return false;
		return (selectedTableMeta.value?.columns || []).some((col: any) => {
			const value = row[col.name];
			if (value == null) return false;
			return formatCellValue(value).toLowerCase().includes(keyword);
		});
	}

	//#endregion

	//#region 表单与编辑

	/** 重置新增行表单 */
	function resetInsertRow() {
		const data: Record<string, string> = {};
		for (const col of selectedTableMeta.value?.columns || []) data[col.name] = '';
		insertRowData.value = data;
	}

	/** 切换排序：更新状态后回到第 1 页并触发后端跨页排序 */
	function toggleDbSort(colName: string) {
		if (dbSortKey.value === colName) {
			dbSortDir.value = dbSortDir.value === 'asc' ? 'desc' : 'asc';
		} else {
			dbSortKey.value = colName;
			dbSortDir.value = 'asc';
		}
		tablePage.value = 1;
		loadRows();
	}

	/** 开始单元格编辑（行展开编辑模式下禁止，二者互斥） */
	function startEditCell(row: Record<string, any>, columnKey: string) {
		cellEditor.begin(row, columnKey, String(row[columnKey] ?? ''));
	}

	function cancelEditCell() {
		cellEditor.cancel();
	}

	/** 提交单元格编辑：智能解析 JSON，失败则按字符串提交 */
	async function saveEditCell(row: Record<string, any>, columnKey: string) {
		if (submittingTable.value) return;
		const tableName = String(selectedTable.value || '').trim();
		if (!tableName) return;

		const where = resolveWhere(row, tableName);
		if (!where) {
			message.warning(t('admin.noLocateKey'));
			return;
		}

		submittingTable.value = true;
		try {
			let parsed: any;
			try {
				parsed = JSON.parse(editingCellValue.value);
			} catch {
				parsed = editingCellValue.value;
			}
			await apiAdminUpdateRows(tableName, where, { [columnKey]: parsed });
			message.success(t('admin.updateSuccess'));
			cancelEditCell();
			await loadRows();
		} catch (error: any) {
			message.error(String(error?.message || t('admin.updateFailed')));
		} finally {
			submittingTable.value = false;
		}
	}

	/** 解析 JSON 对象（必须为对象，非数组） */
	function parseJsonObject(text: string, hint?: string) {
		const fallbackHint = hint || t('admin.jsonFormatError');
		try {
			const parsed = JSON.parse(String(text || '{}'));
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new Error(t('admin.jsonMustBeObject'));
			}
			return parsed;
		} catch (error: any) {
			const detail = String(error?.message || '').trim();
			throw new Error(`${fallbackHint}${detail ? `：${detail}` : ''}`, { cause: error });
		}
	}

	function startEditRow(row: Record<string, any>) {
		editingRowKey.value = getRowKey(row);
		editingJsonText.value = JSON.stringify(toEditablePayload(row), null, 2);
	}

	function cancelEditRow() {
		editingRowKey.value = null;
		editingJsonText.value = '';
	}

	/** 提交整行 JSON 编辑 */
	async function saveEditRow(row: Record<string, any>) {
		if (submittingTable.value) return;
		const tableName = String(selectedTable.value || '').trim();
		const where = resolveWhere(row, tableName);
		if (!tableName || !where) {
			message.warning(t('admin.noLocateKey'));
			return;
		}

		let nextValues: any;
		try {
			nextValues = parseJsonObject(editingJsonText.value, t('admin.editParseFailed'));
		} catch (error: any) {
			message.error(String(error?.message || t('admin.editParseFailed')));
			return;
		}

		submittingTable.value = true;
		try {
			await apiAdminUpdateRows(tableName, where, nextValues);
			message.success(t('admin.updateSuccess'));
			cancelEditRow();
			await loadRows();
		} catch (error: any) {
			message.error(String(error?.message || t('admin.updateFailed')));
		} finally {
			submittingTable.value = false;
		}
	}

	//#endregion

	//#region 数据加载

	/** 加载表清单；首次自动选中第一张表，选中项失效时回落到第一张 */
	async function loadTables() {
		loadingTables.value = true;
		try {
			const result: any = await apiAdminListTables();
			const list = Array.isArray(result?.data) ? result.data : [];
			tables.value = list;

			if (!selectedTable.value && list.length > 0) {
				selectedTable.value = String(list[0].name || '');
			}
			if (selectedTable.value && !list.some((item: any) => item.name === selectedTable.value)) {
				selectedTable.value = String(list[0]?.name || '');
			}
		} catch (error: any) {
			message.error(String(error?.message || t('admin.tableListLoadFailed')));
		} finally {
			loadingTables.value = false;
		}
	}

	/** 加载当前表当前页数据；带竞态令牌与越界页自愈 */
	async function loadRows() {
		const seq = rowRequestToken.next();
		cancelEditRow();
		const tableName = String(selectedTable.value || '').trim();
		if (!tableName) {
			tableRows.value = [];
			tableTotal.value = 0;
			return;
		}

		loadingRows.value = true;
		try {
			const keyword = dbSearch.value.trim();
			const sortKey = dbSortKey.value;
			const sortDir = dbSortDir.value;
			if (tablePageSize.value) {
				const result: any = await apiAdminGetTableRows(
					tableName,
					tablePageSize.value,
					(tablePage.value - 1) * tablePageSize.value,
					keyword,
					sortKey,
					sortDir
				);
				if (!rowRequestToken.isCurrent(seq)) return;
				tableRows.value = Array.isArray(result?.data?.rows) ? result.data.rows : [];
				tableTotal.value = Number(result?.data?.total ?? tableRows.value.length);
				// 删行后当前页可能越界：钳到最后一个非空页并重拉一次
				if (tablePageSize.value && tableRows.value.length === 0 && tablePage.value > 1 && tableTotal.value > 0) {
					tablePage.value = Math.max(1, Math.ceil(tableTotal.value / tablePageSize.value));
					await loadRows();
					return;
				}
			} else {
				// All 模式：以 200 行/次循环拉取全量
				const all: any[] = [];
				let offset = 0;
				for (;;) {
					const result: any = await apiAdminGetTableRows(tableName, 200, offset, keyword, sortKey, sortDir);
					if (!rowRequestToken.isCurrent(seq)) return;
					const page = Array.isArray(result?.data?.rows) ? result.data.rows : [];
					all.push(...page);
					tableTotal.value = Number(result?.data?.total ?? all.length);
					offset += 200;
					if (page.length === 0 || all.length >= tableTotal.value) break;
				}
				tableRows.value = all;
			}
		} catch (error: any) {
			if (!rowRequestToken.isCurrent(seq)) return;
			tableRows.value = [];
			message.error(String(error?.message || t('admin.tableDataLoadFailed')));
		} finally {
			if (rowRequestToken.isCurrent(seq)) loadingRows.value = false;
		}
	}

	/** 跳转到指定页（自动钳制到合法范围） */
	function goToPage(page: number) {
		const target = Math.min(Math.max(1, Number(page) || 1), totalPages.value);
		if (target === tablePage.value) return;
		tablePage.value = target;
		loadRows();
	}

	//#endregion

	//#region 增删与导出

	/** 新增行：空字符串跳过，非空智能解析 JSON */
	async function handleInsertRow() {
		if (submittingTable.value) return;
		const tableName = String(selectedTable.value || '').trim();
		if (!tableName) {
			message.warning(t('admin.selectTableFirst'));
			return;
		}

		const rowPayload: Record<string, any> = {};
		for (const col of selectedTableMeta.value?.columns || []) {
			const raw = String(insertRowData.value[col.name] ?? '').trim();
			if (!raw) continue;
			try {
				rowPayload[col.name] = JSON.parse(raw);
			} catch {
				rowPayload[col.name] = raw;
			}
		}
		if (Object.keys(rowPayload).length === 0) {
			message.warning(t('admin.insertEmpty'));
			return;
		}

		submittingTable.value = true;
		try {
			await apiAdminInsertRow(tableName, rowPayload);
			message.success(t('admin.addSuccess'));
			resetInsertRow();
			await loadRows();
			await onMutated?.();
		} catch (error: any) {
			message.error(String(error?.message || t('admin.addFailed')));
		} finally {
			submittingTable.value = false;
		}
	}

	/** 删除行（二次确认） */
	async function handleDeleteRow(row: Record<string, any>) {
		if (submittingTable.value) return;
		const tableName = String(selectedTable.value || '').trim();
		const where = resolveWhere(row, tableName);
		if (!tableName || !where) {
			message.warning(t('admin.noLocateKeyDelete'));
			return;
		}
		if (!window.confirm(t('admin.deleteConfirm'))) return;

		submittingTable.value = true;
		try {
			await apiAdminDeleteRows(tableName, where);
			message.success(t('admin.deleteSuccess'));
			await loadRows();
			await onMutated?.();
		} catch (error: any) {
			message.error(String(error?.message || t('admin.deleteFailed')));
		} finally {
			submittingTable.value = false;
		}
	}

	/** 导出全表 CSV：循环拉全量（携带当前搜索词）→ 构建 CSV → 下载 */
	async function exportCsv() {
		if (exportingCsv.value) return;
		const tableName = String(selectedTable.value || '').trim();
		if (!tableName) {
			message.warning(t('admin.selectTableFirst'));
			return;
		}

		exportingCsv.value = true;
		try {
			const columns = selectedTableMeta.value?.columns || [];
			const keyword = dbSearch.value.trim();
			const sortKey = dbSortKey.value;
			const sortDir = dbSortDir.value;
			const all: any[] = [];
			let offset = 0;
			for (;;) {
				const result: any = await apiAdminGetTableRows(tableName, 200, offset, keyword, sortKey, sortDir);
				const page = Array.isArray(result?.data?.rows) ? result.data.rows : [];
				all.push(...page);
				const total = Number(result?.data?.total ?? all.length);
				offset += 200;
				if (page.length === 0 || all.length >= total) break;
			}

			downloadTextFile(`${tableName}.csv`, buildCsv(columns, all));
			message.success(t('admin.exportCsvSuccess', { count: all.length }));
		} catch (error: any) {
			message.error(String(error?.message || t('admin.exportCsvFailed')));
		} finally {
			exportingCsv.value = false;
		}
	}

	//#endregion

	//#region 响应式联动

	watch(selectedTable, async () => {
		resetInsertRow();
		tablePage.value = 1;
		dbSortKey.value = '';
		dbSortDir.value = 'desc';
		await loadRows();
	});

	watch(tablePageSize, async () => {
		tablePage.value = 1;
		await loadRows();
	});

	/** 搜索词防抖：停止输入 300ms 后回到第 1 页并触发后端过滤查询 */
	watch(dbSearch, () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			tablePage.value = 1;
			await loadRows();
		}, 300);
	});

	//#endregion

	return {
		// 状态
		tables,
		selectedTable,
		tableRows,
		tableTotal,
		tablePageSize,
		tablePage,
		dbSortKey,
		dbSortDir,
		dbSearch,
		loadingTables,
		loadingRows,
		submittingTable,
		exportingCsv,
		insertRowData,
		showInsertRow,
		editingRowKey,
		editingJsonText,
		editingCell,
		editingCellValue,
		// 派生
		selectedTableMeta,
		filteredRowCount,
		sortedTableRows,
		totalPages,
		rowRange,
		rowStartIndex,
		// 方法
		setCellInputRef,
		resetInsertRow,
		toggleDbSort,
		startEditCell,
		cancelEditCell,
		saveEditCell,
		startEditRow,
		cancelEditRow,
		saveEditRow,
		loadTables,
		loadRows,
		goToPage,
		handleInsertRow,
		handleDeleteRow,
		exportCsv,
		highlightCell,
		isRowHit,
	};
}
