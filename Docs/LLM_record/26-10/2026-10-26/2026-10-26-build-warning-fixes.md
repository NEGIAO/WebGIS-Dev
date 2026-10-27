# 构建告警清理（:deep 死规则 / 分包失效 / env 选项弃用）

## 元信息

- **日期与时间**：2026-10-26 15:55–16:10
- **任务等级**：**L2**（3 个代码文件 + 1 处配置注释，跨文件改动；非单文件微改）
- **用户指令**：上一轮 L0 构建告警分析（`npm run build` 输出）的结论"全部修复"
- **版本**：并入 **V3.6.29**（与认证页装饰层、线框地球同批次合并发布）

---

## 一、问题分析

分析结论已在上一轮以 L0 咨询形式交付（用户确认后进入实施），此处归档要点。

### 1.1 核心症状（构建输出四类告警）

| # | 告警 | 位置 |
|---|---|---|
| 1 | `[lightningcss minify] 'deep' is not recognized as a valid pseudo-class` | `ChatMessageList.vue:1225` |
| 2 | `[INEFFECTIVE_DYNAMIC_IMPORT]` ×2（GeoTerrainProvider / ArcGISTerrainProvider） | `CesiumContainer.vue:2019-2020` |
| 3 | `The envFile option is deprecated, please use envDir: false instead` | `vite.config.js:144` |
| 4 | `chunkSizeWarningLimit` 超限提示、`vendor-rapier 4.34 MB` | 分包策略 |

### 1.2 根本原因

1. **`:deep` 落在非 scoped 样式块**。`ChatMessageList.vue` 有两个 `<style>`：`scoped`（行 420）与**非 scoped**（行 1108，专为 `v-html` 注入的 Markdown 代码块服务——scoped 会给元素加 `data-v-xxx`，v-html 内容带不上）。移动端触控规则被写进了后者，而 `:deep()` 只在 scoped 编译期被改写；非 scoped 块原样输出，lightningcss 不认识 `deep` 伪类 → 告警。
2. **同一模块既静态又动态引入**。`CesiumContainer` 卸载时用 `import()` 调两个 provider 的 Worker 池清理函数，但 `useCesiumLayers.js:29-30` 已静态 import 同两个模块 → 动态引入无法单独成 chunk，产物里留下两个 0.09 kB 空壳 chunk。
3. **Vite 8 弃用 `envFile: false`**，官方替代为 `envDir: false`（语义同为"不自动加载 .env"）。
4. **`vendor-rapier` 注释失真**：`manualChunks` 注释写"~300KB"，实际 4.34 MB——compat 版把 wasm 以 base64 内联（约原始 wasm 的 1.33 倍）。

### 1.3 受影响模块

- AI 聊天消息列表（移动端图标尺寸）
- Cesium 容器卸载清理链路 + 构建分包图
- Vite 构建配置（env 加载与分包注释）

---

## 二、方案对比与选型

| 问题 | 候选方案 | 结论 |
|---|---|---|
| `:deep` | A. 改成 `.chat-body-wrap .action-btn svg`（非 scoped 块里不需要 `:deep`，用组件根类限定避免泄漏）<br>B. 整条搬进 `<style scoped>` 保留 `:deep(svg)` | **选 A**：该块存在的前提就是服务 v-html，把规则搬走会与"代码块样式集中在非 scoped 块"的组织方式冲突；A 改动 1 行且不引入新的块边界 |
| 分包失效 | A. 把 `useCesiumLayers` 的两处静态 import 改动态（让 provider 真正按需）<br>B. 把 `CesiumContainer` 的两处 `import()` 改静态 | **选 B**：A 需要把 `createGeoTerrainProvider` 的 5 处调用点改异步，波及地形初始化时序；而这两个 provider 在 Cesium 容器挂载后必然要用，本就不具备"懒加载"价值 |
| `envFile` | 改 `envDir: false` | **采纳**：插件内部用模块级 `envDir` 常量解析 `deploy/.env`，与 Vite 选项互不影响 |
| `vendor-rapier` | A. 换 `@dimforge/rapier3d` 非 compat（wasm 独立流式）<br>B. 只修注释 | **本次选 B**：换包属**依赖增删**，按 §1 属 L3，需先提交方案批准；且 rapier 已懒加载、不在 `SKIP_PRELOAD` 之外的首屏链路，风险收益不成立 |

---

## 三、修改内容

1. **`ChatMessageList.vue`**：`.action-btn :deep(svg)` → `.chat-body-wrap .action-btn svg`，并补注释说明"非 scoped 块里 `:deep` 不会被编译"。
2. **`CesiumContainer.vue`**：新增两条静态导入（`destroySharedLercPool` / `destroySharedGeoDecodePool`），卸载处由 `import().then()` 改为直接调用；补注释说明为何不再动态引入。
3. **`vite.config.js`**：`envDir`（deploy 目录）+ `envFile: false` → 单条 `envDir: false`，补注释说明常量与选项的区别。
4. **`vite.config.js`**：`vendor-rapier` 分包注释由"~300KB"更正为实测体积与成因，并注明换包属 L3。

