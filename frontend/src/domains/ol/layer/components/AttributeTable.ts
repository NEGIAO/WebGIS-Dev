/**
 * 功能名称：属性表（引擎无关，2D 上传图层与 3D 实体共用）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：虚拟滚动 + 列宽拖拽 + 面板拖拽/八向缩放 + 单元格就地编辑 + 多选高亮。
 *          `readonly` 为 true 时禁止改值与删要素（3D 实体无回写通道，避免假成功）。
 */
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch, type ExtractPropTypes, type SetupContext } from 'vue';
import { useAttrStore, type AttrRow } from '@/stores';
import { buildAttributeCsv, buildCsvFilename, downloadCsv } from '@ol/utils/attributeTableCsv';
import { useLocale } from '@common/app/useLocale';
import { useVirtualRows } from '@common/composables/useVirtualRows';
import { usePanelDragResize, type ResizeDirection } from '@common/composables/usePanelDragResize';
import { useCellEditing } from '@common/composables/useCellEditing';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';

// 一、Emits
type EmitsType = ['focus-feature', 'highlight-feature', 'cell-edit', 'delete-feature'];

// 二、Props
const propDefine = {
	readonly: { type: Boolean, default: false },
} as const;

export type AttributeTableProps = ExtractPropTypes<typeof propDefine>;

/** 行高（ArcGIS Pro 30px 标准） */
const ROW_HEIGHT = 30;
const OVERSCAN = 10;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 280;
const MOBILE_MEDIA_QUERY = '(max-width: 768px)';
const ID_COL_WIDTH = 68;
const DEFAULT_COL_WIDTH = 170;
const DEFAULT_COL_WIDTH_BY_TYPE: Record<string, number> = { number: 120, date: 132, boolean: 100 };
const ACTIONS_COL_WIDTH = 88;

