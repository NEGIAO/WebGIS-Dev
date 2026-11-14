# 2026-11-13 全量修复 js→ts 迁移遗留的 tsc 类型错误（逐文件暂存）

- **日期与时间**：2026-11-13 17:45
- **任务等级**：L2（多文件 Bug 修复；无架构/依赖/配置变更）
- **关联规范**：`Docs/Force_command.md` §0 优先级 1 / §1 L2 / §3 文档先行 / §7 DoD
- **Git 写操作豁免说明**：§2.1 与 §7 默认禁止任何 Git 写操作。本次依据 **§0 优先级 1「用户在当前会话的明确指令」** 临时豁免，用户明确要求「修复完毕一个，加入到暂存区」。豁免范围严格限定为 `git add`（暂存）；**不执行 commit / push / reset / checkout / stash / 切分支等任何其他 Git 写操作**。

---

## 1. 问题分析

### 核心症状

`frontend/.tmp-tsc.txt` 为上一批次的历史诊断快照，已失效。重新执行 `frontend/node_modules/.bin/tsc --noEmit --pretty false` 得到权威基线：

- **146 条 `error TS*`**，分布在 **67 个 `.ts` 文件**（`frontend/tsconfig.json`：`strict: false`、`noImplicitAny: false`、`noEmit: true`）。
- 错误集中在最近这批 `*.js → *.ts` 直接改名、但函数签名与类型标注未同步补全的文件；另有少量错误位于调用方（由被改名文件的签名推断变化外溢）。
- 工作区状态：356 个文件已暂存（第一批改名），另有约 100 个 `.js` 文件在工作区删除、对应 `.ts` 文件尚未跟踪（第二批改名），以及若干已暂存文件存在未暂存的修补。

### 根本原因（逐类）

1. **默认参数推断陷阱（占比最高）**：`= {}` / `= []` / `= () => {}` 使形参被推断为 `{}`、`any[]` 或零参函数类型。JS 时代可任意取属性/传参，TS 下触发 `TS2339`（属性不存在于 `{}`）、`TS2554`（参数个数不符）、`TS2349`（表达式不可调用）。
2. **结构化参数缺可选标记**：解构参数（如 `{ lon, lat, tk, signal }`）未标 `?`，导致省略字段的调用点报 `TS2345` / `TS2739` / `TS2740` / `TS2741`。
3. **兜底类型 `Record<string, any>` 与具名契约不兼容**：工厂 option 或局部泛型被推断为 `Record<string, any>`，传给要求具名属性的函数时报 `TS2345` / `TS2739`。
4. **`Promise` 缺类型参数**：`new Promise(resolve => resolve())` 在无泛型时 `resolve` 需 1 个参数，报 `TS2794`。
5. **静态成员 / 类字段未声明**：`fromUrl`、`_isDestroyed`、`getCameraFocus`、`create` 等 JS 动态挂载成员在 TS 类上无声明，报 `TS2339` / `TS2551`。
6. **DOM / 第三方库类型不匹配**：`EventTarget.files`、`Navigator.connection`、`window.dat`、`Worker postMessage` transfer 位置、`ol/PluggableMap` 的 `State`、`ProjectionLike` 联合类型等，报 `TS2339` / `TS2769`。
7. **真实逻辑类型缺陷**：`TS2367` 不可能成立的 locale 比较、`TS2362/2363` 算术操作数类型、`TS2538` 用 `unknown` 作索引、`TS2353` 对象字面量多余属性。

### 受影响模块

前端全域：Cesium 三维（运行时/导航/数据导入/绘制/地形/模块特效/厂商导航控件）、OpenLayers 二维（绘图/量测/底图/栅格导入/图层样式/启动调度/搜索）、公共域（认证/聊天/命令总线/数据导入解析/图层树/工具函数/用户统计）、API 包装层。

### 候选方案对比

| 方案 | 描述 | 结论 |
|---|---|---|
| A（采用） | 按真实契约做最小类型补全：补接口/类型别名、参数标 `?`、`Promise<void>`、声明类字段、DOM 类型收窄、修正真实的逻辑类型缺陷 | 零运行时行为变化，保留 IDE 智能提示，符合 §3「类型零报错」 |
| B（否决） | 在每个报错点加 `as any` / `@ts-ignore` 压制 | 掩盖真实契约，违背上一批次已确立的「补全真实类型而非压制」原则，且本次 146 处会形成长期债务 |
| C（否决） | 全局改 `tsconfig.json` 放宽（关闭 `strict` 相关检查 / 改 `include`） | 会连带关闭整个项目的类型检查，属于降级而非修复 |

### 选定方案与理由

