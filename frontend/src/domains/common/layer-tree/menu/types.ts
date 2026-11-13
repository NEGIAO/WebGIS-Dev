/**
 * TOC 菜单的公共类型
 *
 * 抽出的理由：菜单项由 `contextMenu.ts` 构建、`commandDispatcher.ts` 分发、`TOCTreeItem.vue` 渲染，
 * 三处共用同一份结构；把类型收在这里，避免各处用隐式 any 或重复声明。
 */

/** 菜单项（分组项用 children 承载子项，divider 为分隔线） */
export interface TocMenuItem {
    /** 命令 key；divider 项可为空 */
    key?: string;
    label?: string;
    /** 危险操作（移除等），渲染为红色 */
    danger?: boolean;
    /** 分隔线标记 */
    divider?: boolean;
    /** 子菜单项（存在即渲染为可展开分组） */
    children?: TocMenuItem[];
    /** 渲染层解析出的图标组件（Vue 组件对象） */
    icon?: unknown;
    /** 内嵌滑杆：当前值（透明度 0~1 / 高程米） */
    opacity?: number;
    value?: number | string;
    /** 内嵌滑杆范围（高程项使用） */
    slider?: { min?: number; max?: number; step?: number } | null;
    /** 内嵌下拉选项（材质模式等） */
    choices?: Array<{ value: string; label: string }>;
}

/** 菜单能力开关：由 TOC 节点 actions 声明，决定哪些项出现 */
export interface TocMenuCapabilities {
    canView?: boolean;
    canSolo?: boolean;
    canEdit?: boolean;
    canOpenAttributeTable?: boolean;
    canStyle?: boolean;
    canOpenAoiPanel?: boolean;
    canToggleLabel?: boolean;
    isLabelVisible?: boolean;
    canCopyCoordinates?: boolean;
    canToggleLayerCRS?: boolean;
    canExportData?: boolean;
    canExportCSV?: boolean;
    canExportTXT?: boolean;
    canExportGeoJSON?: boolean;
    canExportKML?: boolean;
    canZoom?: boolean;
    canImportTo3D?: boolean;
    canRemove?: boolean;
    removeLabel?: string;
    currentOpacity?: number;
    /** 三维数据专属 */
    canSetHeight?: boolean;
    canSetMaterial?: boolean;
    canReposition?: boolean;
    canFitTerrain?: boolean;
    canFitTerrainInView?: boolean;
    canResetTerrain?: boolean;
    canStretchHeight?: boolean;
    heightRange?: { min?: number; max?: number; step?: number } | null;
    currentHeight?: number;
    materialMode?: string;
}

/** 文件夹递归勾选状态 */
export interface TocFolderSelectionState {
    totalCount?: number;
    selectedCount?: number;
    isAllSelected?: boolean;
    hasAnySelected?: boolean;
    isPartialSelected?: boolean;
}

/** 多选上下文（决定批量项是否出现） */
export interface TocSelectionState {
    selectedLayerIds?: string[];
    currentNodeId?: string;
    isCurrentLayerSelected?: boolean;
    folderSelectionState?: TocFolderSelectionState;
}

/** TOC 节点最小结构（图层树节点 + cesium:* 扩展字段） */
export interface TocMenuNode {
    id?: string;
    type?: string;
    name?: string;
    displayName?: string;
    actions?: Record<string, any>;
    labelVisible?: boolean;
    opacity?: number;
    heightRange?: { min?: number; max?: number; step?: number } | null;
    baseHeight?: number;
    materialMode?: string;
    [key: string]: any;
}
