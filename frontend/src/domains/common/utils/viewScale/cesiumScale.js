/**
 * viewScale/cesiumScale.js — Cesium 侧尺度计算
 *
 * 规范来源：Docs/TODO/ol2cesium.md §10~§14/§19~§22
 *
 * 两层实现：
 * 1. 解析模型（纯数学）：nadir 精确式 + 倾斜斜距近似 —— 零渲染开销，
 *    用于实时同步与可测试性。
 * 2. 射线测量（浏览器注入 pickRay/globePick）：任意 pitch / Terrain 下
 *    的"真实地面分辨率"，用于模式切换结束后的 Precision 校正。
 */

import {
    DEFAULT_FOVY_RAD,
    DEFAULT_PIXEL_DELTA,
    DEFAULT_VIEWPORT_HEIGHT,
    EARTH_RADIUS,
} from './constants.js';

/**
 * 正俯视（pitch = -90°）：相机高度 → 地面分辨率
 *   G = 2·h·tan(fovY/2) / viewportHeight
 * @param {object} p
 * @param {number} p.height            相机离地高度（米）
 * @param {number} [p.fovY=60°]        垂直视场角（弧度）
 * @param {number} [p.viewportHeight]  视口高度（像素）
 */
export function cesiumNadirHeightToGroundResolution({ height, fovY = DEFAULT_FOVY_RAD, viewportHeight }) {
    const vh = viewportHeight > 0 ? viewportHeight : 768;
    return (2 * height * Math.tan(fovY / 2)) / vh;
}

/**
 * 正俯视：地面分辨率 → 相机高度（规范 §18 公式的直接实现）
 *   h = G · viewportHeight / (2·tan(fovY/2))
 */
export function groundResolutionToCesiumHeight({
    groundResolution,
    fovY = DEFAULT_FOVY_RAD,
    viewportHeight,
}) {
    const vh = viewportHeight > 0 ? viewportHeight : 768;
    return (groundResolution * vh) / (2 * Math.tan(fovY / 2));
}

/**
 * 任意 pitch（解析近似，平面地表假设）：
 *   nadir 角 θ = |pitch − (−90°)|；斜距 S = h/cosθ
 *   G = 2·S·tan(fovY/2) / viewportHeight
 *
 * 适用范围：θ ≤ 60°、近地小范围（曲率忽略）。超限请走射线测量。
 */
export function cesiumCameraToGroundResolution({
    height,
    pitch = -90,
    fovY = DEFAULT_FOVY_RAD,
    viewportHeight,
}) {
    const thetaDeg = Math.min(60, Math.abs(pitch + 90));
    const cosTheta = Math.cos((thetaDeg * Math.PI) / 180);
    const slant = height / Math.max(cosTheta, 1e-6);
    const vh = viewportHeight > 0 ? viewportHeight : 768;
    return (2 * slant * Math.tan(fovY / 2)) / vh;
}

/**
 * 任意 pitch：目标地面分辨率 → 所需相机高度（解析逆变换）
 */
export function groundResolutionToTiltedCameraHeight({
    groundResolution,
    pitch = -90,
    fovY = DEFAULT_FOVY_RAD,
    viewportHeight,
    earthModel = 'flat',
    earthRadius = EARTH_RADIUS,
}) {
    const thetaDeg = Math.min(60, Math.abs(pitch + 90));
    const cosTheta = Math.cos((thetaDeg * Math.PI) / 180);
    const vh = viewportHeight > 0 ? viewportHeight : 768;

    // 平面解析解（Realtime 初值）
    const hFlat = (groundResolution * vh * cosTheta) / (2 * Math.tan(fovY / 2));

    if (earthModel !== 'sphere' || Math.abs(pitch + 90) > 1e-9) return hFlat;

    // ── 球面精确解（Precision）：正俯视下，中心+1px 的弦长测量 c(h) 与
    //    平面模型存在 O((h/R)·α²) 的固有系统差；因 c(h)/h 近似线性，
    //    用一次比例迭代即可将残差压到 ULP 级（规范 §34 步骤 10-12 的
    //    纯数学等价形式，零渲染开销）。
    const c0 = measureNadirSphereChord({ height: hFlat, fovY, viewportHeight, earthRadius });
    if (!Number.isFinite(c0) || c0 <= 0) return hFlat;
    const h1 = (hFlat * groundResolution) / c0;
    const c1 = measureNadirSphereChord({ height: h1, fovY, viewportHeight, earthRadius });
    if (!Number.isFinite(c1) || c1 <= 0) return h1;
    return (h1 * groundResolution) / c1;
}

/**
 * 正俯视球面弦长测量（规范 §11~§14 的纯数学镜像）：
 * 相机位于地心距 d=R+h 处正俯视，取屏幕中心与中心右移 1px 两条射线
 * 与球面（R=earthRadius）的交点，返回弦长（米/像素）。
 *
 * 与 browserAdapter.getCesiumGroundResolution 的浏览器实测在无 Terrain、
 * 正俯视下逐位一致（同一几何的闭式解），可在 Node/SSR 环境运行。
 *
 * @param {object} p
 * @param {number} p.height 相机离地高度（米）
 * @param {number} [p.fovY=DEFAULT_FOVY_RAD] 垂直视场角（弧度）
 * @param {number} [p.viewportHeight]
 * @param {number} [p.earthRadius=EARTH_RADIUS]
 * @returns {number} 地面分辨率（米/像素）
 */
