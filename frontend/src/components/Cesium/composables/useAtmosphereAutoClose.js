/**
 * useAtmosphereAutoClose - 近地自动关闭大气+光照
 *
 * 监听相机高度（对应 URL 中的 z 参数），当用户放大到阈值以下时自动关闭：
 * - 地面大气（globe.showGroundAtmosphere）
 * - 天空大气（scene.skyAtmosphere.show）
 * - 日照（globe.enableLighting）
 *
 * 拉远到阈值以上后自动恢复。用户可通过控制中心按钮手动覆盖。
 *
 * @param {Object} options
 * @param {Function} options.getViewer  - 返回 Cesium.Viewer 实例
 * @param {Function} options.getCesium  - 返回 Cesium 全局对象
 * @param {number}   [options.heightThreshold=80000] - 触发自动关闭的高度阈值（米），对应 URL z 参数
 */
import { ref } from 'vue';

export function useAtmosphereAutoClose({
    getViewer,
    getCesium,
    heightThreshold = 80000,
} = {}) {
    /** 自动关闭开关（用户可从控制中心切换） */
    const atmosphereAutoCloseEnabled = ref(true);

    /** 当前是否处于被自动关闭状态 */
    const atmosphereAutoClosed = ref(false);

    /** 自动关闭前的 enableLighting 原始值，用于精确恢复 */
    let savedEnableLighting = true;

    let removeListener = null;

    /** 启动相机高度监听器 */
    function start() {
        const viewer = getViewer();
        if (!viewer) return;

        removeListener = viewer.scene.postRender.addEventListener(() => {
            if (!atmosphereAutoCloseEnabled.value) return;
            checkHeight(viewer);
        });
    }

    /**
     * 检查相机高度并自动切换大气+光照状态
     * @param {Cesium.Viewer} viewer
     */
    function checkHeight(viewer) {
        const Cesium = getCesium();
        const camera = viewer.camera;
        const cartographic = Cesium.Cartographic.fromCartesian(camera.positionWC);
        const height = cartographic.height;
        const scene = viewer.scene;
        const globe = scene.globe;

        if (height < heightThreshold) {
            // 低于阈值且尚未关闭 → 保存当前状态并关闭
            if (!atmosphereAutoClosed.value) {
                savedEnableLighting = globe.enableLighting;
                globe.showGroundAtmosphere = false;
                globe.enableLighting = false;
                if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
                atmosphereAutoClosed.value = true;
                scene.requestRender?.();
            }
        } else {
            // 高于阈值且被自动关闭过 → 恢复
            if (atmosphereAutoClosed.value) {
                globe.showGroundAtmosphere = true;
                globe.enableLighting = savedEnableLighting;
                if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
                atmosphereAutoClosed.value = false;
                scene.requestRender?.();
            }
        }
    }

    /**
     * 切换自动关闭功能的启用状态
     * 禁用时会恢复大气和光照显示
     */
    function toggleAutoClose() {
        atmosphereAutoCloseEnabled.value = !atmosphereAutoCloseEnabled.value;

        const viewer = getViewer();
        if (!viewer) return atmosphereAutoCloseEnabled.value;

        const scene = viewer.scene;
        const globe = scene.globe;

        if (!atmosphereAutoCloseEnabled.value) {
            // 禁用自动关闭 → 恢复大气和光照
            globe.showGroundAtmosphere = true;
            globe.enableLighting = savedEnableLighting;
            if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
            atmosphereAutoClosed.value = false;
            scene.requestRender?.();
        }

        return atmosphereAutoCloseEnabled.value;
    }

    function cleanup() {
        if (removeListener) {
            removeListener();
            removeListener = null;
        }
    }

    return {
        atmosphereAutoCloseEnabled,
        atmosphereAutoClosed,
        start,
        toggleAutoClose,
        cleanup,
    };
}