## 四、修改原因

构建输出里 4 类告警，只有第 1 条是**功能缺陷**（移动端图标尺寸规则从未生效，属静默失效），其余是分包意图落空、配置弃用与注释失真。一次性清干净，避免告警噪音掩盖后续真正的新问题。

## 五、影响范围

- AI 聊天面板移动端（≤700px）操作按钮图标尺寸：由"规则失效、依赖 Lucide `:size` 兜底"变为"规则生效，强制 18px"
- Cesium 容器卸载清理：行为等价（模块本就在静态图中），仅去掉一次动态 import 的微任务开销
- 构建：env 加载行为不变（仍由 `selectiveEnvPlugin` 接管）

## 六、解决方案

见第三节。核心是"同一模块不要既静态又动态引入"与"`:deep` 只属于 scoped 块"两条约束。

## 七、性能指标

未实测运行时性能。构建侧：告警数由 4 类降为 0（体积类提示除外，属策略性阈值）。

## 八、测试方案

### Agent 已执行

| 项 | 命令/方式 | 结果 |
|---|---|---|
| 生产构建 | `npx vite build --outDir <临时目录> --emptyOutDir true` | `✓ built in 16.50s`，无 error |
| 告警清零核对 | 比对构建输出中的 `:deep` / `INEFFECTIVE_DYNAMIC_IMPORT` / `envFile` 三类关键字 | 三类**全部消失**（grep 无命中） |
| 空壳 chunk 消失 | 检查产物 `assets/` 下 `ArcGISTerrainProvider-*.js`、`GeoTerrainProvider-*.js` | 两个文件**不再生成**；`vendor-rapier-*.js` 仍在（懒加载链路未受影响） |
| ESLint | 对三个改动文件 | 0 problems |
| 版本注入 | 在产物中检索 `V3.6.30` | `HomeView-*.js` 命中，`__APP_VERSION__` 提取正常（未受 `envDir: false` 影响） |
| 选择器落盘核对 | 在产物 CSS 中检索 `.chat-body-wrap .action-btn svg` 与 `deep(svg)` | `ChatPanelContent-*.css` 命中 `.chat-body-wrap .action-btn svg{width:18px;height:18px}`；`deep(svg)` 残留 0 处 |
| 结构树门禁 | `python Scripts/CheckStructureTree.py` | 514 = 514，漏登记 0 / 幽灵 0，exit 0 |
| 配置登记门禁 | `python Scripts/CheckConfigRegistry.py` | 七项全通过，exit 0 |
| 平台红线自查 | §11.2 四条（无 `rg`，用 `grep -riE` 等价执行，排除 `.venv`/`node_modules`） | 四条全清。本轮把第 2 条模式收紧为 `\bxray\b`，消除了上一轮 `maxRayDistance` 的误报 |

### 待用户实机验证

1. 打开 AI 聊天面板，窗口缩到 ≤700px，确认消息下方复制/重生成按钮的图标为 18px（此前为 16/18 混合）。
2. 进入三维视图后切走（卸载 Cesium 容器），再切回，确认地形加载正常、控制台无 `destroyShared*Pool is not a function` 类报错。
3. `npm run dev` 启动，确认 `import.meta.env` 相关配置（后端基址、瓦片代理）未因 `envDir: false` 变化——即 `selectiveEnvPlugin` 仍在按 mode 读取 `deploy/.env(.local)`。

## 九、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/components/ChatMessageList.vue` | 修 `:deep` 死规则，改根类限定的 `svg` 选择器 |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | 地形 provider 清理函数改静态导入，去掉无效动态引入 |
| `frontend/vite.config.js` | `envFile` → `envDir: false`；`vendor-rapier` 注释纠偏 |
| `README.md` | 版本号三处 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.6.30 条目 |
| `Docs/LLM_record/26-10/2026-10-26/2026-10-26-build-warning-fixes.md` | 本日志 |

## 十、遗留与风险

1. **`vendor-rapier` 4.34 MB 未压缩**：本次只修注释。换 `@dimforge/rapier3d` 属依赖变更（L3），需先出方案；当前已在 `SKIP_PRELOAD_CHUNKS` 内，不影响首屏。
2. **`chunkSizeWarningLimit: 300` 的提示保留**：超限 chunk 全为懒加载（ol / three / geotiff / echarts / rapier / hljs / marked），提高阈值只会掩盖问题，故不动。
3. **`minify: 'terser'` 保留**：为 `drop_console/drop_debugger` 的既有取舍（Vite 8 oxc 压缩器不支持），构建 8.4s 中 terser 占 8.1s。若日后要提速，需同时解决生产日志剥离，属独立议题。
4. **移动端规则改为全局作用域选择器**：`.chat-body-wrap .action-btn svg` 虽用根类限定，但仍是全局规则；若后续有组件复用 `.chat-body-wrap` 类名，会受影响（当前全仓唯一）。
