# 前端全量 P0 严重问题修复

- **日期与时间**：2026-08-01 15:30
- **任务等级**：L2
- **版本**：V3.5.4

---

## 问题分析

### 核心症状
前端代码全量审查发现 26 项 P0 级严重问题，分布在 API 层、Cesium 核心/terrain/模块、Common 层、OL 层、PlayerController 共 7 个模块组。

### 根本原因
- 早期快速迭代阶段未统一 API 客户端（部分用 fetch 绕过拦截器）
- 事件监听器/定时器/WebGL 资源生命周期管理不规范
- 渲染模式引用计数依赖实例存在性判断，存在失衡风险
- 用户输入在 DOM 插入前未做 XSS 转义
- 调试代码（console.warn / 测试工具）未做生产环境保护

### 受影响模块
API 层、Cesium 核心 composables、terrain providers、Cesium 模块（流体/浅水/玩家控制器/动画/物理）、Common 层（Chat/OAuth）、OL 图层、PlayerController

---

## 修改内容

### API 层（C-1/C-2/C-3）
1. `searchWithTianditu` 改用统一 `backendAPI.get()` axios 客户端，享受拦截器链路
2. `client.js` 模块级 `useMessage()` 改为懒加载 `getMessage()`，避免 SSR/非组件上下文报错
3. 移除 `isQuotaExceeded` 的双重 toast（拦截器已提示）

### Cesium 核心 composables（C-4/C-5/C-6）
4. `useCesiumModelManager` 添加 readyEvent/errorEvent 的 disposer 清理
5. `useCesiumCreditHider` 以 MutationObserver 替代 setInterval(500ms)，移除 `[class*="credit"]` CSS 规则
6. `useCesiumLayers` 移除静默地形覆盖，改为 warning 提示

### Cesium terrain providers（C-7/C-8/C-9/C-10）
7. `GeoWTFS` 解析边界 XSS sanitize（poi.Name 去特殊字符 + 截断 120 字符）
8. `GeoWTFS.destroy()` 移除多余 `i--` 防止实体跳过
9. `GeoWTFS` 添加 `_activeXhr` 注册表 + 15s 超时 + `_destroyed` 标志 + 销毁时 abort
10. `ArcGISTerrainProvider`/`GeoTerrainProvider` 导出 `destroySharedLercPool()`，CesiumContainer onUnmounted 调用

### Cesium 模块（C-11~C-19）
11. `CesiumContainer.vue` bootCesium 移除重复行（bootSucceeded/emit/hideLoading 等）
12. `fluidRuntime.destroy()` 添加 `heightMapCamera = null` + `outputTexture.destroy()`
13. `playerController.destroy()` 添加 `removeDebugPrimitives()`
14. `useShallowWater.dispose()` 添加 texture/material 释放
15. `usePlayerController` 添加 `onScopeDispose` 清理 navTarget + stopPlayer
16. `AnimationSystem.reset()` 添加 `_animRemovedHandler` 移除
17. `PhysicsSystem` world.free() 后 null 所有 handle + `_assertWorld()` 守卫
18. `FluidSimulationPanel` catch 块添加 `restoreScene()` 回滚
19. `useShallowWater.animate()` try/catch → pause() + onError()

### Common 层（C-20/C-21/C-22）
20. `chatIntentFallback.getToolDisplayName` 添加 `escapeHtml` 转义用户输入
21. `useChatSession` 添加 `onScopeDispose` 清理 persistTimer
22. `OAuthCallbackView` 硬编码中文改为 `t('oauth.*')` i18n 键

### OL 层（C-23/C-24）
23. `useMapSwipeTest` 添加 `import.meta.env.DEV` 守卫，生产环境返回空操作
24. `useMapSwipe` 全部 14 处 console.warn 包裹 `import.meta.env.DEV` 守卫

### PlayerController（C-25/C-26）
25. `startNavPick` 添加幂等保护（重复调用先清理上一点选 handler）+ 30 秒超时自动退出 + `cleanupNavPick()` 方法
26. 渲染模式计数改用 `_renderModeAcquired` 布尔标记与 release 严格配对，避免依赖 playerInstance 存在性判断

---

## 修改原因
- 安全性：XSS 漏洞可被利用注入恶意脚本
- 稳定性：事件监听器/定时器泄漏导致内存增长、状态异常
- 性能：GPU 资源未释放导致显存泄漏；setInterval 持续占用主线程
- 可维护性：调试代码污染生产日志；渲染计数失衡导致画面不刷新
- 国际化：硬编码中文阻碍多语言支持

---

## 影响范围
- API 层：locationSearch.js、backend/client.js
- Cesium 核心：useCesiumModelManager、useCesiumCreditHider、useCesiumLayers
- Terrain：GeoWTFS、ArcGISTerrainProvider、GeoTerrainProvider
- Cesium 模块：CesiumContainer、fluidRuntime、playerController、useShallowWater、usePlayerController、AnimationSystem、PhysicsSystem、FluidSimulationPanel
- Common：chatIntentFallback、useChatSession、OAuthCallbackView、locales/core.js
- OL：useMapSwipe、useMapSwipeTest

