# 2026-11-16 暂存区 Code Review 与版本整合（V3.7.3）

- **日期与时间**：2026-11-16 16:00
- **任务等级**：L2
- **依据**：`Docs/Force_command.md` §0（用户当前指令优先：零 Git 写、不 add）、§1–§8

## 问题分析（阶段一）

### 核心症状
暂存区累积 14 个文件（616 insertions / 34 deletions），来自多次独立任务：① Font Awesome 样式裁剪与字体 CDN 取舍；② SEO 收录修复（sitemap/robots/404/首屏静态兜底/OG 标签）；③ 预览图响应式；④ Dependabot 依赖 patch 升级（`backend/uv.lock`）。缺统一版本号与整合日志。

### 根本原因
多次 L2 任务各自的暂存改动未做集中 review 与版本归并；其中字体方案经历「子集自托管 → 实测 CDN 更快 → 撤回」的往返，撤回时未同步清理生成脚本的文档与校验逻辑，留下自相矛盾。

### 受影响模块
- 前端入口 `frontend/index.html`（SEO + FA @font-face + 首屏兜底）
- 前端资源 `src/assets/fontawesome-subset.css`、`public/{robots.txt,sitemap.xml,404.html,images/preview-*.webp}`
- 落地页 `src/app/LandingView.{ts,vue}`、`src/App.vue`
- 工具脚本 `frontend/scripts/subset-fontawesome.py`（含 npm script）
- 后端依赖锁 `backend/uv.lock`（Dependabot patch）
- 文档：README / CHANGELOG / frontend-structure.md

## Code Review 发现（6 项，4 个真 bug）

| # | 严重度 | 位置 | 问题 | 处置 |
|---|---|---|---|---|
| 1 | 中 | `subset-fontawesome.py` main() | `--check` 默认模式（不传 `--fonts`）把 `size=0` 的字体条目判为 MISSING → 退出码 1，实测误报失败 | 修：非 `--fonts` 模式下跳过字体产物校验 |
| 2 | 低 | 同上 docstring | 声称「index.html 的 @font-face 指向子集文件」，但字体已撤回 CDN，@font-face 指向 BootCDN | 修：改为描述 CDN 方案 |
| 3 | 低 | `index.html` | `<title>` 为「... - 地理信息可视化平台」，而 og:title / twitter:title / 首屏 h1 为「... - 三维地理信息可视化平台」，三处不一致 | 修：统一为「三维地理信息可视化平台」 |
| 4 | 低 | `fontawesome-subset.css` + 脚本模板 | 注释「全项目唯一修饰类 fa-spin」与脚本 MODIFIERS 集合（列出 30+ 修饰类）自相矛盾 | 修：措辞改为「实际使用的唯一修饰类」 |
| 5 | 提示 | `public/404.html` | `path.replace(/^\/+/, '/')` 为恒等变换（冗余），逻辑无害 | 保留，不扩大范围 |
| 6 | 提示 | `backend/uv.lock` | fastapi 0.162.4→.5、python-multipart 0.0.32→.33，均在 pyproject 约束内且来自 Dependabot 自动合并 | 合法，纳入版本说明 |

### 依赖与架构审查
- 图标码点全量校验：51 条 CSS 规则的 `content` 与 FA 6.4.0 官方 CSS **零 mismatch、零 absent**（含 `fa-display: e163`）。
- `@font-face` 覆盖块：6 条（FA6 三档 + FA5 兼容三档），与 index.html 内联一致；字体走 BootCDN，`crossorigin` 正确。
- 404 页 hash 跳转：`/#/terms` 等路径与 `createWebHashHistory()` 路由表一致。
- 图片响应式：`540w/800w` 两档，旧 1996×1156 原图不再引用（保留文件未删，遵守 §2.4）。

## 修改内容（阶段三）

1. 修复上述 #1–#4 四个 bug/矛盾。
2. 版本号统一为 V3.7.3：README 三处 + CHANGELOG 顶部条目。
3. 结构树：新增文件已在暂存区登记（`fontawesome-subset.css`），复核无漂移。
4. 本日志作为本次改动的完整记录。

## 修改原因
暂存区多次不规范改动需整合为单一可提交单元；review 发现的自动化校验误报会阻塞后续 CI 使用，必须修复。

## 影响范围
前端入口 SEO/性能、图标样式工具链、文档与版本号；后端仅依赖锁文件 patch 升级（无代码逻辑变更）。

## 解决方案
- 最小侵入修复：`--check` 逻辑按模式分支；文案统一；脚本 docstring/CSS 模板措辞校正。
- 版本按用户明确指令启用 V3.7.3（CHANGELOG 曾将 V3.7.3–V3.7.7 作为废弃中间号归并至 V3.7.1，本条按当前指令重新启用该号段，不代表回滚历史归并结论）。

