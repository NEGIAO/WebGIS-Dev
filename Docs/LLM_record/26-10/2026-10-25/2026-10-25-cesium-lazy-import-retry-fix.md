# Cesium 懒加载重试分支修复（Unknown variable dynamic import）

## 元信息

- **日期与时间**：2026-10-25 11:17
- **任务等级**：**L2**（单文件 Bug 修复，`useLazyModules.ts` 约 60 行重写）
- **版本**：**仍为 V3.6.24**（理由见 §七.1——本批次尚未提交，按用户「整合为单一版本」的指示不新增版本号）

---

## 一、问题分析

### 1.1 核心症状

用户运行时报错：

```
Cesium 组件加载失败: Unknown variable dynamic import:
../domains/cesium/components/CesiumContainer.vue?t=1792898003654
```

`?t=1792898003654` 是毫秒时间戳，说明命中的是**重试分支**，而非首次加载。

### 1.2 根本原因

`frontend/src/app/composables/useLazyModules.ts` 原实现：

```ts
// 首次：静态 specifier，Vite 可分析 ✅
return await import('@cesium-domain/components/CesiumContainer.vue');
// ...
// 重试：模板字符串 + Date.now() ❌
return await import(`@cesium-domain/components/CesiumContainer.vue?t=${Date.now()}`);
```

Vite 的动态导入分析只接受**字符串字面量**。模板字符串属于「运行时变量 specifier」：

1. **dev 期**：Vite 的 importAnalysis 插件无法解析该 specifier，直接抛出 `Unknown variable dynamic import`；
2. **构建期**：Rollup 将该表达式原样保留为运行时 `import()`，产物里的相对路径 `../domains/cesium/components/CesiumContainer.vue?t=...` 在 `dist/` 中**不存在**，必然 404。

也就是说，**重试分支在 dev 与 prod 都是死路**，且它恰好只在「首次加载已失败」时才被走到——把一次本可恢复的瞬态失败（网络抖动 / dev server 重启）升级为不可恢复的硬失败。

原实现的注释写着「dev server 忽略查询参数后仍能找到对应 chunk」，这个前提不成立：问题不在查询参数，而在于 specifier 本身无法被静态分析。

### 1.3 受影响模块

| 模块 | 影响 |
|---|---|
| `app/composables/useLazyModules.ts` | 重试逻辑不可用 |
| `app/HomeView.vue` | 捕获后提示「Cesium 组件加载失败」，3D 引擎无法进入 |
| 用户体验 | dev 下首次瞬态失败即白屏，只能手动刷新 |

---

## 二、解决方案

### 2.1 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 加 `/* @vite-ignore */`** | 抑制告警，保留 `?t=` | 改动最小 | 只消警告不修问题：产物仍是无效路径，prod 必挂 | ❌ |
| **B. 重试复用同一静态 specifier** | 删掉 `?t=`，循环重试同一个 `import()` | dev/prod 行为一致；失败的模块不进浏览器模块表，重新 import 会真实重发请求 | 失去「强制绕过缓存」能力（但该能力本就不存在） | ✅ **采纳** |
| **C. 重试改为整页 reload** | 失败后 `location.reload()` | 能解决「发版后旧 chunk 失效」 | 用户输入态全丢；对 dev 瞬态抖动过重 | ⚠️ 备选，未采纳 |

### 2.2 选型理由

「破缓存」这个诉求本身是伪需求：**失败的模块请求不会进入浏览器的模块映射表**（模块表只缓存成功求值的模块），因此重新 `import()` 同一 specifier 会真实重发网络请求。真正需要破缓存的场景是「发版后旧 chunk 已删除」，那属于 `reload` 的范畴（方案 C），不该由查询参数承担。

### 2.3 实施步骤

1. 抽出唯一的静态加载函数 `loadCesiumContainer()`；
2. 重试循环复用该函数，`attempt 0..maxRetries` 统一为一条路径；
3. 瞬态判据补齐多浏览器措辞（Chromium / Firefox / Safari / 通用 NetworkError）；
4. 非瞬态错误立即上抛，不浪费重试等待；
5. 加 `150ms × n` 退避，给 dev server 重启留恢复窗口；
6. 全仓扫描确认无其他变量式动态 import。

---

## 三、修改内容

`frontend/src/app/composables/useLazyModules.ts`（重写）：

