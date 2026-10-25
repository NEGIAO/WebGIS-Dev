# OL→Cesium 视图转换：回滚路径写坏 z 语义（修复）

## 元信息

- **日期与时间**：2026-10-25 11:33
- **任务等级**：**L2**（单文件 Bug 修复，`HomeView.vue` 的 `setMapView`）
- **版本**：V3.6.24（本批次未提交，按用户「单一版本」指示不递增）
- **触发**：用户反馈「OL 初始进入是全国范围，进入 Cesium 后转换的视图缩放级别完全不对，且第一次打开时总是有问题」

---

## 一、问题分析

### 1.1 先排除换算公式

用真实代码（`esbuild` 打包 `utils/viewScale` 后在 Node 中执行）实测 zoom ↔ height 对照：

| OL zoom | Cesium 相机高度 |
|---|---|
| 3 | 15,028,659 m |
| 4 | 7,514,329 m |
| 5 | 3,757,165 m |
| 6 | 1,858,582 m |
| 9 | 234,823 m |
| 17 | 917 m |

反向：`height 4,417,359 m → zoom 4.766`、`height 6,000,000 m → zoom 4.325`。

结论：**换算公式正确**。用户日志中 URL 的 `z=4417358.84` 反算为 zoom ≈ 4.77，正是「全国范围」的合理相机高度。问题不在数学，而在**语义写回**。

### 1.2 日志证据

用户提供的两次参数提取：

```
第 1 次：{lng: 114.302, lat: 34.8146, z: 4417358.84, l: 9, s: '0'}
第 2 次：{lng: 114.302, lat: 34.8146, z: null,       l: 9, s: '0'}
```

`z` 从合法高度变成 `null`，而 `lng/lat/l` 未变。能产生这一变化的只有 `validateViewZ`：

```ts
function validateViewZ(value, view) {
    if (view === 'cesium') { /* 1 ~ 50,000,000 米 */ }
    return validateZoom(value);   // OL：0 ~ 30
}
```

即第 2 次提取时 `view` 已是 `ol`，而 `z` 仍是米制 → 被 `validateZoom` 判为非法 → `null`。

### 1.3 缺陷 A（次要，已修）：回滚写坏 z 语义

`HomeView.setMapView()` 的 Cesium 加载失败回滚分支：

```js
if (!loaded) {
    if (writeUrl) await replaceMapView(MAP_VIEW_OL);   // ← 只改 view，不动 z
    return false;
}
```

`replaceMapView(view, { queryPatch })` 在 `view === 'ol'` 时只删除 `cv / heading / pitch / roll`，**不转换 z**。于是 URL 变成混合态：

```
view=ol  +  z=4417358.84（米制）
```

后果链：
1. 下一次 `extractAndStorePendingParams` → `validateViewZ(4417358.84, 'ol')` → `null`；
2. `getValidCoordinateParams()` 在 `z === null` 时回落 **`z: 17`**（硬编码），OL 会跳到街道级；
3. 视图参数整体失真，用户看到「OL 是全国 / 切换后完全不对」。

**为什么「第一次打开时总是有问题」**：首次打开最可能命中 Cesium 分块加载失败（本次会话已确认 dev 缓存过期会导致该失败），从而必然走到这条回滚分支——回滚本身把 z 语义写坏了。

> ⚠️ 本节是**次要缺陷**：它解释「回滚后视野丢失」，但不足以解释用户看到的「贴地街区级」。真正的首要原因见 §十。

### 1.4 受影响模块

| 模块 | 影响 |
|---|---|
| `app/HomeView.vue` `setMapView` | 回滚写坏 URL 语义 |
| `common/url-state/useUrlParamStore.ts` | 读到被污染的 z 后置 null |
| OL 启动视图 | z 丢失 → 回落 zoom 17 |
| Cesium 首屏 | 无可换算的 z → 默认相机 |

---

## 二、解决方案

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 回滚时把米制 z 反算成 zoom** | 调 `cesiumHeightToOlZoom` 生成 patch | 语义正确 | 需 Cesium 相机状态；加载失败时相机不存在，只能拿 URL 值反算，引入二次误差 | ❌ |
| **B. 回滚时恢复切换前快照** | 切换前 `getCurrentQuerySnapshot(route.query)`，失败时作为 `queryPatch` 回写 | 无损还原（z/lng/lat/l 全部回到切换前）；不依赖任何换算 | 无 | ✅ **采纳** |
| **C. 回滚后清空 z** | 直接删 z | 简单 | 用户原本的视野也丢了 | ❌ |

