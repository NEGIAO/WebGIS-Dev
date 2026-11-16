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
