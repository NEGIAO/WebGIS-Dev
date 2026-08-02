/**
 * Cesium 懒加载 composable
 *
 * 封装 CesiumContainer 的动态导入 + 重试逻辑，从 HomeView.vue 提取。
 * 处理 Vite dev 模式下 "Failed to fetch dynamically imported module" 瞬态错误。
 */

/**
 * 动态导入 CesiumContainer，带重试机制处理 Vite 瞬态模块获取失败。
 *
 * 关键约束：Vite 构建时只能分析 string literal 形式的动态 import specifier。
 * 首次用纯静态字符串（Vite 可分析并正确分块）；重试时改用带 ?t= 时间戳的 specifier。
 * 重试 specifier 含运行时动态部分，Vite 无法预先分析，但浏览器在运行时
 * 会向 Vite dev server 发起请求，dev server 忽略查询参数后仍能找到对应 chunk。
 */
export async function importCesiumContainerWithRetry(maxRetries = 2) {
    // 首次尝试：静态 specifier，Vite 可分析
    try {
        return await import('@cesium-domain/components/CesiumContainer.vue');
    } catch (error) {
        const text = String(error?.message || error || '');
        const isTransientModuleFetchFail = text.includes('Failed to fetch dynamically imported module');
        if (!isTransientModuleFetchFail) {
            throw error;
        }
        console.warn('[CesiumContainer] 动态导入瞬态失败，开始重试...');
    }

    // 重试阶段：追加 ?t= 时间戳打破缓存
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await import(`@cesium-domain/components/CesiumContainer.vue?t=${Date.now()}`);
        } catch (error) {
            const text = String(error?.message || error || '');
            const isTransientModuleFetchFail = text.includes('Failed to fetch dynamically imported module');
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
