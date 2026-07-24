/**
 * ShadowResolvePass - three-geospatial shadowResolve.frag 的 Cesium 适配版：
 * - 输入：BSM atlas (rgba) + depthVelocity atlas (r=depth, g=velx(px), b=vely(px))
 * - 输出：时间域解析后的 BSM atlas（variance clipping + temporalAlpha）
 */
import { getCesium } from "./getCesium.js";
/* eslint-disable @typescript-eslint/no-unused-vars */
const Cesium = getCesium();
export class ShadowResolvePass {
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this.size = options.size || 1024;
        // 对齐 three-geospatial ShadowResolveMaterial 默认≈0.01；运动时 render() 内会抬高
        this.temporalAlpha = options.temporalAlpha ?? 0.01;
        this.varianceGamma = options.varianceGamma ?? 1.0;
        this.updateInterval = Math.max(1, Number(options.updateInterval) || 1);
        this.enabled = options.enabled !== false;
        this._renderFrame = 0;
        this._gl = null;
        this._program = null;
        this._fbo = null;
        this._outTex = null;
        this._historyTex = null;
        this._vbo = null;
        this._locations = null;
        this._useFloatRT = true;
        this._preRenderListener = null;
        this.inputTexture = null;
        this.depthVelocityTexture = null;
        // 相机运动检测：移动时提高 temporalAlpha(多用当前帧)，避免 BSM temporal 累积在
        // 相机移动期产生拖影/抖动(reprojection 不准：cascade 切换 + ortho frustum 滑动 + 低分辨率)。
        // 静止时回退到低 alpha 做时间域降噪。用户现象：移动抖、停止 1~2s 后稳。
        this._prevCamPos = null;
        this._prevCamDir = null;
        this._motionAlpha = this.temporalAlpha;
    }

    setInputTextures(inputTexture, depthVelocityTexture) {
        this.inputTexture = inputTexture;
        this.depthVelocityTexture = depthVelocityTexture;
    }

    getTexture() {
        // 每帧 render() 末尾做了 swap：刚写入的是 _historyTex。Cesium 仅支持 sampler2D，故返回 2D 纹理。
        if (!this._gl || !this._outTex || !this._historyTex) return null;
        return { _texture: this._historyTex, _textureTarget: this._gl.TEXTURE_2D, _target: this._gl.TEXTURE_2D };
    }

    _createTexture() {
        const gl = this._gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (this._useFloatRT) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.size, this.size, 0, gl.RGBA, gl.HALF_FLOAT, null);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    createRT() {
        const gl = this._gl;
        if (!gl) return;

        gl.getExtension("EXT_color_buffer_float");
        gl.getExtension("OES_texture_half_float_linear");

        // 粗略探测 float FBO 可用性
        this._useFloatRT = true;
        const test = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, test);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
        } catch (e) {
            this._useFloatRT = false;
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteTexture(test);

        if (this._outTex) gl.deleteTexture(this._outTex);
        if (this._historyTex) gl.deleteTexture(this._historyTex);
        if (this._fbo) gl.deleteFramebuffer(this._fbo);

        this._outTex = this._createTexture();
        this._historyTex = this._createTexture();

        this._fbo = gl.createFramebuffer();
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
        return `#version 300 es
precision highp float;

uniform sampler2D u_inputBuffer;
uniform sampler2D u_depthVelocityBuffer;
uniform sampler2D u_historyBuffer;

uniform vec2 u_texelSize;
uniform float u_varianceGamma;
uniform float u_temporalAlpha;

in vec2 v_uv;
out vec4 out_color;

vec4 clipAABB(const vec4 current, const vec4 history, const vec4 minColor, const vec4 maxColor) {
  vec3 pClip = 0.5 * (maxColor.rgb + minColor.rgb);
  vec3 eClip = 0.5 * (maxColor.rgb - minColor.rgb) + 1e-7;
  vec4 vClip = history - vec4(pClip, current.a);
  vec3 vUnit = vClip.xyz / eClip;
  vec3 aUnit = abs(vUnit);
  float maUnit = max(aUnit.x, max(aUnit.y, aUnit.z));
  if (maUnit > 1.0) {
    return vec4(pClip, current.a) + vClip / maUnit;
  }
  return history;
}

#define ACCUMULATE_VARIANCE(buf, coord, ox, oy) { \
  vec4 n = textureOffset(buf, coord, ivec2(ox, oy)); \
  moment1 += n; moment2 += n * n; }

vec4 varianceClipping(const sampler2D inputBuffer, const vec2 coord, const vec4 current, const vec4 history, const float gamma) {
  vec4 moment1 = current;
  vec4 moment2 = current * current;
  ACCUMULATE_VARIANCE(inputBuffer, coord, -1, -1)
  ACCUMULATE_VARIANCE(inputBuffer, coord, -1,  1)
  ACCUMULATE_VARIANCE(inputBuffer, coord,  1, -1)
  ACCUMULATE_VARIANCE(inputBuffer, coord,  1,  1)
  ACCUMULATE_VARIANCE(inputBuffer, coord,  1,  0)
  ACCUMULATE_VARIANCE(inputBuffer, coord,  0, -1)
  ACCUMULATE_VARIANCE(inputBuffer, coord,  0,  1)
  ACCUMULATE_VARIANCE(inputBuffer, coord, -1,  0)
  const float N = 9.0;
  vec4 mean = moment1 / N;
  vec4 vg = sqrt(max(moment2 / N - mean * mean, 0.0)) * gamma;
  vec4 minColor = mean - vg;
  vec4 maxColor = mean + vg;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}

#define CHECK_CLOSEST(buf, coord, ox, oy) { \
  vec4 n = texelFetchOffset(buf, coord, 0, ivec2(ox, oy)); \
  if (n.r < result.r) result = n; }

vec4 getClosestFragment() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec4 result = texelFetch(u_depthVelocityBuffer, coord, 0);
  CHECK_CLOSEST(u_depthVelocityBuffer, coord, -1, -1)
  CHECK_CLOSEST(u_depthVelocityBuffer, coord, -1,  0)
  CHECK_CLOSEST(u_depthVelocityBuffer, coord, -1,  1)
  CHECK_CLOSEST(u_depthVelocityBuffer, coord,  0, -1)
  CHECK_CLOSEST(u_depthVelocityBuffer, coord,  0,  1)
  CHECK_CLOSEST(u_depthVelocityBuffer, coord,  1, -1)
  CHECK_CLOSEST(u_depthVelocityBuffer, coord,  1,  0)
  CHECK_CLOSEST(u_depthVelocityBuffer, coord,  1,  1)
  return result;
}

void main() {
  vec4 current = texture(u_inputBuffer, v_uv);
  vec4 depthVelocity = getClosestFragment();
  vec2 velocityUv = depthVelocity.gb * u_texelSize;
  vec2 prevUv = v_uv - velocityUv;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    out_color = current;
    return;
  }
  vec4 history = texture(u_historyBuffer, prevUv);
  vec4 clipped = varianceClipping(u_inputBuffer, v_uv, current, history, u_varianceGamma);
  out_color = mix(clipped, current, u_temporalAlpha);
}
`;
    }

    createProgram() {
        const gl = this._gl;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, this.getVertexShader());
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error("ShadowResolvePass VS:", gl.getShaderInfoLog(vs));
            gl.deleteShader(vs);
            return;
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, this.getFragmentShader());
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("ShadowResolvePass FS:", gl.getShaderInfoLog(fs));
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            return;
        }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("ShadowResolvePass link:", gl.getProgramInfoLog(prog));
            gl.deleteProgram(prog);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            return;
        }
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        this._program = prog;
        this._locations = {
            texelSize: gl.getUniformLocation(prog, "u_texelSize"),
            varianceGamma: gl.getUniformLocation(prog, "u_varianceGamma"),
            temporalAlpha: gl.getUniformLocation(prog, "u_temporalAlpha"),
            inputBuffer: gl.getUniformLocation(prog, "u_inputBuffer"),
            depthVelocityBuffer: gl.getUniformLocation(prog, "u_depthVelocityBuffer"),
            historyBuffer: gl.getUniformLocation(prog, "u_historyBuffer"),
            position: gl.getAttribLocation(prog, "a_position")
        };
    }

    render(force = false) {
        if (!this.enabled && !force) return;
        const interval = Math.max(1, Number(this.updateInterval) || 1);
        if (!force && interval > 1 && (this._renderFrame++ % interval) !== 0) return;
        const gl = this._gl;
        if (!gl || !this._fbo || !this._program || !this._outTex || !this._historyTex) return;
        if (!this.inputTexture || !this.depthVelocityTexture) return;

        // 相机运动量 → temporalAlpha：移动越大 alpha 越高(趋近1=纯当前帧，无累积拖影)，
        // 静止时回到 this.temporalAlpha 做时间域降噪。
        const cam = this.viewer?.scene?.camera;
        let motion = 0.0;
        if (cam) {
            const pos = cam.positionWC; const dir = cam.directionWC;
            if (this._prevCamPos) {
                const dp = Cesium.Cartesian3.distance(pos, this._prevCamPos);
                const dd = Math.abs(Cesium.Cartesian3.dot(dir, this._prevCamDir) - 1.0);
                // 位置每米 + 方向每弧度(1-cos) 综合归一化。云阴影掠射时 BSM 内特征滑动放大，
                // 故对微小运动也敏感：1m/帧 或 0.1°/帧 即触发。
                motion = Math.min(1.0, dp * 2e-3 + dd * 100.0);
            }
            this._prevCamPos = Cesium.Cartesian3.clone(pos, this._prevCamPos);
            this._prevCamDir = Cesium.Cartesian3.clone(dir, this._prevCamDir);
        }
        const stillAlpha = this.temporalAlpha;
        // smoothstep：motion 0→0.01 从 stillAlpha 升到 1.0。移动期几乎纯当前帧。
        const t = Math.min(1.0, Math.max(0.0, motion / 0.01));
        this._motionAlpha = stillAlpha + (1.0 - stillAlpha) * (t * t * (3.0 - 2.0 * t));

        const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const prevViewport = gl.getParameter(gl.VIEWPORT);
        const prevBlend = gl.isEnabled(gl.BLEND);
        const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._outTex, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.viewport(0, 0, this.size, this.size);
        gl.useProgram(this._program);

        const loc = this._locations || {};
        if (loc.texelSize) gl.uniform2f(loc.texelSize, 1.0 / this.size, 1.0 / this.size);
        if (loc.varianceGamma) gl.uniform1f(loc.varianceGamma, this.varianceGamma);
        if (loc.temporalAlpha) gl.uniform1f(loc.temporalAlpha, this._motionAlpha);

        let unit = 0;
        const bind = (locRef, texObj) => {
            if (locRef === null || locRef === undefined) return;
            gl.uniform1i(locRef, unit);
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, texObj._texture ?? texObj);
            unit++;
        };
        bind(loc.inputBuffer, this.inputTexture);
        bind(loc.depthVelocityBuffer, this.depthVelocityTexture);
        bind(loc.historyBuffer, { _texture: this._historyTex });

        const posLoc = loc.position ?? -1;
        if (posLoc >= 0 && this._vbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.disableVertexAttribArray(posLoc);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
        gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
        if (prevBlend) gl.enable(gl.BLEND);
        if (prevDepthTest) gl.enable(gl.DEPTH_TEST);

        // swap out/history
        const tmp = this._historyTex;
        this._historyTex = this._outTex;
        this._outTex = tmp;
    }

    init() {
        const scene = this.viewer.scene;
        const gl = scene.context._gl;
        if (!gl) return;
        this._gl = gl;
        this.createRT();
        this.createProgram();
        // fullscreen 三角形 VBO 只创建一次，避免 resolve pass 每帧触发 GL buffer 分配/删除。
        this._vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
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
            if (this._outTex) gl.deleteTexture(this._outTex);
            if (this._historyTex) gl.deleteTexture(this._historyTex);
            if (this._fbo) gl.deleteFramebuffer(this._fbo);
            if (this._vbo) gl.deleteBuffer(this._vbo);
        }
        this._program = null;
        this._outTex = null;
        this._historyTex = null;
        this._vbo = null;
        this._locations = null;
        this._fbo = null;
        this._gl = null;
    }
}

