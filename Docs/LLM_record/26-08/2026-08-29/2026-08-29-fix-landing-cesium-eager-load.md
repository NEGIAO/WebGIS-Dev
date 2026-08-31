# 2026-08-29 首页/登录页 Cesium.js 抢跑加载修复

## 日期与时间

2026-08-29 14:53

## 任务等级

L2（Bug 修复，涉及 4 个文件协同改动）

## 问题分析

### 核心症状

用户访问首页/落地页（`https://webgis.negiao.cn/#/`，LandingView 路由）时，Network 面板观察到浏览器立即请求了约 6MB 的自托管 `cesium/Cesium.js`。预期行为是：进入 OL 2D 地图、`map-core-ready` 后延迟 6s 再后台预热 Cesium，首页/登录页绝不应发起 Cesium 请求。

### 根本原因

`frontend/src/cesium-shim.js` 在**模块顶层以 IIFE 立即注入** `<script src=".../Cesium.js">`（`injectCesiumCDN()` 自执行）。而 Rollup 的 chunk 归属不可控：

1. `cesium-shim.js` 静态 import `publicRuntime.ts`（取 `CESIUM_ASSET_BASE_URLS` 等常量）；`@cesium-extends/subscriber`（manualChunks 归入 `vendor-planar-route`）又 import `'cesium'`（即 shim），导致 shim 源码被打进 `vendor-planar-route` chunk；
2. 入口 chunk 的启动链（main.js → router/stores 等）静态 import `publicRuntime` 的配置绑定（后端地址、超时、OAuth client id），而 `publicRuntime` 与 shim 被分进同一 chunk；
3. 结果：入口 chunk 为拿配置静态加载 `vendor-planar-route` chunk → **chunk 求值即执行 shim 顶层副作用 → 页面打开第一毫秒就注入 Cesium.js 下载**。

`scheduleCesiumWarmup()` 的 10s 延迟（用户记忆中的 6s 为旧值）因此完全失效——预热只是动态 import shim 靠副作用触发下载，而副作用早已在首页执行过。

### 受影响模块

- 首屏加载性能（landing / register / 所有非 3D 页面首屏带宽被 6MB Cesium.js 挤占）
- Cesium 加载链路（cesium-shim / cesiumRuntime / cesiumWarmup）

## 修改内容

1. **`cesium-shim.js`**：删除模块顶层自执行 IIFE，将注入逻辑重构为显式导出的幂等函数 `ensureCesiumLoaded()`（`window.Cesium` 已存在直接 resolve；未启动过注入则 `attemptLoad(0)`；重复调用返回同一 `cesiumReady` Promise）。保留 `cesiumReady` 具名导出兼容。模块求值**零副作用**——无论 Rollup 把 shim 分进哪个 chunk，入口加载它都不会发起任何请求。
2. **`domains/cesium/composables/core/cesiumRuntime.js`**：`loadCesiumRuntime()` 内由 `await cesiumReady` 改为 `await ensureCesiumLoaded()`（切换 3D 时若 CDN 尚未加载，由此处显式触发注入并等待）。
3. **`domains/common/data-import/cesiumWarmup.js`**：预热 kick 由「动态 import shim 靠副作用」改为显式调用 `mod.ensureCesiumLoaded()`；延迟 `WARMUP_DELAY_MS` 10s → **6000ms**（对齐用户策略描述）。
4. **`cesium.d.ts`**：补充 `ensureCesiumLoaded(): Promise<void>` 类型声明。
5. **`HomeView.vue`**：同步预热注释（10s，注明显式调用）。

## 修改原因

首页要求快、只加载必须项；Cesium 包体约 6MB 且进入 2D 后不一定使用。原顶层副作用设计把「模块被求值」与「用户需要 3D」两个事件错误绑定，chunk 分配一旦变化（本次即因 publicRuntime 共生）就击穿全部延迟预热策略，且该失效对源码阅读完全不可见（shim 头注释还声称"首页完全不加载 Cesium"）。

## 影响范围

- 首屏加载链路：landing / register / oauth-callback / not-found 等非 3D 路由不再有 Cesium 请求
- 3D 切换链路：`CesiumContainer` boot → `loadCesiumRuntime()` 行为不变（就绪等待 + widgets.css 同源 + Ion token），新增"若预热已完成则命中 HTTP 缓存秒开"
- 预热链路：`HomeView.handleMapCoreReady()` → 6s + idle → 后台下载（saveData/2G 仍跳过）

## 解决方案

