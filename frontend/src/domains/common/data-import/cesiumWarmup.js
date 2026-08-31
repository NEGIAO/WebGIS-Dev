/**
 * Cesium 运行时空闲预热。
 *
 * 背景：Cesium 本地化后主脚本 public/cesium/Cesium.js 约 6MB，默认在
 * 首次切换 3D 时才下载，造成明显等待。此处利用用户浏览 2D 地图的空闲
 * 时间在后台完成下载（显式调用 ensureCesiumLoaded() 触发注入），
 * 真正切换时命中 HTTP 缓存秒开。
 *
 * 触发策略：首屏地图就绪后延迟 6s + 浏览器 idle 时调用
 * ensureCesiumLoaded() 显式触发下载（shim 已无模块顶层副作用，
 * 不调用就绝不会发起 Cesium.js 请求）；
 * saveData / 2G 慢速网络直接跳过，避免浪费流量。
 */

/** 首屏就绪后的延迟（毫秒）：给底图瓦片/延迟任务留出带宽空窗 */
const WARMUP_DELAY_MS = 6000;

let scheduled = false;

function shouldSkipForDataSaver() {
    const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
    if (!conn) return false;
    return (
        conn.saveData === true ||
        conn.effectiveType === 'slow-2g' ||
        conn.effectiveType === '2g'
    );
}

/**
 * 调度 Cesium 主脚本预热（幂等；失败静默，不影响任何功能）。
 * 由 HomeView 在 map-core-ready 后调用。
 * @param {number} [delayMs]
 */
export function scheduleCesiumWarmup(delayMs = WARMUP_DELAY_MS) {
    if (scheduled || typeof window === 'undefined') return;
    if (shouldSkipForDataSaver()) {
        console.warn('[CesiumWarmup] saveData/慢速网络，跳过预热');
        return;
    }
    scheduled = true;

    const kick = () => {
        import('@/cesium-shim.js')
            .then((mod) => mod.ensureCesiumLoaded())
            .then(() => {
                // eslint-disable-next-line no-console
                console.info('[CesiumWarmup] Cesium 主脚本预热已触发（后台下载中）');
            })
            .catch((err) => {
                console.warn('[CesiumWarmup] 预热失败（不影响功能）:', err);
            });
    };

    window.setTimeout(() => {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(kick, { timeout: 5000 });
        } else {
            window.setTimeout(kick, 0);
        }
    }, delayMs);
}
