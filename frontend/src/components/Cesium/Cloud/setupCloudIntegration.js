/**
 * 体积云 + Bruneton 大气管线与 Vue 响应式参数的桥接。
 *
 * 生命周期：
 * - cloudsEnabled=false：不加载资源，保持 Cesium 原生天空
 * - cloudsEnabled=true：懒加载 createCloudAtmosphere + 可选 LensFlare，关闭原生 skyAtmosphere/skyBox
 * - 再次关闭 / 组件卸载：destroy 管线并恢复天空快照
 *
 * @module Cloud/setupCloudIntegration
 */

import { watch } from 'vue';
import { resolveWebgisCloudAssetPaths } from './assetConfig.js';
import { applyCloudPanelParams, applyLensFlareParams } from './cloudParamsApply.js';

/**
 * @param {object} opts
 * @param {import('cesium').Viewer} opts.viewer
 * @param {import('vue').Ref<Record<string, unknown>>} opts.cloudParams
 * @param {import('vue').Ref<Record<string, unknown>>} [opts.atmosphereParams] - 保留参数兼容旧调用，当前不直接使用
 * @param {import('vue').Ref<Record<string, boolean>>} [opts.advancedEffectControls] - Tellux 大气开关（启用体积云时临时关闭，避免底图过曝涂白）
 * @param {boolean} [opts.enableGui=false]
 * @param {object} [opts.message] - Naive UI useMessage() 实例，用于显示加载/成功/失败提示
 * @returns {() => void} cleanup
 */
