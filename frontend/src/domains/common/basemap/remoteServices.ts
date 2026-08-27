/**
 * remoteServices.ts — 在线服务注册表（WMS / ArcGIS REST）
 *
 * 架构对齐 cesiumLayers 模式：「元数据入店、句柄留场」——
 * 本模块只存可序列化元数据；OL/Cesium 渲染句柄由各自 adapter 持有，
 * 场景操作经 adapter 回调触达，adapter 未注册时 action 降级为纯元数据操作。
 *
 * TOC 集成：经 remoteServiceNodeBuilder 映射为「在线服务」分组（folder + 子图层叶子），
 * 节点 id 约定：
 *   服务节点   rsvc:<id>
 *   子图层节点 rsvc:<id>:L:<encodeURIComponent(layerName)>
 */

import { computed, ref } from 'vue';

/** 子图层描述 */
export interface RemoteServiceSublayer {
    /** 图层名（即 WMS LAYERS 单值 / ArcGIS 数字 id 字符串） */
    name: string;
    title: string;
    label: string;
}

/** 在线服务元数据记录（禁止出现任何引擎对象字段） */
export interface RemoteServiceRecord {
    id: string;
    kind: 'wms' | 'arcgis' | 'xyz' | 'wmts';
    /** 用户输入的原始地址 */
    url: string;
    /** 解析后的服务端点（WMS GetMap 基地址 / ArcGIS 服务基址） */
    endpoint: string;
    title: string;
    selectedLayerId: string;
    layerLabel: string;
    /** 兜底 LAYERS 参数（sublayers 为空时使用；兼容历史版本记录结构） */
    layersParam: string;
    /** 可选子图层清单（不含合成项）；为空表示服务未声明子层结构 */
    sublayers: RemoteServiceSublayer[];
    /** 勾选的子图层名集合；全不勾 = 空 LAYERS（不渲染任何子图层），仅在 sublayers 为空时回退 layersParam 兜底 */
    selectedIds: string[];
    /**
     * 用户是否显式操作过子图层勾选。
     * false（默认）时 WMS 记录的空 selectedIds 按「全选」消费 —— 默认模式加载
     * 即整卷可见 + TOC 全勾，且存量旧记录无需重注册即可自愈；
     * 一经 setRemoteServiceSublayer 操作即置 true，此后空集 = 用户明确全关。
     */
    selectionTouched?: boolean;
    /**
     * 勾选子图层的叠放顺序（TOC 拖拽维护；数组头部 = 视觉上层）。
     * WMS LAYERS 语义：列表首层画在最底，故渲染端需反转此数组。
     * 仅含已勾选 id 的排列；新勾选的子图层追加到尾部（= 最底层之上、其余之下视反转方向而定，约定：追加 = 画在已选集合最上）。
     */
    layerOrder: string[];
    tileMode?: 'tiles' | 'export';
    maxLevel?: number;
    format?: string;
    version?: string;
    srs?: string;
    /** XYZ 行序：zxy 标准 slippy（默认）/ zyx ArcGIS 式 {z}/{y}/{x} / tms 南起 y 反算 */
    yScheme?: 'zxy' | 'zyx' | 'tms';
    /** WMTS TileMatrixSet 标识（优先 3857 系标准四叉树矩阵集） */
    matrixSet?: string;
    /** WMTS 命名样式（缺省空串 = default） */
    style?: string;
    geographicBbox?: [number, number, number, number];
    queryable: boolean;
    visible: boolean;
    opacity: number;
    createdAt: number;
}

/** TOC 节点 id 前缀（动作分流依据） */
export const RSVC_NODE_PREFIX = 'rsvc:';
/** 服务节点内子图层分隔符：rsvc:<id>:L:<enc(name)> */
export const RSVC_SUB_LAYER_SEP = ':L:';
/** 「在线服务」分组节点 id（唯一真源，nodeBuilder/tocActions/LayerPanel 均从此导入） */
export const RSVC_GROUP_NODE_ID = 'remote-service-group';
const MAX_RECORDS = 50;

// 会话态生命周期（对齐 cesiumLayers）：内存存储、刷新即清，不做 localStorage 持久化
const records = ref<RemoteServiceRecord[]>([]);

