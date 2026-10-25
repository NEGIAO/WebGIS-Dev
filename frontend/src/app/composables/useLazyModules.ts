/**
 * Cesium 懒加载 composable
 *
 * 封装 CesiumContainer 的动态导入 + 重试逻辑，从 HomeView.vue 提取。
 * 处理 Vite dev 模式下 "Failed to fetch dynamically imported module" 瞬态错误。
 */

/**
 * 唯一的加载入口。
 *
 * **必须是静态字面量 specifier**：Vite 在构建期与 dev 期都只能分析字符串字面量的
 * 动态 import。历史实现在重试分支里拼过 `...vue?t=${Date.now()}`，属于「运行时变量
 * specifier」，dev 下直接抛 `Unknown variable dynamic import`、构建产物里也指向不存在
 * 的路径——即重试分支必然失败，反而把一次可恢复的瞬态失败升级为硬失败。
 * 缓存击穿改用下面的退避等待，不再靠查询参数。
 */
function loadCesiumContainer() {
    return import('@cesium-domain/components/CesiumContainer.vue');
}

/**
 * 判断是否为「瞬态模块获取失败」——即重试有意义的那一类错误。
 * 各浏览器的措辞不同，逐一覆盖；其他错误（语法错误、依赖缺失等）不重试。
 * @param error 捕获到的异常
 */
function isTransientModuleFetchError(error: unknown): boolean {
    const text = String((error as any)?.message || error || '');
    return (
        text.includes('Failed to fetch dynamically imported module') || // Chromium
        text.includes('error loading dynamically imported module') || // Firefox
        text.includes('Importing a module script failed') || // Safari
        text.includes('NetworkError when attempting to fetch resource')
    );
}

/** 退避等待（毫秒）：给 dev server 重启 / 网络抖动留出恢复窗口 */
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 动态导入 CesiumContainer，带重试机制处理 Vite 瞬态模块获取失败。
 *
 * 重试始终复用同一个静态 specifier：失败的模块不会进入浏览器模块表缓存，
 * 重新 import 会真实重发请求，无需（也无法）用查询参数破缓存。
 *
 * @param maxRetries 最大重试次数（不含首次尝试），默认 2
 * @returns CesiumContainer 的模块命名空间
 */
export async function importCesiumContainerWithRetry(maxRetries = 2) {
    const attempts = Math.max(0, Number(maxRetries) || 0);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= attempts; attempt++) {
        try {
            return await loadCesiumContainer();
        } catch (error) {
            lastError = error;
            // 非瞬态错误立即上抛：重试也只会得到同样结果，徒增等待
            if (attempt >= attempts || !isTransientModuleFetchError(error)) {
                throw error;
            }
            console.warn(`[CesiumContainer] 动态导入瞬态失败，第 ${attempt + 1} 次重试...`);
            await wait(150 * (attempt + 1));
        }
    }

    // 理论不可达（循环内必 return 或 throw），保留以满足返回值完备性
    throw lastError;
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
