/**
 * CloudShadowPass - 从太阳方向渲染云光学深度到 RT，供体积云主 Pass 采样（云阴影/遮挡）
 * 对应 three-geospatial 的 ShadowPass + shadow.frag：SVS + 与主 pass 一致的 sampleWeather/sampleMedia。
 */

import { getShadowFragmentSource } from "./CloudShadowFrag.glsl.js";
import { getCesium } from "./getCesium.js";
/* eslint-disable @typescript-eslint/no-unused-vars, no-constant-binary-expression */
const Cesium = getCesium();

const SHADOW_MAP_SIZE = 1024;
const SHADOW_RAY_FAR = 500000.0;
const SHADOW_CASCADE_COUNT = 4;

export class CloudShadowPass {
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this.size = options.size ?? SHADOW_MAP_SIZE;
        this.textures = options.textures || {};
        this.params = options.params || {};
        this.updateInterval = Math.max(1, Number(options.updateInterval ?? this.params.bsmUpdateInterval) || 1);
        this.enabled = options.enabled !== false;
        this._renderFrame = 0;
        this._hasRendered = false;
        this._gl = null;
        this._fbo = null;
        this._colorTexture = null;
        this._depthVelocityTexture = null;
        this._program = null;
        this._vao = null;
        this._colorTextureTarget = null;
        // 与 three-geospatial 一致：每 cascade 一层，分辨率为 tileSize
        this._tileSize = Math.floor(this.size / 2);
        // CSM cascades（对齐 three-geospatial CascadedShadowMaps）
        this._shadowNear = 0.1;
        this._shadowFar = 0.0;
        this._shadowIntervals = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array([0, 0]));
        this._shadowMatrices = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array(16));
        this._inverseShadowMatrices = Array.from({ length: SHADOW_CASCADE_COUNT }, () => new Float32Array(16));
        this._prevShadowMatrices = Array.from({ length: SHADOW_CASCADE_COUNT }, () => {
            const m = new Float32Array(16);
            m[0] = m[5] = m[10] = m[15] = 1.0;
            return m;
        });
        this._sunDirection = [1.0, 0.0, 0.0];
        this._preRenderListener = null;
    }

    updateDynamicParams(dynamicParams) {
        if (dynamicParams.localWeatherOffset) this.params.localWeatherOffset = dynamicParams.localWeatherOffset;
        if (dynamicParams.shapeOffset) this.params.shapeOffset = dynamicParams.shapeOffset;
        if (dynamicParams.shapeDetailOffset) this.params.shapeDetailOffset = dynamicParams.shapeDetailOffset;
        if (dynamicParams.bottomRadius !== undefined) this.params.bottomRadius = dynamicParams.bottomRadius;
        if (dynamicParams.debugShadow !== undefined) this.params.debugShadow = dynamicParams.debugShadow;
        // shadow cascade far 必须每帧同步，否则会用 init 时的旧值（Cesium frustum.far~8e8 → 矩阵 NaN）
        if (dynamicParams.shadowFar !== undefined) this.params.shadowFar = dynamicParams.shadowFar;
        if (dynamicParams.maxShadowLengthRayDistance !== undefined) this.params.maxShadowLengthRayDistance = dynamicParams.maxShadowLengthRayDistance;
        if (dynamicParams.shadowSplitLambda !== undefined) this.params.shadowSplitLambda = dynamicParams.shadowSplitLambda;
        if (dynamicParams.shadowFadeScale !== undefined) this.params.shadowFadeScale = dynamicParams.shadowFadeScale;
        // layer 参数每帧同步，否则 GUI 调 coverage/density 等只影响主云，BSM 阴影不变
        if (dynamicParams.coverages !== undefined) this.params.coverages = dynamicParams.coverages;
        if (dynamicParams.densityScales !== undefined) this.params.densityScales = dynamicParams.densityScales;
        if (dynamicParams.shapeAmounts !== undefined) this.params.shapeAmounts = dynamicParams.shapeAmounts;
        if (dynamicParams.shapeDetailAmounts !== undefined) this.params.shapeDetailAmounts = dynamicParams.shapeDetailAmounts;
        if (dynamicParams.weatherExponents !== undefined) this.params.weatherExponents = dynamicParams.weatherExponents;
        if (dynamicParams.shapeAlteringBiases !== undefined) this.params.shapeAlteringBiases = dynamicParams.shapeAlteringBiases;
        if (dynamicParams.coverageFilterWidths !== undefined) this.params.coverageFilterWidths = dynamicParams.coverageFilterWidths;
        if (dynamicParams.scatteringCoefficient !== undefined) this.params.scatteringCoefficient = dynamicParams.scatteringCoefficient;
        if (dynamicParams.absorptionCoefficient !== undefined) this.params.absorptionCoefficient = dynamicParams.absorptionCoefficient;
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

        // 清理旧资源
        if (this._cesiumColorTexture) this._cesiumColorTexture.destroy();
        if (this._cesiumDepthTexture) this._cesiumDepthTexture.destroy();
        if (this._fbo) { gl.deleteFramebuffer(this._fbo); this._fbo = null; }

        // 核心修正：利用 Cesium 原生的 Texture 类，它会自动处理 Float/Half_Float 扩展与上下文绑定
        const options = {
            context: context,
            width: this.size,
            height: this.size,
            pixelFormat: Cesium.PixelFormat.RGBA,
            pixelDatatype: Cesium.PixelDatatype.HALF_FLOAT, // 强制半浮点，保存巨大的光学深度
            sampler: new Cesium.Sampler({
                minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
                wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
                wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE
            })
        };

        try {
            this._cesiumColorTexture = new Cesium.Texture(options);
            this._cesiumDepthTexture = new Cesium.Texture(options);
            this._useFloatRT = true;
        } catch (e) {
            console.warn("CloudShadowPass: HALF_FLOAT 不支持，降级为 UNSIGNED_BYTE");
            options.pixelDatatype = Cesium.PixelDatatype.UNSIGNED_BYTE;
            this._cesiumColorTexture = new Cesium.Texture(options);
            this._cesiumDepthTexture = new Cesium.Texture(options);
            this._useFloatRT = false;
        }

        // 提取底层 WebGLTexture 供原生 FBO 绑定
        this._colorTexture = this._cesiumColorTexture._texture;
        this._depthVelocityTexture = this._cesiumDepthTexture._texture;
        this._colorTextureTarget = this._cesiumColorTexture._target;

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._colorTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this._depthVelocityTexture, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        
        this._fboComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        if (!this._fboComplete) console.error("CloudShadowPass: FBO 创建失败!");
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

        const isValidDir = (v) =>
            !!v &&
            Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) &&
            (v.x * v.x + v.y * v.y + v.z * v.z) > 1e-12;

        let toSunSource = null;
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
            window.__bsmShadowIntervals = this._shadowIntervals.map(v => [v[0], v[1]]);
            window.__bsmShadowFar = this._shadowFar;
        } catch (e) {
            // ignore
        }
        
        // 构造光源朝向矩阵（lookAt(0, -sunDir, up)）
        const lightOrientation = this._lookAt([0, 0, 0], [-toSun.x, -toSun.y, -toSun.z], [0, 0, 1]);
        const invLightOrientation = new Float32Array(16);
        this._invert(invLightOrientation, lightOrientation);

        // camera.matrixWorld ~= inverseView
        const camInvView = Cesium.Matrix4.clone(cam.inverseViewMatrix, new Cesium.Matrix4());
        const camWorld = new Float32Array(16);
        Cesium.Matrix4.toArray(camInvView, camWorld);

        const cameraToLight = new Float32Array(16);
        this._multiply(cameraToLight, invLightOrientation, camWorld);

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

        for (let ci = 0; ci < SHADOW_CASCADE_COUNT; ci++) {
            const tNear = (splits[ci - 1] ?? 0);
            const tFar = splits[ci];

            const sliceNear = (ci === 0) ? nearCorners : nearCorners.map((p, i) => this._lerp4(nearCorners[i], farCorners[i], tNear));
            const sliceFar = (ci === SHADOW_CASCADE_COUNT - 1) ? farCorners : nearCorners.map((p, i) => this._lerp4(nearCorners[i], farCorners[i], tFar));

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

            // texel snap
            const texelW = (right - left) / mapSize.width;
            const texelH = (top - bottom) / mapSize.height;
            centerLS[0] = Math.round(centerLS[0] / texelW) * texelW;
            centerLS[1] = Math.round(centerLS[1] / texelH) * texelH;

            // center 回到 world：centerWS = lightOrientation * centerLS
            const centerWS4 = this._mulMat4Vec4(lightOrientation, centerLS);
            const centerWS = [centerWS4[0], centerWS4[1], centerWS4[2]];
            const positionWS = [
                centerWS[0] + toSun.x * distance,
                centerWS[1] + toSun.y * distance,
                centerWS[2] + toSun.z * distance
            ];
            const view = this._lookAt(positionWS, centerWS, [0, 0, 1]);

            const shadowMatrix = this._shadowMatrices[ci];
            const invShadowMatrix = this._inverseShadowMatrices[ci];
            this._multiply(shadowMatrix, proj, view);
            this._invert(invShadowMatrix, shadowMatrix);
        }
    }

    /**
     * Bruneton bottom 球(bottomRadius) 与 WGS84 椭球的球心偏移（ECEF 向量）。
     * 算法与 ThreeGeospatialPipeline._getAltitudeCorrectionOffset 一致：
     *   center = surfacePoint - normal * bottomRadius；correction = -center
     * 用于把 ECEF 射线起点对齐到 shader 中 u_bottomRadius 球的坐标系。
     * 返回 [x,y,z] 数组（与 set3f 配合）。
     */
    _getAltitudeCorrectionOffset(bottomRadius) {
        const ellipsoid = this.viewer?.scene?.globe?.ellipsoid;
        const cameraPos = this.viewer?.camera?.positionWC;
        if (!ellipsoid || !cameraPos) return [0, 0, 0];
        const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid);
        if (!carto) return [0, 0, 0];
        const surface = Cesium.Cartesian3.fromRadians(
            carto.longitude, carto.latitude, 0.0, ellipsoid
        );
        const normal = ellipsoid.geodeticSurfaceNormal(surface, new Cesium.Cartesian3());
        const center = Cesium.Cartesian3.subtract(
            surface,
            Cesium.Cartesian3.multiplyByScalar(normal, Number(bottomRadius) || 0, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
        );
        const corr = Cesium.Cartesian3.negate(center, new Cesium.Cartesian3());
        return [corr.x, corr.y, corr.z];
    }

    _lerp4(a, b, t) {
        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t,
            1.0
        ];
    }

    _dist3(a, b) {
        const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    _mulMat4Vec4(m, v) {
        // 列主序
        const x = v[0], y = v[1], z = v[2], w = v[3] ?? 1.0;
        return [
            m[0] * x + m[4] * y + m[8] * z + m[12] * w,
            m[1] * x + m[5] * y + m[9] * z + m[13] * w,
            m[2] * x + m[6] * y + m[10] * z + m[14] * w,
            m[3] * x + m[7] * y + m[11] * z + m[15] * w
        ];
    }

    _expandBBox(bbox, v4) {
        const x = v4[0], y = v4[1], z = v4[2];
        bbox.min[0] = Math.min(bbox.min[0], x);
        bbox.min[1] = Math.min(bbox.min[1], y);
        bbox.min[2] = Math.min(bbox.min[2], z);
        bbox.max[0] = Math.max(bbox.max[0], x);
        bbox.max[1] = Math.max(bbox.max[1], y);
        bbox.max[2] = Math.max(bbox.max[2], z);
    }

    _lookAt(eye, center, up) {
        // 列主序 lookAt（对齐 GLSL/Cesium/three.js）
        // out = view matrix that transforms world -> view
        const out = new Float32Array(16);

        const eyex = eye[0], eyey = eye[1], eyez = eye[2];
        const upx = up[0], upy = up[1], upz = up[2];
        const centerx = center[0], centery = center[1], centerz = center[2];

        if (
            Math.abs(eyex - centerx) < 1e-6 &&
            Math.abs(eyey - centery) < 1e-6 &&
            Math.abs(eyez - centerz) < 1e-6
        ) {
            out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
            out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
            out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
            out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
            return out;
        }

        let z0 = eyex - centerx;
        let z1 = eyey - centery;
        let z2 = eyez - centerz;

        let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
        z0 *= len; z1 *= len; z2 *= len;

        let x0 = upy * z2 - upz * z1;
        let x1 = upz * z0 - upx * z2;
        let x2 = upx * z1 - upy * z0;
        len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
        if (len > 0) {
            len = 1 / len;
            x0 *= len; x1 *= len; x2 *= len;
        }

        const y0 = z1 * x2 - z2 * x1;
        const y1 = z2 * x0 - z0 * x2;
        const y2 = z0 * x1 - z1 * x0;

        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        out[15] = 1;
        return out;
    }

    _ortho(left, right, bottom, top, near, far) {
        // 列主序 ortho（对齐 GLSL/Cesium/three.js）
        const out = new Float32Array(16);
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        out[0] = -2 * lr;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[4] = 0;
        out[5] = -2 * bt;
        out[6] = 0;
        out[7] = 0;
        out[8] = 0;
        out[9] = 0;
        out[10] = 2 * nf;
        out[11] = 0;
        out[12] = (left + right) * lr;
        out[13] = (top + bottom) * bt;
        out[14] = (far + near) * nf;
        out[15] = 1;
        return out;
    }

    _multiply(out, a, b) {
        // 列主序（GLSL / Cesium Matrix4 使用）矩阵乘法：out = a * b
        // 参考 gl-matrix mat4.multiply 的实现，避免投影矩阵转置/错序导致 UV 恒为 0。
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
        const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
        const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
        const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

        out[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
        out[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
        out[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
        out[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

        out[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
        out[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
        out[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
        out[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

        out[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
        out[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
        out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
        out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

        out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
        out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
        out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
        out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
    }

    _invert(out, m) {
        const a00 = m[0], a01 = m[4], a02 = m[8], a03 = m[12];
        const a10 = m[1], a11 = m[5], a12 = m[9], a13 = m[13];
        const a20 = m[2], a21 = m[6], a22 = m[10], a23 = m[14];
        const a30 = m[3], a31 = m[7], a32 = m[11], a33 = m[15];
        const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (!det) return;
        det = 1 / det;
        out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
        out[4] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
        out[8] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
        out[12] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
        out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
        out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
        out[9] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
        out[13] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
        out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
        out[6] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
        out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
        out[14] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
        out[3] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
        out[7] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
        out[11] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
        out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
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
            console.error("CloudShadowPass VS:", gl.getShaderInfoLog(vs));
            gl.deleteShader(vs);
            return;
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, this.getFragmentShader());
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("CloudShadowPass FS:", gl.getShaderInfoLog(fs));
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            return;
        }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("CloudShadowPass link:", gl.getProgramInfoLog(prog));
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
        if (!this.enabled && !force) return;
        const interval = Math.max(1, Number(this.updateInterval || this.params.bsmUpdateInterval) || 1);
        if (!force && this._hasRendered && interval > 1 && (this._renderFrame++ % interval) !== 0) return;
        this._hasRendered = true;
        const scene = this.viewer.scene;
        const context = scene.context;
        const gl = context._gl;
        if (!gl || !this._fbo || !this._program || !this._fboComplete) return;

        this._gl = gl;
        this.updateShadowCascades();

        const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const prevViewport = gl.getParameter(gl.VIEWPORT);
        const prevBlend = gl.isEnabled(gl.BLEND);
        const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
        const prevCullFace = gl.isEnabled(gl.CULL_FACE);

        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
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
        const time = (performance.now() / 1000.0) - (this.params.startTime || 0);

        const set1f = (name, v) => { const loc = locs[name]; if (loc != null) gl.uniform1f(loc, v); };
        const set2f = (name, a, b) => { const loc = locs[name]; if (loc != null) gl.uniform2f(loc, a, b); };
        const set3f = (name, arr) => { const loc = locs[name]; if (loc != null) gl.uniform3fv(loc, arr); };
        const set4f = (name, arr) => { const loc = locs[name]; if (loc != null) gl.uniform4fv(loc, arr); };
        const set1i = (name, v) => { const loc = locs[name]; if (loc != null) gl.uniform1i(loc, v); };

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
        const bindTex = (name, tex, target) => {
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
    }

    /**
     * 返回供主 Pass 使用的纹理。Cesium 绑定用 _texture + _textureTarget。
     */
    getTexture() {
        // if (!this._gl || !this._colorTexture) return null;
        // const target = this._colorTextureTarget;
        // // Cesium UniformSampler 使用 _target（与 Cesium.Texture 的 getter 一致），仅 _textureTarget 会导致绑定失败
        // return { _texture: this._colorTexture, _textureTarget: target, _target: target };
        return this._cesiumColorTexture;
    }

    getDepthVelocityTexture() {
        // if (!this._gl || !this._depthVelocityTexture) return null;
        // return { _texture: this._depthVelocityTexture, _textureTarget: this._gl.TEXTURE_2D, _target: this._gl.TEXTURE_2D };
        return this._cesiumDepthTexture;
    }

    getShadowMatrices() {
        return this._shadowMatrices;
    }

    getShadowIntervals() {
        return this._shadowIntervals;
    }

    getShadowFar() {
        return this._shadowFar;
    }

    getShadowNear() {
        return this._shadowNear;
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
        this._preRenderListener = scene.preRender.addEventListener(() => this.render());
    }

    destroy() {
        if (this._preRenderListener) {
            this._preRenderListener();
            this._preRenderListener = null;
        }
        const gl = this._gl;
        if (gl) {
            if (this._program) gl.deleteProgram(this._program);
            if (this._colorTexture) gl.deleteTexture(this._colorTexture);
            if (this._depthVelocityTexture) gl.deleteTexture(this._depthVelocityTexture);
            if (this._fbo) gl.deleteFramebuffer(this._fbo);
            if (this._vbo) gl.deleteBuffer(this._vbo);
        }
        this._program = null;
        this._locations = null;
        this._positionLoc = null;
        this._colorTexture = null;
        this._depthVelocityTexture = null;
        this._fbo = null;
        this._vbo = null;
        this._gl = null;
    }
}
