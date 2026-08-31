/**
 * cesiumRuntime.js — Cesium 运行时加载
 *
 * cesium-shim.js 的 CDN 注入已改为显式触发，本模块负责：
 * 1. 调用 ensureCesiumLoaded() 启动 CDN 注入并等待 cesiumReady（CDN 就位）
 * 2. 加载 widgets.css
 * 3. 写入 Ion token
 *
 * 仅 CesiumContainer 懒加载链路会触发本模块，非 Cesium 页面不受影响。
 */

import { ensureCesiumLoaded, CESIUM_BASE_URL, getActiveCesiumBaseUrl } from 'cesium';

export { CESIUM_BASE_URL };
/** 主源静态值(兼容保留);多源回退后实际样式地址在 loadCesiumRuntime 内按生效源计算 */
export const CESIUM_CSS_URL = `${CESIUM_BASE_URL}Widgets/widgets.css`;

/**
 * 等待 Cesium CDN 就位，加载样式并写入 Ion token。
 * @param {{ ionToken?: string }} [options]
 * @returns {Promise<object>} window.Cesium
 */
export async function loadCesiumRuntime({ ionToken } = {}) {
    if (!window.Cesium) {
        // eslint-disable-next-line no-console
        console.info('[Cesium][runtime] 触发 cesium-shim CDN 加载并等待就绪...');
        await ensureCesiumLoaded();
    }

    // widgets.css 必须与实际加载成功的 CDN 同源(多源回退后可能不是主源)
    await loadStyleOnce(`${getActiveCesiumBaseUrl()}Widgets/widgets.css`, 'cesium-widgets-style');

    const Cesium = window.Cesium;
    if (!Cesium) {
        throw new Error('[Cesium][runtime] cesiumReady 已 resolve 但 window.Cesium 仍为空');
    }

    applyCesiumIonToken(Cesium, ionToken);
    // eslint-disable-next-line no-console
    console.info('[Cesium][runtime] 就绪', {
        version: Cesium.VERSION || 'unknown',
        ionTokenApplied: !!ionToken,
    });
    return Cesium;
}

/**
 * 写入 Cesium Ion 访问令牌。
 * @param {object} Cesium
 * @param {string} [ionToken]
 */
export function applyCesiumIonToken(Cesium, ionToken) {
    if (ionToken && Cesium?.Ion) {
        Cesium.Ion.defaultAccessToken = ionToken;
    }
}

// ==========================================
// 内部工具
// ==========================================

function loadStyleOnce(url, id) {
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) {
            resolve();
            return;
        }
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`[Cesium][runtime] 样式加载失败: ${url}`));
        document.head.appendChild(link);
    });
}
