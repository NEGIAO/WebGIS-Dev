export function useCesiumCreditHider({ getViewer }) {
    let creditCheckIntervalId = null;
    let creditOverrideStyleEl = null;

    function installCreditHider() {
        const viewer = getViewer?.();
        if (!viewer) return;

        if (viewer._cesiumWidget?._creditContainer) {
            viewer._cesiumWidget._creditContainer.style.display = 'none';
        }

        hideCreditsAggressive();

        creditCheckIntervalId = setInterval(() => {
            const creditContainer = document.querySelector('.cesium-credit-container');
            if (creditContainer && creditContainer.innerHTML.length > 0) {
                creditContainer.innerHTML = '';
                creditContainer.style.cssText =
                    'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important;';
            }
        }, 500);

        if (!document.getElementById('cesium-credit-override')) {
            const style = document.createElement('style');
            style.id = 'cesium-credit-override';
            style.textContent = `
      .cesium-credit-container { display: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; }
      .cesium-credit-text { display: none !important; visibility: hidden !important; }
      .cesium-credit-logo-link { display: none !important; visibility: hidden !important; }
      [class*="credit"] { display: none !important; visibility: hidden !important; }
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
            viewer.scene.frameState.creditDisplay.hasCredits = () => false;
            viewer.scene.frameState.creditDisplay.destroy = () => {};
        }
    }

    function cleanupCreditHider() {
        if (creditCheckIntervalId) {
            clearInterval(creditCheckIntervalId);
            creditCheckIntervalId = null;
        }
        if (creditOverrideStyleEl) {
            creditOverrideStyleEl.remove();
            creditOverrideStyleEl = null;
        }
    }

    return {
        installCreditHider,
        cleanupCreditHider,
    };
}
