/**
 * cloudIntegration.ts — 体积云集成桥接
 *
 * 将 useCesiumToolModules 的 atmosphereParams 无缝桥接到 CloudManager。
 * 在 CesiumContainer.vue 中调用一次即可，内部自动监听参数变化。
 *
 * 核心链路：lil-gui 控件 → handleToolControlChange → atmosphereParams watcher → CloudManager
 *
 * 使用方式：
 * ```ts
 * import { setupCloudIntegration } from './Cloud'
 *
 * // 在 initViewer() 之后调用
 * const cleanupCloud = setupCloudIntegration({ viewer, atmosphereParams })
 *
 * // 在 onBeforeUnmount / resetCesiumViewerForRetry 中调用
 * cleanupCloud()
 * ```
 */

import { watch, type Ref } from 'vue'
import { CloudManager, type CloudManagerConfig } from './CloudManager'
import type { CloudQualityLevel } from './CloudPresets'

// ─── lil-gui 参数配置对象 ─────────────────────────────────────

export interface GuiParamDef {
    key: string
    label: string
    min: number
    max: number
    step: number
    default: number
    options?: Array<{ label: string; value: string }>
}

/**
 * 体积云 lil-gui 参数定义
 */
export const CLOUD_GUI_PARAMS: GuiParamDef[] = [
    { key: 'coverage', label: '云覆盖率', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'minHeight', label: '云底高度 (m)', min: 500, max: 5000, step: 50, default: 1500 },
    { key: 'maxHeight', label: '云顶高度 (m)', min: 1000, max: 8000, step: 50, default: 2150 },
    { key: 'windSpeed', label: '风速', min: 0, max: 0.01, step: 0.0001, default: 0.001 },
    { key: 'windDirection', label: '风向 (°)', min: 0, max: 360, step: 1, default: 90 },
    { key: 'scatteringCoefficient', label: '散射系数', min: 0, max: 3, step: 0.01, default: 1.0 },
    { key: 'absorptionCoefficient', label: '吸收系数', min: 0, max: 1, step: 0.01, default: 0.0 },
    { key: 'scatterAnisotropy1', label: '前向散射 (HG1)', min: -1, max: 1, step: 0.01, default: 0.7 },
    { key: 'scatterAnisotropy2', label: '后向散射 (HG2)', min: -1, max: 1, step: 0.01, default: -0.2 },
    { key: 'scatterAnisotropyMix', label: 'HG 混合比', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'skyLightScale', label: '天空光强度', min: 0, max: 3, step: 0.05, default: 1.0 },
    { key: 'groundBounceScale', label: '地面反弹光', min: 0, max: 2, step: 0.05, default: 1.0 },
    { key: 'powderScale', label: 'Powder 效应', min: 0, max: 2, step: 0.05, default: 0.8 },
    { key: 'densityScale', label: '密度缩放', min: 0, max: 3, step: 0.01, default: 1.0 },
    { key: 'shapeAmount', label: '形状强度', min: 0, max: 2, step: 0.01, default: 1.0 },
    { key: 'shapeDetailAmount', label: '细节强度', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'turbulenceDisplacement', label: '湍流位移 (m)', min: 0, max: 1000, step: 10, default: 350 },
    { key: 'hazeDensityScale', label: '雾霾密度', min: 0, max: 0.001, step: 0.00001, default: 3e-5 },
    { key: 'hazeExponent', label: '雾霾衰减', min: 0, max: 0.01, step: 0.0001, default: 1e-3 },
    { key: 'nightMoonIntensity', label: '月光强度', min: 0, max: 1, step: 0.01, default: 0.18 },
    { key: 'nightAmbientIntensity', label: '夜间环境光', min: 0, max: 0.5, step: 0.01, default: 0.08 },
]

/**
 * 质量预设选项（用于 lil-gui select 控制器）
 */
export const CLOUD_QUALITY_OPTIONS: Array<{ label: string; value: CloudQualityLevel }> = [
    { label: '低 (Low)', value: 'low' },
    { label: '中 (Medium)', value: 'medium' },
    { label: '高 (High)', value: 'high' },
    { label: '超高 (Ultra)', value: 'ultra' },
]

// ─── 集成函数 ─────────────────────────────────────────────────

