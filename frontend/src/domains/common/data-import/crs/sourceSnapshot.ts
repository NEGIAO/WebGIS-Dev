/**
 * sourceSnapshot.ts — 导入前的「源几何快照」注册表
 *
 * 用途：支撑「导入后重设源坐标系」。
 *
 * 为什么必须单独存一份：导入流程一经完成，几何已被重投影到内部规范 CRS（2D 为
 * EPSG:3857，3D 为 EPSG:4326），原始数值就丢了。此时若发现坐标系判错（例如把
 * CGCS2000 3 度带判成了 WGS84），仅凭现有的 3857 坐标无法反推——两次不同的
 * 源坐标系都会落到合法范围内。因此必须在**重投影之前**留下原始几何。
 *
 * 与 mapshaper 的差别：mapshaper 始终保留未投影的原始坐标，`-proj init=` 才能
 * 事后改判；它没有我们这层「渲染前归一」，所以不需要额外副本。我们只在导入期
 * 多持有一份，属于为换取可回溯性付出的内存代价。
 *
 * 边界（刻意保持简单）：
 * - 不做响应式：快照可能很大，放进 Vue 的 reactive 会造成深度代理与无谓开销；
 * - 不落盘、不跨刷新：刷新页面即清空，符合「导入会话内可回溯」的语义；
 * - 有上限：单图层要素数超过 MAX_FEATURES 不存（宁可不可重设，也不吃爆内存），
 *   整体按估算字节数与条目数双重淘汰，**淘汰最久未访问者**（读快照即续命）；
 *   被拒或被淘汰都会打 `console.warn`，便于排查「重设入口为何没出现」。
 */

/** 快照内容：源坐标系下的 GeoJSON + 当时的判定结果 */
export type SourceSnapshot = {
    /** 重投影**之前**的 GeoJSON（坐标数值即原始数值） */
    geojson: any;
    /** 导入时判定的源坐标系（可能是 EPSG 编码、WKT: 或 PROJ: 别名） */
    sourceCrs: string;
    /** 导入时归一到的目标坐标系 */
    targetCrs: string;
    /** 要素数量，用于体积估算与展示 */
    featureCount: number;
    /** 捕获时刻（ms） */
    capturedAt: number;
};

/** 单图层要素数超过该值不再保留快照（大图层重投影成本与内存都不划算） */
const MAX_FEATURES = 200_000;
/** 全量估算字节上限（按 256B/要素粗算，仅用于防爆，不追求精确） */
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
/**
 * 最多同时保留的图层数（超出淘汰最久未访问者）。
 * 2D 与 3D 共用本注册表，同一份数据在两个引擎各导入一次会占两格 ——
 * 上限按「图层」而非「数据集」计，故留出余量；真正的硬约束是 MAX_TOTAL_BYTES。
 * 淘汰是真 LRU（见 touch）：只要用户还在打开某图层的属性弹窗，它就不会被挤掉。
 */
const MAX_ENTRIES = 24;

const store = new Map<string, SourceSnapshot>();

function estimateBytes(featureCount: number): number {
    return Math.max(1, featureCount) * 256;
}

function currentBytes(): number {
    let total = 0;
    for (const snapshot of store.values()) {
        total += estimateBytes(snapshot.featureCount);
    }
    return total;
}

/**
 * 功能：把命中条目移到 Map 尾部（Map 按插入顺序迭代，尾部即「最近使用」）。
 * 参数：id —— 图层 id
 * 说明：只调整顺序、不改内容、不触发响应式。让淘汰顺序反映「最近访问」
 *       而非「最早登记」—— 否则正在排查的图层会被后来的导入挤掉。
 */
function touch(id: string): void {
    const snapshot = store.get(id);
    if (!snapshot) return;
    store.delete(id);
    store.set(id, snapshot);
}

/**
 * 功能：登记一次导入的源几何快照。
 * 参数：
 *   layerId   —— 托管图层 id（createManagedVectorLayer 的返回值）
 *   snapshot  —— 见 SourceSnapshot；featureCount 缺省时按 features 长度补齐
 * 返回：boolean —— 是否被接受（要素数超限时返回 false，调用方据此隐藏「重设」入口）
 * 说明：同一 layerId 重复登记会覆盖并续命到 LRU 尾部（重新导入同名图层时是预期行为）。
 */
