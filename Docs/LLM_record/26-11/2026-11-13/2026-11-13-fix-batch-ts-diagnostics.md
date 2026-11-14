# 2026-11-13 批量修复 21 处 TS 类型诊断（js→ts 迁移遗留）

- **日期与时间**：2026-11-13 17:07（收尾）
- **任务等级**：L2（常规 Bug 修复，多文件）
- **关联规范**：`Docs/Force_command.md` §1 L2 流程 / §3 先文档后代码 / §5 版本号 / §7 DoD

---

## 1. 问题分析

### 核心症状
用户提交 21 条 IDE TypeScript 诊断，分布在 9 个 `.ts` 文件，集中在 4 类根因，均为近期全局 `js→ts` 改名后类型推断缺口（迁移 fallout）。

### 根本原因（逐类）
1. **函数签名缺类型 + 可选参未标 `?`**：`auth.ts` 的 `apiAuthRegister(arg1, password, avatarIndex = 0, …)` 与 `apiAuthSendCode(email, purpose, username)` 参数无注解，`username` 未标可选 → 调用点 TS2554。
2. **DTO 接口缺字段**：`ChatAgentConfigDeps` 与 `RoutingMethodDeps` 未声明 `message`，而工厂既解构 `message` 又下传到 routing / personal 方法 → 调用点 TS2353。
3. **`= {}` / `= []` 默认参数陷阱**：解构默认值使形参类型推断为 `{}` / `any[]`，访问其中属性报错（TS2339）；或工厂 option 默认值 `() => null` / `async () => ({})` 使形参推断为零参类型，2 参调用报 TS2554。
4. **`parseInt` 收到 number**：`tencentBuildingFetcher.ts:47` `parseInt((len/4)*3, 10)` 首参为 number。

### 受影响模块
认证链路（注册 / 发码）、Chat Agent 配置、天地图建筑白模抓取、图层树文件夹选择态、托管要素高亮、公交/驾车路线绘制。

### 候选方案对比
- 方案 A（采用）：针对每类根因做最小类型补全（接口补字段、参数补类型/可选标记、`= {}` 补显式类型、`parseInt` 改 `Math.floor`）。零运行时变化。
- 方案 B（否决）：给所有被调用方加 `as any` 强制压制。会掩盖真实类型契约，违背 `§3 类型零报错` 精神，且后续维护成本更高。
- 方案 C（否决）：为 `apiAuthRegister` 写双形态 overload。当前唯一调用方已用对象式，overload 增加复杂度且无收益。

---

## 2. 修改内容（逐条）

| 文件 | 修改 |
|---|---|
| `frontend/src/api/backend/auth.ts` | 新增 `AuthRegisterPayload` 接口；`apiAuthRegister` 收敛为 `apiAuthRegister(payload: AuthRegisterPayload)`（仅对象式单参，唯一调用方 `RegisterView.ts:509` 已用该形态）；`apiAuthSendCode(email: string, purpose: string, username?: string)` |
| `frontend/src/domains/common/chat/composables/useChatAgentConfig.ts` | `ChatAgentConfigDeps` 补 `message: any;` |
| `frontend/src/domains/common/chat/composables/agentConfig/routing.ts` | `RoutingMethodDeps` 补 `message: any;` |
| `frontend/src/domains/common/data-import/components/TencentBuildingPanel.ts` | `onExtentPicked` 形参补 `{ extent?: number[] }` |
| `frontend/src/domains/common/data-import/parsers/tdtBuildingFetcher.ts` | `fetchTdtBuildings` 补完整解构类型（`bbox: number[]` / `tk: string` / `signal?: AbortSignal` / `onProgress?`）；改为必填对象参数（调用方 `useTdtBuildingFetch.ts:79` 恒传全量对象） |
| `frontend/src/domains/common/data-import/parsers/tencentBuildingFetcher.ts` | `parseInt((text.length/4)*3, 10)` → `Math.floor((text.length/4)*3)` |
| `frontend/src/domains/common/layer-tree/actions/selectionManager.ts` | `resolveFolderSelectionState` 第二参类型扩为 `string[] | Set<string>`（body 已 `instanceof Set` 分支） |
| `frontend/src/domains/ol/layer/feature/useManagedFeatureHighlight.ts` | 工厂 option `findManagedFeature` 补类型 `(layerId: string, featureId: string) => any`；`clearAllHighlights(layerId?: string)` 标可选 |
| `frontend/src/domains/ol/routing/renderers/useRouteRendering.ts` | 工厂 options 全部补类型（`addManagedLayerRecord: (record) => any`、`ensureRouteBuilderApi: () => Promise<any>` 等），消除默认值导致的零参类型丢失 |

---

## 3. 修改原因
- 全局 `js→ts` 迁移后，原 JS 宽松调用在 TS 严格类型下暴露：默认参数类型丢失、接口字段缺失、可选参数未标注。
- 这些错误阻断 IDE 智能提示并掩盖真实类型契约，属高价值修复且零运行时风险。

## 4. 影响范围
- 认证（注册 / 验证码发送）、Chat 配置装配、天地图建筑抓取、TOC 文件夹选择态、托管要素高亮、路线绘制。
- 均为纯类型注解 / 签名收敛，无逻辑分支改动。

## 5. 解决方案
见「修改内容」表 + 「候选方案对比」。核心原则：**补全真实类型契约**而非 `as any` 压制。

## 6. 性能指标
未实测（纯类型变更，无算法/IO 变化）。

