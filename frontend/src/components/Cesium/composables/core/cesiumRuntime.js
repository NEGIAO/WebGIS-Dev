/**
 * cesiumRuntime.js
 * Cesium 运行时加载：cesium-shim.js 已在模块顶层启动 CDN 注入，
 * 本模块负责等待 CDN 就位 + 加载 widgets.css + 写入 Ion token。
 */

import { cesiumReady } from 'cesium';

export const CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.132/Build/Cesium/';
export const CESIUM_CSS_URL = `${CESIUM_BASE_URL}Widgets/widgets.css`;

export async function loadCesiumRuntime({ ionToken } = {}) {
    // cesium-shim.js 模块顶层已注入 Cesium CDN，此处等待它就位
    if (!window.Cesium) {
        console.info('[Cesium][runtime] waiting for cesium-shim CDN injection...');
        await cesiumReady;
    }

    // 确保 widgets.css 已加载（cesium-shim 不负责 CSS）
    await loadStyleOnce(CESIUM_CSS_URL, 'cesium-widgets-style');

    const Cesium = window.Cesium;
    if (!Cesium) {
        throw new Error('[Cesium][runtime] window.Cesium 仍为空，cesiumReady 可能未正确 resolve');
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
