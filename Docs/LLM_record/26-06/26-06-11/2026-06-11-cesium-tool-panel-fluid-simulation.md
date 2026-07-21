# 2026-06-11 Cesium 统一工具面板 + 水体流体模拟 + 后端 Auth 中间件重构

**日期**：2026-06-11 16:00

---

## 一、事件逻辑链条分析

### 核心症状
1. CesiumContainer.vue 承载了底图切换、地形切换、风场控制、高级特效等大量 UI 和逻辑代码，职责臃肿
2. 风场参数面板（滑块/按钮）直接硬编码在 CesiumContainer 模板中，无法复用
3. 后端 auth 模块中 `init_auth_storage()` 在每个路由和依赖函数中重复调用，架构散乱
4. 缺少水体流体模拟能力

### 根本原因
- CesiumContainer 作为容器组件，同时承担了场景初始化和 UI 控制双重职责
- auth 初始化逻辑没有统一收口，各路由自行保障可用性

### 受影响模块
- 前端：Cesium 3D 模块（CesiumContainer / CesiumAdvancedEffects / 新增 CesiumToolPanel / FluidSimulation）
- 后端：auth 中间件（app.py / dependencies.py / routes.py）

---

## 二、修改内容

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/.env.production` | 修改 | 新增 `VITE_CESIUM_ION_TOKEN`（Cesium 世界地形） |
| `frontend/src/components/Cesium/CesiumContainer.vue` | 重构 | 移除内联 UI，改为调度 CesiumToolPanel；新增底图/地形切换、Google 瓦片代理 |
| `frontend/src/components/Cesium/CesiumAdvancedEffects.vue` | 修改 | 新增 headless 模式 + `controls` prop 外部同步 |
| `frontend/src/components/Cesium/CesiumToolPanel.vue` | **新增** | 统一控制台（场景导航/特效/风场/流体参数） |
| `frontend/src/components/Cesium/FluidSimulation/FluidSimulationPanel.vue` | **新增** | 水体流体面板（高度图捕捉 + 参数调节） |
| `frontend/src/components/Cesium/FluidSimulation/fluidRuntime.js` | **新增** | WebGL 流体渲染引擎（1577 行，含 GLSL 着色器） |

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app.py` | 修改 | 中间件 `check_startup_state` 重构：allowlist 前置 + 正常路径幂等检查 |
| `backend/api/auth/dependencies.py` | 修改 | 移除 `require_login` 和 `require_api_access_or_guest` 中的 `init_auth_storage()` |
| `backend/api/auth/routes.py` | 修改 | 移除 7 个路由中的 `init_auth_storage()` + 删除 `/storage-path` 调试接口 |

---

## 三、优化解决方案

### 3.1 CesiumToolPanel 统一调度架构

**方案**：将 CesiumContainer 中的内联 UI（按钮组、风场滑块面板）抽取为独立的 `CesiumToolPanel.vue`，通过 `v-model` + `module-action` / `control-change` 事件与 CesiumContainer 通信。

**设计要点**：
- `CesiumToolPanel` 纯展示 + 事件派发，不含业务逻辑
- `CesiumContainer` 通过 `toolModules` computed 动态构建模块配置
- `CesiumAdvancedEffects` 和 `FluidSimulationPanel` 支持 `headless` 模式，仅提供逻辑能力

### 3.2 底图/地形动态切换

**方案**：`applyBasemap(value)` / `applyTerrain(value)` 函数统一管理图层生命周期。

**关键实现**：
- `imageryLayerHandles[]` 追踪所有添加的图层，切换时先 `clear` 再 `add`
- `terrainSwitchId` 递增计数器防止快速切换竞态（旧 async 结果不覆盖新结果）
- `createCesiumWorldTerrainProvider()` 兼容 4 种 Cesium API 形态（`createWorldTerrainAsync` / `createWorldTerrain` / `fromIonAssetId` / `IonResource`）

### 3.3 水体流体模拟

**方案**：`FluidSimulationPanel.vue`（Vue 交互层）+ `fluidRuntime.js`（WebGL 渲染引擎）分离。

**核心流程**：
1. 用户点击「捕捉高度图」→ 注册 `ScreenSpaceEventHandler`
2. 左键点击地形 → `pickCartesian` 获取世界坐标
3. 创建 `FluidRenderer` 实例（1024×1024 高度图 + GLSL 流体着色器）
4. 参数变化通过 `customParams` uniform 实时传入 shader

**场景快照/恢复**：`prepareScene()` 保存 viewer 原始状态 → 修改为适合流体渲染的配置 → `restoreScene()` 在清除时恢复

### 3.4 后端 Auth 中间件收敛

**问题**：`init_auth_storage()` 在 `dependencies.py`（2 处）和 `routes.py`（7 处）中重复调用。

**方案**：统一由 `app.py` 的 `check_startup_state` 中间件负责：
- 白名单路径（`/`、`/health`、`/docs` 等）直接放行
- 降级状态：尝试自动恢复
- 正常状态：幂等检查 `_auth_storage_ready`

**收益**：路由函数回归纯业务逻辑，不再关心数据库初始化状态。

---

## 四、性能指标

- CesiumContainer 模板行数从 ~90 行减少到 ~55 行（内联 UI 移除）
- CesiumContainer style 行数减少 ~100 行（风场/按钮样式移除）
- auth 初始化调用从 9 处收敛到 1 处中间件

---

## 五、测试方案

1. **底图切换**：天地图 ↔ Google，验证影像叠加和 WTFS 标注正确加载/清除
2. **地形切换**：天地图地形 / Cesium 世界地形 / 平面地形，快速切换验证无竞态
3. **高级特效**：通过 ToolPanel 开关 fog/hbao/tiltShift/atmosphere，验证 headless 同步
4. **风场**：加载/清除风场 + 滑块调参，验证 Wind2D 实时响应
5. **水体流体**：点击地形创建流体 → 调参 → 清除 → 验证场景状态恢复
6. **后端 auth**：正常请求返回 200；数据库损坏模拟 → 503 → 自动恢复 → 200

---

## 六、修改的文件路径

```
frontend/.env.production
frontend/src/components/Cesium/CesiumAdvancedEffects.vue
frontend/src/components/Cesium/CesiumContainer.vue
frontend/src/components/Cesium/CesiumToolPanel.vue
frontend/src/components/Cesium/FluidSimulation/FluidSimulationPanel.vue
frontend/src/components/Cesium/FluidSimulation/fluidRuntime.js
backend/app.py
backend/api/auth/dependencies.py
backend/api/auth/routes.py
```
