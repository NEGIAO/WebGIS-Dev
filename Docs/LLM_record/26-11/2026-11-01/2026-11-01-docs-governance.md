# 文档组织治理：按生命周期分区 + TODO 索引化 + Force_command 精炼

- **日期与时间**：2026-11-01 13:05
- **任务等级**：L3（跨目录结构调整 + 规范本体修改 + 文档重构）
- **方案文档**：[`Docs/TODO/archive/2026-11-01-docs-organization-governance-plan.md`](../../TODO/archive/2026-11-01-docs-organization-governance-plan.md)（用户四项决策全部按推荐项批准）
- **目标版本**：V3.6.37

---

## 1. 问题分析

### 1.1 核心症状

用户提出四个问题：文件组织是否易维护/开发/运维/管理/上手/阅读？路径是否合理？Force_command 是否冗余？诸多 md 是否过期？

全库测绘后得到与直觉相反的结论：**代码组织健康，文档组织失序**。问题不在「文件放错文件夹」，而在「同一目录混放不同生命周期的内容，且缺索引与状态机」。

### 1.2 七维度评估

| 维度 | 评级 | 依据 |
|---|:---:|---|
| 开发 | 🟢 良 | 前端 domain-first（`domains/{cesium,ol,common}` 484 文件）+ barrel 收口；后端 api/core/services/config/tests 分层清晰 |
| 运维 | 🟢 良 | `deploy/` 4 文件 + 双 Dockerfile + 4 个职责单一的 workflow |
| 维护 | 🟡 中 | 7 个 >2500 行巨型文件：`LandingView.vue` 5379、`CesiumContainer.vue` 3165、`MapContainer.vue` 2939（规范原记「2000+」，已过时）、`HomeView.vue` 2784、`CesiumToolPanel.vue` 2702、`RegisterView.vue` 2654、`TOCPanel.vue` 2517 |
| 上手 | 🟡 中 | 有 `handover.md`，但 README 639 行过载；`Force_command` 无项目速览 |
| 阅读 | 🟡 中 | 当前态 / 历史 / 方案三类混放，读者无法判断哪篇「现行有效」 |
| 管理 | 🔴 差 | `TODO/` 23 文件无索引、13/23 无状态字段、4 套命名并存 |
| 组织管理 | 🔴 差 | `Docs/Demo` 260 MB 非文档；`Guide` 内含 plan；规范自相矛盾 |

### 1.3 根本原因

1. **缺少「生命周期」这一分层维度**：文档只按主题（架构/指南/待办）分区，未按「现行有效 / 历史记录 / 待实施方案」区分，导致三类内容在同一目录内累积。
2. **缺少索引与状态机**：`TODO/` 依赖文件名排序，而命名规范未强制，最终形成 4 套并存；状态字段缺失使「哪个还活着」不可判定。
3. **规范职责边界未守住**：`Force_command.md` §4 自己规定了「技术约定归 `dev-conventions.md`，本文件不复制」，但 §3 内联了 30 行技术细节 —— 规则写了，执行没跟上。

### 1.4 受影响模块

`Docs/`（Architecture / Guide / TODO / Demo）、`Scripts/`、根 `README.md`、`Docs/README_EN.md`、`Docs/Force_command.md`、2 处后端注释。

---

## 2. 修改内容

### 2.1 文档按生命周期分区

| 动作 | 明细 |
|---|---|
| 新建 `Docs/Architecture/decisions/` | 收 3 篇日期命名历史重构记录：`2026-08-02-basemap-ssot-refactor`、`2026-08-20-unified-basemap-selection`、`2026-08-22-clamp-to-ground-strategy` |
| 迁回 TODO | `tencent-building-import-plan.md`、`2026-10-25-tileset-large-area-terrain-fit-plan.md`（方案属待办，不属架构） |
| 迁入 Architecture | `ol2cesium.md`（2113 行实现规范）→ `ol-cesium-coordinate-transform-spec.md` |
| 迁入 archive | `Docs/Guide/configuration-architecture-plan.md`（全阶段已落地 V3.4.6–V3.4.13） |

### 2.2 TODO 索引化

- 新建 `Docs/TODO/README.md`：六态状态机（活跃 / 待批准 / 实施中 / 搁置 / 已完成 / 待人工确认）+ 全量状态表（16 活跃方案 + 1 索引 + 10 归档）+ 归档三重判据 + 命名约定 + 维护义务。
- 归档 8 篇（经代码存在性核验）：`agent-override-key-leak-plan`、`cesium-ground-placement-unification-plan`、`engine-aware-map-operations-migration-plan`、`requestrendermode-plan`、`unified-layer-management-refactor-plan`、`configuration-architecture-plan`、`next-sprint-bugfix-and-optimization`、`next-session-prompt-rendering`。
- 本次两篇方案（机器人 PR §12、文档治理）完成即归档，累计 10 篇。

