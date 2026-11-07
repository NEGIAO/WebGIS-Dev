# Font Awesome 回退 CDN（撤销 V3.6.35 的自托管）

## 日期与时间

2026-11-02 17:05

## 任务等级

**L2**（资源加载策略变更，单文件 `frontend/index.html`；不改业务逻辑）

## 问题分析

### 核心症状

Font Awesome 图标字体加载速度慢，**比原先的 CDN 方案更慢**。

### 根本原因

V3.6.35（commit `de955649`）把 Font Awesome 6.4.0 从 BootCDN 改为**自托管**，资源放 `frontend/public/fontawesome/`（396 KB）。当时的判断是「同源加载省掉一次 DNS+TCP+TLS 跨域握手」。

这个判断在**部署形态为 GitHub Pages** 的前提下不成立：

- 自托管资源由本站源提供，国内访问 GitHub Pages 本身就不快；省下的那一次跨域握手，远小于源站本身的 RTT 劣势。
- BootCDN 在国内有边缘节点，CSS 与 webfonts 同源于 `cdn.bootcdn.net`，仍在一次 DNS 解析内并行取回。

即：**"同源"的收益被"源站远"的成本抵消且倒挂。**

### 受影响模块

仅首屏图标渲染。JS 逻辑、组件样式均不依赖 FA 的具体加载方式（全站通过 `fas` / `fab` 类名使用）。

## 修改内容

`frontend/index.html` 回到 V3.6.35 之前的引入方式：

| 项 | 回退前（自托管） | 回退后（CDN） |
|---|---|---|
| CSS | `/fontawesome/css/all.min.css`（站内） | `https://cdn.bootcdn.net/ajax/libs/font-awesome/6.4.0/css/all.min.css` |
| 字体 | 同站 `/fontawesome/webfonts/*` | 同源于 `cdn.bootcdn.net`（CSS 内相对路径） |
| 加载方式 | 同步 `<link rel="stylesheet">` | `media="print"` + `onload` 交换（异步，不阻塞首屏）+ `<noscript>` 兜底 |
| 预连接 | 无（同源无需） | 恢复 `<link rel="preconnect" href="https://cdn.bootcdn.net" crossorigin>` |
| 字体 preload | 有（`fa-solid-900.woff2`） | 移除（CDN 下由 CSS 解析后自然发起，preload 收益不足以抵消额外一次解析） |

## 修改原因

用户实测自托管比原 CDN 慢，要求回退。经查 V3.6.35 的改动正是这次回退的目标。

## 影响范围

- **不改代码逻辑**：所有 `fas` / `fab` 类名与图标字形不变。
- **新增外部依赖**：`cdn.bootcdn.net`（此前已用过多年，V3.6.35 才移除）。
- **无 CSP 约束**：全仓无 `Content-Security-Policy`（已检索 html/conf/json/py/yml），回退不需要同步白名单。
- **无其他引用**：`fontawesome` 仅出现在 `index.html`，组件中无自托管路径引用（已 `rg` 确认）。

## 解决方案

### 关键决策一：连 `preconnect` 一起恢复

CDN 方案下，`preconnect` 能在 HTML 解析早期完成 DNS+TCP+TLS，与 CSS 请求并行，是这类跨域静态资源的标准前置。自托管时它被一并删除是对的，回退时必须补回。

### 关键决策二：恢复 `media="print"` 异步交换

原自托管版本为了「同源只需一个 RTT」把异步改回同步，理由是同源连接可复用。回到 CDN 后该前提消失，跨域握手又回来了，此时同步阻塞的代价明显，故恢复异步 + `noscript` 兜底。

### 关键决策三：不再保留字体 preload

自托管时 preload `fa-solid-900.woff2` 是有效的（同源、可控）；CDN 下该字体 URL 由上游 CSS 决定，硬编码会与上游版本耦合，且 preload 与 CSS 请求存在竞争，收益不稳定，故移除。

## 性能指标

未实测（沙箱无法运行浏览器）。**待用户实机对比**：首屏图标出现时间、Network 面板中 `cdn.bootcdn.net` 的 TTFB 与 `fa-solid-900.woff2` 的下载耗时。

## 测试方案

### Agent 已执行

- 读取 `git show de955649 -- frontend/index.html`，确认被替换的原文与回退目标逐行一致。
- 检索确认无 CSP、无其他 `fontawesome` 引用。
- 结构树门禁 / 配置登记门禁见交接块。

### 待用户实机验证

1. 刷新页面，Network 面板确认 `all.min.css` 来自 `cdn.bootcdn.net`，且**不再**请求本站 `/fontawesome/…`。
2. 确认图标正常显示（若出现方块，检查 CDN 可用性与版本 6.4.0 是否仍在该路径）。
3. 对比首屏图标出现时间是否优于自托管版本。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/index.html` | Font Awesome 由自托管改回 BootCDN，恢复 preconnect 与异步加载 |
| `README.md` | 版本号三处同步至 V3.6.42 |
| `Docs/Guide/CHANGELOG.md` | 顶部新增 V3.6.42 条目 |
| `Docs/LLM_record/26-11/2026-11-02/2026-11-02-fontawesome-cdn-revert.md` | 本日志 |

## 遗留与风险

1. **`frontend/public/fontawesome/`（396 KB）仍在仓库中**。回退后它不再被引用，但 `public/` 下的文件会被原样拷贝进 `dist/`，属于**无效产物体积**。建议删除该目录；本次未删——删除属破坏性操作且超出「修加载速度」的范围，需用户确认后执行。
2. **CDN 可用性依赖**：BootCDN 曾有过短暂不可用记录。若追求稳妥，长期方案是「国内 CDN + 自托管双源降级」，但会引入复杂度。
3. **V3.6.35 的性能结论被推翻**。`index.html` 中那段自托管注释（4 条理由）已随本次改动删除，避免后续会话再次按错误前提改回自托管。
4. **未实测**。所有速度结论待用户浏览器验证。
