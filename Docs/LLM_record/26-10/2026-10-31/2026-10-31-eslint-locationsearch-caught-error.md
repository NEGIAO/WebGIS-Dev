# ESLint 存量告警修复：错误链 cause + 无用赋值（locationSearch / client）

- **日期与时间**：2026-10-31 18:05
- **任务等级**：L2（跨 2 文件 22 处改动 + 需登记全库存量面；改动虽机械，但涉及错误对象语义与一处死逻辑，按「拿不准向上取一级」定级）
- **触发方式**：用户分两批贴出 IDE 中 `src/api/locationSearch.js`（20 条）与 `src/api/backend/client.js`（2 条）的 ESLint error

---

## 一、问题分析（阶段一产出）

### 1.1 核心症状

IDE（ESLint 扩展）报 error 级、阻断式告警：

| 文件 | `no-useless-assignment` | `preserve-caught-error` |
|---|:--:|:--:|
| `src/api/locationSearch.js` | 1（L59 `rawList`） | 19 |
| `src/api/backend/client.js` | 2（L162 `message`、L225 `isQuotaExceeded`） | 0 |

### 1.2 根本原因

**不是代码新写坏了，而是 ESLint 升级把两条规则带进了 `js.configs.recommended`。**

- `eslint.config.js` 第 22 行使用 `js.configs.recommended`；
- 实测当前 `@eslint/js` 的 recommended 中：`preserve-caught-error = error`、`no-useless-assignment = error`；
- 本地 ESLint 版本 **10.13.0**；两条规则在 ESLint 9 后期才进入 recommended，**存量代码写于规则存在之前**，升级后集体亮红。

全量扫描基线（`eslint src`，按规则聚合）：**55 条 / 26 文件**

| 规则 | 基线 | 本次修复 | 剩余 |
|---|:--:|:--:|:--:|
| `no-useless-assignment` | 28 | 3 | 25 |
| `preserve-caught-error` | 24 | 19 | 5 |
| `@typescript-eslint/no-unused-vars` | 1 | 0 | 1 |
| `no-extra-boolean-cast` | 1 | 0 | 1 |
| `vue/no-v-html` | 1 | 0 | 1 |
| **合计** | **55** | **22** | **33 / 24 文件** |

### 1.3 受影响模块

- `frontend/src/api/locationSearch.js`（地名/POI 搜索：天地图 + Nominatim + 高德三路）
- `frontend/src/api/backend/client.js`（后端 API 统一响应/错误拦截器）
- 调用方契约不变：`searchWith*` 仍返回 `{ items, total }`；拦截器仍 reject 带 `status` / `statusText` / `detailCode` / `originalError` 的 `apiError`

### 1.4 候选方案对比

| 方案 | 做法 | 结论 |
|---|---|---|
| **A** | 在 `eslint.config.js` 关闭这两条规则 | ❌ 否决。`preserve-caught-error` 命中的是真实可维护性问题——包装错误时丢掉原始错误，线上排障只看到"高德搜索失败"却拿不到底层 stack / `response`；关规则等于把问题藏起来 |
| **B** | 逐处加 `// eslint-disable-next-line` | ❌ 否决。22 条注释污染业务代码，且会被后续新增代码照抄 |
| **C** | 真修：包装错误补 `{ cause: error }`；无用初始值改为「声明不赋值」 | ✅ **选定**。改动最小、语义最正确：message 文案一字不改（不影响既有 toast），仅让错误链可追溯 |

### 1.5 关键约束

`new Error(msg, { cause })` 为 ES2022 特性。项目未在 `vite.config.js` 指定 `build.target`（走 Vite 默认），且该写法在旧运行时只是**忽略第二参数**、不产生语法错误，故无兼容性风险。

---

## 二、修改内容

### 2.1 `api/locationSearch.js`（20 处）

**① 无用赋值（1 处）**：`parseTiandituResponse()` 的 `let rawList = [];` → `let rawList;`。其下 7 个分支全部赋值、末尾 `else { return []; }` 直接返回，初始 `[]` 在任何路径都读不到。

