/**
 * zIndexBands.js
 *
 * OL 图层 z-index 显示带（SSOT：全仓唯一 zIndex 常量来源）。
 *
 * 分层方案（值越大越在上层）：
 * - 底图瓦片带  0~99    底图影像
 * - 在线服务带  100~119 WMS/ArcGIS 注册表
 * - 数据几何带  200~599 用户数据**几何**（面/线/点，不含文字）
 * - 标注瓦片带  600~699 label 类底图（category === 'label'）
 * - 数据标注带  700~849 用户数据**文字标注**（与几何分离渲染）
 * - 区划边界带  850      行政区划
 * - 系统叠加带  900+     经纬网/定位/罗盘等
 *
 * 夹心关系（用户需求）：
 *   数据几何 < 瓦片标注 < 数据标注
 *   → 底图注记压住建筑填色，但建筑名/注记文字仍显示在注记之上。
 *
 * 托管矢量层拆成 geometry + label 两层（见 useCreateManagedVectorLayer）：
 * 几何层 zIndex ∈ DATA，标注层 zIndex ∈ DATA_LABEL，TOC 顺序同步刷新。
 */

/** 各显示带的基准值 */
export const Z_BAND = {
    BASEMAP: 0,
    REMOTE_SERVICES: 100,
    DATA: 200,
    LABEL: 600,
    DATA_LABEL: 700,
    DISTRICT: 850,
    SYSTEM: 900,
};

/** 底图带内卷帘对比层的起始偏移（避开底图/在线服务 0~119，仍在数据几何之下） */
export const Z_BASEMAP_SWIPE_OFFSET = 120;
