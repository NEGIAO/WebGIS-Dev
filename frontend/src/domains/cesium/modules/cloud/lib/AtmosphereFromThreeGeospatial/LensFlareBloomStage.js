/**
 * Lens Flare + Bloom 后处理阶段（接在大气之后使用）。
 * 太阳在屏幕内且未被地球/几何遮挡时，叠加程序化鬼影 + 光晕 + 太阳周围 Bloom。
 * 参考 AtmosphereBrunetonProcess 的镜头眩光与 three-geospatial 的 Lens Flare 思路。
 *
 * 用法（在大气之后加入）：
 *   const atmosphere = new AtmospherePostProcess(viewer);
 *   await atmosphere.init();
 *   const lensFlare = new LensFlareBloomStage(viewer, { bloomIntensity: 0.05, ghostIntensity: 0.005 });
 *   lensFlare.init();
 *   lensFlare.createGUI();  // 可选：用 dat.gui 调节 0–5、步长 0.1
 */

// dat.gui 为可选依赖：仅 createGUI() 时使用 window.dat

import { getCesium } from "../getCesium.js";
/* eslint-disable @typescript-eslint/no-this-alias */
const Cesium = getCesium();
const LENS_FLARE_FRAGMENT = `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
in vec2 v_textureCoordinates;

uniform vec3 u_cameraPositionWC;
uniform vec3 u_sunDirectionWC;
uniform float u_bottomRadiusMeters;
uniform float u_bloomIntensity;
uniform float u_ghostIntensity;
uniform float u_haloIntensity;

const float SUN_DISTANCE = 1e6;

float raySphereIntersect(vec3 ro, vec3 rd, float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  return -b - sqrt(d);
}

float getGhost(vec2 uv, vec2 sunUV, float offset, float size) {
  vec2 center = vec2(0.5);
  vec2 sunToCenter = center - sunUV;
  vec2 ghostVec = sunToCenter * offset;
  vec2 ghostPos = center + ghostVec;
  float dist = length(uv - ghostPos);
  return exp(-dist * dist * size);
}

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);

  vec4 sunWorld = vec4(u_cameraPositionWC + u_sunDirectionWC * SUN_DISTANCE, 1.0);
  vec4 sunClip = czm_projection * czm_view * sunWorld;
  if (sunClip.w <= 0.0) {
    out_FragColor = color;
    return;
  }
  vec2 sunNDC = sunClip.xy / sunClip.w;
  vec2 sunUV = sunNDC * 0.5 + 0.5;

  bool sunInScreen = sunUV.x >= 0.0 && sunUV.x <= 1.0 && sunUV.y >= 0.0 && sunUV.y <= 1.0;
  if (!sunInScreen) {
    out_FragColor = color;
    return;
  }

  float sunVis = 1.0;
  float tHit = raySphereIntersect(u_cameraPositionWC, u_sunDirectionWC, u_bottomRadiusMeters);
  if (tHit > 0.0 && tHit < SUN_DISTANCE) sunVis = 0.0;
  if (sunVis > 0.0) {
    float depthAtSun = czm_readDepth(depthTexture, sunUV);
    if (depthAtSun < 0.999999) sunVis = 0.0;
  }

  if (sunVis < 0.01) {
    out_FragColor = color;
    return;
  }

  vec2 uv = v_textureCoordinates;
  float ghostSize = 650.0;

  vec3 flare = vec3(0.0);
  flare += getGhost(uv, sunUV, -5.0, ghostSize * 0.5) * vec3(0.8, 0.8, 1.0) * 0.012;
  flare += getGhost(uv, sunUV, -1.5, ghostSize) * vec3(1.0, 0.8, 0.4) * 0.02;
  flare += getGhost(uv, sunUV, -0.4, ghostSize) * vec3(0.9, 1.0, 0.8) * 0.02;
  flare += getGhost(uv, sunUV, -0.2, ghostSize) * vec3(1.0, 0.8, 0.4) * 0.025;
  flare += getGhost(uv, sunUV, -0.1, ghostSize) * vec3(0.9, 0.7, 0.7) * 0.025;
  flare += getGhost(uv, sunUV, 0.7, ghostSize) * vec3(0.5, 1.0, 0.4) * 0.015;
  flare += getGhost(uv, sunUV, 1.0, ghostSize) * vec3(0.5, 0.5, 0.5) * 0.02;
  flare += getGhost(uv, sunUV, 2.5, ghostSize) * vec3(1.0, 1.0, 0.6) * 0.02;
  flare += getGhost(uv, sunUV, 10.0, ghostSize * 0.5) * vec3(0.5, 0.8, 1.0) * 0.01;

  float bloom = exp(-length(uv - sunUV) * 28.0) * 0.25;
  flare += bloom * vec3(1.0, 0.9, 0.8);
  flare *= sunVis * u_ghostIntensity;

  float haloVal = exp(-length(uv - sunUV) * 12.0) * 0.15 * sunVis * u_haloIntensity;
  vec3 halo = vec3(1.0, 0.98, 0.95) * haloVal;

  vec3 bloomSample = texture(colorTexture, sunUV).rgb;
  float bloomMask = exp(-length(uv - sunUV) * 15.0) * sunVis * u_bloomIntensity;
  vec3 bloomEffect = bloomSample * bloomMask;

  // Screen blend: 1 - (1-base)*(1-effect), prevents over-saturation
  vec3 totalEffect = flare + halo + bloomEffect;
  color.rgb = 1.0 - (1.0 - color.rgb) * (1.0 - totalEffect);

  out_FragColor = color;
}
`;