// 三、组件注册入口
export default defineComponent({
	name: 'AttributeTable',
	props: propDefine,
	emits: ['focus-feature', 'highlight-feature', 'cell-edit', 'delete-feature'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {


	public panelRef = ref<HTMLElement | null>(null);
	public scrollRef = ref<HTMLElement | null>(null);
	public showFieldPanel = ref(false);
	/** 虚拟滚动窗口（行高恒定的定高虚拟化） */
	private vscroll = useVirtualRows({
		rowCount: () => this.totalRows.value,
		rows: () => this.rows.value,
		rowHeight: ROW_HEIGHT,
		overscan: OVERSCAN,
	});
	public scrollTop = this.vscroll.scrollTop;
	public viewportHeight = this.vscroll.viewportHeight;
	public statsField = ref('');

	/** 面板拖拽与八向缩放（含移动端底部停靠与宿主夹取） */
	private panel = usePanelDragResize({
		getRect: () => this.store.panelRect,
		setRect: (rect) => this.store.setPanelRect(rect),
		panelRef: () => this.panelRef.value,
		minWidth: MIN_WIDTH,
		minHeight: MIN_HEIGHT,
		mobileMediaQuery: MOBILE_MEDIA_QUERY,
		onResized: () => this.refreshViewportHeight(),
	});
	public isMobileViewport = this.panel.isMobileViewport;
	public interaction = this.panel.interaction;

	// ── 搜索 ──
	public searchInput = ref('');

	// ── 单元格编辑（状态机在 common/composables/useCellEditing） ──
	private cellEditor = useCellEditing({
		getRowKey: (row: AttrRow) => String(row.id),
		// 只读模式（3D 实体）下不进入编辑态：无回写通道，改了也留不住
		isBlocked: () => this.props.readonly,
		inputRef: () => this.cellEditInputEl,
	});
	/** 模板沿用旧字段名：{ rowId, field } */
	public editingCell = computed(() => {
		const target = this.cellEditor.target.value;
		return target ? { rowId: target.rowKey, field: target.columnKey } : null;
	});
	/** 与 composable 草稿同源（v-model 直接写该 ref） */
	public editingValue = this.cellEditor.draft;

	// ── 列宽拖拽 ──
	public colResize = ref<{ fieldKey: string; startX: number; startWidth: number } | null>(null);

	public store: ReturnType<typeof useAttrStore>;
	public t!: (key: string, params?: Record<string, any>) => string;
	public emit!: (event: 'focus-feature' | 'highlight-feature' | 'cell-edit' | 'delete-feature', ...args: any[]) => void;

	/** 定时器 / 帧回调统一托管（卸载自动释放，替代手写 clearTimeout / cancelAnimationFrame） */
	private timers = useTimerRegistry();
	private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	/** 编辑输入框必须用函数式 ref：v-for 内的普通模板 ref 会被收集成数组 */
	private cellEditInputEl: HTMLInputElement | null = null;
	/** hover 高亮：rAF 合并 + 同值去重 */
	private hoverFrameId: number | null = null;
	private pendingHoverFeatureId: string | null = null;
	private hasPendingHover = false;
	private lastSentHoverFeatureId: string | null = null;
	/** Ctrl/Shift 多选进行中标志：期间暂停 hover 预览 */
	private multiSelectActive = false;
	/** 各图层统计字段记忆：切走再切回时恢复上次选择 */
	private statsFieldMemory = new Map<string, string>();

	constructor(
		private props: AttributeTableProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.store = useAttrStore();
		const { t } = useLocale();
		this.t = t;
		this.emit = this.ctx.emit;
		this.searchInput.value = this.store.searchQuery;
		this.init();
	}

	get readonly() {
		return this.props.readonly;
	}

	//#region 派生

	public isVisible = computed(() => this.store.visible && !!this.store.activeDataset);
	public isMinimized = computed(() => this.store.minimized);
	public layerName = computed(() => this.store.activeDataset?.layerName || this.t('attrTable.defaultLayerName'));
	public allFields = computed(() => this.store.activeFields);
	public visibleFields = computed(() => this.store.visibleFields);
	public numericFields = computed(() => this.store.numericFields);
	public selectedFeatureId = computed(() => String(this.store.selectedFeatureId || ''));

	public filterByCurrentView = computed({
		get: () => this.store.filterByCurrentView,
		set: (val: boolean) => this.store.setFilterByCurrentView(!!val),
	});

	public sortKey = computed(() => this.store.sortKey);
	public sortDirection = computed(() => this.store.sortDirection);

	/** 视图筛选已勾选但地图范围不可用（视图未就绪或 3D 相机未对准地表）→ 筛选实际未生效 */
	public viewFilterUnavailable = computed(() => this.store.filterByCurrentView && !this.store.currentMapExtent);

	/** displayRows：在 filteredRows（视图范围 + 搜索）之上叠加表头排序 */
	public rows = computed(() => this.store.displayRows);
	public totalRows = computed(() => this.rows.value.length);
	public totalSourceRows = computed(() => this.store.activeRows.length);

	/** 确定性像素列宽：表头与每行是独立 grid 容器，用 fr 会因容器宽度差异错位 */
	public columnWidths = computed(() => this.visibleFields.value.map((f: any) => this.resolveFieldWidth(f)));

	public gridTemplateColumns = computed(() =>
		[`${ID_COL_WIDTH}px`, ...this.columnWidths.value.map((width: number) => `${width}px`), `${ACTIONS_COL_WIDTH}px`].join(' ')
	);

	public gridTotalWidth = computed(
		() => ID_COL_WIDTH + ACTIONS_COL_WIDTH + this.columnWidths.value.reduce((sum: number, w: number) => sum + w, 0)
	);

	public panelStyle = computed(() => ({
		left: `${this.store.panelRect.x}px`,
		top: `${this.store.panelRect.y}px`,
		width: `${this.store.panelRect.width}px`,
		// 最小化时收缩到原生标题栏高度
		height: this.isMinimized.value ? '36px' : `${this.store.panelRect.height}px`,
	}));

	public startIndex = this.vscroll.startIndex;
	public endIndex = this.vscroll.endIndex;
	public totalHeight = this.vscroll.totalHeight;
	public virtualRows = this.vscroll.virtualRows;

	public statSummary = computed(() => {
		const key = this.statsField.value;
		if (!key) return { sum: '0.00', avg: '0.00' };
		const values = this.rows.value
			.map((row: AttrRow) => Number(row.properties?.[key]))
			.filter((value: number) => Number.isFinite(value));
		if (!values.length) return { sum: '0.00', avg: '0.00' };
		const sum = values.reduce((acc: number, value: number) => acc + value, 0);
		const avg = sum / values.length;
		return {
			sum: sum.toLocaleString('zh-CN', { maximumFractionDigits: 3 }),
			avg: avg.toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 4 }),
		};
	});

	//#endregion

	//#region 生命周期

	private init() {
		// 搜索输入 200ms 防抖：大数据集下避免每击键全量过滤
		watch(this.searchInput, (val) => {
			if (this.searchDebounceTimer !== null) this.timers.cancel(this.searchDebounceTimer);
			this.searchDebounceTimer = this.timers.later(() => {
				this.searchDebounceTimer = null;
				this.store.setSearchQuery(String(val || ''));
			}, 200);
		});

		// store 侧被外部改动时回写输入框，保持双向一致
		watch(
			() => this.store.searchQuery,
			(val) => {
				if (val !== this.searchInput.value) this.searchInput.value = val;
			}
		);

		// 图层切换 / 面板重开时重置多选态
		watch(
			() => [this.store.activeLayerId, this.store.visible],
			() => {
				this.multiSelectActive = false;
			}
		);

		// 各图层统计字段记忆
		watch(this.statsField, (key) => {
			if (this.store.activeLayerId && key) this.statsFieldMemory.set(this.store.activeLayerId, key);
		});

		watch(
			() => [this.store.activeLayerId, this.numericFields.value] as const,
			() => {
				const fields = this.numericFields.value;
				if (!fields.length) {
					this.statsField.value = '';
					return;
				}
				const remembered = this.statsFieldMemory.get(this.store.activeLayerId);
				if (remembered && fields.some((item: any) => item.key === remembered)) {
					if (this.statsField.value !== remembered) this.statsField.value = remembered;
					return;
				}
				if (!fields.find((item: any) => item.key === this.statsField.value)) {
					this.statsField.value = fields[0].key;
				}
			},
			{ immediate: true }
		);

		// 仅在「切换图层」时回到顶部；数据增量刷新保持当前滚动位置
		watch(
			() => this.store.activeLayerId,
			() => {
				this.scrollBackToTop();
				// 图层上下文变化，hover 去重基准失效
				this.lastSentHoverFeatureId = null;
			}
		);

		// 排序 / 搜索 / 视图筛选变化等价于重新查询，回顶符合使用直觉
		watch(
			() => [this.store.sortKey, this.store.sortDirection, this.store.searchQuery, this.store.filterByCurrentView],
			() => this.scrollBackToTop()
		);

		// 行数变化时钳制滚动位置，避免悬停在空白虚拟区域
		watch(this.totalRows, () => this.vscroll.clampToContent(this.scrollRef.value));

		watch(
			() => this.isVisible.value,
			async (visibleNow) => {
				if (!visibleNow) return;
				await nextTick();
				this.ensureInitialPanelRect();
				this.refreshViewportHeight();
			},
			{ immediate: true }
		);

		watch(
			() => [this.store.panelRect.width, this.store.panelRect.height, this.showFieldPanel.value, this.isMinimized.value],
			() => {
				nextTick(() => this.refreshViewportHeight());
			}
		);

		onMounted(() => {
			// resize / 移动端媒体查询监听由 usePanelDragResize 自行注册
			// 面板初始不可见时跳过（宿主未挂载），打开瞬间由 isVisible 监听器初始化
			if (this.isVisible.value) {
				nextTick(() => {
					this.ensureInitialPanelRect();
					this.refreshViewportHeight();
				});
			}
		});

		onBeforeUnmount(() => {
			// resize / 媒体查询监听与拖拽解绑由 usePanelDragResize 自行清理
			this.stopColResize();
			if (this.hoverFrameId !== null) {
				window.cancelAnimationFrame(this.hoverFrameId);
				this.hoverFrameId = null;
			}
			if (this.searchDebounceTimer !== null) {
				window.clearTimeout(this.searchDebounceTimer);
				this.searchDebounceTimer = null;
			}
		});
	}

	//#endregion

	//#region 搜索 / 排序 / 导出

	/** 清除搜索：输入框与 store 同时立即清空（不等防抖） */
	public clearSearch = () => {
		if (this.searchDebounceTimer !== null) {
			this.timers.cancel(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}
		this.searchInput.value = '';
		this.store.setSearchQuery('');
	};

	public handleSortClick = (fieldKey: string) => this.store.toggleSort(fieldKey);

	public clearSort = () => this.store.clearSort();

	/** 导出当前视图（已筛选 + 已排序的行 × 可见列别名）为 CSV */
	public exportCsv = () => {
		if (!this.totalRows.value) return;
		const csvText = buildAttributeCsv(this.rows.value, this.visibleFields.value);
		downloadCsv(buildCsvFilename(this.layerName.value), csvText);
	};

	//#endregion

	//#region 单元格编辑

	/** 函数式 ref：避免 v-for 内模板 ref 被收集成数组导致 focus 静默失败 */
	public setCellEditInput = (el: unknown): void => {
		this.cellEditInputEl = el instanceof HTMLInputElement ? el : null;
	};

	public isEditing = (rowId: string, field: string): boolean => {
		const target = this.cellEditor.target.value;
		return !!target && target.rowKey === rowId && target.columnKey === field;
	};

	public startCellEdit = (row: AttrRow, field: { key: string }) => {
		this.cellEditor.begin(row, field.key, String(row.properties?.[field.key] ?? ''));
	};

	public cancelCellEdit = (): void => {
		this.cellEditor.cancel();
	};

	public commitCellEdit = (row: AttrRow, field: { key: string; type?: string }): void => {
		const target = this.cellEditor.target.value;
		if (!target || target.rowKey !== String(row.id)) return;
		const raw = String(this.editingValue.value ?? '').trim();
		let value: unknown = raw;
		if (field.type === 'number' && raw !== '') {
			const num = Number(raw);
			if (!Number.isFinite(num)) {
				this.cancelCellEdit();
				return;
			}
			value = num;
		}
		const changed = String(row.properties?.[field.key] ?? '') !== raw;
		this.cellEditor.cancel();
		if (!changed) return;
		row.properties = { ...(row.properties || {}), [field.key]: value };
		this.emit('cell-edit', {
			layerId: this.store.activeDataset?.layerId || '',
			featureId: row.featureId,
			field: field.key,
			value,
		});
	};

	public deleteFeatureRow = (row: AttrRow): void => {
		if (this.props.readonly) return;
		if (!window.confirm(this.t('attrTable.confirmDeleteFeature'))) return;
		this.emit('delete-feature', {
			layerId: this.store.activeDataset?.layerId || '',
			featureId: row.featureId,
		});
		if (this.selectedFeatureId.value === row.featureId) this.store.setSelectedFeature('');
	};

	public zoomToSelected = (): void => {
		const fid = this.selectedFeatureId.value;
		if (!fid) return;
		this.emit('focus-feature', { layerId: this.store.activeDataset?.layerId || '', featureId: fid, zoom: true });
	};

	public clearSelection = (): void => {
		this.store.setSelectedFeature('');
	};

	public deleteSelected = (): void => {
		const fid = this.selectedFeatureId.value;
		if (!fid) return;
		const row = this.rows.value.find((r: AttrRow) => r.featureId === fid);
		if (row) this.deleteFeatureRow(row);
	};

	//#endregion

	//#region 面板几何

	/** 列宽解析：用户显式宽度优先，否则按字段类型取默认宽 */
	private resolveFieldWidth = (field: { width?: number; type?: string }): number => {
		if (Number.isFinite(field.width)) return Number(field.width);
		return DEFAULT_COL_WIDTH_BY_TYPE[String(field.type || '')] ?? DEFAULT_COL_WIDTH;
	};

	public ensureInitialPanelRect = (): void => this.panel.ensureInitialPanelRect();

	public refreshViewportHeight = (): void => {
		this.vscroll.syncViewportHeight(this.scrollRef.value);
	};

	//#endregion

	//#region 面板拖拽与八向缩放

	public stopInteraction = (): void => this.panel.stopInteraction();
	public startDrag = (event: PointerEvent): void => this.panel.startDrag(event);
	public startResize = (direction: ResizeDirection, event: PointerEvent): void => this.panel.startResize(direction, event);
	public handleWindowResize = (): void => this.panel.handleWindowResize();
	public handleMobileQueryChange = (event: MediaQueryListEvent): void => this.panel.handleMobileQueryChange(event);

	//#endregion

	//#region 滚动与列宽

	public handleScroll = (): void => {
		this.vscroll.handleScroll(this.scrollRef.value);
	};

	public scrollBackToTop = (): void => {
		this.vscroll.scrollToTop(this.scrollRef.value);
	};

	public startColResize = (field: { key: string; width?: number; type?: string }, event: PointerEvent): void => {
		// 列宽完全由状态决定（用户宽度或类型默认宽），无需测量 DOM
		const startWidth = this.resolveFieldWidth(field);
		this.colResize.value = { fieldKey: field.key, startX: event.clientX, startWidth };
		document.body.style.cursor = 'col-resize';
		window.addEventListener('pointermove', this.onColResizeMove, { passive: true });
		window.addEventListener('pointerup', this.stopColResize, { passive: true, once: true });
	};

	private onColResizeMove = (event: PointerEvent): void => {
		const state = this.colResize.value;
		if (!state) return;
		this.store.setFieldWidth(state.fieldKey, state.startWidth + (event.clientX - state.startX));
	};

	public stopColResize = (): void => {
		this.colResize.value = null;
		document.body.style.cursor = 'auto';
		window.removeEventListener('pointermove', this.onColResizeMove);
		window.removeEventListener('pointerup', this.stopColResize);
	};

	//#endregion

	//#region 格式化与字段面板

	public formatValue = (value: unknown, type: string): string => {
		if (value === null || value === undefined || value === '') return '<Null>';
		if (type === 'number') {
			const num = Number(value);
			if (Number.isFinite(num)) return num.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
		}
		if (type === 'date') {
			const time = new Date(String(value));
			if (Number.isFinite(time.getTime())) {
				return `${time.getFullYear()}/${String(time.getMonth() + 1).padStart(2, '0')}/${String(time.getDate()).padStart(2, '0')}`;
			}
		}
		if (typeof value === 'object') {
			try {
				return JSON.stringify(value);
			} catch {
				return String(value);
			}
		}
		return String(value);
	};

	public toggleFieldPanel = (): void => {
		this.showFieldPanel.value = !this.showFieldPanel.value;
		nextTick(() => this.refreshViewportHeight());
	};

	public toggleMinimized = (): void => {
		this.store.toggleMinimized();
		nextTick(() => this.refreshViewportHeight());
	};

	public closeTable = (): void => {
		this.showFieldPanel.value = false;
		this.store.closeTable();
	};

	public updateFieldAlias = (fieldKey: string, event: Event): void => {
		this.store.setFieldAlias(fieldKey, (event.target as HTMLInputElement).value);
	};

	public updateFieldVisibility = (fieldKey: string, event: Event): void => {
		this.store.setFieldVisibility(fieldKey, (event.target as HTMLInputElement).checked);
	};

	//#endregion

	//#region hover 高亮与多选

	private flushHoverHighlight = (): void => {
		this.hoverFrameId = null;
		if (!this.hasPendingHover) return;
		this.hasPendingHover = false;
		const layerId = this.store.activeLayerId;
		if (!layerId) return;
		if (this.pendingHoverFeatureId === this.lastSentHoverFeatureId) return;
		this.lastSentHoverFeatureId = this.pendingHoverFeatureId;
		this.emit('highlight-feature', { layerId, featureId: this.pendingHoverFeatureId });
	};

	private scheduleHoverHighlight(featureId: string | null): void {
		this.pendingHoverFeatureId = featureId;
		this.hasPendingHover = true;
		if (this.hoverFrameId === null) this.hoverFrameId = this.timers.frame(this.flushHoverHighlight);
	}

	public previewFeature = (row: AttrRow): void => {
		// 多选进行中暂停 hover 预览——预览走 replace 语义，会清空 Ctrl/Shift 累积的高亮集合
		if (this.multiSelectActive) return;
		this.scheduleHoverHighlight(row.featureId);
	};

	/** 仅在鼠标离开整个表格滚动区时清除（行间移动由下一行的 replace 覆盖，不再闪烁） */
	public clearPreview = (): void => {
		if (this.multiSelectActive) return;
		this.scheduleHoverHighlight(null);
	};

	/** Ctrl/⌘=toggle 多选、Shift=range 区间，默认 replace */
	private resolveClickMode(event?: MouseEvent): 'replace' | 'toggle' | 'range' {
		if (event?.ctrlKey || event?.metaKey) return 'toggle';
		if (event?.shiftKey) return 'range';
		return 'replace';
	}

	/** 按当前展示顺序解析 Shift 区间（含两端）；锚点或目标不在展示集时返回空数组 */
	private resolveRangeFeatureIds(anchorId: string, targetId: string): string[] {
		if (!anchorId || !targetId) return [];
		const list = this.rows.value;
		const anchorIndex = list.findIndex((item: AttrRow) => item.featureId === anchorId);
		const targetIndex = list.findIndex((item: AttrRow) => item.featureId === targetId);
		if (anchorIndex < 0 || targetIndex < 0) return [];
		const from = Math.min(anchorIndex, targetIndex);
		const to = Math.max(anchorIndex, targetIndex);
		return list.slice(from, to + 1).map((item: AttrRow) => item.featureId);
	}

	public focusFeature = (row: AttrRow, event?: MouseEvent): void => {
		const layerId = this.store.activeLayerId;
		if (!layerId) return;
		const mode = this.resolveClickMode(event);
		// 锚点 = 上一次点击选中的行，须在 setSelectedFeature 覆盖前捕获
		const anchorId = String(this.store.selectedFeatureId || '');
		this.store.setSelectedFeature(row.featureId);
		// 点击已确定高亮目标，同步 hover 去重基准
		this.lastSentHoverFeatureId = row.featureId;

		// 普通单击：退出多选，replace 单选。高亮只经 focus-feature 触发一次
		if (mode === 'replace') {
			this.multiSelectActive = false;
			this.emit('focus-feature', { layerId, featureId: row.featureId, mode: 'replace' });
			return;
		}

		const entering = !this.multiSelectActive;
		this.multiSelectActive = true;

		if (mode === 'toggle') {
			// 首次进入多选先把集合规整为 {锚点行}，否则 toggle 结果不可预期
			if (entering) {
				if (!anchorId) {
					this.emit('focus-feature', { layerId, featureId: row.featureId, mode: 'replace' });
					return;
				}
				this.emit('focus-feature', { layerId, featureId: anchorId, mode: 'replace' });
			}
			this.emit('focus-feature', { layerId, featureId: row.featureId, mode: 'toggle' });
			return;
		}

		// range：按表格当前展示顺序取锚点→目标连续区间
		const rangeFeatureIds = this.resolveRangeFeatureIds(anchorId, row.featureId);
		if (!rangeFeatureIds.length) {
			this.multiSelectActive = false;
			this.emit('focus-feature', { layerId, featureId: row.featureId, mode: 'replace' });
			return;
		}
		if (entering) this.emit('focus-feature', { layerId, featureId: rangeFeatureIds[0], mode: 'replace' });
		this.emit('focus-feature', {
			layerId,
			featureId: row.featureId,
			mode: 'range',
			featureIds: rangeFeatureIds,
		});
	};

	/** 双击行：缩放到要素范围 */
	public zoomToFeatureRow = (row: AttrRow): void => {
		const layerId = this.store.activeLayerId;
		if (!layerId) return;
		this.emit('focus-feature', { layerId, featureId: row.featureId, mode: 'replace', zoom: true });
	};

	//#endregion
}
