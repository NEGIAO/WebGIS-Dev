/**
 * mapCommandAdapters.ts — Agent 地图指令适配器入口
 *
 * 实现已按引擎拆分：2D 见 ./mapCommand/olAdapter、3D 见 ./mapCommand/cesiumAdapter、
 * 公共校验与动画包装见 ./mapCommand/shared。本文件仅维持既有导入路径与导出面。
 */
export { createOlMapCommandAdapter } from './mapCommand/olAdapter';
export { createCesiumMapCommandAdapter } from './mapCommand/cesiumAdapter';
export type { MapCommandResult, RuntimeMapState } from './mapCommand/shared';
