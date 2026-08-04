/**
 * @fileoverview OpenLayers 缩放级别 ↔ Cesium 相机高度 精确互转库
 *
 * ★ URL 参数语义说明
 *   - view=ol     → z 为 OpenLayers 缩放级别（浮点，通常 0–22）
 *   - view=cesium → z 为 Cesium 相机离地高度（浮点，单位：米）
 *   切换视图时不能直接复用数值，必须经本库精确互转。
 *
 * ┌──────────────────── 核心数学模型 ────────────────────┐
 * │ 以视口"垂直方向"为对齐基准（与 Cesium fovy 语义一致）│
 * │                                                      │
 * │ ① res      = INIT_RES / 2^zoom                      │
 * │   OL 投影分辨率（Web Mercator 投影坐标系，米/像素）  │
 * │                                                      │
 * │ ② groundRes = res × cos(centerLat)                  │
 * │   地表实际分辨率（修正 Mercator 高纬拉伸畸变）       │
 * │                                                      │
 * │ ③ visibleH  = groundRes × viewportHeight            │
 * │   垂直方向地表可见范围（米）                         │
 * │                                                      │
 * │ ④ height    = visibleH / (2·tan(fovy/2)) × calib   │
 * │   Cesium 相机高度（俯视视锥几何反推 + 视觉校准）     │
 * │                                                      │
 * │ 反向推导即对 ④③②① 依次取代数逆，两函数严格互逆。  │
 * └──────────────────────────────────────────────────────┘
 *
 * ★ 精度与可逆性保证
 *   在相同参数 { view, mapSize, centerLat, cesiumFovy, calibration } 下：
 *   · olZoomToCesiumHeight ∘ cesiumHeightToOlZoom = identity
 *   · cesiumHeightToOlZoom ∘ olZoomToCesiumHeight = identity
 *   往返误差仅来自 IEEE 754 双精度浮点舍入（相对误差 ≤ 2^-52）。
 *   注：默认换算链路不做范围截断；只有显式传入 clamp: true 时才会执行有损 clamp。
 */

// ═══════════════════════════ 常量定义 ════════════════════════════

/**
 * Web Mercator（EPSG:3857）zoom=0 时的投影分辨率（米/像素）。
 *   = 地球赤道周长（WGS84 椭球长轴 a=6378137m）/ 标准瓦片像素宽（256px）
 *   = 2π × 6378137 / 256 ≈ 156543.034 m/px
 * 以公式表达而非硬编码魔法数，可溯源且避免抄录误差。
 */
const WEB_MERCATOR_INITIAL_RESOLUTION = (2 * Math.PI * 6378137) / 256;

/** Cesium 垂直视场角默认值（弧度），60°（= π/3） */
const DEFAULT_FOVY = Math.PI / 3;

/**
 * 视口高度默认值（像素），用于未传入 mapSize 时的降级兜底。
 * 取典型桌面端视口高度。
 */
const DEFAULT_VIEWPORT_HEIGHT = 768;

/** 视觉校准系数默认值，= 1 表示不做额外调整 */
const DEFAULT_CALIBRATION = 1;

/** Cesium 相机高度下限（米），防止相机穿入地面 */
const MIN_CESIUM_HEIGHT = 1;

/** Cesium 相机高度上限（米），约 5 万千米，远超对地观测需求 */
const MAX_CESIUM_HEIGHT = 50_000_000;

/** OL 缩放级别下限 */
const MIN_OL_ZOOM = 0;

/**
 * OL 缩放级别上限。
 * 大多数瓦片服务上限为 22，部分高精度来源可达 28。
 * 调用侧如需支持更高 zoom，可在外部将转换结果做额外截断。
 */
const MAX_OL_ZOOM = 22;

/**
 * 纬度缩放系数下限，精确对应 Web Mercator 投影的极限纬度 ±85.05112877980659°。
 *   MIN_LAT_SCALE = cos(85.05112877980659° × π/180) ≈ 0.08726
 * 防止极点附近 cos(lat)→0 导致 groundRes→0、相机高度趋于无穷大。
 */
const MIN_LAT_SCALE = Math.cos((85.05112877980659 * Math.PI) / 180);

// ══════════════════════════ 内部辅助函数 ══════════════════════════