### 2.3 Force_command 精炼

| 节 | 动作 | 行数变化 |
|---|---|---|
| 新增 §0.5 | 项目速览：是什么 / 六层技术栈表 / 三个必须先建立的概念 / 必读四件套 | +35 |
| §3 | 移动端基线 5 条 + Cesium 契约 4 条 + OL 对齐 + 验收 → 迁 `dev-conventions.md` 新增节；保留行为级要求 + 链接 | 40 → 14 |
| §11.2 | 四条 `rg` 合并为一条（模式串本就重复 §11.1 禁项枚举） | 33 → 15 |
| §12 | 12.3 命令清单、12.8 故障表 → 拆至 `Guide/bot-pr-playbook.md` | 112 → 66 |
| **合计** | | **399 → 402** |

### 2.4 语义声明与脚本归档

- 新建 `Docs/Demo/README.md`：声明非文档、`data/`+`textures/` 需本地自备、为何不迁移。
- `Scripts/UpdateReadmeTree.py` → `Scripts/archive/`，文件头加 12 行废弃说明（输出目标 `FileTree.md` 已不存在）。

### 2.5 引用修复（30 处）

`README.md` 5 · `README_EN.md` 5 · `CHANGELOG.md` 10 · `project-structure.md` 全量重写 · `handover.md` 1 · `configuration.md` 1 · `configuration-three-tier.md` 1 · `bugfix-optimization-plan.md` 4 · 其余 TODO 2 · **后端注释 2**（`agent_chat/constants.py`、`utils.py`，纯注释）。

---

## 3. 修改原因

1. **降低接手成本**：新人打开 `TODO/` 看到 23 个平铺文件且无从判断存活状态，实际等于没有待办清单。
2. **保护 SSOT**：结构树自己先漂移（TODO 段只列 7/23），说明缺索引的目录无法靠「维护纪律」保持准确。
3. **消除规范内部矛盾**：§4 与 §3 冲突，属于规范自身的合规缺陷，长期存在会让 Agent 无法判断该信哪一条。
4. **补齐 Force_command 的定位缺口**：用户明确其定位为「单文件交付即可了解全貌 / 边界 / 约束 / SOP」，而原文件只覆盖后三者。

---

## 4. 影响范围

| 模块 | 影响 |
|---|---|
| 文档导航 | README / README_EN 的文档导航表结构变更；Architecture 拆出 decisions 子表 |
| 结构树 | `project-structure.md` 全量重写（新增「目录治理约定」节 + 自身变更记录表） |
| Agent 行为 | `Force_command.md` §0.5 新增、§3 精简、§11.2 合并、§12 拆出；`dev-conventions.md` 权威边界改为「技术约定以本文件为准」 |
| 代码 | **仅 2 处注释**，无逻辑改动 |
| 部署面 | 无影响（未触 `deploy/`、`.github/workflows/`） |
| 版本号 | V3.6.37 → V3.6.37，README 三处 + CHANGELOG |

---

## 5. 解决方案

### 5.1 关键决策

| 决策点 | 选定 | 理由 |
|---|---|---|
| §3 技术细节 | 迁 `dev-conventions.md` | 符合 §4 自身 SSOT 条款；消除两处维护同一规则 |
| TODO 归档范围 | 核验后归档（8 篇） | 三重判据，代码存在性为最高权重 |
| Architecture 分层 | 新建 `decisions/` | 物理分层比表格约定更持久 |
| 实施范围 | 全量执行 | 用户批准 |

### 5.2 两个反直觉结论

**① `✅` 标记不可作归档依据。** `2026-10-31-turnstile-auth-hardening-plan.md` 有 4 处 `✅`，但 `grep -ril turnstile frontend/src backend` 返回 **0 个文件** —— 那些 `✅` 是设计决策标记（「选定」「排除游客」），方案实际未实施。若按标记数机械归档，会把一个未做的安全加固方案埋掉。故改用代码存在性为首要判据。

**② 不改 TODO 文件名。** 4 套命名虽乱，但 23 个文件被 CHANGELOG、结构树、各期日志引用 40+ 处；改名会让历史引用全部失效，而历史日志按 §6 不可改写。**用索引解决「找不到」，不用改名解决「不整齐」。**

### 5.3 不迁移 `Docs/Demo/` 的论证

1. 20 个 HTML 以相对路径引用 `data/`、`textures/`，迁移必断链；
2. 两目录已被 `.gitignore` 排除，不在仓库内，迁移对仓库体积零收益；
3. 迁到根级会给根目录新增非标准目录，与「根级目录树唯一权威」的简洁性冲突。

结论：就地保留 + `README.md` 声明语义 + 结构树标注「非文档」。

---

## 6. 性能指标

