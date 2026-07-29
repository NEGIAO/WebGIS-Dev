/**
 * 获取 CDN 注入的全局 Cesium。
 * Cloud/lib 源码使用裸 `Cesium.xxx`，ESM 打包后不会自动注入全局符号，
 * 各模块在文件顶部 `const Cesium = getCesium()` 绑定本地常量。
 *
 * 调用时机：须在 loadCesiumRuntime / Viewer 创建之后（动态 import 本库时已满足）。
 *
 * @returns {typeof window.Cesium}
 */
export function getCesium() {
  const C =
    (typeof window !== "undefined" && window.Cesium) ||
    (typeof globalThis !== "undefined" && globalThis.Cesium) ||
    null;
  if (!C) {
    throw new Error("[Cloud] window.Cesium 未就绪，请先完成 Cesium CDN 加载");
  }
  return C;
}
