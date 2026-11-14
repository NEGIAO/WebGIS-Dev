/**
 * CloudShadowPass - 从太阳方向渲染云光学深度到 RT，供体积云主 Pass 采样（云阴影/遮挡）
 * 对应 three-geospatial 的 ShadowPass + shadow.frag：SVS + 与主 pass 一致的 sampleWeather/sampleMedia。
 */

import { getShadowFragmentSource } from "./CloudShadowFrag.glsl";
import { dist3, expandBBox, getAltitudeCorrectionOffset, invert, lerp4, lookAt, mulMat4Vec4, multiply, ortho } from "./shadowMath";
import { getCesium } from "./getCesium";
/* eslint-disable @typescript-eslint/no-unused-vars, no-constant-binary-expression */
const Cesium = getCesium();

const SHADOW_MAP_SIZE = 1024;
const SHADOW_RAY_FAR = 500000.0;
const SHADOW_CASCADE_COUNT = 4;

export class CloudShadowPass {
    autoRender: any;
    enabled: any;
    params: any;
    size: any;
    textures: any;
    updateInterval: any;
    // ==================== 状态字段（原 JS 动态字段收拢声明，一律 any 保持行为） ====================
    viewer: any;
    private _cascadeSignature: any;
    private _cesiumColorTextureRead: any;
    private _cesiumColorTextureWrite: any;
    private _cesiumDepthTexture: any;
    private _colorTextureHandle: any;
    private _colorTextureTarget: any;
    private _depthVelocityTextureHandle: any;
    private _fbo: any;
    private _fboComplete: any;
    private _framesSinceRender: any;
    private _gl: any;
    private _hasPublishedShadowState: any;
    private _hasRendered: any;
    private _hasValidColorTexture: any;
    private _inverseShadowMatrices: any;
    private _jitterOffsets: any;
    private _lastMotion: any;
    private _lastRenderedFrame: any;
    private _locations: any;
    private _paramsRev: any;
    private _positionLoc: any;
    private _preRenderListener: any;
    private _prevCamDir: any;
    private _prevCamPos: any;
    private _prevShadowMatrices: any;
    private _program: any;
    private _publishedShadowFar: any;
    private _publishedShadowIntervals: any;
    private _publishedShadowMatrices: any;
    private _publishedShadowNear: any;
    private _renderedParamsRev: any;
    private _renderedSignature: any;
    private _shadowFar: any;
    private _shadowIntervals: any;
    private _shadowMatrices: any;
    private _shadowNear: any;
    private _sunDirection: any;
    private _tileSize: any;
    private _updatedThisFrame: any;
    private _vbo: any;

