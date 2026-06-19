/**
 * cesiumRuntime.js
 * Cesium 运行时加载：从 jsDelivr CDN 注入 Cesium.js / widgets.css 并写入 Ion token
 */

export const CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.122/Build/Cesium/';
export const CESIUM_JS_URL = `${CESIUM_BASE_URL}Cesium.js`;
export const CESIUM_CSS_URL = `${CESIUM_BASE_URL}Widgets/widgets.css`;

export async function loadCesiumRuntime({ ionToken } = {}) {
    if (!window.CESIUM_BASE_URL) {
        window.CESIUM_BASE_URL = CESIUM_BASE_URL;
    }

    console.info('[Cesium][runtime] loading', { baseUrl: window.CESIUM_BASE_URL });

    await loadStyleOnce(CESIUM_CSS_URL, 'cesium-widgets-style');
    console.info('[Cesium][runtime] widgets.css loaded');
    await loadScriptOnce(CESIUM_JS_URL, 'cesium-runtime-script');
    console.info('[Cesium][runtime] Cesium.js loaded');

    const Cesium = window.Cesium;
    if (!Cesium) {
        throw new Error('Cesium global 未找到（window.Cesium 为空）');
    }
    applyCesiumIonToken(Cesium, ionToken);
    console.info('[Cesium][runtime] ready', {
        version: Cesium.VERSION || 'unknown',
        ionTokenApplied: !!ionToken,
    });
    return Cesium;
}

export function applyCesiumIonToken(Cesium, ionToken) {
    if (ionToken && Cesium?.Ion) {
        Cesium.Ion.defaultAccessToken = ionToken;
    }
}

function loadScriptOnce(url, id) {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(id);
        if (existing) {
            if (existing.getAttribute('data-loaded') === 'true') {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`脚本加载失败: ${url}`)), {
                once: true,
            });
            return;
        }

        const script = document.createElement('script');
        script.id = id;
        script.src = url;
        script.async = true;
        script.onload = () => {
            script.setAttribute('data-loaded', 'true');
            resolve();
        };
        script.onerror = () => reject(new Error(`脚本加载失败: ${url}`));
        document.head.appendChild(script);
    });
}

function loadStyleOnce(url, id) {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(id);
        if (existing) {
            resolve();
            return;
        }

        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`样式加载失败: ${url}`));
        document.head.appendChild(link);
    });
}
