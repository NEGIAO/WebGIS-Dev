# 线上 404 白屏修复：Jekyll 丢弃 `_` 开头的 chunk

## 元信息

- **日期与时间**：2026-10-25 14:22
- **任务等级**：**L2**（构建配置 + 部署流水线修复；触及部署面，已在交接块标注需复核）
- **版本**：并入 **V3.6.26**（该版本尚未提交，避免同日再次拆版）
- **用户报告**：`https://www.negiao.cn/WebGIS/index.html?v=20261025` 打开异常，
  `assets/_plugin-vue_export-helper-DgLP3hnZ.js net::ERR_ABORTED 404 (Not Found)`，怀疑路由问题。

---

## 一、问题分析

### 1.1 现象定位（线上实测，非推测）

| 探测 | 结果 |
|---|---|
| `GET /WebGIS/index.html` | 200，HTML 正常返回 |
| 该 HTML 的 `modulepreload` 列表 | 含 `./assets/_plugin-vue_export-helper-DgLP3hnZ.js` |
| `GET /WebGIS/assets/_plugin-vue_export-helper-DgLP3hnZ.js` | **404** |
| `GET /WebGIS/assets/index-BYjab5re.js` | 200 |
| `GET /WebGIS/assets/vendor-vue-JbM4LY7C.js` | 200 |
| `GET /WebGIS/assets/rolldown-runtime-BofVGku5.js` | 200 |
| 入口 chunk 内部 import 的 helper 名 | `_plugin-vue_export-helper-DgLP3hnZ.js`（与 404 的一致） |

**关键判断**：同一次构建的其它 chunk 全部 200，**只有文件名以 `_` 开头的那一个 404**。所以不是「index 与 assets 版本错配」，也不是「上传不完整」，而是**托管平台按文件名规则丢弃了它**。

### 1.2 根因

站点部署在 GitHub Pages（`NEGIAO.github.io` 仓库的 `WebGIS/` 子目录，绑定 `www.negiao.cn`）。GitHub Pages 默认以 **Jekyll** 构建，而 Jekyll 的 `EntryFilter` 会**排除所有以 `.` 或 `_` 开头的文件/目录**（`_posts`、`_layouts` 之外的 `_` 文件同样被排除）。

唯一能关闭该行为的是**仓库根目录**的 `.nojekyll`。而 `deploy.yml` 里写的是：

```bash
touch "$TARGET_DIR/.nojekyll"    # → WebGIS/.nojekyll
```

**子目录里的 `.nojekyll` 不生效**。于是 `@vitejs/plugin-vue` 为异步 SFC 生成的
`assets/_plugin-vue_export-helper-<hash>.js` 被 Jekyll 丢弃，入口 chunk 一 import 就 404，SPA 直接白屏。

### 1.3 为什么现在才炸

`_plugin-vue_export-helper` 是否单独成 chunk 由 Rollup 决定：只有当多个异步 SFC 共享该 helper 时才拆出。近期新增的懒加载组件使共享关系成立，该 chunk 才首次出现——此前它被内联进别的 chunk，所以没有 `_` 开头的产物，问题潜伏未发。

### 1.4 与「路由」的关系

**与路由无关**。路由用的是 `createWebHashHistory`（`#/home?...`），不存在服务端 rewrite 需求；`vite.config.js` 的 `base` 为 `./`（相对路径），子目录部署也正确。用户看到的「路由出问题」是白屏的表象。

### 1.5 受影响模块

| 模块 | 影响 |
|---|---|
| `frontend/vite.config.js` | 产物命名（可根治） |
| `.github/workflows/deploy.yml` | `.nojekyll` 写入位置错误 |
| 线上站点 | 整站白屏（入口 chunk 依赖 404） |

---

## 二、解决方案

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 构建侧改名** | `chunkFileNames` 剥掉 chunk 名前导下划线 | 不依赖托管平台配置；本地可验证；换任何静态托管都不会再踩 | 只覆盖 chunk，不覆盖 asset（当前无 `_` 开头的 asset） | ✅ **采纳** |
| **B. 部署侧修 `.nojekyll`** | 在 pages 仓库**根目录** `touch .nojekyll` | 从平台机制上关闭 Jekyll，一劳永逸 | 只对 GitHub Pages 生效 | ✅ **采纳（双保险）** |
| C. 换托管 / 关 Jekyll 于平台设置 | 改 Pages 构建源 | — | 需改仓库设置，非代码可控 | ❌ |
| D. 手工上传一次改名文件 | 临时救火 | 快 | 下次构建又出现，治标不治本 | ❌ |

**A + B 同时做**：A 保证产物本身不含 `_` 前缀（跨平台安全），B 保证即使将来又出现 `_` 文件也不会被吞。

---

## 三、修改内容

| 文件 | 改动 |
|---|---|
| `frontend/vite.config.js` | `rollupOptions.output` 新增 `chunkFileNames`：`assets/${name.replace(/^_+/, '')}-[hash].js`，附大段注释说明 Jekyll 机制 |
| `frontend/public/.nojekyll` | 新增空文件，随构建输出到 `dist/.nojekyll` |
| `.github/workflows/deploy.yml` | 在 pages 仓库根目录追加 `touch .nojekyll`（保留原 `$TARGET_DIR/.nojekyll` 作兼容），并补注释说明子目录无效 |

