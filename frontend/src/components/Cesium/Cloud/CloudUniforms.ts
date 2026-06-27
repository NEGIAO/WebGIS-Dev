/**
 * CloudUniforms.ts — 体积云 Uniform 参数定义
 *
 * 集中管理所有 PostProcessStage uniform 的：
 * - 默认值
 * - 类型说明
 * - 从用户参数到着色器 uniform 的映射逻辑
 *
 * 命名规范：u_ 前缀 + camelCase（区分 Cesium 内置 czm_）
 */

import { getPreset, type CloudQualityLevel } from './CloudPresets'

// ─── Uniform 值类型 ────────────────────────────────────────────

export interface CloudUniformValues {
    // ── 开关 ──
    enabled: boolean

    // ── 质量 ──
    quality: CloudQualityLevel

    // ── 云层几何 ──
    /** 云底高度 (米)，对应 atmosphereParams.cloudBottom */
    minHeight: number
    /** 云顶高度 (米)，对应 atmosphereParams.cloudTop */
    maxHeight: number
    /** 云覆盖率 0-1，对应 atmosphereParams.cloudCoverage */
    coverage: number

    // ── 风 / 动画 ──
    /** 风速 (度/秒)，驱动 localWeatherOffset */
    windSpeed: number
    /** 风向角度 (度)，0=东，90=北 */
    windDirection: number

    // ── 散射 ──
    /** 散射系数 */
    scatteringCoefficient: number
    /** 吸收系数 */
    absorptionCoefficient: number
    /** 第一个 HG 各向异性参数 (前向散射) */
    scatterAnisotropy1: number
    /** 第二个 HG 各向异性参数 (后向散射) */
    scatterAnisotropy2: number
    /** HG 混合比例 */
    scatterAnisotropyMix: number
    /** 天空光缩放 */
    skyLightScale: number
    /** 地面反弹光缩放 */
    groundBounceScale: number
    /** Powder 效应强度 */
    powderScale: number

    // ── 密度 ──
    /** 整体密度缩放 */
    densityScale: number
    /** shape 纹理贡献量 */
    shapeAmount: number
    /** shape detail 纹理贡献量 */
    shapeDetailAmount: number
    /** turbulence 位移强度 (米) */
    turbulenceDisplacement: number

    // ── 大气雾霾 ──
    /** 雾密度缩放 */
    hazeDensityScale: number
    /** 雾高度衰减指数 */
    hazeExponent: number

    // ── 夜间光照 (Tellux 自定义) ──
    /** 夜间月亮光照强度 */
    nightMoonIntensity: number
    /** 夜间环境光强度 */
    nightAmbientIntensity: number
    /** 夜间颜色 (hex) */
    nightColor: string
    /** 昼夜过渡因子 0=夜 1=昼（自动计算，可手动覆盖） */
    dayLightFactor: number
}

// ─── 默认值 ────────────────────────────────────────────────────

export const DEFAULT_CLOUD_UNIFORMS: CloudUniformValues = {
    enabled: false,
    quality: 'medium',

    // 云层几何
    minHeight: 1500,
    maxHeight: 2150,
    coverage: 0.3,

    // 风 / 动画
    windSpeed: 0.001,
    windDirection: 90,

    // 散射
    scatteringCoefficient: 1.0,
    absorptionCoefficient: 0.0,
    scatterAnisotropy1: 0.7,
    scatterAnisotropy2: -0.2,
    scatterAnisotropyMix: 0.5,
    skyLightScale: 1.0,
    groundBounceScale: 1.0,
    powderScale: 0.8,

    // 密度
    densityScale: 1.0,
    shapeAmount: 1.0,
    shapeDetailAmount: 0.5,
    turbulenceDisplacement: 350,

    // 雾
    hazeDensityScale: 3e-5,
    hazeExponent: 1e-3,

    // 夜间
    nightMoonIntensity: 0.18,
    nightAmbientIntensity: 0.08,
    nightColor: '#9bbcff',
    dayLightFactor: 1.0,
}