export interface CloudIntegrationOptions {
    viewer: any
    /** 体积云独立参数 ref（来自 useCesiumToolModules） */
    cloudParams: Ref<Record<string, any>>
    /** atmosphereParams ref（用于夜间光照等跨模块参数） */
    atmosphereParams?: Ref<Record<string, any>>
    config?: CloudManagerConfig
}

/**
 * 设置体积云集成
 *
 * 单实例保证：整个生命周期内只创建一个 CloudManager，
 * init() 只调用一次（在 cloudsEnabled 首次为 true 时），后续参数变化只更新 uniform。
 *
 * 链路：cloudParams 变化 → watcher → syncParams → CloudManager.updateUniforms
 */
export function setupCloudIntegration(options: CloudIntegrationOptions): () => void {
    const { viewer, cloudParams, atmosphereParams, config } = options

    let cloudManager: CloudManager | null = null
    let initPromise: Promise<void> | null = null
    let destroyed = false

    /**
     * 确保 CloudManager 已初始化（幂等，多次调用安全）
     * 返回 Promise，调用方可 await 确保就绪
     */
    async function ensureInitialized(): Promise<void> {
        if (destroyed) return
        if (cloudManager?.initialized) return

        // 如果正在初始化中，等待同一个 Promise
        if (initPromise) {
            await initPromise
            return
        }

        // 创建并初始化
        cloudManager = new CloudManager(viewer, {
            enabled: Boolean(cloudParams.value.cloudsEnabled),
            quality: (cloudParams.value.cloudQuality as CloudQualityLevel) || 'medium',
            ...config,
        })

        initPromise = cloudManager.init()

        try {
            await initPromise
        } catch (err) {
            console.warn('[CloudIntegration] Init failed:', err)
            cloudManager = null
        } finally {
            initPromise = null
        }

        // init 期间可能已被 destroy
        if (destroyed && cloudManager) {
            cloudManager.destroy()
            cloudManager = null
            return
        }

        // 初始化完成后同步当前参数
        if (cloudManager?.initialized) {
            syncParams(cloudParams.value)
        }
    }

    /**
     * 将 cloudParams 映射到 CloudManager uniform 参数
     */
    function syncParams(params: Record<string, any>): void {
        if (!cloudManager?.initialized) return

        // 开关
        if ('cloudsEnabled' in params) {
            if (params.cloudsEnabled) cloudManager.show()
            else cloudManager.hide()
        }

        // 参数映射 — atmosphereParams.key → CloudUniformValues.key
        const patch: Record<string, any> = {}
        // 云层几何
        if ('cloudCoverage' in params) patch.coverage = Number(params.cloudCoverage) || 0.3
        if ('cloudSpeed' in params) patch.windSpeed = Number(params.cloudSpeed) || 0.001
        if ('cloudBottom' in params) patch.minHeight = Number(params.cloudBottom) || 1500
        if ('cloudTop' in params) patch.maxHeight = Number(params.cloudTop) || 2150
        if ('cloudWindDirection' in params) patch.windDirection = Number(params.cloudWindDirection) || 90
        // 散射
        if ('cloudScattering' in params) patch.scatteringCoefficient = Number(params.cloudScattering) || 1.0
        if ('cloudAbsorption' in params) patch.absorptionCoefficient = Number(params.cloudAbsorption) || 0.0
        if ('cloudAnisotropy1' in params) patch.scatterAnisotropy1 = Number(params.cloudAnisotropy1) || 0.7
        if ('cloudAnisotropy2' in params) patch.scatterAnisotropy2 = Number(params.cloudAnisotropy2) || -0.2
        if ('cloudAnisotropyMix' in params) patch.scatterAnisotropyMix = Number(params.cloudAnisotropyMix) || 0.5
        if ('cloudSkyLight' in params) patch.skyLightScale = Number(params.cloudSkyLight) || 1.0
        if ('cloudGroundBounce' in params) patch.groundBounceScale = Number(params.cloudGroundBounce) || 1.0
        if ('cloudPowder' in params) patch.powderScale = Number(params.cloudPowder) || 0.8
        // 密度
        if ('cloudDensityScale' in params) patch.densityScale = Number(params.cloudDensityScale) || 1.0
        if ('cloudShapeAmount' in params) patch.shapeAmount = Number(params.cloudShapeAmount) || 1.0
        if ('cloudDetailAmount' in params) patch.shapeDetailAmount = Number(params.cloudDetailAmount) || 0.5
        if ('cloudTurbulence' in params) patch.turbulenceDisplacement = Number(params.cloudTurbulence) || 350
        // 雾效
        if ('cloudHazeDensity' in params) patch.hazeDensityScale = Number(params.cloudHazeDensity) || 3e-5
        if ('cloudHazeExponent' in params) patch.hazeExponent = Number(params.cloudHazeExponent) || 1e-3

        // 质量
        if ('cloudQuality' in params) {
            cloudManager.setQuality(params.cloudQuality as CloudQualityLevel)
        }

        if (Object.keys(patch).length > 0) {
            cloudManager.updateUniforms(patch)
        }
    }

    // ─── 监听 cloudParams 变化 ────────────────────────────────

    const stopWatch = watch(
        cloudParams,
        (newParams) => {
            if (destroyed) return

            if (!cloudManager?.initialized) {
                // cloudsEnabled 被打开 → 触发初始化
                if (newParams.cloudsEnabled) {
                    ensureInitialized()
                }
                return
            }

            // 已初始化 → 同步参数
            syncParams(newParams)
        },
        { deep: true },
    )

    // ─── 监听 atmosphereParams 变化（夜间光照等跨模块参数） ────

    let stopAtmosphereWatch: (() => void) | undefined
    if (atmosphereParams) {
        stopAtmosphereWatch = watch(
            atmosphereParams,
            (newParams) => {
                if (destroyed || !cloudManager?.initialized) return
                // 只同步夜间相关的跨模块参数
                const patch: Record<string, any> = {}
                if ('moonLightIntensity' in newParams) patch.nightMoonIntensity = Number(newParams.moonLightIntensity) || 0
                if ('ambientIntensity' in newParams) patch.nightAmbientIntensity = Number(newParams.ambientIntensity) || 0
                if ('dayNightEnabled' in newParams) patch.dayLightFactor = newParams.dayNightEnabled ? 1.0 : 0.5
                if (Object.keys(patch).length > 0) cloudManager.updateUniforms(patch)
            },
            { deep: true },
        )
    }

    // ─── 首次触发（如果 cloudsEnabled 已经为 true） ────────────

    if (cloudParams.value.cloudsEnabled) {
        ensureInitialized()
    }

    // ─── 清理函数 ──────────────────────────────────────────────

    return function cleanup() {
        destroyed = true
        stopWatch()
        stopAtmosphereWatch?.()
        if (cloudManager) {
            cloudManager.destroy()
            cloudManager = null
        }
        initPromise = null
        console.warn('[CloudIntegration] Cleaned up')
    }
}

