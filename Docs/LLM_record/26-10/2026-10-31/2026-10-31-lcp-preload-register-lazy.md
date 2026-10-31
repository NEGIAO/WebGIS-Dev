# 2026-10-31 首屏 LCP 预加载 + RegisterView 按需加载

## 日期与时间

2026-10-31 15:53

## 任务等级

L2

## 问题分析

### 核心症状

Chrome DevTools MCP（v1.12.0）对 `http://localhost:5173/` 做性能追踪，LCP 元素为落地页环纹背景图（`DIV.hero-bg__ring--outer`，图源 `public/images/njnu-media/d-bg2_1.webp`），LCP 中 **资源加载延迟占比 69.8%（481 ms）**；`LCPDiscovery` 两项检查失败：`fetchpriority=high` 缺失、资源在初始文档中不可发现。

### 根本原因

1. 环纹图由 `useRingPatternStyle.ts` 在运行时注入为文档级 CSS `background-image`，初始 HTML 中不存在该资源引用，浏览器只能等 JS 执行后才发起请求。
2. `src/router/index.js` 静态导入 `RegisterView.vue`（2600+ 行），把 `RegisterView` 及其 `api/backend`→`axios` 依赖链拉入首屏入口与关键请求链。
3. 环纹图为 PNG（125 KB），已由用户转为 WebP（108 KB / 90 KB 移动版），但代码引用需同步。

### 受影响模块

- 首屏资源发现链路（`index.html` → `useRingPatternStyle.ts`）
- 入口 chunk 与首屏关键路径（`router/index.js`）
- 构建产物分包（Vite 8 / rolldown 默认分组）

## 修改内容

1. `frontend/index.html`：新增两张 LCP 纹样图的 `preload`（按 `min-width: 768px` / `max-width: 767.98px` 断点二选一），带 `fetchpriority="high"`、`type="image/webp"`。
2. `frontend/src/router/index.js`：`RegisterView` 由静态导入改为 `const RegisterView = () => import('../app/RegisterView.vue')`。
3. `frontend/src/app/composables/useRingPatternStyle.ts`：图源引用由 `.png` 更新为 `.webp`（用户已完成文件转换，代码同步）。

## 修改原因

- 环纹图是当前 LCP 元素，但其资源在初始 HTML 不可发现，导致加载延迟成为 LCP 主因；预加载可让浏览器在解析 HTML 阶段即发起高优先级请求。
- `RegisterView` 仅 `/register` 路由使用，不应进入落地页首屏包；按需加载可显著减小入口体积并缩短关键链。
- PNG 已转 WebP，代码引用必须同步，否则线上 404。

## 影响范围

- 落地页（`/`）首屏资源加载与 LCP。
- `/register` 路由改为异步组件加载（首次进入该路由时多一次 chunk 请求）。
- 构建产物分包结构（入口 chunk 变小，新增 RegisterView 独立 chunk）。

## 解决方案

- **方案对比**：① 将环纹图改为静态 CSS 背景 —— 受 iOS mask 合成缺陷与部署 base 限制，现有运行时注入是既有结论，改动风险高；② 在 `index.html` 预加载 —— 改动最小、与现有注入逻辑兼容，选定此方案。
- **实施步骤**：先补 `preload` 与 WebP 引用，再将 `RegisterView` 改为动态导入，最后以生产构建 + `vite preview` 做前后对照。

## 性能指标

测试环境：Chrome DevTools MCP v1.12.0，headless Chrome，`--isolated`，本地 `vite preview`（生产构建）。

### 未节流（单次）

| 指标 | 优化前 | 优化后 |
|---|---|---|
| LCP | 255 ms | 247 ms |
| 资源加载延迟 | 95 ms | 5 ms |
| LCP 图请求发起 | 99 ms | 8 ms |
| 请求优先级 | Low | High |
| 入口 JS | 187.8 kB / 61.3 kB gzip | 98.7 kB / 34.0 kB gzip |

### Slow 4G + CPU 4×（单次）

| 指标 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| LCP | 3471 ms | 2793 ms | -678 ms（-19.5%） |
| 资源加载延迟 | 2728 ms | 594 ms | -2134 ms（-78.2%） |
| LCP 图请求发起 | 2731 ms | 598 ms | 提前 2133 ms |
| 资源下载时长 | 592 ms | 587 ms | 基本不变 |
| 渲染延迟 | 148 ms | 1608 ms | +1460 ms |
| 入口 JS | 187.8 kB / 61.3 kB gzip | 98.7 kB / 34.0 kB gzip | gzip -44.5% |

> 说明：预加载把网络发现阶段从 2731 ms 提前到 598 ms，LCP 总时长下降 678 ms；优化后剩余瓶颈转为渲染延迟（主线程 JS 执行，含 GTM 184.6 kB / 65 ms），为下一阶段优化目标。

## 测试方案

### Agent 已执行