### 实施步骤

1. `setMapView` 入口处捕获 `preSwitchQuery`；
2. 回滚分支改为 `replaceMapView(MAP_VIEW_OL, { queryPatch: preSwitchQuery })`；
3. 注释写明「为什么不能只回滚 view」——防止后续再退化。

---

## 三、修改内容

`frontend/src/app/HomeView.vue`：

- 新增导入 `getCurrentQuerySnapshot`；
- `setMapView` 内新增 `preSwitchQuery` 快照（切换前，含 OL 语义的 z）；
- Cesium 加载失败回滚由 `replaceMapView(MAP_VIEW_OL)` 改为 `replaceMapView(MAP_VIEW_OL, { queryPatch: preSwitchQuery })`。

`replaceMapView` 的 OL 分支仍会删除 `cv/heading/pitch/roll`，因此回滚后 URL 不会残留 Cesium 姿态参数。

---

## 四、修改原因

1. **回滚必须是无损的**：失败的切换不应改变用户原有视野参数。原实现只回滚了 `view`，等于「回滚了一半」。
2. **z 的语义由 view 决定**：`z` 在 OL 下是缩放级别、在 Cesium 下是米制高度。任何只改其中一个的写回都会制造混合态，而混合态会被下一次校验静默丢弃。
3. **失败路径最需要正确**：首次打开、弱网、dev 缓存过期都会走这条分支，正是用户感知最强的场景。

---

## 五、影响范围

| 维度 | 是否受影响 | 说明 |
|---|---|---|
| Cesium 加载失败回滚 | 是 | URL 完整还原到切换前 |
| 正常切换（成功路径） | 否 | 未改动 |
| 首屏直接进入 3D | 否 | 走 `writeUrl:false` 分支，未改动 |
| 类型检查 / 构建 | — | `tsc` 0 error、`vite build` 4276 modules 通过 |
| 后端 / 配置面 | 否 | 零改动 |

---

## 六、性能指标

不适用（仅在失败回滚路径多一次快照对象构造）。**未实测**。

---

## 七、测试方案

### 7.1 Agent 已执行

| 项目 | 命令 | 结果 |
|---|---|---|
| 换算公式数值验证 | esbuild 打包 `viewScale` 后 Node 执行 | ✅ 见 §1.1 表格 |
| 类型检查 | `tsc --noEmit` | ✅ 0 error |
| ESLint | `eslint src/app/HomeView.vue` | ✅ 0 problems |
| 构建 | `npx vite build --outDir dist-check3` | ✅ 4276 modules / 17.07s |
| 结构树 / 配置门禁 | `CheckStructureTree.py` / `CheckConfigRegistry.py` | ✅ 通过 |

> **未能复现**用户描述的「缩放级别非常高」具体形态：本机 dev server 受沙箱批量删除保护限制，无法完成浏览器级复现。因此本次只修复了**已由日志证实**的回滚污染缺陷，未对其它可疑路径做猜测性改动（§2.6）。

### 7.2 待用户实机验证