// ─── lil-gui 绑定辅助函数 ─────────────────────────────────────

/**
 * 将体积云参数绑定到 lil-gui 文件夹
 */
export function bindCloudGui(guiFolder: any, cloudManager: CloudManager): any[] {
    const controllers: any[] = []
    const values = cloudManager.values as Record<string, unknown>

    // 开关
    controllers.push(
        guiFolder
            .add({ enabled: values.enabled }, 'enabled')
            .name('启用体积云')
            .onChange((v: boolean) => {
                if (v) cloudManager.show()
                else cloudManager.hide()
            }),
    )

    // 质量预设
    const qualityObj = { quality: values.quality }
    controllers.push(
        guiFolder
            .add(qualityObj, 'quality', CLOUD_QUALITY_OPTIONS.map((o) => o.value))
            .name('质量预设')
            .onChange((v: CloudQualityLevel) => cloudManager.setQuality(v)),
    )

    // 数值参数
    for (const param of CLOUD_GUI_PARAMS) {
        const obj: Record<string, number> = {}
        obj[param.key] = (values[param.key] as number) ?? param.default

        const controller = guiFolder
            .add(obj, param.key, param.min, param.max, param.step)
            .name(param.label)
            .onChange((v: number) => cloudManager.updateUniforms({ [param.key]: v } as any))

        controllers.push(controller)
    }

    return controllers
}
