/**
 * PlayerController 模块入口
 *
 * 集成自 cesium-player-controller（https://github.com/hh-hang/cesium-player-controller）
 * 提供第一/第三人称视角切换、胶囊体碰撞、动画系统、飞行模式等功能。
 *
 * 依赖：
 * - @dimforge/rapier3d-compat（物理碰撞引擎）
 * - @loaders.gl/core + @loaders.gl/gltf + @loaders.gl/draco（glTF 碰撞体解析）
 * - Cesium（通过 window.Cesium CDN 加载，Vite alias "cesium" → cesium-shim.js）
 */

// 核心控制器
export { playerController } from './playerController';

// 动态物体句柄
export { DynamicObject } from './dynamicObject';

// 类型定义
export * from './types';

// 子系统（高级用法，一般不需要直接访问）
export { LocalFrame } from './utils/frame';
export { PhysicsSystem, initRapier } from './systems/PhysicsSystem';
export { loadGltfGeometry, getGltfBboxSize } from './utils/gltfGeometry';
export { lerp, lerpCartesian3 } from './utils/math';
export { MobileControls } from './utils/mobileControls';