- `node node_modules/vite/bin/vite.js build --outDir dist-perf`（生产构建，4388 modules，31.4 s）。
- `node node_modules/vite/bin/vite.js preview --outDir dist-perf --port 4173` 与 `--outDir dist-perf-before --port 4174`。
- Chrome DevTools MCP 生产口径追踪：未节流 + `emulate`（Slow 4G / CPU 4×）各一轮前后对照，采集 LCP、LCPBreakdown、LCPDiscovery、NetworkDependencyTree、ThirdParties。
- 产物校验：`dist-perf/index.html` 含两张 `preload`；入口 chunk 98.7 kB（gzip 34.0 kB）。

### 待用户实机验证

- 部署到 GitHub Pages 后，用 Chrome DevTools Performance 面板复测 `https://webgis.negiao.cn/` 的 LCP，确认预加载命中（Network 面板中 `d-bg2_1.webp` 优先级为 High、发起时间提前）。
- 进入 `/register` 路由，确认异步 chunk 正常加载、无白屏。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/index.html` | 新增 LCP 纹样图 `preload`（桌面/移动断点 + `fetchpriority=high`） |
| `frontend/src/router/index.js` | `RegisterView` 改动态导入 |
| `frontend/src/app/composables/useRingPatternStyle.ts` | 图源 `.png` → `.webp` |

## 遗留与风险

- 优化后渲染延迟升至 1608 ms（Slow 4G + CPU 4×），主线程 JS 成为新瓶颈；GTM（184.6 kB / 65 ms）与 Google 系脚本对国内用户仍有可用性风险，建议后续评估移除或延迟加载。
- 本地单次测量存在噪声，LCP 绝对值仅供趋势参考；生产真实用户数据需部署后以 CrUX / RUM 观察。
- 构建因 WorkBuddy 安全删除护栏无法清空既有 `dist`，本次使用独立 `dist-perf` / `dist-perf-before` 输出目录，未改动 `dist`。

---

## 补充修订（2026-10-31 二次复测）

> 首次日志（上方）遗漏了同批次落地的另外四项改动，且用户要求「再次测试并优化」，故补充记录。

### 遗漏的修改内容

4. `frontend/index.html`：**移除失效的 `icon.webp` `preload`**。该 preload 因 `credentials` mode 与 favicon 实际请求不匹配，反而产生一次冗余请求并触发控制台告警；移除后 `icon.webp` 由 3 次请求降为同源 HTTP 缓存共享（favicon / LandingView logo / TopBar / RegisterView 共用同一资源）。
5. `frontend/index.html`：**移除落地页无条件加载的 Google GSI 静态 `<script>`**（`accounts.google.com/gsi/client`）。原写法会让落地页 / 地图页等无关页面也去连第三方源（国内不可达，白占连接槽并拖 `load`）；改由 `RegisterView.vue` 的 `ensureGsiScript()` 在登录 / 注册页按需注入（组件内已具备 `GSI_SCRIPT_SRC` + 防重复注入逻辑）。`vite.config.js` 的 `googleGsiPlugin` 仍按 `VITE_GOOGLE_OAUTH_CLIENT_ID` 决定是否保留 `gsi:start/gsi:end` 区块，二者不冲突。
6. `frontend/src/app/LandingView.vue`：落地页英雄图（feature 卡片 `preview.webp`）**去除 `loading="lazy"` + 加 `fetchpriority="high"` + 补 `width="1996" height="769"`**，消除懒加载缺宽高告警并提前首屏可见时间。
7. `frontend/src/app/LandingView.vue`：starChart 远程图补 `width="800" height="450"` + `decoding="async"`，消除下方卡片懒加载缺宽高告警。

### 二次复测验证（Chrome DevTools MCP 对 `http://localhost:5173` 冷加载）

- 落地页 `accounts.google.com/gsi/client` 请求数 `1 → 0`（`hasGsiScriptTag=false`），首屏 `resourceCount 107 → 80`。
- 英雄图 `preview.webp` 请求发起由「排在全部 JS 模块之后」提前至 `≈390 ms`（eager + `fetchpriority=high`）。
- 控制台 `Lazy-loaded images should have explicit dimensions` issue `2 → 1`：已为 starChart 补宽高；剩余 1 项为 Chrome 对 `width:100%;height:auto` 响应式懒加载图的已知误报（属性已显式存在，浏览器按 800×450 推导 `aspect-ratio` 预留空间，无 CLS）。
- LCP / FCP 在 dev（非打包）模式下未被探针捕获，不具生产代表性；生产口径 LCP 见上方构建实测。

### 变更文件清单（补充）

| 文件 | 说明 |
|---|---|
| `frontend/index.html` | 移除失效 `icon.webp` preload；移除落地页 GSI 静态脚本（改按需） |
| `frontend/src/app/LandingView.vue` | 英雄图去 lazy + 高优先级 + 宽高；starChart 补宽高 |

### 遗留与风险（补充）

- 落地页 `js.users.51.la/22001747.js`（国际版 51.la 脚本）稳定返回 403、偶发 503，属外部统计依赖问题，非本次改动引入，建议后续评估是否移除国际版脚本或统一改用国内版。
- starChart 的 DevTools 懒加载缺宽高告警为 Chrome 误报（属性已显式存在），无需进一步改动。