## 性能指标
| 项 | 优化前 | 优化后 |
|---|---|---|
| FA CSS | 102KB（官方 all.min.css） | 3.6KB（在用 51 图标） |
| FA 字体 | 283KB 官方 woff2（CDN） | 保持 CDN（自托管子集 6.6KB 实测更慢已撤回） |
| 预览图 | 95KB / 1996×1156 | 24KB（540w）/ 45KB（800w） |
| CDN 请求数（字体+CSS） | CSS+3 字体 | 0 CSS + 2 字体（preload + 按需） |

## 测试方案

### Agent 已执行
- `tsc --noEmit`：0 error
- `eslint src --ext .ts --ext .js --ext .vue`：0 problem
- `npm run build`：通过（dist 含 robots.txt / sitemap.xml / 404.html / preview-540/800.webp）
- `python scripts/subset-fontawesome.py --check`：修复后 0 退出码
- `python Scripts/CheckStructureTree.py`：736/736
- `python Scripts/CheckConfigRegistry.py`：通过
- 浏览器实测：CDN 字体请求正常、图标渲染正常、无豆腐块、响应式图按 DPR 选档

### 待用户实机验证
- GSC 提交 `https://webgis.negiao.cn/sitemap.xml`，确认「No referring sitemaps」消除
- Cloudflare 关闭 Rocket Loader / Managed robots.txt（代理层否则覆盖源站 robots）
- 确认 Google 重新抓取后 User-declared canonical 归一到 www.negiao.cn（个人主页项目）

## 变更文件清单
- `frontend/index.html`：SEO 元信息 + FA @font-face 覆盖 + 首屏静态兜底 + title 统一
- `frontend/package.json`：新增 `fonts:subset` script
- `frontend/src/App.vue`：引入最小 FA CSS
- `frontend/src/assets/fontawesome-subset.css`（新增）：51 图标最小规则集
- `frontend/scripts/subset-fontawesome.py`（新增）：图标 CSS 生成器 + `--check` 修复
- `frontend/src/app/LandingView.ts` / `.vue`：预览图响应式 srcset
- `frontend/public/{robots.txt,sitemap.xml,404.html,images/preview-540.webp,images/preview-800.webp}`（新增）
- `backend/uv.lock`：Dependabot patch 升级
- `README.md` / `Docs/Guide/CHANGELOG.md` / `Docs/Guide/frontend-structure.md`：版本与树
- 本日志

## 遗留与风险
- **Git 状态观察（如实记录，不臆断来源）**：本会话全程仅执行只读 git 命令（`status` / `diff --cached` / `log`）与文件编辑，未执行任何 git 写操作、未 `git add`。但 review 过程中观察到暂存区从 14 项增至 17 项（新增 `.gitignore` 的 `.fa-cache/` 条目、本日志、README 等），且本次 bug 修复也被同步进暂存区——推断为并行会话或 IDE 的外部操作。Agent 不擅自改动这一状态，交由用户裁量。
- 字体文件保留 BootCDN 依赖（国内加速优先）；若 CDN 故障图标将回退系统字体，可接受。
- 未对 `/WebGIS/` 子路径部署做 404 跳转回归（正式域名为根路径）。
- 未执行任何 Git 写操作（用户明确要求）；所有改动在工作区，需用户自行 add/commit。

---

## 补充任务（2026-11-16 22:40）：接入 51.la 应用性能监控（LingQue.Monitor）

### 问题分析
- **核心症状**：站点仅有 51.la 流量统计（`js-sdk-pro.min.js`，id=`3OVJu4iCpXi3wE8k`），缺应用级异常 / 性能 / 外链监控，无法定位前端报错与卡顿。
- **根本原因**：V3.7.1 网络瘦身下线了海外统计（GA / MapMyVisitors），但国内 51.la 的性能监控产品（`js-sdk-perf.min.js` / `LingQue.Monitor`）未纳入。
- **受影响模块**：`frontend/public/min-enhanced.js`（唯一外部统计脚本入口，被 `index.html` 以 `defer` 加载）。
- **候选方案对比**：
  1. 在 `index.html` 直接插 `<script src>` + 内联 `new LingQue.Monitor().init(...)`（用户提供的形式）——同步阻塞、拆解脚本单一职责，弃用。
  2. 在 `min-enhanced.js` 中动态创建 script 并 `onload` 初始化——与现有流量统计写法一致、保持 defer 非阻塞、单一入口，**选用**。
- **关键决策**：站点使用 `createWebHashHistory()`，而 `sendSpaPv` 默认为 `false`；若沿用默认，hash 路由跳转 PV 会全部丢失，与"应用监控"目的相悖 → 显式设 `sendSpaPv: true`。`sendSuspicious: true` 按用户提供值启用（可疑脚本 / iframe 上报）。其余参数保持官方默认值，不臆造。
- **verify**：SDK `https://sdk.51.la/perf/js-sdk-perf.min.js` 实测 HTTP 200 / 34409B / `application/javascript`。

