# Cesium 依赖模块源码内嵌迁移

**日期：** 2026-07-25 17:30
**版本：** V3.4.2（版本号不变，归入同日批次）

---

## 修改内容

将 cesium-navigation-es6 和 cesium-wind-layer 两个 npm 依赖包从 `node_modules` 迁移到 `src/components/Cesium/` 目录下作为内嵌模块（一个文件夹一个模块）。同时将 Win2d 风场封装层归入 cesium-wind-layer 子模块，将导航控件高对比度主题 CSS 合并到导航主样式文件。

## 修改原因

1. **消除 patch-package 黑盒依赖**：cesium-navigation-es6 的模块级 `new CesiumClass()` 竞态问题原通过 patch-package 打补丁解决，补丁文件不直观且 `npm install` 后需重新应用。迁移后将惰性 getter 直接写入源码。
2. **统一模块组织**：Cesium 相关代码遵循"一个文件夹一个模块"原则，全部内聚在 `components/Cesium/` 下，源码可直接阅读和修改。
3. **消除 CDN 加载竞态**：cesium-shim.js 模块顶层注入 Cesium CDN 并暴露 `cesiumReady` Promise，cesiumRuntime.js 内部 `await cesiumReady` 确保 CDN 就位后再继续。不改 index.html，不阻塞非 Cesium 页面。

## 影响范围

| 模块 | 影响 |
|---|---|
| `cesium-shim.js` | 模块顶层增加 CDN 注入逻辑 + 暴露 `cesiumReady` |
| `cesiumRuntime.js` | `loadCesiumRuntime()` 改为 `await cesiumReady`，移除自身的 CDN 注入 |
| `cesium-navigation/` | 从 npm 包迁入，惰性 getter 已写入源码（Utils.js / DistanceLegendViewModel.js / ZoomNavigationControl.js） |
| `cesium-wind-layer/` | 从 npm 包迁入 + Win2d 三文件（Wind2D.js / useCesiumWind.js / windModule.js）归入 |
| `Win2d/` | **已删除**（并入 cesium-wind-layer） |
| `composables/core/cesium-navigation-theme.css` | **已删除**（合并到 cesium-navigation/styles/cesium-navigation.css） |
| `vite.config.js` | 移除 cesium-navigation-es6 / cesium-wind-layer 的 optimizeDeps + manualChunks 条目 |
| `package.json` | 移除 cesium-navigation-es6、cesium-wind-layer、knockout-es5、patch-package 依赖 + postinstall 脚本 |
| `patches/` | **整个目录删除** |

## 修改的文件路径

| 操作 | 文件 |
|---|---|
| 修改 | `frontend/src/cesium-shim.js` |
| 修改 | `frontend/src/components/Cesium/composables/core/cesiumRuntime.js` |
| 新增 | `frontend/src/components/Cesium/cesium-navigation/`（完整目录） |
| 新增 | `frontend/src/components/Cesium/cesium-wind-layer/`（完整目录） |
| 修改 | `frontend/src/components/Cesium/cesium-wind-layer/Wind2D.js` |
| 修改 | `frontend/src/components/Cesium/cesium-wind-layer/useCesiumWind.js` |
| 修改 | `frontend/src/components/Cesium/CesiumContainer.vue` |
| 修改 | `frontend/src/components/Cesium/composables/core/useCesiumNavigation.js` |
| 修改 | `frontend/src/components/Cesium/composables/index.js` |
| 修改 | `frontend/src/components/Cesium/composables/toolModules/useCesiumToolModules.js` |
| 删除 | `frontend/src/components/Cesium/Win2d/`（整个目录） |
| 删除 | `frontend/src/components/Cesium/composables/core/cesium-navigation-theme.css` |
| 增加 | `frontend/src/components/Cesium/cesium-navigation/styles/cesium-navigation.css`（含原主题CSS） |
| 修改 | `frontend/vite.config.js` |
| 修改 | `frontend/package.json` |
| 删除 | `frontend/patches/cesium-navigation-es6+3.0.9.patch` |
| 删除 | `frontend/patches/`（空目录） |
| 删除 | `frontend/src/vendor/cesium-navigation/`（中间迁移残留） |

## 测试方案

- `npm run build --mode development` 构建通过，零错误
- Cesium 页面按需懒加载行为不变（`ensureCesiumLoaded()` → `import('CesiumContainer.vue')`）
- 非 Cesium 页面首屏无 Cesium 加载
