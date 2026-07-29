/**
 * Three.js 热带浅水场景组合式函数
 * 封装完整的 Three.js 场景生命周期管理
 * 作为 Cesium 叠加层使用
 */

import { ref, onUnmounted } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { addCaustics } from '../shaders/caustics.glsl';
import { waterVertexShader, waterFragmentShader } from '../shaders/waterSurface.glsl';
import { cloudVertexShader, cloudFragmentShader } from '../shaders/clouds.glsl';
import {
  makeWaterNormalMap,
  makeSandTexture,
  makeCloudNoiseTex,
} from '../utils/textures';

/**
 * 创建热带浅水场景
 *
 * @param {Object} options - 配置选项
 * @param {Function} options.onReady - 场景就绪回调
 * @param {Function} options.onError - 错误回调
 * @param {Function} options.onFpsUpdate - FPS 更新回调
 * @returns {Object} 场景控制接口
 */
export function useShallowWater(options = {}) {
  const { onReady, onError, onFpsUpdate } = options;

  // 响应式状态
  const isReady = ref(false);
  const fps = ref(0);

  // Three.js 核心对象
  let scene = null;
  let camera = null;
  let renderer = null;
  let controls = null;
  let animationId = null;
  let container = null;

  // 水面相关
  let water = null;
  let refractionRT = null;
  let cubeCamera = null;
  let cubeRT = null;
  let pmrem = null;

  // 天空和光照
  let sky = null;
  let sunLight = null;
  const sun = new THREE.Vector3();

  // 体积云和闪电
  let cloudDome = null;
  let boltGroup = null;
  let boltMat = null;

  // 时钟
  const clock = new THREE.Clock();
  let frameCount = 0;
  let lastFpsTime = 0;

  // 共享 uniform
  const uTime = { value: 0 };
  const uCaustic = { value: 0.9 };
  const uFlash = { value: 0 };
  const uFlashPos = { value: new THREE.Vector3() };

  // 闪电状态
  let nextStrikeAt = 3.0;
  let strikeStart = -100;
  const baseExposure = 0.62;

  // 键盘状态
  const keys = {};

  // 离屏/环境状态
  let needCubeUpdate = true;
  let envRT = null;
  const skyScene = new THREE.Scene();

  // 当前参数
  const currentParams = {
    elevation: 30,
    azimuth: 150,
    clarity: 0.085,
    causticStrength: 0.9,
    waterColor: '#2bb3c4',
    waveHeight: 0.5,
    foamWidth: 2.4,
    reflection: 0.38,
    cloudCoverage: 0.58,
    lightningEnabled: true,
    lightningInterval: 2.0,
  };

  /**
   * 初始化场景
   * @param {HTMLElement} targetContainer - 目标容器
   */
  async function init(targetContainer) {
    if (!targetContainer) {
      onError?.(new Error('Container element not provided'));
      return;
    }

    if (isReady.value) return;

    container = targetContainer;

    try {
      // 创建渲染器
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true, // 透明背景，与 Cesium 融合
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = baseExposure;
      renderer.setClearColor(0x000000, 0); // 透明背景
      container.appendChild(renderer.domElement);

      // 创建场景
      scene = new THREE.Scene();

      // 创建相机
      camera = new THREE.PerspectiveCamera(
        55,
        container.clientWidth / container.clientHeight,
        1,
        20000
      );
      camera.position.set(0, 55, 280);

      // 初始化各模块
      initSky();
      initClouds();
      initLightning();
      initLights();
      initSeaFloor();
      initRocks();
      initRenderTargets();
      initWater();
      initControls();
      initKeyboard();
      updateSun();

      // 标记就绪
      isReady.value = true;
      onReady?.();

    } catch (error) {
      onError?.(error);
    }
  }

  function initSky() {
    sky = new Sky();
    sky.scale.setScalar(12000);
    scene.add(sky);

    const su = sky.material.uniforms;
    su['turbidity'].value = 6;
    su['rayleigh'].value = 1.6;
    su['mieCoefficient'].value = 0.005;
    su['mieDirectionalG'].value = 0.8;
  }

  function initLights() {
    sunLight = new THREE.DirectionalLight(0xfff4e0, 2.6);
    scene.add(sunLight);
    scene.add(new THREE.HemisphereLight(0xcfefff, 0x20506a, 0.7));
  }

  function initSeaFloor() {
    const floorGeo = new THREE.PlaneGeometry(1600, 1600, 200, 200);
    floorGeo.rotateX(-Math.PI / 2);

    const p = floorGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const t = THREE.MathUtils.clamp((z + 800) / 1600, 0, 1);

      let y = -34 + t * 44;
      y += Math.sin(x * 0.012) * Math.cos(z * 0.014) * 3.5;
      y += Math.sin(x * 0.06 + z * 0.05) * 1.1;
      y += (Math.random() - 0.5) * 0.6;

      p.setY(i, y);
    }

    floorGeo.computeVertexNormals();

    const floorMat = new THREE.MeshStandardMaterial({
      map: makeSandTexture(),
      roughness: 1.0,
      metalness: 0.0,
    });
    addCaustics(floorMat, { uTime, uCaustic });

    scene.add(new THREE.Mesh(floorGeo, floorMat));
  }

  function initRocks() {
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockColors = [0x7a6e5a, 0x6b5b4a, 0xb5654a, 0xcf7d63, 0x8a9a5b];

    for (let i = 0; i < 30; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: rockColors[i % rockColors.length],
        roughness: 0.9,
        flatShading: true,
      });
      addCaustics(mat, { uTime, uCaustic });

      const r = new THREE.Mesh(rockGeo, mat);
      const s = 3 + Math.random() * 9;
      r.scale.set(s, s * (0.5 + Math.random() * 0.6), s);
      r.position.set(
        (Math.random() - 0.5) * 1100,
        -24 + Math.random() * 22,
        -300 + Math.random() * 900
      );
      r.rotation.set(Math.random(), Math.random(), Math.random());
      scene.add(r);
    }
  }

  function initRenderTargets() {
    pmrem = new THREE.PMREMGenerator(renderer);

    cubeRT = new THREE.WebGLCubeRenderTarget(256, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    cubeCamera = new THREE.CubeCamera(1, 20000, cubeRT);
    cubeCamera.position.set(0, 4, 0);
    scene.add(cubeCamera);

    const db = new THREE.Vector2();
    renderer.getDrawingBufferSize(db);
    refractionRT = new THREE.WebGLRenderTarget(db.x, db.y);
    refractionRT.depthTexture = new THREE.DepthTexture(db.x, db.y);
    refractionRT.depthTexture.type = THREE.UnsignedIntType;
    refractionRT.depthTexture.format = THREE.DepthFormat;
  }

  function initWater() {
    const db = new THREE.Vector2();
    renderer.getDrawingBufferSize(db);
    const normalMap = makeWaterNormalMap(256);

    const uniforms = {
      uTime: uTime,
      tRefraction: { value: refractionRT.texture },
      tDepth: { value: refractionRT.depthTexture },
      tEnv: { value: cubeRT.texture },
      normalMap: { value: normalMap },
      resolution: { value: db.clone() },
      cameraNear: { value: camera.near },
      cameraFar: { value: camera.far },
      invProjection: { value: new THREE.Matrix4() },
      camWorld: { value: new THREE.Matrix4() },
      sunDirection: { value: new THREE.Vector3() },
      sunColor: { value: new THREE.Color(0xfff3da) },
      waterColor: { value: new THREE.Color(currentParams.waterColor) },
      absorption: { value: new THREE.Vector3(0.45, 0.09, 0.05) },
      foamColor: { value: new THREE.Color(0xf2ffff) },
      clarity: { value: currentParams.clarity },
      foamWidth: { value: currentParams.foamWidth },
      waveHeight: { value: currentParams.waveHeight },
      reflection: { value: currentParams.reflection },
    };

    water = new THREE.Mesh(
      new THREE.PlaneGeometry(16000, 16000, 384, 384),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
      })
    );
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
  }

  function initClouds() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: uTime,
        uNoise: { value: makeCloudNoiseTex(256) },
        sunDirection: { value: new THREE.Vector3() },
        sunColor: { value: new THREE.Color(0xfff0dd) },
        skyTint: { value: new THREE.Color(0x6f9fce) },
        uCoverage: { value: currentParams.cloudCoverage },
        uFlash: uFlash,
        uFlashPos: uFlashPos,
      },
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
    });

    cloudDome = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), mat);
    cloudDome.renderOrder = 2;
    scene.add(cloudDome);
  }

  function initLightning() {
    boltMat = new THREE.MeshBasicMaterial({
      color: 0xdcebff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    boltGroup = new THREE.Group();
    boltGroup.visible = false;
    scene.add(boltGroup);
  }

  function addBolt(sx, sz, top, bottom, spread, radius) {
    const pts = [];
    let cx = sx, cz = sz;
    const seg = Math.max(5, Math.floor((top - bottom) / 80));

    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      pts.push(new THREE.Vector3(cx, top + (bottom - top) * t, cz));
      cx += (Math.random() - 0.5) * spread;
      cz += (Math.random() - 0.5) * spread;
    }

    const geo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts),
      seg * 4,
      radius,
      5,
      false
    );
    const mesh = new THREE.Mesh(geo, boltMat);
    mesh.renderOrder = 3;
    boltGroup.add(mesh);

    return pts;
  }

  function buildBolts() {
    for (const c of boltGroup.children) c.geometry.dispose();
    boltGroup.clear();

    const trunks = 1 + Math.floor(Math.random() * 3);
    let fx = 0, fz = 0;

    for (let k = 0; k < trunks; k++) {
      const x = (Math.random() - 0.5) * 5000;
      const z = -(1000 + Math.random() * 4500);

      if (k === 0) {
        fx = x;
        fz = z;
      }

      const main = addBolt(x, z, 1180, 18, 110, 14.0);

      const nb = 2 + Math.floor(Math.random() * 3);
      for (let b = 0; b < nb; b++) {
        const sp = main[2 + Math.floor(Math.random() * (main.length - 4))];
        addBolt(sp.x, sp.z, sp.y, sp.y - (160 + Math.random() * 420), 130, 7.0);
      }
    }

    uFlashPos.value.set(fx, 1100, fz);
  }

  function updateLightning() {
    if (!currentParams.lightningEnabled) {
      uFlash.value = 0;
      boltGroup.visible = false;
      renderer.toneMappingExposure = baseExposure;
      return;
    }

    const now = uTime.value;

    if (now >= nextStrikeAt) {
      strikeStart = now;
      buildBolts();
      nextStrikeAt = now + currentParams.lightningInterval * (0.4 + Math.random() * 0.8);
    }

    const tf = now - strikeStart;
    let f = 0;
    if (tf >= 0.0 && tf < 0.5) {
      f = Math.max(0, Math.exp(-tf * 5.5) * (0.5 + 0.5 * Math.sin(tf * 60.0)));
    }

    uFlash.value = f * 2.4;
    boltGroup.visible = f > 0.1;
    boltMat.opacity = Math.min(1, f * 1.7);

    renderer.toneMappingExposure = baseExposure + f * 0.75;
  }

  function initControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 130, -400);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 30;
    controls.maxDistance = 2000;
    controls.enableDamping = true;
  }

  function initKeyboard() {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }

  function handleKeyDown(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    keys[e.code] = true;
  }

  function handleKeyUp(e) {
    keys[e.code] = false;
  }

  function moveCamera(dt) {
    const speed = (keys['ShiftLeft'] || keys['ShiftRight'] ? 240 : 95) * dt;
    const _fwd = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _move = new THREE.Vector3();

    camera.getWorldDirection(_fwd).normalize();
    _right.crossVectors(_fwd, camera.up).normalize();
    _move.set(0, 0, 0);

    if (keys['KeyW']) _move.add(_fwd);
    if (keys['KeyS']) _move.addScaledVector(_fwd, -1);
    if (keys['KeyD']) _move.add(_right);
    if (keys['KeyA']) _move.addScaledVector(_right, -1);
    if (keys['KeyE']) _move.y += 1;
    if (keys['KeyQ']) _move.y -= 1;

    if (_move.lengthSq() === 0) return;

    _move.normalize().multiplyScalar(speed);
    camera.position.add(_move);
    controls.target.add(_move);

    if (camera.position.y < 2.5) camera.position.y = 2.5;
  }

  function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - currentParams.elevation);
    const theta = THREE.MathUtils.degToRad(currentParams.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);

    sky.material.uniforms['sunPosition'].value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(1000);

    if (water) {
      water.material.uniforms.sunDirection.value.copy(sun).normalize();
    }

    if (cloudDome) {
      cloudDome.material.uniforms.sunDirection.value.copy(sun).normalize();
      const warm = THREE.MathUtils.clamp(1.0 - currentParams.elevation / 28, 0, 1);
      cloudDome.material.uniforms.sunColor.value.setRGB(
        1.0,
        0.95 - 0.22 * warm,
        0.86 - 0.48 * warm
      );
    }

    scene.remove(sky);
    skyScene.add(sky);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(skyScene);
    scene.environment = envRT.texture;
    skyScene.remove(sky);
    scene.add(sky);

    needCubeUpdate = true;
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    const dt = clock.getDelta();
    uTime.value += dt;
    uCaustic.value = currentParams.causticStrength;

    moveCamera(dt);
    updateLightning();
    controls.update();
    camera.updateMatrixWorld();

    water.material.uniforms.invProjection.value.copy(camera.projectionMatrixInverse);
    water.material.uniforms.camWorld.value.copy(camera.matrixWorld);

    water.visible = false;
    if (needCubeUpdate) {
      cubeCamera.update(renderer, scene);
      needCubeUpdate = false;
    }

    cloudDome.visible = false;
    const boltVis = boltGroup.visible;
    boltGroup.visible = false;
    renderer.setRenderTarget(refractionRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    cloudDome.visible = true;
    boltGroup.visible = boltVis;
    water.visible = true;

    renderer.render(scene, camera);

    // 更新 FPS
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      fps.value = Math.round(frameCount * 1000 / (now - lastFpsTime));
      onFpsUpdate?.(fps.value);
      frameCount = 0;
      lastFpsTime = now;
    }
  }

  function handleResize() {
    if (!camera || !renderer || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);

    const db = new THREE.Vector2();
    renderer.getDrawingBufferSize(db);
    refractionRT.setSize(db.x, db.y);
    water.material.uniforms.resolution.value.copy(db);
  }

  function start() {
    if (animationId) return;
    clock.start();
    animate();
  }

  function pause() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  /**
   * 更新参数
   * @param {Object} newParams - 新参数
   */
  function updateParams(newParams) {
    const oldParams = { ...currentParams };
    Object.assign(currentParams, newParams);

    // 太阳位置变化
    if (
      newParams.elevation !== oldParams.elevation ||
      newParams.azimuth !== oldParams.azimuth
    ) {
      updateSun();
    }

    // 水面参数变化
    if (water) {
      if (newParams.clarity !== oldParams.clarity) {
        water.material.uniforms.clarity.value = newParams.clarity;
      }
      if (newParams.waveHeight !== oldParams.waveHeight) {
        water.material.uniforms.waveHeight.value = newParams.waveHeight;
      }
      if (newParams.foamWidth !== oldParams.foamWidth) {
        water.material.uniforms.foamWidth.value = newParams.foamWidth;
      }
      if (newParams.reflection !== oldParams.reflection) {
        water.material.uniforms.reflection.value = newParams.reflection;
      }
      if (newParams.waterColor !== oldParams.waterColor) {
        water.material.uniforms.waterColor.value.set(newParams.waterColor);
      }
    }

    // 焦散强度
    if (newParams.causticStrength !== oldParams.causticStrength) {
      uCaustic.value = newParams.causticStrength;
    }

    // 云量
    if (newParams.cloudCoverage !== oldParams.cloudCoverage && cloudDome) {
      cloudDome.material.uniforms.uCoverage.value = newParams.cloudCoverage;
    }
  }

  function dispose() {
    pause();

    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);

    if (renderer) {
      renderer.dispose();
      container?.removeChild(renderer.domElement);
    }

    scene?.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    refractionRT?.dispose();
    cubeRT?.dispose();
    envRT?.dispose();
    pmrem?.dispose();

    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    water = null;
    sky = null;
    sunLight = null;
    cloudDome = null;
    boltGroup = null;
    boltMat = null;
    isReady.value = false;
  }

  onUnmounted(() => {
    dispose();
  });

  return {
    isReady,
    fps,
    init,
    start,
    pause,
    dispose,
    handleResize,
    updateParams,
  };
}
