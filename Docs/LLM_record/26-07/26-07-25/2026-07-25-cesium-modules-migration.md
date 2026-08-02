# Cesium 依赖模块源码内嵌迁移

**日期与时间：** 2026-07-25 17:30
**版本：** V3.4.2（版本号不变，归入同日批次）
**任务等级：** L2（涉及新增/删除文件与重构，属常规任务，走全流程）

---

## 问题分析

- **核心症状**：生产构建（`npm run build`）后，Cesium 页面偶发初始化失败——模块顶层执行 `new CesiumClass()` 时 Cesium CDN 尚未就位，`Cesium` 为 `undefined`，控件抛错。
- **根本原因**：cesium-navigation-es6 / cesium-wind-layer 两个 npm 包在模块顶层（import 即执行）直接实例化 Cesium 类；项目采用 CDN 按需注入 Cesium（`cesium-shim.js` 顶层注入），两者加载时序不可控。原通过 patch-package 把顶层实例化改为惰性 getter，但补丁是黑盒，`npm install` 后需重新应用且不透明。
- **受影响模块**：`cesium-shim.js`（CDN 注入）、`cesiumRuntime.js`（运行时加载）、`cesium-navigation/`、`cesium-wind-layer/`、`vite.config.js`（optimizeDeps / manualChunks）、`package.json`（依赖与 postinstall）、`patches/` 目录。

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

## 解决方案

| 候选方案 | 优点 | 缺点 | 是否选定 |
|---|---|---|:---:|
| A. 保留 patch-package 补丁 | 不改源码组织，改动最小 | 补丁为黑盒，`npm install` 后需重新应用；不透明、排查困难；依赖 postinstall 脚本 | ✗ |
| B. 源码内嵌 + 直接写惰性 getter | 源码可读可改，无构建期补丁；getter 直接写入源码消除竞态；模块组织统一于 `components/Cesium/` | 需手动维护迁移源码；升级 cesium-navigation/wind-layer 版本时需手动同步 getter | ✅ |

**选定理由**：方案 B 将黑盒补丁转为可读源码，从根本上消除模块顶层实例化竞态，且无需 patch-package / postinstall 链路，长期维护成本更低。

**实施步骤**：① 将两个 npm 包源码迁入 `src/components/Cesium/` 对应子目录；② 在 Utils.js / DistanceLegendViewModel.js / ZoomNavigationControl.js 等文件将顶层 `new CesiumClass()` 改为惰性 getter；③ `cesium-shim.js` 顶层注入 CDN 并暴露 `cesiumReady`，`cesiumRuntime.js` 内 `await cesiumReady`；④ 清理 `patches/`、`package.json` 依赖与 postinstall、`vite.config.js` optimizeDeps 条目。

## 性能指标

非性能相关任务，未实测。

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

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npm run build --mode development` 构建通过，零错误 | 打开 Cesium 页面，确认导航控件、风场图层正常渲染，控制台无 `Cesium is undefined` 报错 |
| | 确认 Cesium 页面按需懒加载行为不变：`ensureCesiumLoaded()` → `import('CesiumContainer.vue')` |
| | 确认非 Cesium 页面首屏无 Cesium 加载（Network 面板无 cesium 相关请求） |

## 遗留与风险

1. **cesium-shim 顶层 CDN 注入是新模式**：CDN 在模块顶层（import 即触发）注入并暴露 `cesiumReady` Promise，与原有"运行时函数内注入"不同，需观察后续是否有非 Cesium 页面意外触发该模块加载（当前已通过按需懒加载隔离）。
2. **惰性 getter 需手动维护**：迁入的 cesium-navigation / cesium-wind-layer 源码已脱离 npm 包，后续升级这两个库版本时需手动比对差异并同步 getter 改造，无法自动跟随 upstream。
3. **patches/ 目录与 patch-package 已移除**：postinstall 脚本一并删除，若未来其他依赖仍需补丁须另寻方案。