| 项 | 改前 | 改后 |
|---|---|---|
| 加载入口 | 首次静态、重试变量式，两条路径 | `loadCesiumContainer()` 单一路径，静态字面量 |
| 瞬态判据 | 只认 `Failed to fetch dynamically imported module` | 追加 `error loading dynamically imported module`（Firefox）、`Importing a module script failed`（Safari）、`NetworkError when attempting to fetch resource` |
| 重试结构 | 首次 try + 独立 for 循环（两套判据重复） | 单循环 `attempt 0..maxRetries`，判据只写一处 |
| 退避 | 无（立即重试，dev server 未起来时必连败） | `150ms × (attempt + 1)` |
| 非瞬态错误 | 首次即抛（正确），重试内也抛（正确但路径割裂） | 统一在循环内立即抛 |

`loadSidePanelModule` 未改动（其 specifier 本就是静态字面量）。

---

## 四、修改原因

1. **恢复重试的实际作用**：原实现的重试永远不可能成功，等于没有重试。
2. **dev / prod 行为一致**：静态 specifier 在两端都由 Vite 解析，不存在「dev 能跑、构建后挂」的隐患。
3. **减少重复判据**：改前「是否瞬态」的判断写了两遍且措辞相同，改后单点维护。

---

## 五、影响范围

| 维度 | 是否受影响 | 说明 |
|---|---|---|
| 运行时行为 | 是 | 3D 引擎懒加载失败后可真正重试；非瞬态错误仍立即上抛 |
| 代码分块 | 否 | `CesiumContainer` 仍为独立 chunk（实测 `CesiumContainer-DUzMUCuM.js`） |
| 构建产物 | 是 | 产物中不再含 `?t=` 无效路径 |
| 类型检查 | 是 | 该文件本就是 `.ts`，纳入 `tsc --noEmit` |
| 配置 / 部署面 | 否 | 未触碰 `.env` / `catalog.py` / workflows |
| 后端 | 否 | 零改动 |

---

## 六、性能指标

不适用（加载失败路径，无热路径变更）。构建耗时 25.61s，模块数 4276（较上一版少 1，因移除了变量 specifier 产生的额外模块节点）。**未实测**重试对用户可感知时延的影响（最多增加 150+300=450ms 退避）。

---

## 七、测试方案

### 7.1 Agent 已执行

| 项目 | 命令 | 结果 |
|---|---|---|
| 变量式动态 import 全仓扫描 | `grep -rnE "import\(\`" src` | ✅ 0 处命中 |
| 类型检查 | `tsc --noEmit` | ✅ 0 error |
| ESLint | `eslint src/app/composables/useLazyModules.ts` | ✅ 0 problems |
| 构建 | `npx vite build --outDir dist-probe2` | ✅ 4276 modules / 25.61s |
| 产物残留检查 | `grep -rl "CesiumContainer.vue?t=" dist-probe2/assets` | ✅ 无残留 |
| 分块保持 | `ls dist-probe2/assets \| grep ^CesiumContainer` | ✅ `CesiumContainer-DUzMUCuM.js` + `.css` 独立存在 |
| 门禁 | `CheckStructureTree.py` / `CheckConfigRegistry.py` | 见交接块 |
| §11.2 红线 | `grep -rEi` 等价执行 | 见交接块 |

> 说明：未能构造真实瞬态失败场景（需中断 dev server 的 chunk 请求），因此「重试确实生效」属**静态推断 + 构建验证**，非运行时实测。

### 7.2 待用户实机验证

