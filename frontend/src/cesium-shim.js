/**
 * cesium-shim.js — Cesium ESM 垫片
 *
 * 将各模块的 `import { ... } from "cesium"` 桥接到 CDN 全局 window.Cesium。
 * Vite alias 将 "cesium" 解析至此文件，所有导出均为惰性 Proxy。
 *
 * ## 加载时序
 * 模块顶层立即注入 <script>（Cesium CDN），暴露 cesiumReady Promise。
 * cesiumRuntime.js 的 loadCesiumRuntime() 内部 `await cesiumReady` 保证
 * Cesium 就位后才继续。cesium-navigation / cesium-wind-layer 源码已内嵌
 * 到 components/Cesium/ 下，模块级构造器已改为惰性 getter。
 *
 * ## 设计要点
 * - CDN 注入在模块求值时同步触发（createElement + appendChild），
 *   但下载是异步的；cesiumReady 作为栅栏保证业务代码不抢先。
 * - 不阻塞非 Cesium 页面：只有 CesiumContainer 懒加载链路上的模块
 *   才会触发本文件的 import，首页完全不加载 Cesium。
 * - knockout 补丁（track / cesiumSvgPath）在此文件中完成，
 *   cesium-navigation 控件依赖这些扩展。
 */
import knockout from 'knockout';

// ==========================================
// 公共常量
// ==========================================
export const CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.132/Build/Cesium/';

// ==========================================
// Cesium CDN 自动加载
// ==========================================
const CESIUM_CDN_URL = `${CESIUM_BASE_URL}Cesium.js`;

let _cesiumReadyResolve;
let _cesiumReadyReject;
const cesiumReady = new Promise((resolve, reject) => {
    _cesiumReadyResolve = resolve;
    _cesiumReadyReject = reject;
});

(function injectCesiumCDN() {
    if (document.getElementById('cesium-shim-autoload')) return;

    // Cesium 依赖此全局变量解析 Worker / 静态资源路径，必须在脚本加载前设置
    if (!window.CESIUM_BASE_URL) {
        window.CESIUM_BASE_URL = CESIUM_BASE_URL;
    }

    const script = document.createElement('script');
    script.id = 'cesium-shim-autoload';
    script.src = CESIUM_CDN_URL;
    script.onload = () => {
        console.info('[cesium-shim] Cesium CDN 加载完成');
        _cesiumReadyResolve();
    };
    script.onerror = () => {
        const err = new Error('[cesium-shim] Cesium CDN 加载失败');
        console.error(err);
        _cesiumReadyReject(err);
    };
    document.head.appendChild(script);
})();

export { cesiumReady };

// ==========================================
// Knockout 补丁（cesium-navigation 控件依赖）
// ==========================================
// cesium-navigation 内部使用 Knockout 绑定视图模型。
// Cesium ≥1.104 移除了内置 knockout 导出，因此独立 npm 包需要以下补丁。

// knockout.track() — 旧版 Cesium 内置的 knockout-es5 扩展，独立包不含此方法
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