**② 错误链（19 处）**：三个 `catch` 块内的 `throw new Error(...)` 补 `{ cause: error }`：

- `searchWithTianditu`：6 处（Token 缺失 / 502-504 / 4xx / 无法连接 / 超时 / 兜底）
- `searchWithNominatim`：5 处（502-504 / 4xx / 无法连接 / 超时 / 兜底）
- `searchWithAmap`：8 处（配额耗尽 / 401 / 403 / 503 / 4xx / 无法连接 / 超时 / 兜底）

**未改动的两处重抛**（规则不要求且语义正确）：`if (error?.name === 'AbortError') throw error;`、`if (errorMsg.includes('错误码')) throw error;`。

### 2.2 `api/backend/client.js`（2 处 + 1 处死逻辑清理）

**① L162 无用赋值**：`let message = '请求失败，请稍后重试';` → `let message;`。依据：`error.response` / `error.request` / 其他 三条分支**必然赋值**后才在 `new Error(message)` / `toastMsg` 处读取。

**② L225 无用赋值（连带死逻辑）**：`if (status === 429) { isQuotaExceeded = true; ... }` 分支在下方立即 `return Promise.reject(apiError)`，该赋值**无任何读取点**——`isQuotaExceeded` 在 L255 的 `if (!isQuotaExceeded)` 与 L268 的 `apiError.isQuotaExceeded = isQuotaExceeded` 处恒为 `false`。处理：

- 删除 `isQuotaExceeded = true;`
- 删除 `let isQuotaExceeded = false;` 声明（否则会触发 `prefer-const`：声明后永不重新赋值）
- 拆掉恒真的 `if (!isQuotaExceeded) { ... }` 包裹（去一层缩进，行为不变）
- `apiError.isQuotaExceeded = isQuotaExceeded` → `= false`，保持该属性存在（调用方 `searchWithAmap` 有 `if (error.isQuotaExceeded)` 判断，不能删字段）

> 该清理属同一规则族的直接后果（删了赋值就必然触发 `prefer-const`），非功能扩张；429 分支的 `apiError.isQuotaExceeded = true` 原样保留，配额语义不变。

---

## 三、修改原因

1. 用户 IDE 报红，error 级告警阻断开发与提交前自检。
2. `cause` 链是真实收益：三路搜索都做「原始错误 → 业务文案」二次包装，此前包装后原始 `status` / `response` / stack 全丢，线上只能看到中文提示。
3. `client.js` 的 `isQuotaExceeded` 是**死逻辑**：429 提前返回后该标记永远为 false，保留会让后来者误以为「非 429 分支也可能带配额标记」。
4. 顺带取准了全库存量面（55 条 / 26 文件），为后续统一清理留基线。

---

## 四、影响范围

| 面 | 影响 |
|---|---|
| 搜索链路（天地图 / Nominatim / 高德） | 错误 **message 文案与抛出时机完全不变**；仅 `Error.cause` 多挂原始错误 |
| 后端 API 拦截器 | 错误对象字段集合不变（`status` / `statusText` / `detailCode` / `isQuotaExceeded` / `originalError`），`isQuotaExceeded` 恒 false 的行为与修复前**一致** |
| 调用方（`LocationSearch.vue`、`GISCommander`、`AgentExecutor`、各业务页） | 无影响：只读 `message` / `items` / `total` / `isQuotaExceeded` |
| 后端 / 配置 / 版本注入 | 无 |

---

## 五、解决方案与实施步骤

1. 全量 `eslint src` 取基线，按规则聚合定位真因（确认规则来自 recommended，而非新写代码）。
2. `locationSearch.js` 逐个 `catch` 块**整体替换**（而非逐行 Edit），保证 19 处 `cause` 无遗漏、message 一字不改。
3. `client.js` 三处联动修改（删赋值 → 删声明 → 拆恒真分支），避免只删赋值导致 `prefer-const` 新报错。
4. `node --check` + 单文件 `eslint` 复核；`tsc --noEmit`；`vite build`。
5. 剩余 33 条 / 24 文件登记 `Docs/TODO/bugfix-optimization-plan.md`（按 §2.5 只记不改）。