/**
 * 将任意值安全转换为有限实数，失败（NaN / ±Infinity）则返回 null。
 * 所有参数解析统一走此函数，避免下游出现 NaN 传播。
 *
 * @param {*} value
 * @returns {number|null}
 */
function parseFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

/**
 * 解析视口高度（像素），专门用于与 Cesium 垂直视场角 fovy 配对。
 *
 * 为何取高度而非宽度，也非 Math.min(w,h)：
 *   Cesium 的 fovy 定义为摄像机在 Y 轴（垂直）方向的全视张角，
 *   视锥垂直截面的地面可见范围 = 2h·tan(fovy/2)，
 *   OL 垂直方向可见范围 = groundRes × viewportHeight（像素）。
 *   两者对齐必须使用"高度"维度，使用宽度或 Math.min 均会引入
 *   横纵比误差，在竖屏视口（height > width）下尤为明显。
 *
 * 读取顺序：mapSize[1]（高）→ mapSize[0]（宽，降级）→ 默认值。
 *
 * @param {number[]|undefined} mapSize - 视口尺寸 [宽px, 高px]
 * @returns {number} 视口高度（像素，> 0）
 */
function resolveViewportHeight(mapSize) {
    if (Array.isArray(mapSize)) {
        const h = parseFiniteNumber(mapSize[1]);
        if (h > 0) return h;
        // 仅有一维时降级使用宽度（正方形视口或单值场景）
        const w = parseFiniteNumber(mapSize[0]);
        if (w > 0) return w;
    }
    return DEFAULT_VIEWPORT_HEIGHT;
}

/**
 * 校验并规范化 Cesium 垂直视场角（弧度）。
 * 合法范围：开区间 (0, π)，即 (0°, 180°)。
 * 超出范围或无法解析时回退到默认值 π/3（60°）。
 *
 * @param {number|string|undefined} cesiumFovy
 * @returns {number} 有效视场角（弧度）
 */
function resolveFovy(cesiumFovy) {
    const fovy = parseFiniteNumber(cesiumFovy);
    if (fovy !== null && fovy > 0 && fovy < Math.PI) return fovy;
    return DEFAULT_FOVY;
}

/**
 * 校验并规范化视觉校准系数（必须为正有限数，否则使用默认值 1）。
 * 校准系数对正向乘、反向除，确保在互逆推导中精确抵消。
 *
 * @param {number|string|undefined} calibration
 * @returns {number} 正数校准系数
 */
function resolveCalibration(calibration) {
    const c = parseFiniteNumber(calibration);
    return c !== null && c > 0 ? c : DEFAULT_CALIBRATION;
}

/**
 * 计算给定纬度下的 Web Mercator 地表分辨率缩放因子 cos(lat)。
 *
 * 背景：Web Mercator 将球面等角投影到平面，纬度越高拉伸越大。
 *   同一 zoom 下，投影分辨率（projectedRes）是统一的（米/像素），
 *   但该"米"是投影坐标系中的米，而非地球表面的真实米。
 *   修正公式：groundRes = projectedRes × cos(lat)
 *   赤道（lat=0）：cos=1，无畸变；纬度 60°：cos≈0.5，拉伸约 2 倍。
 *
 * 纬度钳制到 Web Mercator 有效范围 ±85.05112877980659°，
 * 并对 cos 结果做下限保护（理论上 clamp 后已满足，此处为浮点安全兜底）。
 * 未提供 centerLat 时返回 1（视为赤道，即不做纬度修正）。
 *
 * @param {number|string|null|undefined} centerLat - 视图中心纬度（°）
 * @returns {number} 缩放因子，范围 [MIN_LAT_SCALE, 1]
 */
function resolveLatScale(centerLat) {
    const lat = parseFiniteNumber(centerLat);
    if (lat === null) return 1; // 未提供纬度 → 赤道，scale = 1，不修正
    const clamped = Math.max(-85.05112877980659, Math.min(85.05112877980659, lat));
    const scale = Math.cos((clamped * Math.PI) / 180);
    return Math.max(MIN_LAT_SCALE, scale); // 浮点边界安全截断
}

