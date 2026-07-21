/**
 * 将 WebGIS 工具面板 cloudParams 同步到 ThreeGeospatialPipeline / LensFlare。
 * 单一职责：参数映射，不含生命周期。
 *
 * @module Cloud/cloudParamsApply
 */

/**
 * 把面板参数写入 pipeline.params（原地修改，下一帧 uniforms 生效）。
 * @param {import('./lib/ThreeGeospatialPipeline.js').ThreeGeospatialPipeline | null} pipeline
 * @param {Record<string, unknown>} panelParams
 */
export function applyCloudPanelParams(pipeline, panelParams) {
  if (!pipeline?.params || !panelParams) return;
  const p = pipeline.params;
  const layers = p.layers;

  // 显示
  if (typeof panelParams.cloudsEnabled === 'boolean') {
    p.cloudsVisible = panelParams.cloudsEnabled;
    if (pipeline.cloudStage) pipeline.cloudStage.enabled = panelParams.cloudsEnabled;
  }

  // 三层云
  if (layers?.[0]) {
    if (num(panelParams.layer0Altitude) != null) layers[0].altitude = num(panelParams.layer0Altitude);
    if (num(panelParams.layer0Height) != null) layers[0].height = num(panelParams.layer0Height);
    if (num(panelParams.layer0Coverage) != null) layers[0].coverage = num(panelParams.layer0Coverage);
  }
  if (layers?.[1]) {
    if (num(panelParams.layer1Altitude) != null) layers[1].altitude = num(panelParams.layer1Altitude);
    if (num(panelParams.layer1Height) != null) layers[1].height = num(panelParams.layer1Height);
    if (num(panelParams.layer1Coverage) != null) layers[1].coverage = num(panelParams.layer1Coverage);
  }
  if (layers?.[2]) {
    if (num(panelParams.layer2Altitude) != null) layers[2].altitude = num(panelParams.layer2Altitude);
    if (num(panelParams.layer2Height) != null) layers[2].height = num(panelParams.layer2Height);
    if (num(panelParams.layer2Coverage) != null) layers[2].coverage = num(panelParams.layer2Coverage);
  }

  // 标量字段直接对齐 pipeline.params
  const scalarKeys = [
    'sunIntensity',
    'cloudExposure',
    'skyToSunRatio',
    'aerialPerspectiveScale',
    'magentaFixStrength',
    'scatterG1',
    'scatterG2',
    'multiScatteringOctaves',
    'windSpeed',
    'evolutionSpeed',
    'distFadeStart',
    'distFadeEnd',
    'maxSteps',
    'shadowFar',
    'shadowSplitLambda',
    'shadowFadeScale',
  ];
  for (const key of scalarKeys) {
    const v = num(panelParams[key]);
    if (v != null) p[key] = v;
  }

  // Aerial stage 空中透视强度（独立于 pipeline.params.aerialPerspectiveScale，后者供 CloudStage 使用）
  const aerialScale = num(panelParams.aerialPerspectiveScale);
  if (aerialScale != null) {
    p.aerialPerspectiveScale = aerialScale;
    if (pipeline.aerial) pipeline.aerial._aerialPerspectiveScale = aerialScale;
  }

  // 布尔开关
  if (typeof panelParams.useShadowBuffer === 'boolean') p.useShadowBuffer = panelParams.useShadowBuffer;
  if (typeof panelParams.shadowLengthEnabled === 'boolean') p.shadowLengthEnabled = panelParams.shadowLengthEnabled;
  if (typeof panelParams.hazeEnabled === 'boolean') p.hazeEnabled = panelParams.hazeEnabled;
  if (typeof panelParams.temporalEnabled === 'boolean') p.temporalEnabled = panelParams.temporalEnabled;

  // BSM OD 缩放（同步大气 + Aerial 两侧）
  const groundScale = num(panelParams.bsmGroundScale);
  const tyndallScale = num(panelParams.bsmTyndallScale);
  if (groundScale != null) {
    p._bsmGroundScale = groundScale;
    if (pipeline.atmosphere) pipeline.atmosphere._bsmGroundOpticalDepthScale = groundScale;
    if (pipeline.aerial) pipeline.aerial._bsmGroundOpticalDepthScale = groundScale;
  }
  if (tyndallScale != null) {
    p._bsmTyndallScale = tyndallScale;
    if (pipeline.atmosphere) pipeline.atmosphere._bsmTyndallOpticalDepthScale = tyndallScale;
    if (pipeline.aerial) pipeline.aerial._bsmTyndallOpticalDepthScale = tyndallScale;
  }

  // 大气曝光（AtmospherePostProcess 对所有像素统一乘的线性增益，含底图）
  applyAtmosphereExposure(pipeline.atmosphere, panelParams);

  // PostProcess stage 级开关（流畅档可关 Aerial，减轻整屏 tonemap/散射负担）
  applyStageEnabledFlags(pipeline, panelParams);
}

/**
 * 控制大气 / 空中透视 stage 是否参与后处理链。
 * @param {import('./lib/ThreeGeospatialPipeline.js').ThreeGeospatialPipeline} pipeline
 * @param {Record<string, unknown>} panelParams
 */
function applyStageEnabledFlags(pipeline, panelParams) {
  if (typeof panelParams.atmosphereStageEnabled === 'boolean' && pipeline.atmosphere?.stage) {
    pipeline.atmosphere.stage.enabled = panelParams.atmosphereStageEnabled;
  }
  if (typeof panelParams.aerialStageEnabled === 'boolean' && pipeline.aerial?.stage) {
    pipeline.aerial.stage.enabled = panelParams.aerialStageEnabled;
  }
}

/**
 * 同步大气曝光参数到 AtmospherePostProcess。
 * 这是底图"变白"的关键旋钮：_exposureDay 默认 1.5 会把几何像素也抬亮。
 * @param {{ _exposureDay?: number, _exposureNight?: number, _atmosphereExposure?: number, _exposureFollowTimeline?: boolean } | null | undefined} atmosphere
 * @param {Record<string, unknown>} panelParams
 */
function applyAtmosphereExposure(atmosphere, panelParams) {
  if (!atmosphere) return;
  const day = num(panelParams.atmosphereExposureDay);
  const night = num(panelParams.atmosphereExposureNight);
  const manual = num(panelParams.atmosphereExposureManual);
  if (day != null) atmosphere._exposureDay = day;
  if (night != null) atmosphere._exposureNight = night;
  if (manual != null) atmosphere._atmosphereExposure = manual;
  if (typeof panelParams.atmosphereExposureFollowTimeline === 'boolean') {
    atmosphere._exposureFollowTimeline = panelParams.atmosphereExposureFollowTimeline;
  }
}

/**
 * 同步镜头光晕强度。
 * @param {{ setBloomIntensity?: Function, setGhostIntensity?: Function, setHaloIntensity?: Function, stage?: { enabled?: boolean } } | null} lensFlare
 * @param {Record<string, unknown>} panelParams
 */
export function applyLensFlareParams(lensFlare, panelParams) {
  if (!lensFlare || !panelParams) return;
  if (typeof panelParams.lensFlareEnabled === 'boolean' && lensFlare.stage) {
    lensFlare.stage.enabled = panelParams.lensFlareEnabled;
  }
  const bloom = num(panelParams.bloomIntensity);
  const ghost = num(panelParams.ghostIntensity);
  const halo = num(panelParams.haloIntensity);
  if (bloom != null) lensFlare.setBloomIntensity?.(bloom);
  if (ghost != null) lensFlare.setGhostIntensity?.(ghost);
  if (halo != null) lensFlare.setHaloIntensity?.(halo);
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
