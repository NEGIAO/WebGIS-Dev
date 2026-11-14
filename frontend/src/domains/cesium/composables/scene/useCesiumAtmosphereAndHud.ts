/**
 * 功能名称：Cesium 大气光照参数控制、相机高度渐隐与右下角坐标 HUD Composable
 * 说    明：封装基础大气 / Tellux 月光参数同步、地面大气高度平滑渐隐（fadeActive）、
 *           相机姿态追踪、瓦片缩放级别反算及桌面/触屏坐标 HUD 格式化与剪贴板复制。
 */
import { computed, ref, watch, type Ref } from 'vue';
import { translate as t } from '@common/app/useLocale';
import { cesiumHeightToOlZoom } from '@common/utils/viewScale';
import { isCloudPipelineActive } from '@cesium-domain/modules/cloud';
import { copyTextToClipboard } from '../../utils/browserIo';

export interface CameraAttitudeState {
    heading: number;
    pitch: number;
    roll: number;
    height: number;
}

export interface UseCesiumAtmosphereAndHudDeps {
    getCesium: () => any;
    getViewer: () => any;
    message: any;
    cesiumReady: Ref<boolean>;
    coordinateDisplay: Ref<string>;
    playerController: any;
    flyToHome: (duration?: number) => any;
    baseAtmosphereParams: Ref<Record<string, any>>;
    atmosphereParams: Ref<Record<string, any>>;
    cloudParams: Ref<Record<string, any>>;
}