| 步骤 | 预期结果 |
|---|---|
| 1. `npm run dev` → 切换到 3D 模式 | Cesium 正常加载，无 `Unknown variable dynamic import` |
| 2. dev 运行中重启 Vite（Ctrl+C 后重新 `npm run dev`），在页面点重试 3D | 控制台出现「动态导入瞬态失败，第 1 次重试...」，随后成功或给出真实错误，**不再报 Unknown variable** |
| 3. `npm run build` 后 `npm run preview` → 切 3D | 3D 正常加载（分块路径正确） |
| 4. 断网状态下切 3D | 提示加载失败（预期行为），恢复网络后可重试成功 |

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/app/composables/useLazyModules.ts` | 重试逻辑重写：静态 specifier 单一路径 + 多浏览器瞬态判据 + 退避 |
| `Docs/Guide/CHANGELOG.md` | V3.6.24 条目「七、审查修复」追加 ⑤；过程记录补本日志链接 |
| `Docs/Guide/frontend-structure.md` | `useLazyModules.ts` 条目补充「重试必须复用静态 specifier」的约束说明 |
| `Docs/LLM_record/26-10/2026-10-25/2026-10-25-cesium-lazy-import-retry-fix.md` | 本日志（新增） |

---

## 九、遗留与风险

1. **版本号未递增（§5 的显式偏离）**：§5 要求每个 L2/L3 任务 +1 修订号。但本批次（V3.6.24）**尚未提交**，且用户上一轮明确要求「把暂存区多批次整合为单一版本」——此刻插入 `V3.6.25` 会重新把同一批未提交改动拆成两个版本，与该指示直接冲突。按 §0「用户当前会话指令优先」，本次修复并入 V3.6.24。**若你希望单独记版本，请告知，我改为 V3.6.25 并同步三处。**
2. **发版后旧 chunk 失效仍未覆盖**：生产环境部署新版本后，用户停留在旧页面再切 3D 会因旧 chunk 已删除而失败。方案 C（整页 reload）可解，但需产品确认是否接受输入态丢失，已记 TODO。
3. **重试上限 2 次、退避 150/300ms**：针对 dev server 重启与网络抖动设定；若线上 CDN 抖动更久，可调参（`maxRetries` 与 `wait()` 基数）。
4. **未做真机/真实断网验证**：见 §7.1 说明，不得视为已验收。

---

## 十、追加诊断（修复后仍报瞬态失败的原因）

### 10.1 现象

修复后用户复测，浏览器控制台变为：

```
[CesiumContainer] 动态导入瞬态失败，第 1 次重试...
[CesiumContainer] 动态导入瞬态失败，第 2 次重试...
[UrlParamStore] Extracted pending params: ...
```

即「Unknown variable dynamic import」已消失（重试代码路径本身正确了），但底层那次 fetch 仍然失败，两次重试也没救回来，最后页面被整体重载。

### 10.2 排查过程（实证）

1. **端口探测**：`netstat` 未见 5173/5199 等 Vite 端口处于 LISTENING，用户侧 dev server 已停止；
2. **缓存体检**：`node_modules/.vite` 目录时间戳为 **10-18 18:29**，而 HEAD 已合并 dependabot 的 `follow-redirects` PR（#33）——lockfile 变更与依赖缓存不同步；
3. **干净启动复现**：删除 `node_modules/.vite` 后启动 `vite --port 5199`，日志出现 `Re-optimizing dependencies because lockfile has changed`，随后 ready；
4. **模块闭包校验**：自建脚本按浏览器方式递归抓取 `CesiumContainer.vue` 的 import 闭包——**336 个模块全部 200**，仅 3 条是预构建产物里字符串字面量导致的解析误报（`MyPage.vue` / `Feature.js` / `Units.js`，均由 `/node_modules/.vite/deps/*.js` 内部文本触发，非真实请求）；
5. **构建复核**：`vite build` 4276 modules 通过，产物无 `?t=` 残留。

### 10.3 结论：不是代码缺陷，是 dev 环境状态

两个叠加因素，都属「运行时状态」而非源码问题：

| 因素 | 机制 | 与日志的对应 |
|---|---|---|
| **① 模块图过期** | 用户 dev server 在我完成 4 个文件 `.js → .ts` 重命名**之前**就已启动。Vite 的模块图缓存了 `drawMeasureSpec.js` 等旧路径，文件被删后请求 404，浏览器统一报 `Failed to fetch dynamically imported module` | 首次加载即失败，且重试也失败（旧路径始终不存在） |
| **② 依赖预构建整页重载** | `.vite/deps` 缓存停留在 10-18，lockfile 因合并 dependabot PR 已变 → Vite 重新预构建并触发 **full-reload**。重载期间进行中的动态 import 全部作废 | 两次重试后出现第二轮 `[UrlParamStore] Extracted pending params`（即整页重载后重新 bootstrap） |

两者都不是 `useLazyModules.ts` 能修复的：模块图与预构建缓存属于 dev server 进程内状态；整页重载会直接替换文档，任何 JS 重试都无效。

### 10.4 恢复步骤（用户侧执行一次即可）

```bash
# 1. 停掉正在跑的 dev server（Ctrl+C）
# 2. 清依赖预构建缓存（可再生的构建产物，非源码）
rm -rf frontend/node_modules/.vite        # Windows: cmd /c "rmdir /s /q node_modules\.vite"
# 3. 重启（--force 强制重新预构建，双保险）
cd frontend && npm run dev -- --force
```

若仍复现，请把 **dev server 终端**的报错贴出来——浏览器只给笼统的 fetch 失败，真正的 transform 错误只出现在终端。

### 10.5 顺带修正

迁移后仍有两处注释指向旧文件名（`drawEntityFactory.js`），已改为 `.ts`：`useCesiumDrawMeasure.js:16`、`drawGeometry.ts:10`。仅注释，无行为变化。