export function setupCloudIntegration({
  viewer,
  cloudParams,
  atmosphereParams: _atmosphereParams,
  advancedEffectControls,
  enableGui = false,
  message: msg,
} = {}) {
  if (!viewer) {
    console.warn('[Cloud] setupCloudIntegration: viewer 为空');
    return () => {};
  }

  /** @type {import('./lib/ThreeGeospatialPipeline.js').ThreeGeospatialPipeline | null} */
  let pipeline = null;
  /** @type {import('./lib/AtmosphereFromThreeGeospatial/LensFlareBloomStage.js').LensFlareBloomStage | null} */
  let lensFlare = null;
  /** @type {Promise<void> | null} */
  let initPromise = null;
  let disposed = false;
  /** @type {string|null} */
  let loadingMsgId = null;
  /** deep watch 帧级合并：同一帧内多次滑杆/对象变化只在下一 rAF 应用一次，降低主线程抖动 */
  let applyRafId = 0;
  /** @type {Record<string, unknown> | null} */
  let pendingApplyParams = null;

  /** 启用管线前的 Cesium 原生天空快照 */
  const skySnapshot = captureSkyState(viewer);
  /** 启用管线前的 Tellux 大气开关快照（用于恢复） */
  const telluxAtmosphereSnapshot = advancedEffectControls?.value?.atmosphere === true;

  /**
   * 启用体积云管线（幂等）。
   * @returns {Promise<void>}
   */
  async function ensurePipeline() {
    if (disposed) return;
    if (pipeline) return;
    if (initPromise) {
      await initPromise;
      return;
    }

    initPromise = (async () => {
      try {
        // 确保全局 Cesium 可用（库内部依赖 window.Cesium / 全局 Cesium 符号）
        if (typeof window !== 'undefined' && !window.Cesium && globalThis.Cesium) {
          window.Cesium = globalThis.Cesium;
        }

        const { createCloudAtmosphere } = await import('./lib/createCloudAtmosphere.js');

        if (disposed) return;

        // 交由 Bruneton 天空接管
        applySkyOwnedByPipeline(viewer);

        // 临时关闭 Tellux 大气：与 Bruneton 叠加会让底图过曝涂白
        if (advancedEffectControls?.value && advancedEffectControls.value.atmosphere !== false) {
          advancedEffectControls.value = {
            ...advancedEffectControls.value,
            atmosphere: false,
          };
        }

        const assetPaths = resolveWebgisCloudAssetPaths(import.meta.env.BASE_URL);
        const initialCloudParams = cloudParams?.value ?? {};
        const instance = await createCloudAtmosphere(viewer, {
          enableGui,
          initialCloudParams,
          ...assetPaths,
        });

        if (disposed) {
          try {
            instance.destroy();
          } catch {
            /* ignore */
          }
          return;
        }

        pipeline = instance;
        applyCloudPanelParams(pipeline, cloudParams?.value ?? {});
        await syncLensFlare(cloudParams?.value ?? {});

        console.warn('[Cloud] cesium-clouds-atmosphere 管线就绪');
      } catch (err) {
        console.error('[Cloud] 管线初始化失败：', err);
        restoreSkyState(viewer, skySnapshot);
        pipeline = null;
        lensFlare = null;
        throw err;
      } finally {
        initPromise = null;
      }
    })();

    await initPromise;
  }

  /**
   * 按需创建/同步镜头光晕。默认流畅档不开启，避免无用全屏后处理 stage 常驻。
   * @param {Record<string, unknown>} params
   * @returns {Promise<void>}
   */
  async function syncLensFlare(params) {
    if (disposed || !params) return;
    if (params.lensFlareEnabled !== true) {
      applyLensFlareParams(lensFlare, params);
      return;
    }
    if (!lensFlare) {
      const { LensFlareBloomStage } = await import(
        './lib/AtmosphereFromThreeGeospatial/LensFlareBloomStage.js'
      );
      if (disposed) return;
      lensFlare = new LensFlareBloomStage(viewer, {
        bloomIntensity: Number(params.bloomIntensity) || 0.6,
        ghostIntensity: Number(params.ghostIntensity) || 1.1,
        haloIntensity: Number(params.haloIntensity) || 0.2,
      });
      lensFlare.init();
    }
    applyLensFlareParams(lensFlare, params);
  }

  /**
   * 将面板参数应用推迟到下一动画帧，合并同一帧内的多次 deep watch 触发。
   * @param {Record<string, unknown>} params
   */
  function scheduleApply(params) {
    pendingApplyParams = params;
    if (applyRafId) return;
    applyRafId = requestAnimationFrame(() => {
      applyRafId = 0;
      const p = pendingApplyParams;
      pendingApplyParams = null;
      if (disposed || !pipeline || !p) return;
      applyCloudPanelParams(pipeline, p);
      // syncLensFlare 可能异步懒加载 stage，失败不应中断参数应用
      void syncLensFlare(p);
    });
  }

  /**
   * 销毁管线并恢复原生天空。
   */
  function teardownPipeline() {
    // 取消尚未执行的帧级参数合并，避免 teardown 后回调命中已销毁管线
    if (applyRafId) {
      cancelAnimationFrame(applyRafId);
      applyRafId = 0;
    }
    pendingApplyParams = null;
    // 清理加载提示
    if (msg && loadingMsgId) {
      msg.remove(loadingMsgId);
      loadingMsgId = null;
    }

    try {
      lensFlare?.destroy?.();
    } catch (e) {
      console.warn('[Cloud] lensFlare destroy:', e);
    }
    lensFlare = null;

    try {
      pipeline?.destroy?.();
    } catch (e) {
      console.warn('[Cloud] pipeline destroy:', e);
    }
    pipeline = null;

    restoreSkyState(viewer, skySnapshot);

    // 恢复启用前的 Tellux 大气开关状态
    if (advancedEffectControls?.value && telluxAtmosphereSnapshot) {
      advancedEffectControls.value = {
        ...advancedEffectControls.value,
        atmosphere: true,
      };
    }
  }

  // 参数变更 → 同步到运行中的管线；总开关控制懒加载 / 销毁
  const stopWatch = watch(
    () => cloudParams?.value,
    async (params) => {
      if (disposed || !params) return;
      if (params.cloudsEnabled) {
        // 首次开启时提示用户等待大文件加载
        if (msg && !pipeline && !loadingMsgId) {
          loadingMsgId = msg.info(
            '体积云资源加载中（需加载约 4 个 8MB 纹理文件），请稍候...',
            { closable: false, duration: 0 },
          );
        }
        try {
          await ensurePipeline();
          if (disposed) return;
          // 加载完成，关闭等待提示
          if (msg && loadingMsgId) {
            msg.remove(loadingMsgId);
            loadingMsgId = null;
            msg.success('体积云已就绪');
            msg.info('提示：请将视角缩放至 1500m ~ 8000m 高度范围，以获得最佳体积云观赏效果', {
              duration: 6000,
            });
          }
          // 参数应用走帧级合并：滑杆连续拖动/对象整体替换时，同一帧多次 watch 只应用一次
          scheduleApply(params);
        } catch {
          // 出错了也要关闭等待提示，并向用户反馈
          if (msg && loadingMsgId) {
            msg.remove(loadingMsgId);
            loadingMsgId = null;
          }
          if (msg) {
            msg.error('体积云加载失败，请稍后重试');
          }
          // ensurePipeline 已打日志
        }
      } else if (pipeline) {
        teardownPipeline();
      }
    },
    { deep: true, immediate: true },
  );

  /**
   * 清理：停止 watcher、销毁 GPU 资源、恢复天空。
   */
  return function cleanup() {
    disposed = true;
    try {
      stopWatch();
    } catch {
      /* ignore */
    }
    teardownPipeline();
  };
}

/**
 * 记录原生天空状态，便于关闭体积云后恢复。
 * @param {import('cesium').Viewer} viewer
 */
function captureSkyState(viewer) {
  const scene = viewer?.scene;
  return {
    skyAtmosphereShow: scene?.skyAtmosphere ? scene.skyAtmosphere.show : undefined,
    skyBoxShow: scene?.skyBox ? scene.skyBox.show : undefined,
  };
}

/**
 * 启用管线时关闭 Cesium 自带天空，避免双重大气。
 * @param {import('cesium').Viewer} viewer
 */
function applySkyOwnedByPipeline(viewer) {
  const scene = viewer?.scene;
  if (!scene) return;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  if (scene.skyBox) scene.skyBox.show = false;
}

/**
 * 恢复进入体积云前的天空状态。
 * @param {import('cesium').Viewer} viewer
 * @param {{ skyAtmosphereShow?: boolean, skyBoxShow?: boolean }} snapshot
 */
function restoreSkyState(viewer, snapshot) {
  const scene = viewer?.scene;
  if (!scene || !snapshot) return;
  if (scene.skyAtmosphere && snapshot.skyAtmosphereShow !== undefined) {
    scene.skyAtmosphere.show = snapshot.skyAtmosphereShow;
  }
  if (scene.skyBox && snapshot.skyBoxShow !== undefined) {
    scene.skyBox.show = snapshot.skyBoxShow;
  }
}
