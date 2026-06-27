/**
 * CloudPresets.ts — 体积云质量预设
 *
 * 四档质量预设（low / medium / high / ultra），控制：
 * - Ray march 迭代次数与步长
 * - 散射阶数
 * - 纹理采样精度
 * - 降噪策略
 *
 * 对齐 tellux 上游 @takram/three-clouds 的 qualityPresets，
 * 针对 Cesium PostProcessStage 做适度简化。
 */

export interface CloudQualityPreset {
    /** 预设显示名称 */
    label: string
    /** 主 ray march 最大迭代次数 */
    maxIterationCount: number
    /** 主 ray march 最小步长 (米) */
    minStepSize: number
    /** 主 ray march 最大步长 (米) */
    maxStepSize: number
    /** 最大光线距离 (米) */
    maxRayDistance: number
    /** 透视步长缩放因子（空区域步长递增） */
    perspectiveStepScale: number
    /** 最小密度阈值（低于此值跳过采样） */
    minDensity: number
    /** 最小透射率（早停条件） */
    minTransmittance: number
    /** 多重散射近似阶数 */
    multiScatteringOctaves: number
    /** 太阳方向二次 march 迭代次数 */
    maxIterationCountToSun: number
    /** 地面方向二次 march 迭代次数 */
    maxIterationCountToGround: number
    /** 二次 march 最小步长 (米) */
    minSecondaryStepSize: number
    /** 是否启用 shape detail 纹理（高频细节） */
    shapeDetail: boolean
    /** 是否启用 turbulence 纹理（域扭曲） */
    turbulence: boolean
}

export type CloudQualityLevel = 'low' | 'medium' | 'high' | 'ultra'

/**
 * 质量预设表
 * - low:    移动端 / 低性能设备，最少迭代，无二次光照
 * - medium: 笔记本 / 集显，平衡画质与性能
 * - high:   桌面独显（默认），完整光照
 * - ultra:  高端 GPU，最细步长 + 更多二次 march
 */
export const CLOUD_PRESETS: Record<CloudQualityLevel, CloudQualityPreset> = {
    low: {
        label: '低',
        maxIterationCount: 64,
        minStepSize: 200,
        maxStepSize: 2000,
        maxRayDistance: 80000,
        perspectiveStepScale: 1.02,
        minDensity: 1e-4,
        minTransmittance: 0.1,
        multiScatteringOctaves: 2,
        maxIterationCountToSun: 0,
        maxIterationCountToGround: 0,
        minSecondaryStepSize: 200,
        shapeDetail: false,
        turbulence: false,
    },
    medium: {
        label: '中',
        maxIterationCount: 128,
        minStepSize: 100,
        maxStepSize: 1500,
        maxRayDistance: 150000,
        perspectiveStepScale: 1.015,
        minDensity: 1e-4,
        minTransmittance: 0.05,
        multiScatteringOctaves: 4,
        maxIterationCountToSun: 1,
        maxIterationCountToGround: 0,
        minSecondaryStepSize: 150,
        shapeDetail: true,
        turbulence: false,
    },
    high: {
        label: '高',
        maxIterationCount: 256,
        minStepSize: 50,
        maxStepSize: 1000,
        maxRayDistance: 200000,
        perspectiveStepScale: 1.01,
        minDensity: 1e-5,
        minTransmittance: 0.01,
        multiScatteringOctaves: 6,
        maxIterationCountToSun: 2,
        maxIterationCountToGround: 1,
        minSecondaryStepSize: 100,
        shapeDetail: true,
        turbulence: true,
    },
    ultra: {
        label: '超高',
        maxIterationCount: 512,
        minStepSize: 20,
        maxStepSize: 800,
        maxRayDistance: 250000,
        perspectiveStepScale: 1.008,
        minDensity: 1e-6,
        minTransmittance: 0.005,
        multiScatteringOctaves: 8,
        maxIterationCountToSun: 3,
        maxIterationCountToGround: 2,
        minSecondaryStepSize: 50,
        shapeDetail: true,
        turbulence: true,
    },
}

/**
 * 获取预设，若 key 无效则返回 medium
 */
export function getPreset(key: string): CloudQualityPreset {
    return CLOUD_PRESETS[key as CloudQualityLevel] ?? CLOUD_PRESETS.medium
}
