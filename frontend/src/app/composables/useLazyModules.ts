/**
 * Cesium 懒加载 composable
 *
 * 封装 CesiumContainer 的动态导入 + 重试逻辑，从 HomeView.vue 提取。
 * 处理 Vite dev 模式下 "Failed to fetch dynamically imported module" 瞬态错误。
 */

/**
 * 动态导入 CesiumContainer，带重试机制处理 Vite 瞬态模块获取失败。
 * "Failed to fetch dynamically imported module" 通常是 dev 缓存瞬态错误，
 * 在 specifier 后追加时间戳真打破 Vite 内部缓存后重试即可成功。
 */
export async function importCesiumContainerWithRetry(maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // 每次重试追加 ?t= 时间戳，强制 Vite 重新发起网络请求而非命中失败缓存
            const specifier = `@cesium-domain/components/CesiumContainer.vue${attempt > 0 ? `?t=${Date.now()}` : ''}`;
            return await import(specifier);
        } catch (error) {
            const text = String(error?.message || error || '');
            const isTransientModuleFetchFail = text.includes('Failed to fetch dynamically imported module');
            // 最后一次重试或非瞬态错误：不再重试
            if (attempt >= maxRetries || !isTransientModuleFetchFail) {
                throw error;
            }
            console.warn(`[CesiumContainer] 动态导入瞬态失败，第 ${attempt + 1} 次重试...`);
        }
    }
}

/**
 * 缓存 SidePanel 模块的懒加载（空闲预加载，但不挂载）。
 * 返回单例 Promise，失败后清空缓存允许重试。
 */
let sidePanelModulePromise: Promise<any> | null = null;
export function loadSidePanelModule() {
    if (!sidePanelModulePromise) {
        sidePanelModulePromise = import('@common/shell/SidePanel.vue').catch((error) => {
            sidePanelModulePromise = null;
            throw error;
        });
    }
    return sidePanelModulePromise;
}
