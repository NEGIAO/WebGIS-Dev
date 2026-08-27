export function useCesiumCreditHider({ getViewer }) {
    let creditCheckIntervalId = null;
    let creditOverrideStyleEl = null;
    let creditMutationObserver = null;

    function installCreditHider() {
        const viewer = getViewer?.();
        if (!viewer) return;

        if (viewer._cesiumWidget?._creditContainer) {
            viewer._cesiumWidget._creditContainer.style.display = 'none';
        }

        hideCreditsAggressive();

        // 使用 MutationObserver 替代 setInterval 轮询，避免永久运行浪费资源
        const targetNode = document.querySelector('.cesium-credit-container');
        if (targetNode) {
            creditMutationObserver = new MutationObserver(() => {
                if (targetNode.innerHTML.length > 0) {
                    targetNode.innerHTML = '';
                    targetNode.style.cssText =
                        'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
                }
            });
            creditMutationObserver.observe(targetNode, { childList: true, subtree: true, characterData: true });
        }

        if (!document.getElementById('cesium-credit-override')) {
            const style = document.createElement('style');
            style.id = 'cesium-credit-override';
            style.textContent = `
      .cesium-credit-container { display: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; }
      .cesium-credit-text { display: none !important; visibility: hidden !important; }
      .cesium-credit-logo-link { display: none !important; visibility: hidden !important; }
    `;
            document.head.appendChild(style);
            creditOverrideStyleEl = style;
        }
    }

    function hideCreditsAggressive() {
        const viewer = getViewer?.();
        if (!viewer) return;

        if (viewer._cesiumWidget?._creditContainer) {
            viewer._cesiumWidget._creditContainer.style.cssText =
                'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
            viewer._cesiumWidget._creditContainer.innerHTML = '';
        }

        const creditElems = document.querySelectorAll(
            '[class*="credit"], [class*="geostar"], [class*="GeoStar"]',
        );
        creditElems.forEach((el) => {
            el.style.cssText = 'display: none !important; visibility: hidden !important;';
            el.innerHTML = '';
        });

        if (viewer.scene && viewer.scene.frameState && viewer.scene.frameState.creditDisplay) {
            const creditDisplay = viewer.scene.frameState.creditDisplay;
            if (!creditDisplay._originalHasCredits) {
                creditDisplay._originalHasCredits = creditDisplay.hasCredits;
                creditDisplay._originalDestroy = creditDisplay.destroy;
            }
            creditDisplay.hasCredits = () => false;
            // destroy 不能置空：viewer.destroy() 销毁链依赖原生 destroy 完成 scene 资源回收，
            // 若跳过则 _scene 已置空但 isDestroyed() 仍为 false，渲染循环残留并在 resize() 崩溃
            creditDisplay.hasCreditsPatched = true;
        }
    }

    /**
     * 恢复被 hideCreditsAggressive 补丁过的 CreditDisplay 原生方法。
     * 必须在 viewer.destroy() 之前调用，否则销毁链会因补丁残留而中断。
     */
    function restoreCreditDisplay(viewer) {
        try {
            const creditDisplay = viewer?.scene?.frameState?.creditDisplay;
            if (!creditDisplay || !creditDisplay.hasCreditsPatched) return;
            if (creditDisplay._originalHasCredits) creditDisplay.hasCredits = creditDisplay._originalHasCredits;
            if (creditDisplay._originalDestroy) creditDisplay.destroy = creditDisplay._originalDestroy;
            delete creditDisplay.hasCreditsPatched;
            delete creditDisplay._originalHasCredits;
            delete creditDisplay._originalDestroy;
        } catch { /* ignore */ }
    }

    function cleanupCreditHider() {
        if (creditCheckIntervalId) {
            clearInterval(creditCheckIntervalId);
            creditCheckIntervalId = null;
        }
        if (creditMutationObserver) {
            creditMutationObserver.disconnect();
            creditMutationObserver = null;
        }
        if (creditOverrideStyleEl) {
            creditOverrideStyleEl.remove();
            creditOverrideStyleEl = null;
        }
    }

    return {
        installCreditHider,
        cleanupCreditHider,
        restoreCreditDisplay,
    };
}