采用方案 A。每条错误先读实际代码与调用方，确认真实参数形态后再标注类型；**禁止凭印象臆造 API 签名**（§2 第 6 条）。修复顺序按 `tsc` 输出的文件路径字典序，**一个文件一个文件来**：修完即跑类型检查确认该文件 0 报错，随即 `git add` 该文件（含其改名配对的 `.js` 删除），再进入下一个文件。

---

## 2. 修改内容

本次由本会话实际写入的代码修复（每处均为最小类型补全，零运行时逻辑改动）：

| 文件 | 修复 |
|---|---|
| `frontend/src/api/geocoding.ts` | 把 JSDoc `@typedef` 升级为 `export interface TiandituReverseGeocodeParams`，`lon/lat/tk` 必填、`ver/type/timeout/signal` 可选；`reverseGeocodeTianditu` 形参标注该接口，消除 `TS2345`（调用方合法省略 `signal`） |
| `frontend/src/api/backend/location.ts` | `apiLocationReverse` 的 `config` 补回 `Record<string, any>` 标注，使 `config.signal` 可写（消除 `TS2339`） |
| `frontend/src/domains/cesium/composables/core/useCesiumNavigation.ts` | 内嵌 vendor 为 JS 风格构造函数（内部 `initialize.apply(this, arguments)`），TS 只推断出单参；按真实契约声明 `NavigationCtor` 的双参构造签名，消除 `TS2554` |
| `frontend/src/domains/cesium/composables/dataImport/loaders/geotiffLoader.ts` | ① `renderSingleBandToImageData` 第 5 参 `range` 运行时可选，显式传 `undefined`；② `new Promise` 补 `Promise<Blob>` 泛型，消除 `TS2554` / `TS2345` |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataOpsHandlers.ts` | `e.target` 收窄为 `HTMLInputElement \| null` 后读 `files`（`TS2339`） |
| `frontend/src/domains/cesium/modules/player-controller/usePlayerController.ts` | 引入 `PlayerModelOptions`，把合并配置的 `Record<string, any>` 改为具体契约类型，保留 `url/scale/idleAnim/...` 必填字段（`TS2740`） |
| `frontend/src/domains/cesium/providers/terrain/decodeWorkerPool.ts` | 新增 `PendingDecode` 接口并把 `_pending` 标为 `Map<number, PendingDecode>`，消除 `Array.from(values())` 推断为 `unknown` 导致的 `TS2339` |
| `frontend/src/domains/cesium/providers/terrain/geoTerrainDecode.worker.ts` | 声明局部 `workerScope` 契约（`postMessage(message, transfer?: Transferable[])`），修正 DOM lib 把 `self` 推断为 `Window` 的 `TS2769` |
| `frontend/src/domains/cesium/providers/terrain/lercDecode.worker.ts` | 同上 |

**并行会话协同说明**：本仓库存在已知的并行 AI 会话（见 V3.6.55 日志）。任务期间另一会话持续写盘并修复同一批错误，且用户于 17:42:33 `pull`、17:46:06 提交 `a`（362 文件）、17:55:25 提交 `b`（11 文件）。因此错误基线是动态值：本会话首次快照 146 错误 / 67 文件，随后 104 → 57 → 44 → 25 → 19 → 16 → 6 → 4 → 1 → 0。为避免互相覆盖，本会话每个文件均「重新读取磁盘 → 精确字符串匹配编辑（冲突时编辑直接失败而非覆盖）→ 全量 `tsc` 过滤该文件 0 错误 → 立即 `git add`」。其余错误由并行会话修复，本会话负责复核并逐个补暂存。

---

## 3. 修改原因

全局 `js→ts` 改名后，JS 的宽松调用与动态属性在 TS 的类型推断下暴露。这些错误阻断 IDE 智能提示、掩盖真实类型契约，并导致 `tsc --noEmit` 无法通过（§3 门禁「类型零报错」）。本次为纯类型注解 / 签名补全，无业务逻辑分支改动。

---

## 4. 影响范围

全部为前端类型层；不涉及后端、部署面、配置 key、UI 新增、场景数据加载路径，因此不触发移动端基线 / TOC 注册 / 配置登记相关门禁项。

---

## 5. 解决方案

见第 1 节方案 A 与「选定方案与理由」。执行门禁：`tsc --noEmit --pretty false`，以「目标文件 error 数 = 0」作为单文件完成判据；全部完成后以「全局 error 数 = 0」作为总完成判据。

---

## 6. 性能指标

未实测（纯类型变更，无算法 / IO 变化）。

---

## 7. 测试方案

### Agent 已执行

- 基线：全量 `tsc --noEmit --pretty false` → 146 errors / 67 files（见第 1 节；并行写盘导致为动态快照）。
- 逐文件：每个修复后立即跑全量 `tsc`，过滤目标文件 error 数为 0 才 `git add`。
- 收尾全量复核：`tsc --noEmit --pretty false` **exit 0 / 0 error**（18:00 复测仍为 0）。
- 逐文件暂存：`frontend/src/` 下剩余 **189 个文件**逐个 `git add`（含 40 组 `.js` 删除 + `.ts` 新增配对），其中 1 个因并行 git 进程占用 `index.lock` 失败，锁释放后已重试成功；最终 `git status --porcelain -- frontend/src` 中未暂存/未跟踪条目数 = **0**。
- 门禁：`python Scripts/CheckStructureTree.py` → 658 文档条目 / 658 磁盘文件 / 漏登记 0 / 幽灵条目 0 ✅；`python Scripts/CheckConfigRegistry.py` → B1–B4、F1–F3 全通过 ✅；`python Scripts/CheckDomainDeps.py frontend/src` → 跨域依赖 0 ✅；`python Scripts/CheckVueParadigm.py frontend/src` → 27 个范式化组件全部通过 ✅。
- **未执行**：`npm run dev` / `npm run build` / 浏览器实机回归（本次为静态类型修复，未做运行时验证，按 §2 第 7 条不谎报）。

### 待用户实机验证

- `npm run dev` 启动后回归以下入口：三维/二维切换、Cesium 导航控件、数据导入（GeoTIFF / KML / SHP）、绘图与量测、底图切换、POI 搜索、聊天 Agent、用户统计、URL 状态恢复。纯类型变更预期行为与此前一致。

---

## 8. 变更文件清单

- **本会话写入的 9 个代码文件**：`frontend/src/api/geocoding.ts`、`frontend/src/api/backend/location.ts`、`frontend/src/domains/cesium/composables/core/useCesiumNavigation.ts`、`frontend/src/domains/cesium/composables/dataImport/loaders/geotiffLoader.ts`、`frontend/src/domains/cesium/composables/dataImport/useCesiumDataOpsHandlers.ts`、`frontend/src/domains/cesium/modules/player-controller/usePlayerController.ts`、`frontend/src/domains/cesium/providers/terrain/decodeWorkerPool.ts`、`frontend/src/domains/cesium/providers/terrain/geoTerrainDecode.worker.ts`、`frontend/src/domains/cesium/providers/terrain/lercDecode.worker.ts`。
- **本会话逐个补暂存的其余 `frontend/src/` 文件**：189 个（含并行会话已修复的 `.ts` 与 40 组改名配对）。收尾时暂存区共 157 个文件（`git diff --cached --stat`：1166 insertions / 499 deletions），相对 HEAD=`af36945e`。
- **本会话新建文档**：`Docs/LLM_record/26-11/2026-11-13/2026-11-13-fix-js-ts-migration-tsc-errors.md`（本文件）。
- **未改动的仓库其他区域**：`Docs/Guide/CHANGELOG.md`、`Docs/Guide/frontend-structure.md`、`README.md`、`backend/app.py`、各类 `Scripts/*.py` / `frontend/.phase*.py` / `*.txt` / `nul` 等未暂存文件均保持原状（属并行会话 WIP 或临时产物，按 §2 第 5 条不越权处理）。

---

## 9. 遗留与风险

- **并行会话写盘**：任务全程存在另一会话持续修改同一批文件与用户多次提交；本会话已用「重新读盘 + 精确匹配编辑 + 每文件全量 `tsc` 复核」规避覆盖，但最终提交前的代码状态仍建议用户自行 `git diff --cached` 复核。
- **版本号 / CHANGELOG / 结构树本次未更新**：依据 §0 优先级 1，用户指令范围限定为「修复代码并逐个加入暂存区」；且 V3.6.59 已由并行 CORS 任务领取（README / CHANGELOG 存在其未暂存改动），本次若再升号会撞车。结构树门禁已实测 658/658 无漂移，无需同步。此为本次 L2 DoD 中未执行项，已显式说明。
- **未暂存的非代码文件**：文档（含本日志）、`backend/app.py`、临时脚本/日志、`nul` 仍为未暂存/未跟踪状态；是否纳入下次提交由用户决定。
- **运行时未验证**：仅执行静态类型检查与四个门禁脚本，未启动 dev server 或做浏览器回归（§2 第 7 条「禁止谎报验证」）。
- 类型修复以「保持 JS 时代运行时行为」为准绳；未擅自改动业务逻辑（§2 第 5 条）。
