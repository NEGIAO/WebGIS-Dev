import { loadMapRuntimeDeps } from './mapRuntimeDeps';

/**
 * Start GIS heavy assets prewarm lazily.
 * 注：geotiff 运行时不再预热（337 KB），由文件导入功能按需加载。
 */
export function warmDeferredGisAssets() {
    return Promise.allSettled([loadMapRuntimeDeps()]);
}