### 修改内容
- `frontend/public/min-enhanced.js`：新增 IIFE `loadLingQuePerfMonitor()`，动态加载 perf SDK（`crossOrigin='anonymous'`、`async=true`），`onload` 内 `new LingQue.Monitor().init({ id: '3RqgbbZKGnrTOJ2i', sendSuspicious: true, sendSpaPv: true })`；带 `LingQue` 存在性守卫与 try/catch，加载失败不影响页面。

### 影响范围
前端统计链路（新增一个非阻塞请求），无业务代码、无配置 key、无场景数据变更。

### 测试方案
**Agent 已执行**：`node --check min-enhanced.js` 语法通过；`npm run build` 通过；SDK URL 可达性验证；代码 review 确认 defer 链路与幂等守卫。
**实测结果（浏览器 preview）**：`window.LingQue` 为 object、`LingQue.Monitor` 存在、`LINGQUE_PERF_SDK` 已注入；console 出现「51.la 应用监控已初始化」；网络面板两个 SDK 均 200（`js-sdk-pro` / `js-sdk-perf`），数据上报请求 `collect-v6.51.la/v6/collect` 已发出。`collect-perf.51.la/health/collect` 在 preview 下 `ERR_CONNECTION_RESET`，系 SDK 内部健康上报走 http 被本地环境重置，不影响初始化与业务上报。
**待用户实机验证**：部署后 51.la 后台确认应用 ID `3RqgbbZKGnrTOJ2i` 收到 PV / 性能 / 异常数据；hash 路由（如 `#/home`）切换产生独立 PV 上报。

---

## 补充任务（2026-11-16 23:11）：添加 51.la 统计报表公开链接

### 问题分析
- **核心症状**：站点已接入 51.la 流量统计与应用监控，但用户/访客无入口查看完整统计报表（`https://v6.51.la/s/mgk5Bj40SftrO77`，已授权只读分享页）。
- **根本原因**：README 只有动态指标徽章、landing footer 只有三个外链圆钮、用户中心「全站实时」只有数字——三处都展示数据但无「查看完整报表」的跳转。
- **受影响模块**：`README.md`、`frontend/src/app/LandingView.{ts,vue}` + 双语文案、`frontend/src/domains/common/user/components/tabs/OverviewTab.vue` + 双语文案。
- **候选方案**：
  1. 只放 README（成本低但普通访客看不到）；
  2. README + landing footer + 用户中心总览三处齐备（覆盖开发者、普通访客、登录用户三类受众）——**选用**。
- **落点选择依据**：
  - README：51.la 徽章表格下的「数据统计时间」行后，语义相邻；
  - Landing：`footer-quick` 三个圆钮（GitHub / 个人主页 / 官网）后加第 4 枚，与「footer-visitor 数据条」呼应，用 Lucide 图标（遵守 §2 UI 图标规范，禁 emoji）；
  - 用户中心：`OverviewTab` 的 `realtime-third`（第三方口径 51.la 数据行）末尾，与数据来源直接关联。
- **verify**：链接实测 HTTP 200（页面 6136B），确认公开可读；用户明确「无修改权限」→ 仅作外链展示，不做任何接口写入。

### 修改内容
- README：统计徽章区追加「完整报表」链接（Markdown 行内）。
- `LandingView.ts`：新增 `statsReportUrl` 常量；`LandingView.vue`：footer-quick 第 4 枚圆钮（Lucide `ChartNoAxesCombined` 图标 + tooltip + aria-label）。
- `locales/{core/zh-CN,core/en-US}.ts`：新增 `landing.statsReport` 文案。
- `OverviewTab.vue`：`realtime-third` 行末尾加「查看完整报表」外链；`locales/{zh-CN,en-US}/account.ts`：新增 `overview.statsReport` 文案。

### 影响范围
静态外链 + i18n 文案，无业务逻辑、无配置 key、无场景数据；外链统一 `target="_blank" rel="noopener noreferrer"`。

### 测试方案
**Agent 已执行**：链接可达性（HTTP 200）；`tsc` / `eslint` / `build` / 结构树 / 配置登记；浏览器实测三处链接指向正确。
**实测中修复的 2 个自查缺陷**：① 首次编辑因 shell heredoc 中文 GBK 编码问题，`statsReportUrl` 与四个 locale 文案的替换静默失败（浏览器测出 `aria-label` 显示原始 key、`<a>` 无 href）→ 改用脚本文件写入并逐个 grep 验证；② 新增 Lucide 图标未注册进 `components:` → 改为复用已注册的 `ChartArea`。
**实测结果（浏览器 preview）**：landing footer 第 4 枚圆钮 `href=https://v6.51.la/s/mgk5Bj40SftrO77`、中文 aria-label/tooltip「查看完整统计报表」、`target=_blank` + `rel=noopener noreferrer`、Lucide SVG 已渲染；点击实测新标签正常打开 51.la 报表页。
**待用户实机验证**：三处点击均能在新标签打开报表且只读可见。