---

## 方案
采用「最小改动 + 防御性封装」策略：
- 资源清理统一走 disposer 模式（onScopeDispose / destroy）
- 调试代码统一用 `import.meta.env.DEV` 守卫
- 渲染计数用专用布尔标记替代实例存在性判断
- XSS 转义在数据入口（parse 边界 / DOM 插值）一次性处理

---

## 性能指标
未实测（本次为安全性/稳定性修复，无性能指标变化）

---

## 测试方案

### Agent 已执行
- 门禁脚本：`CheckStructureTree.py` 通过（415 文件 0 漂移）
- 门禁脚本：`CheckConfigRegistry.py` 通过（配置登记全部合规）
- 文件状态：所有修改已写入磁盘

### 待用户实机验证
1. OAuth 回调流程（Google/GitHub 登录）：验证 i18n 文案正确显示
2. Chat 工具调用显示：输入含 `<script>` 等特殊字符，验证不执行脚本
3. 地图卷帘功能：验证无 console.warn 输出（生产模式）
4. 人物漫游：启动 → 停止 → 再次启动，验证渲染模式切换正常
5. 导航点选：连续快速点击「选择目标」按钮，验证不堆叠 handler
6. 地形预览（GeoWTFS）：验证特殊字符 POI 名称不破坏 DOM

---

## 变更文件清单

| 文件路径 | 说明 |
|---|---|
| `frontend/src/api/locationSearch.js` | C-1: 改用统一 axios 客户端 |
| `frontend/src/api/backend/client.js` | C-2: 懒加载 useMessage |
| `frontend/src/api/locationSearch.js` | C-3: 移除双重 toast |
| `frontend/src/domains/cesium/composables/models/useCesiumModelManager.js` | C-4: 事件 disposer |
| `frontend/src/domains/cesium/composables/scene/useCesiumCreditHider.js` | C-5: MutationObserver 替代 setInterval |
| `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js` | C-6: 移除静默地形覆盖 |
| `frontend/src/domains/cesium/providers/terrain/GeoWTFS.js` | C-7/C-8/C-9: XHS sanitize + 实体跳过修复 + XHR 生命周期 |
| `frontend/src/domains/cesium/providers/terrain/ArcGISTerrainProvider.js` | C-10: 导出 destroySharedLercPool |
| `frontend/src/domains/cesium/providers/terrain/GeoTerrainProvider.js` | C-10: 导出 destroySharedLercPool |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | C-10/C-11: Worker 池清理 + 重复行移除 |
| `frontend/src/domains/cesium/modules/fluid-simulation/fluidRuntime.js` | C-12: GPU 资源释放 |
| `frontend/src/domains/cesium/modules/player-controller/playerController.ts` | C-13: debug primitive 清理 |
| `frontend/src/domains/cesium/modules/shallow-water/composables/useShallowWater.js` | C-14/C-19: 纹理释放 + try/catch |
| `frontend/src/domains/cesium/modules/player-controller/usePlayerController.js` | C-15/C-25/C-26: 作用域清理 + 点选幂等 + 渲染计数配对 |
| `frontend/src/domains/cesium/modules/player-controller/systems/AnimationSystem.ts` | C-16: 动画事件清理 |
| `frontend/src/domains/cesium/modules/player-controller/systems/PhysicsSystem.ts` | C-17: 物理世界释放 |
| `frontend/src/domains/cesium/modules/fluid-simulation/FluidSimulationPanel.vue` | C-18: 渲染失败回滚 |
| `frontend/src/domains/common/chat/composables/chatIntentFallback.js` | C-20: XSS 转义 |
| `frontend/src/domains/common/chat/composables/useChatSession.js` | C-21: 定时器清理 |
| `frontend/src/app/OAuthCallbackView.vue` | C-22: i18n 接入 |
| `frontend/src/locales/core.js` | C-22: 添加 oauth 键 |
| `frontend/src/domains/ol/composables/useMapSwipe.ts` | C-24: DEV 守卫 |
| `frontend/src/domains/ol/composables/useMapSwipeTest.ts` | C-23: DEV 守卫 |

---

## 遗留与风险
- C-10 Worker 池清理依赖动态 import + `.then()` 模式，若 import 失败会静默忽略（可接受，因 onUnmounted 不应抛异常）
- C-25 点选超时 30 秒为经验值，实际场景可能需要调整

---

## 下一步建议
1. 实机验证通过后提交代码（`git add -A` + `git commit`）
2. 后续可考虑将 Chat 的 escapeHtml 提取为公共 utils，统一 XSS 防护入口
3. PlayerController 的 `_renderModeAcquired` 模式可推广到其他渲染计数场景
