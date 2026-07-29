/**
 * 瓦片源工厂 — barrel re-export
 *
 * 从 useTileSourceFactory.ts 拆分（原 1099 行）：
 *   types.ts       — 类型定义与常量
 *   urlUtils.ts    — URL 工具函数
 *   tileLifecycle.ts — 请求生命周期管理
 *   wmsSource.ts   — WMS 源创建
 *   wmtsSource.ts  — WMTS 源创建
 *   xyzSource.ts   — XYZ 源 + 自动检测编排器
 */

export * from './types';
export * from './urlUtils';
export * from './tileLifecycle';
export * from './wmsSource';
export * from './wmtsSource';
export * from './xyzSource';
