/**
 * cesium-shim.js
 * Cesium ESM 垫片：将 `import { ... } from "cesium"` 映射到 window.Cesium（CDN 全局变量）。
 * cesium-player-controller 等 npm 包通过标准 ESM 导入 Cesium，而本项目通过 CDN 加载。
 * Vite alias 将 "cesium" 模块解析到此文件，桥接两种加载方式。
 */
const C = window.Cesium;
if (!C) {
    throw new Error('[cesium-shim] window.Cesium 未找到，请确保 Cesium CDN 已加载');
}

// 命名导出：覆盖 cesium-player-controller 使用的所有 Cesium API
export const Cartesian3 = C.Cartesian3;
export const Cartographic = C.Cartographic;
export const Math = C.Math;
export const Matrix3 = C.Matrix3;
export const Matrix4 = C.Matrix4;
export const Quaternion = C.Quaternion;
export const Transforms = C.Transforms;
export const HeadingPitchRoll = C.HeadingPitchRoll;
export const Model = C.Model;
export const ModelAnimationLoop = C.ModelAnimationLoop;
export const Primitive = C.Primitive;
export const GeometryInstance = C.GeometryInstance;
export const Geometry = C.Geometry;
export const GeometryAttribute = C.GeometryAttribute;
export const ComponentDatatype = C.ComponentDatatype;
export const PrimitiveType = C.PrimitiveType;
export const BoundingSphere = C.BoundingSphere;
export const ColorGeometryInstanceAttribute = C.ColorGeometryInstanceAttribute;
export const Color = C.Color;
export const PerInstanceColorAppearance = C.PerInstanceColorAppearance;
export const ScreenSpaceEventHandler = C.ScreenSpaceEventHandler;
export const ScreenSpaceEventType = C.ScreenSpaceEventType;
export const KeyboardEventModifier = C.KeyboardEventModifier;
export const sampleTerrainMostDetailed = C.sampleTerrainMostDetailed;
export const sampleTerrain = C.sampleTerrain;

// 默认导出：完整 Cesium 对象
export default C;
