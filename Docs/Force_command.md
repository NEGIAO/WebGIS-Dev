# 🛠️ WebGIS Agent 强制执行规范（Force Command）

> **本文件是 AI Agent 在本仓库工作的最高行为准则。** 任何会话开始工作前必须完整读取本文件。
>
> **定位**：规定 Agent 能做什么、不能做什么、必须交付什么。不重复技术细节——技术约定见 [`Guide/dev-conventions.md`](Guide/dev-conventions.md)，项目认知见 [`Guide/handover.md`](Guide/handover.md)。
>
> **适用范围**：`frontend/`、`backend/`、`Docs/`、根级配置文件的一切增删改。
>
> **Cesium API**：相关代码参考 skill `cesium-skills`；不确定的 API 禁止臆造，以 [Cesium 官方文档](https://cesium.com/learn/cesiumjs/ref-doc/) 为准。
> **cesium skill**："C:\Users\NEGIAO\AppData\Roaming\Code\agentPlugins\vscode-synced-customization-agent-host-copilotcli\215423188\skills\cesium-skills"
涉及到cesium的功能，可以查看这个技能包，里面有很多cesium的使用示例和封装好的函数，可以直接调用。

---

## 0. 冲突裁决与优先级

当多个来源的指令冲突时，按以下优先级执行，**且必须显式告知用户你依据了哪一条**：

| 优先级 | 来源 | 说明 |
|:---:|---|---|
| 1 | **用户在当前会话的明确指令** | 可临时豁免本规范任意条款，但豁免仅对本次任务生效 |
| 2 | **本文件（Force_command.md）** | 流程与边界的唯一权威 |
| 3 | `Guide/dev-conventions.md` / `Guide/handover.md` / 架构文档 | 技术实现约定 |
| 4 | 代码现状与历史惯例 | 最低优先级，历史不合规写法不构成新代码的理由 |

**发现规范之间互相矛盾、或规范与代码现状不符时**：立即停止实施，向用户报告矛盾点并给出修正建议，**禁止自行选择一种解释继续施工**。

---

## 0.5 项目速览（单文件交付时的心智模型）

> 本节存在的唯一理由：让只拿到本文件的 Agent 在 30 秒内知道「这是什么项目」，而不必先读 README。
> 详细架构见 [`Docs/Architecture/`](Architecture/)，接手导航见 [`Guide/handover.md`](Guide/handover.md)。

**是什么**：**NEGIAO's WebGIS** —— 前后端分离的**双引擎**三维地理信息平台。同一份业务数据可在 **OpenLayers 2D** 与 **Cesium 3D** 之间切换与联动，含多格式数据导入、空间分析、路线规划、AI 对话式地图操作、账号与配额体系。

| 层 | 选型 | 位置 |
|---|---|---|
| 前端框架 | Vue 3.5 + Vite + Pinia + Vue Router | `frontend/src/` |
| 二维引擎 | OpenLayers 10 | `frontend/src/domains/ol/` |
| 三维引擎 | Cesium 1.146 + Three.js（特效辅助） | `frontend/src/domains/cesium/` |
| 双引擎共享 | 图层树 / 数据导入 / 用户 / 聊天 | `frontend/src/domains/common/` |
| 后端 | FastAPI（Python 3.12）+ SQLite 缓存 + SSE | `backend/`（`api` / `core` / `services` / `config`） |
| 部署 | 前端 GitHub Pages；后端 HF Spaces（Docker） | `deploy/`、`.github/workflows/` |

**动手前必须建立的三个概念**：

1. **引擎域（domain）是第一分层维度**，不是 `components` / `views`。写代码前先判定：这是 OL 专有、Cesium 专有，还是两者共用？共用逻辑一律落 `domains/common/`。
2. **场景对象必须进 TOC**。任何能加进地图的东西都要登记进 `loadedDataSources`（Cesium）或 layer-tree（OL），否则用户看不见、管不了 —— 见 §3。
3. **SSOT 是硬约束**。版本号只在根 `README.md`、目录树只在 `*-structure.md`、配置 key 只在 `.env.example` + `catalog.py` —— 见 §4。

**必读四件套（按序）**：

| 文档 | 解决什么 |
|---|---|
| 本文件 | 边界、约束、SOP、DoD、交接块 |
| [`Guide/handover.md`](Guide/handover.md) | 项目认知、历史决策、踩坑记录 |
| [`Guide/dev-conventions.md`](Guide/dev-conventions.md) | 分层边界、技术约定、门禁 |
| [`Guide/project-structure.md`](Guide/project-structure.md) | 目录树唯一权威 |

---

## 1. 任务分级（先定级，再定流程）

不是所有改动都需要全套仪式。**每次任务开始时，Agent 必须先声明本次任务等级**，用户可当场改判。

| 级别 | 判定标准 | 必做项 |
|:---:|---|---|
| **L0 咨询** | 只读：答疑、代码讲解、方案讨论、检索。**零文件改动** | 无需日志、无需版本号 |
| **L1 微改** | 单文件 ≤ 20 行；typo / 注释 / 文案 / 常量值；不改函数签名、不新增文件 | 无需独立日志与版本号；但**必须在会话结尾的交接块中列出改动**，并追加到当日已有日志的「零散修补」小节 |
| **L2 常规**（默认） | 功能开发、Bug 修复、重构、新增/删除文件 | **全流程**：分析 → 文档 → 实施 → 日志 → 版本号 → 结构树 → 门禁 |
| **L3 架构级** | 跨模块重构、目录调整、依赖增删、配置架构变动、数据库结构变更 | L2 全部 + **实施前必须先提交方案文档并取得用户明确批准**，禁止「边想边改」 |

> 拿不准等级时**向上取一级**。把 L2 当 L1 处理属于违规。

> **机器人 PR 例外**：依赖机器人（Dependabot）PR 的**查看与合并**不计入 L0–L3 代码任务（不升版本、不写日志），规则见 [§12](#12-线上机器人-pr-处置本地-github-cli)；仅当需为升级**改代码适配**时，适配部分按 L2 计级并走全流程。

---

## 2. 硬边界（禁止清单）

以下行为**任何情况下都不得自行执行**，触碰即视为违规，必须停下来请求用户决策：

1. **禁止 Git 写操作** —— `git commit` / `push` / `stash` / `reset` / `checkout -- ` / `rebase` / 改分支。版本控制决策权 100% 归用户。Agent 只负责把改动准备好并说明清楚。**PR 合并同样属禁止范围**（含 `gh pr merge` 与网页端合并）；唯一例外是 [§12.5](#125-授权与执行) 的 Dependabot PR 逐次显式授权，授权不跨会话、不跨 PR 继承。
2. **禁止在 `/Docs` 之外新建说明类文档** —— 不得在根目录或任意子目录新建临时 README、SUMMARY、NOTES、`*_说明.md`。所有说明统一进 `Docs/LLM_record/` 日志或 `Docs/Guide/`。
3. **密钥与部署面分级** —— **L3 绝密**（`SUPER_USER`、OAuth secret、SMTP 密码、HF Secrets、生产私钥）禁止写入仓库、禁止在会话中扩散明文。**L1 非密** `deploy/.env`（公开 URL、超时、非密默认值）和 `deploy/.env.local`（本地开发覆盖值，git 追踪）可改，但必须与 `deploy/.env.example` + `backend/config/catalog.py` 同步，并跑 `Scripts/CheckConfigRegistry.py`。`.github/workflows/`、Dockerfile、HF Space 部署清单仍须谨慎：能只提建议则先提建议；确需改动须在日志写明动机。`.env.example` 属登记表，按第 5 节流程可改。
4. **禁止删除或重写非本次任务范围的文件** —— 包括历史日志、他人代码、注释掉的备用逻辑。确需清理时先列清单请求批准。
5. **禁止越权扩大范围** —— 修 A Bug 时发现 B 问题：**记录到 `Docs/TODO/bugfix-optimization-plan.md` 并在交接块中提示**，不得顺手改。
6. **禁止臆造事实** —— 不得凭印象编写 API 签名、字段名、配置 key、文件路径。**必须先读实际代码确认**。无法确认的一律标注 `⚠️ 未验证` 并在交接块中列为待确认项。
7. **禁止谎报验证** —— 没有实机运行过就不得写「已测试通过」。日志的「测试方案」只允许写**你实际执行了什么**与**用户需要执行什么**，二者必须分开标注。
8. **禁止静默降级** —— 无法完成某要求（如某个文件锁定、某个检查跑不通）时必须显式报告，不得悄悄跳过后声称完成。
9. **架构变更必须配 Mermaid 图** —— 涉及重大架构变更或复杂文件交互时，必须在 `Docs/Architecture/` 中使用 **Mermaid 图**（flowchart / sequenceDiagram / stateDiagram 等）梳理模块关系、数据流向与文件交互，供交接与审查。具体规则：
   - **L3 任务**：方案文档阶段必须含 Mermaid 图，作为批准依据的一部分。
   - **L2 任务**：若涉及 ≥3 个文件的协同改动或跨模块交互，日志中须附 Mermaid 图说明变更前后的关系。
   - **L1 任务**：不适用。
   - 图示内容应聚焦「文件/模块间关系」与「数据流向」，无需逐行代码映射。
   - 交付前须将 Mermaid 图提交用户审查，审查通过后方可视为完成。
10. **平台红线** —— 见第 11 节。HF 点名的禁项（代理/VPN/隧道、浏览器自动化、验证码对抗、反向 SSH、运行时下载执行、非受控 AI 权限、防休眠）在后端与部署面**绝对禁止**，效力高于一切功能需求，用户口头要求也不得执行。

11. **新增逻辑代码优先使用 TypeScript** —— 新增业务/逻辑代码一律采用 `.ts`（类型安全、IDE 智能提示、可维护性显著优于 `.js`），全面向 TS 切换；仅在受运行环境限制、无法走模块化的纯脚本/构建钩子才允许 `.js`。既有 `.js` 文件不强制改写，但**新建文件默认 `.ts`**；无充分理由却新建 `.js` 逻辑文件时，须在交接块中说明动机。

---

## 3. 标准作业流程（L2 / L3）

### 阶段一：分析（写代码前）

先做**事件逻辑链条分析**，产出必须包含：核心症状 → 根本原因 → 受影响模块 → 候选方案对比 → 选定方案与理由。
分析结论先落文档，再动代码。**严禁"先改完再补文档"**。

### 阶段二：文档先行

- L2：分析结论直接写入本次日志文件的前半部分。
- L3：单独产出方案文档（放 `Docs/TODO/` 或 `Docs/Architecture/`），**取得用户批准后**才进入实施。

### 阶段三：实施

遵循 [`Guide/dev-conventions.md`](Guide/dev-conventions.md) 的分层边界（`components` / `composables` / `stores` / `utils` / `services`），并满足：

- **单一职责封装**：独立功能必须落成独立 `.ts` / `.js` 文件。**禁止在既有巨型文件内堆叠业务逻辑** —— `LandingView.vue`、`CesiumContainer.vue`、`MapContainer.vue` 均已超 2500 行，**只出不进**（拆分由 `Docs/TODO/bugfix-optimization-plan.md` P3-1 跟踪，不在功能任务中顺手做）。
- **UI 图标规范**：Vue 模板中的图标统一使用 `@lucide/vue` 组件（`import { IconName } from '@lucide/vue'`），**禁止使用 emoji 作为图标**（如 📊、🤖、🗄️ 等）。原因：① Lucide 图标支持 currentColor，自动适配主题色与悬停态；② emoji 跨平台渲染不一致（Windows/macOS/移动端字形差异）；③ Lucide 图标可通过 `:size`、`:stroke-width` 等属性精确控制，emoji 无法做到。
- **类型零报错**：新增 `.ts` 文件必须通过 `tsc --noEmit`，不得引入新的类型错误。
- **注释义务**：新增函数必须有简洁注释说明「功能 / 参数 / 返回 / 核心逻辑」；同类逻辑函数组织在一起维护。
- **配置 key 登记前置**：新增任何配置项，顺序恒为 **① 登记 `deploy/.env.example` + `backend/config/catalog.py` → ② 再写读取代码 → ③ 跑 `Scripts/CheckConfigRegistry.py`**。后端业务代码禁止裸读 `os.getenv`；前端业务代码禁止散落 `import.meta.env.VITE_*`（唯一入口 `src/config/publicRuntime.ts`）。
  - **例外：底图源 URL**。底图源 URL（如 Mapbox、MapTiler、GeovisEarth 等第三方瓦片服务）属于**静态资源地址**，非密钥类配置，允许在 `basemapConfig.ts` 等 constants 文件中直接硬编码。原因：① URL 与 token 耦合，拆分到环境变量反而增加维护复杂度；② 底图源变更属于功能变更而非配置变更，需走代码审查流程；③ 这些 URL 是公开可获取的资源地址，无保密需求。
- **数据源注册前置（TOC / 统一图层管理）**：任何「能把可交互对象加进三维/二维场景」的功能（远程服务、URL 模型、文件导入、模块工作集…）**必须先走数据源注册**，再谈业务交互。禁止只 `entities.add` / `primitives.add` 却不入 `loadedDataSources`（或等价 TOC 元数据店）；OL 侧须对齐 `layer-tree` 注册，不得只加 map 却不进图层树。
  **Cesium 标准契约**（写入字段 / `type` 已知集合 / adapter 的显隐·透明度·flyTo·remove 闭环 / 复用 `dataImport.load*`）与**验收清单**见 [`dev-conventions.md`](Guide/dev-conventions.md#场景数据与移动端契约)，本文件不复制。
- **移动端基线**：新增 icon / 按钮默认给桌面尺寸，**必须同步写 `@media (pointer: coarse)` 一档**（可点击目标 ≥40px、图标 glyph 同步放大、悬停浮现元素在触屏隐藏或常显），判据用**触屏能力、不用宽度断点**；抽屉/面板类容器移动端 `min-width` 必须清零。
  **整页缩小类问题必须真机复验，F12 通过不算通过。** 完整五条（viewport 参数 / `text-size-adjust` / `overflow-x: clip` 等）见 [`dev-conventions.md`](Guide/dev-conventions.md#场景数据与移动端契约)。

### 阶段四：收尾（见第 7 节 DoD，逐项勾选）

---

## 4. 单一事实来源（SSOT）——避免重复维护

**每类信息只有一个权威文件，其余位置一律只放链接。** 这是本仓库文档治理的核心，写入前先对照本表：

| 信息类型 | 唯一权威文件 | 其他位置的正确做法 |
|---|---|---|
| 当前版本号 | 根 `README.md`「项目简介」行 | 其余引用处链接过去，不复制 |
| 完整版本历史 | `Docs/Guide/CHANGELOG.md` | 根 README「版本演进」表**只保留最新 3 条**摘要 |
| 根级 + Docs 目录树 | `Docs/Guide/project-structure.md` | README 不放树 |
| 前端文件树 | `Docs/Guide/frontend-structure.md` | 前端 README 不放树，只放链接 |
| 后端文件树 | `Docs/Guide/backend-structure.md` | 后端 README 不放树，只放链接 |
| 配置 key 清单 | `deploy/.env.example` + `backend/config/catalog.py` | 文档只解释语义，不复制清单 |
| 单次改动全貌 | `Docs/LLM_record/<日期>/*.md` | CHANGELOG 只写一句摘要 + 日志链接 |
| 技术分层约定 | `Docs/Guide/dev-conventions.md` | 本文件不复制 |
| 接手导航 | `Docs/Guide/handover.md` | — |

> **反面案例（真实发生过）**：曾要求"三个 README 都同步文件树"，导致三份树互相漂移。现行规则：**树只在 structure 文件里活着。**

---

## 5. 版本号规则

- 格式严格为 `V{主}.{次}.{修订}`，例：`V3.4.40`。
- **L2/L3 任务各自 +1 修订号**；同一天多次任务依次递增（`3.4.40` → `3.4.41`），**不合并**。
- 多会话并行导致版本号撞车时，**后完成者顺延**，并在日志中注明顺延原因。
- **每次必须同时更新根 `README.md` 的三处**，缺一即视为未完成：
  1. 「项目简介」段的 `（当前版本 V3.x.x）`
  2. 「版本演进」表首行（新增一行，删除最旧一行，恒定 3 行）
  3. 页脚 `<sub>V3.x.x · 开发中 · 最后更新 YYYY-MM-DD</sub>`
- 同时在 `Docs/Guide/CHANGELOG.md` 顶部追加完整条目。
- **前端展示版本号无需手动改**：`frontend/vite.config.js` 构建时用正则 `/当前版本[^\d]*(\d+\.\d+\.\d+)/` 从 README 提取并注入全局常量 `__APP_VERSION__`，下次 build / dev 重启自动同步。**正因如此，「项目简介」行是版本号的机器读取源，格式不得随意改动。**

---

## 6. 日志规范

### 路径与命名（唯一合法形式）

```
Docs/LLM_record/YY-MM/YYYY-MM-DD/YYYY-MM-DD-<英文短横线主题>.md
例：Docs/LLM_record/26-07/2026-07-26/2026-07-26-fix-auth-loading.md
```

> 历史目录存在 `26-06/06-27/`、`26-07-26/`（平铺）等旧写法，**保持原样不迁移**（CHANGELOG 中已有链接），但**新建一律按上述格式**。

### 必含章节

| 章节 | 要求 |
|---|---|
| 日期与时间 | 精确到分钟，如 `2026-07-26 14:30` |
| 任务等级 | L1 / L2 / L3 |
| 问题分析 | 核心症状 → 根本原因 → 受影响模块（阶段一的产出） |
| 修改内容 | 逐条列出功能开发 / Bug 修复项 |
| 修改原因 | 背景、痛点、动机 |
| 影响范围 | 受影响的系统模块（鉴权 / 底图链路 / 数据库 / URL 参数 / 图层管理…） |
| 解决方案 | 方案对比、选型理由、实施步骤 |
| 性能指标 | 仅性能相关任务填写，需给出可比对的前后数据；无数据则写「未实测」 |
| 测试方案 | **分两栏**：`Agent 已执行`（脚本/类型检查/构建结果）与 `待用户实机验证`（步骤 + 预期结果） |
| 变更文件清单 | 全部改动文件的仓库相对路径 + 一句话说明 |
| 遗留与风险 | 已知未解决问题、临时妥协、需后续跟进项 |

---

## 7. 完成定义（DoD）——收尾必须逐项确认

L2/L3 任务在会话结束前逐项核对，**任何一项未过必须显式说明原因**：

- [ ] 代码改动完成，遵守分层边界与单一职责
- [ ] 新增 `.ts` 未引入 `tsc --noEmit` 新报错
- [ ] **新建逻辑文件已默认 `.ts`；确需新建 `.js` 逻辑文件时，交接块已写明动机**（判据见 §2 第 11 条）
- [ ] 维护日志已按第 6 节创建并写全章节
- [ ] 根 `README.md` **三处**版本号已更新
- [ ] `Docs/Guide/CHANGELOG.md` 已追加条目
- [ ] 涉及文件增删 → 对应 `*-structure.md` 结构树已同步（含功能注释）
- [ ] 涉及配置 key → `.env.example` 与 `catalog.py` 已登记
- [ ] 涉及 UI/icon 新增或改动 → 移动端基线已落实（viewport 参数、`pointer: coarse` 触屏档、面板 `min-width` 清零，见第 3 节）
- [ ] **涉及场景数据加载 → 已按 §3「数据源注册前置」入 TOC 并验完 adapter 能力**
- [ ] **门禁脚本已运行且通过**：
      `python Scripts/CheckStructureTree.py` （结构树漂移）
      `python Scripts/CheckConfigRegistry.py` （配置登记）
      *脚本报错必须修到通过或明确说明为何无法通过，禁止无视*
- [ ] 未执行任何 Git 写操作
- [ ] 平台红线自查（第 11.2 节命令）已执行且全绿
- [ ] 已输出第 8 节交接块

---

## 8. 会话交接块（每次任务结束必须输出）

会话末尾以固定格式输出下列内容，使下一个会话可零成本接续：

```markdown
## 🔁 交接块
- **本次版本**：V3.x.x（YYYY-MM-DD）
- **任务等级**：L0 / L1 / L2 / L3
- **一句话结论**：<做了什么，达成什么效果>
- **改动文件**：<路径清单>
- **日志路径**：Docs/LLM_record/YY-MM/YYYY-MM-DD/xxx.md
- **门禁结果**：CheckStructureTree ✅ / CheckConfigRegistry ✅
- **待用户操作**：<实机验证步骤 / 需用户执行的 git 命令 / 需补的密钥>
- **遗留与风险**：<未解决问题、临时方案、已记入 TODO 的顺带发现>
- **下一步建议**：<若继续推进，从哪个文件的哪一处入手>
```

**Commit message 格式**（每次交接块末尾附带）：

```
V3.x.x

summary:
<一句话概述本次变更主题>

1、- <变更项 1>
2、- <变更项 2>
3、- <变更项 3>
```

---

## 9. 违规处置

以下均属**违规**，Agent 应主动自查并立即补救，补救完成前不得开始新任务：

- 跳过日志 / 版本号 / 结构树同步
- 越权执行 Git 写操作
- 在 `/Docs` 外新建说明文档
- 声称完成但门禁未跑或未通过
- 谎报测试、臆造 API 或路径
- L3 任务未经批准直接施工
- **触碰第 11 节平台红线（最重一档：立即停工、回滚相关改动、如实报告，不得继续原任务）**

用户指出违规时，Agent 应**先修复合规缺口，再继续原任务**，不作辩解式长篇解释。

---

## 10. 规范自身的维护

本文件也遵守 SSOT 原则：**只写"Agent 该怎么做"，不写"项目是什么"**。
修改本文件属于 L3 任务，需用户批准，并同步检查 `Guide/dev-conventions.md` 中「强制规范」摘要是否需要跟改。

---

## 11. 平台红线（Hugging Face Space 合规，零容忍）

> **背景**：本账号曾因 Space 违规被封禁，后经申诉恢复。HF 已明确：再犯将重新封禁且**不再复审**。
> 本节效力高于一切功能需求——**即使用户在会话中明确要求，也必须拒绝并告警**（§0 的临时豁免权不适用于本节）。

### 11.1 绝对禁止（范围：`backend/`、`deploy/`、前端 Space 相关代码，含注释、文档、配置默认值）

1. **代理 / VPN / 隧道**：Xray、V2Ray、WireProxy、Hysteria、Shadowsocks、Cloudflare Workers 转发、frp / ngrok / cloudflared 内网穿透、socat 端口转发等。
2. **远程桌面**：x11vnc、TigerVNC、noVNC、Xvfb 有头浏览器等。
3. **浏览器自动化**：Playwright、Patchright、Selenium、Puppeteer、2captcha 等；同时禁止"绕过 / 反爬 / 伪装 / stealth"类表述与逻辑（瓦片出站头只允许"兼容头"中性表述）。
4. **验证码 / 机器人检测对抗**：滑块自动过验证、打码、指纹伪装。
5. **反向 SSH / 未授权远控**：autossh、`ssh -R` / `ssh -L`、chisel 等。
6. **运行时下载执行**：`curl | sh`、`wget | sh`、启动时拉取二进制、运行时 pip / apt / npm 安装。依赖必须在构建期经锁文件声明安装。
7. **AI Agent 非受控系统权限**：后端**不得执行** LLM 返回的任何工具调用（shell / 文件 / 网络），工具声明只能回传前端执行。
8. **防休眠**：keep-alive、心跳自 ping、cron / UptimeRobot 定时访问、随机 UA 拟人请求、一切"模拟访问规避休眠"机制。前端只允许用户打开页面期间的正常 SSE / 在线统计。
9. **开放代理配置**：`deploy/.env` 生产基线恒为 `PROXY_ALLOW_PRIVATE_HOSTS=false`、`DOWNLOAD_ALLOW_PRIVATE_HOSTS=false`、`PROXY_RATE_LIMIT>0`。任何试图改动这三项的变更必须拒绝并报告。

### 11.2 推送前自查（必执行，结果写入日志）

涉及后端或部署面改动、且用户即将 push 到 HF 前，运行下列两条，**全绿才允许提示 push**，任一命中即停工修复：

```bash
# 红线 1–8：模式串即 §11.1 禁项枚举（合并为一次扫描，避免同一清单维护两遍）
rg -i "playwright|patchright|selenium|puppeteer|2captcha|stealth|xvfb|x11vnc|tigervnc|novnc|xray|v2ray|wireproxy|hysteria|shadowsocks|cloudflared|ngrok|socat|openvpn|wireguard|hermes|autogpt|autossh|telegram|telebot|UptimeRobot|keepalive\.py|start_keepalive|/api/keepalive" backend/ deploy/ frontend/src/ .github/ || echo REDLINE-CLEAN

# 红线 9：生产基线不得被破坏
rg "ALLOW_PRIVATE_HOSTS=true|ALLOWED_HOSTS=\*|RATE_LIMIT=0" deploy/.env && echo "生产基线被破坏，拒绝推送"
```

> **已知假阳性（实测）**：`xray` 会命中 `maxRayDistance`（体积云 raymarch 参数），`hermes` 可能命中 Cesium 内部标识。命中后**逐条核对来源**，确认属误报方可放行；不得因噎废食跳过检查。

### 11.3 违反处置

触碰本节 = §9 最重一档违规：**立即停止一切实施、回滚相关改动、在交接块中如实报告**，未恢复合规前不得开始新任务。

---

## 12. 线上机器人 PR 处置（本地 GitHub CLI）

> **定位**：规定 Agent 如何用本机 `gh` CLI 查看与处置**依赖机器人（Dependabot）**开出的 PR。本节**不改变** §2.1 的决策权归属——合并不是新增授权，而是**逐次借用的权限**。
>
> **适用对象**：仅限 `author.login = app/dependabot` 的 PR。人类 PR 与 Copilot coding agent PR **不适用**本节，仍按 §2.1 一律禁止写操作。

### 12.1 事实基线（勿凭记忆改写）

| 项 | 事实 |
|---|---|
| 机器人身份 | Dependabot，`author.login = app/dependabot`、`is_bot = true` |
| 分支形态 | `dependabot/npm_and_yarn/<path>/<pkg>-<ver>`、`dependabot/uv/<path>/<pkg>-<ver>` |
| 机器人是否自行合并 | **否**。`allow_auto_merge=false`、无 rulesets、无 auto-merge workflow，历史合并 actor 均为账号本人 |
| 更新策略 | 仅跟 major（`ignore` 掉 semver-minor / semver-patch），weekly 检查；**安全更新不受 schedule 约束**，随时可能冒出新 PR |
| 仓库合并策略 | `squashMergeAllowed=true`、**`deleteBranchOnMerge=false`** |
| 本地 CLI 前提 | `gh` ≥ 2.95，且 token 具备 `repo` scope |

> `deleteBranchOnMerge=false` 是关键事实：合并时**必须显式带 `--delete-branch`**，否则 `dependabot/*` 远端分支残留。

### 12.2 权限三分

| 档位 | 动作 | 命令 | 授权要求 |
|:---:|---|---|---|
| ✅ **只读·随时可做** | 列清单 / 看详情 / 看检查 / 看 diff / 查仓库策略 / `gh api` **GET** | `gh pr list`、`gh pr view`、`gh pr checks`、`gh pr diff`、`gh repo view` | 无需 |
| ⚠️ **逐次显式授权** | 合并**单一** PR | `gh pr merge <n> --squash --delete-branch` | 用户须说出「合并 #<n>」类明确指令；授权**仅对该 PR、该一次**有效，不跨会话、不跨 PR 继承 |
| ⛔ **一律禁止** | 自动合并 / 切分支 / 自评审 / 关闭 / 评论 / 编辑 / `gh api` 写方法 / 绕过保护 | `pr merge --auto`、`pr checkout`、`pr review`、`pr close`、`pr comment`、`pr edit`、`gh api -X POST\|PATCH\|DELETE`、`pr merge --admin` | 无出口；即使用户要求，也须先说明风险再二次确认 |

**为何 `gh pr checkout` 禁止**：它切换本地工作区分支，直接落在 §2.1「改分支」的禁止范围内。需要本地复验时，改由用户在本地自行执行，Agent 只读远端状态。

### 12.3 五步只读核查（顺序固定，禁止跳步）

`list → view → checks --required → diff --name-only → diff --patch`。

**未执行第 4 步（看变更范围）就下「可以合并」结论，等同未核查。** 完整命令与参数见 [`Guide/bot-pr-playbook.md`](Guide/bot-pr-playbook.md#五步只读核查)。

### 12.4 合并准入条件（六条全满足，缺一即暂缓）

| # | 条件 | 判定依据 |
|:---:|---|---|
| 1 | 无冲突 | `mergeable=MERGEABLE` 且 `mergeStateStatus=CLEAN` |
| 2 | 检查全绿 | `gh pr checks <n> --required` 无 fail / pending |
| 3 | 变更面收敛 | `--name-only` 仅含 `package-lock.json` / `uv.lock` / `package.json` / `pyproject.toml` / `requirements*.txt`；**出现任何业务代码即转人工** |
| 4 | 版本跨越已判定 | major：须列出 breaking change 核对结论；minor / patch：可直接放行 |
| 5 | 不触部署面 | 触及 `deploy/.env.example`、`backend/config/catalog.py`、`.github/workflows/` 时**立即转人工**，不走本节 |
| 6 | 已获授权 | 用户就该 PR 的明确指令（见 §12.5） |

**锁文件专用风险（高频误判点）**：

- `uv.lock` 的 `revision = N` 变动代表**生成它的 uv 版本漂移**，会连带重解析 marker 与依赖树，diff 远超版本号本身。此时**禁止在本地跑 `uv lock` 重生成**（会再改一次并制造二次冲突）；直接接受机器人产物，或整体暂缓。
- `package-lock.json` 的 `lockfileVersion` 变动同理。
- 只改锁文件、未改 `package.json` / `pyproject.toml` 的 PR，说明是**传递依赖**升级，运行时变化面小，但仍须条件 2 兜底。

### 12.5 授权与执行

1. **授权形式**：用户在当前会话说出「合并 #45」类指令。含糊表述（如「把 PR 处理一下」）**不构成授权**，须回问具体编号。
2. **执行前复述**：「即将 squash 合并 #<n>（<依赖> <旧版本> → <新版本>），并删除远端分支」。
3. **执行**：
   ```bash
   gh pr merge <n> --squash --delete-branch
   ```
4. **执行后必须回报**：合并 commit SHA、远端分支是否已删除、**提示用户本地 `main` 已落后需自行 `git pull`**（Agent 不得代拉）。
5. **失败即停**：`gh pr merge` 非零退出时原样转述错误，**不重试、不改用 `--admin`、不换合并方式绕过**。

### 12.6 版本号与日志归属

| 场景 | 版本号 | 日志 |
|---|:---:|---|
| 仅查看 / 判定 | 不动 | 不写 |
| 合并机器人 PR（无需改代码） | **不动** | 不写独立日志；改动记入交接块「改动文件」一栏 |
| 合并后发现需**改代码适配**（如 major 致构建失败） | 适配部分按 **L2**，+1 修订号 | 按 §6 写完整日志 |

**理由**：机器人 PR 的内容不是 Agent 产出的代码，为其升版本会污染版本历史语义（版本号应对应「本项目做了什么」）；但 Agent 为适配而写的代码是真实改动，必须走全流程。

### 12.7 本节禁止事项

1. 开启仓库级 auto-merge，或使用 `gh pr merge --auto` / `--admin`。
2. 未经授权执行 `gh pr checkout` / `pr review` / `pr close` / `pr comment` / `pr edit`。
3. 对**非 Dependabot** 的 PR 套用本节授权（人类 PR 一律禁止写操作）。
4. 为「让 CI 变绿」而修改 `.github/workflows/`（属 §2.3 第 3 条部署面）。
5. 放宽 `dependabot.yml` 的 `ignore` 以制造更多 PR，或调高 `open-pull-requests-limit`。
6. 任何 `gh api` 的 POST / PATCH / DELETE / PUT 方法。

### 12.8 常见故障

`no checks reported`（**不得视为通过**）/ `BLOCKED` / `BEHIND` / 锁文件 diff 异常 / `401-403` / 合并后分支残留 —— 六种现象的成因与处置见 [`Guide/bot-pr-playbook.md`](Guide/bot-pr-playbook.md#常见故障对照)。

---

*"代码是写给机器看的，文档是写给未来的自己看的；而规范，是写给下一个会话的自己看的。"*
