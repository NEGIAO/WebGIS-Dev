/**
 * 功能名称：图层树节点（递归组件）
 * 日    期：2026/11/13
 * 说    明：视图层逻辑入口。展开态、多选态、可见性、右键菜单定位与重命名。
 */
import {
	computed,
	defineComponent,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import {
	ArrowLeftRight,
	Boxes,
	ChevronRight,
	Copy,
	Droplet,
	Eye,
	EyeOff,
	FileDown,
	Focus,
	Folder,
	FolderOpen,
	GripVertical,
	Info,
	Layers,
	ListMinus,
	ListPlus,
	ListX,
	MapPin,
	MoreHorizontal,
	Mountain,
	Paintbrush,
	Pencil,
	PencilLine,
	Table,
	Tag,
	Trash2,
	ZoomIn,
} from '@lucide/vue';
import { isValidLabel } from '@common/utils/labelValidator';
import { useMessage } from '@common/shell/useMessage';
import { buildContextMenuItems, dispatchContextMenuCommand, resolveFolderSelectionState } from '../';
import { TOC_LAYER_DRAG_MIME } from '../protocol';

// 一、Emits
type EmitsType = ['action'];

// 二、Props
const propDefine = {
	node: { type: Object as PropType<any>, required: true },
	activeLayerId: { type: String as PropType<string | null>, default: null },
	selectedLayerIds: { type: Array as PropType<any[]>, default: () : any => [] },
	/** 搜索态：触屏下搜索命中需强制展开，此时沿用 node.expanded */
	searchActive: { type: Boolean, default: false },
} as const;

export type TOCTreeItemProps = ExtractPropTypes<typeof propDefine>;

/** 菜单命令 → 图标映射（未命中时按 key 前缀回落） */
const MENU_ICONS: Record<string, any> = {
	view: Eye,
	solo: Focus,
	edit: PencilLine,
	rename: Pencil,
	attribute: Table,
	style: Paintbrush,
	'open-aoi-panel': MapPin,
	label: Tag,
	copy: Copy,
	opacity: Droplet,
	properties: Info,
	zoom: ZoomIn,
	'import-to-3d': Boxes,
	remove: Trash2,
	reposition: MapPin,
	'stretch-height': Mountain,
	'batch-show': Eye,
	'batch-hide': EyeOff,
	'multi-select-add': ListPlus,
	'folder-multi-select-add': ListPlus,
	'multi-select-remove': ListMinus,
	'folder-multi-select-remove': ListMinus,
	'multi-select-clear': ListX,
};

// 三、组件注册入口（name 同时用于模板自引用）
export default defineComponent({
	name: 'TOCTreeItem',
	components: { ChevronRight, Eye, EyeOff, Folder, FolderOpen, GripVertical, Layers, MoreHorizontal },
	props: propDefine,
	emits: ['action'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {
	/** 模板直接调用的 emit（对应原 <script setup> 中 defineEmits 的返回值） */
	public emit!: SetupContext<EmitsType>['emit'];
	public menuVisible = ref(false);
	public menuX = ref(0);
	public menuY = ref(0);
	public menuRef = ref<HTMLElement | null>(null);
	/** 展开中的子菜单容器 key：同一时刻只允许一个，避免多个子菜单同时把菜单撑高 */
	public openSubmenuKey = ref('');
	public isRenaming = ref(false);
	public renameValue = ref('');
	public renameInputRef = ref<HTMLInputElement | null>(null);

	/**
	 * 触屏设备判定（pointer: coarse）：
	 * 触屏下目录默认只显示一级，点击文件夹再展开二级，避免一屏铺满。
	 */
	private isCoarsePointer =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(pointer: coarse)').matches;

	/** 触屏下当前文件夹的展开态（桌面端不生效，仍走 store 的 node.expanded） */
	private mobileExpanded = ref(false);

	private message: ReturnType<typeof useMessage>;

	constructor(
		private props: TOCTreeItemProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.emit = this.ctx.emit;
		this.message = useMessage();
		this.init();
	}

	//#region props 透传

	get node() {
		return this.props.node;
	}
	get activeLayerId() {
		return this.props.activeLayerId;
	}
	get selectedLayerIds() {
		return this.props.selectedLayerIds;
	}
	get searchActive() {
		return this.props.searchActive;
	}

	//#endregion

	//#region 派生

	/**
	 * 实际展开态：
	 * - 桌面端：沿用 store 的 node.expanded
	 * - 触屏搜索中：沿用 filterTree 强制展开的 node.expanded，保证命中项可见
	 * - 触屏常规：仅由本地点按状态控制，默认折叠
	 */
	public isExpanded = computed(() => {
		if (!this.isCoarsePointer || this.props.searchActive) return !!this.props.node.expanded;
		return this.mobileExpanded.value;
	});

	public selectedLayerIdSet = computed(() => {
		const ids = Array.isArray(this.props.selectedLayerIds) ? this.props.selectedLayerIds : [];
		return new Set(ids.map((id: any) => String(id || '').trim()).filter(Boolean));
	});

	public isLayerMultiSelected = computed(() => {
		if (this.props.node?.type !== 'layer') return false;
		const layerId = String(this.props.node?.id || '').trim();
		if (!layerId) return false;
		return this.selectedLayerIdSet.value.has(layerId);
	});

	/* 可见性（ESRI 式眼睛开关）：off = 隐藏，partial = 文件夹部分可见 */
	public isVisible = computed(() => this.props.node?.visible !== false);
	public isPartialVisible = computed(() => !!this.props.node?.indeterminate && this.isVisible.value);

	public folderSelectionState = computed(() => {
		if (this.props.node?.type !== 'folder') {
			return {
				totalCount: 0,
				selectedCount: 0,
				isAllSelected: false,
				hasAnySelected: false,
				isPartialSelected: false,
			};
		}
		return resolveFolderSelectionState(this.props.node, this.selectedLayerIdSet.value);
	});

	public menuCapabilities = computed(() => {
		const actions = this.props.node?.actions || {};
		const canToggleLabel = !!actions.label && isValidLabel(this.props.node?.raw?.name || this.props.node?.name, 100).valid;
		const canExportData = !!actions.exportLayerData;
		const canExportCSV = actions.canExportCSV !== false && canExportData;
		const canExportTXT = actions.canExportTXT !== false && canExportData;
		const canExportGeoJSON = actions.canExportGeoJSON !== false && canExportData;
		const canExportKML = actions.canExportKML !== false && canExportData;

		return {
			canView: !!actions.viewEvent,
			canSolo: !!actions.soloEvent,
			canEdit: !!actions.edit,
			canOpenAttributeTable: !!actions.attribute,
			canStyle: !!actions.style,
			canOpenAoiPanel: !!actions.openAoiPanel,
			canToggleLabel,
			isLabelVisible: this.props.node?.labelVisible === true,
			canCopyCoordinates: !!actions.copyCoordinates,
			canToggleLayerCRS: !!actions.toggleLayerCRS,
			canExportData,
			canExportCSV,
			canExportTXT,
			canExportGeoJSON,
			canExportKML,
			canZoom: !!actions.zoom,
			canImportTo3D: !!actions.importTo3D,
			canRemove: !!actions.remove,
			removeLabel: actions.removeTip || '移除图层',
			currentOpacity: this.props.node?.opacity ?? 1,
			// 三维数据专属（cesium:* 节点扩展字段）
			canSetHeight: !!actions.setHeight && !!this.props.node?.heightRange,
			canSetMaterial: !!actions.setMaterial,
			canReposition: !!actions.reposition,
			canFitTerrain: !!actions.fitTerrain,
			canFitTerrainInView: !!actions.fitTerrainInView,
			canResetTerrain: !!actions.resetTerrain,
			canStretchHeight: !!actions.stretchHeight,
			heightRange: this.props.node?.heightRange || null,
			currentHeight: this.props.node?.baseHeight ?? 0,
			materialMode: this.props.node?.materialMode || 'baimo',
		};
	});

	public menuItems = computed(() =>
		buildContextMenuItems({
			node: this.props.node,
			capabilities: this.menuCapabilities.value,
			selectionState: {
				selectedLayerIds: Array.from(this.selectedLayerIdSet.value),
				currentNodeId: this.props.node?.id,
				isCurrentLayerSelected: this.isLayerMultiSelected.value,
				folderSelectionState: this.folderSelectionState.value,
			},
		}).map((item: any) => (item.divider ? item : { ...item, icon: this.resolveMenuIcon(item.key) }))
	);

	/** 菜单图标解析：精确命中 → export 前缀 → convert 前缀 → 无图标 */
	private resolveMenuIcon(key: string) {
		const k = String(key || '');
		if (MENU_ICONS[k]) return MENU_ICONS[k];
		if (k.includes('export')) return FileDown;
		if (k.startsWith('convert-')) return ArrowLeftRight;
		return null;
	}

	//#endregion

	//#region 生命周期

	private init() {
		// 注册全局点击监听器：点击菜单外部时自动关闭
		onMounted(() => {
			document.addEventListener('pointerdown', this.handleGlobalPointerDown, true);
		});
		onBeforeUnmount(() => {
			document.removeEventListener('pointerdown', this.handleGlobalPointerDown, true);
		});
	}

	private handleGlobalPointerDown = (event: PointerEvent) => {
		if (!this.menuVisible.value) return;
		const menuEl = this.menuRef.value;
		if (menuEl && menuEl.contains(event.target as Node)) return;
		this.closeContextMenu();
	};

	//#endregion

	//#region 事件派发

	public emitAction = (type: string, payload: Record<string, any> = {}) => {
		this.ctx.emit('action', { type, ...payload });
	};

	public handleToggleVisibility = () => {
		const visible = !this.isVisible.value;
		if (this.props.node.type === 'folder') {
			this.emitAction('toggle-folder-visibility', { nodeId: this.props.node.id, visible });
			return;
		}
		this.emitAction('toggle-layer-visibility', { layerId: this.props.node.id, visible });
	};

	public handlePrimaryClick = () => {
		if (this.props.node.type === 'layer') {
			this.emitAction('layer-selected', { layerId: this.props.node.id });
			return;
		}
		// 触屏下点击文件夹行即可展开/收起二级（桌面端保持原行为）
		if (this.props.node.type === 'folder' && this.isCoarsePointer && !this.props.searchActive) {
			this.mobileExpanded.value = !this.mobileExpanded.value;
		}
	};

	/** 文件夹展开按钮：触屏走本地状态，桌面端写回 store */
	public handleToggleExpand = () => {
		if (this.isCoarsePointer && !this.props.searchActive) {
			this.mobileExpanded.value = !this.mobileExpanded.value;
			return;
		}
		this.emitAction('toggle-folder-expand', {
			nodeId: this.props.node.id,
			expanded: !this.props.node.expanded,
		});
	};

	/** 行标题点击：触屏下等同点击文件夹行（桌面端不改变原有行为） */
	public handleLabelClick = () => {
		if (this.props.node.type === 'folder' && this.isCoarsePointer && !this.props.searchActive) {
			this.mobileExpanded.value = !this.mobileExpanded.value;
		}
	};

	public handleOpacityChange = (event: Event) => {
		const value = (event.target as HTMLInputElement).value;
		const opacity = Math.max(0, Math.min(1, Number(value) || 0));
		this.emitAction('change-layer-opacity', { layerId: this.props.node.id, opacity });
	};

	/** 三维数据：调整 3D Tiles 基座高程（滑杆连续交互，不经命令分发） */
	public handleHeightChange = (event: Event) => {
		const value = (event.target as HTMLInputElement).value;
		const height = Math.round(Number(value) || 0);
		this.emitAction('data-set-height', { layerId: this.props.node.id, height });
	};

	/** 三维数据：切换 3D Tiles 材质模式 */
	public handleMaterialChange = (event: Event) => {
		const mode = (event.target as HTMLSelectElement).value;
		this.emitAction('data-set-material', { layerId: this.props.node.id, mode });
	};

	public handleDragStart = (evt: DragEvent) => {
		if (!this.props.node.draggable) return;
		// 携带拖拽源 id，供 drop 目标识别来源：
		// text/plain 维持行内排序，自定义 MIME 供跨容器落点（如 Cesium 画布）识别图层拖拽
		evt.dataTransfer?.setData('text/plain', this.props.node.id);
		evt.dataTransfer?.setData(TOC_LAYER_DRAG_MIME, this.props.node.id);
		this.emitAction('drag-layer-start', { layerId: this.props.node.id });
	};

	public handleDrop = (evt: DragEvent) => {
		if (!this.props.node.droppable) return;
		const dragId = evt?.dataTransfer?.getData('text/plain') || '';
		this.emitAction('drop-layer', { layerId: dragId || this.props.node.id, targetId: this.props.node.id });
	};

	//#endregion

	//#region 右键菜单

	public closeContextMenu = () => {
		this.menuVisible.value = false;
		this.openSubmenuKey.value = '';
	};

	/** 视口贴边：优先 visualViewport（移动端地址栏/软键盘更准），不支持时回退 innerWidth/Height */
	private normalizeMenuPosition() {
		const el = this.menuRef.value;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const gap = 8;
		const viewportWidth = (window as any).visualViewport?.width ?? window.innerWidth;
		const viewportHeight = (window as any).visualViewport?.height ?? window.innerHeight;

		let x = this.menuX.value;
		let y = this.menuY.value;

		if (rect.right > viewportWidth - gap) x = Math.max(gap, viewportWidth - rect.width - gap);
		// 高度已被 CSS max-height 钳在视口内，这里只做「贴边」；
		// 若仍越界（极矮视口 / 未支持 dvh），贴顶并把溢出交给菜单自身滚动。
		if (rect.bottom > viewportHeight - gap) y = Math.max(gap, viewportHeight - rect.height - gap);

		this.menuX.value = x;
		this.menuY.value = y;
	}

	public openContextMenuAt = (x: number, y: number) => {
		if (!this.menuItems.value.length) return;
		this.menuX.value = Number(x) || 0;
		this.menuY.value = Number(y) || 0;
		// 每次打开都从「全部收起」开始，避免上一次的展开态带进来把菜单撑高
		this.openSubmenuKey.value = '';
		this.menuVisible.value = true;
		nextTick(() => this.normalizeMenuPosition());
	};

	public openContextMenuFromEvent = (event: MouseEvent) => {
		this.openContextMenuAt(event.clientX, event.clientY);
	};

	public openContextMenuFromButton = (event: MouseEvent) => {
		const rect = (event.currentTarget as HTMLElement)?.getBoundingClientRect?.();
		if (rect) {
			this.openContextMenuAt(rect.right - 4, rect.bottom + 6);
			return;
		}
		this.openContextMenuAt(event.clientX, event.clientY);
	};

	/**
	 * 展开 / 收起分组项（如「导出数据」）的子选项
	 * 为何就地展开而非右侧浮层：菜单容器是 overflow-y:auto 的滚动区，浮层会被容器裁切；
	 * 触屏没有 hover，浮层触发方式也不成立。手风琴在桌面与真机上行为一致。
	 */
	public toggleSubmenu = (key: string) => {
		this.openSubmenuKey.value = this.openSubmenuKey.value === key ? '' : key;
		// 展开后菜单变高，需重新贴边；否则靠近视口底部打开时新增子项会落到视口外
		nextTick(() => {
			this.normalizeMenuPosition();
			this.ensureSubmenuVisible();
		});
	};

	/** 保证展开的子项落在菜单滚动视口内（只调 scrollTop，避免连带滚动页面） */
	private ensureSubmenuVisible() {
		const menuEl = this.menuRef.value;
		const subEl = menuEl?.querySelector?.('.menu-subitems');
		if (!menuEl || !subEl) return;

		const menuRect = menuEl.getBoundingClientRect();
		const subRect = subEl.getBoundingClientRect();
		const overflowBottom = subRect.bottom - menuRect.bottom + 8;
		if (overflowBottom > 0) menuEl.scrollTop += overflowBottom;
	}

	public handleMenuCommand = (key: string) => {
		if (key === 'rename') {
			this.closeContextMenu();
			this.startRename();
			return;
		}

		try {
			const events = dispatchContextMenuCommand({
				key,
				node: this.props.node,
				selectedLayerIds: Array.from(this.selectedLayerIdSet.value),
			});
			events.forEach((evt: any) => this.emitAction(evt.type, evt.payload || {}));
		} catch (_error) {
			// 右键菜单命令分发失败，以 message 提示用户
			this.message.error('菜单命令执行失败，请重试');
		} finally {
			this.closeContextMenu();
		}
	};

	//#endregion

	//#region 重命名

	public startRename = () => {
		if (this.props.node.type !== 'layer') return;
		this.renameValue.value = this.props.node.displayName || this.props.node.name || '';
		this.isRenaming.value = true;
		nextTick(() => this.renameInputRef.value?.select?.());
	};

	/** 重命名输入：事件取值（模板不写 TS 断言，避免运行时不支持 as 表达式） */
	public handleRenameInput = (event: Event) => {
		this.renameValue.value = (event.target as HTMLInputElement).value;
	};

	public commitRename = () => {
		if (!this.isRenaming.value) return;
		const newName = this.renameValue.value.trim();
		this.isRenaming.value = false;
		if (newName && newName !== (this.props.node.displayName || this.props.node.name)) {
			this.emitAction('rename-layer', { layerId: this.props.node.id, newName });
		}
	};

	public cancelRename = () => {
		this.isRenaming.value = false;
	};

	//#endregion
}