function makeId(): string {
    return `rsvc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 由记录推导渲染用 LAYERS 参数（双引擎 adapter 统一调用）
 * 分支按 kind 显式枚举（禁止排除式判断——新增 kind 默认走兜底而非误入他人语法）：
 * - 无 sublayers（v1 记录/xyz/wmts 单图层）：回退 layersParam 兜底
 * - arcgis export：show:id1,id2；全不勾 = 空；tiles 模式不适用（返回空串，tiles 渲染不消费该参数）
 * - wms：勾选项按 layerOrder 叠放顺序拼接（WMS 规范列表首层画最底，故渲染反转：头部 = 视觉上层）；
 *   全不勾 = 空（用户明确取消全部叠加，不复活初始组合）
 * - xyz/wmts 带 sublayers：无 LAYERS 组合语义，恒兜底 layersParam
 */
export function computeLayersParam(record: RemoteServiceRecord): string {
    const fallback = String(record.layersParam ?? '');
    if (!record.sublayers?.length) return fallback;
    if (record.kind === 'arcgis') {
        if (record.tileMode === 'tiles') return '';
        return record.selectedIds?.length ? `show:${renderOrderedIds(record).join(',')}` : '';
    }
    if (record.kind === 'wms') {
        // WMS 规范：LAYERS 列表首层画最底 → 反转视觉顺序（头部=上层）
        const ordered = renderOrderedIds(record);
        return ordered.length ? [...ordered].reverse().join(',') : '';
    }
    return fallback;
}

/**
 * 拆解 rsvc TOC 节点 id → { serviceId, subLayerName }（协议级唯一解析实现）
 * 服务节点 rsvc:<id> → { serviceId, subLayerName: '' }
 * 子图层节点 rsvc:<id>:L:<enc(name)> → { serviceId, subLayerName: decodeURIComponent(name) }
 */

/**
 * 勾选集合 → 视觉顺序（头部 = 视觉上层）。
 * layerOrder 头部 = 视觉上层；未入序的新勾选项按勾选先后追加在视觉最上。
 * 输入经 effectiveSelectedIds 归一化（WMS 默认模式：空选 = 全选）。
 */
export function renderOrderedIds(record: RemoteServiceRecord): string[] {
    const checked = new Set(effectiveSelectedIds(record));
    if (!checked.size) return [];
    const orderedVisibleTopFirst = (record.layerOrder || []).filter((id) => checked.has(id));
    const unorderedNewcomers = [...checked].filter((id) => !orderedVisibleTopFirst.includes(id));
    return [...unorderedNewcomers.reverse(), ...orderedVisibleTopFirst];
}

/**
 * 有效勾选集（消费端唯一入口）：
 * - 已显式选择 / 用户操作过 → 原样
 * - WMS / ArcGIS 动态服务记录从未触碰过选择集且声明了子图层 → 全选
 *   （默认模式语义：MapServer/WMS 默认加载整卷可见，存量旧记录自愈）
 */
export function effectiveSelectedIds(record: RemoteServiceRecord): string[] {
    const ids = record.selectedIds || [];
    if (ids.length || record.selectionTouched) return ids;
    const defaultAllKind = record.kind === 'wms' || (record.kind === 'arcgis' && record.tileMode !== 'tiles');
    if (defaultAllKind && record.sublayers?.length) {
        return record.sublayers.map((item) => item.name);
    }
    return ids;
}

/**
 * 该记录是否按「每子图层独立请求」渲染。
 * ArcGIS 动态服务的 LAYERS=show:a,b 只做过滤、忽略列表顺序（服务端恒按服务内部固定顺序绘制），
 * 客户端无法用单请求的 LAYERS 顺序控制叠放 → 必须拆成每子图层一个请求，由客户端 zIndex 排序。
 */
export function usesPerSublayerRequests(record: RemoteServiceRecord): boolean {
    return record.kind === 'arcgis' && record.tileMode !== 'tiles';
}

/**
 * 勾选子图层 → 视觉顺序 id 列表（头部 = 视觉上层），供拆分渲染的 adapter 逐个建源并按序排 zIndex。
 * 非 ArcGIS 动态服务返回空数组（不适用）。
 */
export function visualOrderedSublayerIds(record: RemoteServiceRecord): string[] {
    if (!usesPerSublayerRequests(record)) return [];
    return renderOrderedIds(record);
}
export function parseRsvcNodeId(rawId: string): { serviceId: string; subLayerName: string } {
    const withoutPrefix = String(rawId || '').slice(RSVC_NODE_PREFIX.length);
    const sepIndex = withoutPrefix.indexOf(RSVC_SUB_LAYER_SEP);
    if (sepIndex === -1) return { serviceId: withoutPrefix, subLayerName: '' };
    return {
        serviceId: withoutPrefix.slice(0, sepIndex),
        subLayerName: decodeURIComponent(withoutPrefix.slice(sepIndex + RSVC_SUB_LAYER_SEP.length)),
    };
}

/**
 * 记录 → 渲染签名：任一影响瓦片 URL 的要素变化即触发 adapter 重建 source/provider。
 * 双引擎共用同一实现，保证重建时机跨引擎一致。
 */
export function renderSignature(record: RemoteServiceRecord): string {
    return [
        record.kind,
        record.endpoint,
        record.tileMode,
        computeLayersParam(record),
        record.format,
        record.version,
        record.srs,
        record.maxLevel,
        record.yScheme,
        record.matrixSet,
        record.style,
    ].join('|');
}

/**
 * 注册（或更新）在线服务
 * 相同 url 视为同一服务：更新元数据与选择而非新增，避免重复堆积
 *
 * @returns 记录 id
 */
export function registerRemoteService(payload: {
    kind: 'wms' | 'arcgis' | 'xyz' | 'wmts';
    url: string;
    endpoint: string;
    title: string;
    selectedLayerId: string;
    layerLabel: string;
    layersParam: string;
    sublayers?: RemoteServiceSublayer[];
    selectedIds?: string[];
    tileMode?: 'tiles' | 'export';
    maxLevel?: number;
    format?: string;
    version?: string;
    srs?: string;
    yScheme?: 'zxy' | 'zyx' | 'tms';
    matrixSet?: string;
    style?: string;
    geographicBbox?: [number, number, number, number];
    queryable: boolean;
}): string {

    const normalizedUrl = String(payload.url || '').trim();

    // 默认模式：未显式勾选任何子图层时全选（按服务文档序）。
    // 覆盖 WMS 与 ArcGIS 动态服务（tiles 缓存无 LAYERS 概念，不参与）——
    // 保证「输入 MapServer 地址直接加载」= 整卷可见 + TOC 叶子全部勾选。
    let selectedIds = Array.isArray(payload.selectedIds) ? [...payload.selectedIds] : [];
    const defaultAllKind =
        payload.kind === 'wms' || (payload.kind === 'arcgis' && payload.tileMode !== 'tiles');
    if (!selectedIds.length && defaultAllKind && Array.isArray(payload.sublayers)) {
        selectedIds = payload.sublayers.map((item) => item.name);
    }
    const existing = records.value.find((item) => item.url === normalizedUrl);

    if (existing) {
        // 重注册不覆写用户已显式操作过的选择集：空 selectedIds 拉平为全选仅适用于新注册，
        // 对已触碰记录直接覆盖会把用户勾掉的选择悄悄改回全选
        const preserveSelection = existing.selectionTouched && !selectedIds.length;
        const { selectedIds: _ignoredSelection, ...restPayload } = payload;
        Object.assign(existing, restPayload, { url: normalizedUrl });
        if (!preserveSelection) {
            existing.selectedIds = selectedIds;
            if (selectedIds.length) existing.selectionTouched = true;
        }
        // 更新路径不覆盖 layerOrder：保留用户已拖拽的顺序，仅裁掉已不存在的子图层
        const validNames = new Set((existing.sublayers || []).map((s) => s.name));
        existing.layerOrder = (existing.layerOrder || []).filter((name) => validNames.has(name));
        return existing.id;
    }

    const record: RemoteServiceRecord = {
        ...payload,
        url: normalizedUrl,
        sublayers: Array.isArray(payload.sublayers) ? payload.sublayers : [],
        selectedIds,
        // 显式选择（含下拉默认全卷串）即视为已触碰；仅空选注册保持未触碰，
        // 使消费端按 WMS 默认全选拉平
        selectionTouched: selectedIds.length > 0,
        // layerOrder 约定：头部 = 视觉最上层。两种来源的目录语义相反，需分别对齐：
        // - ArcGIS REST f=json 的 layers 数组 = 地图文档自上而下（首层=视觉最上）→ 原序即约定
        // - WMS Capabilities 文档序 = 首层画最底（自底向上）→ 反转成头部=视觉上层
        layerOrder: selectedIds.length
            ? (payload.kind === 'arcgis' ? [...selectedIds] : [...selectedIds].reverse())
            : [],
        id: makeId(),
        visible: true,
        opacity: 1,
        createdAt: Date.now(),
    };
    records.value = [...records.value, record].slice(-MAX_RECORDS);
    return record.id;
}

export function unregisterRemoteService(id: string): void {
    records.value = records.value.filter((item) => item.id !== id);
}

export function setRemoteServiceVisible(id: string, visible: boolean): void {
    const target = records.value.find((item) => item.id === id);
    if (!target || target.visible === visible) return;
    target.visible = visible;
}

export function setRemoteServiceOpacity(id: string, opacity: number): void {
    const target = records.value.find((item) => item.id === id);
    const value = Number(opacity);
    if (!target || !Number.isFinite(value)) return;
    target.opacity = Math.min(1, Math.max(0, value));
}

/** 勾选/取消单个子图层（影响 LAYERS 组合，不影响服务整体显隐）；新勾选者置视觉最上层 */
export function setRemoteServiceSublayer(id: string, layerName: string, checked: boolean): void {
    const target = records.value.find((item) => item.id === id);
    if (!target || !layerName) return;
    // 用户显式操作勾选集：此后空集 = 明确全关，不再享受 WMS 默认全选
    target.selectionTouched = true;
    const set = new Set(effectiveSelectedIds(target));
    if (checked) {
        set.add(layerName);
        // 新勾选 = 画在已选集合最上（头部插入），与「列表上方 = 视觉上层」的 TOC 惯例一致
        if (!target.layerOrder?.includes(layerName)) {
            target.layerOrder = [layerName, ...(target.layerOrder || [])];
        }
    } else {
        set.delete(layerName);
    }
    target.selectedIds = [...set];
}

/**
 * 移除单个子图层（TOC 叶子「移除」语义，区别于勾选显隐）：
 * - 从 sublayers / selectedIds / layerOrder 三处彻底剔除该条目
 * - 视为用户显式操作（selectionTouched = true）
 * - 若服务已无任何子图层 → 自动注销整条记录
 * @param id 服务记录 id
 * @param layerName 子图层名
 */
export function removeRemoteServiceSublayer(id: string, layerName: string): void {
    const target = records.value.find((item) => item.id === id);
    if (!target || !layerName) return;
    const drop = (list: string[] | undefined) => (list || []).filter((name) => name !== layerName);
    target.sublayers = (target.sublayers || []).filter((item) => item.name !== layerName);
    // 剔除前先经 effectiveSelectedIds 展开：存量记录可能空选未触碰（WMS 默认全选语义），
    // 直接 drop 空数组会让「移除一项」变成「其余全部消失」
    target.selectedIds = drop(effectiveSelectedIds(target));
    target.layerOrder = drop(target.layerOrder);
    target.selectionTouched = true;
    if (!target.sublayers.length) {
        unregisterRemoteService(id);
    }
}

/**
 * 拖拽排序勾选子图层（TOC 拖拽落点回调）
 * @param id 服务记录 id
 * @param activeId 被拖拽的子图层名
 * @param targetId 落点目标子图层名（被拖拽项插入到目标之前，即目标上方）
 */
export function reorderRemoteServiceSublayers(id: string, activeId: string, targetId: string): void {
    const target = records.value.find((item) => item.id === id);
    if (!target || !activeId || !targetId || activeId === targetId) return;
    const order = [...(target.layerOrder || [])];
    // 未入序的被拖拽项（历史记录缺 layerOrder）先按 selectedIds 兜底补全
    if (!order.includes(activeId)) {
        order.push(activeId);
    }
    if (!order.includes(targetId)) {
        order.push(targetId);
    }
    const fromIndex = order.indexOf(activeId);
    order.splice(fromIndex, 1);
    order.splice(order.indexOf(targetId), 0, activeId);
    target.layerOrder = order;
}

/** 拖拽排序服务节点（在线服务分组内整体叠放次序；数组头部 = 视觉上层） */
export function reorderRemoteServices(activeId: string, targetId: string): void {
    if (!activeId || !targetId || activeId === targetId) return;
    const list = [...records.value];
    const fromIndex = list.findIndex((item) => item.id === activeId);
    const toIndex = list.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(list.findIndex((item) => item.id === targetId), 0, moved);
    records.value = list;
}

export function getRemoteService(id: string): RemoteServiceRecord | null {
    return records.value.find((item) => item.id === id) || null;
}

export function useRemoteServices() {
    return {
        records,
        recordCount: computed(() => records.value.length),
        registerRemoteService,
        unregisterRemoteService,
        setRemoteServiceVisible,
        setRemoteServiceOpacity,
        setRemoteServiceSublayer,
        reorderRemoteServiceSublayers,
        reorderRemoteServices,
        getRemoteService,
    };
}

// ========== 引擎定位 API 注册（TOC「缩放至图层」按引擎分发） ==========
export interface RsvcEngineZoomApi {
    /** 定位到服务声明的地理范围；返回 false 表示无法定位（如未声明范围） */
    zoomTo(serviceId: string): boolean;
}

/** 各引擎注册的定位实现（adapter 挂载时写入，后注册覆盖先注册） */
export const rsvcEngineApi: {
    ol?: RsvcEngineZoomApi;
    cesium?: RsvcEngineZoomApi;
} = {};

export function registerRsvcEngineApi(
    engine: 'ol' | 'cesium',
    api: RsvcEngineZoomApi,
): void {
    rsvcEngineApi[engine] = api;
}

/** 引擎卸载时反注册，避免残留 stale closure（旧 map/viewer 引用）被 TOC 定位动作误触 */
export function unregisterRsvcEngineApi(engine: 'ol' | 'cesium'): void {
    delete rsvcEngineApi[engine];
}