/**
 * 在已有场景/大气之上叠加 Lens Flare + Bloom。
 * @param {Cesium.Viewer} viewer
 * @param {object} options
 * @param {number} [options.bloomIntensity=0.05] 与 three-geospatial LensFlareNode.bloomIntensity 默认一致
 * @param {number} [options.ghostIntensity=0.005] three 源码为 1e-5，Storybook 示例用 0.005 更易见
 * @param {number} [options.haloIntensity=0.005] three 源码为 1e-5，Storybook 示例用 0.005
 * @param {number} [options.bottomRadiusMeters] 地表半径（米），不传则用 6371000
 */
export class LensFlareBloomStage {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.bloomIntensity = options.bloomIntensity ?? 0.01;
    this.ghostIntensity = options.ghostIntensity ?? 0.001;
    this.haloIntensity = options.haloIntensity ?? 0.001;
    this.bottomRadiusMeters = options.bottomRadiusMeters ?? 6371000;
    this.stage = null;
    this._gui = null;
  }

  /**
   * 用 dat.gui 创建控制器：bloomIntensity / ghostIntensity / haloIntensity，范围 0–5，步长 0.1。
   * 调用 init() 之后调用即可；destroy() 时会一并关闭。
   */
  createGUI() {
    if (this._gui) return;
    const dat = typeof window !== 'undefined' && window.dat ? window.dat : null;
    if (!dat?.GUI) {
      console.warn('[LensFlare] 未找到 dat.GUI，跳过调试面板');
      return;
    }
    this._gui = new dat.GUI({ name: 'Lens Flare' });
    const folder = this._gui.addFolder('Lens Flare');
    folder.add(this, 'bloomIntensity', 0, 5.0, 0.001).name('bloomIntensity');
    folder.add(this, 'ghostIntensity', 0, 5.0, 0.001).name('ghostIntensity');
    folder.add(this, 'haloIntensity', 0, 5.0, 0.001).name('haloIntensity');
    folder.open();
  }

  /**
   * 创建并加入后处理链。需在大气阶段之后调用。
   */
  init() {
    if (this.stage) return;
    // this.createGUI();
    const scene = this.viewer.scene;
    const self = this;

    this.stage = new Cesium.PostProcessStage({
      name: 'LensFlareBloom',
      fragmentShader: LENS_FLARE_FRAGMENT,
      uniforms: {
        u_cameraPositionWC: () => self.viewer.camera.positionWC.clone(),
        u_sunDirectionWC: () =>
          (scene.context?.uniformState?.sunDirectionWC ?? new Cesium.Cartesian3(1, 0, 0)).clone(),
        u_bottomRadiusMeters: () => self.bottomRadiusMeters,
        u_bloomIntensity: () => self.bloomIntensity,
        u_ghostIntensity: () => self.ghostIntensity,
        u_haloIntensity: () => self.haloIntensity,
      },
    });

    scene.postProcessStages.add(this.stage);
  }

  setBloomIntensity(v) {
    this.bloomIntensity = v;
  }
  setGhostIntensity(v) {
    this.ghostIntensity = v;
  }
  setHaloIntensity(v) {
    this.haloIntensity = v;
  }

  destroy() {
    if (this._gui) {
      this._gui.destroy();
      this._gui = null;
    }
    if (this.stage && this.viewer.scene.postProcessStages) {
      this.viewer.scene.postProcessStages.remove(this.stage);
      this.stage = null;
    }
  }
}

export default LensFlareBloomStage;
