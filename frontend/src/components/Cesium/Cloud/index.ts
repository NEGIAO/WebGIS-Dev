/**
 * index.ts — 体积云模块统一导出
 *
 * 使用方式：
 * ```ts
 * import { CloudManager, setupCloudIntegration, CLOUD_PRESETS } from '@/components/Cesium/Cloud'
 * ```
 */

// ─── 核心类 ───────────────────────────────────────────────────

export { CloudManager } from './CloudManager'
export type { CloudManagerConfig, CloudTexturePaths } from './CloudManager'

// ─── Uniform 参数 ─────────────────────────────────────────────

export { DEFAULT_CLOUD_UNIFORMS, createStageUniforms, hexToRgb } from './CloudUniforms'
export type { CloudUniformValues, CloudUniformPatch } from './CloudUniforms'

// ─── 质量预设 ─────────────────────────────────────────────────

export { CLOUD_PRESETS, getPreset } from './CloudPresets'
export type { CloudQualityLevel, CloudQualityPreset } from './CloudPresets'

// ─── 集成桥接 ─────────────────────────────────────────────────

export {
    setupCloudIntegration,
    bindCloudGui,
    CLOUD_GUI_PARAMS,
    CLOUD_QUALITY_OPTIONS,
} from './cloudIntegration'
export type { CloudIntegrationOptions, CloudIntegrationResult, GuiParamDef } from './cloudIntegration'