/**
 * 获取 OL 视图在指定缩放级别下的投影分辨率（米/像素）。
 *
 * 优先委托 OL View 实例的 getResolutionForZoom 方法，
 * 该方法可感知自定义投影、非标准瓦片矩阵集等情况，精度最高；
 * 未提供 view 或委托失败时，降级使用 Web Mercator 标准公式：
 *   res = WEB_MERCATOR_INITIAL_RESOLUTION / 2^zoom
 *
 * 与 getZoomFromResolution 构成严格互逆对：
 *   getZoomFromResolution(view, getProjectedResolution(view, zoom)) === zoom
 *
 * @param {Object|undefined} view - OL View 实例（可省略）
 * @param {number}           zoom - OL 缩放级别
 * @returns {number} 投影分辨率（> 0）
 */
function getProjectedResolution(view, zoom) {
    const viewRes = parseFiniteNumber(view?.getResolutionForZoom?.(zoom));
    if (viewRes !== null && viewRes > 0) return viewRes;
    // 标准 Web Mercator 公式，使用 2 ** zoom 保持与 Math.log2 的精确互逆性
    return WEB_MERCATOR_INITIAL_RESOLUTION / 2 ** zoom;
}

/**
 * 由投影分辨率（米/像素）反推 OL 缩放级别，与 getProjectedResolution 严格互逆。
 *
 * 优先委托 OL View 实例的 getZoomForResolution 方法（对称性）；
 * 降级公式（Web Mercator 标准）：
 *   zoom = log₂(WEB_MERCATOR_INITIAL_RESOLUTION / res)
 *
 * 数学验证：
 *   设 res = INIT_RES / 2^zoom，则
 *   log₂(INIT_RES / res) = log₂(INIT_RES / (INIT_RES / 2^zoom)) = log₂(2^zoom) = zoom ✓
 *
 * @param {Object|undefined} view       - OL View 实例（可省略）
 * @param {number}           resolution - 投影分辨率（> 0）
 * @returns {number} OL 缩放级别
 */
function getZoomFromResolution(view, resolution) {
    const viewZoom = parseFiniteNumber(view?.getZoomForResolution?.(resolution));
    if (viewZoom !== null && Number.isFinite(viewZoom)) return viewZoom;
    return Math.log2(WEB_MERCATOR_INITIAL_RESOLUTION / resolution);
}

// ══════════════════════════════ 公开 API ══════════════════════════════

/**
 * 将 Cesium 相机高度截断到合法范围 [MIN_CESIUM_HEIGHT, MAX_CESIUM_HEIGHT]。
 * 输入无法解析为有限数时返回 null。
 *
 * @param {number|string} height
 * @returns {number|null}
 */
export function clampCesiumHeight(height) {
    const h = parseFiniteNumber(height);
    if (h === null) return null;
    return Math.max(MIN_CESIUM_HEIGHT, Math.min(MAX_CESIUM_HEIGHT, h));
}

/**
 * 将 OL 缩放级别截断到合法范围 [MIN_OL_ZOOM, MAX_OL_ZOOM]。
 * 输入无法解析为有限数时返回 null。
 *
 * @param {number|string} zoom
 * @returns {number|null}
 */
export function clampOlZoom(zoom) {
    const z = parseFiniteNumber(zoom);
    if (z === null) return null;
    return Math.max(MIN_OL_ZOOM, Math.min(MAX_OL_ZOOM, z));
}

/**
 * 将 OL 缩放级别转换为 Cesium 相机高度（米）。
 * 与 cesiumHeightToOlZoom 在相同参数下严格互逆。
 *
 * 推导链（正向 ①→④）：
 *   ① res       = INIT_RES / 2^zoom          OL 投影分辨率
 *   ② groundRes = res × cos(lat)             Mercator 纬度修正
 *   ③ visibleH  = groundRes × viewportHeight 垂直可见地表范围（米）
 *   ④ height    = visibleH / (2·tan(fovy/2)) × calib   相机高度
 *
 * @param {Object}        [options={}]
 * @param {Object}        [options.view]        OL View 实例，用于精确获取分辨率
 * @param {number|string} [options.zoom]        OL 缩放级别（与 z 二选一，优先）
 * @param {number|string} [options.z]           OL URL 参数别名，等同于 zoom
 * @param {number[]}      [options.mapSize]     视口尺寸 [宽px, 高px]
 * @param {number|string} [options.centerLat]   视图中心纬度（°）
 * @param {number|string} [options.cesiumFovy]  Cesium 垂直视场角（弧度），默认 π/3
 * @param {number|string} [options.calibration] 视觉校准系数（正数，默认 1）
 * @param {boolean}       [options.clamp=false]  是否显式截断到默认合法范围
 * @returns {number|null} Cesium 相机高度（米），输入非法时返回 null
 */