// cesiumSvgPath binding handler — 渲染罗盘/缩放按钮的 SVG 图标
if (!knockout.bindingHandlers.cesiumSvgPath) {
    knockout.bindingHandlers.cesiumSvgPath = {
        update(element, valueAccessor) {
            const value = knockout.unwrap(valueAccessor());
            const path = knockout.unwrap(value.path);
            const viewBoxWidth = knockout.unwrap(value.width) || 16;
            const viewBoxHeight = knockout.unwrap(value.height) || 16;

            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
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

// ==========================================
// 惰性代理工厂
// ==========================================

/**
 * 获取 window.Cesium。如果 CDN 尚未加载，给出指向 cesiumReady 的报错。
 * @returns {object}
 */
function getCesium() {
    const C = window.Cesium;
    if (!C) {
        throw new Error(
            '[cesium-shim] window.Cesium 未就绪。' +
            '请确保调用方已 `await import("cesium").cesiumReady` 或通过 cesiumRuntime 等待 CDN 加载完毕。'
        );
    }
    return C;
}

/**
 * 创建一个可调用、可构造的惰性 Proxy。
 * - new Proxy() → new window.Cesium[name](...)
 * - Proxy()     → window.Cesium[name](...)
 * - Proxy.prop  → window.Cesium[name].prop
 *
 * @param {string} name - Cesium 全局对象上的键名
 * @returns {Proxy}
 */
function createLazyExport(name) {
    return new Proxy(function () {}, {
        construct(_target, args) {
            const C = getCesium();
            const Real = C[name];
            if (typeof Real !== 'function') {
                throw new TypeError(`[cesium-shim] window.Cesium.${name} 不是构造函数`);
            }
            return new Real(...args);
        },
        apply(_target, _thisArg, args) {
            const C = getCesium();
            const fn = C[name];
            if (typeof fn !== 'function') {
                throw new TypeError(`[cesium-shim] window.Cesium.${name} 不可调用`);
            }
            return fn(...args);
        },
        get(_target, prop) {
            // Symbol（如 Symbol.toPrimitive）直接返回 undefined，避免干扰引擎内部操作
            if (typeof prop === 'symbol') return undefined;

            const C = getCesium();
            const val = C[name];
            if (val === undefined) {
                console.warn(`[cesium-shim] window.Cesium.${name} 不存在，可能版本不兼容`);
                return undefined;
            }
            const member = val[prop];
            // 方法是函数时绑定 this 确保正确上下文
            return typeof member === 'function' ? member.bind(val) : member;
        },
    });
}

// ==========================================
// 命名导出 — PlayerController 依赖
// ==========================================
export const Cartesian3 = createLazyExport('Cartesian3');
export const Cartographic = createLazyExport('Cartographic');
export const Math = createLazyExport('Math');
export const Matrix3 = createLazyExport('Matrix3');
export const Matrix4 = createLazyExport('Matrix4');
export const Quaternion = createLazyExport('Quaternion');
export const Transforms = createLazyExport('Transforms');
export const HeadingPitchRoll = createLazyExport('HeadingPitchRoll');
export const Model = createLazyExport('Model');
export const ModelAnimationLoop = createLazyExport('ModelAnimationLoop');
export const Primitive = createLazyExport('Primitive');
export const GeometryInstance = createLazyExport('GeometryInstance');
export const Geometry = createLazyExport('Geometry');
export const GeometryAttribute = createLazyExport('GeometryAttribute');
export const ComponentDatatype = createLazyExport('ComponentDatatype');
export const PrimitiveType = createLazyExport('PrimitiveType');
export const BoundingSphere = createLazyExport('BoundingSphere');
export const ColorGeometryInstanceAttribute = createLazyExport('ColorGeometryInstanceAttribute');
export const Color = createLazyExport('Color');
export const PerInstanceColorAppearance = createLazyExport('PerInstanceColorAppearance');
export const ScreenSpaceEventHandler = createLazyExport('ScreenSpaceEventHandler');
export const ScreenSpaceEventType = createLazyExport('ScreenSpaceEventType');
export const KeyboardEventModifier = createLazyExport('KeyboardEventModifier');
export const sampleTerrainMostDetailed = createLazyExport('sampleTerrainMostDetailed');
export const sampleTerrain = createLazyExport('sampleTerrain');

// ==========================================
// 命名导出 — cesium-navigation 依赖
// ==========================================
export const defined = createLazyExport('defined');
export const DeveloperError = createLazyExport('DeveloperError');
export const Event = createLazyExport('Event');
export const EventHelper = createLazyExport('EventHelper');
export const getTimestamp = createLazyExport('getTimestamp');
export const getElement = createLazyExport('getElement');
export const SceneMode = createLazyExport('SceneMode');
export const Cartesian2 = createLazyExport('Cartesian2');
export const HeadingPitchRange = createLazyExport('HeadingPitchRange');
export const EllipsoidGeodesic = createLazyExport('EllipsoidGeodesic');
export const Camera = createLazyExport('Camera');
export const Rectangle = createLazyExport('Rectangle');
export const Ray = createLazyExport('Ray');
export const IntersectionTests = createLazyExport('IntersectionTests');
export const ReferenceFrame = createLazyExport('ReferenceFrame');

// Cesium ≥1.104 移除了内置 knockout，本文件从 npm 独立提供并补丁
export { knockout };

// ==========================================
// 命名导出 — cesium-wind-layer 依赖
// ==========================================
export const PixelDatatype = createLazyExport('PixelDatatype');
export const PixelFormat = createLazyExport('PixelFormat');
export const Sampler = createLazyExport('Sampler');
export const Texture = createLazyExport('Texture');
export const TextureMagnificationFilter = createLazyExport('TextureMagnificationFilter');
export const TextureMinificationFilter = createLazyExport('TextureMinificationFilter');
export const FrameRateMonitor = createLazyExport('FrameRateMonitor');
export const ShaderSource = createLazyExport('ShaderSource');
export const GeometryAttributes = createLazyExport('GeometryAttributes');
export const Appearance = createLazyExport('Appearance');
export const TextureWrap = createLazyExport('TextureWrap');
export const VertexArray = createLazyExport('VertexArray');
export const BufferUsage = createLazyExport('BufferUsage');
export const ClearCommand = createLazyExport('ClearCommand');
export const Pass = createLazyExport('Pass');
export const Framebuffer = createLazyExport('Framebuffer');
export const ShaderProgram = createLazyExport('ShaderProgram');
export const DrawCommand = createLazyExport('DrawCommand');
export const RenderState = createLazyExport('RenderState');
export const ComputeCommand = createLazyExport('ComputeCommand');
export const destroyObject = createLazyExport('destroyObject');

// 默认导出：惰性 Proxy 代理完整 Cesium 对象
// 支持 import Cesium from "cesium"; Cesium.Viewer / Cesium.Cartesian3 等访问
export default new Proxy({}, {
    get(_target, prop) {
        const C = getCesium();
        // 对 Symbol 属性直接返回 undefined
        if (typeof prop === 'symbol') return undefined;
        return C[prop];
    },
    set(_target, prop, value) {
        const C = getCesium();
        C[prop] = value;
        return true;
    },
    has(_target, prop) {
        const C = getCesium();
        return prop in C;
    },
});