// ─── 部分更新类型 ──────────────────────────────────────────────

export type CloudUniformPatch = Partial<CloudUniformValues>

// ─── 工具函数 ──────────────────────────────────────────────────

/**
 * hex 颜色字符串 → [r, g, b] 归一化数组
 * 例: '#9bbcff' → [0.608, 0.737, 1.0]
 */
export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16) / 255
    const g = parseInt(h.substring(2, 4), 16) / 255
    const b = parseInt(h.substring(4, 6), 16) / 255
    return [r, g, b]
}

/**
 * 度 → 弧度
 */
function degToRad(deg: number): number {
    return (deg * Math.PI) / 180
}

// ─── PostProcessStage Uniform 映射 ─────────────────────────────

/**
 * 将 CloudUniformValues 转换为 PostProcessStage 所需的
 * { uniformName: () => value } 回调字典。
 *
 * PostProcessStage 的 uniforms 支持函数式回调，
 * 每帧自动调用获取最新值，无需手动 update。
 */
export function createStageUniforms(
    getValues: () => CloudUniformValues,
): Record<string, () => unknown> {
    const v = getValues
    return {
        // 开关
        u_enabled: () => v().enabled,

        // 云层几何
        u_minHeight: () => v().minHeight,
        u_maxHeight: () => v().maxHeight,
        u_coverage: () => v().coverage,

        // 风
        u_windSpeed: () => v().windSpeed,
        u_windDirection: () => {
            const rad = degToRad(v().windDirection)
            return [Math.cos(rad), Math.sin(rad)]
        },

        // 散射
        u_scatteringCoefficient: () => v().scatteringCoefficient,
        u_absorptionCoefficient: () => v().absorptionCoefficient,
        u_scatterAnisotropy1: () => v().scatterAnisotropy1,
        u_scatterAnisotropy2: () => v().scatterAnisotropy2,
        u_scatterAnisotropyMix: () => v().scatterAnisotropyMix,
        u_skyLightScale: () => v().skyLightScale,
        u_groundBounceScale: () => v().groundBounceScale,
        u_powderScale: () => v().powderScale,

        // 密度
        u_densityScale: () => v().densityScale,
        u_shapeAmount: () => v().shapeAmount,
        u_shapeDetailAmount: () => v().shapeDetailAmount,
        u_turbulenceDisplacement: () => v().turbulenceDisplacement,

        // 雾
        u_hazeDensityScale: () => v().hazeDensityScale,
        u_hazeExponent: () => v().hazeExponent,

        // 夜间
        u_nightMoonIntensity: () => v().nightMoonIntensity,
        u_nightAmbientIntensity: () => v().nightAmbientIntensity,
        u_nightColor: () => hexToRgb(v().nightColor),
        u_dayLightFactor: () => v().dayLightFactor,

        // 质量预设参数（从 quality 动态解析）
        u_maxIterationCount: () => getPreset(v().quality).maxIterationCount,
        u_minStepSize: () => getPreset(v().quality).minStepSize,
        u_maxStepSize: () => getPreset(v().quality).maxStepSize,
        u_maxRayDistance: () => getPreset(v().quality).maxRayDistance,
        u_perspectiveStepScale: () => getPreset(v().quality).perspectiveStepScale,
        u_minDensity: () => getPreset(v().quality).minDensity,
        u_minTransmittance: () => getPreset(v().quality).minTransmittance,
        u_multiScatteringOctaves: () => getPreset(v().quality).multiScatteringOctaves,
        u_maxIterationCountToSun: () => getPreset(v().quality).maxIterationCountToSun,
        u_maxIterationCountToGround: () => getPreset(v().quality).maxIterationCountToGround,
        u_minSecondaryStepSize: () => getPreset(v().quality).minSecondaryStepSize,
        u_shapeDetailEnabled: () => getPreset(v().quality).shapeDetail ? 1.0 : 0.0,
        u_turbulenceEnabled: () => getPreset(v().quality).turbulence ? 1.0 : 0.0,
    }
}
