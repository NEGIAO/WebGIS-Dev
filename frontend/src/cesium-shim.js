/**
 * cesium-shim.js
 * Cesium ESM 垫片：将 `import { ... } from "cesium"` 映射到 window.Cesium（CDN 全局变量）。
 * cesium-player-controller / cesium-navigation-es6 等 npm 包通过标准 ESM 导入 Cesium，
 * 而本项目通过 CDN 加载。Vite alias 将 "cesium" 模块解析到此文件，桥接两种加载方式。
 *
 * ⚠️ 加载时序保证：
 * 本模块在顶层立即注入 Cesium CDN <script>，并暴露 cesiumReady Promise。
 * cesiumRuntime.js 的 loadCesiumRuntime() 内部 `await cesiumReady` 确保 CDN 就位后再继续。
 * cesium-navigation / cesium-wind-layer 源码已内嵌到 components/Cesium/ 目录下，
 * 模块级 new CesiumClass() 已改为惰性 getter，无模块级 Cesium 访问。
 * 因此本方案可消除 dev/build 下的竞态问题。
 */
import knockout from 'knockout';

// ==========================================
// Cesium CDN 自动加载：模块顶层立即注入 <script>
// ==========================================
const CESIUM_CDN_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.132/Build/Cesium/Cesium.js';

let _cesiumReadyResolve;
let _cesiumReadyReject;
const cesiumReady = new Promise((resolve, reject) => {
    _cesiumReadyResolve = resolve;
    _cesiumReadyReject = reject;
});

(function injectCesiumCDN() {
    // 防止 cesiumRuntime.js 或其他地方已注入同 ID 脚本
    if (document.getElementById('cesium-shim-autoload')) return;

    // 必须在 Cesium.js 加载前设置，否则 Cesium 内部的 Worker 等资源路径会解析错误
    if (!window.CESIUM_BASE_URL) {
        window.CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.132/Build/Cesium/';
    }

    const script = document.createElement('script');
    script.id = 'cesium-shim-autoload';
    script.src = CESIUM_CDN_URL;
    script.onload = () => {
        console.info('[cesium-shim] Cesium CDN loaded, window.Cesium ready');
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

/**
 * 获取 window.Cesium（惰性求值，首次访问时才检查）。
 * 模块顶层启动 CDN 注入后，调用方应 `await cesiumReady` 确保 Cesium 就位。
 * @returns {object} Cesium 全局对象
 */
function getCesium() {
    const C = window.Cesium;
    if (!C) {
        throw new Error(
            '[cesium-shim] window.Cesium 未找到。' +
            '请在调用处先 `await cesiumReady`（从 cesium-shim 导入），' +
            '确保 Cesium CDN 已加载完毕再使用。'
        );
    }
    return C;
}

/**
 * 创建可调用 + 可构造的惰性代理。
 * 解决 import { Cartesian3 } from "cesium" 后执行 new Cartesian3() / Cartesian3.fromDegrees() 等模式。
 * 
 * Proxy 拦截策略：
 *  - construct：  new CesiumProxy() → 转发到 new window.Cesium[name]()
 *  - apply：      CesiumProxy() → 转发到 window.Cesium[name]()
 *  - get：        CesiumProxy.staticMethod → 返回 window.Cesium[name].staticMethod
 *
 * @param {string} name - Cesium 全局对象上的属性名
 * @returns {Proxy} 可调用、可构造的惰性包装器
 */
function createLazyExport(name) {
    return new Proxy(function () {}, {
        /** 支持 new 调用（如 new Cartesian3(x, y, z)） */
        construct(_target, args) {
            const C = getCesium();
            const Real = C[name];
            if (typeof Real !== 'function') {
                throw new TypeError(`[cesium-shim] window.Cesium.${name} 不是构造函数`);
            }
            return new Real(...args);
        },
        /** 支持普通函数调用（如 sampleTerrain(...)） */
        apply(_target, _thisArg, args) {
            const C = getCesium();
            const fn = C[name];
            if (typeof fn !== 'function') {
                throw new TypeError(`[cesium-shim] window.Cesium.${name} 不可调用`);
            }
            return fn(...args);
        },
        /** 支持静态属性访问（如 Matrix4.IDENTITY, Cartesian3.fromDegrees） */
        get(_target, prop) {
            const C = getCesium();
            const val = C[name];
            if (val === undefined) {
                console.warn(`[cesium-shim] window.Cesium.${name} 不存在，可能版本不兼容`);
                return undefined;
            }
            // 对 Symbol 属性（如 Symbol.toPrimitive）直接返回 undefined 避免报错
            if (typeof prop === 'symbol') return undefined;
            const member = val[prop];
            // 如果是函数，绑定 this 上下文确保正确调用
            if (typeof member === 'function') {
                return member.bind(val);
            }
            return member;
        },
    });
}

// ==========================================
// 命名导出：cesium-player-controller（惰性代理）
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
// 命名导出：cesium-navigation-es6（惰性代理）
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

// Cesium ≥1.104 移除了内置 knockout 导出，从 npm 包独立提供
export { knockout };

// ==========================================
// 命名导出：cesium-wind-layer（惰性代理）
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