不适用（纯文档与注释改动）。**未实测**。

---

## 7. 测试方案

### 7.1 Agent 已执行

| 项 | 方式 | 结果 |
|---|---|---|
| 结构树门禁 | `python Scripts/CheckStructureTree.py` | ✅ 见 §7.3 |
| 配置登记门禁 | `python Scripts/CheckConfigRegistry.py` | ✅ 见 §7.3 |
| 失效引用扫描 | `grep -rn` 15 个旧路径模式，排除 `LLM_record/` 与 `archive/` | ✅ 0 处（修复后） |
| README 版本三处 | `grep -n "当前版本 V3.6.37\|<sub>V3.6.37"` | ✅ 均命中 |
| 版本表行数 | `grep -c "^| \*\*V3\.6\."` | ✅ 3 行（3.6.37 / 3.6.36 / 3.6.35） |
| TODO 文件数 | `ls Docs/TODO/*.md \| wc -l` | 17 活跃 + 10 归档 |
| 归档代码核验 | `grep -rl` 各方案声称的关键符号 | ✅ 6 篇确认存在；`backend-reorg-plan` 无法确认（`backend/utils/` 不存在），保留并标 ⚠️ |
| Force_command 行数 | `wc -l` | **402**（原 399） |

### 7.2 待用户实机验证

1. **GitHub 渲染**：`Docs/TODO/README.md` 与 `project-structure.md` 的表格、`Docs/Demo/README.md` 的告示块在网页端渲染正常。
2. **内链跳转**：README 的 `Docs/TODO/README.md`、`Docs/Demo/README.md`、`Docs/Architecture/decisions/*` 三类新链接可跳转；`Force_command.md` §3 指向 `dev-conventions.md#场景数据与移动端契约` 的锚点可跳转。
3. **`Force_command.md` 单文件可用性**：把该文件单独发给一个陌生 Agent，确认其能回答「这是什么项目 / 边界在哪 / 怎么干」三问（这是本次 §0.5 的验收标准）。
4. **提交**：由用户执行 `git add` / `commit` / `push`（Agent 未做任何 Git 写操作）。注意本次有**文件迁移**，`git status` 会显示删除 + 新增，属预期。

### 7.3 门禁执行结果

- `python Scripts/CheckStructureTree.py` → **通过**（文档条目 522 · 磁盘文件 522 · 漏登记 0 · 幽灵条目 0，exit 0）。
  ⚠️ **必须注明其覆盖范围**：读脚本 docstring 确认，该门禁**仅校验 `frontend-structure.md` ⇄ `frontend/src`**，**不覆盖 `project-structure.md` 与 `backend-structure.md`**。因此本次对 `project-structure.md` 的全量重写属**人工核对**，未经门禁保证 —— 该覆盖缺口已记入 `bugfix-optimization-plan.md`。
- `python Scripts/CheckConfigRegistry.py` → **通过**（B1–B4 / F1–F3 七项全绿，exit 0）
- 平台红线 §11.2 四项 → 全绿（`backend/`、`deploy/` 零命中；`frontend/src/` 的 `xray` 命中为 `maxRayDistance` 假阳性）

---

## 8. 变更文件清单

### 新建（5）

| 路径 | 说明 |
|---|---|
| `Docs/TODO/README.md` | TODO 索引 + 六态状态机 + 全量状态表 |
| `Docs/Guide/bot-pr-playbook.md` | 依赖机器人 PR 操作手册（承接 §12 拆出内容） |
| `Docs/Demo/README.md` | 声明该目录为演示样例而非文档 |
| `Docs/Architecture/decisions/` | 新目录（3 篇迁入） |
| `Scripts/archive/` | 新目录（1 个废弃脚本迁入） |

### 修改（9）

| 路径 | 说明 |
|---|---|
| `Docs/Force_command.md` | 新增 §0.5；§3 精简并修正缩进错误；§11.2 合并；§12 拆出 |
| `Docs/Guide/dev-conventions.md` | 新增「场景数据与移动端契约」节；权威边界改为「技术约定以本文件为准」；摘要第 12/13 条改指向 |
| `Docs/Guide/project-structure.md` | 全量重写：新增「目录治理约定」；TODO 段从 7 条补至全量；补齐 Architecture 漏列 3 篇、Demo 漏列 2 页 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.6.37 条目；修复 10 处历史链接路径 |
| `README.md` | 版本三处 → V3.6.37；文档导航表重构（新增 decisions 子表）；5 处链接修复 |
| `Docs/README_EN.md` | 文档导航同步；5 处链接修复 |
| `Docs/Guide/handover.md` | 1 处链接修复 |
| `Docs/Guide/configuration.md` | 1 处链接修复 |
| `Docs/Architecture/configuration-three-tier.md` | 1 处链接修复 |

