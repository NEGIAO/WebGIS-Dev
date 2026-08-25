# 2026-08-25 HomeView 远程服务可见性函数名不匹配启动报错修复

## 日期和时间

2026-08-25 11:05

## 修改内容

修复前端启动阻塞报错：`SyntaxError: The requested module '/src/domains/common/basemap/remoteServices.ts' does not provide an export named 'setRemoteServiceVisibility'`。

## 修改原因

* **核心症状**：应用启动即抛 SyntaxError，Vue Router 无法初始化，页面白屏。
* **根本原因**：命名不一致——`remoteServices.ts` 实际导出的函数名为 `setRemoteServiceVisible`，而 `HomeView.vue` 第 29 行 import 与第 1146 行调用写成了 `setRemoteServiceVisibility`。ESM 具名导入在编译期严格校验，缺失导出直接阻断模块图构建。
* **受影响模块**：仅 `app/HomeView.vue`（该函数唯一消费方）；模块本身及其余消费方不受影响。

## 影响范围

* `frontend/src/app/HomeView.vue`（import 语句 + handleToggleLayerVisibility 调用点，共 2 处）

## 优化解决方案

将 `HomeView.vue` 的导入与调用统一改为模块实际导出的 `setRemoteServiceVisible`（选择改消费方而非改模块，因该函数仅一处消费，改动面最小；且与同模块 `setRemoteServiceOpacity` 命名风格一致）。

## 性能指标

无性能影响，纯命名修正。

## 测试方案

1. `grep -rn setRemoteServiceVisibility src/` 确认无残留引用（已验证：0 条）。
2. `npx vue-tsc --noEmit` 通过，无 remoteServices/HomeView 相关类型错误（已验证 exit=0）。
3. 启动 dev server 确认路由正常初始化、TOC 中远程服务图层开关可用。

## 修改的文件路径

* d:\Dev\GitHub\WebGIS-Dev\frontend\src\app\HomeView.vue