export function useCesiumAtmosphereAndHud(deps: UseCesiumAtmosphereAndHudDeps) {
    const {
        getCesium,
        getViewer,
        message,
        cesiumReady,
        coordinateDisplay,
        playerController,
        flyToHome,
        baseAtmosphereParams,
        atmosphereParams,
        cloudParams,
    } = deps;

    /** 相机姿态（方位角/俯仰角/翻滚角/海拔），由 scene.postRender 每帧更新 */
    const cameraAttitude = ref<CameraAttitudeState>({
        heading: 0,
        pitch: 0,
        roll: 0,
        height: 0,
    });

    /** 触屏能力判定（pointer: coarse）：仅用于 HUD 的图标尺寸与布局，不参与默认显隐 */
    const isTouch = ref(
        typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(pointer: coarse)').matches,
    );

    /**
     * 坐标显示：漫游模式下显示人物三维坐标+实时速度，否则显示鼠标位置。
     * 结构化为「位置 / 姿态 / 相机海拔」三组（标签与值分离，便于样式分层）。
     */
    const coordinateGroups = computed(() => {
        const att = cameraAttitude.value;
        const pos = playerController.playerPosition.value;

        let positionValue: string;
        if (pos) {
            const speed = playerController.playerSpeed.value;
            const speedText = speed > 0.1 ? ` · 速度 ${speed.toFixed(1)} m/s` : '';
            positionValue = `经度 ${pos.lng.toFixed(6)}, 纬度 ${pos.lat.toFixed(6)}, 海拔 ${pos.height.toFixed(2)}米${speedText}`;
        } else {
            const coord = coordinateDisplay.value;
            positionValue = coord.includes('--') ? '移动鼠标取点' : coord.replace(/:\s*/g, ' ');
        }

        return {
            roaming: !!pos,
            groups: [
                { key: 'position', label: '位置', value: positionValue },
                {
                    key: 'attitude',
                    label: '姿态',
                    value: `方位 ${att.heading.toFixed(1)}° 俯仰 ${att.pitch.toFixed(1)}° 翻滚 ${att.roll.toFixed(1)}°`,
                },
                { key: 'camera', label: '相机海拔', value: `${att.height.toFixed(1)} 米` },
            ],
        };
    });

    /** 触屏紧凑坐标：只保留经纬度 + 海拔，单行展示 */
    const mobileCoordinateText = computed(() => {
        const pos = playerController.playerPosition.value;
        if (pos) {
            return `${pos.lng.toFixed(4)}, ${pos.lat.toFixed(4)}, ${pos.height.toFixed(0)}m`;
        }

        const coord = coordinateDisplay.value;
        if (coord.includes('--')) return '移动鼠标取点';

        const nums = coord.match(/-?\d+(?:\.\d+)?/g) || [];
        if (nums.length >= 3) {
            return `${Number(nums[0]).toFixed(4)}, ${Number(nums[1]).toFixed(4)}, ${Number(nums[2]).toFixed(0)}m`;
        }
        return coord.replace(/:\s*/g, ' ');
    });

    /** 复制到剪贴板的纯文本：桌面逐行「标签: 值」，触屏用紧凑单行 */
    const coordinateCopyText = computed(() => {
        if (isTouch.value) return mobileCoordinateText.value;
        return coordinateGroups.value.groups
            .map((group) => `${group.label}: ${group.value}`)
            .join('\n');
    });

    async function copyActiveCoordinateDisplay(): Promise<void> {
        const ok = await copyTextToClipboard(coordinateCopyText.value);
        if (ok) {
            message.success(t('cesium.copyCoordinateSuccess'));
        } else {
            message.warning(t('cesium.copyCoordinateFailed'));
        }
    }

    /** 坐标 HUD 显示开关：默认关闭，用户点击显隐开关后才展开（桌面 / 触屏一致） */
    const hudVisible = ref(false);

    const hudToggleTitle = computed(() =>
        hudVisible.value ? t('cesium.collapseCoordHud') : t('cesium.expandCoordHud'),
    );

    // ────────────────────────── 瓦片请求级别（与 OL zoom 同义） ──────────────────────────
    const tileZoomLevel = ref<number | null>(null);

    /**
     * 展示用瓦片请求级别，取整规则与 OL MapControlsBar.displayZoom 对齐：
     * z < 4 取 round，z >= 4 取 ceil。
     */
    const displayTileZoom = computed(() => {
        const z = Number(tileZoomLevel.value);
        if (!Number.isFinite(z)) return '--';
        if (z < 4) return String(Math.round(z));
        return String(Math.ceil(z));
    });

    function syncTileZoomLevel(cam: any, viewer: any): void {
        const height = cam?.positionCartographic?.height;
        if (!Number.isFinite(height) || height <= 0) {
            if (tileZoomLevel.value !== null) tileZoomLevel.value = null;
            return;
        }
        const next = cesiumHeightToOlZoom({
            height,
            viewportHeight: viewer?.canvas?.clientHeight || undefined,
            fovY: Number(cam?.frustum?.fov) || undefined,
        });
        if (next == null || !Number.isFinite(next)) return;
        const quantized = Math.round(next * 10) / 10;
        if (tileZoomLevel.value !== quantized) tileZoomLevel.value = quantized;
    }

    function handleHomeClick(): void {
        flyToHome(1.2);
    }

    // ────────────────────────── 大气参数与地面大气高度渐隐 ──────────────────────────
    function computeGroundAtmosphereBaseIntensity(): number {
        const p = baseAtmosphereParams.value;
        const tp = atmosphereParams.value;
        const base = p.atmosphereLightIntensity ?? 5.5;
        const MOON_BOOST_MAX = 4.0;
        const moonBoost =
            tp.moonLightEnabled !== false ? (tp.moonLightIntensity ?? 0.18) * MOON_BOOST_MAX : 0;
        return Math.min(base + moonBoost, Math.max(base, 12.0));
    }

    let lastGroundAtmosphereFadeFactor = -1;

    function updateGroundAtmosphereFade(): void {
        const viewer = getViewer();
        const Cesium = getCesium();
        const globe = viewer?.scene?.globe;
        if (!globe || !Cesium) return;

        const p = baseAtmosphereParams.value;
        // 体积云存活期间逐帧压制原生地面大气，避免双大气闪烁
        if (cloudParams.value.cloudsEnabled === true && globe.showGroundAtmosphere) {
            globe.showGroundAtmosphere = false;
        }

        const fadeActive = p.groundAtmosphereAutoFade === true && p.showGroundAtmosphere === true;
        if (!fadeActive) {
            if (lastGroundAtmosphereFadeFactor >= 0) {
                lastGroundAtmosphereFadeFactor = -1;
                if ('atmosphereLightIntensity' in globe) {
                    globe.atmosphereLightIntensity = computeGroundAtmosphereBaseIntensity();
                }
                globe.showGroundAtmosphere = p.showGroundAtmosphere === true;
                viewer.scene.requestRender?.();
            }
            return;
        }

        const low = p.groundAtmosphereFadeLowHeight ?? 100000;
        const high = p.groundAtmosphereFadeHighHeight ?? 500000;
        const height = viewer.camera.positionCartographic.height;
        const normalized = Cesium.Math.clamp((height - low) / Math.max(high - low, 1), 0, 1);
        const factor = normalized * normalized * (3 - 2 * normalized);
        const fadeStep = Math.abs(factor - lastGroundAtmosphereFadeFactor);

        if (fadeStep < 0.002 && !(factor === 0 && lastGroundAtmosphereFadeFactor > 0)) return;
        if (import.meta.env.DEV && fadeStep >= 0.1) {
            console.warn(
                `[大气渐隐] 高度=${(height / 1000).toFixed(0)}km 系数=${factor.toFixed(2)} 地面大气=${factor > 0 ? '开' : '关'}`,
            );
        }

        lastGroundAtmosphereFadeFactor = factor;
        if ('atmosphereLightIntensity' in globe) {
            globe.atmosphereLightIntensity = computeGroundAtmosphereBaseIntensity() * factor;
        }
        globe.showGroundAtmosphere = factor > 0;
        viewer.scene.requestRender?.();
    }

    function applyBaseAtmosphereParams(params: Record<string, any>): void {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium || !params) return;

        const scene = viewer.scene;
        const globe = scene.globe;

        if (globe) {
            globe.enableLighting = params.enableLighting;
            globe.showGroundAtmosphere = params.showGroundAtmosphere;
            if ('dynamicAtmosphereLighting' in globe) {
                globe.dynamicAtmosphereLighting = params.dynamicAtmosphereLighting;
            }
            if ('dynamicAtmosphereLightingFromSun' in globe) {
                globe.dynamicAtmosphereLightingFromSun = params.dynamicAtmosphereLightingFromSun;
            }
            if ('atmosphereLightIntensity' in globe) {
                globe.atmosphereLightIntensity = params.atmosphereLightIntensity;
            }
            if ('atmosphereHueShift' in globe) globe.atmosphereHueShift = params.atmosphereHueShift;
            if ('atmosphereSaturationShift' in globe) {
                globe.atmosphereSaturationShift = params.atmosphereSaturationShift;
            }
            if ('atmosphereBrightnessShift' in globe) {
                globe.atmosphereBrightnessShift = params.atmosphereBrightnessShift;
            }
            if ('lightingFadeInDistance' in globe) {
                globe.lightingFadeInDistance = params.lightingFadeInDistance;
            }
            if ('lightingFadeOutDistance' in globe) {
                globe.lightingFadeOutDistance = params.lightingFadeOutDistance;
            }
            if ('nightFadeInDistance' in globe) {
                globe.nightFadeInDistance = params.nightFadeInDistance;
            }
            if ('nightFadeOutDistance' in globe) {
                globe.nightFadeOutDistance = params.nightFadeOutDistance;
            }
        }

        if (scene.fog) {
            scene.fog.enabled = params.fogEnabled;
            if ('density' in scene.fog) scene.fog.density = params.fogDensity;
            if ('minimumBrightness' in scene.fog) {
                scene.fog.minimumBrightness = params.fogMinimumBrightness;
            }
        }

        const sky = scene.skyAtmosphere;
        if (sky) {
            if ('atmosphereLightIntensity' in sky) {
                sky.atmosphereLightIntensity = params.skyAtmosphereLightIntensity;
            } else if ('lightIntensity' in sky) {
                sky.lightIntensity = params.skyAtmosphereLightIntensity;
            }
            if ('brightnessShift' in sky) sky.brightnessShift = params.skyAtmosphereBrightnessShift;
            if ('saturationShift' in sky) sky.saturationShift = params.skyAtmosphereSaturationShift;
            if ('atmosphereRayleighScaleHeight' in sky) {
                sky.atmosphereRayleighScaleHeight = params.skyAtmosphereRayleighScaleHeight;
            }
        }

        if (scene.sun) scene.sun.show = params.sunShow;
        if (scene.moon) scene.moon.show = params.moonShow;
        if (!isCloudPipelineActive(viewer) && scene.skyBox) {
            scene.skyBox.show = params.skyBoxShow;
        }

        lastGroundAtmosphereFadeFactor = -1;
        scene.requestRender?.();
    }

    function applyAtmosphereParams(_params?: Record<string, any>): void {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) return;

        const scene = viewer.scene;
        const globe = scene.globe;

        if (globe && 'atmosphereLightIntensity' in globe) {
            globe.atmosphereLightIntensity = computeGroundAtmosphereBaseIntensity();
        }
        scene.requestRender?.();
    }

    watch(cesiumReady, (ready) => {
        if (ready) {
            applyBaseAtmosphereParams(baseAtmosphereParams.value);
            applyAtmosphereParams(atmosphereParams.value);
        }
    });

    watch(
        baseAtmosphereParams,
        (params) => {
            applyBaseAtmosphereParams(params);
        },
        { deep: true },
    );

    watch(
        atmosphereParams,
        (params) => {
            applyAtmosphereParams(params);
        },
        { deep: true },
    );

    return {
        cameraAttitude,
        isTouch,
        coordinateGroups,
        mobileCoordinateText,
        copyActiveCoordinateDisplay,
        hudVisible,
        hudToggleTitle,
        displayTileZoom,
        syncTileZoomLevel,
        handleHomeClick,
        updateGroundAtmosphereFade,
    };
}
