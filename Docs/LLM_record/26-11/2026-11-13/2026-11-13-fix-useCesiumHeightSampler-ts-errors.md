# 2026-11-13 修复 useCesiumHeightSampler 13 处 TS 类型错误（IDE 诊断）

## 日期与时间
2026-11-13 16:21 开工，16:34 收尾

## 任务等级
L2（常规：Bug 修复；单文件类型注解修复，无新增/删除文件，结构树无需改动）

## 问题分析

### 核心症状
用户提交 VS Code Problems 面板快照：`frontend/src/domains/cesium/composables/terrain/useCesiumHeightSampler.ts` 共 13 处 TS2339（owner: `typescript`，severity 8）：
- L88 `data`、L89 `timestamp`、L98 `timestamp` —— `Property '…' does not exist on type 'CacheEntry'`
- L218 `maxRetries` / `retryDelay`、L257 `useCache`、L263 `terrainDetailLevel`、L322 `useCache` / `skipCached`、L356/357/363 `onProgress`、L390 `sampleCount` —— `Property '…' does not exist on type '{}'`

### 根本原因
该文件是同日 js→ts 批量迁移的产物（git 状态：`useCesiumHeightSampler.js` 已删、`.ts` 新增未跟踪），迁移后未补 TS 类型注解：
1. **类字段未显式声明**：`CacheEntry` 仅在 constructor 中赋值 `this.data` / `this.timestamp`，无字段声明。strict 模式类检查（IDE 侧生效）下访问实例属性报 TS2339。
2. **默认参数无类型注解**：`pickCartographicWithRetry` / `sampleHeight` / `sampleHeightMostDetailed` / `queryHeightRange` 四个函数的 `options = {}` 推断为空对象字面量类型，解构/访问属性报 TS2339。与 V3.6.48（LayerControlPanel）、V3.6.49（useLayerControlHandlers）、V3.6.50（AdminControlPanel）已修问题完全同源。

### CLI 与 IDE 诊断差异核查（如实记录）
- `npx tsc --noEmit --pretty false`（TS **6.0.3**，项目 tsconfig `strict: false` + `noImplicitAny: false`）开工基线对该文件 **0 报错**——13 处诊断仅在 IDE 侧出现。
- 但诊断与磁盘代码**逐行吻合**（行号、列号、属性名全部对上，非 V3.6.47 记录过的旧快照漂移），且与 V3.6.48/50/52 三个先例的诊断模式一致，属于真实类型缺陷（宽松配置下被 `any` 兜底掩盖）。修复注解对两种引擎均为正向改进、零运行时影响，故照修。
- 差异根源推测为 IDE tsserver 与 CLI 的 TS 引擎/配置生效差异（参考 TODO 中已登记的「未装 `vue-tsc`、tsc 不解析 SFC 模板、IDE-only 诊断」门禁缺口），本次不深挖。

### 受影响模块
`domains/cesium/composables/terrain/useCesiumHeightSampler.ts`（Cesium 高度采样增强器：单点/批量采样、屏幕拾取、缓存、进度回调）。

### 方案对比
| 方案 | 说明 | 结论 |
|---|---|---|
| A. 全 `any` 注解 | `options: any = {}` 快速消错 | 掩盖类型链，与「类型零报错」精神不符 |
| B. 文件内 interface + 强类型 | 定义 `PlainCartographic` + 4 个 Options 接口 | **选定**。与 V3.6.49 先例（补 Payload 接口）一致，类型链完整闭合 |
| C. 内联匿名类型 | 每处签名直接写 `{ maxRetries?: number; … }` | 冗长且不可复用 |

## 修改内容
`frontend/src/domains/cesium/composables/terrain/useCesiumHeightSampler.ts`：
1. 新增 5 个文件内 interface：`PlainCartographic`（度制纯数据坐标）、`PickRetryOptions`、`SampleHeightOptions`、`SampleMostDetailedOptions`、`HeightRangeOptions`。
2. `CacheEntry`：显式声明字段 `data: PlainCartographic` / `timestamp: number`，constructor 参数补类型（消除 L88/89/98）。
3. 四个函数签名补 options 注解（消除 L218/257/263/322/356/357/363/390）：
   - `pickCartographicWithRetry(screenPosition, options: PickRetryOptions = {})`
   - `sampleHeight(position, options: SampleHeightOptions = {})`
   - `sampleHeightMostDetailed(positions, options: SampleMostDetailedOptions = {})`
   - `queryHeightRange(rectangle, options: HeightRangeOptions = {})`
