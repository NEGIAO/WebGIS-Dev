# SMTP_USER 分层校正：账号回归 L1（对齐用户原始三层模型，V3.4.17）

## 日期和时间

2026-07-26 19:13（北京时间）

## 事件逻辑链条分析

- **核心症状**：用户对照其最初三层设想审计实现，发现邮箱拆分与原意不符——原始模型明确「账号写入 env（L1）、凭证写入 HF Secret（L3），分开存取」，而实现将 `SMTP_USER` 与 `SMTP_PASSWORD` 一并归入 L3。
- **根本原因**：落地时按「登录凭据对从严」原则将账号随凭证归 L3，偏离了用户「发件账号半公开（收件人可见）、只有凭证才是绝密」的判断；两种取舍都自洽，但架构决策权在用户。
- **受影响模块**：仅配置登记与文档（catalog 元数据、根/后端 .env.example、配置指南、架构文档、启动摘要标签）；**读取行为零变化**（loader 始终从环境变量读 `SMTP_USER`，与其登记层级无关）。
- **解决思路**：catalog 改层级与 secret 标记 → 根清单将 `SMTP_USER=` 从 L3 段移至 L1 邮件段 → 四处文档同步 → 启动摘要 L3 状态行改为只看 `SMTP_PASSWORD` → 门禁与行为断言复验。

## 修改内容

1. `backend/config/catalog.py`：`SMTP_USER` layer L3→**L1**、secret True→**False**，描述注明「发件账号半公开；凭证 SMTP_PASSWORD 属 L3」。
2. 根 `.env.example`：L1 邮件段新增 `SMTP_USER=`（含示例注释），段注改为「账号在此 L1；凭证见 L3，分开存取」；L3 段删除 `SMTP_USER=` 仅留 `SMTP_PASSWORD=`；底部最小检查项同步为「L1 SMTP_USER + L3 SMTP_PASSWORD」。
3. `Docs/Guide/configuration.md`：HF Secrets 最小集合中 SMTP 组仅留 `SMTP_PASSWORD`（账号注明可走 Variables/L1）；Variables 建议行补 `SMTP_USER`；「功能→必配项」与「邮箱拆分示例」表同步（SMTP_USER → L1）。
4. `Docs/Architecture/configuration-three-tier.md`：L3 职责表与 SMTP 关键链路段改为「主机/端口/账号 L1，凭证单独 L3」，标注其为「账号/凭证分开存取」范例。
5. `backend/config/load.py`：`masked_summary()` 的 [L3] 状态行由 `SMTP_USER/PASSWORD` 合并布尔改为仅 `SMTP_PASSWORD`（账号已非 L3）。
6. `backend/.env.example`：头部分层摘要同步。

不改动：`email_service` 读取逻辑与发送校验（仍要求账号+密码齐备）；admin 面板 `l3_env_status.smtp` 保持「账号+密码齐备」的功能可用布尔（UI 标签本就是"SMTP 邮件账号/密码"）。

## 修改原因

用户审计反馈：邮箱「账号进 env、凭证进 Secrets」是其三层模型的示例性设计，实现需与之对齐；分层登记是约定层面的修正，不涉及运行时取值路径。

## 影响范围

配置登记/文档层面。行为兼容性：已把 `SMTP_USER` 配在 HF Secrets 的存量部署完全不受影响（Secrets 同样注入环境变量，loader 读取处一致）；新部署按文档可将账号放根 `.env` / HF Variables。

## 优化解决方案

分层原则据此明确为：**是否绝密看泄露后果，而非是否成对使用**——发件地址本就随每封邮件公开，泄露无额外风险；真正需要保护的只有凭证。该原则已写入 catalog 描述与两份文档，供后续同类拆分（如未来对象存储 AK/SK）参照。

## 性能指标

不适用。

## 测试方案

- `py_compile` catalog/load 通过；`CheckConfigRegistry.py` 七项门禁全绿（B3/B4 证明清单⇄catalog 移层后仍双向一致）。
- 行为断言：设 `SMTP_USER`/`SMTP_PASSWORD` 后 `reload_settings()` 读取值不变；`masked_summary()` 不含凭证明文且 [L3] 行显示 `SMTP_PASSWORD=已配置`；`get_meta("SMTP_USER")` 为 L1/非 secret。
- 待实机：HF 上把 `SMTP_USER` 从 Secrets 移至 Variables（可选，不移也兼容）后邮件发送回归。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\backend\config\catalog.py
- D:\Dev\GitHub\WebGIS-Dev\backend\config\load.py
- D:\Dev\GitHub\WebGIS-Dev\.env.example
- D:\Dev\GitHub\WebGIS-Dev\backend\.env.example
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration.md
- D:\Dev\GitHub\WebGIS-Dev\Docs\Architecture\configuration-three-tier.md
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.17 三处 + 版本表维护；V3.4.16 已被并行的风场性能优化占用，本任务顺延）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.17 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-smtp-user-tier-realign.md（本日志）

> 备注：无文件增删，文件树不变；未执行任何 git 操作，提交由用户决策。