### 方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 配置模块拆分 | shim 不再 import publicRuntime | ❌ 治标：`@cesium-extends` 仍把 shim 与 vendor chunk 绑定，入口仍可能静态加载到 shim |
| B. manualChunks 强制隔离 | 把 publicRuntime/shim 指到独立 chunk | ❌ 脆弱：ES 静态导入跨 chunk 仍是急切求值，只要顶层副作用存在，任何传递链都会击穿 |
| **C. 副作用显式化（选定）** | 注入从「模块求值即执行」改为「显式调用 `ensureCesiumLoaded()`」 | ✅ 对 chunk 归属完全免疫，根除问题；改动面可控（`cesiumReady` 唯一消费方为 `loadCesiumRuntime`） |

### 实施后加载时序

```mermaid
flowchart TD
    subgraph 修复前
    A1[入口 chunk] -->|静态 import 拿 publicRuntime 配置| B1[vendor-planar-route chunk]
    B1 -->|内含 shim 代码| C1['IIFE 顶层立即注入 script']
    C1 --> D1['⬇ 首页打开瞬间请求 Cesium.js ~6MB']
    end
    subgraph 修复后
    A2[入口 chunk] -->|静态 import 拿 publicRuntime 配置| B2[vendor-planar-route chunk]
    B2 -->|内含 shim 代码| C2['仅定义 ensureCesiumLoaded()，零顶层调用']
    E2[HomeView map-core-ready] -->|6s + idle| F2['scheduleCesiumWarmup → ensureCesiumLoaded()']
    G2[切换 3D CesiumContainer boot] --> H2['loadCesiumRuntime → ensureCesiumLoaded()']
    F2 --> I2['此时才请求 Cesium.js（后台预热，命中缓存秒开）']
    H2 --> I2
    end
```

## 性能指标

未实测（Agent 无实机浏览器环境）。预期：首页/登录页减少一次性 ~6MB（gzip 后仍数 MB）脚本下载；静态分析对比见「测试方案」。

## 测试方案

### Agent 已执行

- `npm run build`（生产模式）构建通过（27.9s，无新增构建警告）
- **静态验证（决定性）**：
  - 旧产物 `vendor-planar-route-CcHu_Deu.js` 含顶层注入模式 `appendChild(r)}e(0)})();`（模块求值即调用）→ 新产物 `vendor-planar-route-DdPwQxAG.js` 中该模式为 **False**
  - 新产物注入调用已被封装：`function j(){return window.Cesium?Promise.resolve():(v||(v=!0,y(0)),N)}`（`y(0)` 即 `attemptLoad(0)`，仅在 `ensureCesiumLoaded` 内可达）
  - 入口 chunk `index-BcLXlTnr.js` 自身不含 `cesium-shim-autoload` 注入代码
- 源码层面确认 `cesiumReady` 唯一消费方为 `loadCesiumRuntime()`，`window.CESIUM_BASE_URL` 无 shim 外启动期消费方，无其他依赖"import 即注入"的路径

### 待用户实机验证

1. 打开 `https://webgis.negiao.cn/#/`（或 `npm run dev` 本地落地页），DevTools → Network 过滤 `Cesium`：**预期落地页/登录页零 Cesium.js 请求**
2. 登录进入 `/home` 2D 地图，等待约 6s（浏览器空闲时）：Console 出现 `[CesiumWarmup] Cesium 主脚本预热已触发`，Network 后台拉取 `cesium/Cesium.js`
3. 切换 3D 视图：3D 正常开机（若预热已下载完成应明显秒开）；Console 出现 `[Cesium][runtime] 就绪`
4. 回归：3D 工具面板、体积云/大气、漫游等既有功能不受影响

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/cesium-shim.js` | 顶层 IIFE 注入 → 显式幂等 `ensureCesiumLoaded()`，更新头注释 |
| `frontend/src/domains/cesium/composables/core/cesiumRuntime.js` | `loadCesiumRuntime` 改 await `ensureCesiumLoaded()` |
| `frontend/src/domains/common/data-import/cesiumWarmup.js` | 显式调用注入 + 延迟 10s→6s |
| `frontend/src/cesium.d.ts` | 补 `ensureCesiumLoaded` 类型声明 |
| `frontend/src/app/HomeView.vue` | 预热注释同步（10s→6s） |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本号 V3.5.36 三处 + 条目 |

## 遗留与风险

- **chunk 共生未根除**：shim 代码仍与入口共享 `vendor-planar-route` chunk（publicRuntime 共生所致），当前无害（零副作用），但未来若有人在启动链顶层调用 Cesium 相关 API 会再次击穿；已在本文件记录根因备查。
- `npm run build:webgis` 脚本使用 Unix 风格环境变量前缀，Windows PowerShell 本机不可直接运行（CI/Linux 正常），本次以 `npm run build` 验证——属既有问题，非本次引入。
- 若未来 `publicRuntime` 从 shim 的依赖中移除（如配置改为参数注入），chunk 会自然分离，可顺手消除共生（记入优化备选，非本次范围）。