| 步骤 | 预期结果 |
|---|---|
| 1. 清 `node_modules/.vite` 后重启 dev，首次打开（OL 全国视野）→ 切 3D | Cesium 视野与 OL 接近（全国范围，相机高度约 4000~7500 km，视窗高度而定） |
| 2. 制造一次 Cesium 加载失败（可在 Network 面板拦截 CesiumContainer 分块）→ 观察 URL | 回滚后 URL 应恢复为 `view=ol&z=<缩放级别>`，**不出现 `z` 为七位数** |
| 3. 连续切换 OL↔3D 五次 | 每次视野一致，无跳变、无回到默认视野 |
| 4. 切 3D 后刷新页面 | 相机停在刷新前的位置与高度 |

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/app/HomeView.vue` | `setMapView` 增加切换前快照，回滚时无损还原 URL |
| `Docs/Guide/CHANGELOG.md` | V3.6.24「七、审查修复」追加第 ⑥ 项 |
| `Docs/TODO/bugfix-optimization-plan.md` | 登记 2 项残留隐患 |
| `Docs/LLM_record/26-10/2026-10-25/2026-10-25-cesium-view-convert-on-first-open.md` | 本日志（新增） |

---

## 九、遗留与风险

1. **用户报告的「缩放级别非常高」尚未确证成因**。两种可能形态需要区分：
   - 若表现为**贴得极近（街区级）**：说明 Cesium 把某个缩放级别当成了米制高度。可能来源是外部/历史链接（`view=cesium` 但 z 是 zoom），而首屏 `setMapView(getCurrentMapView(), { writeUrl:false })` **不做语义校验**，会把 4~30 直接当米用（`MIN_CAMERA_HEIGHT = 1` 放行）。
   - 若表现为**拉得极远（球体级）**：说明换算输入异常，例如 `getCurrentViewState()` 返回 null 时回落到 `z=6000000`（6000 km），或 Precision 校正环的实测值偏差导致 `correctedH = curH × (G_target / G_measured)` 被放大。
2. **`getValidCoordinateParams()` 的 `z: 17` 兜底仍是隐患**：z 被判定非法时硬编码回落 17（街道级），会让「参数非法」静默表现为「跳到街道」。建议改为不注入 z（沿用当前视野），但会改变现有分享链接行为，需产品确认。
3. **首屏 `writeUrl:false` 分支无语义校验**：任何非本应用生成的 URL（手改、旧链接）只要 `view=cesium` 就会被按米制解读。建议后续在 `parseCameraStateFromUrl` 增加判据（如 `view=cesium && !cv && z<=30` 视为缩放级别并换算），但该判据属启发式，需与 `cv` 写入策略一起评估。
4. **未做浏览器级复现**：见 §7.1，本次结论以日志证据 + 代码路径推导为准，不得视为已验收。

---

## 十、追加定位：首要原因是 URL 写回竞态（用户确认「贴得极近」后）

### 10.1 关键判据

用户确认现象为**街区级（贴得极近）**，即 Cesium 拿到的 `z` 是个位数到十几——正是 OL 缩放级别的取值范围。据此反查「谁会在 `view=cesium` 语境下写入缩放级别」。

### 10.2 竞态链路（代码可证）

`HomeView.setMapView()` 中，`is3DMode` 的置位在 `await ensureCesiumLoaded()` **之后**：

```js
if (writeUrl) await replaceMapView('cesium', { queryPatch });   // ① URL: view=cesium & z=<米制>
...
const loaded = await ensureCesiumLoaded();                       // ② 冷加载数秒
is3DMode.value = true;                                           // ③ 之后才置 3D 态
```

而 OL 的同步开关是 `:url-sync-enabled="!is3DMode"` —— 也就是说 **② 整个窗口内 OL 仍处于同步态**。OL 侧 `syncUrlFromMap()` → `buildQuery()` 会写出：

```js
{ lng, lat, z: formatZParam(zoom), l: ..., view: 'ol' }   // z 是缩放级别
```

于是时间线变成：

| 步骤 | URL 中的 z | 语义 |
|---|---|---|
| ① 切换写入 | 7,514,329 | 米制（正确） |
| ② 加载期间 OL moveend | **4** | OL 缩放级别（`view` 同时被改回 `ol`） |
| ③ Cesium 起来读 URL | 4 | **被当作 4 米相机高度 → 街区级** |

触发 OL moveend 的条件在首次进入时几乎必然满足：启动期 `applyDeferredUrlParams` 的 `flyToView` 带 **500ms 动画**，其收尾 moveend 正好落在冷加载窗口内；面板挂载引起的容器尺寸变化同样会触发。

### 10.3 为什么是「总是」而不是「偶尔」

一旦第 ③ 步以 4 米开机，`syncCameraViewToUrl` 会把该高度写回 URL（`view=cesium&z=4.00&cv=...`），形成**自我延续的污染 URL**：刷新后仍从 4 米恢复，表现为「每次进 3D 都不对」。这也解释了用户「第一次打开时总是有问题」的措辞。

### 10.4 修复

1. 新增 `isEngineSwitching` 标志：`setMapView` 进入即置 `true`，成功 / 失败两条返回路径都复位；
2. OL 同步开关改为 `:url-sync-enabled="!is3DMode && !isEngineSwitching"`，切换窗口内彻底冻结 OL 写回；
3. 用独立标志而非提前置 `is3DMode`：避免加载失败时残留 3D 态。

### 10.5 已污染 URL 的一次性恢复

历史污染链接形如 `...&view=cesium&z=4.00&cv=...`。修复后不会自动纠正（`cv` 存在，无法用启发式判定 z 语义）。恢复方式：进入 3D 后手动缩放到正常视野，URL 会随 moveEnd 重写为正确的米制高度；或直接删除 URL 中的 `z` 参数后重进。

### 10.6 未采纳的兜底

`MIN_CAMERA_HEIGHT = 1` 允许 4 米高度，偏宽松。可考虑把 Cesium 相机高度下限抬到 ~50 m 并拒绝更小值，从而让污染 URL 自动回落到默认视野。但这是**行为变更**（真实需要 20 m 视角的场景会被重置），未经产品确认不擅自实施，已记 TODO。

---

## 十一、追加定位二：换算输入取自「未稳定」的 OL 视图（用户假设验证通过）

用户提出「初始化时相关依赖还没就绪就加载 Cesium，导致读不到 URL 参数完成换算，之后再切换就正常」。逐条核对代码后，**该假设成立**，且是「视野过远」方向的成因（与 §十 的「过近」方向相反，两者并存）。

### 11.1 代码链路核对

1. `MapContainer` 启动分 Phase 1~6，URL 参数在 **Phase 5** 才由 `applyDeferredUrlParams()` 应用，且用 `flyToView({ duration: 500 })` —— **500ms 动画**；
2. `INITIAL_VIEW = { center: [114.302, 34.8146], zoom: 4 }`，即参数应用前 OL 的实时视图是**默认全国视野**；
3. `buildCesiumQueryPatchFromOl()` 的唯一输入是 `mapContainerRef.getCurrentViewState()`（实时视图）。Phase 5 之前调用它，读到的是 `zoom=4`；
4. 更隐蔽的一层：`applyDeferredUrlParams` 在**动画开始时**就调用 `markInitialRestoreApplied()` / `markParamsAsApplied()`，所以「恢复已标记完成」**不等于**「视图已到位」——动画中途读到的仍是插值 zoom。

### 11.2 偏差量化（真实代码实测）

以分享链接目标为城市级为例：

| 场景 | 换算输入 | 相机高度 | 与目标偏差 |
|---|---|---|---|
| 目标 zoom=9 | 修复前读到默认 zoom=4 | 7,514,323 m | **32 倍** |
| 目标 zoom=9 | 修复后读 URL `z=9` | 234,823 m | 正确 |
| 目标 zoom=12 | 修复前读到默认 zoom=4 | 7,514,323 m | **256 倍** |
| 目标 zoom=12 | 修复后读 URL `z=12` | 29,353 m | 正确 |
| 目标 zoom=9（动画半途） | 插值 zoom=6.5 | 1,328,358 m | 5.7 倍 |

这就是用户描述的「首次进入 3D 视野完全不对，之后再切换就正常」——**不是公式错，是喂给公式的输入是中间态**。

### 11.3 修复：以「视图已稳定」为换算前提

1. `MapContainer` 新增暴露 `isStartupViewSettled()`，同时要求：
   - `startupUrlRestoreGuard.hasPendingRestore() === false`（启动恢复已处理）；
   - `view.getAnimating()` 与 `view.getInteracting()` 均为 false（动画 / 交互已结束）。
2. `HomeView.buildCesiumQueryPatchFromOl()`：视图未稳定时**改用 URL 自带的 OL 语义参数**换算（`lng/lat/z`，`z` 即缩放级别），URL 是本次导航的权威输入，不依赖任何初始化时序；稳定后仍用实时视图（更贴合用户当前操作）。
3. 新增 `readOlViewFromUrl()`：只取 `zoom`、刻意不传 `resolution`，避免两路输入不自洽；`z` 缺失时与 `getValidCoordinateParams` 保持一致回落 17。

### 11.4 为什么不选择「等初始化完成再切换」

等待方案（轮询直到 settled）会把 3D 切换阻塞 0.5~3 秒，且超时后仍需兜底。而 URL 换算**本身就是精确解**——它正是 OL 即将飞向的目标，无需等待即可得到正确结果，故采用「改数据源」而非「加等待」。

### 11.5 与 §十 的关系

两种时序故障方向相反、成因不同，但触发条件同为「首次进入时 OL 尚未稳定」：

| 故障 | 方向 | 成因 | 修复 |
|---|---|---|---|
| §十 | 过近（4 m 级） | OL 在 Cesium 加载窗口内 moveend，用 `z=<缩放级别>` 覆盖米制 z | `isEngineSwitching` 冻结 OL 写回 |
| §十一 | 过远（7,514 km 级） | 换算输入取自未稳定的实时视图（默认 zoom 4 / 动画插值） | `isStartupViewSettled()` + URL 兜底 |

两者已同时关闭，覆盖首次进入的两种时序分支。

