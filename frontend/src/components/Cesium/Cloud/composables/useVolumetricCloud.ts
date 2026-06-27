/**
 * useVolumetricCloud.ts — Vue 3 Composable
 *
 * 桥接 CloudManager 与 Vue 组件生命周期：
 * - 自动初始化 / 销毁
 * - 监听 atmosphereParams 变化同步到 CloudManager
 * - 导出参数对象供 lil-gui 绑定
 * - 与 useCesiumToolModules 的 atmosphere 模块无缝对接
 */

import { ref, shallowRef, watch, onBeforeUnmount, type Ref, type ShallowRef } from 'vue'
import { CloudManager, type CloudManagerConfig } from '../CloudManager'
import type { CloudUniformPatch, CloudUniformValues } from '../CloudUniforms'
import { DEFAULT_CLOUD_UNIFORMS } from '../CloudUniforms'
import type { CloudQualityLevel } from '../CloudPresets'

// ─── Composable 参数 ──────────────────────────────────────────

export interface UseVolumetricCloudOptions {
    /** Cesium Viewer 实例 ref */
    viewer: Ref<any | null> | ShallowRef<any | null>
    /** atmosphereParams ref（来自 useCesiumToolModules） */
    atmosphereParams?: Ref<Record<string, unknown>>
    /** CloudManager 配置 */
    config?: CloudManagerConfig
}

// ─── Composable 返回值 ────────────────────────────────────────

export interface UseVolumetricCloudReturn {
    /** CloudManager 实例（可能为 null，取决于 viewer 是否就绪） */
    cloud: ShallowRef<CloudManager | null>
    /** 当前体积云参数（响应式，可直接绑定到 lil-gui） */
    params: Ref<CloudUniformValues>
    /** 手动初始化（通常不需要，composable 自动处理） */
    init: () => Promise<void>
    /** 手动销毁（通常不需要，composable 自动处理） */
    destroy: () => void
    /** 更新参数（部分更新） */
    update: (patch: CloudUniformPatch) => void
    /** 设置质量 */
    setQuality: (level: CloudQualityLevel) => void
    /** 切换显示 */
    toggle: () => void
}

// ─── Composable 实现 ──────────────────────────────────────────

export function useVolumetricCloud(options: UseVolumetricCloudOptions): UseVolumetricCloudReturn {
    const { viewer, atmosphereParams, config } = options

    const cloud = shallowRef<CloudManager | null>(null)
    const params = ref<CloudUniformValues>({ ...DEFAULT_CLOUD_UNIFORMS })

    // ── 初始化 ────────────────────────────────────────────────

    async function init(): Promise<void> {
        if (cloud.value?.initialized) return
        if (!viewer.value) return

        const manager = new CloudManager(viewer.value, config)
        await manager.init()
        cloud.value = manager

        // 同步初始参数
        syncParamsFromManager()
    }

    function destroy(): void {
        if (cloud.value) {
            cloud.value.destroy()
            cloud.value = null
        }
    }

    // ── 参数同步 ──────────────────────────────────────────────

    function syncParamsFromManager(): void {
        if (!cloud.value) return
        Object.assign(params.value, cloud.value.values)
    }

    function update(patch: CloudUniformPatch): void {
        if (cloud.value) {
            cloud.value.updateUniforms(patch)
            syncParamsFromManager()
        }
    }

    function setQuality(level: CloudQualityLevel): void {
        if (cloud.value) {
            cloud.value.setQuality(level)
            params.value.quality = level
        }
    }

    function toggle(): void {
        if (cloud.value) {
            cloud.value.toggle()
            params.value.enabled = cloud.value.visible
        }
    }

    // ── 监听 atmosphereParams 变化 ────────────────────────────
    // 将 useCesiumToolModules 中的 atmosphereParams 映射到 CloudManager

    if (atmosphereParams) {
        watch(
            atmosphereParams,
            (newParams) => {
                if (!cloud.value) return

                const patch: CloudUniformPatch = {}

                // cloudsEnabled → enabled
                if ('cloudsEnabled' in newParams) {
                    const enabled = Boolean(newParams.cloudsEnabled)
                    patch.enabled = enabled
                    if (enabled) cloud.value.show()
                    else cloud.value.hide()
                }

                // cloudCoverage → coverage
                if ('cloudCoverage' in newParams) {
                    patch.coverage = Number(newParams.cloudCoverage) || 0.3
                }

                // cloudSpeed → windSpeed
                if ('cloudSpeed' in newParams) {
                    patch.windSpeed = Number(newParams.cloudSpeed) || 0.001
                }

                // cloudBottom → minHeight
                if ('cloudBottom' in newParams) {
                    patch.minHeight = Number(newParams.cloudBottom) || 1500
                }

                // cloudTop → maxHeight
                if ('cloudTop' in newParams) {
                    patch.maxHeight = Number(newParams.cloudTop) || 2150
                }

                // cloudQuality → quality
                if ('cloudQuality' in newParams) {
                    const q = String(newParams.cloudQuality) as CloudQualityLevel
                    cloud.value.setQuality(q)
                    patch.quality = q
                }

                // 日夜过渡
                if ('dayNightEnabled' in newParams) {
                    patch.dayLightFactor = newParams.dayNightEnabled ? 1.0 : 0.5
                }

                // 月光
                if ('moonLightIntensity' in newParams) {
                    patch.nightMoonIntensity = Number(newParams.moonLightIntensity) || 0
                }
                if ('ambientIntensity' in newParams) {
                    patch.nightAmbientIntensity = Number(newParams.ambientIntensity) || 0
                }

                cloud.value.updateUniforms(patch)
                Object.assign(params.value, cloud.value.values)
            },
            { deep: true },
        )
    }

    // ── 监听 viewer 就绪 ──────────────────────────────────────

    const stopViewerWatch = watch(
        viewer,
        async (newViewer) => {
            if (newViewer) {
                await init()
            } else {
                destroy()
            }
        },
        { immediate: true },
    )

    // ── 清理 ──────────────────────────────────────────────────

    onBeforeUnmount(() => {
        stopViewerWatch()
        destroy()
    })

    return {
        cloud,
        params,
        init,
        destroy,
        update,
        setQuality,
        toggle,
    }
}