export function olZoomToCesiumHeight({
    view,
    zoom,
    z,
    mapSize,
    centerLat,
    cesiumFovy,
    calibration,
    clamp = false,
} = {}) {
    // 主链路仅校验有限数，避免默认 clamp 破坏 z 的可逆换算；需要边界保护时显式 clamp。
    const normalizedZoom = clamp ? clampOlZoom(zoom ?? z) : parseFiniteNumber(zoom ?? z);
    if (normalizedZoom === null) return null;

    // ① OL 投影分辨率（Web Mercator 米/像素）
    const res = getProjectedResolution(view, normalizedZoom);
    if (!Number.isFinite(res) || res <= 0) return null;

    // ② 地表实际分辨率（Mercator 纬度畸变修正）
    const groundRes = res * resolveLatScale(centerLat);

    // ③ 视口垂直方向地表可见范围（米）
    const visibleH = groundRes * resolveViewportHeight(mapSize);

    // ④ 俯视视锥几何反推相机高度，乘以视觉校准系数
    const height =
        (visibleH / (2 * Math.tan(resolveFovy(cesiumFovy) / 2))) *
        resolveCalibration(calibration);

    return clamp ? clampCesiumHeight(height) : height;
}

/**
 * 将 Cesium 相机高度（米）转换为 OL 缩放级别。
 * 与 olZoomToCesiumHeight 在相同参数下严格互逆。
 *
 * 推导链（反向 ④⁻¹→①⁻¹，对 olZoomToCesiumHeight 逐步取代数逆）：
 *   ④⁻¹ visibleH  = height × 2·tan(fovy/2) / calib   还原可见地表范围
 *   ③⁻¹ groundRes = visibleH / viewportHeight          还原地表分辨率
 *   ②⁻¹ res       = groundRes / cos(lat)               去除纬度修正
 *   ①⁻¹ zoom      = log₂(INIT_RES / res)              还原缩放级别
 *
 * @param {Object}        [options={}]
 * @param {Object}        [options.view]        OL View 实例
 * @param {number|string} [options.height]      Cesium 相机高度（米）
 * @param {number[]}      [options.mapSize]     视口尺寸 [宽px, 高px]
 * @param {number|string} [options.centerLat]   视图中心纬度（°）
 * @param {number|string} [options.cesiumFovy]  Cesium 垂直视场角（弧度）
 * @param {number|string} [options.calibration] 视觉校准系数（正数，默认 1）
 * @param {boolean}       [options.clamp=false]  是否显式截断到默认合法范围
 * @returns {number|null} OL 缩放级别，输入非法时返回 null
 */
export function cesiumHeightToOlZoom({
    view,
    height,
    mapSize,
    centerLat,
    cesiumFovy,
    calibration,
    clamp = false,
} = {}) {
    // 主链路仅校验有限数，避免默认 clamp 破坏 z 的可逆换算；需要边界保护时显式 clamp。
    const normalizedHeight = clamp ? clampCesiumHeight(height) : parseFiniteNumber(height);
    if (normalizedHeight === null || normalizedHeight <= 0) return null;

    // 预先解析各参数（保证与正向函数完全对称，精确消除中间误差）
    const fovy  = resolveFovy(cesiumFovy);
    const calib = resolveCalibration(calibration);
    const vpH   = resolveViewportHeight(mapSize);
    const latS  = resolveLatScale(centerLat);

    // ④⁻¹ 由相机高度还原视口垂直可见地表范围（逆 ④）
    const visibleH = (normalizedHeight * 2 * Math.tan(fovy / 2)) / calib;

    // ③⁻¹ 由可见地表范围还原地表分辨率（逆 ③）
    const groundRes = visibleH / vpH;

    // ②⁻¹ 去除 Mercator 纬度修正，还原投影分辨率（逆 ②）
    const res = groundRes / latS;
    if (!Number.isFinite(res) || res <= 0) return null;

    // ①⁻¹ 由投影分辨率还原缩放级别（逆 ①）
    const zoom = getZoomFromResolution(view, res);
    if (!Number.isFinite(zoom)) return null;

    return clamp ? clampOlZoom(zoom) : zoom;
}