## 7. 测试方案

### Agent 已执行
- `npx tsc --noEmit` 全量执行，按本批 9 文件 + `agentConfig/*` 过滤：本批 21 处诊断 **0 残留**。
- 调用方兼容核对：`RegisterView.ts`（509/603/680/788）、`useTdtBuildingFetch.ts:79`、`MapContainer.vue:701/840` 传参形态与 new signature 一致。

### 待用户实机验证
- `npm run dev` 后走一遍：注册流程（L509 `apiAuthRegister`）、三种验证码发送（L603/680/788 `apiAuthSendCode`）、Chat 面板打开与模式切换（依赖 `message` 下传）、天地图建筑白模框选抓取（L291 / `fetchTdtBuildings`）、TOC 文件夹多选态（L196）、托管要素高亮与路线绘制（工厂 option 注入）。
- 预期：上述功能行为与此前一致（本次零运行时变化）。

## 8. 变更文件清单
- `frontend/src/api/backend/auth.ts` — 注册/发码接口签名补全
- `frontend/src/domains/common/chat/composables/useChatAgentConfig.ts` — `ChatAgentConfigDeps` 补 message
- `frontend/src/domains/common/chat/composables/agentConfig/routing.ts` — `RoutingMethodDeps` 补 message
- `frontend/src/domains/common/data-import/components/TencentBuildingPanel.ts` — `onExtentPicked` 形参类型
- `frontend/src/domains/common/data-import/parsers/tdtBuildingFetcher.ts` — `fetchTdtBuildings` 参数类型
- `frontend/src/domains/common/data-import/parsers/tencentBuildingFetcher.ts` — `parseInt` → `Math.floor`
- `frontend/src/domains/common/layer-tree/actions/selectionManager.ts` — `resolveFolderSelectionState` 第二参类型
- `frontend/src/domains/ol/layer/feature/useManagedFeatureHighlight.ts` — 工厂 option + `clearAllHighlights` 类型
- `frontend/src/domains/ol/routing/renderers/useRouteRendering.ts` — 工厂 options 类型
- `README.md`（3 处版本号）、`Docs/Guide/CHANGELOG.md`（条目）

## 9. 遗留与风险
- **范围外既有错误（按 §2.5 登记 TODO，不越权代改）**：
  - `auth.ts:140` — `auth_url` 不在 `AxiosResponse<any>` 类型；
  - `personalConfig.ts:32/112/113/115/151` — 空接口 `PersonalConfigMethodDeps` 缺 `message` 等字段、`AxiosResponse.data` 误用；
  - `selectionManager.ts:6`（`<Promise>` 缺 `void` 类型参）、`:139`（`applyRecursiveSelection` 的 `= {}` 陷阱，与本次无关的第二个函数）。
  以上均属并行会话全局 `js→ts` 迁移的活跃 WIP 噪音，与本批无因果关系。
- **版本号撞车风险**：侦查时磁盘为 V3.6.57（同日 Vue 组件重构任务先占）。本任务顺延为 V3.6.58；若收尾期间另有并行任务抢发 V3.6.58，按 §5 后完成者再顺延并备注。
- **全量 tsc 仍约 2200 处错误**：均为并行迁移 WIP，非本批引入；本批 9 文件已隔离验证为 0。
- **未实机运行**（沙盒无法跑 vite/uvicorn），测试方案「待用户实机验证」栏为必做项。

---

## 10. 交接块（同步输出）

### 🔁 交接块
- **本次版本**：V3.6.58（2026-11-13）
- **任务等级**：L2
- **一句话结论**：批量修复 21 处 js→ts 迁移遗留的 TS 类型诊断，覆盖 9 文件，纯类型补全零运行时变化
- **改动文件**：见「变更文件清单」（9 源文件 + README + CHANGELOG）
- **日志路径**：Docs/LLM_record/26-11/2026-11-13/2026-11-13-fix-batch-ts-diagnostics.md
- **门禁结果**：CheckStructureTree — 本批未增删文件，无新增漂移（既有漂移属并行迁移，见遗留）；CheckConfigRegistry — 本批未触碰配置 key，预期通过
- **待用户操作**：实机走查「待用户实机验证」清单；git 提交由用户本人执行
- **遗留与风险**：范围外 8 处既有错误登记 TODO；版本号撞车风险；全量 tsc 约 2200 处错误属并行迁移 WIP
- **下一步建议**：若继续推进，优先从 `Docs/TODO/bugfix-optimization-plan.md` 认领 `personalConfig.ts` 空接口与 `selectionManager.ts` 两处 `= {}` 陷阱的专项修复批次

### Commit message 格式
```
V3.6.58

summary:
批量修复 21 处 TS 类型诊断（js→ts 迁移遗留），覆盖 9 文件，纯类型补全零运行时变化

1、- auth.ts：apiAuthRegister 收敛为对象式单参并补 AuthRegisterPayload；apiAuthSendCode 的 username 标可选
2、- ChatAgentConfigDeps / RoutingMethodDeps 补 message 字段
3、- TencentBuildingPanel / tdtBuildingFetcher：= {} 默认参数补显式类型，fetchTdtBuildings 收敛为必填对象参数
4、- tencentBuildingFetcher：parseInt(number) 改 Math.floor；selectionManager：resolveFolderSelectionState 第二参扩为 string[]|Set<string>
5、- useManagedFeatureHighlight / useRouteRendering：工厂 option 默认值导致的零参类型丢失，补 option 参数类型
```