    constructor(viewer: any, options: any = {}) {
        this.viewer = viewer;
        this.size = options.size ?? SHADOW_MAP_SIZE;
        this.textures = options.textures || {};
        this.params = options.params || {};
        this.updateInterval = Math.max(1, Number(options.updateInterval ?? this.params.bsmUpdateInterval) || 1);
        this.enabled = options.enabled !== false;
        /**
         * 是否自注册 preRender listener 驱动渲染。
         * V3.4.7：管线场景传 false，由 _syncBSM 显式调用 render()，
         * 保证“矩阵→raymarch→publish→resolve→blit→setCloudShadow”同帧顺序确定；
         * 运行时重建 pass 时自注册 listener 会排到 _syncBSM 之后，造成固定 1 帧滞后。
         */
        this.autoRender = options.autoRender !== false;
        this._hasRendered = false;
        this._gl = null;
        this._fbo = null;
        this._cesiumColorTextureRead = null;
        this._cesiumColorTextureWrite = null;
        this._cesiumDepthTexture = null;
        this._colorTextureHandle = null;
        this._depthVelocityTextureHandle = null;
        this._hasValidColorTexture = false;
        this._lastRenderedFrame = -1;
        this._updatedThisFrame = false;
        this._prevCamPos = null;
        this._prevCamDir = null;
        this._lastMotion = 1.0;
        this._program = null;
        this._colorTextureTarget = null;
        // 与 three-geospatial 一致：每 cascade 一层，分辨率为 tileSize
        this._tileSize = Math.floor(this.size / 2);
        // CSM cascades（对齐 three-geospatial CascadedShadowMaps）
        this._shadowNear = 0.1;
        this._shadowFar = 0.0;
        this._shadowIntervals = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array([0, 0]));
        this._shadowMatrices = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array(16));
        this._publishedShadowIntervals = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array([0, 0]));
        this._publishedShadowMatrices = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array(16));
        this._publishedShadowNear = 0.1;
        this._publishedShadowFar = 0.0;
        this._hasPublishedShadowState = false;
        this._inverseShadowMatrices = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array(16));
        // 逐 cascade 世界锚定噪声偏移：snap 后中心的 texel 计数 mod 256。
        // BSM 噪声相位若绑定 gl_FragCoord（atlas 像素），snap 跳变时会相对世界滑动
        // 1 texel → 整场重噪 → 升降抖动；加上该偏移后噪声随纹理网格贴住世界。
        this._jitterOffsets = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array(2));
        // V3.4.x 性能：BSM 内容签名门控。
        // snap+世界锚定噪声修复后，atlas 内容 = f(snap 窗口, 太阳方向, 天气偏移, 参数)，
        // 与相机连续位移解耦；签名/参数未变且演化刷新未到期时跳过整张 raymarch。
        this._cascadeSignature = "";
        this._renderedSignature = null;
        this._paramsRev = 1;
        this._renderedParamsRev = -1;
        this._framesSinceRender = Number.MAX_SAFE_INTEGER;
        this._prevShadowMatrices = Array.from({ length: SHADOW_CASCADE_COUNT }, () => {
            const m = new Float32Array(16);
            m[0] = m[5] = m[10] = m[15] = 1.0;
            return m;
        });
        this._sunDirection = [1.0, 0.0, 0.0];
        this._preRenderListener = null;
    }

    updateDynamicParams(dynamicParams: any) {
        // V3.4.x 性能：值级变更检测。任何"会改变 BSM 内容"的参数变化都 bump _paramsRev，
        // 供 render() 签名门控判断；持续推进的风/演化偏移除外（其新鲜度由演化刷新节奏兜底），
        // 否则 windSpeed>0 时每帧都会判定"参数已变"，门控失效。
        const p = this.params;
        let changed = false;
        const setNum = (key: any, v: any) => {
            if (v === undefined) return;
            if (p[key] !== v) { p[key] = v; changed = true; }
        };
        // 数组必须拷贝为 pass 自有副本再比较：调用方传入的是每帧原地复用的 scratch 数组，
        // 若直接共享引用，后续比较永远相等，变更检测失效。
        const setArr = (key: any, v: any) => {
            if (v === undefined || v === null) return;
            const cur = p[key];
            if (!Array.isArray(cur) || cur === v || cur.length !== v.length) {
                p[key] = Array.prototype.slice.call(v);
                changed = true;
                return;
            }
            for (let i = 0; i < v.length; i++) {
                if (cur[i] !== v[i]) {
                    for (let j = 0; j < v.length; j++) cur[j] = v[j];
                    changed = true;
                    return;
                }
            }
        };
        // 演化偏移：直接同步，不参与变更检测（见上）
        if (dynamicParams.localWeatherOffset) p.localWeatherOffset = dynamicParams.localWeatherOffset;
        if (dynamicParams.shapeOffset) p.shapeOffset = dynamicParams.shapeOffset;
        if (dynamicParams.shapeDetailOffset) p.shapeDetailOffset = dynamicParams.shapeDetailOffset;
        if (dynamicParams.windSpeed !== undefined) p.windSpeed = dynamicParams.windSpeed;
        if (dynamicParams.evolutionSpeed !== undefined) p.evolutionSpeed = dynamicParams.evolutionSpeed;
        if (dynamicParams.clockElapsedSeconds !== undefined) p.clockElapsedSeconds = dynamicParams.clockElapsedSeconds;

        setNum("bottomRadius", dynamicParams.bottomRadius);
        setNum("shadowBottomHeight", dynamicParams.shadowBottomHeight);
        setNum("shadowTopHeight", dynamicParams.shadowTopHeight);
        setNum("debugShadow", dynamicParams.debugShadow);
        // shadow cascade far 必须每帧同步，否则会用 init 时的旧值（Cesium frustum.far~8e8 → 矩阵 NaN）
        setNum("shadowFar", dynamicParams.shadowFar);
        setNum("maxShadowLengthRayDistance", dynamicParams.maxShadowLengthRayDistance);
        setNum("shadowSplitLambda", dynamicParams.shadowSplitLambda);
        setNum("shadowFadeScale", dynamicParams.shadowFadeScale);
        // layer 参数每帧同步，否则 GUI 调 coverage/density 等只影响主云，BSM 阴影不变
        setArr("coverages", dynamicParams.coverages);
        setArr("densityScales", dynamicParams.densityScales);
        setArr("shapeAmounts", dynamicParams.shapeAmounts);
        setArr("shapeDetailAmounts", dynamicParams.shapeDetailAmounts);
        setArr("weatherExponents", dynamicParams.weatherExponents);
        setArr("shapeAlteringBiases", dynamicParams.shapeAlteringBiases);
        setArr("coverageFilterWidths", dynamicParams.coverageFilterWidths);
        setNum("scatteringCoefficient", dynamicParams.scatteringCoefficient);
        setNum("absorptionCoefficient", dynamicParams.absorptionCoefficient);
        // V3.4.x：层高/间隙/密度剖面运行时同步（此前 pass 创建后固化，
        // 面板改层高会造成云体与云影层高错位）
        setArr("minLayerHeights", dynamicParams.minLayerHeights);
        setArr("maxLayerHeights", dynamicParams.maxLayerHeights);
        setArr("minIntervalHeights", dynamicParams.minIntervalHeights);
        setArr("maxIntervalHeights", dynamicParams.maxIntervalHeights);
        setArr("densityProfileLinear", dynamicParams.densityProfileLinear);
        setArr("densityProfileConstant", dynamicParams.densityProfileConstant);
        setArr("densityProfileExpTerms", dynamicParams.densityProfileExpTerms);
        setArr("densityProfileExponents", dynamicParams.densityProfileExponents);
        if (changed) this._paramsRev++;
    }

    /**
     * 创建 RT：纹理 + 帧缓冲
     */
    createRT() {
        // const gl = this._gl;
        // if (!gl) return;

        // if (this._colorTexture) {
        //     gl.deleteTexture(this._colorTexture);
        //     this._colorTexture = null;
        // }
        // if (this._depthVelocityTexture) {
        //     gl.deleteTexture(this._depthVelocityTexture);
        //     this._depthVelocityTexture = null;
        // }
        // if (this._fbo) {
        //     gl.deleteFramebuffer(this._fbo);
        //     this._fbo = null;
        // }

        // // Cesium PostProcessStage 不支持 sampler2DArray，用 2D 图集（2×2 cascade）
        // const tex = gl.createTexture();
        // gl.bindTexture(gl.TEXTURE_2D, tex);
        // gl.getExtension("EXT_color_buffer_float");
        // gl.getExtension("OES_texture_half_float_linear");
        // let useFloat = false;
        // try {
        //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.size, this.size, 0, gl.RGBA, gl.HALF_FLOAT, null);
        //     useFloat = true;
        // } catch (e) {
        //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // }
        // this._useFloatRT = useFloat;
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // gl.bindTexture(gl.TEXTURE_2D, null);
        // this._colorTexture = tex;
        // this._colorTextureTarget = gl.TEXTURE_2D;

        // const depthVel = gl.createTexture();
        // gl.bindTexture(gl.TEXTURE_2D, depthVel);
        // if (this._useFloatRT) {
        //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.size, this.size, 0, gl.RGBA, gl.HALF_FLOAT, null);
        // } else {
        //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // }
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // gl.bindTexture(gl.TEXTURE_2D, null);
        // this._depthVelocityTexture = depthVel;

        // const fbo = gl.createFramebuffer();
        // gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, depthVel, 0);
        // gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        // let fboComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        // if (!fboComplete && useFloat) {
        //     console.warn("CloudShadowPass: RGBA16F FBO incomplete, fallback to UNSIGNED_BYTE");
        //     gl.bindTexture(gl.TEXTURE_2D, tex);
        //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        //     gl.bindTexture(gl.TEXTURE_2D, depthVel);
        //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        //     gl.bindTexture(gl.TEXTURE_2D, null);
        //     gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        //     gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, depthVel, 0);
        //     fboComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        //     this._useFloatRT = false;
        // }
        // this._fboComplete = fboComplete;
        // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // this._fbo = fbo;
        const context = this.viewer.scene.context;
        const gl = context._gl;
        if (!gl) return;

        // 清理旧资源。BSM 颜色使用 read/write 双缓冲：写入纹理允许 clear，消费者只读取上一张完整纹理。
        if (this._cesiumColorTextureRead) this._cesiumColorTextureRead.destroy();
        if (this._cesiumColorTextureWrite) this._cesiumColorTextureWrite.destroy();
        if (this._cesiumDepthTexture) this._cesiumDepthTexture.destroy();
        if (this._fbo) { gl.deleteFramebuffer(this._fbo); this._fbo = null; }

        const makeOptions = (pixelDatatype: any) => ({
            context: context,
            width: this.size,
            height: this.size,
            pixelFormat: Cesium.PixelFormat.RGBA,
            pixelDatatype,
            sampler: new Cesium.Sampler({
                minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
                wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
                wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE
            })
        });

        try {
            const options = makeOptions(Cesium.PixelDatatype.HALF_FLOAT);
            this._cesiumColorTextureRead = new Cesium.Texture(options);
            this._cesiumColorTextureWrite = new Cesium.Texture(options);
            this._cesiumDepthTexture = new Cesium.Texture(options);
        } catch (e) {
            console.warn("CloudShadowPass: HALF_FLOAT 不支持，降级为 UNSIGNED_BYTE");
            const options = makeOptions(Cesium.PixelDatatype.UNSIGNED_BYTE);
            this._cesiumColorTextureRead = new Cesium.Texture(options);
            this._cesiumColorTextureWrite = new Cesium.Texture(options);
            this._cesiumDepthTexture = new Cesium.Texture(options);
        }

        this._colorTextureHandle = this._cesiumColorTextureWrite._texture;
        this._depthVelocityTextureHandle = this._cesiumDepthTexture._texture;
        this._colorTextureTarget = this._cesiumColorTextureWrite._target;
        this._hasValidColorTexture = false;

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._colorTextureHandle, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this._depthVelocityTextureHandle, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        
        this._fboComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        if (!this._fboComplete) { /* console.error("CloudShadowPass: FBO 创建失败!"); */ }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this._fbo = fbo;
    }

    /**
     * three-geospatial CascadedShadowMaps 等价实现：
     * - 4 级 cascade（SHADOW_CASCADE_COUNT）
     * - interval 为归一化深度分段（0..1）
     * - 每级一个 shadowMatrix / inverseShadowMatrix
     */
    updateShadowCascades() {
        const scene = this.viewer.scene;
        const cam = scene.camera;
        const us = scene.context && scene.context.uniformState;
        const sunDirWC = (us && (us.sunDirectionWC || us._sunDirectionWC)) || null;

        const isValidDir = (v: any) =>
            !!v &&
            Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) &&
            (v.x * v.x + v.y * v.y + v.z * v.z) > 1e-12;

        let toSunSource;
        if (isValidDir(sunDirWC)) toSunSource = sunDirWC;
        else if (isValidDir(cam.positionWC)) toSunSource = cam.positionWC;
        else if (isValidDir(cam.directionWC)) toSunSource = cam.directionWC;
        else toSunSource = new Cesium.Cartesian3(1.0, 0.0, 0.0);

        const toSun = Cesium.Cartesian3.normalize(toSunSource, new Cesium.Cartesian3());
        // shadow.frag 中 rayDirection = normalize(-sunDirection)
        this._sunDirection = [toSun.x, toSun.y, toSun.z];
        
        const frustum = cam.frustum;
        const near = Number(frustum?.near) || 0.1;
        const farCandidate =
            Number(frustum?.far) ||
            (Number(this.params.maxShadowLengthRayDistance) || SHADOW_RAY_FAR);
        const farMax = Number(this.params.shadowFar) || Number(this.params.maxShadowLengthRayDistance) || farCandidate;
        let far = Math.min(farCandidate, farMax);
        // Sanity: keep far > near
        if (!Number.isFinite(far) || far <= near + 1e-3) {
            far = near + 1.0;
        }
        this._shadowNear = near;
        this._shadowFar = far;

        // splitFrustum(mode='practical', lambda=0.5) 复刻：
        // 先在“距离域”(meters)里算 splitDistance，再转换成与 shader 中
        // viewZToOrthographicDepth 一致的 0..1 深度：(d - near) / (far - near)。
        // 注意：Number(undefined) 会得到 NaN，不能用 ?? 兜底；这里显式做有限性检查。
        const lambdaRaw = Number(this.params.shadowSplitLambda);
        const lambda = Number.isFinite(lambdaRaw) ? lambdaRaw : 0.5;
        const splits = new Array(SHADOW_CASCADE_COUNT);
        const denom = Math.max(far - near, 1e-6);
        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
            const si = (i + 1) / SHADOW_CASCADE_COUNT;
            const uniformDist = near + (far - near) * si;
            const logarithmicDist = near * Math.pow(far / near, si);
            const splitDist = uniformDist + (logarithmicDist - uniformDist) * lambda;
            splits[i] = (splitDist - near) / denom;
        }

        // Validate splits. If invalid (NaN/non-monotonic/out of range), fallback.
        let valid = true;
        let prev = 0;
        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
            const s = splits[i];
            if (!Number.isFinite(s) || s <= prev || s <= 0 || s > 1.0) {
                valid = false;
                break;
            }
            prev = s;
        }
        if (!valid) {
            splits[0] = 0.25;
            splits[1] = 0.5;
            splits[2] = 0.75;
            splits[3] = 1.0;
        }
        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
            const a = splits[i - 1] ?? 0;
            const b = splits[i] ?? 0;
            this._shadowIntervals[i][0] = a;
            this._shadowIntervals[i][1] = b;
        }

        // Debug helper: inspect intervals in console if needed.
        try {
            (window as any).__bsmShadowIntervals = this._shadowIntervals.map((v: any) => [v[0], v[1]]);
            (window as any).__bsmShadowFar = this._shadowFar;
        } catch (e) {
            // ignore
        }
        
        // 构造光源朝向矩阵（lookAt(0, -sunDir, up)）。
        // up 与太阳方向近平行时 lookAt 退化（x=up×z 长度为 0），换用 Y 轴兜底；
        // 该 up 必须与下方逐 cascade 的 _lookAt(positionWS, centerWS, up) 保持一致，
        // 否则 texel snap 的 x/y 轴与最终阴影图 x/y 轴不重合。
        const upAxis = Math.abs(toSun.z) > 0.99 ? [0, 1, 0] : [0, 0, 1];
        const lightOrientation = this._lookAt([0, 0, 0], [-toSun.x, -toSun.y, -toSun.z], upAxis);
        const invLightOrientation = new Float32Array(16);
        this._invert(invLightOrientation, lightOrientation);

        // camera.matrixWorld ~= inverseView
        const camInvView = Cesium.Matrix4.clone(cam.inverseViewMatrix, new Cesium.Matrix4());
        const camWorld = new Float32Array(16);
        Cesium.Matrix4.toArray(camInvView, camWorld);

        // V3.4.7 核心修复：相机视空间 → 光空间 = (世界→光) × (相机→世界)。
        // 旧代码误用 invLightOrientation（光→世界）做首乘，bbox/texel snap 全部落在
        // “转置光框架”里 —— snap 的量化轴与阴影图 x/y 轴不重合，量化完全失效，
        // cascade 原点随相机亚 texel 滑动 → BSM 重栅格化漂移 → 阴影抖动/粘屏。
        const cameraToLight = new Float32Array(16);
        this._multiply(cameraToLight, lightOrientation, camWorld);

        // 全 frustum（view space）近远平面 4 个角
        const fov = Number(frustum?.fovy) || (Math.PI / 3);
        const aspect = Number(frustum?.aspectRatio) || (scene.canvas.clientWidth / Math.max(1, scene.canvas.clientHeight));
        const tan = Math.tan(fov * 0.5);
        const nearH = tan * near;
        const nearW = nearH * aspect;
        const farH = tan * far;
        const farW = farH * aspect;

        const nearCorners = [
            [nearW, nearH, -near, 1],
            [nearW, -nearH, -near, 1],
            [-nearW, -nearH, -near, 1],
            [-nearW, nearH, -near, 1]
        ];
        const farCorners = [
            [farW, farH, -far, 1],
            [farW, -farH, -far, 1],
            [-farW, -farH, -far, 1],
            [-farW, farH, -far, 1]
        ];

        // shadowCascadeMargin 未传时 Number(undefined)=NaN，?? 不会兜 NaN（只兜 null/undefined），
        // 会让 _ortho 的 near/far=NaN → proj[10]=NaN → shadowMatrix NaN → inverse 全 0 → BSM 失效。
        // 用 || 兜底（NaN 是 falsy）。
        const margin = Number(this.params.shadowCascadeMargin) || 0.0;
        const mapSize = { width: this._tileSize, height: this._tileSize };
        const R = Number(this.params.bottomRadius) || 6371000;
        const cloudTopR = R + (Number(this.params.cloudBottomHeight) || 3000) + (Number(this.params.cloudTopHeight) || 1500);
        const distance = cloudTopR * 3.0;
        // 内容签名：snap 整数 + 量化半径（覆盖 fov/aspect/near/far 变化）+ 量化太阳方向（2e-4 rad）
        const sigParts = [
            Math.round(toSun.x * 5000), Math.round(toSun.y * 5000), Math.round(toSun.z * 5000)
        ];

        for (let ci = 0; ci < SHADOW_CASCADE_COUNT; ci++) {
            const tNear = (splits[ci - 1] ?? 0);
            const tFar = splits[ci];

            const sliceNear = (ci === 0) ? nearCorners : nearCorners.map((_p, i) => this._lerp4(nearCorners[i], farCorners[i], tNear));
            const sliceFar = (ci === SHADOW_CASCADE_COUNT - 1) ? farCorners : nearCorners.map((_p, i) => this._lerp4(nearCorners[i], farCorners[i], tFar));

            // 计算半径（对齐 getFrustumRadius）：取 far 对角 & 近远对角
            const diag1 = this._dist3(sliceFar[0], sliceFar[2]);
            const diag2 = this._dist3(sliceFar[0], sliceNear[2]);
            let diagonalLength = Math.max(diag1, diag2);
            // 对齐原版 three-geospatial CascadedShadowMaps 的 fade 扩展：
            // 按 far 平面归一化深度平方扩大 radius，否则近处 cascade 的 ortho frustum 太小，
            // 近处地面点 uv 越界 → 查不到阴影 → 近处无阴影被硬切。
            // distance = sliceFar[0].z / (far - near)（归一化 0..1，sliceFar.z 是 view space 负值取绝对值）
            const fadeScaleRaw = Number(this.params.shadowFadeScale);
            const fadeScale = Number.isFinite(fadeScaleRaw) ? fadeScaleRaw : 1.0;
            const sliceFarZ = Math.abs(sliceFar[0][2]);
            const distNorm = (far - near) > 1e-6 ? sliceFarZ / (far - near) : 0;
            diagonalLength += fadeScale * 0.25 * distNorm * distNorm * (far - near);
            const radius = 0.5 * diagonalLength;

            const left = -radius, right = radius, top = radius, bottom = -radius;
            const proj = this._ortho(left, right, bottom, top, -margin, radius * 2 + margin);

            // 将 8 个角变到 light space，求 bbox
            const bbox = { min: [1e30, 1e30, 1e30], max: [-1e30, -1e30, -1e30] };
            for (let j = 0; j < 4; j++) {
                const a = this._mulMat4Vec4(cameraToLight, sliceNear[j]);
                const b = this._mulMat4Vec4(cameraToLight, sliceFar[j]);
                this._expandBBox(bbox, a);
                this._expandBBox(bbox, b);
            }
            const centerLS = [
                (bbox.min[0] + bbox.max[0]) * 0.5,
                (bbox.min[1] + bbox.max[1]) * 0.5,
                bbox.max[2] + margin,
                1.0
            ];

            // texel snap：在光空间 x/y 上按整 texel 量化中心。
            // 正交半径只依赖视锥参数（帧间常量），中心量化后 texel↔世界映射帧间分段恒定，
            // BSM 栅格与静态 blue-noise jitter 因此获得世界稳定性（贴地不抖的关键）。
            const texelW = (right - left) / mapSize.width;
            const texelH = (top - bottom) / mapSize.height;
            const snapX = Math.round(centerLS[0] / texelW);
            const snapY = Math.round(centerLS[1] / texelH);
            centerLS[0] = snapX * texelW;
            centerLS[1] = snapY * texelH;
            // 世界锚定噪声偏移：fragCoord + center/texel = (x_light + radius)/texel，
            // 与窗口位置无关（整数域，mod 256 保 f32 精确 + 蓝噪声纹理周期对齐）。
            this._jitterOffsets[ci][0] = ((snapX % 256) + 256) % 256;
            this._jitterOffsets[ci][1] = ((snapY % 256) + 256) % 256;
            sigParts.push(snapX, snapY, Math.round(radius));

            // center 回到 world：光空间 → 世界 = invLightOrientation（V3.4.7 修复，
            // 旧代码误乘 lightOrientation=世界→光，与上面的错误首乘“互相抵消”，
            // 中心点虽连续但 snap 轴向错误）。
            const centerWS4 = this._mulMat4Vec4(invLightOrientation, centerLS);
            const centerWS = [centerWS4[0], centerWS4[1], centerWS4[2]];
            const positionWS = [
                centerWS[0] + toSun.x * distance,
                centerWS[1] + toSun.y * distance,
                centerWS[2] + toSun.z * distance
            ];
            const view = this._lookAt(positionWS, centerWS, upAxis);

            const shadowMatrix = this._shadowMatrices[ci];
            const invShadowMatrix = this._inverseShadowMatrices[ci];
            // 生成端：inverse 用 ECEF 世界矩阵，shader 内部再加 altitudeCorrection。
            // 消费端：shadowMatrices 同样保持 ECEF，避免与 depth 重建的 raw ECEF 采样空间不一致。
            this._multiply(shadowMatrix, proj, view);
            this._invert(invShadowMatrix, shadowMatrix);
        }
        this._cascadeSignature = sigParts.join(",");
    }










    _publishShadowState() {
        for (let ci = 0; ci < SHADOW_CASCADE_COUNT; ci++) {
            this._publishedShadowIntervals[ci].set(this._shadowIntervals[ci]);
            this._publishedShadowMatrices[ci].set(this._shadowMatrices[ci]);
        }
        this._publishedShadowNear = this._shadowNear;
        this._publishedShadowFar = this._shadowFar;
        this._hasPublishedShadowState = true;
    }

    /**
     * 估算相机帧间运动量。
     * @returns {number} 0 表示近似静止，1 表示需要强制刷新 BSM 的明显运动。
     */
    _measureCameraMotion() {
        const cam = this.viewer?.scene?.camera;
        if (!cam?.positionWC || !cam?.directionWC) return 1.0;
        let motion = 1.0;
        if (this._prevCamPos && this._prevCamDir) {
            const dp = Cesium.Cartesian3.distance(cam.positionWC, this._prevCamPos);
            const dot = Math.min(1.0, Math.max(-1.0, Cesium.Cartesian3.dot(cam.directionWC, this._prevCamDir)));
            // V3.4.7：旋转度量改用角度（弧度）近似 sqrt(2(1-dot))。
            // 旧的 (1-dot) 在小角度下是 θ²/2 量级（二次方弱化），慢速旋转（~12°/s）
            // 也无法越过强制刷新阈值 → interval>1 预设下 cascade 冻结、新视野无阴影、
            // 更新帧阴影整块弹入（旋转黑闪）。角度度量对旋转是线性响应。
            const ang = Math.sqrt(Math.max(0.0, 2.0 * (1.0 - dot)));
            motion = Math.min(1.0, dp * 2e-3 + ang * 8.0);
        }
        this._prevCamPos = Cesium.Cartesian3.clone(cam.positionWC, this._prevCamPos);
        this._prevCamDir = Cesium.Cartesian3.clone(cam.directionWC, this._prevCamDir);
        this._lastMotion = motion;
        return motion;
    }

    /**
     * 交换 BSM color read/write 纹理。
     * 写入侧允许 clear；交换后消费者只会读取完整写完的 read 纹理，避免黑闪。
     */
    _swapColorTextures() {
        const read = this._cesiumColorTextureRead;
        this._cesiumColorTextureRead = this._cesiumColorTextureWrite;
        this._cesiumColorTextureWrite = read;
        this._colorTextureHandle = this._cesiumColorTextureWrite?._texture || null;
        this._colorTextureTarget = this._cesiumColorTextureWrite?._target || this._colorTextureTarget;
        this._hasValidColorTexture = true;
    }

    /** 数学工具委托（实现见 ./shadowMath） */
    _getAltitudeCorrectionOffset(bottomRadius: any) {
        return getAltitudeCorrectionOffset(this.viewer, bottomRadius);
    }
    /** 数学工具委托（实现见 ./shadowMath） */
    _lerp4(a: any, b: any, t: any) {
        return lerp4(a, b, t);
    }
    /** 数学工具委托（实现见 ./shadowMath） */
    _dist3(a: any, b: any) {
        return dist3(a, b);
    }
    /** 数学工具委托（实现见 ./shadowMath） */
    _mulMat4Vec4(m: any, v: any) {
        return mulMat4Vec4(m, v);
    }
    /** 数学工具委托（实现见 ./shadowMath） */
    _expandBBox(bbox: any, v4: any) {
        return expandBBox(bbox, v4);
    }
    /** 数学工具委托（实现见 ./shadowMath） */
    _lookAt(eye: any, center: any, up: any) {
        return lookAt(eye, center, up);
    }
    /** 数学工具委托（实现见 ./shadowMath） */
    _ortho(left: any, right: any, bottom: any, top: any, near: any, far: any) {
        return ortho(left, right, bottom, top, near, far);
    }
    /** 数学工具委托（实现见 ./shadowMath） */
    _multiply(out: any, a: any, b: any) {
        return multiply(out, a, b);
    }
    /** 数学工具委托（实现见 ./shadowMath） */
    _invert(out: any, m: any) {
        return invert(out, m);
    }

    getVertexShader() {
        return `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;
    }

    getFragmentShader() {
        const opts = {
            SHADOW_RAY_FAR: Number(this.params.maxShadowLengthRayDistance) || SHADOW_RAY_FAR,
            maxSteps: Math.min(Number(this.params.maxSteps) || 500, 512),
            minStepSize: Number(this.params.minStepSize) || 50.0,
            maxStepSize: Number(this.params.maxStepSize) || 1000.0
        };
        return getShadowFragmentSource(opts);
    }

    createProgram() {
        const gl = this._gl;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, this.getVertexShader());
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            // console.error("CloudShadowPass VS:", gl.getShaderInfoLog(vs));
            gl.deleteShader(vs);
            return;
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, this.getFragmentShader());
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            // console.error("CloudShadowPass FS:", gl.getShaderInfoLog(fs));
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            return;
        }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            // console.error("CloudShadowPass link:", gl.getProgramInfoLog(prog));
            gl.deleteProgram(prog);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            return;
        }
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        this._program = prog;
        // 一次性枚举全部 active uniform 并缓存 location，替代 render() 每帧几十次 getUniformLocation
        const locations = Object.create(null);
        const uniformCount = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            const info = gl.getActiveUniform(prog, i);
            if (info) locations[info.name] = gl.getUniformLocation(prog, info.name);
        }
        this._locations = locations;
        this._positionLoc = gl.getAttribLocation(prog, "a_position");
    }

    render(force = false) {
        this._updatedThisFrame = false;
        if (!this.enabled && !force) return;
        const scene = this.viewer.scene;
        const context = scene.context;
        const gl = context._gl;
        if (!gl || !this._fbo || !this._program || !this._fboComplete) return;

        this._gl = gl;
        this.updateShadowCascades();
        // motion 仍每帧测量：供 resolve 侧 alpha/reset 决策使用
        this._measureCameraMotion();
        // V3.4.x 性能：内容签名门控取代"运动即每帧重绘"。
        // snap+世界锚定噪声修复后，BSM 内容与相机连续位移解耦：
        // 仅在 snap/太阳/半径签名变化、参数变化、或演化刷新到期时重绘；
        // 相机平滑移动的未跳变帧与静止帧全部跳过整张 atlas raymarch。
        const interval = Math.max(1, Number(this.updateInterval || this.params.bsmUpdateInterval) || 1);
        const evolutionActive =
            Math.abs(Number(this.params.windSpeed) || 0) > 1e-9 ||
            Math.abs(Number(this.params.evolutionSpeed) || 0) > 1e-9;
        const refreshFrames = evolutionActive ? Math.max(interval, 8) : Number.MAX_SAFE_INTEGER;
        if (this._framesSinceRender < Number.MAX_SAFE_INTEGER) this._framesSinceRender++;
        const signatureChanged = this._cascadeSignature !== this._renderedSignature;
        const paramsChanged = this._paramsRev !== this._renderedParamsRev;
        const shouldRender = force || !this._hasRendered || signatureChanged || paramsChanged
            || this._framesSinceRender >= refreshFrames;
        if (!shouldRender) return;
        this._hasRendered = true;
        this._updatedThisFrame = true;
        this._lastRenderedFrame++;

        const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const prevViewport = gl.getParameter(gl.VIEWPORT);
        const prevBlend = gl.isEnabled(gl.BLEND);
        const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
        const prevCullFace = gl.isEnabled(gl.CULL_FACE);

        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._colorTextureHandle, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this._depthVelocityTextureHandle, 0);
        if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== this._fbo) return;
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this._program);

        // uniform location 全部走 createProgram() 时缓存的 _locations，避免每帧 driver 查找
        const locs = this._locations || Object.create(null);

        // 射线方向：从太阳指向地心（与 three-geospatial shadow 一致）
        const sunDirLoc = locs.u_sunDirection;
        if (sunDirLoc) gl.uniform3f(sunDirLoc, -this._sunDirection[0], -this._sunDirection[1], -this._sunDirection[2]);

        const R = Number(this.params.bottomRadius) || 6371000;
        const time = Number(this.params.clockElapsedSeconds) || 0;

        const set1f = (name: any, v: any) => { const loc = locs[name]; if (loc != null) gl.uniform1f(loc, v); };
        const set2f = (name: any, a: any, b: any) => { const loc = locs[name]; if (loc != null) gl.uniform2f(loc, a, b); };
        const set3f = (name: any, arr: any) => { const loc = locs[name]; if (loc != null) gl.uniform3fv(loc, arr); };
        const set4f = (name: any, arr: any) => { const loc = locs[name]; if (loc != null) gl.uniform4fv(loc, arr); };
        const set1i = (name: any, v: any) => { const loc = locs[name]; if (loc != null) gl.uniform1i(loc, v); };

        // 每个 cascade 以 tileSize 分辨率渲染（viewport 决定 gl_FragCoord）
        set2f("u_resolution", this._tileSize, this._tileSize);
        set2f("u_atlasResolution", this.size, this.size);
        set1f("u_atlasScale", 0.5);
        set1f("u_bottomRadius", R);
        // BSM 射线起点对齐 Bruneton 球（R=6371860）与 WGS84 球心偏移，否则 getRayNearFar 求交基准错位
        set3f("u_altitudeCorrection", this._getAltitudeCorrectionOffset(R));
        set1f("u_shadowTopHeight", Number(this.params.shadowTopHeight) ?? ((Number(this.params.cloudBottomHeight) || 3000) + (Number(this.params.cloudTopHeight) || 1500)));
        set1f("u_shadowBottomHeight", Number(this.params.shadowBottomHeight) ?? (Number(this.params.cloudBottomHeight) || 3000));
        set1f("u_weatherRepeat", Number(this.params.weatherRepeat) || 100.0);
        set2f("u_localWeatherOffset", Number(this.params.localWeatherOffset?.[0]) || 0, Number(this.params.localWeatherOffset?.[1]) || 0);
        set1f("u_shapeRepeat", Number(this.params.shapeRepeat) || 8e-4);
        set1f("u_shapeDetailRepeat", Number(this.params.shapeDetailRepeat) || 0.006);
        set3f("u_shapeOffset", this.params.shapeOffset || [0, 0, 0]);
        set3f("u_shapeDetailOffset", this.params.shapeDetailOffset || [0, 0, 0]);
        set1f("u_turbulenceRepeat", Number(this.params.turbulenceRepeat) || 2.0);
        set1f("u_turbulenceDisplacement", Number(this.params.turbulenceDisplacement) || 400.0);
        set4f("u_minLayerHeights", this.params.minLayerHeights || [0, 0, 0, 0]);
        set4f("u_maxLayerHeights", this.params.maxLayerHeights || [0, 0, 0, 0]);
        set3f("u_minIntervalHeights", this.params.minIntervalHeights || [0, 0, 0]);
        set3f("u_maxIntervalHeights", this.params.maxIntervalHeights || [0, 0, 0]);
        set4f("u_densityProfileExpTerms", this.params.densityProfileExpTerms || [0, 0, 0, 0]);
        set4f("u_densityProfileExponents", this.params.densityProfileExponents || [0, 0, 0, 0]);
        set4f("u_densityProfileLinearTerms", this.params.densityProfileLinear || [0.75, 0.75, 0.75, 0.75]);
        set4f("u_densityProfileConstantTerms", this.params.densityProfileConstant || [0.25, 0.25, 0.25, 0.25]);
        set4f("u_densityScales", this.params.densityScales || [0, 0, 0, 0]);
        set4f("u_shapeAmounts", this.params.shapeAmounts || [1, 1, 1, 1]);
        set4f("u_shapeDetailAmounts", this.params.shapeDetailAmounts || [1, 1, 1, 1]);
        set4f("u_weatherExponents", this.params.weatherExponents || [1, 1, 1, 1]);
        set4f("u_shapeAlteringBiases", this.params.shapeAlteringBiases || [0.35, 0.35, 0.35, 0.35]);
        set4f("u_coverageFilterWidths", this.params.coverageFilterWidths || [0.6, 0.6, 0.6, 0.6]);
        set4f("u_coverages", this.params.coverages || [0.3, 0.3, 0.3, 0.3]);
        set1f("u_scatteringCoefficient", Number(this.params.scatteringCoefficient) ?? 0.9);
        set1f("u_absorptionCoefficient", Number(this.params.absorptionCoefficient) ?? 1.0);
        set1f("u_time", time);
        set1f("u_evolutionSpeed", Number(this.params.evolutionSpeed) || 0.005);
        set1f("u_minDensity", Number(this.params.minDensity) ?? 1e-5);
        set1f("u_minExtinction", Number(this.params.minExtinction) ?? 1e-5);
        set1f("u_minTransmittance", Number(this.params.minTransmittance) ?? 0.01);
        set1f("u_opticalDepthTailScale", Number(this.params.opticalDepthTailScale) ?? 1.0);
        set1i("u_debugShadow", Number(this.params.debugShadow) || 0);

        let texUnit = 0;
        const bindTex = (name: any, tex: any, target: any) => {
            const loc = locs[name];
            if (loc == null) return;
            gl.uniform1i(loc, texUnit);
            if (tex && (tex._texture !== undefined || (target === gl.TEXTURE_3D && tex))) {
                gl.activeTexture(gl.TEXTURE0 + texUnit);
                const glTex = typeof tex._texture !== "undefined" ? tex._texture : tex;
                gl.bindTexture(target, glTex);
            }
            texUnit++;
        };
        bindTex("u_weatherTexture", this.textures.weather, gl.TEXTURE_2D);
        bindTex("u_turbulenceTexture", this.textures.turbulence, gl.TEXTURE_2D);
        bindTex("u_blueNoise", this.textures.blueNoise, gl.TEXTURE_2D);
        bindTex("u_shapeTexture", this.textures.shape, gl.TEXTURE_3D);
        bindTex("u_shapeDetailTexture", this.textures.shapeDetail, gl.TEXTURE_3D);

        const locInv = locs.u_inverseSunViewProj;
        const locReproj = locs.u_reprojectionMatrix;
        const locAtlasOffset = locs.u_atlasOffset;
        const locJitterOffset = locs.u_jitterOffset;
        const posLoc = this._positionLoc != null ? this._positionLoc : gl.getAttribLocation(this._program, "a_position");
        if (posLoc >= 0 && this._vbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        }

        const tiles = [
            { x: 0, y: this._tileSize },
            { x: this._tileSize, y: this._tileSize },
            { x: 0, y: 0 },
            { x: this._tileSize, y: 0 }
        ];
        for (let ci = 0; ci < SHADOW_CASCADE_COUNT; ci++) {
            const t = tiles[ci];
            gl.viewport(t.x, t.y, this._tileSize, this._tileSize);
            if (locInv) gl.uniformMatrix4fv(locInv, false, this._inverseShadowMatrices[ci]);
            if (locReproj) gl.uniformMatrix4fv(locReproj, false, this._prevShadowMatrices[ci]);
            if (locAtlasOffset) gl.uniform2f(locAtlasOffset, t.x / this.size, t.y / this.size);
            if (locJitterOffset) gl.uniform2f(locJitterOffset, this._jitterOffsets[ci][0], this._jitterOffsets[ci][1]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        // 保存本帧 shadowMatrices 用于下一帧 reprojection
        for (let ci = 0; ci < SHADOW_CASCADE_COUNT; ci++) {
            this._prevShadowMatrices[ci].set(this._shadowMatrices[ci]);
        }

        if (posLoc >= 0) {
            gl.disableVertexAttribArray(posLoc);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
        gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);

        if (prevBlend) gl.enable(gl.BLEND);
        if (prevDepthTest) gl.enable(gl.DEPTH_TEST);
        if (prevCullFace) gl.enable(gl.CULL_FACE);

        this._swapColorTextures();
        this._publishShadowState();
        // 门控账本：记录本次渲染对应的内容签名/参数版本，重置演化刷新计时
        this._renderedSignature = this._cascadeSignature;
        this._renderedParamsRev = this._paramsRev;
        this._framesSinceRender = 0;
    }

    /**
     * 返回供主 Pass 使用的纹理。Cesium 绑定用 _texture + _textureTarget。
     */
    getTexture() {
        // 首帧还没有完整 BSM 时不发布 color atlas，避免下游读取 clear/空纹理造成大面积黑闪。
        return this._hasValidColorTexture ? this._cesiumColorTextureRead : null;
    }

    getDepthVelocityTexture() {
        return this._hasValidColorTexture ? this._cesiumDepthTexture : null;
    }

    wasUpdatedThisFrame() {
        return this._updatedThisFrame === true;
    }

    getLastMotion() {
        return this._lastMotion || 0.0;
    }

    getShadowMatrices() {
        return this._hasPublishedShadowState ? this._publishedShadowMatrices : this._shadowMatrices;
    }

    getShadowIntervals() {
        return this._hasPublishedShadowState ? this._publishedShadowIntervals : this._shadowIntervals;
    }

    getShadowFar() {
        return this._hasPublishedShadowState ? this._publishedShadowFar : this._shadowFar;
    }

    getShadowNear() {
        return this._hasPublishedShadowState ? this._publishedShadowNear : this._shadowNear;
    }

    getTileSize() {
        return this._tileSize;
    }

    /**
     * 初始化 RT 与 Shader，并注册 preRender 在每帧渲染阴影图
     */
    init() {
        const scene = this.viewer.scene;
        const gl = scene.context._gl;
        if (!gl) return;
        this._gl = gl;
        this.createRT();
        this.createProgram();
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this._vbo = vbo;
        if (this.autoRender) {
            this._preRenderListener = scene.preRender.addEventListener(() => this.render());
        }
    }

    destroy() {
        if (this._preRenderListener) {
            this._preRenderListener();
            this._preRenderListener = null;
        }
        const gl = this._gl;
        if (gl) {
            if (this._program) gl.deleteProgram(this._program);
            try { this._cesiumColorTextureRead?.destroy?.(); } catch { /* ignore */ }
            try { this._cesiumColorTextureWrite?.destroy?.(); } catch { /* ignore */ }
            try { this._cesiumDepthTexture?.destroy?.(); } catch { /* ignore */ }
            if (this._fbo) gl.deleteFramebuffer(this._fbo);
            if (this._vbo) gl.deleteBuffer(this._vbo);
        }
        this._program = null;
        this._locations = null;
        this._positionLoc = null;
        this._cesiumColorTextureRead = null;
        this._cesiumColorTextureWrite = null;
        this._cesiumDepthTexture = null;
        this._colorTextureHandle = null;
        this._depthVelocityTextureHandle = null;
        this._hasValidColorTexture = false;
        this._prevCamPos = null;
        this._prevCamDir = null;
        this._fbo = null;
        this._vbo = null;
        this._gl = null;
    }
}
