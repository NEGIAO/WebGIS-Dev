# 2026-11-24 增加 Supabase 访客同步 payload 单测

- **日期与时间**：2026-11-24 18:20
- **任务等级**：L2（新增文件）
- **版本**：V3.7.18

## 问题分析

- **核心症状**：Supabase 访客同步的字段映射行为没有任何测试锁定。今天启用 Supabase 访客统计时核对后端代码发现，同步 payload 用的是 `event_id`（取自本地 SQLite 行 id），而不是 `id`；若按直觉建表用 `id` 自增主键，同步请求会因列不存在而失败。
- **根本原因**：`backend/api/statistics.py` 的 `_build_supabase_visit_payload` 映射规则（`event_id` / 默认值 / 经纬度透传 / `quota_subject` 回退）无单测覆盖，行为只能靠人工核对代码保证。
- **受影响模块**：访客统计同步链路（`backend/api/statistics.py` → Supabase `visit_tracking_events` 表）。

## 修改内容

- 新增 `backend/tests/test_statistics_supabase.py`：5 例单测，覆盖 `event_id` 映射（payload 不含 `id` 与 `supabase_sync_*` 字段）、空记录默认值、经纬度 / `gps_accuracy` 透传（含 `None`）、`quota_subject` 回退到 `username`。
- 按 L2 全流程补齐合规文件：本日志、根 `README.md` 三处版本号同步至 V3.7.18、`Docs/Guide/CHANGELOG.md` 顶部追加 V3.7.18 条目、`Docs/Guide/backend-structure.md` 同步新增测试文件。

## 修改原因

- 把今天人工核对出的 `event_id` 映射行为锁定为单测，防止后续重构改坏同步字段。
- 本分支（`muse/dev`）的首个 PR 须符合 `Docs/Force_command.md` 与 `Docs/Example_prompt.md` 的 L2 全流程。

## 影响范围

- 仅新增测试与文档；不改任何业务逻辑，不涉及配置 key、部署面与 UI。
- 不影响线上运行：HF Space 后端不受影响。

## 解决方案

- 方案对比：(a) 只加测试文件直接提 PR——最快，但跳过日志/版本号/结构树/门禁，违反 L2 全流程；(b) 按 L2 全流程补齐——采纳。
- 实施步骤：本地写单测并跑通 → 建 `muse/dev` 分支 → 推测试文件 → 开 PR #65 → 按规范补齐合规文件并追加提交。

## 性能指标

未实测（非性能任务）。

## 测试方案

### Agent 已执行

- `python -m unittest tests.test_statistics_supabase -v`：5 例全部通过（本地 venv，fastapi/httpx/pydantic/pytz）。
- 门禁：`python Scripts/CheckStructureTree.py`——文档条目 749 · 磁盘文件 749 · 漏登记 0 · 幽灵条目 0，通过；`python Scripts/CheckConfigRegistry.py`——catalog 138 key、前端 VITE_ 11 个，全部通过。
- 平台红线自查（§11.2 两条 `rg`）：仅命中 `maxRayDistance`（体积云 raymarch 参数，规范已注明的假阳性），逐条核对无其他命中；生产基线检查通过（`deploy/.env` 无 `ALLOW_PRIVATE_HOSTS=true` 等破坏项）。

### 待用户实机验证

- PR #65（`muse/dev` → `main`）检查通过后，由用户决定是否合并；合并操作由用户执行，Agent 不碰。
- 合并后 `muse/dev` 需同步 `main` 最新状态（后续维护任务）。

## 变更文件清单

- `backend/tests/test_statistics_supabase.py`（新增）：Supabase 访客同步 payload 单测，5 例。
- `Docs/LLM_record/26-11/2026-11-24/2026-11-24-supabase-visit-payload-tests.md`（新增）：本文件。
- `README.md`：三处版本号同步至 V3.7.18（项目简介行、版本演进表首行、页脚）。
- `Docs/Guide/CHANGELOG.md`：顶部追加 V3.7.18 条目。
- `Docs/Guide/backend-structure.md`：tests 目录同步新增测试文件。

## 遗留与风险

- 首个提交 `727e5c06` 的 commit message 版本行写的是 `V3.7.1`，与本次 `V3.7.18` 不符。原因：提交时尚未核对当前版本号（实际已是 V3.7.17）。连接器 push 只能新增提交、无法 amend 已推提交，故不改写历史； squash 合并时以 PR 标题为准，特此说明。
- 流程偏差：本次先写代码、后补文档（会话开始时以“试 PR 流程”启动，用户中途指出 `Docs/Example_prompt.md` 后才补齐 L2 全流程），本次已补救；后续任务须先声明等级、文档先行。
- Git 写操作豁免：依据 `Force_command.md` §0 优先级 1，用户在本会话明确指令“用 NEGIAO 账号在本地改代码并提交 PR”，临时豁免 §2.1 禁止 Git 写操作，仅对本次任务生效；PR 合并仍属禁止，由用户执行。
- Supabase 端到端同步（真实访问落表）尚未验证：此前验证步骤被用户叫停；PR 合并后可由一次真实访问验证。
