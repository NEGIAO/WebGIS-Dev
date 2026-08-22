/**
 * cesium-shim.js — Cesium ESM 垫片
 *
 * 将各模块的 `import { ... } from "cesium"` 桥接到 CDN 全局 window.Cesium。
 * Vite alias 将 "cesium" 解析至此文件，所有导出均为惰性 Proxy。
 *
 * ## 加载时序
 * 模块顶层立即注入 <script>（Cesium CDN），暴露 cesiumReady Promise。
 * cesiumRuntime.js 的 loadCesiumRuntime() 内部 `await cesiumReady` 保证
 * Cesium 就位后才继续。cesium-navigation / cesium-wind-layer 源码仍在
 * components/Cesium/ 迁移期 legacy 模块中，模块级构造器已改为惰性 getter。
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
import { CESIUM_ASSET_ATTEMPT_TIMEOUT_MS, CESIUM_ASSET_BASE_URLS } from './config/publicRuntime';

// ==========================================
// 公共常量与资源候选链
// ==========================================
/**
 * 静态资源候选源(按序尝试,前一个失败/超时自动切下一个)。
 * 当前为本地自托管单源:public/cesium/ 随站点部署(GitHub Pages + Cloudflare),
 * 不再依赖公共 CDN。Workers/Assets/Widgets 子资源均从 window.CESIUM_BASE_URL 解析,
 * 每次尝试前必须先把该全局指到当前候选,保证与主脚本同源。
 */
const CESIUM_CDN_CANDIDATES = CESIUM_ASSET_BASE_URLS.map((base, index) => ({
    name: index === 0 ? 'primary' : `fallback-${index}`,
    base,
}));

/** 单个候选源的加载超时(ms):超时视为失败切换下一源(挂起连接不会触发 onerror) */
const CDN_ATTEMPT_TIMEOUT_MS = CESIUM_ASSET_ATTEMPT_TIMEOUT_MS;

/** 兼容旧 API:主源静态基址(运行时实际生效源请用 getActiveCesiumBaseUrl) */
export const CESIUM_BASE_URL = CESIUM_CDN_CANDIDATES[0].base;

let activeCesiumBaseUrl = CESIUM_BASE_URL;

/**
 * 获取实际加载成功的 CDN 基址(widgets.css 等子资源必须与主脚本同源)
 * @returns {string}
 */
export function getActiveCesiumBaseUrl() {
    return activeCesiumBaseUrl;
}

// ==========================================
// Cesium CDN 自动加载(多源回退)
// ==========================================
let _cesiumReadyResolve;
let _cesiumReadyReject;
const cesiumReady = new Promise((resolve, reject) => {
    _cesiumReadyResolve = resolve;
    _cesiumReadyReject = reject;
});

(function injectCesiumCDN() {
    if (document.getElementById('cesium-shim-autoload')) return;

    /**
     * 依次尝试候选源:成功 → resolve cesiumReady;失败/超时 → 清理后试下一个;
     * 全部失败 → reject(与旧单源失败行为一致,由调用方兜底)。
     * @param {number} index - 当前候选下标
     */
    function attemptLoad(index) {
        if (index >= CESIUM_CDN_CANDIDATES.length) {
            const err = new Error('[cesium-shim] 所有 Cesium CDN 候选源均加载失败');
            // 错误由 cesiumReady reject 链路上抛,由 cesiumRuntime/CesiumContainer boot 以 message toast 兜底,此处不再重复 console.error
            // console.error(err);
            _cesiumReadyReject(err);
            return;
        }

        const candidate = CESIUM_CDN_CANDIDATES[index];
        // Cesium 依赖此全局解析 Worker / 静态资源路径,必须在脚本加载前指向当前候选
        activeCesiumBaseUrl = candidate.base;
        window.CESIUM_BASE_URL = candidate.base;

        const script = document.createElement('script');
        script.id = 'cesium-shim-autoload';
        script.src = `${candidate.base}Cesium.js`;

        let settled = false;
        const timer = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            console.warn(`[cesium-shim] ${candidate.name} 加载超时(${CDN_ATTEMPT_TIMEOUT_MS}ms),切换下一候选源`);
            script.remove();
            attemptLoad(index + 1);
        }, CDN_ATTEMPT_TIMEOUT_MS);

        script.onload = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            // eslint-disable-next-line no-console
            console.info(`[cesium-shim] Cesium CDN 加载完成(来源:${candidate.name})`);
            _cesiumReadyResolve();
        };
        script.onerror = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            console.warn(`[cesium-shim] ${candidate.name} 加载失败,切换下一候选源`);
            script.remove();
            attemptLoad(index + 1);
        };
        document.head.appendChild(script);
    }

    attemptLoad(0);
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
        // 打印调用栈定位是哪条代码路径在 CDN 就绪前触碰了惰性导出
        console.error('[cesium-shim] window.Cesium 未就绪，触发调用栈：', new Error().stack);
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

// ==========================================
// 命名导出 — I3S / 远程 3D 服务加载
// ==========================================
export const I3SDataProvider = createLazyExport('I3SDataProvider');

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