/**
 * cesium-shim.js
 * Cesium ESM 垫片：将 `import { ... } from "cesium"` 映射到 window.Cesium（CDN 全局变量）。
 * cesium-player-controller / cesium-navigation-es6 等 npm 包通过标准 ESM 导入 Cesium，
 * 而本项目通过 CDN 加载。Vite alias 将 "cesium" 模块解析到此文件，桥接两种加载方式。
 */
import knockout from 'knockout';

// cesium-navigation-es6 依赖 Knockout.track()（旧版 Cesium 内置的 knockout-es5 扩展）。
// 独立 knockout 包不含此方法，需手动补丁。
if (!knockout.track) {
    knockout.track = function (obj, propertyNames) {
        if (!propertyNames) return;
        propertyNames.forEach((name) => {
            const observable = knockout.observable(obj[name]);
            Object.defineProperty(obj, name, {
                get: observable,
                set: observable,
                enumerable: true,
                configurable: true,
            });
        });
    };
}

// 旧版 Cesium 注册的 cesiumSvgPath knockout binding handler（用于渲染罗盘/缩放 SVG 图标）。
// Cesium ≥1.104 移除内置 knockout 后此 handler 不再存在，需手动补注册。
if (!knockout.bindingHandlers.cesiumSvgPath) {
    knockout.bindingHandlers.cesiumSvgPath = {
        update(element, valueAccessor) {
            const value = knockout.unwrap(valueAccessor());
            const path = knockout.unwrap(value.path);
            const viewBoxWidth = knockout.unwrap(value.width) || 16;
            const viewBoxHeight = knockout.unwrap(value.height) || 16;

            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            
            // 💡 增加标识 class，便于 CSS 高优先级覆盖
            svg.setAttribute('class', 'cesium-nav-svg');
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.display = 'block';
            svg.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

            const pathEl = document.createElementNS(svgNS, 'path');
            pathEl.setAttribute('d', path);
            pathEl.setAttribute('fill', 'currentColor');
            svg.appendChild(pathEl);

            element.innerHTML = '';
            element.appendChild(svg);
        },
    };
}

const C = window.Cesium;
if (!C) {
    throw new Error('[cesium-shim] window.Cesium 未找到，请确保 Cesium CDN 已加载');
}

// ==========================================
// 命名导出：cesium-player-controller
// ==========================================
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

// ==========================================
// 命名导出：cesium-navigation-es6
// ==========================================
export const defined = C.defined;
export const DeveloperError = C.DeveloperError;
export const Event = C.Event;
export const EventHelper = C.EventHelper;
export const getTimestamp = C.getTimestamp;
export const getElement = C.getElement;
export const SceneMode = C.SceneMode;
export const Cartesian2 = C.Cartesian2;
export const HeadingPitchRange = C.HeadingPitchRange;
export const EllipsoidGeodesic = C.EllipsoidGeodesic;
export const Camera = C.Camera;
export const Rectangle = C.Rectangle;
export const Ray = C.Ray;
export const IntersectionTests = C.IntersectionTests;
export const ReferenceFrame = C.ReferenceFrame;

// Cesium ≥1.104 移除了内置 knockout 导出，从 npm 包独立提供
export { knockout };

// 默认导出：完整 Cesium 对象
export default C;