/**
 * Cesium 场景美化 Composable
 * 提供 HDR、PBR 色调映射、定向光、天空大气微调、FXAA、分辨率缩放等视觉增强
 *
 * @param {{ getViewer: () => import('cesium').Viewer, getCesium: () => typeof import('cesium') }} opts
 * @returns {{ applyBeautify: (params: BeautifyParams) => void, restoreDefaults: () => void }}
 */

/**
 * @typedef {Object} BeautifyParams
 * @property {boolean} hdrEnabled - HDR 开关
 * @property {number} exposure - 曝光值 (0.1 ~ 5.0)
 * @property {boolean} directionalLightEnabled - 定向太阳光开关
 * @property {number} lightIntensity - 定向光强度 (0 ~ 10)
 * @property {boolean} skyAtmosphereEnabled - 天空大气微调开关
 * @property {number} skyBrightnessShift - 天空亮度偏移 (-1 ~ 1)
 * @property {number} skySaturationShift - 天空饱和度偏移 (-1 ~ 1)
 * @property {number} skyHueShift - 天空色调偏移 (-1 ~ 1)
 * @property {boolean} fxaaEnabled - FXAA 抗锯齿开关
 * @property {boolean} depthTestTerrain - 深度测试地形开关
 * @property {boolean} pixelRatioScale - 设备像素比缩放开关
 */

/**
 * 安全数值转换，NaN 时返回 fallback
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function toFinite(value, fallback) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

export function useCesiumBeautify({ getViewer, getCesium }) {
    /** 保存初始状态用于恢复 */
    let savedState = null

    /**
     * 保存场景初始状态
     * @param {import('cesium').Viewer} viewer
     */
    function captureState(viewer) {
        const scene = viewer?.scene
        if (!scene) return

        savedState = {
            hdr: scene.highDynamicRange,
            exposure: scene.postProcessStages?.exposure,
            tonemapper: scene.postProcessStages?.tonemapper,
            light: scene.light
                ? {
                    direction: scene.light.direction?.clone?.(),
                    color: scene.light.color?.clone?.(),
                    intensity: scene.light.intensity,
                }
                : null,
            skyAtmosphere: scene.skyAtmosphere
                ? {
                    show: scene.skyAtmosphere.show,
                    brightnessShift: scene.skyAtmosphere.brightnessShift,
                    saturationShift: scene.skyAtmosphere.saturationShift,
                    hueShift: scene.skyAtmosphere.hueShift,
                }
                : null,
            fxaa: scene.postProcessStages?.fxaa?.enabled,
            depthTest: scene.globe?.depthTestAgainstTerrain,
            resolutionScale: viewer.resolutionScale,
        }
    }

    /**
     * 应用美化参数
     * @param {BeautifyParams} params
     */
    function applyBeautify(params) {
        const viewer = getViewer?.()
        const CesiumNs = getCesium?.() || window.Cesium
        if (!viewer || !CesiumNs) return

        const scene = viewer.scene
        if (!scene) return

        // 首次调用时保存初始状态
        if (!savedState) {
            captureState(viewer)
        }

        // ===== HDR + 色调映射 =====
        if ('hdrEnabled' in params) {
            scene.highDynamicRange = !!params.hdrEnabled
        }
        if ('exposure' in params && scene.postProcessStages) {
            scene.postProcessStages.exposure = toFinite(params.exposure, 1.2)
        }
        // PBR_NEUTRAL 色调映射（Cesium 1.104+）
        if (params.hdrEnabled && scene.postProcessStages && 'Tonemapper' in CesiumNs) {
            try {
                scene.postProcessStages.tonemapper = CesiumNs.Tonemapper.PBR_NEUTRAL
            } catch (_) {
                // 旧版 Cesium 不支持 Tonemapper.PBR_NEUTRAL
            }
        }

        // ===== 定向太阳光 =====
        if ('directionalLightEnabled' in params && params.directionalLightEnabled) {
            const intensity = toFinite(params.lightIntensity, 2.0)
            try {
                scene.light = new CesiumNs.DirectionalLight({
                    direction: new CesiumNs.Cartesian3(0.354925, -0.890918, -0.283358),
                    color: CesiumNs.Color.WHITE,
                    intensity,
                })
            } catch (_) {
                // DirectionalLight 不可用时降级
            }
        } else if ('directionalLightEnabled' in params && !params.directionalLightEnabled && savedState?.light) {
            // 恢复原始光源
            try {
                if (CesiumNs.SunLight) {
                    scene.light = new CesiumNs.SunLight()
                    if (savedState.light.intensity != null) {
                        scene.light.intensity = savedState.light.intensity
                    }
                }
            } catch (_) {
                // SunLight 不可用时降级
            }
        }
        // 更新光强（不重建光源）
        if ('lightIntensity' in params && params.directionalLightEnabled && scene.light) {
            scene.light.intensity = toFinite(params.lightIntensity, 2.0)
        }

        // ===== 天空大气微调 =====
        const sky = scene.skyAtmosphere
        if (sky) {
            if ('skyAtmosphereEnabled' in params) {
                sky.show = !!params.skyAtmosphereEnabled
            }
            if ('skyBrightnessShift' in params) {
                sky.brightnessShift = toFinite(params.skyBrightnessShift, 0.3)
            }
            if ('skySaturationShift' in params) {
                sky.saturationShift = toFinite(params.skySaturationShift, 0.2)
            }
            if ('skyHueShift' in params) {
                sky.hueShift = toFinite(params.skyHueShift, 0.0)
            }
        }

        // ===== FXAA 抗锯齿 =====
        if ('fxaaEnabled' in params && scene.postProcessStages?.fxaa) {
            scene.postProcessStages.fxaa.enabled = !!params.fxaaEnabled
        }

        // ===== 深度测试地形 =====
        if ('depthTestTerrain' in params && scene.globe) {
            scene.globe.depthTestAgainstTerrain = !!params.depthTestTerrain
        }

        // ===== 设备像素比缩放 =====
        if ('pixelRatioScale' in params) {
            const dpr = window.devicePixelRatio || 1
            viewer.resolutionScale = params.pixelRatioScale ? (dpr > 1.0 ? 1.0 : dpr) : 1.0
        }

        scene.requestRender?.()
    }

    /**
     * 恢复到初始状态
     */
    function restoreDefaults() {
        const viewer = getViewer?.()
        if (!viewer || !savedState) return

        const scene = viewer.scene
        if (!scene) return

        try {
            scene.highDynamicRange = savedState.hdr
            if (scene.postProcessStages) {
                if (savedState.exposure != null) scene.postProcessStages.exposure = savedState.exposure
                if (savedState.tonemapper != null) scene.postProcessStages.tonemapper = savedState.tonemapper
            }
            if (savedState.light && scene.light) {
                scene.light.intensity = savedState.light.intensity
            }
            if (savedState.skyAtmosphere && scene.skyAtmosphere) {
                Object.assign(scene.skyAtmosphere, savedState.skyAtmosphere)
            }
            if (savedState.fxaa != null && scene.postProcessStages?.fxaa) {
                scene.postProcessStages.fxaa.enabled = savedState.fxaa
            }
            if (savedState.depthTest != null && scene.globe) {
                scene.globe.depthTestAgainstTerrain = savedState.depthTest
            }
            if (savedState.resolutionScale != null) {
                viewer.resolutionScale = savedState.resolutionScale
            }
        } catch (e) {
            console.warn('[Beautify] restoreDefaults error:', e)
        }

        scene.requestRender?.()
    }

    return { applyBeautify, restoreDefaults }
}
