/**
 * 瓦片源工厂 — barrel re-export
 *
 * 原 1099 行已按职责拆分到 tileSource/ 子目录：
 *   tileSource/types.ts        — 类型定义与常量
 *   tileSource/urlUtils.ts     — URL 工具函数
 *   tileSource/tileLifecycle.ts — 请求生命周期管理
 *   tileSource/wmsSource.ts    — WMS 源创建
 *   tileSource/wmtsSource.ts   — WMTS 源创建
 *   tileSource/xyzSource.ts    — XYZ 源 + 自动检测编排器
 *
 * 所有原有 import 路径保持不变。
 */

export * from './tileSource/index';
