import { ref } from 'vue';
import CesiumVolumetricClouds from '../Clouds/CesiumVolumetricClouds';
import { DEFAULT_CLOUD_PARAMS } from '../Clouds/cloudDefaults';
import { applyQualityPreset, normalizeCloudParams } from '../Clouds/cloudMath';

export function useCesiumClouds({ getViewer, getCesium, message }) {
    const clouds = ref(null);
    const cloudParams = ref(normalizeCloudParams(DEFAULT_CLOUD_PARAMS));
    const cloudState = ref({
        enabled: false,
        ready: false,
        error: '',
        webgl2: true,
        quality: cloudParams.value.quality,
    });

    function updateState(patch = {}) {
        cloudState.value = {
            ...cloudState.value,
            ...patch,
            enabled: !!clouds.value,
            ready: !!clouds.value,
            quality: cloudParams.value.quality,
        };
    }

    function clearClouds() {
        const viewer = getViewer?.();
        if (!clouds.value) {
            updateState({ enabled: false, ready: false });
            return;
        }

        try {
            viewer?.scene?.primitives?.remove(clouds.value);
        } catch (error) {
            console.warn('Cesium volumetric clouds primitive remove warning:', error);
        }
        clouds.value.destroy();
        clouds.value = null;
        cloudParams.value = normalizeCloudParams({ ...cloudParams.value, enabled: false });
        updateState({ enabled: false, ready: false, error: '' });
        viewer?.scene?.requestRender?.();
    }

    function enableClouds() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || !Cesium) {
            message.error('Cesium 尚未初始化');
            return false;
        }

        clearClouds();

        try {
            cloudParams.value = normalizeCloudParams({ ...cloudParams.value, enabled: true });
            clouds.value = new CesiumVolumetricClouds(viewer, {
                ...cloudParams.value,
                cesium: Cesium,
            });
            viewer.scene.primitives.add(clouds.value);
            updateState({ enabled: true, ready: true, error: '', webgl2: !!viewer.scene.context?.webgl2 });
            viewer.scene.requestRender?.();
            message.success('体积云已启用，可通过模块滑块调节云层参数。');
            return true;
        } catch (error) {
            clouds.value = null;
            cloudParams.value = normalizeCloudParams({ ...cloudParams.value, enabled: false });
            updateState({
                enabled: false,
                ready: false,
                error: error?.message || String(error),
                webgl2: !!viewer.scene.context?.webgl2,
            });
            message.error(error?.message || '体积云初始化失败');
            return false;
        }
    }

    function disableClouds() {
        clearClouds();
        message.success('体积云已关闭。');
    }

    function toggleClouds() {
        if (clouds.value) {
            disableClouds();
            return false;
        }
        return enableClouds();
    }

    function resetClouds() {
        const wasEnabled = !!clouds.value;
        cloudParams.value = normalizeCloudParams({ ...DEFAULT_CLOUD_PARAMS, enabled: wasEnabled });
        clouds.value?.setParams(cloudParams.value);
        updateState({ error: '' });
        getViewer?.()?.scene?.requestRender?.();
        message.success('体积云参数已重置。');
    }

    function setCloudParam(controlId, value) {
        if (controlId === 'quality') {
            cloudParams.value = applyQualityPreset(cloudParams.value, value);
        } else {
            cloudParams.value = normalizeCloudParams({
                ...cloudParams.value,
                [controlId]: value,
            });
        }

        clouds.value?.setParams(cloudParams.value);
        updateState({ error: '' });
        getViewer?.()?.scene?.requestRender?.();
        return true;
    }

    return {
        clouds,
        cloudParams,
        cloudState,
        enableClouds,
        disableClouds,
        toggleClouds,
        resetClouds,
        setCloudParam,
        clearClouds,
    };
}
