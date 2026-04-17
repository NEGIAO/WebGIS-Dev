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

        const cleanupWithError = (message) => {
            tiandituSdkPromise = null;
            reject(new Error(message));
        };

        const resolveIfReady = () => {
            if (window.T && window.T.Map) {
                resolve(window.T);
                return true;
            }
            return false;
        };

        if (existing) {
            if (resolveIfReady()) {
                return;
            }

            // 已经存在脚本且加载完成但仍无 T.Map，通常是 token/域名/CSP 问题；移除并重试注入。
            if (existing.readyState === 'complete' || existing.readyState === 'loaded') {
                existing.remove();
            } else {
                existing.addEventListener('load', () => {
                    if (!resolveIfReady()) {
                        cleanupWithError('天地图 SDK 已加载，但未检测到 T.Map（可能是 token 域名绑定或 CSP 问题）');
                    }
                }, { once: true });
                existing.addEventListener('error', () => cleanupWithError('天地图 SDK 加载失败'), { once: true });
                return;
            }
        }

        const script = document.createElement('script');
        script.id = scriptId;
        script.async = true;
        script.src = `https://api.tianditu.gov.cn/api?v=4.0&tk=${encodeURIComponent(token)}`;
        script.onload = () => {
            if (resolveIfReady()) {
                return;
            }
            cleanupWithError('天地图 SDK 已加载，但未检测到 T.Map（可能是 token 域名绑定或 CSP 问题）');
        };
        script.onerror = () => {
            cleanupWithError('天地图 SDK 加载失败');
        };

        const timeout = window.setTimeout(() => {
            script.onerror = null;
            script.onload = null;
            cleanupWithError('天地图 SDK 加载超时，请检查网络或浏览器拦截策略');
        }, 15000);

        script.addEventListener('load', () => window.clearTimeout(timeout), { once: true });
        script.addEventListener('error', () => window.clearTimeout(timeout), { once: true });

        document.head.appendChild(script);
    });

    return tiandituSdkPromise;
}
