/**
 * zIndexBands.ts
 *
 * OL 图层 z-index 显示带（SSOT：全仓唯一 zIndex 常量来源）。
 *
 * 分层方案（值越大越在上层）：
 * - 底图瓦片带  0~99    底图影像
 * - 在线服务带  100~149 WMS/ArcGIS 注册表（容量见 REMOTE_CAPACITY = 50）
 * - 卷帘对比带  120~    底图带内卷帘对比层（沿用历史偏移，见 Z_BASEMAP_SWIPE_OFFSET）
 * - 标注瓦片带  150~199 显式声明 zBand: 'label' 的底图层
 * - 数据几何带  200~599 用户数据**几何**（面/线/点，不含文字）
 * - 数据标注带  700~849 用户数据**文字标注**（与几何分离渲染）
 * - 区划边界带  850      行政区划
 * - 系统叠加带  900+     经纬网/定位/罗盘等
 *
 * 层序（用户需求，V3.7.10 调整）：
 *   底图影像 < 在线服务 < 注记瓦片 < 数据几何 < 数据标注
 *   → 底图注记只压住影像本身，用户导入的几何与属性文字始终显示在注记之上。
 *   （V3.6.6~V3.7.9 曾为「数据几何 < 瓦片注记 < 数据标注」的夹心方案，已废弃）
 *
 * 带内顺序：由**可见**底图层在列表中的先后决定，列表靠前 = 带内更高 z。
 * 见 allocateBasemapZIndex —— 仅对可见项编号，避免全量列表长度（当前 110 项）
 * 撑爆只有 50 槽位的标注瓦片带。
 *
 * 托管矢量层拆成 geometry + label 两层（见 useCreateManagedVectorLayer）：
 * 几何层 zIndex ∈ DATA，标注层 zIndex ∈ DATA_LABEL，TOC 顺序同步刷新。
 */

/** 各显示带的基准值 */
export const Z_BAND = {
    BASEMAP: 0,
    REMOTE_SERVICES: 100,
    DATA: 200,
    LABEL: 150,
    DATA_LABEL: 700,
    DISTRICT: 850,
    SYSTEM: 900,
};

/**
 * 底图带内卷帘对比层的起始偏移。
 * ⚠️ 与在线服务带尾部（100~149，见 olRemoteServiceAdapter 的 REMOTE_CAPACITY）
 * 在 120~149 区间重叠，属既有问题；本次仅校正注释未改数值，
 * 处置方案见 Docs/TODO/bugfix-optimization-plan.md。
 */
export const Z_BASEMAP_SWIPE_OFFSET = 120;

/**
 * 按底图列表分配带内 zIndex。
 *
 * 功能：把「列表中可见的底图层」映射为带内 zIndex，列表靠前的可见层取更高 z。
 * 参数：
 *   - list：底图列表，每项至少含 `{ id, visible }`
 *   - resolveZBand：按 id 查 `zBand` 的回调（'label' 归标注瓦片带，其余归底图带）
 * 返回：`Map<layerId, zIndex>`，**仅含可见项**；不可见项由调用方回落至带基准值。
 * 核心逻辑：先按带分组收集可见项，再以组内序号倒序编号
 *   （offset = 组内可见数 - 1 - 组内序号），故偏移恒小于组内可见数，不会越带。
 */
export function allocateBasemapZIndex(
    list: Array<{ id: string; visible?: boolean }>,
    resolveZBand: (id: string) => string | undefined,
): Map<string, number> {
    const result = new Map<string, number>();
    const bands: Record<'basemap' | 'label', string[]> = { basemap: [], label: [] };

    (Array.isArray(list) ? list : []).forEach((item) => {
        if (!item?.id || !item.visible) return;
        const band = resolveZBand(item.id) === 'label' ? 'label' : 'basemap';
        bands[band].push(String(item.id));
    });

    bands.basemap.forEach((id, index, arr) => {
        result.set(id, Z_BAND.BASEMAP + (arr.length - 1 - index));
    });
    bands.label.forEach((id, index, arr) => {
        result.set(id, Z_BAND.LABEL + (arr.length - 1 - index));
    });

    return result;
}