4. 类型链连带闭合：`cartoToPlain` 返回 `PlainCartographic`、`getFromCache` 返回 `PlainCartographic | null`、`setCache` 参数 `PlainCartographic`。
5. 文件头注释标题 `useCesiumHeightSampler.js` → `.ts`（迁移遗留文案修正，1 行）。

**并行写入合并说明**：实施中途检测到**并行会话正在同文件写入 `any` 方案**（CacheEntry 字段 `data: any; timestamp: any;` + 四个 options `options: any = {}`，即 TODO 中登记过的外部写盘现象）。合并决策：保留并行会话的修改结构，将其 `any` 升级为具名 interface；`screenPosition` / `position` / `rectangle` 等非错误项的 `any` 尊重现状保留不动，缩小冲突面。最终文件以本次强类型版本为准。

## 修改原因
消除该文件 13 处 IDE 类型诊断；js→ts 迁移文件补齐类型注解，闭合采样结果数据链（`cartoToPlain` → `CacheEntry` → `getFromCache`）的静态类型，提升 IDE 智能提示与后续维护安全性。

## 影响范围
- 仅 `useCesiumHeightSampler.ts` 单文件，纯类型注解 + 注释，**零运行时逻辑变化**。
- 消费方（地形分析等场景）调用签名不变。

## 解决方案
见「方案对比」选定方案 B。实施顺序：侦查（Force_command、git 状态、结构树、同类日志惯例）→ tsc 基线 → 分析 → 实施 → tsc 复验 → TODO 登记 → 日志 → 版本号 → CHANGELOG → 门禁。

## 性能指标
不适用（纯类型注解，无运行时影响，未实测）。

## 测试方案
| 栏目 | 内容 |
|---|---|
| **Agent 已执行** | ① 开工基线 `npx tsc --noEmit --pretty false`（exit 2，全项目 24 处错误全部位于范围外的 `AerialPerspectiveEffect.ts`，目标文件 0 处——CLI 视角）；② 修复后复跑：目标文件 **0 错误**，全项目剩余 5 处均在范围外（`tdtBuildingTopology.ts` ×4 TS2363、`useBasemapSelectionWatcher.ts` ×1 TS2339，属并行会话活跃写入区，已按 §2.5 登记 TODO）；③ `grep` 逐项验证 5 个 interface、CacheEntry 强类型、4 处 options 签名落盘。 |
| **待用户实机验证** | ① IDE 中打开 `useCesiumHeightSampler.ts`（必要时重启 TS Server / 重开文件），确认 13 处 TS2339 消失且无新诊断；② 若当前打开过该文件，先保存全部缓冲区再对照（V3.6.47/52 两次记录的旧快照问题）。 |

## 变更文件清单
| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/terrain/useCesiumHeightSampler.ts` | 补 5 个 interface + CacheEntry 字段声明 + 4 处 options 签名注解 + 类型链闭合（含与并行会话 any 方案的合并） |
| `Docs/TODO/bugfix-optimization-plan.md` | 按 §2.5 登记范围外 5 处错误快照与 `AerialPerspectiveEffect.ts` 被并行会话清零的观察 |
| `README.md` | 版本号三处更新至 V3.6.55 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.6.53 条目 |
| `Docs/LLM_record/26-11/2026-11-13/2026-11-13-fix-useCesiumHeightSampler-ts-errors.md` | 本日志 |

## 遗留与风险
1. **IDE/CLI 诊断差异根源未深挖**：CLI（TS 6.0.3 宽松配置）对 13 处原始诊断 0 报错。相关门禁缺口（未装 `vue-tsc` 等）已在 TODO 既有条目跟踪，本次未重复登记。
2. **多会话并行写入风险持续**：本任务实施中途实测同文件被并行会话改写一次；版本号两次撞车顺延——开工侦查时为 V3.6.51，收尾复核时已被并行会话推进至 V3.6.52，本任务拟 V3.6.53 后发现并行会话抢发其 V3.6.53（useBasemapSelectionWatcher），顺延为 V3.6.54 时再次与并行会话的顺延撞号，最终按 §5「后完成者顺延」定 **V3.6.55**。后续会话写 README / CHANGELOG 前务必复核当前版本号。
3. **范围外 5 处错误**（tdtBuildingTopology / useBasemapSelectionWatcher）为并行会话活跃区时点快照，已登记 TODO，未顺手修改。