export function measureNadirSphereChord({
    height,
    fovY = DEFAULT_FOVY_RAD,
    viewportHeight = DEFAULT_VIEWPORT_HEIGHT,
    earthRadius = EARTH_RADIUS,
}) {
    const vh = viewportHeight > 0 ? viewportHeight : 768;
    const d = earthRadius + Number(height);
    const halfW = Math.tan(fovY / 2);
    const alpha = Math.atan(((halfW * 2) / vh)); // 中心右移 1px 的离轴角（透视 atan 映射）
    const sinA = Math.sin(alpha);
    const cosA = Math.cos(alpha);
    const t = d * cosA - Math.sqrt(Math.max(0, earthRadius * earthRadius - d * d * sinA * sinA));
    const P2x = t * sinA;
    const P2y = d - t * cosA;
    return Math.hypot(P2x, P2y - earthRadius); // Cartesian3.distance 弦长
}

/**
 * 射线采样测量真实地面分辨率（规范 §11~§14）。
 * 全部 Cesium 依赖通过回调注入，本函数保持引擎无关、可在 Node 测试。
 *
 * @param {object} p
 * @param {number} p.canvasWidth
 * @param {number} p.canvasHeight
 * @param {Function} p.pickRay  (cartesian2) => ray
 * @param {Function} p.globePick (ray) => Cartesian3|null   globe.pick（含 Terrain）
 * @param {Function} p.distance (Cartesian3, Cartesian3) => number 米
 * @param {number} [p.deltaPixel=1]
 * @param {Array<[number,number]>} [p.candidatePoints] 归一化候选点，默认中心+四邻
 * @returns {{groundResolution:number, usedPoint:[number,number]}|null}
 */
export function measureCesiumGroundResolutionFromRays({
    canvasWidth,
    canvasHeight,
    pickRay,
    globePick,
    distance,
    deltaPixel = DEFAULT_PIXEL_DELTA,
    candidatePoints = [
        [0.5, 0.5],
        [0.5, 0.6],
        [0.5, 0.4],
        [0.6, 0.5],
        [0.4, 0.5],
    ],
}) {
    for (const [fx, fy] of candidatePoints) {
        const cx = fx * canvasWidth;
        const cy = fy * canvasHeight;

        const ray1 = pickRay({ x: cx, y: cy });
        const ray2 = pickRay({ x: cx + deltaPixel, y: cy });
        if (!ray1 || !ray2) continue;

        let p1;
        let p2;
        try {
            p1 = globePick(ray1);
            p2 = globePick(ray2);
        } catch {
            continue;
        }
        if (!p1 || !p2) continue;

        const d = distance(p1, p2);
        if (!Number.isFinite(d) || d <= 0) continue;

        return { groundResolution: d / deltaPixel, usedPoint: [cx, cy] };
    }
    return null;
}

/**
 * 二分求解相机高度（规范 §21）：目标地面分辨率 ↔ 高度。
 * 解析闭式已存在（groundResolutionToTiltedCameraHeight），本函数供
 * Terrain/射线实测场景以注入方式数值求解 —— 每次迭代经 setCameraHeight+
 * measure 回调，禁止在 mousemove/wheel 等高频事件中调用（规范 §42）。
 *
 * @param {object} p
 * @param {number} p.targetGroundResolution 目标地面分辨率（米/像素）
 * @param {(h:number)=>void} p.setCameraHeight 试探性设置相机高度
 * @param {()=>number|null} p.measure 测量当前实际地面分辨率
 * @param {number} [p.minHeight=1]
 * @param {number} [p.maxHeight=50000000]
 * @param {number} [p.toleranceRatio=1e-6] 相对容差
 * @param {number} [p.maxIterations=60]
 * @returns {number|null} 求得的高度；测量持续失败返回 null
 */
export function solveCameraHeightBinary({
    targetGroundResolution,
    setCameraHeight,
    measure,
    minHeight = 1,
    maxHeight = 50000000,
    toleranceRatio = 1e-6,
    maxIterations = 60,
}) {
    if (!(targetGroundResolution > 0)) return null;
    let low = minHeight;
    let high = maxHeight;
    let best = null;
    for (let i = 0; i < maxIterations; i++) {
        const mid = (low + high) / 2;
        setCameraHeight(mid);
        const measured = measure();
        if (!Number.isFinite(measured) || measured <= 0) {
            // 该分支不可测：收缩到下半区继续（高度更低更可能命中地面）
            high = mid;
            continue;
        }
        if (Math.abs(measured - targetGroundResolution) <= targetGroundResolution * toleranceRatio) {
            return mid;
        }
        if (measured < targetGroundResolution) low = mid;
        else high = mid;
        best = (low + high) / 2;
    }
    return best ?? null;
}