### 迁移（20）

`Docs/TODO/` → `archive/` 10 篇 · `Docs/Architecture/` → `decisions/` 3 篇 · `Architecture/` → `TODO/` 2 篇 · `TODO/ol2cesium.md` → `Architecture/ol-cesium-coordinate-transform-spec.md` · `Guide/configuration-architecture-plan.md` → `TODO/archive/` · `Scripts/UpdateReadmeTree.py` → `Scripts/archive/` · 其余 2 篇为本次方案自迁

### 注释修复（2）

`backend/api/agent_chat/constants.py`、`backend/api/agent_chat/utils.py` —— 方案文档路径加 `archive/`，无逻辑改动

---

## 9. 遗留与风险

### 9.1 未达成项（如实报告）

**`Force_command.md` 未变短**：399 → **402** 行，方案原定「≤340 行」目标未达成。原因是「补全貌」（+35 行）与「减行数」方向相反，本次选择优先补全貌。实际收益在**职责纯度**而非行数：规范不再承载技术细节与操作手册，两类内容各归其位，后续修改不必同步两个文件。若仍需压缩，可从 §6 日志规范（28 行）与 §8 交接块（31 行）中把示例模板外移，预计可再减 30 行。

### 9.2 待人工确认

| 项 | 状态 |
|---|---|
| `backend-reorg-plan.md` | ⚠️ 状态行称「已批准逐步执行」，但方案目标中的 `backend/utils/` **不存在**（实际为 `api/core/config/tests/scripts`）。无法判定是「已按变体落地」还是「未完成」，保留在 TODO 并标 ⚠️ |
| `2026-10-17-landing-njnu-14-items-plan.md` | ⚠️ 无状态行；`LandingView.vue` 已 5379 行（基线 2930），疑似已实施但无日志佐证 |
| `CHANGELOG.md:2820` 引用 `Docs/TODO/next-session-prompt.md` | ⚠️ 该文件在我改动前就已不存在，属**既有断链**，非本次引入；未修复（历史条目） |

### 9.3 风险

1. **`decisions/` 目录可能再次混入现行架构**：靠 `project-structure.md` 的「目录治理约定」约束，无自动门禁。建议后续给 `CheckStructureTree.py` 增加「`decisions/` 内文件名必须匹配 `YYYY-MM-DD-*`」校验。
2. **`dev-conventions.md` 权威边界变更需被后续会话知悉**：其头部已改写，但历史日志中「冲突时以 Force_command 为准」的表述仍存在（按 §6 不改写）。若后续会话读到旧日志可能误判。
3. **TODO 索引需持续维护**：新增方案须同时改索引表，否则会退化回「无索引」状态。已在 `README.md` 第五节写明维护义务。
4. **`.git` 体积 700 MB** 未处理：需 `git filter-repo` 重写历史，属 Git 写操作（§2.1 绝对禁止），只能由用户执行。
5. **本次提交含大量文件迁移**：`git status` 会显示大量删除/新增，建议用户用 `git add -A` 后检查 `git status` 的 rename 识别情况再提交。

### 9.4 实施期间的异常事件（如实记录）

**事件**：`Scripts/archive/UpdateReadmeTree.py` 在创建并写入废弃说明后，**于会话中途从磁盘消失**（`ls` 报 `No such file or directory`）。

**排查结论**：
- 该文件当时**未被 Git 跟踪**（`git ls-files Scripts/` 只返回 2 个脚本），因此不受 Git 保护；
- 无任何活跃 Git hook（`.git/hooks/` 仅 `.sample`）；
- 同期发现 **Git 索引区在 12:38:34 出现了 36 项「已暂存」变更，而本次会话全程未执行任何 `git add`**（上一步 V3.6.37 收尾时 `git status` 显示的是未暂存 ` M` 与 `??`）。

**推断**：存在外部 Git 集成工具（IDE / 编辑器插件 / 同步进程）在后台执行了暂存与清理动作，清理时删掉了未被跟踪的 `Scripts/archive/`。

**处置**：从 `git show HEAD:Scripts/UpdateReadmeTree.py` 恢复原始内容（72 行），重新写入废弃说明。已核验全部 8 个交付文件 + 3 个新目录均存在。

**对用户的影响与提示**：
1. 当前索引区已有暂存内容，**提交前请先 `git status` 复核**，确认暂存区符合预期；
2. `Scripts/archive/UpdateReadmeTree.py` 目前是**未跟踪**状态（`??`），而 `Scripts/UpdateReadmeTree.py` 的删除已暂存 —— 若直接提交而不 `git add -A`，脚本会被**彻底删除**，违反 §2.4。**务必先 `git add -A`**；
3. 若后台工具会周期性执行 `git clean`，后续任何未跟踪的新文件都可能被清除，建议排查该工具配置。