---

## 四、修改原因

1. **构建侧根治优先**：产物命名是项目可控的，托管平台规则是外部约束。让产物不触发规则，比要求每个部署环境都配对 `.nojekyll` 更稳。
2. **部署侧仍需修**：`_` 前缀产物还可能来自其它插件（如某些 asset 插件），根 `.nojekyll` 是唯一能关闭 Jekyll 的手段。
3. **不掩盖症状**：没有采用「把 helper 内联进入口」这类会增大首屏体积的方案。

---

## 五、影响范围

| 维度 | 是否受影响 | 说明 |
|---|---|---|
| 产物文件名 | 是 | 仅去掉前导 `_`，内容哈希不变（实测 `DgLP3hnZ` 保持） |
| 引用关系 | 是 | index.html 与入口 chunk 内的 import 同步改为新名，已逐一校验 |
| 首屏体积 / 分包 | 否 | 分包策略、`manualChunks` 未改动 |
| 缓存 | 是（良性） | 文件名变化使旧缓存自然失效 |
| 部署面 | 是 | `deploy.yml` 增加一行 `touch .nojekyll`，**需你复核** |
| 路由 / base | 否 | 未改动（hash 路由 + 相对 base 本就正确） |

---

## 六、性能指标

不适用。构建耗时 13.28s（4401 modules），与改动前同量级。

---

## 七、测试方案

### 7.1 Agent 已执行

| 项目 | 方式 | 结果 |
|---|---|---|
| 线上根因定位 | curl 探测 index.html / 4 个 chunk / 2 个 `.nojekyll` 路径 | ✅ 仅 `_` 前缀文件 404，同批其它 chunk 200 |
| 构建产物命名 | `ls dist/assets \| grep '^_'` | ✅ 无下划线开头文件 |
| helper 改名 | `ls dist/assets \| grep plugin-vue_export` | ✅ `plugin-vue_export-helper-DgLP3hnZ.js` |
| index.html 引用完整性 | 提取全部 `./assets/*` 引用逐一比对文件存在性 | ✅ 缺失 0 |
| 入口 chunk 内部 import | 提取 `./*.js` 引用逐一比对 | ✅ 缺失 0 |
| `.nojekyll` 进入产物 | `ls dist/.nojekyll` | ✅ 存在 |
| workflow YAML 语法 | `yaml.safe_load` | ✅ OK |

### 7.2 待用户验证（部署后）

| 步骤 | 预期结果 |
|---|---|
| 1. 推送后等 Pages 构建完成，硬刷新 `https://www.negiao.cn/WebGIS/index.html?v=...` | 正常进入应用，无 404 |
| 2. DevTools → Network 过滤 `plugin-vue_export-helper` | 请求为 `plugin-vue_export-helper-*.js`（无下划线）且 200 |
| 3. 直接访问 `https://www.negiao.cn/WebGIS/assets/_plugin-vue_export-helper-DgLP3hnZ.js` | 旧地址仍 404（正常，已被新名替代） |
| 4. 检查 pages 仓库根目录 | 出现 `.nojekyll`（提交信息 `Update WebGIS from source repo: ...`） |

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/vite.config.js` | 新增 `chunkFileNames`（剥前导下划线）+ 机制注释 |
| `frontend/public/.nojekyll` | 新增（随构建输出） |
| `.github/workflows/deploy.yml` | 根目录 `touch .nojekyll` + 注释 |
| `Docs/Guide/CHANGELOG.md` | V3.6.26 条目追加第 ④ 项 |
| `Docs/TODO/bugfix-optimization-plan.md` | 登记 Rocket Loader 与部署加固建议 |
| `Docs/LLM_record/26-10/2026-10-25/2026-10-25-gh-pages-underscore-chunk-404.md` | 本日志（新增） |

---

## 九、遗留与风险

1. **`.nojekyll` 的生效依赖 pages 仓库根目录**：workflow 已改为在根目录 `touch`，但若该仓库设了分支保护或 `git add --all` 被忽略规则拦截，仍可能不生效。部署后请按 §7.2 第 4 步确认。
2. **Cloudflare Rocket Loader 处于开启状态**（页面注入了 `/cdn-cgi/scripts/.../rocket-loader.min.js`）。它改写 script 标签，与 ES Module / 动态 import 组合时易产生 `ERR_ABORTED` 类次生问题。本次 404 与它无关，但建议在 Cloudflare 对 `/WebGIS/*` 关闭 Rocket Loader（或全站关闭），属控制台配置，非代码可控。
3. **旧 URL 的 404 会持续存在**：已被搜索引擎或用户收藏的 `_plugin-vue_export-helper-DgLP3hnZ.js` 仍 404，无实际影响（哈希文件名本就不该被直接访问）。
4. **未做部署后端到端验证**：本地只验证了产物完整性，真实线上效果需推送后确认。
