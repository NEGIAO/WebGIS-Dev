/**
 * useCesiumNavigation.js
 * 集成 cesium-navigation 插件（罗盘 + 缩放控件 + 比例尺）。
 * 源码内嵌于 ../cesium-navigation/，可直接修改。
 */

/**
 * @param {Object} options
 * @param {() => import('cesium').Viewer} options.getViewer - 获取 viewer 实例
 * @param {() => import('cesium')} options.getCesium - 获取 Cesium 对象
 * @returns {{ initNavigation: () => Promise<void>, cleanupNavigation: () => void }}
 */
export function useCesiumNavigation({ getViewer, getCesium }) {
    /** @type {InstanceType<typeof import('../../vendors/cesium-navigation/CesiumNavigation.js').default> | null} */
    let navigationInstance = null;

    /**
     * 初始化导航控件（罗盘、缩放、比例尺）
     * 必须在 viewer 创建后调用
     */
    async function initNavigation() {
        const viewer = getViewer?.();
        if (!viewer) {
            console.warn('[CesiumNavigation] viewer 未就绪，跳过初始化');
            return;
        }

        try {
            const { default: CesiumNavigation } = await import('../../vendors/cesium-navigation/CesiumNavigation.js');
            const Cesium = getCesium?.();

            navigationInstance = new CesiumNavigation(viewer, {
                enableCompass: true,
                enableZoomControls: true,
                enableDistanceLegend: false,
            });

            // 直接替换重置按钮的 resetView 方法，绕过 defaultResetView instanceof 检查
            const navVM = navigationInstance.navigationViewModel;
            if (navVM?.controls?.[1]) {
                const resetCtrl = navVM.controls[1];
                const chinaRect = Cesium?.Rectangle.fromDegrees(73, 3, 135, 53);
                if (chinaRect) {
                    resetCtrl.resetView = function () {
                        if (this.navigationLocked) return;
                        const scene = this.terria.scene;
                        const sscc = scene.screenSpaceCameraController;
                        if (!sscc.enableInputs) return;
                        this.isActive = true;
                        scene.camera.flyTo({
                            destination: chinaRect,
                            duration: 3,
                            complete: () => { this.isActive = false; },
                        });
                    };
                }
            }

            console.info('[CesiumNavigation] 导航控件已初始化');
        } catch (err) {
            console.warn('[CesiumNavigation] 初始化失败:', err);
        }
    }

    /**
     * 销毁导航控件，释放 DOM 和事件监听
     */
    function cleanupNavigation() {
        if (navigationInstance) {
            try {
                navigationInstance.destroy();
            } catch (err) {
                console.warn('[CesiumNavigation] 销毁时出错:', err);
            }
            navigationInstance = null;
        }
    }

    return {
        initNavigation,
        cleanupNavigation,
    };
}
