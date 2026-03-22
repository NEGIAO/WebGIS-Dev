let tiandituSdkPromise = null;

/**
 * 动态加载天地图 JS SDK，避免重复注入 script。
 * @param {string} tk 天地图 token
 * @returns {Promise<any>}
 */
export function loadTiandituSdk(tk) {
    const token = String(tk || '').trim();
    if (!token) {
        return Promise.reject(new Error('天地图 Token 未配置'));
    }

    if (typeof window !== 'undefined' && window.T && window.T.Map) {
        return Promise.resolve(window.T);
    }

    if (tiandituSdkPromise) {
        return tiandituSdkPromise;
    }

    tiandituSdkPromise = new Promise((resolve, reject) => {
        const scriptId = 'tianditu-sdk-script';
        const existing = document.getElementById(scriptId);
        if (existing) {
            existing.addEventListener('load', () => resolve(window.T), { once: true });
            existing.addEventListener('error', () => reject(new Error('天地图 SDK 加载失败')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = scriptId;
        script.async = true;
        script.src = `https://api.tianditu.gov.cn/api?v=4.0&tk=${encodeURIComponent(token)}`;
        script.onload = () => {
            if (window.T && window.T.Map) {
                resolve(window.T);
                return;
            }
            reject(new Error('天地图 SDK 已加载，但未检测到 T.Map'));
        };
        script.onerror = () => {
            tiandituSdkPromise = null;
            reject(new Error('天地图 SDK 加载失败'));
        };

        document.head.appendChild(script);
    });

    return tiandituSdkPromise;
}