export function rememberSourceSnapshot(
    layerId: string,
    snapshot: Omit<SourceSnapshot, 'capturedAt'>,
): boolean {
    const id = String(layerId || '').trim();
    if (!id || !snapshot?.geojson) return false;

    const featureCount = Number(
        snapshot.featureCount ??
            (Array.isArray(snapshot.geojson?.features) ? snapshot.geojson.features.length : 0),
    );
    if (!Number.isFinite(featureCount) || featureCount <= 0) return false;
    if (featureCount > MAX_FEATURES) {
        // 不静默：用户会看到「重设入口没出现」，日志里必须能查到原因
        console.warn('[sourceSnapshot] 图层要素数超过上限，未留存快照（该图层无法重设坐标系）', {
            layerId: id,
            featureCount,
            limit: MAX_FEATURES,
        });
        return false;
    }

    // 先删再插：Map 对已存在的键只更新值、保留原插入位置，
    // 不先 delete 的话「重新登记」不会续命，仍会被当成最久未访问而优先淘汰。
    store.delete(id);
    store.set(id, {
        geojson: snapshot.geojson,
        sourceCrs: String(snapshot.sourceCrs || ''),
        targetCrs: String(snapshot.targetCrs || 'EPSG:4326'),
        featureCount,
        capturedAt: Date.now(),
    });

    // 淘汰：先按条目数，再按估算体积，始终保持最新的那条
    while (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next().value as string | undefined;
        if (!oldest) break;
        store.delete(oldest);
        console.warn('[sourceSnapshot] 快照条目数达上限，淘汰最久未访问的图层', {
            evicted: oldest,
            limit: MAX_ENTRIES,
        });
    }
    while (currentBytes() > MAX_TOTAL_BYTES && store.size > 1) {
        const oldest = store.keys().next().value as string | undefined;
        if (!oldest) break;
        store.delete(oldest);
        console.warn('[sourceSnapshot] 快照估算体积达上限，淘汰最久未访问的图层', {
            evicted: oldest,
            limitBytes: MAX_TOTAL_BYTES,
        });
    }
    return true;
}

/**
 * 功能：读取快照（不删除），并把该条目续命到 LRU 尾部。
 * 参数：layerId —— 托管图层 id
 * 返回：SourceSnapshot | null
 */
export function getSourceSnapshot(layerId: string): SourceSnapshot | null {
    const id = String(layerId || '').trim();
    const snapshot = store.get(id);
    if (!snapshot) return null;
    // 读即续命：属性弹窗每次打开都会查一次，保证正在看的图层不会被别的导入挤掉
    touch(id);
    return snapshot;
}

/**
 * 功能：判断是否存在可用的源几何快照（UI 决定是否展示「重设源坐标系」）。
 */
export function hasSourceSnapshot(layerId: string): boolean {
    return store.has(String(layerId || '').trim());
}

/**
 * 功能：图层被移除时清空对应快照，避免 id 复用后张冠李戴。
 */
export function forgetSourceSnapshot(layerId: string): void {
    store.delete(String(layerId || '').trim());
}

/**
 * 功能：更新快照的源坐标系记录（重设成功后调用，使第二次重设基于新的判断）。
 * 注意：几何本身不变 —— 快照永远是**原始数值**，改的只是「这批原始数值被当作什么」。
 */
export function updateSnapshotCrs(layerId: string, sourceCrs: string): void {
    const snapshot = store.get(String(layerId || '').trim());
    if (!snapshot) return;
    snapshot.sourceCrs = String(sourceCrs || '');
}

/**
 * 功能：清空全部快照。
 * 用途：仅诊断 / 测试（当前无生产调用点）。
 * 说明：单图层的释放由 `forgetSourceSnapshot` 在 `removeUserLayer` 中完成，不要用本函数替代。
 */
export function clearSourceSnapshots(): void {
    store.clear();
}