---

## 六、性能指标

非性能任务。`cause` 仅在错误路径构造；`client.js` 去掉一层 `if` 包裹，错误路径指令数略减，无可测差异。

---

## 七、测试方案

### Agent 已执行

| 项 | 结果 |
|---|---|
| `node --check`（两个文件） | 通过 |
| `eslint src/api/locationSearch.js` | 通过（20 → 0） |
| `eslint src/api/backend/client.js` | 通过（2 → 0） |
| `eslint src`（全量复核） | 两文件 0 条；全库剩余 **33 条 / 24 文件**（基线 55 / 26，本次修 22） |
| `npx tsc --noEmit` | 0 报错（两文件均为 `.js`，不参与 TS 检查） |
| `npx vite build` | 成功：`✓ built in 18.56s`，exit 0（仅既有 chunk 体积告警） |

> **构建方式说明**：沙盒对 `frontend/dist` 的 251 个文件执行 `rmSync` 被 safe-delete 守卫拦截（阈值 50/轮），首次 `vite build` 在 `prepareOutDir` 阶段即失败（**与代码改动无关**）。改用 `--outDir <临时目录> --emptyOutDir false` 完成编译验证；用户本机 `npm run build` 不受此限制。

### 待用户实机验证

1. 打开 IDE，确认两个文件不再报红。
2. 断开后端（或指向不存在的后端地址）后在地点搜索框输入关键词，确认 toast 文案与改动前**完全一致**（如「国际地名服务暂不可用 [502 …]，请稍后重试」）。
3. DevTools Console 捕获该错误对象，确认 `error.cause` 存在且 `cause.status` / `cause.originalError` 可读。
4. 触发一次 429（配额用完）场景，确认仍弹出配额提示且 `apiError.isQuotaExceeded === true`；触发一次普通 4xx，确认 `apiError.isQuotaExceeded === false` 且 toast 正常。

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/api/locationSearch.js` | 19 处 `throw new Error(...)` 补 `{ cause: error }`；`parseTiandituResponse` 去掉无用初始值 |
| `frontend/src/api/backend/client.js` | `let message` 去预置文案；删除恒为 false 的 `isQuotaExceeded` 标记与恒真分支包裹，`apiError.isQuotaExceeded` 固定为 false |
| `Docs/TODO/bugfix-optimization-plan.md` | 追加「ESLint 存量告警（ESLint 10 recommended）」条目：24 文件 33 条待清理 |
| `README.md` | 版本号三处 → V3.6.38 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.6.38 条目 |
| `Docs/LLM_record/26-10/2026-10-31/2026-10-31-eslint-locationsearch-caught-error.md` | 本日志 |

> 无文件增删（不涉及结构树同步），无新增配置 key。

---

## 九、遗留与风险

1. **存量 33 条 / 24 文件未修**：本次只修用户报出的两个文件（按 §2.5 范围纪律）。其中 `preserve-caught-error` 剩 5 条，需逐处判断「是否应保留原始错误」——少数场景是有意丢弃（如对外脱敏），应加注释说明而非硬加 `cause`。全部清单已登记 TODO。
2. **规则来源会持续复发**：ESLint 10 的 recommended 后续仍会加规则，"升级即报红"模式会重演。建议评估「锁定 ESLint 大版本 + 升级时跑一次全量清理」的节奏。
3. **未做实机错误链验证**：`cause` 是否真的挂在最终错误上、429 与非 429 的 `isQuotaExceeded` 取值，均需用户按 §七 第 3、4 步在浏览器确认（本次仅静态 + 构建验证）。
4. **并行编辑冲突（重要）**：本次工作期间检测到同一工作区有并行会话在改 `client.js` / `locationSearch.js` / `GISCommander.js` 等文件。本次改动均以**最小上下文 Edit** 方式落地，未回退他人改动；但 `git status` 显示这两个文件同时存在他方未暂存改动，提交前请自行 `git diff` 复核归属。
