/**
 * zIndexBands.js
 *
 * OL 图层 z-index 显示带（SSOT：全仓唯一 zIndex 常量来源）。
 *
 * 分层方案（值越大越在上层）：
 * - 底图瓦片带  0~199   全部底图源（imagery/vector/terrain/theme/custom），
 *                       与底图数量无关，上限固定 → 底图源任意增加也不会压过数据带
 *                       其中 100~149 为在线服务子带（REMOTE_SERVICES）：WMS/ArcGIS
 *                       注册表图层恒高于常规底图、仍属底图语义；150~199 卷帘预留
 * - 数据图层带  200~799 用户操纵的一切图层（上传 TIF/矢量/绘制/路线/搜索聚合）。
 *                       不再按类型分带：TOC 数据管理中的拖拽顺序覆写默认层级——
 *                       由 useManagedLayerRegistry.refreshUserLayerZIndex 按
 *                       `Z_BAND.DATA + (N - 1 - index)` 反向映射（TOC 顶部 = zIndex 最高 = 最先显示）。
 *                       容量 600 层（200~799），超过需上移数据带或扩容
 * - 区划边界带  600     系统行政区划边界（= DATA + 400，数据层 ≤400 层时恒顶于数据）
 * - 标注瓦片带  800~899 全部 label 类底图（category === 'label'），恒置顶于全部数据层
 * - 系统叠加带  900+    经纬网 / 中心点 / 定位点 / 风水罗盘等系统层
 *
 * 约定：
 * - 数据带内部不预留类型子带：固定系统层（绘制临时层/搜索点/起终点）由 MapContainer
 *   Z_INDEX 常量从 Z_BAND.DATA 派生（如 DATA + 200），保持在数据带中部以上
 * - 底图带内 150~199 预留给卷帘对比层（需盖过常规底图但仍在数据带之下）
 */

/** 各显示带的基准值 */
export const Z_BAND = {
    BASEMAP: 0, // 底图瓦片带 0~199
    REMOTE_SERVICES: 100, // 在线服务子带 100~149（WMS/ArcGIS 注册表图层，容量 50）
    DATA: 200, // 数据图层统一带 200~799（TOC 拖拽顺序覆写类型分带）
    DISTRICT: 600, // 区划边界带（= DATA + 400，系统固定层）
    LABEL: 800, // 标注瓦片带 800~899
    SYSTEM: 900, // 系统叠加带 900+
};

/** 底图带内卷帘对比层的起始偏移（避开常规底图 0~149 区间） */
export const Z_BASEMAP_SWIPE_OFFSET = 150;
